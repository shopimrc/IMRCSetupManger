// Shared alignment templates only.
// Each chassis style still lives in its own profile file and can override any value below.

export const PROFILE_LAYOUTS = {
  panCar: {
    layoutFamily: 'panCar',
    mapTitle: 'Pan Car Setup Map',
    tapHint: 'Tap a wheel, front, rear pod, power, or gearing',
    driveType: 'panCar',
    hasCenterPod: true,
    hasRearToe: false,
    hasFrontDiff: false,
    hasCenterDiff: false,
    hasRearDiff: false,
    showCenterDriveButton: false,
    showCenterDiffSideButton: false,
    frontLabel: 'FRONT',
    rearLabel: 'CENTER / REAR POD',
    frontButtonLabel: 'FRONT',
    rearButtonLabel: 'CENTER / REAR POD',
    centerButtonLabel: 'CENTER / REAR POD',
    centerButtonSub: 'Rear steer • Center shock',
    centerPanelTitle: 'Center / Rear Pod',
    centerPanelHint: 'Rear pod and center shock settings',
    fastCenterTitle: 'Center / Rear Pod',
    fastCenterSubtitle: 'Rear steer / center shock',
    powerButtonLabel: 'POWER / ELEC',
    powerButtonSub: 'Battery • ESC • Servo',
  },

  twoWd: {
    layoutFamily: 'twoWd',
    mapTitle: '2WD Setup Map',
    tapHint: 'Tap a wheel, front, rear, power, or gearing',
    driveType: '2wd',
    hasCenterPod: false,
    hasRearToe: true,
    hasFrontDiff: false,
    hasCenterDiff: false,
    hasRearDiff: true,
    showCenterDriveButton: false,
    showCenterDiffSideButton: false,
    frontLabel: 'FRONT',
    rearLabel: 'REAR',
    frontButtonLabel: 'FRONT',
    rearButtonLabel: 'REAR',
    centerButtonLabel: '',
    centerButtonSub: '',
    centerPanelTitle: 'Rear',
    centerPanelHint: '2WD rear diff, transmission, and slipper',
    fastCenterTitle: 'Rear',
    fastCenterSubtitle: 'Oil / slipper',
    powerButtonLabel: 'POWER / ELEC',
    powerButtonSub: 'Battery • ESC • Servo',
  },

  fourWd: {
    layoutFamily: 'fourWd',
    mapTitle: '4WD Setup Map',
    tapHint: 'Tap a wheel, front, rear, center diff, power, or gearing',
    driveType: '4wd',
    hasCenterPod: false,
    hasRearToe: true,
    hasFrontDiff: true,
    hasCenterDiff: true,
    hasRearDiff: true,
    showCenterDriveButton: false,
    showCenterDiffSideButton: true,
    frontLabel: 'FRONT',
    rearLabel: 'REAR',
    frontButtonLabel: 'FRONT',
    rearButtonLabel: 'REAR',
    centerButtonLabel: 'CENTER DIFF',
    centerButtonSub: 'Center oil • Slipper',
    centerPanelTitle: 'Center Diff / Drivetrain',
    centerPanelHint: 'Center diff, transmission, and slipper',
    fastCenterTitle: 'Center Diff',
    fastCenterSubtitle: 'Center oil / trans',
    powerButtonLabel: 'POWER / ELEC',
    powerButtonSub: 'Battery • ESC • Servo',
  },
};

export const PAN_CAR_LAYOUT = PROFILE_LAYOUTS.panCar;
export const TWO_WD_LAYOUT = PROFILE_LAYOUTS.twoWd;
export const FOUR_WD_LAYOUT = PROFILE_LAYOUTS.fourWd;

// Backward-compatible names for older imports.
export const SCT_2WD_LAYOUT = TWO_WD_LAYOUT;
export const SCT_4WD_LAYOUT = FOUR_WD_LAYOUT;

export function buildChassisProfile(profile) {
  const layoutKey = profile?.layoutKey || profile?.layout || 'twoWd';
  const base = PROFILE_LAYOUTS[layoutKey] || PROFILE_LAYOUTS.twoWd;
  return {
    ...base,
    ...profile,
    layoutKey,
  };
}
