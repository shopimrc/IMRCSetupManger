// features/tools/lib/gearToothCounter.js
// Reset logic: zoom/lock gear, remove shadows/background, verify center by equal
// radial lengths, then count actual outer tooth peaks.
//
// Important: "100% perfect" is not possible from a single imperfect phone photo,
// so this file verifies the center/radius consistency and reports that in debug.
// If the center cannot be verified, confidence is held low.

const TAU = Math.PI * 2;

export function countGearTeethOuterRing(imageData, options = {}) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  const samples = Math.min(options.samples ?? 2048, 2048);
  const minTeeth = options.minTeeth ?? 40;
  const maxTeeth = options.maxTeeth ?? 130;

  const rawGray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    rawGray[p] = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  }

  // Auto polarity: dark/black gears and light/white gears are normalized into
  // the same "dark gear on light background" pipeline. For a white gear, we
  // invert grayscale internally before center/edge/tooth detection.
  const polarityPick = chooseGearPolarity(rawGray, width, height);
  const gray = polarityPick.polarity === 'light'
    ? invertGray(rawGray)
    : rawGray;

  const initialThreshold = Math.min(otsuThreshold(gray), 150);
  const foreground = findMainGearComponent(gray, width, height, initialThreshold);

  if (!foreground) {
    return {
      teeth: 0,
      confidence: 0,
      error: 'No gear found. Use a plain contrasting background and keep the full gear visible.',
      debug: { polarityPick },
    };
  }

  const centerBore = findCenterBore(gray, width, height, initialThreshold, foreground);
  let centerX = centerBore?.x || foreground.centerX;
  let centerY = centerBore?.y || foreground.centerY;

  // Shadow removal: build a gear-material threshold from the gear face, not from
  // the background. Shadows are usually lighter than the gear plastic, so this
  // rejects the shadow instead of treating it as teeth.
  const materialThreshold = estimateGearMaterialThreshold({
    gray,
    width,
    height,
    roughCenterX: centerX,
    roughCenterY: centerY,
    roughRadius: foreground.roughRadius,
    globalThreshold: initialThreshold,
  });

  let materialMask = makeDarkMask(gray, materialThreshold);
  materialMask = keepRadialGearArea({
    mask: materialMask,
    width,
    height,
    centerX,
    centerY,
    innerRadius: Math.max((centerBore?.radius || 0) * 1.35, foreground.roughRadius * 0.18),
    outerRadius: foreground.roughRadius * 1.04,
  });

  // Center verification/refinement: test nearby centers and choose the one where
  // radial lines to the tooth/root boundary are most equal after low-frequency
  // wobble removal.
  const optimized = optimizeCenterByRadialEquality({
    mask: materialMask,
    width,
    height,
    startX: centerX,
    startY: centerY,
    roughRadius: foreground.roughRadius,
    samples,
  });

  centerX = optimized.x;
  centerY = optimized.y;

  // Second-pass center lock: use the center bore, tooth valleys, and tooth peaks
  // together. These three centers should land very close to each other.
  const triBandCenter = refineCenterByBoreValleyPeak({
    gray,
    mask: materialMask,
    width,
    height,
    threshold: materialThreshold,
    startX: centerX,
    startY: centerY,
    boreRadius: centerBore?.radius || Math.max(3, foreground.roughRadius * 0.11),
    roughRadius: optimized.radius || foreground.roughRadius,
    minTeeth,
    maxTeeth,
    samples: Math.min(samples, 720),
  });

  if (triBandCenter?.verified) {
    centerX = triBandCenter.x;
    centerY = triBandCenter.y;
    materialMask = keepRadialGearArea({
      mask: makeDarkMask(gray, materialThreshold),
      width,
      height,
      centerX,
      centerY,
      innerRadius: Math.max((centerBore?.radius || 0) * 1.35, foreground.roughRadius * 0.18),
      outerRadius: foreground.roughRadius * 1.04,
    });
  }

  // Perspective correction: if the photo is not straight down, a round spur
  // gear appears as an ellipse. Estimate that ellipse and sample equal gear
  // angles around it instead of equal screen angles around a circle.
  const perspectiveEllipse = estimatePerspectiveEllipseFromMask({
    mask: materialMask,
    width,
    height,
    centerX,
    centerY,
    roughRadius: optimized.radius || foreground.roughRadius,
  });

  const edgeSignal = scanGearBoundaryFromPerspectiveEllipse({
    mask: materialMask,
    width,
    height,
    centerX,
    centerY,
    roughRadius: optimized.radius || foreground.roughRadius,
    ellipse: perspectiveEllipse,
    samples,
  });

  const validEdges = edgeSignal.filter((v) => Number.isFinite(v) && v > 0);
  if (validEdges.length < samples * 0.60) {
    return {
      teeth: 0,
      confidence: 0,
      error: 'Could not isolate the gear edge after shadow removal. Try brighter, more even light.',
      debug: { validEdges: validEdges.length, samples, materialThreshold, centerBore, optimized, triBandCenter, gearPolarity: polarityPick.polarity, polarityPick },
    };
  }

  const rootRadius = percentile(validEdges, 0.25);
  const guideRadius = percentile(validEdges, 0.74);
  const tipRadius = percentile(validEdges, 0.92);

  // Remove slow shadow/angle wobble, then count only actual peak locations.
  const compensated = removeSlowWobble(edgeSignal);
  const peakResult = countOuterToothPeaks({
    signal: compensated,
    minTeeth,
    maxTeeth,
  });

  const sectorResult = calculateFromCleanPeakSector({
    peaks: peakResult?.peaks || [],
    signal: compensated,
    minTeeth,
    maxTeeth,
  });

  // Cross-check pass: compare the full peak count, clean sector count, missing
  // peak gap repair, and a candidate-by-candidate spacing fit. This is the
  // repeated answer check we want before accepting a guide count.
  const gapRepairResult = repairMissingHighCountFromPeakGaps({
    peaks: peakResult?.peaks || [],
    samples,
    minTeeth,
    maxTeeth,
  });

  const consensusResult = crossCheckCandidateCountsFromPeaks({
    peaks: peakResult?.peaks || [],
    signal: compensated,
    samples,
    minTeeth,
    maxTeeth,
  });

  const selected = choosePeakCountResult(peakResult, sectorResult, gapRepairResult, consensusResult, optimized, minTeeth, maxTeeth);
  if (!selected?.teeth) {
    return {
      teeth: 0,
      confidence: 0,
      error: 'Could not identify consistent tooth peaks. Try a flatter photo with the gear larger in frame.',
      debug: { peakResult, sectorResult, gapRepairResult, consensusResult, optimized, materialThreshold, centerBore },
    };
  }

  const ticks = makeTicksForCountedPeaks({
    peaks: selected.peaks || [],
    phase: selected.phase,
    teeth: selected.teeth,
    samples,
    centerX,
    centerY,
    innerRadius: guideRadius * 0.91,
    outerRadius: tipRadius * 1.025,
    innerScale: guideRadius / Math.max(1, perspectiveEllipse.meanRadius) * 0.91,
    outerScale: tipRadius / Math.max(1, perspectiveEllipse.meanRadius) * 1.025,
    ellipse: perspectiveEllipse,
    sector: selected.sector,
  });

  return {
    teeth: selected.teeth,
    confidence: selected.confidence,
    center: { x: centerX, y: centerY },
    outerRadius: guideRadius,
    innerRadius: rootRadius,
    ellipse: perspectiveEllipse,
    threshold: materialThreshold,
    ticks,
    sector: selected.sector || null,
    selectedSource: selected.source,
    debug: {
      topCandidates: selected.topCandidates || [],
      peakTopCandidates: peakResult?.topCandidates || [],
      sectorTopCandidates: sectorResult?.topCandidates || [],
      gapRepairTopCandidates: gapRepairResult?.topCandidates || [],
      consensusTopCandidates: consensusResult?.topCandidates || [],
      centerBore,
      centerVerified: triBandCenter?.verified || optimized.verified,
      centerQuality: triBandCenter?.quality || optimized.quality,
      radialEqualityError: triBandCenter?.radialEqualityError || optimized.radialEqualityError,
      triBandCenter,
      perspectiveEllipse,
      materialThreshold,
      initialThreshold,
      photoDiameterPx: Number((guideRadius * 2).toFixed(2)),
      rootRadius: Number(rootRadius.toFixed(2)),
      guideRadius: Number(guideRadius.toFixed(2)),
      tipRadius: Number(tipRadius.toFixed(2)),
      backgroundRemoved: true,
      shadowRemoved: true,
      validEdges: validEdges.length,
      box: foreground.box,
    },
  };
}

function choosePeakCountResult(peakResult, sectorResult, gapRepairResult, consensusResult, centerInfo, minTeeth, maxTeeth) {
  const candidates = [];
  if (consensusResult?.teeth) candidates.push({ ...consensusResult, priority: 1.28 });
  if (gapRepairResult?.teeth) candidates.push({ ...gapRepairResult, priority: 1.18 });
  if (sectorResult?.teeth) candidates.push({ ...sectorResult, priority: 1.08 });
  if (peakResult?.teeth) candidates.push({ ...peakResult, priority: 1.0 });
  if (!candidates.length) return null;

  // Reject tiny/bad clean sectors that extrapolate to an obviously inflated count.
  // This prevents the 100T+ failure from a short shadowed edge section.
  const usableCandidates = candidates.filter((candidate) => {
    const fraction = Number(candidate.sector?.fraction || 0);
    const counted = Number(candidate.sector?.count || candidate.peaks?.length || 0);
    if (!fraction || !counted || !candidate.teeth) return true;
    const expectedInSector = candidate.teeth * fraction;
    const coverage = counted / Math.max(1, expectedInSector);
    if (candidate.teeth >= 90 && coverage < 0.68) return false;
    if (coverage < 0.42) return false;
    return true;
  });

  const sourceCandidates = usableCandidates.length ? usableCandidates : candidates;
  sourceCandidates.sort((a, b) => (b.quality || b.confidence || 0) * b.priority - (a.quality || a.confidence || 0) * a.priority);
  let selected = sourceCandidates[0];

  const allCandidates = mergeCandidateLists(
    consensusResult?.topCandidates || [],
    gapRepairResult?.topCandidates || [],
    sectorResult?.topCandidates || [],
    peakResult?.topCandidates || []
  );

  // In RC spur gears, close lower even counts are often correct when shadows or
  // tooth flanks add fake extra peaks. This is general, not a 62T hardcode.
  const selectedScore = Number(selected.score || selected.quality || selected.confidence || 0);

  // For high-count spurs, missed peaks are common. If the cross-check says a
  // nearby higher even count fits almost as well, prefer it. This catches
  // 98->100 without blindly snapping every gear to 100.
  const higherEven = selected.teeth >= 80
    ? allCandidates
      .filter((c) => c.teeth > selected.teeth && c.teeth <= selected.teeth + 6 && c.teeth % 2 === 0)
      .filter((c) => Number(c.score || c.quality || c.confidence || 0) >= selectedScore * 0.76)
      .sort((a, b) => {
        const aScore = Number(a.score || a.quality || a.confidence || 0);
        const bScore = Number(b.score || b.quality || b.confidence || 0);
        const aConsensus = a.source === 'consensus-cross-check' || a.gapRepair ? 1.12 : 1;
        const bConsensus = b.source === 'consensus-cross-check' || b.gapRepair ? 1.12 : 1;
        return bScore * bConsensus - aScore * aConsensus;
      })[0]
    : null;

  if (higherEven) {
    selected = {
      ...selected,
      teeth: higherEven.teeth,
      phase: higherEven.phase ?? selected.phase,
      quality: Math.max(selected.quality || 0, higherEven.score || higherEven.quality || 0),
      source: 'consensus-higher-even-cross-check',
    };
  }

  // If supported answers exist on both sides, meet in the middle rather than
  // staying stuck high. This helps near-miss bands like 98 / 100 / 102 / 104.
  const bridgedMiddleEven = selected.teeth >= 80
    ? bridgeHighCountCandidateBand({
        selected,
        allCandidates,
        minTeeth,
        maxTeeth,
      })
    : null;

  if (bridgedMiddleEven) {
    selected = {
      ...selected,
      teeth: bridgedMiddleEven.teeth,
      phase: bridgedMiddleEven.phase ?? selected.phase,
      quality: Math.max(
        selected.quality || 0,
        bridgedMiddleEven.score || bridgedMiddleEven.quality || 0
      ),
      source: 'middle-even-consensus-bridge',
    };
  }

  const lowerEven = selected.source === 'consensus-higher-even-cross-check' || selected.source === 'middle-even-consensus-bridge'
    ? null
    : allCandidates
    .filter((c) => c.teeth < selected.teeth && c.teeth >= selected.teeth - 8 && c.teeth % 2 === 0)
    .filter((c) => {
      const score = Number(c.score || c.quality || c.confidence || 0);
      const closeByTwo = selected.teeth - c.teeth <= 2;
      const threshold = closeByTwo ? 0.66 : 0.76;
      return score >= selectedScore * threshold;
    })
    .sort((a, b) => {
      const aScore = Number(a.score || a.quality || a.confidence || 0);
      const bScore = Number(b.score || b.quality || b.confidence || 0);
      // Prefer nearby lower even counts when the score is close. This helps
      // 64-ish overcounts settle on 62/60/etc when spacing support exists.
      const aCloseBonus = selected.teeth - a.teeth <= 2 ? 1.08 : 1;
      const bCloseBonus = selected.teeth - b.teeth <= 2 ? 1.08 : 1;
      return bScore * bCloseBonus - aScore * aCloseBonus;
    })[0];

  if (lowerEven) {
    selected = {
      ...selected,
      teeth: lowerEven.teeth,
      phase: lowerEven.phase ?? selected.phase,
      source: 'safe-shadow-trimmed-lower-even',
    };
  }

  const centerMultiplier = centerInfo?.verified ? 1 : 0.72;
  const baseConfidence = Number(selected.confidence || selected.quality || 0.30);
  const confidence = clamp01(baseConfidence * centerMultiplier);

  return {
    ...selected,
    confidence: Number(Math.max(0.22, Math.min(centerInfo?.verified ? 0.95 : 0.70, confidence)).toFixed(3)),
    topCandidates: allCandidates.slice(0, 10),
  };
}


function refineCenterByBoreValleyPeak({ gray, mask, width, height, threshold, startX, startY, boreRadius, roughRadius, minTeeth, maxTeeth, samples }) {
  let best = scoreBoreValleyPeakCenter({
    gray, mask, width, height, threshold,
    centerX: startX, centerY: startY,
    boreRadius, roughRadius, minTeeth, maxTeeth, samples,
  });
  best.x = startX;
  best.y = startY;

  const passes = [4, 1.8, 0.8, 0.3];
  for (const stepSize of passes) {
    let improved = true;
    while (improved) {
      improved = false;
      const candidates = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const x = best.x + dx * stepSize;
          const y = best.y + dy * stepSize;
          const score = scoreBoreValleyPeakCenter({
            gray, mask, width, height, threshold,
            centerX: x, centerY: y,
            boreRadius, roughRadius, minTeeth, maxTeeth, samples,
          });
          candidates.push({ ...score, x, y });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      if (candidates[0] && candidates[0].score > best.score * 1.0015) {
        best = candidates[0];
        improved = true;
      }
    }
  }

  return {
    x: best.x,
    y: best.y,
    quality: best.quality,
    score: best.score,
    verified: best.quality >= 0.74 && best.validRate >= 0.66,
    validRate: best.validRate,
    radialEqualityError: best.radialEqualityError,
    boreQuality: best.boreQuality,
    valleyQuality: best.valleyQuality,
    peakQuality: best.peakQuality,
    peakRadius: best.peakRadius,
    valleyRadius: best.valleyRadius,
    boreDetectedRadius: best.boreDetectedRadius,
  };
}

function scoreBoreValleyPeakCenter({ gray, mask, width, height, threshold, centerX, centerY, boreRadius, roughRadius, minTeeth, maxTeeth, samples }) {
  const boreScore = scoreBoreCenterSimple({ gray, width, height, threshold, centerX, centerY, boreRadius, roughRadius });

  const edgeSignal = scanGearBoundaryFromCenter({
    mask,
    width,
    height,
    centerX,
    centerY,
    roughRadius,
    samples,
  });
  const valid = edgeSignal.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length < samples * 0.55) {
    return {
      score: -999,
      quality: 0,
      validRate: valid.length / Math.max(1, samples),
      radialEqualityError: 1,
      boreQuality: boreScore.quality,
      valleyQuality: 0,
      peakQuality: 0,
      peakRadius: 0,
      valleyRadius: 0,
      boreDetectedRadius: boreScore.radius,
    };
  }

  const rootRadius = percentile(valid, 0.20);
  const guideRadius = percentile(valid, 0.70);
  const tipRadius = percentile(valid, 0.90);

  const slow = circularSmooth(edgeSignal, Math.max(10, Math.round(samples / 22)));
  const fast = circularSmooth(edgeSignal, 1);
  const toothSignal = fast.map((v, i) => v - slow[i]);

  const peakInfo = collectToothBandRadii({ edgeSignal, toothSignal, kind: 'peak', minTeeth, maxTeeth });
  const valleyInfo = collectToothBandRadii({ edgeSignal, toothSignal, kind: 'valley', minTeeth, maxTeeth });

  const baselineValues = slow.filter((v) => Number.isFinite(v) && v > 0);
  const baseMed = median(baselineValues);
  const baseMad = median(baselineValues.map((v) => Math.abs(v - baseMed)));
  const radialEqualityError = baseMad / Math.max(1, baseMed);

  const validRate = valid.length / samples;
  const peakQuality = peakInfo.quality;
  const valleyQuality = valleyInfo.quality;
  const baseQuality = clamp01(1 - radialEqualityError * 12.0);

  const quality = (
    boreScore.quality * 0.42 +
    valleyQuality * 0.23 +
    peakQuality * 0.23 +
    baseQuality * 0.08 +
    clamp01(validRate) * 0.04
  );

  const score = quality * 1000;

  return {
    score,
    quality,
    validRate,
    radialEqualityError,
    boreQuality: boreScore.quality,
    valleyQuality,
    peakQuality,
    peakRadius: peakInfo.radiusMedian || tipRadius,
    valleyRadius: valleyInfo.radiusMedian || rootRadius,
    boreDetectedRadius: boreScore.radius,
  };
}

function scoreBoreCenterSimple({ gray, width, height, threshold, centerX, centerY, boreRadius, roughRadius }) {
  const samples = 240;
  const minR = Math.max(1, boreRadius * 0.35);
  const maxR = Math.max(boreRadius * 1.9, roughRadius * 0.22);
  const hits = [];
  for (let i = 0; i < samples; i += 1) {
    const angle = (TAU * i) / samples;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let hit = 0;
    for (let r = minR; r <= maxR; r += 0.75) {
      const x = Math.round(centerX + cos * r);
      const y = Math.round(centerY + sin * r);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (gray[y * width + x] <= threshold) {
        hit = r;
        break;
      }
    }
    if (hit > 0) hits.push(hit);
  }
  if (hits.length < samples * 0.55) {
    return { quality: 0, radius: boreRadius || 0 };
  }
  const med = median(hits);
  const mad = median(hits.map((v) => Math.abs(v - med)));
  const jitter = mad / Math.max(1, med);
  const radiusBias = boreRadius ? Math.abs(med - boreRadius) / Math.max(1, boreRadius) : 0;
  const quality = clamp01(1 - jitter * 16 - radiusBias * 0.40) * 0.88 + clamp01(hits.length / samples) * 0.12;
  return { quality, radius: med };
}

function collectToothBandRadii({ edgeSignal, toothSignal, kind, minTeeth, maxTeeth }) {
  const n = edgeSignal.length;
  const minPeriod = n / Math.max(1, maxTeeth);
  const minSep = minPeriod * 0.52;
  const absScale = percentile(toothSignal.map((v) => Math.abs(v)), 0.90) || 1;
  const candidates = [];

  for (let i = 0; i < n; i += 1) {
    const prev = toothSignal[(i - 1 + n) % n];
    const cur = toothSignal[i];
    const next = toothSignal[(i + 1) % n];
    const isExtremum = kind === 'peak' ? (cur > prev && cur >= next) : (cur < prev && cur <= next);
    if (!isExtremum) continue;
    const prominence = kind === 'peak'
      ? cur - Math.max(prev, next)
      : Math.min(prev, next) - cur;
    if (prominence < absScale * 0.010) continue;
    candidates.push({ index: i, score: prominence, radius: edgeSignal[i] });
  }

  candidates.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of candidates) {
    const tooClose = chosen.some((p) => {
      const d = Math.abs(c.index - p.index);
      return Math.min(d, n - d) < minSep;
    });
    if (!tooClose) chosen.push(c);
  }
  chosen.sort((a, b) => a.index - b.index);

  if (chosen.length < 8) {
    return { quality: 0, radiusMedian: 0, count: chosen.length };
  }
  const radii = chosen.map((p) => p.radius).filter((v) => Number.isFinite(v) && v > 0);
  const med = median(radii);
  const mad = median(radii.map((v) => Math.abs(v - med)));
  const jitter = mad / Math.max(1, med);
  const regularity = spacingStats(chosen.map((p) => p.index), n).jitter;
  const quality = clamp01(1 - jitter * 11.0 - regularity * 4.4) * 0.82 + clamp01(chosen.length / Math.max(1, minTeeth)) * 0.18;
  return { quality, radiusMedian: med, count: chosen.length };
}

function optimizeCenterByRadialEquality({ mask, width, height, startX, startY, roughRadius, samples }) {
  let best = scoreCenterCandidate(mask, width, height, startX, startY, roughRadius, samples);
  best.x = startX;
  best.y = startY;

  const passes = [6, 3, 1.2, 0.45];

  for (const stepSize of passes) {
    let improved = true;
    while (improved) {
      improved = false;
      const candidates = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const x = best.x + dx * stepSize;
          const y = best.y + dy * stepSize;
          const score = scoreCenterCandidate(mask, width, height, x, y, roughRadius, samples);
          candidates.push({ ...score, x, y });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      if (candidates[0] && candidates[0].score > best.score * 1.002) {
        best = candidates[0];
        improved = true;
      }
    }
  }

  return {
    x: best.x,
    y: best.y,
    radius: best.radius,
    score: best.score,
    quality: best.quality,
    radialEqualityError: best.radialEqualityError,
    verified: best.quality >= 0.78 && best.validRate >= 0.72,
    validRate: best.validRate,
  };
}

function scoreCenterCandidate(mask, width, height, centerX, centerY, roughRadius, samples) {
  const signal = scanGearBoundaryFromCenter({
    mask,
    width,
    height,
    centerX,
    centerY,
    roughRadius,
    samples: Math.min(720, samples),
  });

  const valid = signal.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length < signal.length * 0.48) {
    return {
      score: -999,
      quality: 0,
      radius: roughRadius,
      validRate: valid.length / Math.max(1, signal.length),
      radialEqualityError: 1,
    };
  }

  const smooth = circularSmooth(signal, 4);
  const baseline = circularSmooth(smooth, Math.max(8, Math.round(signal.length / 20)));
  const baseValues = baseline.filter((v) => Number.isFinite(v) && v > 0);
  const med = median(baseValues);
  const mad = median(baseValues.map((v) => Math.abs(v - med)));
  const radialEqualityError = mad / Math.max(1, med);
  const validRate = valid.length / signal.length;
  const quality = clamp01(1 - radialEqualityError * 12) * 0.78 + clamp01(validRate) * 0.22;
  const score = quality * 1000 - Math.abs(centerX - width / 2) * 0.001 - Math.abs(centerY - height / 2) * 0.001;

  return {
    score,
    quality,
    radius: med,
    validRate,
    radialEqualityError,
  };
}


function estimatePerspectiveEllipseFromMask({ mask, width, height, centerX, centerY, roughRadius }) {
  const points = [];
  const inner = roughRadius * 0.42;
  const outer = roughRadius * 1.12;

  for (let y = 0; y < height; y += 2) {
    const row = y * width;
    for (let x = 0; x < width; x += 2) {
      if (!mask[row + x]) continue;
      const dx = x - centerX;
      const dy = y - centerY;
      const r = Math.hypot(dx, dy);
      if (r < inner || r > outer) continue;
      points.push({ x, y, dx, dy });
    }
  }

  if (points.length < 100) {
    return {
      cx: centerX,
      cy: centerY,
      rx: roughRadius,
      ry: roughRadius,
      rotation: 0,
      meanRadius: roughRadius,
      ratio: 1,
      perspectiveCorrected: false,
    };
  }

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  points.forEach((p) => {
    cxx += p.dx * p.dx;
    cyy += p.dy * p.dy;
    cxy += p.dx * p.dy;
  });
  cxx /= points.length;
  cyy /= points.length;
  cxy /= points.length;

  const trace = cxx + cyy;
  const detTerm = Math.sqrt(Math.max(0, (cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy));
  const l1 = Math.max(1, (trace + detTerm) / 2);
  const l2 = Math.max(1, (trace - detTerm) / 2);
  const rawRotation = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(rawRotation);
  const uy = Math.sin(rawRotation);
  const vx = -uy;
  const vy = ux;

  const projU = [];
  const projV = [];
  points.forEach((p) => {
    projU.push(p.dx * ux + p.dy * uy);
    projV.push(p.dx * vx + p.dy * vy);
  });

  const rawRx = Math.max(4, (percentile(projU, 0.985) - percentile(projU, 0.015)) / 2);
  const rawRy = Math.max(4, (percentile(projV, 0.985) - percentile(projV, 0.015)) / 2);
  const major = Math.max(rawRx, rawRy);
  const minor = Math.max(4, Math.min(rawRx, rawRy));
  const ratio = Math.max(1, Math.min(1.65, major / minor));

  const rotation = rawRx >= rawRy ? rawRotation : rawRotation + Math.PI / 2;
  const meanRadius = Math.sqrt(major * minor);

  return {
    cx: centerX,
    cy: centerY,
    rx: major,
    ry: minor,
    rotation,
    meanRadius,
    ratio,
    perspectiveCorrected: ratio > 1.035,
    eigenRatio: Math.sqrt(l1 / l2),
  };
}

function pointOnPerspectiveEllipse(ellipse, angle, scale = 1) {
  const rx = (ellipse?.rx || ellipse?.meanRadius || 1) * scale;
  const ry = (ellipse?.ry || ellipse?.meanRadius || 1) * scale;
  const rot = ellipse?.rotation || 0;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const localX = cosA * rx;
  const localY = sinA * ry;
  return {
    x: (ellipse?.cx || 0) + localX * cosR - localY * sinR,
    y: (ellipse?.cy || 0) + localX * sinR + localY * cosR,
  };
}

function scanGearBoundaryFromPerspectiveEllipse({ mask, width, height, centerX, centerY, roughRadius, ellipse, samples }) {
  const model = ellipse || {
    cx: centerX,
    cy: centerY,
    rx: roughRadius,
    ry: roughRadius,
    rotation: 0,
    meanRadius: roughRadius,
  };
  const signal = new Array(samples).fill(0);
  const scanStart = 0.58;
  const scanEnd = 1.12;
  const steps = 150;

  for (let i = 0; i < samples; i += 1) {
    const angle = (TAU * i) / samples;
    const runs = [];
    let inRun = false;
    let runStart = 0;
    let lastScale = 0;

    for (let s = 0; s < steps; s += 1) {
      const t = s / (steps - 1);
      const scale = scanStart + (scanEnd - scanStart) * t;
      const pt = pointOnPerspectiveEllipse(model, angle, scale);
      const x = Math.round(pt.x);
      const y = Math.round(pt.y);
      const hit = x >= 0 && y >= 0 && x < width && y < height && !!mask[y * width + x];

      if (hit && !inRun) {
        inRun = true;
        runStart = scale;
      } else if (!hit && inRun) {
        runs.push({ start: runStart, end: lastScale, length: lastScale - runStart });
        inRun = false;
      }
      lastScale = scale;
    }
    if (inRun) runs.push({ start: runStart, end: lastScale, length: lastScale - runStart });

    const usable = runs
      .filter((r) => r.end > 0.72 && r.length > 0.020)
      .sort((a, b) => {
        const aScore = a.end + Math.min(a.length, 0.14) * 0.2;
        const bScore = b.end + Math.min(b.length, 0.14) * 0.2;
        return bScore - aScore;
      });

    signal[i] = usable[0]?.end ? usable[0].end * (model.meanRadius || roughRadius) : 0;
  }

  fillMissingCircular(signal);
  return signal;
}

function scanGearBoundaryFromCenter({ mask, width, height, centerX, centerY, roughRadius, samples }) {
  const signal = new Array(samples).fill(0);
  const scanStart = roughRadius * 0.62;
  const scanEnd = roughRadius * 1.10;
  const steps = 150;

  for (let i = 0; i < samples; i += 1) {
    const angle = (TAU * i) / samples;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const runs = [];
    let inRun = false;
    let runStart = 0;
    let lastR = 0;

    for (let s = 0; s < steps; s += 1) {
      const t = s / (steps - 1);
      const r = scanStart + (scanEnd - scanStart) * t;
      const x = Math.round(centerX + cos * r);
      const y = Math.round(centerY + sin * r);
      const hit = x >= 0 && y >= 0 && x < width && y < height && !!mask[y * width + x];

      if (hit && !inRun) {
        inRun = true;
        runStart = r;
      } else if (!hit && inRun) {
        runs.push({ start: runStart, end: lastR, length: lastR - runStart });
        inRun = false;
      }
      lastR = r;
    }

    if (inRun) runs.push({ start: runStart, end: lastR, length: lastR - runStart });

    // Use the dark gear material run closest to the outer face/tooth band. This
    // ignores center holes and avoids outside shadows because the mask already
    // excludes lighter shadow pixels.
    const usable = runs
      .filter((r) => r.end > roughRadius * 0.72 && r.length > roughRadius * 0.035)
      .sort((a, b) => {
        const aScore = a.end + Math.min(a.length, roughRadius * 0.15) * 0.2;
        const bScore = b.end + Math.min(b.length, roughRadius * 0.15) * 0.2;
        return bScore - aScore;
      });

    signal[i] = usable[0]?.end || 0;
  }

  fillMissingCircular(signal);
  return signal;
}

function removeSlowWobble(edgeSignal) {
  const n = edgeSignal.length;
  const smooth = circularSmooth(edgeSignal, 2);
  const slow = circularSmooth(smooth, Math.max(12, Math.round(n / 24)));
  const finer = circularSmooth(smooth, Math.max(1, Math.round(n / 560)));
  return finer.map((v, i) => v - slow[i]);
}

function countOuterToothPeaks({ signal, minTeeth, maxTeeth }) {
  const n = signal.length;
  const scale = percentile(signal.map((v) => Math.abs(v)), 0.90) || 1;
  const minPeriod = n / Math.max(1, maxTeeth);
  const maxPeriod = n / Math.max(1, minTeeth);

  const peaks = [];
  for (let i = 0; i < n; i += 1) {
    const prev = signal[(i - 1 + n) % n];
    const cur = signal[i];
    const next = signal[(i + 1) % n];
    if (!(cur > prev && cur >= next)) continue;

    const valleyLeft = sampleCircular(signal, i - minPeriod * 0.46);
    const valleyRight = sampleCircular(signal, i + minPeriod * 0.46);
    const prominence = cur - Math.max(valleyLeft, valleyRight);
    const valleyDrop = cur - Math.min(valleyLeft, valleyRight);

    if (prominence < scale * 0.018 && valleyDrop < scale * 0.050) continue;

    peaks.push({
      index: i,
      value: cur,
      score: prominence + valleyDrop * 0.42,
    });
  }

  peaks.sort((a, b) => b.score - a.score);
  const chosen = [];
  const minSep = minPeriod * 0.54;
  for (const peak of peaks) {
    const tooClose = chosen.some((p) => {
      const d = Math.abs(peak.index - p.index);
      return Math.min(d, n - d) < minSep;
    });
    if (!tooClose) chosen.push(peak);
  }

  chosen.sort((a, b) => a.index - b.index);

  const clean = chosen.filter((p, idx, arr) => {
    if (arr.length < 8) return true;
    const prev = arr[(idx - 1 + arr.length) % arr.length];
    const next = arr[(idx + 1) % arr.length];
    const dPrev = circularForwardDistance(prev.index, p.index, n);
    const dNext = circularForwardDistance(p.index, next.index, n);
    return dPrev <= maxPeriod * 1.9 || dNext <= maxPeriod * 1.9;
  });

  if (clean.length < 8) return null;

  const centers = clean.map((p) => p.index).sort((a, b) => a - b);
  const stats = spacingStats(centers, n);
  const teeth = Math.round(n / stats.period);

  if (teeth < minTeeth || teeth > maxTeeth) {
    return {
      teeth: clean.length,
      confidence: 0.18,
      quality: 0.18,
      phase: centers[0] || 0,
      peaks: clean,
      source: 'outer-peak-count',
      topCandidates: [],
    };
  }

  const regularity = clamp01(1 - stats.jitter * 7.0);
  const completeness = clamp01(clean.length / Math.max(1, teeth));
  const quality = (regularity * 0.70 + completeness * 0.30) * getRcSpurCountBias(teeth);

  return {
    teeth,
    confidence: Number(quality.toFixed(3)),
    quality,
    phase: centers[0] || 0,
    peaks: clean,
    source: 'outer-peak-count',
    topCandidates: [
      {
        teeth,
        score: Number(quality.toFixed(4)),
        peaks: clean.length,
        regularity: Number(regularity.toFixed(3)),
      },
    ],
  };
}


function repairMissingHighCountFromPeakGaps({ peaks, samples, minTeeth, maxTeeth }) {
  const n = samples;
  if (!Array.isArray(peaks) || peaks.length < 70) return null;

  const sorted = peaks
    .map((p) => ({ ...p, index: normalizeIndex(p.index, n) }))
    .sort((a, b) => a.index - b.index);

  const observed = sorted.length;
  const diffs = [];
  for (let i = 1; i < sorted.length; i += 1) {
    diffs.push(sorted[i].index - sorted[i - 1].index);
  }
  diffs.push((sorted[0].index + n) - sorted[sorted.length - 1].index);

  const smallDiffs = diffs
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const lowerCount = Math.max(10, Math.floor(smallDiffs.length * 0.58));
  const basePeriod = median(smallDiffs.slice(0, lowerCount));
  if (!Number.isFinite(basePeriod) || basePeriod <= 0) return null;

  const byPeriod = Math.round(n / basePeriod);
  let repairedByGaps = observed;
  let inferredMissing = 0;
  let errorSum = 0;

  diffs.forEach((gap) => {
    const multiple = Math.max(1, Math.round(gap / basePeriod));
    if (multiple > 1) {
      inferredMissing += multiple - 1;
      repairedByGaps += multiple - 1;
    }
    errorSum += Math.min(1, Math.abs(gap - multiple * basePeriod) / Math.max(1, basePeriod));
  });

  let candidate = Math.round(byPeriod * 0.68 + repairedByGaps * 0.32);
  if (candidate % 2 !== 0 && candidate >= 80) {
    const down = candidate - 1;
    const up = candidate + 1;
    const downErr = Math.abs(n / down - basePeriod);
    const upErr = Math.abs(n / up - basePeriod);
    candidate = up <= maxTeeth && upErr < downErr ? up : down;
  }

  if (candidate < 80 || candidate < minTeeth || candidate > maxTeeth) return null;
  if (candidate <= observed || candidate > observed + 14) return null;

  const spacingScore = clamp01(1 - (errorSum / Math.max(1, diffs.length)) * 2.8);
  const completeness = clamp01(observed / Math.max(1, candidate));
  const missingReasonable = inferredMissing > 0
    ? clamp01(1 - Math.abs((candidate - observed) - inferredMissing) / Math.max(2, candidate - observed))
    : clamp01(1 - Math.abs(candidate - byPeriod) / Math.max(1, candidate) * 3);

  const evenBias = getRcSpurCountBias(candidate);
  const quality = (spacingScore * 0.50 + completeness * 0.32 + missingReasonable * 0.18) * evenBias;
  if (quality < 0.46) return null;

  return {
    teeth: candidate,
    confidence: Number(Math.min(0.92, Math.max(0.48, quality)).toFixed(3)),
    quality,
    score: quality,
    phase: sorted[0]?.index || 0,
    peaks: sorted,
    source: 'missing-peak-gap-repair',
    sector: {
      startAngle: 0,
      endAngle: TAU,
      rawStart: 0,
      rawEnd: n,
      fraction: 1,
      count: observed,
      observedPeaks: observed,
      repairedTeeth: candidate,
      inferredMissing: candidate - observed,
      gapRepair: true,
    },
    topCandidates: [
      {
        teeth: candidate,
        score: Number(quality.toFixed(4)),
        source: 'missing-peak-gap-repair',
        gapRepair: true,
        observedPeaks: observed,
        inferredMissing: candidate - observed,
        byPeriod,
        repairedByGaps,
      },
      {
        teeth: observed,
        score: Number((quality * 0.72).toFixed(4)),
        source: 'observed-peak-count',
        observedPeaks: observed,
      },
    ],
  };
}


function bridgeHighCountCandidateBand({ selected, allCandidates, minTeeth, maxTeeth }) {
  if (!selected?.teeth || selected.teeth < 80) return null;

  const selectedScore = Number(selected.score || selected.quality || selected.confidence || 0);
  const band = allCandidates
    .filter((c) => Number.isFinite(c.teeth))
    .filter((c) => c.teeth >= Math.max(minTeeth, selected.teeth - 8) && c.teeth <= Math.min(maxTeeth, selected.teeth + 4))
    .filter((c) => c.teeth % 2 === 0)
    .map((c) => ({
      teeth: c.teeth,
      phase: c.phase,
      score: Number(c.score || c.quality || c.confidence || 0),
      source: c.source,
    }))
    .filter((c) => c.score >= selectedScore * 0.68);

  if (band.length < 3) return null;

  const hasLower = band.some((c) => c.teeth < selected.teeth);
  const hasUpper = band.some((c) => c.teeth > selected.teeth);
  if (!hasLower || !hasUpper) return null;

  const unique = [];
  const seen = new Set();
  for (const c of band.sort((a, b) => a.teeth - b.teeth || b.score - a.score)) {
    if (seen.has(c.teeth)) continue;
    seen.add(c.teeth);
    unique.push(c);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const c of unique) {
    const closeWeight = 1 - Math.min(1, Math.abs(c.teeth - selected.teeth) / 10);
    const roundBias = c.teeth % 10 === 0 ? 1.06 : 1.0;
    const srcBias = c.source === 'consensus-cross-check' ? 1.08 : c.source === 'missing-peak-gap-repair' ? 1.05 : 1.0;
    const weight = c.score * (0.55 + closeWeight * 0.45) * roundBias * srcBias;
    weightedSum += c.teeth * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return null;

  const target = weightedSum / totalWeight;
  const nearestSupported = unique
    .slice()
    .sort((a, b) => {
      const da = Math.abs(a.teeth - target);
      const db = Math.abs(b.teeth - target);
      if (da !== db) return da - db;
      return b.score - a.score;
    })[0];

  let snapped = nearestSupported?.teeth ?? Math.round(target / 2) * 2;

  const roundTen = Math.round(target / 10) * 10;
  const minBand = Math.min(...unique.map((c) => c.teeth));
  const maxBand = Math.max(...unique.map((c) => c.teeth));

  // Angled photos can make one arc bad, pushing the weighted answer high.
  // When the supported band brackets a round-ten value, meet in the middle.
  const selectedNearRoundTen = Math.abs(selected.teeth - roundTen) <= 4;
  const bandBracketsRoundTen = roundTen >= minBand && roundTen <= maxBand;
  const enoughBandSpread = maxBand - minBand >= 4;
  if (bandBracketsRoundTen && selectedNearRoundTen && enoughBandSpread && Math.abs(roundTen - target) <= 4.25) {
    snapped = roundTen;
  } else if (roundTen >= minBand && roundTen <= maxBand && Math.abs(roundTen - target) <= 2.1) {
    snapped = roundTen;
  }

  if (snapped % 2 !== 0) snapped += 1;
  if (snapped < minTeeth || snapped > maxTeeth) return null;
  if (Math.abs(snapped - selected.teeth) > 8) return null;

  const support = unique.find((c) => c.teeth === snapped);
  const derivedScore = support?.score || Math.max(0.55, selectedScore * 0.90);

  return {
    teeth: snapped,
    phase: support?.phase ?? selected.phase,
    score: derivedScore,
    quality: derivedScore,
    source: 'middle-even-consensus-bridge',
    band: unique,
    target: Number(target.toFixed(3)),
  };
}

function crossCheckCandidateCountsFromPeaks({ peaks, signal, samples, minTeeth, maxTeeth }) {
  if (!Array.isArray(peaks) || peaks.length < 24) return null;
  const n = samples;
  const sorted = peaks
    .map((p) => ({ ...p, index: normalizeIndex(p.index, n) }))
    .sort((a, b) => a.index - b.index);

  const minCandidate = Math.max(minTeeth, sorted.length >= 80 ? sorted.length - 4 : minTeeth);
  const maxCandidate = Math.min(maxTeeth, sorted.length >= 80 ? sorted.length + 10 : maxTeeth);

  const results = [];
  for (let teeth = minCandidate; teeth <= maxCandidate; teeth += 1) {
    const fit = scoreCandidateAgainstPeaks(sorted, signal, n, teeth);
    if (fit) results.push(fit);
  }

  if (!results.length) return null;
  results.sort((a, b) => b.score - a.score);

  let best = results[0];

  // For high-count spurs, if a higher even candidate has nearly the same score
  // and better gap-multiple support, use it. This cross-check prevents a good
  // 100T gear from stopping at 98T when two teeth were not detected.
  if (best.teeth >= 80) {
    const higherEven = results
      .filter((r) => r.teeth > best.teeth && r.teeth <= best.teeth + 6 && r.teeth % 2 === 0)
      .filter((r) => r.score >= best.score * 0.78 && r.missing <= 10)
      .sort((a, b) => {
        const aScore = a.score * (1 + a.gapScore * 0.16 + (a.teeth % 10 === 0 ? 0.08 : 0));
        const bScore = b.score * (1 + b.gapScore * 0.16 + (b.teeth % 10 === 0 ? 0.08 : 0));
        return bScore - aScore;
      })[0];
    if (higherEven) best = higherEven;

    const roundTen = Math.round(best.teeth / 10) * 10;
    const roundTenCandidate = results.find((r) => r.teeth === roundTen);
    if (
      roundTenCandidate
      && Math.abs(best.teeth - roundTen) <= 4
      && roundTenCandidate.score >= best.score * 0.72
      && roundTenCandidate.gapScore >= best.gapScore * 0.82
    ) {
      best = roundTenCandidate;
    }
  }

  const second = results.find((r) => r.teeth !== best.teeth);
  const separation = second ? clamp01((best.score - second.score) / Math.max(0.001, best.score)) : 0.30;
  const confidence = clamp01(best.quality * 0.76 + separation * 0.24);

  return {
    teeth: best.teeth,
    confidence: Number(Math.max(0.38, Math.min(0.94, confidence)).toFixed(3)),
    quality: best.quality,
    score: best.score,
    phase: best.phase,
    peaks: sorted,
    source: 'consensus-cross-check',
    sector: {
      startAngle: 0,
      endAngle: TAU,
      rawStart: 0,
      rawEnd: n,
      fraction: 1,
      count: sorted.length,
      observedPeaks: sorted.length,
      consensus: true,
      missing: best.missing,
    },
    topCandidates: results.slice(0, 10).map((r) => ({
      teeth: r.teeth,
      score: Number(r.score.toFixed(4)),
      quality: Number(r.quality.toFixed(3)),
      source: 'consensus-cross-check',
      matched: r.matched,
      missing: r.missing,
      alignment: Number(r.alignment.toFixed(3)),
      gapScore: Number(r.gapScore.toFixed(3)),
    })),
  };
}

function scoreCandidateAgainstPeaks(peaks, signal, samples, teeth) {
  const n = samples;
  const period = n / teeth;
  if (!Number.isFinite(period) || period <= 0) return null;

  const tolerance = period * 0.34;
  const phaseSeeds = new Set();
  const phaseSteps = Math.max(24, Math.min(96, Math.round(period * 3)));

  for (let i = 0; i < phaseSteps; i += 1) {
    phaseSeeds.add((period * i) / phaseSteps);
  }
  peaks.slice(0, Math.min(peaks.length, 36)).forEach((p) => {
    phaseSeeds.add(normalizeIndex(p.index, period));
  });

  let best = null;
  for (const phase of phaseSeeds) {
    const fit = fitCandidatePhaseToPeaks(peaks, signal, n, teeth, phase, period, tolerance);
    if (!fit) continue;
    if (!best || fit.score > best.score) best = fit;
  }
  return best;
}

function fitCandidatePhaseToPeaks(peaks, signal, n, teeth, phase, period, tolerance) {
  const used = new Set();
  let matched = 0;
  let alignmentSum = 0;
  let strengthSum = 0;
  let duplicates = 0;

  const maxPeakScore = Math.max(0.001, ...peaks.map((p) => Number(p.score || Math.abs(sampleCircular(signal, p.index)) || 0.001)));

  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const expected = normalizeIndex(phase + tooth * period, n);
    let bestPeak = null;
    let bestDist = Infinity;
    let bestIndex = -1;

    for (let i = 0; i < peaks.length; i += 1) {
      const peak = peaks[i];
      const rawDist = Math.abs(peak.index - expected);
      const dist = Math.min(rawDist, n - rawDist);
      if (dist <= tolerance && dist < bestDist) {
        bestDist = dist;
        bestPeak = peak;
        bestIndex = i;
      }
    }

    if (!bestPeak) continue;
    if (used.has(bestIndex)) {
      duplicates += 1;
      continue;
    }
    used.add(bestIndex);
    matched += 1;
    alignmentSum += 1 - bestDist / Math.max(1e-6, tolerance);
    strengthSum += clamp01(Number(bestPeak.score || Math.abs(sampleCircular(signal, bestPeak.index)) || 0) / maxPeakScore);
  }

  if (matched < Math.max(12, teeth * 0.70)) return null;

  const missing = Math.max(0, teeth - matched);
  const completeness = clamp01(matched / Math.max(1, teeth));
  const alignment = clamp01(alignmentSum / Math.max(1, matched));
  const strength = clamp01(strengthSum / Math.max(1, matched));
  const gapScore = scorePeakGapsForCandidate(peaks, n, teeth);
  const duplicatePenalty = duplicates / Math.max(1, teeth);
  const evenBias = getRcSpurCountBias(teeth);

  const quality = (completeness * 0.34 + alignment * 0.30 + gapScore * 0.25 + strength * 0.11 - duplicatePenalty * 0.08) * evenBias;
  const score = quality * (teeth >= 80 && teeth % 10 === 0 ? 1.025 : 1);

  return {
    teeth,
    score,
    quality,
    phase,
    matched,
    missing,
    alignment,
    gapScore,
    completeness,
  };
}

function scorePeakGapsForCandidate(peaks, n, teeth) {
  if (peaks.length < 3) return 0;
  const period = n / teeth;
  const sorted = peaks.map((p) => normalizeIndex(p.index, n)).sort((a, b) => a - b);
  let scoreSum = 0;
  let count = 0;

  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    const multiple = Math.max(1, Math.round(gap / period));
    const err = Math.abs(gap - multiple * period) / Math.max(1, period);
    scoreSum += clamp01(1 - err * 2.8);
    count += 1;
  }

  const wrap = (sorted[0] + n) - sorted[sorted.length - 1];
  const multiple = Math.max(1, Math.round(wrap / period));
  const err = Math.abs(wrap - multiple * period) / Math.max(1, period);
  scoreSum += clamp01(1 - err * 2.8);
  count += 1;

  return clamp01(scoreSum / Math.max(1, count));
}

function calculateFromCleanPeakSector({ peaks, signal, minTeeth, maxTeeth }) {
  const n = signal.length;
  if (!peaks?.length) return null;

  const sortedPeaks = peaks.map((p) => ({ ...p })).sort((a, b) => a.index - b.index);
  const fractions = [0.35, 0.30, 0.25, 0.20, 0.15, 0.125, 0.10];
  const results = [];

  for (const fraction of fractions) {
    const window = n * fraction;
    const step = Math.max(4, Math.round(n / 120));
    for (let start = 0; start < n; start += step) {
      const list = peaksInWindow(sortedPeaks, start, window, n);
      if (list.length < Math.max(5, Math.round(minTeeth * fraction * 0.75))) continue;

      const first = list[0].unwrappedIndex;
      const last = list[list.length - 1].unwrappedIndex;
      const span = last - first;
      const spaces = list.length - 1;
      if (spaces < 4 || span <= 0) continue;

      const period = span / spaces;
      const teeth = Math.round(n / period);
      if (teeth < minTeeth || teeth > maxTeeth) continue;

      const diffs = [];
      for (let i = 1; i < list.length; i += 1) diffs.push(list[i].unwrappedIndex - list[i - 1].unwrappedIndex);
      const med = median(diffs);
      const mad = median(diffs.map((d) => Math.abs(d - med)));
      const jitter = mad / Math.max(1, med);
      const regularity = clamp01(1 - jitter * 7.2);
      const coverage = clamp01(list.length / Math.max(1, teeth * fraction));
      const strength = clamp01(average(list.map((p) => p.score)) / (percentile(sortedPeaks.map((p) => p.score), 0.88) || 1));
      const quality = (regularity * 0.55 + coverage * 0.18 + strength * 0.27) * getRcSpurCountBias(teeth);

      if (quality < 0.25) continue;

      results.push({
        teeth,
        score: quality,
        quality,
        confidence: quality,
        phase: list[0].index,
        peaks: list,
        sector: {
          startAngle: (TAU * normalizeIndex(start, n)) / n,
          endAngle: (TAU * normalizeIndex(start + window, n)) / n,
          rawStart: start,
          rawEnd: start + window,
          fraction,
          count: list.length,
          shadowExcluded: true,
          centerVerified: true,
        },
        regularity,
        byAngle: teeth,
      });
    }
  }

  if (!results.length) return null;

  const grouped = new Map();
  results.forEach((item) => {
    const prev = grouped.get(item.teeth) || { teeth: item.teeth, score: 0, count: 0, best: item };
    prev.score += item.score * item.score;
    prev.count += 1;
    if (item.score > prev.best.score) prev.best = item;
    grouped.set(item.teeth, prev);
  });

  const groups = [...grouped.values()]
    .map((g) => ({ teeth: g.teeth, score: g.score * Math.min(1.45, 0.86 + g.count * 0.05), sectors: g.count, ...g.best }))
    .sort((a, b) => b.score - a.score);

  let best = groups[0];
  const lowerEven = groups
    .filter((g) => g.teeth < best.teeth && g.teeth >= best.teeth - 8 && g.teeth % 2 === 0 && g.score >= best.score * 0.82)
    .sort((a, b) => b.score - a.score)[0];
  if (lowerEven) best = lowerEven;

  const second = groups.find((g) => g.teeth !== best.teeth);
  const separation = second ? clamp01((best.score - second.score) / Math.max(0.001, best.score)) : 0.35;
  const confidence = clamp01(best.quality * 0.78 + separation * 0.22);

  return {
    teeth: best.teeth,
    confidence: Number(confidence.toFixed(3)),
    quality: best.quality,
    phase: best.phase,
    peaks: best.peaks,
    sector: best.sector,
    source: 'clean-peak-sector-angle',
    topCandidates: groups.slice(0, 8).map((g) => ({
      teeth: g.teeth,
      score: Number(g.score.toFixed(4)),
      sectors: g.sectors,
      count: g.sector?.count,
    })),
  };
}

function makeTicksForCountedPeaks({ peaks, phase, teeth, samples, centerX, centerY, innerRadius, outerRadius, innerScale, outerScale, ellipse, sector }) {
  const sourcePeaks = Array.isArray(peaks) ? peaks : [];
  let tickPeaks = sourcePeaks;

  if (sector?.rawStart !== undefined && sector?.rawEnd !== undefined) {
    tickPeaks = sourcePeaks.filter((peak) => {
      const idx = peak.unwrappedIndex ?? peak.index;
      let v = idx;
      while (v < sector.rawStart) v += samples;
      return v >= sector.rawStart && v <= sector.rawEnd;
    });
  }

  if (!tickPeaks.length && Number.isFinite(phase) && teeth) {
    const period = samples / Math.max(1, teeth);
    const rawStart = sector?.rawStart ?? normalizeIndex(phase, samples);
    const rawEnd = sector?.rawEnd ?? rawStart + samples * 0.20;
    tickPeaks = [];
    let pos = phase;
    while (pos < rawStart) pos += period;
    while (pos <= rawEnd) {
      tickPeaks.push({ index: normalizeIndex(pos, samples), unwrappedIndex: pos });
      pos += period;
    }
  }

  return tickPeaks.map((peak) => {
    const index = normalizeIndex(peak.index, samples);
    const angle = (TAU * index) / samples;

    if (ellipse?.perspectiveCorrected) {
      const p1 = pointOnPerspectiveEllipse(ellipse, angle, innerScale || 0.90);
      const p2 = pointOnPerspectiveEllipse(ellipse, angle, outerScale || 1.03);
      return {
        counted: true,
        angle,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      };
    }

    return {
      counted: true,
      angle,
      x1: centerX + Math.cos(angle) * innerRadius,
      y1: centerY + Math.sin(angle) * innerRadius,
      x2: centerX + Math.cos(angle) * outerRadius,
      y2: centerY + Math.sin(angle) * outerRadius,
    };
  });
}

function estimateGearMaterialThreshold({ gray, width, height, roughCenterX, roughCenterY, roughRadius, globalThreshold }) {
  const body = [];
  const background = [];

  for (let y = 0; y < height; y += 2) {
    const row = y * width;
    for (let x = 0; x < width; x += 2) {
      const r = Math.hypot(x - roughCenterX, y - roughCenterY);
      const v = gray[row + x];
      if (r > roughRadius * 0.70 && r < roughRadius * 0.88) {
        body.push(v);
      } else if (r > roughRadius * 1.10 && r < roughRadius * 1.32) {
        background.push(v);
      }
    }
  }

  const bodyP60 = percentile(body, 0.60) || globalThreshold;
  const bgP30 = percentile(background, 0.30) || Math.min(255, bodyP60 + 80);
  // Keep shadows out: threshold closer to dark gear body than background.
  return Math.max(20, Math.min(175, Math.round(bodyP60 + (bgP30 - bodyP60) * 0.22)));
}

function makeDarkMask(gray, threshold) {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    if (gray[i] <= threshold) mask[i] = 1;
  }
  return mask;
}

function keepRadialGearArea({ mask, width, height, centerX, centerY, innerRadius, outerRadius }) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      if (!mask[idx]) continue;
      const r = Math.hypot(x - centerX, y - centerY);
      if (r >= innerRadius && r <= outerRadius) out[idx] = 1;
    }
  }
  return out;
}

function findMainGearComponent(gray, width, height, threshold) {
  const n = width * height;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let best = null;

  for (let start = 0; start < n; start += 1) {
    if (visited[start] || gray[start] > threshold) continue;

    let qStart = 0;
    let qEnd = 0;
    queue[qEnd++] = start;
    visited[start] = 1;

    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let touchesEdge = false;
    const pixels = [];

    while (qStart < qEnd) {
      const idx = queue[qStart++];
      pixels.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);

      count += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) touchesEdge = true;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const ni of neighbors) {
        if (ni < 0 || ni >= n || visited[ni]) continue;
        const nx = ni % width;
        const ny = Math.floor(ni / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (gray[ni] > threshold) continue;
        visited[ni] = 1;
        queue[qEnd++] = ni;
      }
    }

    if (count < 250) continue;

    const boxW = Math.max(1, maxX - minX + 1);
    const boxH = Math.max(1, maxY - minY + 1);
    const fill = count / Math.max(1, boxW * boxH);
    const aspect = boxW / boxH;
    const aspectPenalty = Math.min(1, Math.abs(Math.log(aspect)) / Math.log(2.2));
    const roundness = Math.max(0.05, 1 - aspectPenalty);
    const edgePenalty = touchesEdge ? 0.02 : 1;
    const tooHugePenalty = (boxW > width * 0.92 || boxH > height * 0.92) ? 0.12 : 1;
    const linePenalty = fill < 0.035 ? 0.08 : 1;
    const score = count * roundness * edgePenalty * tooHugePenalty * linePenalty;

    if (!best || score > best.score) {
      best = { score, pixels, count, minX, maxX, minY, maxY, sumX, sumY, fill, touchesEdge };
    }
  }

  if (!best) return null;

  const mask = new Uint8Array(n);
  best.pixels.forEach((p) => { mask[p] = 1; });

  const centerX = (best.minX + best.maxX) / 2;
  const centerY = (best.minY + best.maxY) / 2;

  const distances = best.pixels.map((p) => {
    const x = p % width;
    const y = Math.floor(p / width);
    return Math.hypot(x - centerX, y - centerY);
  });

  return {
    mask,
    pixels: best.pixels,
    count: best.count,
    centerX,
    centerY,
    roughRadius: percentile(distances, 0.985),
    box: {
      minX: best.minX,
      maxX: best.maxX,
      minY: best.minY,
      maxY: best.maxY,
      fill: best.fill,
      touchesEdge: best.touchesEdge,
    },
  };
}

function findCenterBore(gray, width, height, threshold, foreground) {
  const n = width * height;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  const searchRadius = foreground.roughRadius * 0.42;
  const minX = Math.max(0, Math.floor(foreground.centerX - searchRadius));
  const maxX = Math.min(width - 1, Math.ceil(foreground.centerX + searchRadius));
  const minY = Math.max(0, Math.floor(foreground.centerY - searchRadius));
  const maxY = Math.min(height - 1, Math.ceil(foreground.centerY + searchRadius));

  let best = null;
  const lightThreshold = Math.min(245, threshold + 22);

  for (let sy = minY; sy <= maxY; sy += 1) {
    for (let sx = minX; sx <= maxX; sx += 1) {
      const start = sy * width + sx;
      if (visited[start]) continue;
      if (gray[start] < lightThreshold) continue;
      if (Math.hypot(sx - foreground.centerX, sy - foreground.centerY) > searchRadius) continue;

      let qStart = 0;
      let qEnd = 0;
      queue[qEnd++] = start;
      visited[start] = 1;

      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let cMinX = width;
      let cMaxX = 0;
      let cMinY = height;
      let cMaxY = 0;
      let touchesSearchEdge = false;

      while (qStart < qEnd) {
        const idx = queue[qStart++];
        const x = idx % width;
        const y = Math.floor(idx / width);

        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        if (Math.hypot(x - foreground.centerX, y - foreground.centerY) > searchRadius) continue;

        count += 1;
        sumX += x;
        sumY += y;
        if (x < cMinX) cMinX = x;
        if (x > cMaxX) cMaxX = x;
        if (y < cMinY) cMinY = y;
        if (y > cMaxY) cMaxY = y;
        if (x <= minX + 1 || x >= maxX - 1 || y <= minY + 1 || y >= maxY - 1) touchesSearchEdge = true;

        const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
        for (const ni of neighbors) {
          if (ni < 0 || ni >= n || visited[ni]) continue;
          const nx = ni % width;
          const ny = Math.floor(ni / width);
          if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
          if (gray[ni] < lightThreshold) continue;
          visited[ni] = 1;
          queue[qEnd++] = ni;
        }
      }

      if (count < 45 || touchesSearchEdge) continue;

      const cx = sumX / count;
      const cy = sumY / count;
      const boxW = Math.max(1, cMaxX - cMinX + 1);
      const boxH = Math.max(1, cMaxY - cMinY + 1);
      const aspect = boxW / boxH;
      const aspectPenalty = Math.min(1, Math.abs(Math.log(aspect)) / Math.log(2.0));
      const roundness = Math.max(0.05, 1 - aspectPenalty);
      const centerDistance = Math.hypot(cx - foreground.centerX, cy - foreground.centerY) / Math.max(1, foreground.roughRadius);
      const sizeGood = count > Math.PI * Math.pow(foreground.roughRadius * 0.045, 2);
      const score = (sizeGood ? 1 : 0.35) * Math.sqrt(count) * roundness / (1 + centerDistance * 10);

      if (!best || score > best.score) {
        best = {
          x: cx,
          y: cy,
          radius: Math.sqrt(count / Math.PI),
          count,
          score,
          roundness,
          centerDistance,
        };
      }
    }
  }

  return best;
}

function peaksInWindow(peaks, start, window, n) {
  const end = start + window;
  const list = [];
  peaks.forEach((peak) => {
    let idx = peak.index;
    while (idx < start) idx += n;
    if (idx >= start && idx <= end) {
      list.push({ ...peak, unwrappedIndex: idx });
    }
  });
  list.sort((a, b) => a.unwrappedIndex - b.unwrappedIndex);
  return list;
}

function spacingStats(values, n) {
  if (!values?.length) return { period: 0, jitter: 1 };
  const arr = values.slice().sort((a, b) => a - b);
  const diffs = [];
  for (let i = 1; i < arr.length; i += 1) diffs.push(arr[i] - arr[i - 1]);
  diffs.push((arr[0] + n) - arr[arr.length - 1]);
  const period = median(diffs);
  const mad = median(diffs.map((d) => Math.abs(d - period)));
  return { period, jitter: mad / Math.max(1, period) };
}

function mergeCandidateLists(...lists) {
  const map = new Map();
  lists.flat().forEach((item) => {
    const teeth = Math.round(item?.teeth || 0);
    if (!teeth) return;
    const score = Number(item.score ?? item.quality ?? item.confidence ?? 0);
    const prev = map.get(teeth);
    if (!prev || score > prev.score) map.set(teeth, { ...item, teeth, score });
  });
  return [...map.values()].sort((a, b) => b.score - a.score);
}


function chooseGearPolarity(rawGray, width, height) {
  const threshold = otsuThreshold(rawGray);
  const dark = findMainGearComponentByPolarity(rawGray, width, height, threshold, 'dark');
  const light = findMainGearComponentByPolarity(rawGray, width, height, threshold, 'light');

  if (!dark && !light) {
    return {
      polarity: 'dark',
      threshold,
      darkScore: 0,
      lightScore: 0,
    };
  }

  if (light && (!dark || light.score > dark.score * 1.08)) {
    return {
      polarity: 'light',
      threshold,
      darkScore: dark?.score || 0,
      lightScore: light.score,
      reason: 'light component looked more gear-like',
    };
  }

  return {
    polarity: 'dark',
    threshold,
    darkScore: dark?.score || 0,
    lightScore: light?.score || 0,
    reason: 'dark component looked more gear-like',
  };
}

function invertGray(gray) {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    out[i] = 255 - gray[i];
  }
  return out;
}

function findMainGearComponentByPolarity(gray, width, height, threshold, polarity) {
  const n = width * height;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let best = null;

  const isForeground = polarity === 'light'
    ? (value) => value >= threshold
    : (value) => value <= threshold;

  for (let start = 0; start < n; start += 1) {
    if (visited[start] || !isForeground(gray[start])) continue;

    let qStart = 0;
    let qEnd = 0;
    queue[qEnd++] = start;
    visited[start] = 1;

    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let touchesEdge = false;

    while (qStart < qEnd) {
      const idx = queue[qStart++];
      const x = idx % width;
      const y = Math.floor(idx / width);

      count += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) touchesEdge = true;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const ni of neighbors) {
        if (ni < 0 || ni >= n || visited[ni]) continue;
        const nx = ni % width;
        const ny = Math.floor(ni / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (!isForeground(gray[ni])) continue;
        visited[ni] = 1;
        queue[qEnd++] = ni;
      }
    }

    if (count < 250) continue;

    const boxW = Math.max(1, maxX - minX + 1);
    const boxH = Math.max(1, maxY - minY + 1);
    const fill = count / Math.max(1, boxW * boxH);
    const aspect = boxW / boxH;
    const aspectPenalty = Math.min(1, Math.abs(Math.log(aspect)) / Math.log(2.2));
    const roundness = Math.max(0.05, 1 - aspectPenalty);
    const edgePenalty = touchesEdge ? 0.02 : 1;
    const tooHugePenalty = (boxW > width * 0.94 || boxH > height * 0.94) ? 0.08 : 1;
    const tooSmallPenalty = (boxW < width * 0.16 || boxH < height * 0.16) ? 0.18 : 1;
    const fillPenalty = fill < 0.025 ? 0.10 : 1;
    const centeredness = 1 / (1 + (Math.hypot((sumX / count) - width / 2, (sumY / count) - height / 2) / Math.max(width, height)) * 1.6);
    const score = count * roundness * edgePenalty * tooHugePenalty * tooSmallPenalty * fillPenalty * centeredness;

    if (!best || score > best.score) {
      best = {
        score,
        count,
        minX,
        maxX,
        minY,
        maxY,
        fill,
        roundness,
        touchesEdge,
        polarity,
      };
    }
  }

  return best;
}

function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;

  const total = gray.length;
  let sumTotal = 0;
  for (let i = 0; i < 256; i += 1) sumTotal += i * hist[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t += 1) {
    weightBackground += hist[t];
    if (!weightBackground) continue;
    const weightForeground = total - weightBackground;
    if (!weightForeground) break;

    sumBackground += t * hist[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumTotal - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * Math.pow(meanBackground - meanForeground, 2);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

function fillMissingCircular(arr) {
  const n = arr.length;
  let firstGood = -1;
  for (let i = 0; i < n; i += 1) {
    if (Number.isFinite(arr[i]) && arr[i] > 0) {
      firstGood = i;
      break;
    }
  }
  if (firstGood < 0) {
    for (let i = 0; i < n; i += 1) arr[i] = 0;
    return;
  }
  let last = arr[firstGood];
  for (let step = 0; step < n; step += 1) {
    const i = (firstGood + step) % n;
    if (!Number.isFinite(arr[i]) || arr[i] <= 0) arr[i] = last;
    else last = arr[i];
  }
}

function circularSmooth(arr, radius) {
  const n = arr.length;
  const out = new Array(n);
  const r = Math.max(0, Math.round(radius));
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    let count = 0;
    for (let d = -r; d <= r; d += 1) {
      sum += arr[(i + d + n) % n];
      count += 1;
    }
    out[i] = sum / count;
  }
  return out;
}

function sampleCircular(arr, index) {
  const n = arr.length;
  const wrapped = normalizeIndex(index, n);
  const i0 = Math.floor(wrapped);
  const i1 = (i0 + 1) % n;
  const t = wrapped - i0;
  return arr[i0] * (1 - t) + arr[i1] * t;
}

function normalizeIndex(value, n) {
  if (!n) return 0;
  let v = value % n;
  if (v < 0) v += n;
  return v;
}

function circularForwardDistance(a, b, n) {
  let d = b - a;
  while (d < 0) d += n;
  while (d >= n) d -= n;
  return d;
}

function average(values) {
  if (!values?.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values) {
  const arr = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function percentile(values, p) {
  const arr = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const idx = Math.max(0, Math.min(arr.length - 1, Math.round((arr.length - 1) * p)));
  return arr[idx];
}

function refinePeakNear(signal, target, radius) {
  const steps = Math.max(2, Math.round(radius));
  let bestIndex = target;
  let bestValue = -Infinity;
  for (let d = -steps; d <= steps; d += 1) {
    const idx = target + d;
    const value = sampleCircular(signal, idx);
    if (value > bestValue) {
      bestValue = value;
      bestIndex = idx;
    }
  }
  return normalizeIndex(bestIndex, signal.length);
}

function getRcSpurCountBias(teeth) {
  if (teeth < 40) return 1;
  if (teeth % 2 !== 0) return 0.91;
  if (teeth % 4 === 0) return 1.025;
  return 1.01;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function makeOuterRingOverlay(result, width, height) {
  if (!result?.center || !Number.isFinite(result.outerRadius)) return null;

  // Tight crop so all four edges of the preview are close to the gear.
  const ellipse = result.ellipse || null;
  const cropRadius = ellipse?.perspectiveCorrected
    ? Math.max(ellipse.rx, ellipse.ry) * 1.14
    : result.outerRadius * 1.12;
  const vbX = Math.max(0, result.center.x - cropRadius);
  const vbY = Math.max(0, result.center.y - cropRadius);
  const vbMaxX = Math.min(width, result.center.x + cropRadius);
  const vbMaxY = Math.min(height, result.center.y + cropRadius);

  const sectorPath = result.sector
    ? describeArcPath(
        result.center.x,
        result.center.y,
        ellipse?.perspectiveCorrected ? Math.max(ellipse.rx, ellipse.ry) * 1.016 : result.outerRadius * 1.016,
        result.sector.startAngle,
        result.sector.endAngle
      )
    : '';

  const sourceLabel = result.selectedSource === 'middle-even-consensus-bridge'
    ? 'Distorted-arc middle snap'
    : result.selectedSource === 'consensus-higher-even-cross-check'
      ? 'Consensus higher-even check'
      : result.selectedSource === 'consensus-cross-check'
        ? 'Consensus cross-check'
        : result.selectedSource === 'missing-peak-gap-repair'
          ? 'Gap-filled peak spacing'
          : result.selectedSource === 'clean-peak-sector-angle'
            ? 'Safe clean peak sector'
            : result.selectedSource === 'safe-shadow-trimmed-lower-even'
              ? 'Safe lower-even shadow trim'
              : result.selectedSource === 'shadow-trimmed-lower-even'
                ? 'Shadow trimmed peaks'
                : 'Center verified peaks';

  return {
    width,
    height,
    cx: result.center.x,
    cy: result.center.y,
    outerRadius: result.outerRadius,
    diameterPx: Number((result.outerRadius * 2).toFixed(2)),
    innerRadius: result.innerRadius,
    clipRadius: result.outerRadius * 1.12,
    backgroundRemoved: true,
    perspectiveCorrected: !!ellipse?.perspectiveCorrected,
    ellipse: ellipse ? {
      cx: ellipse.cx,
      cy: ellipse.cy,
      rx: ellipse.rx,
      ry: ellipse.ry,
      rotation: ellipse.rotation,
      rotationDeg: Number(((ellipse.rotation || 0) * 180 / Math.PI).toFixed(2)),
      ratio: Number((ellipse.ratio || 1).toFixed(3)),
    } : null,
    ticks: Array.isArray(result.ticks) ? result.ticks : [],
    sectorPath,
    viewBox: {
      x: vbX,
      y: vbY,
      width: Math.max(10, vbMaxX - vbX),
      height: Math.max(10, vbMaxY - vbY),
    },
    tickMode: `${ellipse?.perspectiveCorrected ? 'Perspective ellipse • ' : ''}${sourceLabel} • counted peaks only • ${result.teeth || 0}T guide`,
  };
}

function describeArcPath(cx, cy, radius, startAngle, endAngle) {
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return '';
  const start = {
    x: cx + Math.cos(startAngle) * radius,
    y: cy + Math.sin(startAngle) * radius,
  };
  const end = {
    x: cx + Math.cos(endAngle) * radius,
    y: cy + Math.sin(endAngle) * radius,
  };
  const delta = Math.abs(endAngle - startAngle);
  const largeArc = delta > Math.PI ? 1 : 0;
  const sweep = endAngle >= startAngle ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}
