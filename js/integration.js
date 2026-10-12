// integration.js: connects the three parts of the app.
//
//   Member 4's camera (#webcam)  →  Member 1's recognizer (/recognition)  →  'sign' events
//   'sign' events  →  Member 3's sentence builder + speech (/hearing-side/signToSpeech.js)
//   spoken sentence  →  'signer-said'  →  Member 4's signer display (js/signer.js)
//
// It also draws the hand skeleton and a live caption (current sign, phrase, spoken sentence)
// inside the glasses view, in the #hearing-panel slot Member 4 reserved for it.

import { startRecognizer } from '/recognition/recognizer.js';
import { SIGNS } from '/recognition/signs.js';

const SAMPLES_URL = '/recognition/data/samples.json';
const labelOf = id => (SIGNS.find(s => s.id === id) || { label: id }).label;

const video = document.getElementById('webcam');
const slot = document.getElementById('hearing-panel');

// ---------- HUD inside the glasses view ----------

slot.classList.add('isl-active');
slot.innerHTML = `
  <canvas class="isl-skeleton"></canvas>
  <div class="isl-notice" hidden></div>
  <div class="isl-caption">
    <div class="isl-status">Starting sign recognition…</div>
    <div class="isl-phrase"></div>
    <div class="isl-spoken"></div>
  </div>`;

const canvas = slot.querySelector('.isl-skeleton');
const notice = slot.querySelector('.isl-notice');
const statusEl = slot.querySelector('.isl-status');
const phraseEl = slot.querySelector('.isl-phrase');
const spokenEl = slot.querySelector('.isl-spoken');

function setStatus(text, kind = '') {
  if (statusEl.textContent !== text) statusEl.textContent = text;
  statusEl.className = `isl-status ${kind}`;
}

function showNotice(text) {
  notice.textContent = text;
  notice.hidden = !text;
}

// ---------- Audio unlock ----------
// Chrome only allows speech after the user has clicked or pressed a key on the page.

const AUDIO_NOTICE = 'Click anywhere on the page to enable glasses audio';
const hasInteracted = () => navigator.userActivation ? navigator.userActivation.hasBeenActive : false;
if (!hasInteracted()) {
  showNotice(AUDIO_NOTICE);
  const unlock = () => {
    if (notice.textContent === AUDIO_NOTICE) showNotice(''); // keep any error notice visible
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

// ---------- Live caption from the recognizer and sentence builder ----------

function showPrediction(p) {
  switch (p.state) {
    case 'nohand': return setStatus('Show your hands to sign', 'idle');
    case 'moving': return setStatus('Hold the sign still…', 'idle');
    case 'none':
      return p.faceVisible === false
        ? setStatus('Face the camera', 'warn')
        : setStatus('No sign', 'idle');
    case 'settling': return setStatus(`Reading: ${labelOf(p.sign)}`, 'reading');
    case 'stable': return setStatus(`✓ ${labelOf(p.sign)}`, 'ok');
    default: return undefined;
  }
}

window.addEventListener('phrase-update', e => {
  const signs = (e.detail && e.detail.signs) || [];
  phraseEl.textContent = signs.length ? signs.map(labelOf).join(' + ') : '';
});

window.addEventListener('sentence-ready', e => {
  spokenEl.textContent = `Building: "${e.detail.text}"`;
});
window.addEventListener('speech-start', e => {
  spokenEl.textContent = `🔊 "${e.detail.text}"`;
});
window.addEventListener('signer-said', e => {
  if (e.detail && e.detail.handled) spokenEl.textContent = `✓ Sent: "${e.detail.text}"`;
});
window.addEventListener('speech-error', e => {
  if (e.detail && e.detail.error === 'not-allowed') {
    showNotice(AUDIO_NOTICE);
  }
});

// ---------- Start the recognizer once Member 4's camera is running ----------

function waitForCamera() {
  return new Promise(resolve => {
    const check = () => {
      if (video.srcObject && video.readyState >= 2) return resolve();
      setTimeout(check, 200);
    };
    check();
  });
}

async function start() {
  setStatus('Waiting for camera…', 'idle');
  await waitForCamera();
  setStatus('Loading sign recognition…', 'idle');
  try {
    await startRecognizer(video, { samplesUrl: SAMPLES_URL, canvas, onPrediction: showPrediction });
    setStatus('Show your hands to sign', 'idle');
  } catch (err) {
    console.error('[Integration] Recognizer failed to start:', err);
    setStatus('Sign recognition unavailable', 'warn');
    showNotice(String(err.message || err));
  }
}

start();
