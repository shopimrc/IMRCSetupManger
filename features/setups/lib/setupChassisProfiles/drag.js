import { buildChassisProfile } from './sharedLayouts';

const dragProfile = buildChassisProfile({
  id: 'drag',
  label: 'Drag / No Prep',
  layoutKey: 'twoWd',
  driveType: '2wd',
  match: /drag|no\s*prep|street\s*outlaw/i,
});

export default dragProfile;
