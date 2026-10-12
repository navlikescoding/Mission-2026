// Recording page: captures hand-landmark samples for each sign and exports them as JSON.

import { createHandLandmarker, createFaceDetector, startCamera, runHandLoop, drawHands } from './hands.js';
import { toLandmarks, handCount, faceToArray, POINTS_PER_HAND } from './features.js';
import { SIGNS, TARGET_SAMPLES } from './signs.js';

const CAPTURE_INTERVAL_MS = 100;   // about 10 samples per second
const TIMED_RECORD_MS = 3000;
const STORAGE_KEY = 'isl-recorder-samples-v1';
const NAME_KEY = 'isl-recorder-name';

const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('canvas'), stage = $('stage');

let samples = [];
let selected = SIGNS[0].id;
let recording = false;
let recordMode = null;     // 'hold' | 'timed'
let recordEndsAt = 0;
let countdownTimer = null;
let lastCapture = 0;
let latestHands = 0;
let faceTracking = false;  // true once the face detector has loaded

// ---------- Saving in the browser so a refresh doesn't lose work ----------

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(samples)); } catch (err) { /* storage full or blocked */ }
}
function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(stored)) samples = stored;
  } catch (err) { samples = []; }
  try { $('recorder').value = localStorage.getItem(NAME_KEY) || ''; } catch (err) { /* ignore */ }
}

// ---------- Sign list ----------

const signById = id => SIGNS.find(s => s.id === id);

function buildSignControls() {
  $('signSelect').replaceChildren(...SIGNS.map(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.label}${s.hands === 2 ? ' (2 hands)' : ''}`;
    return opt;
  }));
  $('signSelect').addEventListener('change', e => selectSign(e.target.value));

  $('signList').replaceChildren(...SIGNS.map(s => {
    const li = document.createElement('li');
    li.dataset.id = s.id;
    li.innerHTML = `<span class="name"></span><span class="count"></span><span class="bar"><span></span></span>`;
    li.querySelector('.name').textContent = s.label;
    li.addEventListener('click', () => selectSign(s.id));
    return li;
  }));
}

function selectSign(id) {
  if (recording) stopRecording();
  selected = id;
  $('signSelect').value = id;
  render();
}

function render() {
  const counts = {};
  for (const s of samples) counts[s.sign] = (counts[s.sign] || 0) + 1;

  for (const li of $('signList').children) {
    const n = counts[li.dataset.id] || 0;
    li.classList.toggle('active', li.dataset.id === selected);
    li.classList.toggle('done', n >= TARGET_SAMPLES);
    li.querySelector('.count').textContent = `${n} / ${TARGET_SAMPLES}`;
    li.querySelector('.bar span').style.width = `${Math.min(100, (n / TARGET_SAMPLES) * 100)}%`;
  }
  $('total').textContent = samples.length;

  const sign = signById(selected);
  $('banner').textContent = recording
    ? `● Recording: ${sign.label}`
    : `Sign: ${sign.label}${sign.hands === 2 ? ' · needs 2 hands' : ''}`;
}

// ---------- Recording ----------

function startRecording(mode) {
  recording = true;
  recordMode = mode;
  recordEndsAt = mode === 'timed' ? performance.now() + TIMED_RECORD_MS : Infinity;
  stage.classList.add('recording');
  render();
}

function stopRecording() {
  recording = false;
  recordMode = null;
  clearInterval(countdownTimer);
  countdownTimer = null;
  $('countdown').textContent = '';
  $('warn').textContent = '';
  stage.classList.remove('recording');
  save();
  render();
}

function startCountdown() {
  if (recording || countdownTimer) return;
  let n = 3;
  $('countdown').textContent = n;
  countdownTimer = setInterval(() => {
    n--;
    if (n > 0) {
      $('countdown').textContent = n;
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      $('countdown').textContent = '';
      startRecording('timed');
    }
  }, 1000);
}

function capture(result, face) {
  const now = performance.now();
  if (recordMode === 'timed' && now >= recordEndsAt) return stopRecording();
  if (now - lastCapture < CAPTURE_INTERVAL_MS) return;

  const sign = signById(selected);
  const count = handCount(result);
  if (count < sign.hands) {
    const seen = result && result.landmarks ? result.landmarks.length : 0;
    $('warn').textContent = count === 0
      ? (seen ? 'Hand too far from the camera: come closer' : 'No hands visible')
      : `Show ${sign.hands} hands`;
    return;
  }
  // The face is needed to know WHERE the sign is made (face, chest, side).
  if (faceTracking && !face) {
    $('warn').textContent = 'Face not visible: face the camera';
    return;
  }
  $('warn').textContent = '';

  lastCapture = now;
  const sample = { sign: selected, landmarks: toLandmarks(result) };
  const faceArr = faceToArray(face);
  if (faceArr) sample.face = faceArr;
  const by = $('recorder').value.trim();
  if (by) sample.by = by;
  samples.push(sample);
  render();
}

// ---------- Editing samples ----------

$('undoBtn').addEventListener('click', () => {
  let removed = 0;
  for (let i = samples.length - 1; i >= 0 && removed < 10; i--) {
    if (samples[i].sign === selected) { samples.splice(i, 1); removed++; }
  }
  save();
  render();
});

$('clearBtn').addEventListener('click', () => {
  const label = signById(selected).label;
  if (!confirm(`Delete all samples for "${label}"?`)) return;
  samples = samples.filter(s => s.sign !== selected);
  save();
  render();
});

$('resetBtn').addEventListener('click', () => {
  if (!confirm('Delete ALL samples? Export first if you want to keep them.')) return;
  samples = [];
  save();
  render();
});

// ---------- Export / import ----------

$('exportBtn').addEventListener('click', () => {
  const by = ($('recorder').value.trim() || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const blob = new Blob([JSON.stringify(samples)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `samples-${by}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async e => {
  let added = 0, skipped = 0;
  for (const file of e.target.files) {
    try {
      const data = JSON.parse(await file.text());
      for (const s of Array.isArray(data) ? data : []) {
        const ok = s && typeof s.sign === 'string' && Array.isArray(s.landmarks) &&
          (s.landmarks.length === POINTS_PER_HAND || s.landmarks.length === POINTS_PER_HAND * 2);
        if (!ok) { skipped++; continue; }
        // Older one-hand samples (21 points) are padded to the 42-point format.
        const landmarks = s.landmarks.length === POINTS_PER_HAND
          ? s.landmarks.concat(Array.from({ length: POINTS_PER_HAND }, () => [0, 0, 0]))
          : s.landmarks;
        samples.push({ ...s, landmarks });
        added++;
      }
    } catch (err) {
      alert(`Couldn't read ${file.name}: ${err.message}`);
    }
  }
  e.target.value = '';
  save();
  render();
  alert(`Imported ${added} samples${skipped ? `, skipped ${skipped} invalid ones` : ''}.`);
});

// ---------- Keyboard ----------

const typing = e => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;

document.addEventListener('keydown', e => {
  if (typing(e)) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat && !recording && !countdownTimer && !$('recordBtn').disabled) startRecording('hold');
  } else if (e.code === 'Enter') {
    e.preventDefault();
    if (!$('recordBtn').disabled) startCountdown();
  } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const i = SIGNS.findIndex(s => s.id === selected);
    const next = (i + (e.code === 'ArrowDown' ? 1 : -1) + SIGNS.length) % SIGNS.length;
    selectSign(SIGNS[next].id);
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'Space' && recordMode === 'hold') stopRecording();
});

$('recordBtn').addEventListener('click', () => startCountdown());
$('recorder').addEventListener('input', () => {
  try { localStorage.setItem(NAME_KEY, $('recorder').value); } catch (err) { /* ignore */ }
});

// ---------- Start ----------

function setPill(id, html, cls) {
  const el = $(id);
  el.innerHTML = html;
  el.className = `pill ${cls || ''}`;
}

async function main() {
  load();
  buildSignControls();
  render();

  try {
    setPill('modelPill', 'Camera: <b>starting…</b>');
    await startCamera(video);
    setPill('modelPill', 'Model: <b>loading…</b>');
    const [{ landmarker, modelSource, delegate }, faceDetector] = await Promise.all([
      createHandLandmarker({ numHands: 4 }),
      createFaceDetector()
    ]);
    faceTracking = !!faceDetector;
    setPill('modelPill', `Model: <b>ready</b> (${delegate}, ${modelSource}${faceTracking ? '' : ', no face tracking'})`, 'ok');
    $('recordBtn').disabled = false;

    runHandLoop(video, landmarker, (result, fps, face) => {
      drawHands(canvas, video, result, face);
      const n = handCount(result);
      if (n !== latestHands) {
        latestHands = n;
        setPill('handsPill', `Hands: <b>${n}</b>`, n ? 'ok' : '');
      }
      $('fpsPill').innerHTML = `FPS: <b>${fps || '–'}</b>`;
      if (recording) capture(result, face);
    }, { faceDetector });
  } catch (err) {
    console.error(err);
    const msg = err && err.name === 'NotAllowedError'
      ? 'Camera permission was blocked. Allow it in the address bar and reload.'
      : (err && err.message) || String(err);
    setPill('modelPill', `Error: ${msg}`, 'err');
  }
}

main();

// Exposed for automated testing.
window.__recorder = { getSamples: () => samples, capture, startRecording, stopRecording, selectSign };
