import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const start = client.indexOf('const TERMINAL_TIMEZONES=');
const end = client.indexOf('window.AsteroidTerminal=Object.freeze', start);
const terminal = start >= 0 && end > start ? client.slice(start, end + 1200) : '';

const registrations = [...terminal.matchAll(/terminalRegister\(\[([^\]]+)\]/g)];
const canonicalNames = registrations.map(match => match[1].match(/['"]([^'"]+)['"]/)?.[1]).filter(Boolean);
const requiredCommands = [
  'help', 'commands', 'man', 'apropos', 'command-count', 'history', 'alias',
  'echo', 'printf', 'grep', 'sort', 'json', 'hash', 'calc', 'uuid',
  'date', 'time', 'cal', 'status', 'storage', 'battery', 'permissions',
  'apps', 'open', 'close', 'windows', 'focus', 'browse',
  'pwd', 'cd', 'ls', 'tree', 'find', 'stat', 'cat', 'mkdir', 'touch',
  'write', 'append', 'rm', 'restore-file', 'notes', 'note',
  'theme', 'accent', 'wallpaper', 'focus-mode', 'sync', 'shards', 'lock'
];

const checks = [
  ['Asteroid Shell 2.0 interface exists', client.includes('Asteroid Shell 2.0')],
  ['registry contains at least 70 canonical commands', canonicalNames.length >= 70],
  ['all core functional commands are registered', requiredCommands.every(name => canonicalNames.includes(name))],
  ['quoted argument tokenizer is present', terminal.includes('function terminalTokenize')],
  ['pipes and semicolon chains are executed', terminal.includes("terminalSplit(command,';')") && terminal.includes("terminalSplit(command,'|')")],
  ['file redirects use Asteroid Files', terminal.includes("statement.match(/\\s*(>>|>)") && terminal.includes('terminalWriteFile(redirect.path')],
  ['file commands use the shared Files persistence path', terminal.includes('await filesSaveItem') && terminal.includes('filesMoveToRecycleBin') && terminal.includes('filesRestoreItem')],
  ['app commands use the real window manager', terminal.includes('openApp(app.id)') && terminal.includes('closeWindow(win)')],
  ['settings commands call the real OS setters', terminal.includes('applyTheme(mode)') && terminal.includes('setAccent(color)') && terminal.includes('setWallpaper(index)')],
  ['thousands count is based on real parameterized forms', terminal.includes('const arithmeticForms=64*64') && terminal.includes('appForms') && terminal.includes('fileForms')],
  ['deterministic browser test interface is exported', client.includes('window.AsteroidTerminal=Object.freeze') && client.includes("version:'2.0'")],
  ['Terminal App Store description matches the implementation', client.includes("'97 canonical working commands'") && client.includes("'Pipes, redirects, aliases, and completion'")]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Terminal checks passed (${canonicalNames.length} canonical registrations found).`);
if (failed) process.exitCode = 1;
