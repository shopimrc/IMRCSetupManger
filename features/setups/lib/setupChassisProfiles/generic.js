import { buildChassisProfile } from './sharedLayouts';

const genericProfile = buildChassisProfile({
  id: 'generic',
  label: 'Standard 4-wheel chassis',
  layoutKey: 'twoWd',
  driveType: '2wd',
  match: /.*/i,
});

export default genericProfile;
