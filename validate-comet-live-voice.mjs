import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const start = client.indexOf('// Hidden system-wide "Hey Comet" wake-word listener.');
const end = client.indexOf('function tick()', start);
const voice = start >= 0 && end > start ? client.slice(start, end) : '';
const manualStart = voice.slice(voice.indexOf("window.addEventListener('cometmanualstart'"), voice.indexOf('// Pause and resume only an already-authorized listener', voice.indexOf("window.addEventListener('cometmanualstart'")));
const startEngine = voice.slice(voice.indexOf('const startRecognitionEngine='), voice.indexOf('const applySpeechPhrases=', voice.indexOf('const startRecognitionEngine=')));
const authLifecycle = voice.slice(voice.indexOf("window.addEventListener('asteroidauthchange'"), voice.indexOf("window.addEventListener('cometvoiceupdate'"));
const visibilityLifecycle = voice.slice(voice.indexOf("document.addEventListener('visibilitychange'"), voice.indexOf("navigator.permissions?.query", voice.indexOf("document.addEventListener('visibilitychange'")));
const lockLifecycle = voice.slice(voice.indexOf("window.addEventListener('asteroidlockchange'"), voice.indexOf("window.addEventListener('asteroidauthchange'"));
const optionalWake = voice.slice(voice.indexOf('const startWakeListener='), voice.indexOf('const stopWakeListener='));

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
  ,['sign-in automatically starts the wake listener', authLifecycle.includes('wakeShouldRun=true;') && authLifecycle.includes('startWakeListener();')]
  ,['unlock automatically resumes the wake listener', lockLifecycle.includes('startWakeListener();')]
  ,['foreground return automatically resumes the wake listener', visibilityLifecycle.includes('startWakeListener();')]
  ,['background pause preserves the desired wake state', voice.includes("const stopWakeListener=(status='paused',{disable=false}={})=>")]
  ,['normal desktop gestures never request microphone access', !voice.includes('armWakePermissionGesture') && !voice.includes("document.addEventListener('pointerdown',wakeGestureHandler,true)")]
  ,['ungranted wake voice is silently optional', optionalWake.includes("if(microphonePermission!=='granted')") && optionalWake.includes("publishWakeStatus('off')") && !client.includes('data-comet-wake-status data-state=')]
  ,['wake status state cannot erase the OS body', voice.includes('document.body.dataset.cometWakeState=status;') && voice.includes("document.querySelectorAll('[data-comet-wake-status]')") && !voice.includes('document.body.dataset.cometWakeStatus=status;')]
  ,['permission changes restart wake voice without a reload', voice.includes("permission.state==='granted'") && voice.includes('startWakeListener();')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Comet live voice checks passed.`);
if (failed) process.exitCode = 1;
