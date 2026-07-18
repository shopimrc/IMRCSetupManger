import { buildChassisProfile } from './sharedLayouts';

const sct2wdProfile = buildChassisProfile({
  id: 'sct2wd',
  label: '1/10 2WD SCT',
  layoutKey: 'twoWd',
  driveType: '2wd',
  match: /slash|short\s*course|\bsct\b|sc\s*truck|2wd\s*truck|2wd\s*sct|stadium\s*truck|trophy\s*truck/i,
});

export default sct2wdProfile;
