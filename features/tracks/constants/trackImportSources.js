// features/tracks/constants/trackImportSources.js

export const GITHUB_TRACKS_API_URL =
  'https://api.github.com/repos/shopimrc/IMRCSetupManger/contents/Tracks?ref=main';

export const GITHUB_TRACKS_WEB_URL =
  'https://github.com/shopimrc/IMRCSetupManger/tree/main/Tracks';

export const DEFAULT_TRACK_IMPORT_URL =
  'https://raw.githubusercontent.com/shopimrc/IMRCSetupManger/main/Tracks/Phoenix_RC_Racing_Club.Oval.json';

export function toRawGithubUrl(url = '') {
  const cleanUrl = String(url || '').trim();

  if (!cleanUrl) return '';

  if (cleanUrl.includes('raw.githubusercontent.com')) {
    return cleanUrl;
  }

  if (cleanUrl.includes('github.com') && cleanUrl.includes('/blob/')) {
    return cleanUrl
      .replace('https://github.com/', 'https://raw.githubusercontent.com/')
      .replace('/blob/', '/');
  }

  return cleanUrl;
}
