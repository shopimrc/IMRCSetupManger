function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function fallback(value, empty = '') {
  const text = clean(value);
  return text || empty;
}

function esc(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function display(value) {
  const text = esc(value);
  return text || '&nbsp;';
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return clean(value);
  }
}

function getCornerValue(map = {}, corner) {
  return map?.[corner] ?? '';
}

function getNestedCornerValue(map = {}, corner, keyA, keyB) {
  const item = map?.[corner] || {};
  return item?.[keyA] ?? item?.[keyB] ?? '';
}

function isPanCarSetup(setup = {}) {
  const id = clean(setup.chassisProfile?.id || setup.profileId || setup.chassisProfileId).toLowerCase();
  const label = clean(setup.chassisProfile?.label || setup.vehicleChassisStyle || setup.chassisStyle || setup.className || setup.raceClass);
  return id === 'pancar' || id === 'pan_car' || /pan\s*car|pancar|oval\s*pan|1\/12|12th|world\s*gt|\bwgt\b/i.test(label);
}

function getSetupTransponder(setup = {}) {
  return fallback(
    setup.vehicleTransponder || setup.transponder || setup.transponderNumber || setup.tx || setup.txNumber,
    setup.vehicle?.transponder || setup.vehicle?.tx || setup.vehicle?.transponderNumber || setup.electronics?.transponder || setup.electronics?.transponderNumber
  );
}

function line(label, value) {
  return `<div class="line"><span class="lineLabel">${esc(label)}:</span><span class="lineValue">${display(value)}</span></div>`;
}

function subLine(label, value) {
  return `<div class="subLine"><span>${esc(label)}:</span><em>${display(value)}</em></div>`;
}

function noteLines(value, count = 3) {
  const text = clean(value);
  const rows = [];
  if (text) {
    rows.push(`<div class="noteText">${esc(text)}</div>`);
  }
  for (let i = rows.length; i < count; i += 1) {
    rows.push('<div class="noteBlank">&nbsp;</div>');
  }
  return rows.join('');
}

function panCarCornerBox(corner, setup = {}) {
  const isFront = corner === 'LF' || corner === 'RF';

  const tireRows = [
    line('Compound', getCornerValue(setup.tires?.compound, corner) || setup.tires?.[corner]),
    line('Size', getCornerValue(setup.tires?.size, corner)),
    ...(isFront ? [line('Camber Cut', getCornerValue(setup.tires?.camberCut, corner))] : []),
  ].join('');

  const frontRows = [
    line('Scale Weight', getCornerValue(setup.cornerWeights, corner)),
    line('Ride Height', getCornerValue(setup.suspension?.rideHeight, corner)),
    line('Toe In / Out', getCornerValue(setup.geometry?.toe, corner)),
    line('Camber', getCornerValue(setup.geometry?.camber, corner)),
    line('Caster', getCornerValue(setup.geometry?.caster, corner)),
    line('Caster Block Spacing', getCornerValue(setup.geometry?.casterBlockSpacing, corner)),
    line(`${corner} Axle Shims`, getCornerValue(setup.suspension?.axleShims, corner)),
    line('Spring #', getCornerValue(setup.suspension?.springs, corner)),
    line('Oil # / Dampning', getCornerValue(setup.suspension?.oil, corner)),
    line('Sag / Droop', getCornerValue(setup.suspension?.droop, corner)),
    line('Shims Top Kingpin', getNestedCornerValue(setup.suspension?.wheelHubKingpinPosition, corner, 'top', 'upper')),
    line('Shims Bottom Kingpin', getNestedCornerValue(setup.suspension?.wheelHubKingpinPosition, corner, 'bottom', 'lower')),
  ].join('');

  const rearRows = [
    line('Scale Weight', getCornerValue(setup.cornerWeights, corner)),
    line('Ride Height', getCornerValue(setup.suspension?.rideHeight, corner)),
    line('Spring #', getCornerValue(setup.suspension?.springs, corner)),
    line('Shock Oil', getCornerValue(setup.suspension?.oil, corner)),
    line('Spring Preload', getCornerValue(setup.suspension?.springPreload, corner)),
    line('Shock Overall Length', getCornerValue(setup.suspension?.springLength, corner)),
    line('Outside Shock Position', getCornerValue(setup.suspension?.outsideShockPosition, corner)),
    line(`${corner} Axle Shims`, getCornerValue(setup.suspension?.axleShims, corner)),
    line('Sag / Droop', getCornerValue(setup.suspension?.droop, corner)),
  ].join('');

  return `
    <section class="cornerBox corner-${corner}">
      <h2>${corner}</h2>
      <h3>Tires</h3>
      ${tireRows}
      <h3>${isFront ? 'Front Corner' : 'Rear Spring / Weight'}</h3>
      ${isFront ? frontRows : rearRows}
      <h3>Notes</h3>
      ${noteLines(setup.cornerNotes?.[corner], 1)}
    </section>
  `;
}

function genericCornerBox(corner, setup = {}) {
  const isFront = corner === 'LF' || corner === 'RF';
  const tire = setup.tires?.[corner];
  const spring = setup.suspension?.springs?.[corner];
  const oil = setup.suspension?.oil?.[corner];
  const damper = setup.suspension?.damper?.[corner];
  const shockTop = getNestedCornerValue(setup.suspension?.shockPosition, corner, 'top', 'upper');
  const shockBottom = getNestedCornerValue(setup.suspension?.shockPosition, corner, 'bottom', 'lower');
  const armTop = getNestedCornerValue(setup.geometry?.armLocation, corner, 'upper', 'top');
  const armBottom = getNestedCornerValue(setup.geometry?.armLocation, corner, 'lower', 'bottom');
  const hubTop = getNestedCornerValue(setup.suspension?.wheelHubKingpinPosition, corner, 'top', 'upper');
  const hubBottom = getNestedCornerValue(setup.suspension?.wheelHubKingpinPosition, corner, 'bottom', 'lower');
  const casterOrToe = isFront ? getCornerValue(setup.geometry?.caster, corner) : getCornerValue(setup.geometry?.toe, corner);

  return `
    <section class="cornerBox corner-${corner}">
      <h2>${corner}</h2>
      ${line('Tire', tire)}
      ${line('Spring', spring)}
      ${line('Oil Wt', oil)}
      ${line('Damper', damper)}
      <h3>Shock Location</h3>
      <div class="twoMini">${subLine('Top', shockTop)}${subLine('Bottom', shockBottom)}</div>
      <h3>Arm Location</h3>
      <div class="twoMini">${subLine('Top', armTop)}${subLine('Bottom', armBottom)}</div>
      <h3>Hub / Kingpin Position</h3>
      <div class="twoMini">${subLine('Top', hubTop)}${subLine('Bottom', hubBottom)}</div>
      ${line('Ride Height', setup.suspension?.rideHeight?.[corner])}
      ${line('Droop', setup.suspension?.droop?.[corner])}
      ${line('Camber', setup.geometry?.camber?.[corner])}
      ${line(isFront ? 'Caster' : 'Toe', casterOrToe)}
      ${line('Corner Wt', setup.cornerWeights?.[corner])}
      <h3>Notes</h3>
      ${noteLines(setup.cornerNotes?.[corner], 1)}
    </section>
  `;
}

function cornerBox(corner, setup = {}) {
  return isPanCarSetup(setup) ? panCarCornerBox(corner, setup) : genericCornerBox(corner, setup);
}

function centerBox(setup = {}) {
  const panCar = isPanCarSetup(setup);
  const centerTitle = panCar ? 'CENTER / REAR POD' : 'CENTER';
  const podTitle = panCar ? 'Center / Rear Pod' : 'Center / Chassis';

  return `
    <section class="centerBox">
      <h2>${centerTitle}</h2>
      <h3>Cross / Bias</h3>
      ${line('Total Wt', setup.cornerWeights?.totalWeight)}
      ${line('Cross %', setup.cornerWeights?.crossWeight)}
      ${line('Left %', setup.cornerWeights?.leftBias)}
      ${line('Front Bias', setup.cornerWeights?.frontBias)}
      ${line('Rear Bias', setup.cornerWeights?.rearBias)}

      <h3>${podTitle}</h3>
      ${panCar ? line('Pod Height', setup.suspension?.podHeight) : line('Spring', setup.suspension?.centerSpring)}
      ${panCar ? line('Pod Droop', setup.suspension?.podDroop) : line('Oil Wt', setup.suspension?.centerOil)}
      ${panCar ? line('Rear Steer', setup.geometry?.rearSteer) : line('Damper', setup.suspension?.centerDamper)}
      ${panCar ? line('T-Plate / Roll Center Shim', setup.geometry?.tPlateRollCenterShim) : `<div class="twoMini">${subLine('Shock F', setup.suspension?.centerShockPosition?.front)}${subLine('Shock R', setup.suspension?.centerShockPosition?.rear)}</div>`}

      ${panCar ? `
        <h3>Center Shock</h3>
        ${line('Front Chassis Position', setup.suspension?.centerShockPosition?.frontChassisPosition || setup.suspension?.centerShockPosition?.front)}
        ${line('Front Tower Position', setup.suspension?.centerShockPosition?.frontTowerPosition)}
        ${line('Rear Shock Shims', setup.suspension?.centerShockPosition?.rearShims || setup.suspension?.centerShockPosition?.rear)}
        ${line('Shock Length', setup.suspension?.centerShockLength)}
        ${line('Center Spring', setup.suspension?.centerSpring)}
        ${line('Spring Preload', setup.suspension?.centerSpringPreload)}
        ${line('Oil # / Dampning', setup.suspension?.centerOil)}
        ${line('Center Damper', setup.suspension?.centerDamper)}

        <h3>Front / Servo</h3>
        ${line('Ackerman Angle', setup.geometry?.ackermanAngle)}
        ${line('Front Roll Center', setup.geometry?.frontRollCenter)}
        ${line('Servo Mount Position', setup.electronics?.servoMountPosition)}
        ${line('Servo Mount Angle', setup.electronics?.servoMountAngle)}
      ` : `
        ${line('Pod Height', setup.suspension?.podHeight)}
        ${line('Droop', setup.suspension?.podDroop)}
        ${line('Rear Steer', setup.geometry?.rearSteer)}
      `}

      <h3>Gearing / Alignment</h3>
      ${line('Spur', setup.gearing?.spur)}
      ${line('Pinion', setup.gearing?.pinion)}
      ${line('Tire Dia', setup.gearing?.tireDiameter)}
      ${line('Trans Ratio', setup.gearing?.transmissionRatio)}
      ${line('Target Rollout', setup.gearing?.targetRollout)}
      ${line('TX / Transponder Number', getSetupTransponder(setup))}
      ${line('Rollout', setup.gearing?.rollout)}
      ${line('Front Toe', setup.geometry?.frontToe)}
      ${line('Rear Toe', setup.geometry?.rearToe)}
      ${line('Diff', fallback(setup.drivetrain?.rearDiffFluid, setup.drivetrain?.diffFluid))}
    </section>
  `;
}

function bottomNotes(setup = {}) {
  return `
    <section class="resultsBox">
      <h2>NOTES / RESULTS</h2>
      <div class="resultRow">
        ${line('Round', setup.results?.round || 'Practice')}
        ${line('Fast Lap', setup.results?.fastLap)}
        ${line('Avg Lap', setup.results?.avgLap)}
        ${line('Laps', setup.results?.totalLaps)}
        ${line('Time', setup.results?.totalTime)}
        ${line('Motor Temp', setup.results?.motorTempF)}
      </div>
      ${noteLines(setup.results?.notes || setup.chassis?.notes || setup.geometry?.notes || setup.suspension?.notes || setup.tires?.notes, 4)}
    </section>
  `;
}

export function buildSetupPdfHtml(setup = {}) {
  const chassisLabel = setup.chassisProfile?.label || setup.vehicleChassisStyle || setup.chassisStyle || '';
  const carName = setup.vehicleName || setup.setupName || 'Setup Sheet';
  const trackName = setup.trackName || '';
  const className = setup.className || setup.raceClass || chassisLabel || '';
  const transponder = getSetupTransponder(setup);
  const savedDate = formatDate(setup.savedAt || setup.updatedAt);
  const panCar = isPanCarSetup(setup);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(carName)} - IMRC Setup Sheet</title>
  <style>
    @page { size: Letter portrait; margin: 0.18in; }
    * { box-sizing: border-box; }
    html, body {
      width: 8.5in;
      min-height: 11in;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111111;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { font-size: ${panCar ? '7.5px' : '8.0px'}; line-height: 1.02; }
    .page {
      position: relative;
      width: 8.14in;
      height: 10.64in;
      overflow: hidden;
      background: #ffffff;
    }
    .watermark {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      opacity: 0.07;
      color: #38bdf8;
      font-weight: 900;
      font-size: 28px;
      line-height: 1.1;
      transform: rotate(17deg) scale(1.15);
      transform-origin: center;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.18in;
      padding-top: 0.15in;
    }
    .watermark span { white-space: nowrap; }
    .content { position: relative; z-index: 1; height: 100%; }
    .title {
      text-align: center;
      font-size: 21px;
      font-weight: 900;
      line-height: 1;
      margin: 0 0 0.07in;
    }
    .topMeta {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 0.82fr;
      gap: 0.16in;
      margin-bottom: 0.10in;
      font-size: 9px;
      font-weight: 700;
    }
    .metaLine {
      display: flex;
      align-items: end;
      gap: 0.04in;
      min-width: 0;
    }
    .metaLine b { white-space: nowrap; }
    .metaValue {
      flex: 1;
      border-bottom: 1px solid #111;
      min-height: 0.12in;
      padding-left: 0.03in;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .sheetGrid {
      position: relative;
      height: 9.90in;
      width: 100%;
    }
    section {
      border: 1.2px solid #111;
      background: rgba(255,255,255,0.93);
      overflow: hidden;
    }
    .cornerBox { padding: 0.055in 0.075in 0.045in; width: 2.45in; height: 3.90in; position: absolute; }
    .centerBox { position: absolute; left: 2.70in; top: 0; width: 2.74in; height: 7.94in; padding: 0.055in 0.075in; }
    .resultsBox { position: absolute; left: 0; right: 0; top: 8.12in; height: 1.58in; padding: 0.07in 0.09in; }
    .corner-LF { left: 0; top: 0; }
    .corner-RF { right: 0; top: 0; }
    .corner-LR { left: 0; top: 4.02in; }
    .corner-RR { right: 0; top: 4.02in; }
    h2 {
      margin: 0 0 0.045in;
      font-size: ${panCar ? '11.3px' : '12px'};
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0.008in;
    }
    h3 {
      margin: 0.030in 0 0.006in;
      font-size: ${panCar ? '7.4px' : '8px'};
      line-height: 1.02;
      font-weight: 900;
      text-transform: uppercase;
    }
    .line {
      display: flex;
      align-items: end;
      gap: 0.025in;
      min-height: ${panCar ? '0.111in' : '0.132in'};
      margin: 0;
      page-break-inside: avoid;
    }
    .lineLabel {
      white-space: nowrap;
      font-weight: 500;
    }
    .lineValue {
      flex: 1;
      border-bottom: 0.8px solid #444;
      min-height: ${panCar ? '0.088in' : '0.105in'};
      padding-left: 0.018in;
      font-weight: 700;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .twoMini {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 0.07in;
      margin-left: 0.04in;
    }
    .subLine {
      display: flex;
      align-items: end;
      gap: 0.02in;
      min-height: ${panCar ? '0.104in' : '0.122in'};
    }
    .subLine span { font-weight: 500; white-space: nowrap; }
    .subLine em {
      flex: 1;
      border-bottom: 0.8px solid #555;
      min-height: ${panCar ? '0.084in' : '0.096in'};
      font-style: normal;
      font-weight: 700;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .noteBlank { border-bottom: 1px solid #111; height: 0.13in; }
    .noteText {
      min-height: 0.13in;
      max-height: 0.26in;
      overflow: hidden;
      border-bottom: 1px solid #111;
      font-weight: 700;
      white-space: pre-wrap;
    }
    .resultRow {
      display: grid;
      grid-template-columns: 1.8fr 0.85fr 0.85fr 0.75fr 0.75fr 0.9fr;
      gap: 0.08in;
      align-items: end;
      margin-bottom: 0.04in;
    }
    .resultRow .line { min-height: 0.15in; }
    .resultRow .lineLabel { font-size: 7.5px; }
    .resultRow .lineValue { min-height: 0.11in; }
    .printMeta {
      position: absolute;
      right: 0.02in;
      top: 0.02in;
      color: #555;
      font-size: 6.8px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="watermark">
      ${Array.from({ length: 44 }).map(() => '<span>WWW.SHOPIMRC.COM</span>').join('')}
    </div>
    <div class="content">
      <div class="printMeta">${esc(savedDate)}</div>
      <h1 class="title">IMRC Setup Sheet</h1>
      <div class="topMeta">
        <div class="metaLine"><b>Track:</b><span class="metaValue">${display(trackName)}</span></div>
        <div class="metaLine"><b>Car:</b><span class="metaValue">${display(carName)}</span></div>
        <div class="metaLine"><b>Class:</b><span class="metaValue">${display(className)}</span></div>
        <div class="metaLine"><b>TX:</b><span class="metaValue">${display(transponder)}</span></div>
      </div>
      <div class="sheetGrid">
        ${cornerBox('LF', setup)}
        ${centerBox(setup)}
        ${cornerBox('RF', setup)}
        ${cornerBox('LR', setup)}
        ${cornerBox('RR', setup)}
        ${bottomNotes(setup)}
      </div>
    </div>
  </div>
</body>
</html>`;
}
