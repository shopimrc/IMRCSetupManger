#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const candidates = [
  path.join(root, 'app', '_layout.js'),
  path.join(root, 'app', '_layout.jsx'),
  path.join(root, 'app', '_layout.tsx'),
  path.join(root, 'app', '_layout.ts'),
];

const layoutPath = candidates.find((candidate) => fs.existsSync(candidate));

if (!layoutPath) {
  console.error('Could not find app/_layout.js, app/_layout.jsx, app/_layout.tsx, or app/_layout.ts');
  process.exit(1);
}

let source = fs.readFileSync(layoutPath, 'utf8');
const original = source;

function relativeImportFromLayout() {
  // app/_layout.* is one level under project root.
  return '../features/setups/hooks/useIncomingIMRC';
}

if (!source.includes('useIncomingIMRC')) {
  const importLine = `import useIncomingIMRC from '${relativeImportFromLayout()}';\n`;
  const importMatches = [...source.matchAll(/^import[\s\S]*?;\s*$/gm)];
  if (importMatches.length) {
    const last = importMatches[importMatches.length - 1];
    source = source.slice(0, last.index + last[0].length) + '\n' + importLine + source.slice(last.index + last[0].length);
  } else {
    source = importLine + source;
  }
}

function insertHookIntoFunction(src) {
  if (src.includes('useIncomingIMRC();')) return src;

  const replacements = [
    /(export\s+default\s+function\s+\w*\s*\([^)]*\)\s*{)/,
    /(function\s+RootLayout\s*\([^)]*\)\s*{)/,
    /(const\s+RootLayout\s*=\s*\([^)]*\)\s*=>\s*{)/,
    /(const\s+Layout\s*=\s*\([^)]*\)\s*=>\s*{)/,
  ];

  for (const regex of replacements) {
    if (regex.test(src)) {
      return src.replace(regex, `$1\n  useIncomingIMRC();`);
    }
  }

  return src;
}

source = insertHookIntoFunction(source);

if (!source.includes('useIncomingIMRC();')) {
  console.error('Could not automatically add useIncomingIMRC() to your root layout.');
  console.error('Manually add this inside your default RootLayout component:');
  console.error('  useIncomingIMRC();');
  process.exit(1);
}

if (source !== original) {
  const backupPath = `${layoutPath}.imrc-hook.bak`;
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original);
  fs.writeFileSync(layoutPath, source);
  console.log(`Updated ${path.relative(root, layoutPath)}`);
  console.log(`Backup saved to ${path.relative(root, backupPath)}`);
} else {
  console.log(`${path.relative(root, layoutPath)} already has the IMRC incoming file hook.`);
}
