import { readFile } from 'node:fs/promises';
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
  localReferences,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks: Object.fromEntries(checks),
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
