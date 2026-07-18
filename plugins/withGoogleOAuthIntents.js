// plugins/withGoogleOAuthIntents.js
// Adds Google OAuth reverse-client redirect schemes directly to AndroidManifest.
//
// Why this exists:
// Expo's top-level "scheme" may only register the main app scheme. Google OAuth
// on Android needs the reverse-client-id scheme for every signing certificate
// you build with.
//
// Required after adding/changing this plugin:
//   npx expo prebuild --platform android --clean
//
// Confirm with:
//   Select-String -Path .\android\app\src\main\AndroidManifest.xml -Pattern "mdin80047|24gkqa|googleusercontent|imrcsetupmanager"

const { withAndroidManifest } = require("@expo/config-plugins");

const KNOWN_SCHEMES = [
  "imrcsetupmanager",

  // EAS/upload-key direct install builds: SHA-1 06:1A:FC:...
  "com.googleusercontent.apps.839652493357-24gkqa11kk9mtrpb8terrebf2t7nvag0",

  // Local emulator / `npx expo run:android` debug APK: SHA-1 5E:8F:10:...
  "com.googleusercontent.apps.839652493357-mdin80047qhpdmk1tlg8go1hpcp79ijd",

  // Google Play App Signing builds must be added through EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID
  // or EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in the EAS production env.
];

function schemeFromClientId(clientId) {
  if (!clientId || typeof clientId !== "string") return null;
  const trimmed = clientId.trim();
  if (!trimmed.endsWith(".apps.googleusercontent.com")) return null;
  return `com.googleusercontent.apps.${trimmed.replace(".apps.googleusercontent.com", "")}`;
}

function makeOAuthIntentFilter(scheme) {
  return {
    $: {},
    action: [
      {
        $: {
          "android:name": "android.intent.action.VIEW",
        },
      },
    ],
    category: [
      {
        $: {
          "android:name": "android.intent.category.DEFAULT",
        },
      },
      {
        $: {
          "android:name": "android.intent.category.BROWSABLE",
        },
      },
    ],
    data: [
      {
        $: {
          "android:scheme": scheme,
        },
      },
    ],
  };
}

function filterHasScheme(filter, scheme) {
  const data = Array.isArray(filter?.data) ? filter.data : [];
  return data.some((entry) => entry?.$?.["android:scheme"] === scheme);
}

function hasMainLauncherIntent(activity) {
  const filters = Array.isArray(activity?.["intent-filter"]) ? activity["intent-filter"] : [];
  return filters.some((filter) => {
    const actions = Array.isArray(filter.action) ? filter.action : [];
    const categories = Array.isArray(filter.category) ? filter.category : [];
    const hasMain = actions.some((a) => a?.$?.["android:name"] === "android.intent.action.MAIN");
    const hasLauncher = categories.some((c) => c?.$?.["android:name"] === "android.intent.category.LAUNCHER");
    return hasMain && hasLauncher;
  });
}

function findMainActivity(application) {
  const activities = Array.isArray(application?.activity) ? application.activity : [];
  return (
    activities.find((activity) => activity?.$?.["android:name"] === ".MainActivity") ||
    activities.find((activity) => String(activity?.$?.["android:name"] || "").endsWith(".MainActivity")) ||
    activities.find(hasMainLauncherIntent) ||
    activities[0]
  );
}

module.exports = function withGoogleOAuthIntents(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults?.manifest;
    const application = manifest?.application?.[0];
    const mainActivity = findMainActivity(application);

    if (!mainActivity) {
      throw new Error("[withGoogleOAuthIntents] Could not find Android MainActivity.");
    }

    const envClientIds = [
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_ACTIVE_CLIENT_ID,

      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,

      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_DEV_CLIENT_ID,
      process.env.EXPO_PUBLIC_GOOGLE_DEV_ANDROID_CLIENT_ID,
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_LOCAL_CLIENT_ID,
      process.env.EXPO_PUBLIC_GOOGLE_LOCAL_ANDROID_CLIENT_ID,
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_EAS_DEV_CLIENT_ID,

      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID,
      process.env.EXPO_PUBLIC_GOOGLE_PROD_ANDROID_CLIENT_ID,
    ];

    const envSchemes = envClientIds.map(schemeFromClientId).filter(Boolean);
    const schemes = Array.from(new Set([...KNOWN_SCHEMES, ...envSchemes]));

    if (!Array.isArray(mainActivity["intent-filter"])) {
      mainActivity["intent-filter"] = [];
    }

    for (const scheme of schemes) {
      if (!mainActivity["intent-filter"].some((filter) => filterHasScheme(filter, scheme))) {
        mainActivity["intent-filter"].push(makeOAuthIntentFilter(scheme));
      }
    }

    return config;
  });
};
