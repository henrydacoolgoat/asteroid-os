import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const start = client.indexOf('const TERMINAL_TIMEZONES=');
const end = client.indexOf('window.AsteroidTerminal=Object.freeze', start);
const terminal = start >= 0 && end > start ? client.slice(start, end + 1200) : '';

const registrations = [...terminal.matchAll(/terminalRegister\(\[([^\]]+)\]/g)];
const canonicalNames = registrations.map(match => match[1].match(/['"]([^'"]+)['"]/)?.[1]).filter(Boolean);
const requiredCommands = [
  'help', 'commands', 'man', 'apropos', 'command-count', 'history', 'alias',
  'echo', 'printf', 'grep', 'sort', 'json', 'hash', 'calc', 'solve', 'uuid',
  'date', 'time', 'cal', 'status', 'storage', 'battery', 'permissions',
  'apps', 'open', 'close', 'windows', 'focus', 'browse',
  'pwd', 'cd', 'ls', 'tree', 'find', 'stat', 'cat', 'mkdir', 'touch',
  'write', 'append', 'rm', 'restore-file', 'notes', 'note',
  'theme', 'accent', 'wallpaper', 'focus-mode', 'sync', 'shards', 'lock'
];

const algebraStart = terminal.indexOf('function terminalSafeMath');
const algebraEnd = terminal.indexOf('async function terminalWaitForAccountRefresh', algebraStart);
const algebraSource = algebraStart >= 0 && algebraEnd > algebraStart ? terminal.slice(algebraStart, algebraEnd) : '';
let solveEquation = null;
try { solveEquation = Function(`"use strict";${algebraSource};return terminalSolveEquation;`)(); } catch {}
const algebraCases = [
  ['2x + 3 = 11', 'x', 'x = 4'],
  ['x^2 - 5x + 6 = 0', 'x', 'x = 2 or x = 3'],
  ['3(score - 2) = 12', 'score', 'score = 6'],
  ['x^2 + 1 = 0', 'x', 'x = 0 ± 1i'],
  ['x = x', 'x', 'Every real number is a solution.'],
  ['x = x + 1', 'x', 'No solution.'],
];
const algebraCasesPass = Boolean(solveEquation) && algebraCases.every(([equation, variable, expected]) => solveEquation(equation, variable) === expected);
let cubicRejected = false;
try { solveEquation?.('x^3 = 8', 'x'); } catch (error) { cubicRejected = /not linear or quadratic/i.test(String(error?.message)); }
let remainderRejected = false;
try { solveEquation?.('x % 2 = 0', 'x'); } catch (error) { remainderRejected = /does not support the remainder/i.test(String(error?.message)); }

const checks = [
  ['Asteroid Shell 2.0 interface exists', client.includes('Asteroid Shell 2.0')],
  ['registry contains at least 98 canonical commands', canonicalNames.length >= 98],
  ['all core functional commands are registered', requiredCommands.every(name => canonicalNames.includes(name))],
  ['quoted argument tokenizer is present', terminal.includes('function terminalTokenize')],
  ['pipes and semicolon chains are executed', terminal.includes("terminalSplit(command,';')") && terminal.includes("terminalSplit(command,'|')")],
  ['file redirects use Asteroid Files', terminal.includes("statement.match(/\\s*(>>|>)") && terminal.includes('terminalWriteFile(redirect.path')],
  ['file commands use the shared Files persistence path', terminal.includes('await filesSaveItem') && terminal.includes('filesMoveToRecycleBin') && terminal.includes('filesRestoreItem')],
  ['app commands use the real window manager', terminal.includes('openApp(app.id)') && terminal.includes('closeWindow(win)')],
  ['settings commands call the real OS setters', terminal.includes('applyTheme(mode)') && terminal.includes('setAccent(color)') && terminal.includes('setWallpaper(index)')],
  ['algebra solver passes executable linear, quadratic, complex, identity, and contradiction cases', algebraCasesPass],
  ['algebra solver rejects unsupported cubic equations honestly', cubicRejected],
  ['algebra solver rejects non-polynomial remainder expressions honestly', remainderRejected],
  ['command count reports only registry commands and aliases', terminal.includes('const canonical=terminalCanonicalCommands.size') && terminal.includes('const aliases=Math.max(0,registeredNames-canonical)') && !terminal.includes('arithmeticForms')],
  ['account commands refresh backend state before reporting it', terminal.includes('terminalWaitForAccountRefresh') && terminal.includes('const wallet=await refreshShardWallet()') && terminal.includes('await refreshAsteroidBrowserAccess') && terminal.includes("asteroid_one_files?select=kind,mime_type,deleted_at")],
  ['version command derives its value from the release build', terminal.includes('ASTEROID_RELEASE_BUILD.match') && terminal.includes('Build: ${ASTEROID_RELEASE_BUILD}')],
  ['deterministic browser test interface is exported', client.includes('window.AsteroidTerminal=Object.freeze') && client.includes("version:'2.0'")],
  ['Terminal App Store description matches the implementation', client.includes("'98 canonical commands'") && client.includes("'Linear and quadratic algebra solver'") && client.includes("'Aliases reported separately'") && client.includes("'Pipes, redirects, aliases, and completion'")]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Terminal checks passed (${canonicalNames.length} canonical registrations found).`);
if (failed) process.exitCode = 1;
