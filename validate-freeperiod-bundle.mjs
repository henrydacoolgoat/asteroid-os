import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(projectDirectory, 'index.html'), 'utf8');
const bundleMatch = source.match(/const FREE_PERIOD_HTML_BASE64='([A-Za-z0-9+/=]+)'/);

if (!bundleMatch) {
  throw new Error('Asteroid OS does not contain the FreePeriod base64 document.');
}

const encoded = bundleMatch[1];
const decodedBytes = Buffer.from(encoded, 'base64');
const html = decodedBytes.toString('utf8');
const roundTrip = decodedBytes.equals(Buffer.from(html, 'utf8'));
const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
const manifestMatch = html.match(/const FREE_PERIOD_GAME_NAMES = Object\.freeze\((\[[\s\S]*?\])\);/);
const gameNames = manifestMatch ? JSON.parse(manifestMatch[1]) : [];
const startupFunction = html.match(/async function initZipButtons\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
const primeCoversFunction = html.match(/function primeFallbackGameCovers\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
const coverDirectory = path.join(projectDirectory, 'freeperiod-covers');
const expectedCoverFiles = gameNames.map(name => {
  const stem = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
  return `${stem}.jpg`;
});
const bundledCoverFiles = await readdir(coverDirectory).catch(() => []);
const coverResults = await Promise.all(expectedCoverFiles.map(async fileName => {
  try {
    const bytes = await readFile(path.join(coverDirectory, fileName));
    return {
      fileName,
      bytes: bytes.length,
      jpeg: bytes.length > 4_000 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    };
  } catch {
    return { fileName, bytes: 0, jpeg: false };
  }
}));
const missingCoverFiles = coverResults.filter(result => result.bytes === 0).map(result => result.fileName);
const invalidCoverFiles = coverResults.filter(result => result.bytes > 0 && !result.jpeg).map(result => result.fileName);
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let executableScripts = 0;
let scriptNumber = 0;
let match;

while ((match = scriptPattern.exec(html))) {
  scriptNumber += 1;
  const attributes = match[1];
  const body = match[2];
  if (/\bsrc\s*=/i.test(attributes)) continue;
  const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() || '';
  if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) continue;
  if (type === 'module') {
    if (typeof vm.SourceTextModule !== 'function') {
      throw new Error('This Node runtime cannot validate FreePeriod module scripts.');
    }
    new vm.SourceTextModule(body, { identifier: `FreePeriod:script-${scriptNumber}` });
  } else {
    new vm.Script(body, { filename: `FreePeriod:script-${scriptNumber}` });
  }
  executableScripts += 1;
}

const localReferences = [];
const assetTagPattern = /<(?:script|img|link|iframe|source|audio|video)\b[^>]*>/gi;
while ((match = assetTagPattern.exec(html))) {
  const tag = match[0];
  const attributePattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let attributeMatch;
  while ((attributeMatch = attributePattern.exec(tag))) {
    const reference = attributeMatch[1].trim();
    if (!reference || /^(?:data:|https?:|mailto:|tel:|javascript:|about:|blob:|#)/i.test(reference)) continue;
    localReferences.push(reference);
  }
}

const cssUrlPattern = /\burl\(\s*["']?([^"')]+)["']?\s*\)/gi;
while ((match = cssUrlPattern.exec(html))) {
  const reference = match[1].trim();
  if (!reference || /[+{}$]/.test(reference)
      || /^(?:data:|https?:|mailto:|tel:|javascript:|about:|blob:|#)/i.test(reference)) continue;
  localReferences.push(reference);
}

const checks = [
  ['base64 bytes decode as lossless UTF-8', roundTrip],
  ['decoded FreePeriod document is substantial', decodedBytes.length > 100_000],
  ['decoded document starts with an HTML doctype', /^\s*<!doctype html>/i.test(html)],
  ['decoded document title is FreePeriod', title === 'FreePeriod'],
  ['decoded document contains the FreePeriod application', /\bFreePeriod\b/.test(html)],
  ['full FreePeriod manifest contains exactly 300 games', gameNames.length === 300],
  ['full FreePeriod manifest has 300 unique game names', new Set(gameNames).size === 300],
  ['all catalog entries are standalone HTML games', gameNames.every(name => /\.html?$/i.test(name))],
  ['catalog uses the maintained 300-game raw source', html.includes("const FREE_PERIOD_RAW_BASE = 'https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/';")],
  ['startup renders the complete manifest without downloading ZIP packs', startupFunction.includes('loadBuiltInGameCatalog();') && !startupFunction.includes('loadZip(') && !startupFunction.includes('canvas.instructure.com')],
  ['catalog downloads only a selected game on demand', html.includes("await fetch(sourceUrl, { cache: 'force-cache', credentials: 'omit' })")],
  ['rejected six-game fallback is not bundled', !source.includes('freeperiod-games/') && !html.includes('FREE_PERIOD_STARTER_GAMES')],
  ['FreePeriod uses its complete bundled cover set at startup', startupFunction.includes('primeFallbackGameCovers();') && !startupFunction.includes('restoreOriginalGameCovers();') && primeCoversFunction.includes('FREE_PERIOD_LOCAL_COVER_BASE + freePeriodLocalCoverName(gameName)')],
  ['all 300 game names map to unique local cover filenames', expectedCoverFiles.length === 300 && new Set(expectedCoverFiles).size === 300],
  ['the bundled cover directory contains exactly 300 JPEG files', bundledCoverFiles.length === 300 && bundledCoverFiles.every(fileName => /\.jpg$/i.test(fileName))],
  ['every catalog game has a bundled cover file', missingCoverFiles.length === 0],
  ['every bundled cover is a nontrivial JPEG image', invalidCoverFiles.length === 0],
  ['game frames request eager high-priority loading', html.includes('iframe.loading = "eager";') && html.includes('iframe.setAttribute("fetchpriority", "high")')],
  ['game frames receive fullscreen, audio, and gamepad permissions', html.includes('autoplay; fullscreen; gamepad') && html.includes('iframe.setAttribute("allowfullscreen", "")')],
  ['WebGL games request the high-performance GPU path without changing 2D contexts', html.includes('attributes.powerPreference="high-performance"') && html.includes('attributes.desynchronized=true') && html.includes('return originalGetContext.call(this,type,options);')],
  ['launched games expose the Asteroid high-performance marker', html.includes('window.__asteroidHighPerformanceGameMode=true') && html.includes('data-asteroid-performance')],
  ['FreePeriod exits fullscreen before returning to its catalog', /backButton\.onclick\s*=\s*async\s*\(\)\s*=>[\s\S]{0,420}doc\.exitFullscreen/.test(html)],
  ['Asteroid OS restores its dock and chrome after fullscreen exits', source.includes('restoreAsteroidChromeAfterFullscreen') && source.includes("document.addEventListener('fullscreenchange',handleAsteroidFullscreenChange)")],
  ['all inline executable scripts pass Node syntax validation', executableScripts > 0],
  ['FreePeriod has no missing local file dependencies', localReferences.length === 0],
  ['Asteroid OS exposes the FreePeriod decoder', source.includes('function getFreePeriodHTML()')],
  ['Asteroid OS mounts FreePeriod with iframe srcdoc', source.includes('frame.srcdoc=getFreePeriodHTML();')],
  ['Asteroid OS registers the FreePeriod application', /id:\s*['"]freeperiod['"]/i.test(source)],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  ok: failures.length === 0,
  title,
  encodedCharacters: encoded.length,
  decodedBytes: decodedBytes.length,
  executableScripts,
  manifestGames: gameNames.length,
  bundledCovers: bundledCoverFiles.length,
  missingCoverFiles,
  invalidCoverFiles,
  localReferences,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks: Object.fromEntries(checks),
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
