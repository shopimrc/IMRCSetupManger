import { buildChassisProfile } from './sharedLayouts';

const crawlerProfile = buildChassisProfile({
  id: 'crawler',
  label: 'Crawler / Trail',
  layoutKey: 'fourWd',
  driveType: '4wd',
  match: /crawler|trail|scx|trx-4|capra|comp\s*crawler/i,
});

export default crawlerProfile;
