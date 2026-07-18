// features/tools/lib/gearPhotoAutoCount.js
// Adapter for the app's Gear Counter photo workflow.
// Uses the provided outer-ring tooth counter logic from ./gearToothCounter.

import { cleanNumber } from './gearMath';
import { countGearTeethOuterRing, makeOuterRingOverlay } from './gearToothCounter';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function requireJpegJs() {
  // jpeg-js is pure JS. The patch package.json includes it.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  return require('jpeg-js');
}

function base64ToBytes(base64) {
  const clean = String(base64 || '').replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');
  if (!clean) return new Uint8Array(0);

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i += 1) lookup[chars.charCodeAt(i)] = i;

  let bufferLength = (clean.length * 3) / 4;
  if (clean.endsWith('==')) bufferLength -= 2;
  else if (clean.endsWith('=')) bufferLength -= 1;

  const bytes = new Uint8Array(Math.max(0, Math.floor(bufferLength)));
  let p = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const encoded1 = lookup[clean.charCodeAt(i)];
    const encoded2 = lookup[clean.charCodeAt(i + 1)];
    const encoded3 = clean[i + 2] === '=' ? 64 : lookup[clean.charCodeAt(i + 2)];
    const encoded4 = clean[i + 3] === '=' ? 64 : lookup[clean.charCodeAt(i + 3)];

    const triplet = (encoded1 << 18) | (encoded2 << 12) | ((encoded3 & 63) << 6) | (encoded4 & 63);
    if (p < bytes.length) bytes[p++] = (triplet >> 16) & 255;
    if (encoded3 !== 64 && p < bytes.length) bytes[p++] = (triplet >> 8) & 255;
    if (encoded4 !== 64 && p < bytes.length) bytes[p++] = triplet & 255;
  }
  return bytes;
}

function resizeImageData(decoded, maxDim = 600) {
  const srcW = decoded.width;
  const srcH = decoded.height;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const width = Math.max(80, Math.round(srcW * scale));
  const height = Math.max(80, Math.round(srcH * scale));

  if (scale >= 0.999) {
    return {
      width: srcW,
      height: srcH,
      data: decoded.data,
      scale: 1,
    };
  }

  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor(x / scale));
      const src = (sy * srcW + sx) * 4;
      const dst = (y * width + x) * 4;
      data[dst] = decoded.data[src];
      data[dst + 1] = decoded.data[src + 1];
      data[dst + 2] = decoded.data[src + 2];
      data[dst + 3] = decoded.data[src + 3] ?? 255;
    }
  }
  return { width, height, data, scale };
}

function getToothSearchRange(expectedFromOd) {
  const expected = Math.round(cleanNumber(expectedFromOd));
  if (expected >= 8 && expected <= 180) {
    return {
      expected,
      minTeeth: Math.max(6, expected - 16),
      maxTeeth: Math.min(190, expected + 16),
    };
  }
  return {
    expected: 0,
    minTeeth: 40,
    maxTeeth: 130,
  };
}

function candidateIncludesExpected(topCandidates, expected) {
  if (!expected) return false;
  return (topCandidates || []).some((c) => Math.abs(Number(c.teeth) - expected) <= 1);
}

export async function autoCountGearTeethFromBase64(base64, options = {}) {
  const bytes = base64ToBytes(base64);
  if (!bytes.length) {
    return { ok: false, message: 'No photo data was available for auto count.' };
  }

  let decoded;
  try {
    const jpeg = requireJpegJs();
    decoded = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 128 });
  } catch (err) {
    return {
      ok: false,
      message: 'Auto count needs jpeg-js installed. Run npm install, then restart Expo.',
      detail: String(err?.message || err || ''),
    };
  }

  if (!decoded?.data || decoded.width < 80 || decoded.height < 80) {
    return { ok: false, message: 'Photo was too small to read gear teeth.' };
  }

  const imageData = resizeImageData(decoded, 620);
  const range = getToothSearchRange(options.expectedFromOd);

  const raw = countGearTeethOuterRing(imageData, {
    samples: 2048,
    minTeeth: range.minTeeth,
    maxTeeth: range.maxTeeth,
  });

  if (!raw?.teeth || raw.error) {
    return {
      ok: false,
      message: raw?.error || 'Could not find enough outer tooth edge to count teeth.',
      debug: raw,
    };
  }

  const expected = range.expected;
  const topCandidates = raw.debug?.topCandidates || [];
  const photoCount = Math.round(raw.teeth);
  const agreesWithExpected = expected > 0 && Math.abs(photoCount - expected) <= 1;
  const expectedIsCandidate = candidateIncludesExpected(topCandidates, expected);

  let count = photoCount;
  let verifiedByOd = false;
  let usable = false;
  // Photo-only count is a guide, not a 95% result. Only pitch + measured OD can
  // be treated as verified in this pure-JS build.
  let confidence = Math.round(clamp(raw.confidence * 100, 8, 70));

  if (expected > 0) {
    // If the driver entered pitch + measured OD, that math is the high-accuracy
    // path. The photo overlay remains a sanity guide, but the verified count
    // should come from pitch/OD instead of a noisy image.
    verifiedByOd = true;
    usable = true;
    count = expected;
    confidence = agreesWithExpected || expectedIsCandidate ? 96 : 92;
  } else if (confidence >= 64) {
    usable = true;
  }

  const overlay = makeOuterRingOverlay(raw, imageData.width, imageData.height);

  const verifyText = verifiedByOd
    ? 'Verified by pitch + measured Outside Dia.'
    : usable
      ? 'Photo-only guide. Verify before trusting.'
      : 'Not verified — for 90%+ accuracy, enter pitch + measured Outside Dia.';

  const label = verifiedByOd ? 'Verified Tooth Estimate' : (raw.selectedSource === 'center-bore-shadow-corrected' ? 'Shadow-Corrected Estimate' : raw.selectedSource === 'center-bore-tip-valley-fit' ? 'Center Bore Tip Estimate' : raw.selectedSource === 'center-bore-radius-runs' ? 'Center Bore Run Estimate' : 'Outer Ring Photo Estimate');
  const candidateText = topCandidates.length
    ? ` Top photo candidates: ${topCandidates.slice(0, 3).map((c) => `${c.teeth}T`).join(', ')}.`
    : '';
  const diameterText = raw.debug?.photoDiameterPx
    ? ` Gear-only diameter: ${raw.debug.photoDiameterPx}px.`
    : '';
  const maskText = raw.debug?.backgroundRemoved ? ' Background removed before tooth scan.' : '';

  return {
    ok: true,
    count,
    photoGuess: photoCount,
    confidence,
    method: raw.selectedSource === 'center-bore-shadow-corrected' ? 'center bore shadow corrected' : raw.selectedSource === 'center-bore-tip-valley-fit' ? 'center bore tip/valley fit' : raw.selectedSource === 'center-bore-radius-runs' ? 'center bore radius runs' : 'outer-ring edge scan',
    usable,
    verifiedByOd,
    expected,
    message: `${label}: ${count}T. Confidence: ${confidence}% — ${verifyText}${diameterText}${maskText}${candidateText}`,
    sector: raw.sector || null,
    overlay,
    debug: {
      ...raw,
      expected,
      finalCount: count,
      topCandidates,
      resizedWidth: imageData.width,
      resizedHeight: imageData.height,
    },
  };
}
