import { buildChassisProfile } from './sharedLayouts';

const f1Profile = buildChassisProfile({
  id: 'f1',
  label: 'F1',
  layoutKey: 'twoWd',
  driveType: '2wd',
  match: /formula|\bf1\b/i,
});

export default f1Profile;
