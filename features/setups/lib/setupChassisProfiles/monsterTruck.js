import { buildChassisProfile } from './sharedLayouts';

const monsterTruckProfile = buildChassisProfile({
  id: 'monsterTruck',
  label: 'Monster Truck',
  layoutKey: 'fourWd',
  driveType: '4wd',
  match: /monster\s*truck|mt10|granite|stampede|maxx/i,
});

export default monsterTruckProfile;
