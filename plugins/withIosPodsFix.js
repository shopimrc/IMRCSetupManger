// plugins/withIosPodsFix.js
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withIosPodsFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let podfile = fs.readFileSync(podfilePath, "utf8");

      // We intentionally DO NOT add: use_modular_headers!
      // (It can break React/RN macro visibility in some RNFirebase pods)

      const nonModularKey = "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES";
      const nonModularMarker = `config.build_settings['${nonModularKey}']`;

      // Pods that CocoaPods warned "do not define modules"
      const needsDefinesModule = [
        "GoogleUtilities",
        "FirebaseAuthInterop",
        "FirebaseAppCheckInterop",
        "RecaptchaInterop",
        "FirebaseFirestoreInternal"
      ];

      const snippet =
        `  # --- IMRC: fixes for RNFirebase + static frameworks ---\n` +
        `  installer.pods_project.targets.each do |target|\n` +
        `    target.build_configurations.each do |config|\n` +
        `      # Allow React headers inside framework modules (RNFBApp etc.)\n` +
        `      config.build_settings['${nonModularKey}'] = 'YES'\n` +
        `\n` +
        `      # Generate module maps only where needed (avoid global modular headers)\n` +
        `      if ${JSON.stringify(needsDefinesModule)}.include?(target.name)\n` +
        `        config.build_settings['DEFINES_MODULE'] = 'YES'\n` +
        `      end\n` +
        `    end\n` +
        `  end\n`;

      if (!podfile.includes(nonModularMarker) && !podfile.includes("IMRC: fixes for RNFirebase")) {
        const postInstallHeader = /post_install do \|installer\|\n/;
        if (postInstallHeader.test(podfile)) {
          podfile = podfile.replace(postInstallHeader, (m) => m + snippet);
        } else {
          podfile += `\n\npost_install do |installer|\n${snippet}end\n`;
        }
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
