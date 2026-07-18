import panCar from './panCar';
import sct2wd from './sct2wd';
import sct4wd from './sct4wd';
import buggy2wd from './buggy2wd';
import buggy4wd from './buggy4wd';
import touring from './touring';
import f1 from './f1';
import drag from './drag';
import dirtOval from './dirtOval';
import mini from './mini';
import monsterTruck from './monsterTruck';
import crawler from './crawler';
import generic from './generic';

export const CHASSIS_PROFILES = {
  panCar,
  sct2wd,
  sct4wd,
  buggy2wd,
  buggy4wd,
  touring,
  f1,
  drag,
  dirtOval,
  mini,
  monsterTruck,
  crawler,
  generic,
};

export const CHASSIS_PROFILE_ORDER = [
  'panCar',
  'sct4wd',
  'sct2wd',
  'buggy4wd',
  'buggy2wd',
  'touring',
  'crawler',
  'monsterTruck',
  'f1',
  'drag',
  'dirtOval',
  'mini',
  'generic',
];

export function getChassisProfileById(id) {
  return CHASSIS_PROFILES[id] || null;
}

export function matchChassisProfile(text = '') {
  const cleanText = String(text || '').toLowerCase();
  const profileId = CHASSIS_PROFILE_ORDER.find((id) => CHASSIS_PROFILES[id]?.match?.test(cleanText));
  return CHASSIS_PROFILES[profileId] || CHASSIS_PROFILES.generic;
}
