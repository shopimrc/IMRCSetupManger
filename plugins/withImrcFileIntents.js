const { withAndroidManifest } = require('@expo/config-plugins');

const MARKER_LABEL = 'IMRC Setup File';
const APP_SCHEME = 'imrcsetupmanager';

function getMainActivity(androidManifest) {
  const application = androidManifest?.manifest?.application?.[0];
  const activities = application?.activity || [];

  return activities.find((activity) => {
    const filters = activity['intent-filter'] || [];
    return filters.some((filter) => {
      const actions = filter.action || [];
      const categories = filter.category || [];
      return actions.some((action) => action?.$?.['android:name'] === 'android.intent.action.MAIN')
        && categories.some((category) => category?.$?.['android:name'] === 'android.intent.category.LAUNCHER');
    });
  }) || activities.find((activity) => String(activity?.$?.['android:name'] || '').includes('MainActivity'));
}

function action(name) {
  return [{ $: { 'android:name': name } }];
}

function categories(items) {
  return items.map((name) => ({ $: { 'android:name': name } }));
}

function data(attrs) {
  return [{ $: attrs }];
}

function viewFileFilter(attrs) {
  return {
    $: { 'android:label': MARKER_LABEL },
    action: action('android.intent.action.VIEW'),
    category: categories([
      'android.intent.category.DEFAULT',
      'android.intent.category.BROWSABLE',
    ]),
    data: data(attrs),
  };
}

function viewSchemeFilter() {
  return {
    $: { 'android:label': MARKER_LABEL },
    action: action('android.intent.action.VIEW'),
    category: categories([
      'android.intent.category.DEFAULT',
      'android.intent.category.BROWSABLE',
    ]),
    data: data({ 'android:scheme': APP_SCHEME }),
  };
}

function isImrcFilter(filter) {
  if (filter?.$?.['android:label'] === MARKER_LABEL) return true;

  const dataItems = filter?.data || [];
  return dataItems.some((item) => {
    const attrs = item?.$ || {};
    return attrs['android:scheme'] === APP_SCHEME
      || String(attrs['android:mimeType'] || '').toLowerCase().includes('imrc');
  });
}

function buildImrcIntentFilters() {
  const mimeTypes = [
    'application/x-imrc',
    'application/imrc',
    'application/octet-stream',
    'application/json',
    'text/plain',
  ];

  const filters = [viewSchemeFilter()];

  // Most Android file managers open unknown extensions as application/octet-stream
  // or text/plain/json depending on where the file came from. These filters make
  // the app available for .imrc open-with flows. The JavaScript import code still
  // validates the file contents before importing.
  for (const mimeType of mimeTypes) {
    filters.push(viewFileFilter({ 'android:mimeType': mimeType }));
    filters.push(viewFileFilter({ 'android:scheme': 'content', 'android:mimeType': mimeType }));
    filters.push(viewFileFilter({ 'android:scheme': 'file', 'android:mimeType': mimeType }));
  }

  return filters;
}

module.exports = function withImrcFileIntents(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults;
    const mainActivity = getMainActivity(manifest);

    if (!mainActivity) {
      throw new Error('withImrcFileIntents could not find MainActivity in AndroidManifest.xml');
    }

    const existing = mainActivity['intent-filter'] || [];
    const cleaned = existing.filter((filter) => !isImrcFilter(filter));
    mainActivity['intent-filter'] = [...cleaned, ...buildImrcIntentFilters()];

    return modConfig;
  });
};
