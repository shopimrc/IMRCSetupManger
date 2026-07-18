#!/usr/bin/env node
/*
 * IMRC Setup Manager 2.0
 * Installs .imrc file-open support for Android and makes sure the incoming
 * import hook is mounted once in app/_layout.js.
 *
 * Run from project root:
 *   node tools/imrc-install-file-open-support.js
 *
 * Native intent-filter changes require a rebuilt Android dev client/APK/AAB.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const scheme = 'imrcsetupmanager';
const pluginPath = './plugins/withImrcFileIntents';

function exists(p) {
  return fs.existsSync(p);
}

function backup(filePath) {
  if (!exists(filePath)) return null;
  const backupPath = `${filePath}.bak-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function updateAppJson() {
  const appJsonPath = path.join(root, 'app.json');
  const appConfigJs = path.join(root, 'app.config.js');
  const appConfigTs = path.join(root, 'app.config.ts');

  if (!exists(appJsonPath)) {
    if (exists(appConfigJs) || exists(appConfigTs)) {
      console.warn('Found app.config.js/ts. Add this manually to your expo config:');
      console.warn(`  scheme: '${scheme}',`);
      console.warn(`  plugins: [...existingPlugins, '${pluginPath}']`);
    } else {
      console.warn('No app.json/app.config.js/app.config.ts found. Skipping app config update.');
    }
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  } catch (error) {
    console.warn('Could not parse app.json. Skipping app config update.');
    return;
  }

  parsed.expo = parsed.expo || {};

  const currentScheme = parsed.expo.scheme;
  if (!currentScheme) {
    parsed.expo.scheme = scheme;
  } else if (Array.isArray(currentScheme)) {
    if (!currentScheme.includes(scheme)) parsed.expo.scheme = [scheme, ...currentScheme];
  } else if (typeof currentScheme === 'string' && currentScheme !== scheme) {
    parsed.expo.scheme = [scheme, currentScheme];
  }

  const plugins = Array.isArray(parsed.expo.plugins) ? parsed.expo.plugins : [];
  const hasPlugin = plugins.some((item) => {
    if (typeof item === 'string') return item === pluginPath;
    if (Array.isArray(item)) return item[0] === pluginPath;
    return false;
  });
  if (!hasPlugin) plugins.push(pluginPath);
  parsed.expo.plugins = plugins;

  backup(appJsonPath);
  fs.writeFileSync(appJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log('Updated app.json with IMRC scheme and Android file-open plugin.');
}

function updateRootLayout() {
  const candidates = [
    path.join(root, 'app', '_layout.js'),
    path.join(root, 'app', '_layout.jsx'),
    path.join(root, 'app', '_layout.tsx'),
    path.join(root, 'app', '_layout.ts'),
  ];
  const layoutPath = candidates.find(exists);
  if (!layoutPath) {
    console.warn('No app/_layout file found. Add useIncomingIMRC() manually in your root layout.');
    return;
  }

  let text = fs.readFileSync(layoutPath, 'utf8');
  if (text.includes('useIncomingIMRC')) {
    console.log('OK: app/_layout already references useIncomingIMRC.');
    return;
  }

  const importLine = "import useIncomingIMRC from '../features/setups/hooks/useIncomingIMRC';\n";
  const lastImportMatch = [...text.matchAll(/^import .*?;\s*$/gm)].pop();
  if (lastImportMatch) {
    const insertAt = lastImportMatch.index + lastImportMatch[0].length;
    text = `${text.slice(0, insertAt)}\n${importLine}${text.slice(insertAt)}`;
  } else {
    text = `${importLine}${text}`;
  }

  // Handle common root layout shapes.
  const patterns = [
    /(export\s+default\s+function\s+\w*\s*\([^)]*\)\s*{)/,
    /(function\s+\w*RootLayout\w*\s*\([^)]*\)\s*{)/,
    /(const\s+\w*RootLayout\w*\s*=\s*\([^)]*\)\s*=>\s*{)/,
  ];

  let patched = false;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, `$1\n  useIncomingIMRC();`);
      patched = true;
      break;
    }
  }

  if (!patched) {
    console.warn('Could not safely insert useIncomingIMRC() into app/_layout. Add it manually:');
    console.warn(importLine.trim());
    console.warn('Inside RootLayout(): useIncomingIMRC();');
    return;
  }

  backup(layoutPath);
  fs.writeFileSync(layoutPath, text);
  console.log(`Updated ${path.relative(root, layoutPath)} with useIncomingIMRC().`);
}

updateAppJson();
updateRootLayout();
console.log('\nDone. Important: Android file-open support is native configuration.');
console.log('Rebuild/install the Android dev client or APK/AAB before testing .imrc open-with again.');
console.log('Examples:');
console.log('  npx expo run:android');
console.log('  eas build --profile development --platform android');
console.log('Then restart JS with: npx expo start -c');
