import { buildChassisProfile } from './sharedLayouts';

const touringProfile = buildChassisProfile({
  id: 'touring',
  label: 'Touring / Sedan',
  layoutKey: 'fourWd',
  driveType: '4wd',
  match: /touring|sedan|tc\s|\btc\b|awesomatix|xray\s*t[0-9]|yokomo\s*bd|mugen\s*m-tc/i,
});

export default touringProfile;
