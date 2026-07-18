import { buildChassisProfile } from './sharedLayouts';

const buggy2wdProfile = buildChassisProfile({
  id: 'buggy2wd',
  label: '2WD Buggy',
  layoutKey: 'twoWd',
  driveType: '2wd',
  match: /2wd\s*buggy|buggy|\bb[0-9]+\b|rc10b|22\s*buggy|xb2|yz-2/i,
});

export default buggy2wdProfile;
