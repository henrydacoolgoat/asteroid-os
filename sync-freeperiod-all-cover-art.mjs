import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'freeperiod-cover-manifest.json');
const indexPath = path.join(root, 'index.html');
const coversDir = path.join(root, 'freeperiod-covers');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const repositories = [
  ['FrenchHelp/Games', 'main'],
  ['Darkdragonzxs/ZXS-games', 'main'],
  ['a456pur/seraph', 'main'],
  ['selenite-cc/selenite-old', 'main'],
  ['3kh0/3kh0-lite', 'main'],
  ['bubbls/UGS-Assets', 'main'],
  ['StickManM/cyan-assets2', 'main'],
  ['MSTC-DA-IICT/Hacktoberfest24-candy-crush_HTML_CSS_JS', 'main'],
];

const explicitAssets = {
  '1on1tennis.html': ['FrenchHelp/Games', 'main', 'icons/cl1v1tennis.png'],
  '3Dflightsimulator.html': ['FrenchHelp/Games', 'main', 'icons/clrealflightsim.png'],
  '8ballclassic.html': ['FrenchHelp/Games', 'main', 'icons/cl8ballpool.png'],
  'candycrush.html': ['MSTC-DA-IICT/Hacktoberfest24-candy-crush_HTML_CSS_JS', 'main', 'Images/CandyCrush.png'],
  'cleanupio.html': ['FrenchHelp/Games', 'main', 'icons/clcleanupio.png'],
  'crazycrashlanding.html': ['FrenchHelp/Games', 'main', 'icons/clcarcrash3.png'],
  'geometryvibes.html': ['FrenchHelp/Games', 'main', 'icons/clgeometrydashlite.png'],
  'highwaytraffic.html': ['FrenchHelp/Games', 'main', 'icons/clhighwaytraffic3d.png'],
  'ovo3dimensions.html': ['FrenchHelp/Games', 'main', 'icons/clovodimensions.png'],
  'sm63.html': ['FrenchHelp/Games', 'main', 'icons/clsupermario63.png'],
  'wartheknights.html': ['FrenchHelp/Games', 'main', 'icons/clwartheknight.png'],
  'wordleunlimited.html': ['FrenchHelp/Games', 'main', 'icons/clwordle.png'],
};

const normalizeGame = value => String(value)
  .replace(/\.(html?|png|jpe?g|webp)$/i, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const normalizeAssetPart = value => normalizeGame(value).replace(/^cl/, '');

function rawUrl(repository, branch, assetPath) {
  return `https://raw.githubusercontent.com/${repository}/${branch}/${assetPath.split('/').map(encodeURIComponent).join('/')}`;
}

function outputName(game, extension) {
  const safe = game.replace(/\.html?$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'game'}.${extension.toLowerCase() === 'jpeg' ? 'jpg' : extension.toLowerCase()}`;
}

function extensionOf(assetPath) {
  const match = assetPath.match(/\.(png|jpe?g|webp)$/i);
  if (!match) throw new Error(`Unsupported cover image: ${assetPath}`);
  return match[1];
}

function isImage(bytes) {
  return (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || bytes.subarray(0, 4).toString('ascii') === 'RIFF';
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Asteroid-OS-FreePeriod-cover-sync' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const pending = Object.entries(manifest.games).filter(([, entry]) => !entry.file || entry.type === 'freeperiod-title-card');
const assets = [];
if (pending.length) {
  for (const [repository, branch] of repositories) {
    const tree = await fetchJson(`https://api.github.com/repos/${repository}/git/trees/${branch}?recursive=1`);
    for (const item of tree.tree || []) {
      if (item.type === 'blob' && /\.(png|jpe?g|webp)$/i.test(item.path)) {
        assets.push({ repository, branch, path: item.path, size: item.size || 0 });
      }
    }
  }
}

function assetScore(asset, gameKey) {
  const parts = asset.path.split('/').map(normalizeAssetPart);
  const base = parts.at(-1);
  let score = 0;
  if (base === gameKey) score += 10_000;
  if (parts.includes(gameKey)) score += 5_000;
  if (asset.repository === 'FrenchHelp/Games' && asset.path.startsWith('icons/')) score += 4_000;
  if (/assets\/images\/games/i.test(asset.path)) score += 3_000;
  if (/images\/thumbnails/i.test(asset.path)) score += 3_000;
  if (/(thumb|thumbnail|cover|icon|logo|splash|favicon)/i.test(asset.path)) score += 1_000;
  return score + Math.min(asset.size, 1_000_000) / 1_000_000;
}

function chooseAsset(game) {
  const explicit = explicitAssets[game];
  if (explicit) {
    const [repository, branch, assetPath] = explicit;
    return { repository, branch, path: assetPath };
  }
  const gameKey = normalizeGame(game);
  const candidates = assets
    .map(asset => ({ asset, score: assetScore(asset, gameKey) }))
    .filter(candidate => candidate.score >= 5_000)
    .sort((left, right) => right.score - left.score);
  if (!candidates.length) throw new Error(`No repository cover found for ${game}`);
  return candidates[0].asset;
}

await mkdir(coversDir, { recursive: true });
const chosen = pending.map(([game]) => [game, chooseAsset(game)]);

for (let offset = 0; offset < chosen.length; offset += 12) {
  await Promise.all(chosen.slice(offset, offset + 12).map(async ([game, asset]) => {
    const source = rawUrl(asset.repository, asset.branch, asset.path);
    const response = await fetch(source, { headers: { 'User-Agent': 'Asteroid-OS-FreePeriod-cover-sync' } });
    if (!response.ok) throw new Error(`${response.status} downloading ${source}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1_000 || !isImage(bytes)) throw new Error(`Invalid repository image for ${game}: ${source}`);
    const fileName = outputName(game, extensionOf(asset.path));
    await writeFile(path.join(coversDir, fileName), bytes);
    manifest.games[game] = {
      type: 'published-repository-art',
      file: `freeperiod-covers/${fileName}`,
      source,
    };
    console.log(`${game} <- ${asset.repository}/${asset.path}`);
  }));
}

const gameEntries = Object.entries(manifest.games);
if (gameEntries.length !== 300) throw new Error(`Expected 300 games, found ${gameEntries.length}`);
for (const [game, entry] of gameEntries) {
  if (!entry.file || !entry.source || entry.type === 'freeperiod-title-card') {
    throw new Error(`Cover is incomplete for ${game}`);
  }
}

manifest.version = 'freeperiod-300-repository-covers-2026-08-12';
manifest.policy = 'Every FreePeriod game uses a real image file sourced from a public game repository and committed under freeperiod-covers. No generated title cards or runtime screenshots are used.';
manifest.published_art = 300;
manifest.title_cards = 0;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

let indexHtml = (await readFile(indexPath, 'utf8')).replace(/\r\n/g, '\n');
const bundleMatch = indexHtml.match(/const FREE_PERIOD_HTML_BASE64='([A-Za-z0-9+/=]+)'/);
if (!bundleMatch) throw new Error('Could not locate the embedded FreePeriod bundle');
let bundle = Buffer.from(bundleMatch[1], 'base64').toString('utf8').replace(/\r\n/g, '\n');
const coverMap = Object.fromEntries(gameEntries.map(([game, entry]) => [game, entry.file]));
bundle = bundle.replace(
  /\/\* FREE_PERIOD_COVER_ASSETS_START \*\/[\s\S]*?\/\* FREE_PERIOD_COVER_ASSETS_END \*\//,
  `/* FREE_PERIOD_COVER_ASSETS_START */${JSON.stringify(coverMap)}/* FREE_PERIOD_COVER_ASSETS_END */`,
);
bundle = bundle.replace(/const FREE_PERIOD_BUNDLE_REVISION = "[^"]+";/, 'const FREE_PERIOD_BUNDLE_REVISION = "cooldude2349-master-2026-08-12-covers300-launchfix2";');
bundle = bundle.replace(/const FREE_PERIOD_COVER_POLICY = "[^"]+";/, 'const FREE_PERIOD_COVER_POLICY = "300-repository-image-files-no-placeholders";');
bundle = bundle.replace(
  /const gamePerformanceBridge = '[^\n]*';/,
  `const gamePerformanceBridge = '<script>(()=>{try{const tuneCanvases=()=>document.querySelectorAll("canvas").forEach(canvas=>{canvas.style.transform="translateZ(0)";canvas.style.backfaceVisibility="hidden";});if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",tuneCanvases,{once:true});else tuneCanvases();window.__asteroidHighPerformanceGameMode=true;}catch(error){console.warn("Asteroid game display tuning unavailable:",error);}})();<\\/script>';`,
);
bundle = bundle.replace(/\n\.button\.freeperiod-title-cover \{[\s\S]*?\n\.button\.freeperiod-title-cover::before \{[\s\S]*?\n\}\n/, '\n');
bundle = bundle.replace(/\nconst freePeriodTitleCoverKeys = new Set\(\);\n/, '\n');
bundle = bundle.replace(/\nfunction freePeriodCoverMonogram\(name\) \{[\s\S]*?\n\}\n\nfunction applyFreePeriodTitleCover\(button, name\) \{[\s\S]*?\n\}\n/, '\n');
bundle = bundle.replace(
  /function primeFallbackGameCovers\(\) \{[\s\S]*?\n\}\n\nconst dbName/,
  `function primeFallbackGameCovers() {
    for (const gameName of FREE_PERIOD_GAME_NAMES) {
        const key = freePeriodCoverKey(gameName);
        const asset = FREE_PERIOD_COVER_ASSETS[gameName];
        if (!asset) throw new Error(\`Repository cover missing for \${gameName}\`);
        const assetUrl = freePeriodRepositoryAssetUrl(asset);
        applyFreePeriodCover(key, assetUrl);
        const image = new Image();
        image.decoding = 'async';
        image.fetchPriority = freePeriodCoverPreloads.size < 24 ? 'high' : 'auto';
        image.onload = function() { image.dataset.loaded = '1'; };
        image.onerror = function() {
            const button = document.getElementById(gameName) || document.getElementById(key + '.html') || document.getElementById(key + '.htm');
            if (button) {
                button.dataset.coverKind = 'repository-image-error';
                button.title = \`Cover file could not be loaded: \${asset}\`;
            }
        };
        image.src = assetUrl;
        freePeriodCoverPreloads.set(key, image);
    }
}

const dbName`,
);
bundle = bundle.replace(
  /\s*else if \(freePeriodTitleCoverKeys\.has\(freePeriodCoverKey\(trimmedName\)\)\) \{\s*applyFreePeriodTitleCover\(btn, trimmedName\);\s*\}/,
  '',
);
const encodedBundle = Buffer.from(bundle, 'utf8').toString('base64');
indexHtml = indexHtml.replace(bundleMatch[1], encodedBundle);
await writeFile(indexPath, indexHtml, 'utf8');

console.log(`Updated ${pending.length} covers; manifest and embedded map now contain all ${gameEntries.length} repository images.`);
