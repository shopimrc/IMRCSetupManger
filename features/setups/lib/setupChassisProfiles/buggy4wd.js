import { buildChassisProfile } from './sharedLayouts';

const buggy4wdProfile = buildChassisProfile({
  id: 'buggy4wd',
  label: '4WD Buggy',
  layoutKey: 'fourWd',
  driveType: '4wd',
  match: /4wd\s*buggy|4x4\s*buggy|b74|xb4|yz-4|22x-4/i,
});

export default buggy4wdProfile;
