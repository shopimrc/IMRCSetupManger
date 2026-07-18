// plugins/withNonModularHeaders.js
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Ensures Firebase and related pods use modular headers.
 * This fixes build failures like:
 *   "Include of non-modular header inside framework module"
 *
 * Compatible with Expo SDK 50–54+
 */
module.exports = function withNonModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const podfilePath = path.join(iosRoot, "Podfile");

      if (!fs.existsSync(podfilePath)) {
        console.warn("[withNonModularHeaders] Podfile not found, skipping.");
        return config;
      }

      let podfile = fs.readFileSync(podfilePath, "utf8");

      // Ensure use_frameworks! uses static linkage (required for Firebase)
      if (!podfile.includes("use_frameworks! :linkage => :static")) {
        podfile = podfile.replace(
          /use_frameworks!.*$/m,
          "use_frameworks! :linkage => :static"
        );
      }

      // Ensure modular headers enabled globally if not already present
      if (!podfile.includes(":modular_headers => true")) {
        podfile = podfile.replace(
          /target ['"][^'"]+['"] do/,
          (match) => `${match}\n  use_modular_headers!`
        );
      }

      fs.writeFileSync(podfilePath, podfile);

      console.log("[withNonModularHeaders] Applied modular headers fix.");

      return config;
    },
  ]);
};