#!/usr/bin/env node
/*
 * IMRC Setup Manager 2.0 helper
 * Fixes Expo Router warning caused by app/services/sync.js being treated as a route
 * and ensures app.json has the preferred app URI scheme.
 *
 * Run from project root:
 *   node tools/imrc-fix-sync-route-and-scheme.js
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appSyncPath = path.join(root, 'app', 'services', 'sync.js');
const servicesDir = path.join(root, 'services');
const newSyncPath = path.join(servicesDir, 'sync.js');
const scheme = 'imrcsetupmanager';

function exists(p) {
  return fs.existsSync(p);
}

function backupFile(filePath) {
  if (!exists(filePath)) return null;
  const backupPath = `${filePath}.bak-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function walkFiles(dir, out = []) {
  if (!exists(dir)) return out;
  const ignored = new Set(['node_modules', '.git', '.expo', 'android', 'ios', 'dist', 'build']);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function updateImportText(text) {
  let next = text;

  // Alias/root style imports.
  next = next.replace(/(['"])@\/app\/services\/sync\1/g, '$1@/services/sync$1');
  next = next.replace(/(['"])app\/services\/sync\1/g, '$1services/sync$1');

  // Any explicit path segment containing app/services/sync.
  next = next.replace(/(['"])([^'"]*?)app\/services\/sync\1/g, (_m, quote, prefix) => `${quote}${prefix}services/sync${quote}`);

  return next;
}

function moveSyncService() {
  if (!exists(appSyncPath)) {
    console.log('OK: app/services/sync.js was not found. Nothing to move.');
    return;
  }

  fs.mkdirSync(servicesDir, { recursive: true });

  const backup = backupFile(appSyncPath);
  if (exists(newSyncPath)) {
    const existing = fs.readFileSync(newSyncPath, 'utf8');
    const incoming = fs.readFileSync(appSyncPath, 'utf8');
    if (existing !== incoming) {
      const preserved = path.join(servicesDir, `sync.from-app-services-${Date.now()}.js`);
      fs.writeFileSync(preserved, incoming);
      console.warn(`services/sync.js already exists. Preserved app/services/sync.js copy at ${path.relative(root, preserved)}`);
    }
  } else {
    fs.copyFileSync(appSyncPath, newSyncPath);
    console.log('Moved logic copy to services/sync.js');
  }

  fs.unlinkSync(appSyncPath);
  console.log(`Removed route file app/services/sync.js. Backup: ${path.relative(root, backup)}`);

  // Remove app/services folder if empty.
  const appServicesDir = path.dirname(appSyncPath);
  try {
    if (exists(appServicesDir) && fs.readdirSync(appServicesDir).length === 0) fs.rmdirSync(appServicesDir);
  } catch {}

  const files = walkFiles(root);
  let updatedCount = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = updateImportText(before);
    if (after !== before) {
      backupFile(file);
      fs.writeFileSync(file, after);
      updatedCount += 1;
      console.log(`Updated import path: ${path.relative(root, file)}`);
    }
  }

  console.log(`Import scan complete. Updated ${updatedCount} file(s).`);
  console.log('If any code imported sync.js using a relative path to app/services/sync, update it to services/sync.js.');
}

function updateAppJsonScheme() {
  const appJson = path.join(root, 'app.json');
  const appConfigJs = path.join(root, 'app.config.js');
  const appConfigTs = path.join(root, 'app.config.ts');

  if (exists(appJson)) {
    const raw = fs.readFileSync(appJson, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn('Could not parse app.json. Skipping scheme update.');
      return;
    }
    parsed.expo = parsed.expo || {};
    const current = parsed.expo.scheme;
    let changed = false;
    if (!current) {
      parsed.expo.scheme = scheme;
      changed = true;
    } else if (Array.isArray(current) && !current.includes(scheme)) {
      parsed.expo.scheme = [scheme, ...current];
      changed = true;
    } else if (typeof current === 'string' && current !== scheme) {
      parsed.expo.scheme = [scheme, current];
      changed = true;
    }

    if (changed) {
      backupFile(appJson);
      fs.writeFileSync(appJson, `${JSON.stringify(parsed, null, 2)}\n`);
      console.log(`Updated app.json expo.scheme with ${scheme}`);
    } else {
      console.log(`OK: app.json already includes scheme ${scheme}`);
    }
    return;
  }

  if (exists(appConfigJs) || exists(appConfigTs)) {
    console.warn(`Found app.config file. Please make sure it includes: expo.scheme = '${scheme}'`);
    return;
  }

  console.warn('No app.json/app.config.js/app.config.ts found. Skipping scheme update.');
}

moveSyncService();
updateAppJsonScheme();
console.log('Done. Restart Expo with: npx expo start -c');
