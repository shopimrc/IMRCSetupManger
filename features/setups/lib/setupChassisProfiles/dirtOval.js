import { buildChassisProfile } from './sharedLayouts';

const dirtOvalProfile = buildChassisProfile({
  id: 'dirtOval',
  label: 'Dirt Oval / Sprint',
  layoutKey: 'twoWd',
  driveType: '2wd',
  match: /dirt\s*oval|sprint|late\s*model|modified|mudboss|mud\s*boss/i,
});

export default dirtOvalProfile;
