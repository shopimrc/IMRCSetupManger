import { buildChassisProfile } from './sharedLayouts';

const panCarProfile = buildChassisProfile({
  id: 'panCar',
  label: 'Pan Car / Oval',
  layoutKey: 'panCar',
  layoutFamily: 'panCar',
  driveType: 'panCar',
  rearButtonLabel: 'CENTER / REAR POD',
  centerButtonLabel: 'CENTER / REAR POD',
  centerButtonSub: 'Rear steer • shock positions',
  centerPanelTitle: 'Center / Rear Pod',
  panCarFieldsOnly: true,
  frontWheelExtraFields: ['toe', 'camberCut', 'axleShims'],
  rearWheelExtraFields: ['oil', 'outsideShockPosition', 'axleShims'],
  frontPanelFields: ['ackermanAngle', 'frontRollCenter', 'servoMountPosition', 'servoMountAngle'],
  rearPodFields: ['podHeight', 'podDroop', 'rearSteer', 'tPlateRollCenterShim'],
  match: /pan\s*car|pancar|oval\s*pan|oval\s*car|1\/12|12th|world\s*gt|\bwgt\b|crc|associated\s*rc10r5|rc10r5|rc10r6|rc10r6\.2|crc\s*ck/i,
});

export default panCarProfile;
