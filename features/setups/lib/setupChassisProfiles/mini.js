import { buildChassisProfile } from './sharedLayouts';

const miniProfile = buildChassisProfile({
  id: 'mini',
  label: 'Mini / Small Scale',
  layoutKey: 'twoWd',
  driveType: '2wd',
  match: /mini|micro|1\/16|1\/18|1\/24|grom/i,
});

export default miniProfile;
