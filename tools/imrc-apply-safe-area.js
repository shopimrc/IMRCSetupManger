#!/usr/bin/env node
/*
  IMRC Setup Manager 2.0 safe-area patch helper.
  Purpose: move Track / Vehicle top Back/Add/Save bars below the phone status bar
  and keep bottom bars above the phone navigation/home indicator.

  Run from project root:
    node tools/imrc-apply-safe-area.js

  The script only scans Track and Vehicle folders. It creates .safearea.bak backups
  before editing any file.
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIRS = [
  'app/vehicles',
  'app/vehicle',
  'app/tracks',
  'app/track',
  'features/vehicles',
  'features/vehicle',
  'features/tracks',
  'features/track',
].map((p) => path.join(ROOT, p));

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (item === 'node_modules' || item.startsWith('.')) continue;
      out.push(...walk(full));
    } else if (EXTENSIONS.has(path.extname(item))) {
      out.push(full);
    }
  }
  return out;
}

function removeFromReactNativeImport(source, name) {
  return source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]react-native['"];?/m, (match, body) => {
    const items = body
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part !== name);

    if (!items.length) return '';
    return `import { ${items.join(', ')} } from 'react-native';`;
  });
}

function ensureSafeAreaImport(source) {
  if (source.includes("from 'react-native-safe-area-context'") || source.includes('from "react-native-safe-area-context"')) {
    return source;
  }
  return source.replace(/(import[\s\S]*?from\s*['"][^'"]+['"];?\s*)/, `$1import { SafeAreaView } from 'react-native-safe-area-context';\n`);
}

function addEdgesProp(source) {
  return source.replace(/<SafeAreaView(?![^>]*\bedges=)([^>]*)>/g, "<SafeAreaView edges={['top', 'bottom']}$1>");
}

function patchFile(file) {
  let source = fs.readFileSync(file, 'utf8');
  if (!source.includes('SafeAreaView')) return false;
  if (!source.includes("from 'react-native'") && !source.includes('from "react-native"')) return false;

  let next = source;
  next = removeFromReactNativeImport(next, 'SafeAreaView');
  next = ensureSafeAreaImport(next);
  next = addEdgesProp(next);

  if (next === source) return false;

  const backup = `${file}.safearea.bak`;
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, source, 'utf8');
  fs.writeFileSync(file, next, 'utf8');
  return true;
}

const files = TARGET_DIRS.flatMap(walk);
const patched = [];
for (const file of files) {
  try {
    if (patchFile(file)) patched.push(path.relative(ROOT, file));
  } catch (error) {
    console.warn(`Skipped ${path.relative(ROOT, file)}: ${error.message}`);
  }
}

if (!patched.length) {
  console.log('No Track/Vehicle SafeAreaView files were patched. This usually means they already use react-native-safe-area-context or the paths differ.');
} else {
  console.log('Patched Track/Vehicle safe areas:');
  patched.forEach((file) => console.log(`- ${file}`));
  console.log('\nBackups were created next to each edited file with .safearea.bak.');
}
