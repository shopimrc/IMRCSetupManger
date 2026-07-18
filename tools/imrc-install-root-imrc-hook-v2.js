#!/usr/bin/env node
/*
  IMRC Setup Manager 2.0
  Installs the .imrc incoming-file hook into the Expo Router root layout.

  Why v2:
  - Supports app/_layout.* and src/app/_layout.*
  - Searches nested _layout files if the root file is not where expected
  - Creates app/_layout.js with <Slot /> only if no layout exists at all
  - Adds backups before editing
*/

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const HOOK_ABS = path.join(root, 'features', 'setups', 'hooks', 'useIncomingIMRC.js');
const LAYOUT_NAMES = ['_layout.tsx', '_layout.jsx', '_layout.js', '_layout.ts'];
const IGNORE_DIRS = new Set(['node_modules', '.expo', '.git', 'android', 'ios', 'dist', 'build', '.next']);

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.writeFileSync(p, s, 'utf8'); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function slash(p) { return p.split(path.sep).join('/'); }

function relImport(fromFile, toFile) {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, toFile).replace(/\\/g, '/');
  rel = rel.replace(/\.jsx?$/, '').replace(/\.tsx?$/, '');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function collectLayouts(startDir, out = []) {
  if (!exists(startDir)) return out;
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      collectLayouts(full, out);
    } else if (LAYOUT_NAMES.includes(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function findBestLayout() {
  const preferred = [];
  for (const base of ['app', path.join('src', 'app')]) {
    for (const name of LAYOUT_NAMES) {
      preferred.push(path.join(root, base, name));
    }
  }
  for (const p of preferred) {
    if (exists(p)) return p;
  }

  const found = [
    ...collectLayouts(path.join(root, 'app')),
    ...collectLayouts(path.join(root, 'src', 'app')),
  ];

  found.sort((a, b) => {
    const ad = slash(path.relative(root, a)).split('/').length;
    const bd = slash(path.relative(root, b)).split('/').length;
    return ad - bd || a.localeCompare(b);
  });

  return found[0] || null;
}

function addHookToLayout(layoutPath) {
  let src = read(layoutPath);
  const importPath = relImport(layoutPath, HOOK_ABS);
  const importLine = `import useIncomingIMRC from '${importPath}';`;

  if (!src.includes('useIncomingIMRC')) {
    // Insert after the last import at the top. If no import exists, put it at the top.
    const importMatches = [...src.matchAll(/^import\s.+?;\s*$/gm)];
    if (importMatches.length) {
      const last = importMatches[importMatches.length - 1];
      const insertAt = last.index + last[0].length;
      src = src.slice(0, insertAt) + `\n${importLine}` + src.slice(insertAt);
    } else {
      src = `${importLine}\n${src}`;
    }
  }

  if (src.includes('useIncomingIMRC();')) {
    write(layoutPath, src);
    return { changed: false, reason: 'hook already present' };
  }

  const patterns = [
    /(export\s+default\s+function\s+[A-Za-z0-9_$]*\s*\([^)]*\)\s*{)/,
    /(export\s+default\s+function\s*\([^)]*\)\s*{)/,
    /(function\s+RootLayout\s*\([^)]*\)\s*{)/,
    /(const\s+RootLayout\s*=\s*\([^)]*\)\s*=>\s*{)/,
    /(const\s+RootLayout\s*=\s*[^=]*=>\s*{)/,
    /(export\s+default\s*\([^)]*\)\s*=>\s*{)/,
    /(export\s+default\s*[^=\n]+=>\s*{)/,
  ];

  for (const re of patterns) {
    const match = src.match(re);
    if (match) {
      const insertAt = match.index + match[0].length;
      src = src.slice(0, insertAt) + `\n  useIncomingIMRC();` + src.slice(insertAt);
      write(layoutPath, src);
      return { changed: true, reason: 'inserted hook call' };
    }
  }

  // Safe fallback: do not guess in unusual layout files.
  write(layoutPath, src);
  throw new Error(
    `Found ${slash(path.relative(root, layoutPath))}, but could not automatically insert useIncomingIMRC().\n` +
    `Open that file and add this inside the root layout component body:\n\n` +
    `  useIncomingIMRC();\n\n` +
    `Also make sure this import exists near the top:\n\n` +
    `  ${importLine}\n`
  );
}

function createRootLayout() {
  const layoutPath = path.join(root, 'app', '_layout.js');
  ensureDir(path.dirname(layoutPath));
  const src = `import { Slot } from 'expo-router';\nimport useIncomingIMRC from '../features/setups/hooks/useIncomingIMRC';\n\nexport default function RootLayout() {\n  useIncomingIMRC();\n\n  return <Slot />;\n}\n`;
  write(layoutPath, src);
  return layoutPath;
}

function updateAppJsonScheme() {
  const appJson = path.join(root, 'app.json');
  if (!exists(appJson)) return 'app.json not found; skipped scheme update';
  try {
    const raw = read(appJson);
    const json = JSON.parse(raw);
    json.expo = json.expo || {};
    if (!json.expo.scheme) {
      json.expo.scheme = 'imrcsetupmanager';
      write(appJson, JSON.stringify(json, null, 2) + '\n');
      return 'added expo.scheme = imrcsetupmanager to app.json';
    }
    return `expo.scheme already set to ${json.expo.scheme}`;
  } catch (err) {
    return `could not edit app.json automatically: ${err.message}`;
  }
}

function main() {
  if (!exists(HOOK_ABS)) {
    console.error('Could not find features/setups/hooks/useIncomingIMRC.js');
    console.error('Drop in the latest Setups .imrc import files first, then run this script again.');
    process.exit(1);
  }

  let layout = findBestLayout();
  let created = false;
  if (!layout) {
    layout = createRootLayout();
    created = true;
    console.log(`Created ${slash(path.relative(root, layout))}`);
  }

  if (!created) {
    const bak = `${layout}.imrc-root-hook.bak`;
    if (!exists(bak)) fs.copyFileSync(layout, bak);
    console.log(`Found layout: ${slash(path.relative(root, layout))}`);
    console.log(`Backup: ${slash(path.relative(root, bak))}`);
  }

  const result = addHookToLayout(layout);
  const schemeResult = updateAppJsonScheme();

  console.log(`Hook result: ${result.reason}`);
  console.log(`Scheme result: ${schemeResult}`);
  console.log('Done. Restart Expo with: npx expo start -c');
}

main();
