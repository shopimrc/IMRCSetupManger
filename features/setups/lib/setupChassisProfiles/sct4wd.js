import { buildChassisProfile } from './sharedLayouts';

const sct4wdProfile = buildChassisProfile({
  id: 'sct4wd',
  label: '1/10 4WD SCT',
  layoutKey: 'fourWd',
  driveType: '4wd',
  match: /4wd\s*sct|4wd\s*short\s*course|4x4\s*slash|slash\s*4x4/i,
});

export default sct4wdProfile;
