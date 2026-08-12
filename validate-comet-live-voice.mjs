import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const start = client.indexOf('// Hidden system-wide "Hey Comet" wake-word listener.');
const end = client.indexOf('function tick()', start);
const voice = start >= 0 && end > start ? client.slice(start, end) : '';
const manualStart = voice.slice(voice.indexOf("window.addEventListener('cometmanualstart'"), voice.indexOf("// Browsers may require a user gesture", voice.indexOf("window.addEventListener('cometmanualstart'")));
const startEngine = voice.slice(voice.indexOf('const startRecognitionEngine='), voice.indexOf('const applySpeechPhrases=', voice.indexOf('const startRecognitionEngine=')));

const checks = [
  ['live voice implementation is present', voice.length > 1000],
  ['voice button requests permission immediately', manualStart.indexOf('await ensureMicrophone()') >= 0 && manualStart.indexOf('await ensureMicrophone()') < manualStart.indexOf("activateComet('',true)")],
  ['microphone request is not delayed behind a timer', !manualStart.includes('setTimeout')],
  ['advanced audio constraints fall back to basic audio', voice.includes("microphoneStream=await navigator.mediaDevices.getUserMedia({audio});") && voice.includes("microphoneStream=await navigator.mediaDevices.getUserMedia({audio:true});")],
  ['missing microphones are detected explicitly', voice.includes("missing.name='NotFoundError'")],
  ['permission probe is released before browser speech recognition', startEngine.includes('releaseMicrophone(true);') && startEngine.includes('recognition.start();')],
  ['nonstandard recognition.start(track) is not used', !startEngine.includes('recognition.start(microphoneTrack)')],
  ['permission denial has a retryable user-facing explanation', manualStart.includes('Allow it for this site, then tap the voice button again.')],
  ['unsupported insecure contexts have a clear message', voice.includes('Microphone access requires a secure HTTPS browser page.')],
  ['voice results still dispatch through the normal Comet request path', voice.includes('handleCometRequest(clean,{voice:true})')],
  ['spoken answers still use browser speech synthesis', voice.includes('speechSynthesis.speak(u)')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Comet live voice checks passed.`);
if (failed) process.exitCode = 1;
