import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const browserDirectory = path.join(projectDirectory, 'asteroid-browser');
const expectedFiles = [
  'app.mjs',
  'background-research.html',
  'browser-icon.png',
  'config.js',
  'controller/controller.api.js',
  'controller/controller.inject.js',
  'controller/controller.sw.js',
  'index.html',
  'LICENSE-AGPL-3.0.txt',
  'PROXY-FIXES.md',
  'README.md',
  'scramjet/scramjet_bundled.js',
  'scramjet/scramjet.js',
  'scramjet/scramjet.wasm',
  'SHA256SUMS.txt',
  'sw.js',
  'THIRD-PARTY-NOTICES.md',
  'transport/epoxy.mjs',
  'transport/libcurl.js',
];

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

let actualFiles = [];
try {
  actualFiles = (await collectFiles(browserDirectory)).sort();
} catch (error) {
  throw new Error(`The Asteroid Browser bundle is unavailable at ${browserDirectory}`, { cause: error });
}

const missingFiles = expectedFiles.filter((file) => !actualFiles.includes(file));
const emptyFiles = [];
for (const relative of expectedFiles.filter((file) => actualFiles.includes(file))) {
  if ((await stat(path.join(browserDirectory, ...relative.split('/')))).size === 0) emptyFiles.push(relative);
}

const checksumText = missingFiles.includes('SHA256SUMS.txt')
  ? ''
  : await readFile(path.join(browserDirectory, 'SHA256SUMS.txt'), 'utf8');
const checksumEntries = new Map();
for (const line of checksumText.split(/\r?\n/)) {
  const checksum = line.match(/^([a-f0-9]{64})\s+\*?(.+?)\s*$/i);
  if (checksum) checksumEntries.set(checksum[2].replaceAll('\\', '/'), checksum[1].toLowerCase());
}

const checksumFailures = [];
for (const [relative, expected] of checksumEntries) {
  if (relative === 'SHA256SUMS.txt') continue;
  if (!actualFiles.includes(relative)) {
    checksumFailures.push(`${relative}: missing`);
    continue;
  }
  const actual = await sha256(path.join(browserDirectory, ...relative.split('/')));
  if (actual !== expected) checksumFailures.push(`${relative}: checksum mismatch`);
}

const index = missingFiles.includes('index.html') ? '' : await readFile(path.join(browserDirectory, 'index.html'), 'utf8');
const serviceWorker = missingFiles.includes('sw.js') ? '' : await readFile(path.join(browserDirectory, 'sw.js'), 'utf8');
const config = missingFiles.includes('config.js') ? '' : await readFile(path.join(browserDirectory, 'config.js'), 'utf8');
const app = missingFiles.includes('app.mjs') ? '' : await readFile(path.join(browserDirectory, 'app.mjs'), 'utf8');
const backgroundResearch = missingFiles.includes('background-research.html')
  ? ''
  : await readFile(path.join(browserDirectory, 'background-research.html'), 'utf8');
const combined = `${index}\n${serviceWorker}\n${config}\n${app}`;
const userFacingBrowserSource = `${index}\n${config}\n${app}\n${backgroundResearch}`;
const legacyBrandMatches = [...userFacingBrowserSource.matchAll(/\u0073\u006d\u0065\u006c\u006c\u0079\s*\u0070\u0072\u006f\u0078\u0079/gi)].map((match) => match[0]);
const pageRootAssetReferences = [...combined.matchAll(/(?:src|href|importScripts\(|register\(|new URL\()\s*["']\/(?!\/)([^"')]+)/gi)]
  .map((entry) => `/${entry[1]}`);

const requiredRuntimeReferences = [
  'app.mjs',
  'sw.js',
  'controller/controller.api.js',
  'controller/controller.inject.js',
  'controller/controller.sw.js',
  'scramjet/scramjet_bundled.js',
  'scramjet/scramjet.js',
  'scramjet/scramjet.wasm',
  'transport/epoxy.mjs',
  'transport/libcurl.js',
];
const unreferencedRuntimeFiles = requiredRuntimeReferences.filter((file) => !combined.includes(file));

const checks = [
  ['all 19 original Asteroid Browser files are present', missingFiles.length === 0],
  ['all required browser files contain data', emptyFiles.length === 0],
  ['browser checksum manifest is populated', checksumEntries.size > 0],
  ['browser files match the supplied checksum manifest', checksumFailures.length === 0],
  ['all proxy runtime files are wired into the browser', unreferencedRuntimeFiles.length === 0],
  ['browser assets are safe under a GitHub Pages project path', pageRootAssetReferences.length === 0],
  ['browser accepts the Asteroid access handoff', /asteroid-access/.test(userFacingBrowserSource)],
  ['browser registers a service worker', /serviceWorker\.register/.test(combined)],
  ['browser config includes a secure Wisp transport', /wss:\/\//i.test(config)],
  ['browser is visibly branded as Asteroid Browser', /<title>\s*Asteroid Browser\s*<\/title>/i.test(index) && /pageTitle\s*:\s*["']Asteroid Browser["']/i.test(config)],
  ['legacy proxy branding is absent from user-facing browser code', legacyBrandMatches.length === 0],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  ok: failures.length === 0,
  browserDirectory,
  expectedFiles: expectedFiles.length,
  actualFiles: actualFiles.length,
  missingFiles,
  emptyFiles,
  checksumEntries: checksumEntries.size,
  checksumFailures,
  unreferencedRuntimeFiles,
  pageRootAssetReferences,
  legacyBrandMatches,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks: Object.fromEntries(checks),
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
