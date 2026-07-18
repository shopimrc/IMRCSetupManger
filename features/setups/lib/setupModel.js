import { CHASSIS_PROFILES, getChassisProfileById, matchChassisProfile } from './setupChassisProfiles';
export { CHASSIS_PROFILES, CHASSIS_PROFILE_ORDER } from './setupChassisProfiles';

export const SETUP_TABS = [
  'Gearing',
  'Tires',
  'Suspension',
  'Geometry',
  'Corner Weights',
  'Results',
  'History',
];

export const SETUP_ROUNDS = [
  'Practice',
  'Heat 1',
  'Heat 2',
  'Heat 3',
  'Qual 1',
  'Qual 2',
  'Qual 3',
  'Main A',
  'Main B',
  'Main C',
];

export const CORNERS = ['LF', 'RF', 'LR', 'RR'];
export const FRONT_CORNERS = ['LF', 'RF'];

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || '';
}

export function getVehicleChassisText(vehicle = {}, setup = {}) {
  return [
    vehicle?.chassisStyle,
    vehicle?.chassis,
    vehicle?.style,
    vehicle?.vehicleStyle,
    vehicle?.vehicleType,
    vehicle?.type,
    vehicle?.class,
    vehicle?.className,
    vehicle?.vehicleClass,
    vehicle?.manufacturer,
    vehicle?.model,
    vehicle?.name,
    vehicle?.vehicleName,
    setup?.vehicleChassisStyle,
    setup?.chassisStyle,
    setup?.chassisProfile?.label,
    setup?.vehicleName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function detectVehicleChassisProfile(vehicle = {}, setup = {}) {
  const vehicleDirectId = firstText(vehicle?.chassisProfileId, vehicle?.setupProfileId);
  const vehicleDirectProfile = getChassisProfileById(vehicleDirectId);
  if (vehicleDirectProfile) return vehicleDirectProfile;

  const vehicleOnlyText = getVehicleChassisText(vehicle, {});
  if (vehicleOnlyText) return matchChassisProfile(vehicleOnlyText);

  const setupDirectId = firstText(setup?.chassisProfileId, setup?.chassisProfile?.id);
  const setupDirectProfile = getChassisProfileById(setupDirectId);
  if (setupDirectProfile) return setupDirectProfile;

  return matchChassisProfile(getVehicleChassisText({}, setup));
}


export function getSetupChassisProfile(setup = {}) {
  return detectVehicleChassisProfile({}, setup);
}

export function getVehicleChassisStyleLabel(vehicle = {}) {
  return firstText(vehicle?.chassisStyle, vehicle?.chassis, vehicle?.vehicleStyle, vehicle?.vehicleType, vehicle?.type, vehicle?.className, vehicle?.class, '');
}

export function createEmptyCornerMap(value = '') {
  return CORNERS.reduce((acc, corner) => {
    acc[corner] = value;
    return acc;
  }, {});
}

export function createNestedCornerMap(keys) {
  return CORNERS.reduce((acc, corner) => {
    acc[corner] = keys.reduce((inner, key) => {
      inner[key] = '';
      return inner;
    }, {});
    return acc;
  }, {});
}

export function getEntityId(item) {
  if (!item) return '';
  return String(
    item.id ||
      item.vehicleId ||
      item.trackId ||
      item.key ||
      item.uuid ||
      item.name ||
      item.vehicleName ||
      item.trackName ||
      ''
  );
}

export function getVehicleDisplayName(vehicle) {
  if (!vehicle) return 'Unknown Vehicle';
  return (
    vehicle.name ||
    vehicle.vehicleName ||
    vehicle.title ||
    [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') ||
    'Unnamed Vehicle'
  );
}

export function getTrackDisplayName(track) {
  if (!track) return 'Unknown Track';
  return track.name || track.trackName || track.title || track.locationName || 'Unnamed Track';
}

export function makeSetupId() {
  return `setup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeSetupKey(vehicleId, trackId) {
  return `${String(vehicleId || '').trim()}__${String(trackId || '').trim()}`;
}

export function createDefaultSetup({ vehicle, track, vehicleId, trackId }) {
  const now = new Date().toISOString();
  const resolvedVehicleId = String(vehicleId || getEntityId(vehicle));
  const resolvedTrackId = String(trackId || getEntityId(track));

  return {
    id: makeSetupId(),
    vehicleId: resolvedVehicleId,
    trackId: resolvedTrackId,
    vehicleName: getVehicleDisplayName(vehicle),
    trackName: getTrackDisplayName(track),
    vehicleChassisStyle: getVehicleChassisStyleLabel(vehicle),
    chassisProfile: detectVehicleChassisProfile(vehicle),
    createdAt: now,
    updatedAt: now,
    savedAt: null,
    readOnly: false,
    runLine: track?.runLine || track?.raceLine || track?.line || track?.preferredLine || '',
    chassis: {
      batteryPosition: '',
      motorPosition: '',
      ballast: '',
      notes: '',
    },
    electronics: {
      batteryOrientation: '',
      batteryWeight: '',
      escPosition: '',
      receiverPosition: '',
      servoPosition: '',
      servoMountPosition: '',
      servoMountAngle: '',
      transponderPosition: '',
      fanPosition: '',
      notes: '',
    },
    drivetrain: {
      transmission: '',
      slipper: '',
      slipperPads: '',
      rearHubPosition: '',
      diffType: '',
      diffSetting: '',
      diffFluid: '',
      diffHeight: '',
      internalGears: '',
      planetGears: '',
      frontDiffType: '',
      frontDiffSetting: '',
      frontDiffFluid: '',
      centerDiffType: '',
      centerDiffSetting: '',
      centerDiffFluid: '',
      rearDiffType: '',
      rearDiffSetting: '',
      rearDiffFluid: '',
      rearDiffHeight: '',
      rearDiffGears: '',
      notes: '',
    },
    gearing: {
      spur: '',
      pinion: '',
      tireDiameter: '',
      transmissionRatio: '',
      rollout: '',
      notes: '',
    },
    tires: {
      LF: '',
      RF: '',
      LR: '',
      RR: '',
      compound: createEmptyCornerMap(),
      size: createEmptyCornerMap(),
      camberCut: createEmptyCornerMap(),
      notes: '',
    },
    suspension: {
      springs: createEmptyCornerMap(),
      springPreload: createEmptyCornerMap(),
      springLength: createEmptyCornerMap(),
      outsideShockPosition: createEmptyCornerMap(),
      axleShims: createEmptyCornerMap(),
      centerSpring: '',
      oil: createEmptyCornerMap(),
      centerOil: '',
      damper: createEmptyCornerMap(),
      centerDamper: '',
      shockPosition: createNestedCornerMap(['top', 'bottom']),
      centerShockPosition: {
        front: '',
        rear: '',
        frontChassisPosition: '',
        frontTowerPosition: '',
        rearShims: '',
      },
      centerShockLength: '',
      centerSpringPreload: '',
      rideHeight: createEmptyCornerMap(),
      podHeight: '',
      droop: createEmptyCornerMap(),
      podDroop: '',
      wheelHubKingpinPosition: createNestedCornerMap(['top', 'bottom']),
      notes: '',
    },
    geometry: {
      camber: createEmptyCornerMap(),
      toe: createEmptyCornerMap(),
      caster: {
        LF: '',
        RF: '',
      },
      casterBlockSpacing: {
        LF: '',
        RF: '',
      },
      frontToe: '',
      ackermanAngle: '',
      frontRollCenter: '',
      frontSwayBar: '',
      rearToe: '',
      rearToeBlock: '',
      rearAxleHeight: '',
      antiSquat: '',
      rearRollCenter: '',
      rearSwayBar: '',
      rearSteer: '',
      tPlateRollCenterShim: '',
      tweak: '',
      armLocation: createNestedCornerMap(['upper', 'lower']),
      shockMount: createNestedCornerMap(['upper', 'lower']),
      notes: '',
    },
    cornerWeights: {
      unit: 'grams',
      LF: '',
      RF: '',
      LR: '',
      RR: '',
      totalWeight: '',
      crossWeight: '',
      leftBias: '',
      rightBias: '',
      frontBias: '',
      rearBias: '',
      notes: '',
    },
    results: {
      round: 'Practice',
      fastLap: '',
      avgLap: '',
      totalLaps: '',
      totalTime: '',
      motorTempF: '',
      notes: '',
    },
  };
}


function firstLegacyText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || '';
}

function setIfBlank(target, key, value) {
  if (!target || !key) return;
  if (target[key] !== undefined && target[key] !== null && String(target[key]).trim()) return;
  if (value === undefined || value === null || !String(value).trim()) return;
  target[key] = value;
}

function stripKeys(target, keys) {
  if (!target || typeof target !== 'object') return target;
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(target, key)) delete target[key];
  });
  return target;
}

function makeCornerMapFromLegacy(section = {}, existing = {}, suffixes = [], prefixWords = []) {
  const next = { ...(existing || {}) };
  CORNERS.forEach((corner) => {
    const lower = corner.toLowerCase();
    const candidates = [];
    suffixes.forEach((suffix) => {
      candidates.push(`${lower}${suffix}`);
      candidates.push(`${corner}${suffix}`);
    });
    prefixWords.forEach((prefix) => {
      candidates.push(`${prefix}${corner}`);
      candidates.push(`${prefix}${lower}`);
    });
    setIfBlank(next, corner, firstLegacyText(...candidates.map((key) => section?.[key])));
  });
  return next;
}

function makeNestedCornerMapFromLegacy(section = {}, existing = {}, topCandidates = [], bottomCandidates = []) {
  const next = mergeNestedCorners(createNestedCornerMap(['top', 'bottom']), existing || {});
  CORNERS.forEach((corner) => {
    const lower = corner.toLowerCase();
    const topKeys = [];
    const bottomKeys = [];
    topCandidates.forEach((pattern) => topKeys.push(pattern.replace('{C}', corner).replace('{c}', lower)));
    bottomCandidates.forEach((pattern) => bottomKeys.push(pattern.replace('{C}', corner).replace('{c}', lower)));
    setIfBlank(next[corner], 'top', firstLegacyText(...topKeys.map((key) => section?.[key])));
    setIfBlank(next[corner], 'bottom', firstLegacyText(...bottomKeys.map((key) => section?.[key])));
  });
  return next;
}

function migrateLegacySetupShape(setup = {}) {
  if (!setup || typeof setup !== 'object') return setup;

  const next = { ...setup };
  const gearing = { ...(setup.gearing || {}) };
  setIfBlank(gearing, 'spur', firstLegacyText(gearing.spur, setup.spur, setup.spurGear));
  setIfBlank(gearing, 'pinion', firstLegacyText(gearing.pinion, setup.pinion, setup.pinionGear));
  setIfBlank(gearing, 'tireDiameter', firstLegacyText(gearing.tireDiameter, gearing.tireDia, gearing.tireDiameterIn, gearing.rolloutTireDiameter, setup.tireDiameter, setup.tireDia));
  setIfBlank(gearing, 'transmissionRatio', firstLegacyText(gearing.transmissionRatio, gearing.transRatio, gearing.internalRatio, setup.transmissionRatio, setup.transRatio, setup.internalRatio));
  setIfBlank(gearing, 'rollout', firstLegacyText(gearing.rollout, gearing.rollOut, setup.rollout, setup.rollOut));
  stripKeys(gearing, ['tireDia', 'tireDiameterIn', 'rolloutTireDiameter', 'transRatio', 'internalRatio', 'rollOut']);
  next.gearing = gearing;

  const tires = { ...(setup.tires || {}) };
  CORNERS.forEach((corner) => {
    const lower = corner.toLowerCase();
    setIfBlank(tires, corner, firstLegacyText(tires[corner], tires[lower], setup[`${lower}Tire`], setup[`${corner}Tire`], setup[`tire${corner}`]));
    if (Object.prototype.hasOwnProperty.call(tires, lower)) delete tires[lower];
  });
  const tireLegacySource = { ...setup, ...tires };
  tires.compound = makeCornerMapFromLegacy(
    tireLegacySource,
    tires.compound || tires.tireCompound || {},
    ['TireCompound', 'Compound'],
    ['tireCompound', 'compound']
  );
  tires.size = makeCornerMapFromLegacy(
    tireLegacySource,
    tires.size || tires.tireSize || {},
    ['TireSize', 'Size'],
    ['tireSize', 'size']
  );
  tires.camberCut = makeCornerMapFromLegacy(
    tireLegacySource,
    tires.camberCut || tires.tireCamberCut || {},
    ['CamberCut', 'TireCamberCut'],
    ['camberCut', 'tireCamberCut']
  );

  // Do not copy the normal corner Tire field into Compound by default.
  // PanCar-only conversion happens later after the active chassis profile
  // is known, so SCT/Buggy/other profiles keep their normal Tire field.

  stripKeys(tires, ['tireCompound', 'tireSize', 'tireCamberCut']);
  next.tires = tires;

  const suspension = { ...(setup.suspension || {}) };
  const suspensionLegacySource = { ...setup, ...suspension };
  suspension.springs = makeCornerMapFromLegacy(suspensionLegacySource, suspension.springs, ['Spring'], ['spring']);
  suspension.springPreload = makeCornerMapFromLegacy(suspensionLegacySource, suspension.springPreload, ['SpringPreload', 'Preload'], ['springPreload', 'preload']);
  suspension.springLength = makeCornerMapFromLegacy(suspensionLegacySource, suspension.springLength, ['SpringLength', 'SpringLen', 'ShockOverallLength', 'ShockLengthOverall'], ['springLength', 'springLen', 'shockOverallLength', 'shockLengthOverall']);
  suspension.outsideShockPosition = makeCornerMapFromLegacy(
    suspensionLegacySource,
    suspension.outsideShockPosition,
    ['OutsideShockPosition', 'OutsideShock', 'ShockOutsidePosition', 'ShockOutside'],
    ['outsideShockPosition', 'outsideShock', 'shockOutsidePosition', 'shockOutside']
  );
  suspension.axleShims = makeCornerMapFromLegacy(
    suspensionLegacySource,
    suspension.axleShims,
    ['AxleShims', 'AxleShim', 'RearAxleShims', 'RearAxleShim'],
    ['axleShims', 'axleShim', 'rearAxleShims', 'rearAxleShim']
  );
  suspension.oil = makeCornerMapFromLegacy(suspensionLegacySource, suspension.oil, ['Oil'], ['oil']);
  suspension.damper = makeCornerMapFromLegacy(suspensionLegacySource, suspension.damper, ['Damper', 'Tube', 'Hole'], ['damper', 'tube', 'hole']);
  suspension.rideHeight = makeCornerMapFromLegacy(suspensionLegacySource, suspension.rideHeight, ['Height', 'RideHeight'], ['height', 'rideHeight']);
  suspension.droop = makeCornerMapFromLegacy(suspensionLegacySource, suspension.droop, ['Droop', 'SagDroop', 'Sag'], ['droop', 'sagDroop', 'sag']);
  suspension.shockPosition = makeNestedCornerMapFromLegacy(
    suspension,
    suspension.shockPosition,
    ['{c}Top', '{C}Top', '{c}ShockTop', '{C}ShockTop', 'shockTop{C}', 'shockTop{c}'],
    ['{c}Bottom', '{C}Bottom', '{c}ShockBottom', '{C}ShockBottom', 'shockBottom{C}', 'shockBottom{c}']
  );
  suspension.wheelHubKingpinPosition = makeNestedCornerMapFromLegacy(
    suspension,
    suspension.wheelHubKingpinPosition,
    ['hubTop{C}', 'hubTop{c}', '{c}HubTop', '{C}HubTop', '{c}KingpinTop', '{C}KingpinTop'],
    ['hubBottom{C}', 'hubBottom{c}', '{c}HubBottom', '{C}HubBottom', '{c}KingpinBottom', '{C}KingpinBottom']
  );
  suspension.centerShockPosition = {
    ...(suspension.centerShockPosition || {}),
  };
  setIfBlank(suspension.centerShockPosition, 'front', firstLegacyText(suspension.centerFront, suspension.centerShockFront, suspension.shockCenterFront));
  setIfBlank(suspension.centerShockPosition, 'rear', firstLegacyText(suspension.centerRear, suspension.centerShockRear, suspension.shockCenterRear));
  setIfBlank(
    suspension.centerShockPosition,
    'frontChassisPosition',
    firstLegacyText(
      suspension.centerShockPosition?.frontChassisPosition,
      suspension.centerShockFrontChassisPosition,
      suspension.centerFrontChassisPosition,
      suspension.centerShockPosition?.front,
      suspension.centerShockFront,
      suspension.centerFront
    )
  );
  setIfBlank(
    suspension.centerShockPosition,
    'frontTowerPosition',
    firstLegacyText(
      suspension.centerShockPosition?.frontTowerPosition,
      suspension.centerShockFrontTowerPosition,
      suspension.centerFrontTowerPosition
    )
  );
  setIfBlank(
    suspension.centerShockPosition,
    'rearShims',
    firstLegacyText(
      suspension.centerShockPosition?.rearShims,
      suspension.centerShockRearShims,
      suspension.centerRearShims,
      suspension.rearPodShims,
      suspension.centerShockPosition?.rear,
      suspension.centerShockRear,
      suspension.centerRear
    )
  );
  setIfBlank(suspension, 'centerDamper', firstLegacyText(suspension.centerDamper, suspension.centerHole, suspension.centerTube));
  setIfBlank(suspension, 'centerShockLength', firstLegacyText(suspension.centerShockLength, suspension.shockLength, suspension.centerLength, setup.centerShockLength, setup.shockLength));
  setIfBlank(suspension, 'centerSpringPreload', firstLegacyText(suspension.centerSpringPreload, suspension.centerPreload, setup.centerSpringPreload, setup.centerPreload));
  stripKeys(suspension, [
    'lfSpring', 'rfSpring', 'lrSpring', 'rrSpring', 'LFSpring', 'RFSpring', 'LRSpring', 'RRSpring',
    'lfSpringPreload', 'rfSpringPreload', 'lrSpringPreload', 'rrSpringPreload', 'LFSpringPreload', 'RFSpringPreload', 'LRSpringPreload', 'RRSpringPreload',
    'lfSpringLength', 'rfSpringLength', 'lrSpringLength', 'rrSpringLength', 'LFSpringLength', 'RFSpringLength', 'LRSpringLength', 'RRSpringLength',
    'lfShockOverallLength', 'rfShockOverallLength', 'lrShockOverallLength', 'rrShockOverallLength', 'LFShockOverallLength', 'RFShockOverallLength', 'LRShockOverallLength', 'RRShockOverallLength',
    'lfOutsideShockPosition', 'rfOutsideShockPosition', 'lrOutsideShockPosition', 'rrOutsideShockPosition', 'LFOutsideShockPosition', 'RFOutsideShockPosition', 'LROutsideShockPosition', 'RROutsideShockPosition',
    'lfOil', 'rfOil', 'lrOil', 'rrOil', 'LFOil', 'RFOil', 'LROil', 'RROil',
    'lfDamper', 'rfDamper', 'lrDamper', 'rrDamper', 'LFDamper', 'RFDamper', 'LRDamper', 'RRDamper',
    'lfTube', 'rfTube', 'lrTube', 'rrTube', 'lfHole', 'rfHole', 'lrHole', 'rrHole', 'centerHole', 'centerTube',
    'lfTop', 'rfTop', 'lrTop', 'rrTop', 'lfBottom', 'rfBottom', 'lrBottom', 'rrBottom',
    'lfShockTop', 'rfShockTop', 'lrShockTop', 'rrShockTop', 'lfShockBottom', 'rfShockBottom', 'lrShockBottom', 'rrShockBottom',
    'centerFront', 'centerRear', 'centerShockFront', 'centerShockRear',
    'lfHeight', 'rfHeight', 'lrHeight', 'rrHeight', 'lfRideHeight', 'rfRideHeight', 'lrRideHeight', 'rrRideHeight',
    'lfDroop', 'rfDroop', 'lrDroop', 'rrDroop',
    'hubTopLF', 'hubTopRF', 'hubTopLR', 'hubTopRR', 'hubBottomLF', 'hubBottomRF', 'hubBottomLR', 'hubBottomRR',
    'hubToplf', 'hubToprf', 'hubToplr', 'hubToprr', 'hubBottomlf', 'hubBottomrf', 'hubBottomlr', 'hubBottomrr',
  ]);
  next.suspension = suspension;

  const geometry = { ...(setup.geometry || {}) };
  const geometryLegacySource = { ...setup, ...geometry };
  geometry.camber = makeCornerMapFromLegacy(geometryLegacySource, geometry.camber, ['Camber'], ['camber']);
  geometry.toe = makeCornerMapFromLegacy(geometryLegacySource, geometry.toe, ['Toe'], ['toe']);
  geometry.caster = makeCornerMapFromLegacy(geometryLegacySource, geometry.caster, ['Caster'], ['caster']);
  geometry.casterBlockSpacing = { LF: '', RF: '', ...(geometry.casterBlockSpacing || {}) };
  FRONT_CORNERS.forEach((corner) => {
    const lower = corner.toLowerCase();
    setIfBlank(
      geometry.casterBlockSpacing,
      corner,
      firstLegacyText(
        geometry.casterBlockSpacing?.[corner],
        geometry[`${lower}CasterBlockSpacing`],
        geometry[`${corner}CasterBlockSpacing`],
        geometry[`casterBlockSpacing${corner}`],
        setup[`${lower}CasterBlockSpacing`],
        setup[`casterBlockSpacing${corner}`]
      )
    );
  });
  setIfBlank(
    geometry,
    'tPlateRollCenterShim',
    firstLegacyText(
      geometry.tPlateRollCenterShim,
      geometry.tPlateShim,
      geometry.rollCenterShim,
      geometry.tPlateRollCenter,
      geometry.rearPodRollCenterShim,
      setup.tPlateRollCenterShim,
      setup.tPlateShim,
      setup.rollCenterShim,
      setup.tPlateRollCenter,
      setup.rearPodRollCenterShim
    )
  );
  geometry.armLocation = mergeNestedCorners(createNestedCornerMap(['upper', 'lower']), geometry.armLocation || {});
  geometry.shockMount = mergeNestedCorners(createNestedCornerMap(['upper', 'lower']), geometry.shockMount || {});
  CORNERS.forEach((corner) => {
    const lower = corner.toLowerCase();
    setIfBlank(geometry.armLocation[corner], 'upper', firstLegacyText(geometry[`${lower}ArmUpper`], geometry[`${corner}ArmUpper`], geometry[`armUpper${corner}`]));
    setIfBlank(geometry.armLocation[corner], 'lower', firstLegacyText(geometry[`${lower}ArmLower`], geometry[`${corner}ArmLower`], geometry[`armLower${corner}`]));
    setIfBlank(geometry.shockMount[corner], 'upper', firstLegacyText(geometry[`${lower}ShockMountUpper`], geometry[`${corner}ShockMountUpper`], geometry[`shockMountUpper${corner}`]));
    setIfBlank(geometry.shockMount[corner], 'lower', firstLegacyText(geometry[`${lower}ShockMountLower`], geometry[`${corner}ShockMountLower`], geometry[`shockMountLower${corner}`]));
  });
  stripKeys(geometry, [
    'lfCamber', 'rfCamber', 'lrCamber', 'rrCamber', 'LFCamber', 'RFCamber', 'LRCamber', 'RRCamber',
    'lfToe', 'rfToe', 'lrToe', 'rrToe', 'LFToe', 'RFToe', 'LRToe', 'RRToe',
    'lfCaster', 'rfCaster', 'LFCaster', 'RFCaster',
    'lfCasterBlockSpacing', 'rfCasterBlockSpacing', 'LFCasterBlockSpacing', 'RFCasterBlockSpacing',
    'tPlateRollCenterShim', 'tPlateShim', 'rollCenterShim', 'tPlateRollCenter', 'rearPodRollCenterShim',
    'lfArmUpper', 'rfArmUpper', 'lrArmUpper', 'rrArmUpper', 'lfArmLower', 'rfArmLower', 'lrArmLower', 'rrArmLower',
    'lfShockMountUpper', 'rfShockMountUpper', 'lrShockMountUpper', 'rrShockMountUpper',
    'lfShockMountLower', 'rfShockMountLower', 'lrShockMountLower', 'rrShockMountLower',
  ]);
  next.geometry = geometry;

  const cornerWeights = { ...(setup.cornerWeights || {}) };
  CORNERS.forEach((corner) => {
    const lower = corner.toLowerCase();
    setIfBlank(cornerWeights, corner, firstLegacyText(cornerWeights[corner], cornerWeights[lower], cornerWeights[`${lower}Weight`], cornerWeights[`weight${corner}`], setup[`${lower}Weight`], setup[`weight${corner}`]));
    if (Object.prototype.hasOwnProperty.call(cornerWeights, lower)) delete cornerWeights[lower];
  });
  next.cornerWeights = cornerWeights;

  const chassis = { ...(setup.chassis || {}) };
  const electronics = { ...(setup.electronics || {}) };
  setIfBlank(chassis, 'batteryPosition', firstLegacyText(chassis.batteryPosition, setup.batteryPosition));
  setIfBlank(chassis, 'motorPosition', firstLegacyText(chassis.motorPosition, setup.motorPosition));
  setIfBlank(chassis, 'ballast', firstLegacyText(chassis.ballast, chassis.weight, setup.ballast));
  setIfBlank(electronics, 'batteryOrientation', firstLegacyText(electronics.batteryOrientation, setup.batteryOrientation));
  setIfBlank(electronics, 'batteryWeight', firstLegacyText(electronics.batteryWeight, setup.batteryWeight));
  setIfBlank(electronics, 'escPosition', firstLegacyText(electronics.escPosition, chassis.escPosition, setup.escPosition));
  setIfBlank(electronics, 'receiverPosition', firstLegacyText(electronics.receiverPosition, chassis.receiverPosition, setup.receiverPosition));
  setIfBlank(electronics, 'servoPosition', firstLegacyText(electronics.servoPosition, setup.servoPosition));
  setIfBlank(electronics, 'servoMountPosition', firstLegacyText(electronics.servoMountPosition, setup.servoMountPosition, setup.servoMount));
  setIfBlank(electronics, 'servoMountAngle', firstLegacyText(electronics.servoMountAngle, setup.servoMountAngle, setup.servoAngle));
  setIfBlank(electronics, 'transponderPosition', firstLegacyText(electronics.transponderPosition, setup.transponderPosition));
  setIfBlank(electronics, 'fanPosition', firstLegacyText(electronics.fanPosition, setup.fanPosition));
  stripKeys(chassis, ['escPosition', 'receiverPosition', 'weight']);
  next.chassis = chassis;
  next.electronics = electronics;

  const drivetrain = { ...(setup.drivetrain || {}) };
  setIfBlank(drivetrain, 'rearDiffSetting', firstLegacyText(drivetrain.rearDiffSetting, drivetrain.diffSetting, setup.diffSetting));
  setIfBlank(drivetrain, 'rearDiffFluid', firstLegacyText(drivetrain.rearDiffFluid, drivetrain.diffFluid, setup.diffFluid));
  setIfBlank(drivetrain, 'rearDiffType', firstLegacyText(drivetrain.rearDiffType, drivetrain.diffType, setup.diffType));
  stripKeys(drivetrain, ['diffSetting', 'diffFluid', 'diffType']);
  next.drivetrain = drivetrain;

  return next;
}

export function normalizeSetup(setup, context = {}) {
  const incoming = migrateLegacySetupShape(setup || {});
  const base = createDefaultSetup(context);
  const chassisProfile = detectVehicleChassisProfile(context.vehicle, incoming || base);
  const merged = {
    ...base,
    ...(incoming || {}),
    vehicleChassisStyle: getVehicleChassisStyleLabel(context.vehicle) || incoming?.vehicleChassisStyle || base.vehicleChassisStyle,
    chassisProfile,
    chassis: { ...base.chassis, ...(incoming?.chassis || {}) },
    electronics: { ...base.electronics, ...(incoming?.electronics || {}) },
    drivetrain: { ...base.drivetrain, ...(incoming?.drivetrain || {}) },
    gearing: { ...base.gearing, ...(incoming?.gearing || {}) },
    tires: {
      ...base.tires,
      ...(incoming?.tires || {}),
      compound: { ...base.tires.compound, ...(incoming?.tires?.compound || {}) },
      size: { ...base.tires.size, ...(incoming?.tires?.size || {}) },
      camberCut: { ...base.tires.camberCut, ...(incoming?.tires?.camberCut || {}) },
    },
    suspension: {
      ...base.suspension,
      ...(incoming?.suspension || {}),
      springs: { ...base.suspension.springs, ...(incoming?.suspension?.springs || {}) },
      springPreload: { ...base.suspension.springPreload, ...(incoming?.suspension?.springPreload || {}) },
      springLength: { ...base.suspension.springLength, ...(incoming?.suspension?.springLength || {}) },
      outsideShockPosition: { ...base.suspension.outsideShockPosition, ...(incoming?.suspension?.outsideShockPosition || {}) },
      axleShims: { ...base.suspension.axleShims, ...(incoming?.suspension?.axleShims || {}) },
      oil: { ...base.suspension.oil, ...(incoming?.suspension?.oil || {}) },
      damper: { ...base.suspension.damper, ...(incoming?.suspension?.damper || {}) },
      shockPosition: mergeNestedCorners(base.suspension.shockPosition, incoming?.suspension?.shockPosition),
      centerShockPosition: {
        ...base.suspension.centerShockPosition,
        ...(incoming?.suspension?.centerShockPosition || {}),
      },
      rideHeight: { ...base.suspension.rideHeight, ...(incoming?.suspension?.rideHeight || {}) },
      droop: { ...base.suspension.droop, ...(incoming?.suspension?.droop || {}) },
      wheelHubKingpinPosition: mergeNestedCorners(
        base.suspension.wheelHubKingpinPosition,
        incoming?.suspension?.wheelHubKingpinPosition
      ),
    },
    geometry: {
      ...base.geometry,
      ...(incoming?.geometry || {}),
      camber: { ...base.geometry.camber, ...(incoming?.geometry?.camber || {}) },
      toe: { ...base.geometry.toe, ...(incoming?.geometry?.toe || {}) },
      caster: { ...base.geometry.caster, ...(incoming?.geometry?.caster || {}) },
      casterBlockSpacing: { ...base.geometry.casterBlockSpacing, ...(incoming?.geometry?.casterBlockSpacing || {}) },
      armLocation: mergeNestedCorners(base.geometry.armLocation, incoming?.geometry?.armLocation),
      shockMount: mergeNestedCorners(base.geometry.shockMount, incoming?.geometry?.shockMount),
    },
    cornerWeights: { ...base.cornerWeights, ...(incoming?.cornerWeights || {}) },
    results: { ...base.results, ...(incoming?.results || {}) },
  };

  // Backward compatibility for older setup drafts that stored electronics under chassis.
  merged.electronics.escPosition = merged.electronics.escPosition || incoming?.chassis?.escPosition || '';
  merged.electronics.receiverPosition = merged.electronics.receiverPosition || incoming?.chassis?.receiverPosition || '';

  // Backward compatibility for older setup drafts that used one generic diff field.
  merged.drivetrain.rearDiffSetting = merged.drivetrain.rearDiffSetting || incoming?.drivetrain?.diffSetting || '';
  merged.drivetrain.rearDiffFluid = merged.drivetrain.rearDiffFluid || incoming?.drivetrain?.diffFluid || '';

  // PanCar no longer shows a separate Tire field. Move the older tire value
  // into Compound so existing setup data is not lost when the UI changes.
  if (merged.chassisProfile?.layoutFamily === 'panCar' || merged.chassisProfile?.driveType === 'panCar') {
    CORNERS.forEach((corner) => {
      merged.tires.compound[corner] = merged.tires.compound?.[corner] || merged.tires?.[corner] || '';
      merged.tires[corner] = '';
    });
  }

  merged.runLine = merged.runLine || context.track?.runLine || context.track?.raceLine || context.track?.line || context.track?.preferredLine || '';
  merged.vehicleId = String(merged.vehicleId || context.vehicleId || getEntityId(context.vehicle));
  merged.trackId = String(merged.trackId || context.trackId || getEntityId(context.track));
  merged.vehicleName = merged.vehicleName || getVehicleDisplayName(context.vehicle);
  merged.trackName = merged.trackName || getTrackDisplayName(context.track);
  merged.vehicleChassisStyle = getVehicleChassisStyleLabel(context.vehicle) || merged.vehicleChassisStyle;
  merged.chassisProfile = detectVehicleChassisProfile(context.vehicle, merged);

  return merged;
}

function mergeNestedCorners(base, incoming = {}) {
  return CORNERS.reduce((acc, corner) => {
    acc[corner] = {
      ...(base?.[corner] || {}),
      ...(incoming?.[corner] || {}),
    };
    return acc;
  }, {});
}
