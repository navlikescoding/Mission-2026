// Recognizer test page: live predictions, tuning, the events teammates receive, and an
// accuracy check on the recorded samples.

import { startRecognizer, loadSamples, RECORDER_STORAGE_KEY } from './recognizer.js';
import { KNNClassifier, NONE } from './classifier.js';
import { SIGNS } from './signs.js';

const $ = id => document.getElementById(id);
const labelOf = id => (SIGNS.find(s => s.id === id) || { label: id }).label;

const classifier = new KNNClassifier({ k: 5 });
let recognizer = null;
let minConfidence = 0.6;

// ---------- Training data ----------

function useSamples(samples, sourceText) {
  classifier.fit(samples);
  const signs = classifier.signs.length;
  $('dataPill').innerHTML = `Samples: <b>${classifier.size}</b> (${signs} signs)`;
  $('dataNote').innerHTML = `Using <b>${classifier.size}</b> samples of <b>${signs}</b> signs from ${sourceText}.` +
    (classifier.dropped ? ` Skipped <b>${classifier.dropped}</b> samples of someone else's hand in the background.` : '') +
    (classifier.withoutFace ? ` <b>${classifier.withoutFace}</b> samples were recorded without face tracking, so their location ` +
      `can't be compared: re-record them for location-based signs.` : '');
  applyThreshold();
  $('evalOut').replaceChildren();
}

async function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECORDER_STORAGE_KEY) || '[]');
    if (!saved.length) throw new Error('empty');
    useSamples(saved, 'the recording page');
    return true;
  } catch (err) {
    $('dataNote').textContent = 'No samples saved in this browser yet. Record some on record.html, or load a JSON file.';
    return false;
  }
}

async function loadDataFile() {
  try {
    useSamples(await loadSamples({ samplesUrl: 'data/samples.json' }), 'data/samples.json');
    return true;
  } catch (err) {
    $('dataNote').textContent = 'No data/samples.json yet. Put the team\'s merged samples file there.';
    return false;
  }
}

$('useSavedBtn').addEventListener('click', loadSaved);
$('useFileBtn').addEventListener('click', loadDataFile);
$('loadFileBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async e => {
  const all = [];
  const names = [];
  for (const file of e.target.files) {
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data)) { all.push(...data); names.push(file.name); }
    } catch (err) {
      alert(`Couldn't read ${file.name}: ${err.message}`);
    }
  }
  e.target.value = '';
  if (all.length) useSamples(all, names.join(', '));
});

// ---------- Tuning ----------

function applyThreshold() {
  const factor = Number($('threshold').value);
  classifier.threshold = classifier.autoThreshold * factor;
  $('thresholdValue').textContent = Number.isFinite(classifier.threshold)
    ? `${factor.toFixed(2)}× (${classifier.threshold.toFixed(2)})`
    : `${factor.toFixed(2)}×`;
}

$('threshold').addEventListener('input', applyThreshold);
$('minConf').addEventListener('input', () => {
  minConfidence = Number($('minConf').value);
  $('confValue').textContent = `${Math.round(minConfidence * 100)}%`;
  if (recognizer) recognizer.setMinConfidence(minConfidence);
});
$('kSelect').addEventListener('change', () => { classifier.k = Number($('kSelect').value); });

function applyStabilizer() {
  const motionLimit = Number($('motionLimit').value), holdMs = Number($('holdMs').value);
  $('motionValue').textContent = motionLimit.toFixed(1);
  $('holdValue').textContent = `${holdMs} ms`;
  if (recognizer) Object.assign(recognizer.stabilizer.options, { motionLimit, holdMs });
}
$('motionLimit').addEventListener('input', applyStabilizer);
$('holdMs').addEventListener('input', applyStabilizer);
applyStabilizer();
$('confValue').textContent = `${Math.round(minConfidence * 100)}%`;

// ---------- Live display ----------

let lastRankedRender = 0;

function showPrediction(p) {
  // p.state: 'nohand' | 'moving' | 'none' | 'settling' | 'stable' (set by the stabilizer)
  const state = p.state || (p.sign === null ? 'nohand' : p.sign === NONE ? 'none' : 'stable');
  const hasSign = state === 'settling' || state === 'stable';
  const sent = state === 'stable' && p.confidence >= minConfidence;
  const limit = Number.isFinite(classifier.threshold) ? classifier.threshold.toFixed(2) : '∞';
  const dist = Number.isFinite(p.distance) ? p.distance.toFixed(2) : '–';
  const speed = p.motion != null ? p.motion.toFixed(1) : '–';

  const box = $('result');
  box.classList.toggle('none', !hasSign);
  box.classList.toggle('sent', sent);
  box.classList.toggle('settling', state === 'settling');

  const text = {
    nohand: ['No hand', 'Show your hand to the camera'],
    moving: ['Moving…', `hold your sign still · speed ${speed}`],
    none: p.faceVisible === false && !Number.isFinite(p.distance)
      ? ['No sign', "face not visible, so the sign's location can't be checked: face the camera"]
      : ['No sign', `too far from recorded signs · distance ${dist} > limit ${limit}`],
    settling: [labelOf(p.sign), 'hold it…'],
    stable: [labelOf(p.sign), `${Math.round(p.confidence * 100)}% of neighbours agree · distance ${dist} (limit ${limit})` +
      (sent ? '' : ' · below minimum confidence, not sent')]
  }[state];
  $('resultSign').textContent = text[0];
  $('resultMeta').textContent = text[1];
  $('resultBar').style.width = state === 'settling' ? `${Math.round(p.progress * 100)}%`
    : state === 'stable' ? `${Math.round(p.confidence * 100)}%` : '0%';
  if (p.fps) $('fpsPill').innerHTML = `FPS: <b>${p.fps}</b>`;

  const now = performance.now();
  if (now - lastRankedRender > 150) {
    lastRankedRender = now;
    // Guesses are only meaningful once the hand is still.
    const show = state === 'none' || hasSign;
    $('rankedTitle').textContent = state === 'none' ? 'Closest recorded signs (rejected)'
      : state === 'moving' ? 'Top guesses (hold still)' : 'Top guesses';
    $('ranked').classList.toggle('rejected', state === 'none');
    $('ranked').replaceChildren(...(show ? p.ranked || [] : []).slice(0, 3).map(r => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="name"></span><span class="pct"></span><span class="bar"><span></span></span>';
      li.querySelector('.name').textContent = labelOf(r.sign);
      li.querySelector('.pct').textContent = `${Math.round(r.share * 100)}%`;
      li.querySelector('.bar span').style.width = `${r.share * 100}%`;
      return li;
    }));
  }
}

// The exact 'sign' events teammates receive, grouped when the same sign repeats.
const eventLog = [];
window.addEventListener('sign', e => {
  const last = eventLog[0];
  if (last && last.sign === e.detail.sign) last.count++;
  else eventLog.unshift({ sign: e.detail.sign, count: 1 });
  if (eventLog.length > 8) eventLog.pop();
  renderEvents();
});

let eventsQueued = false;
function renderEvents() {
  if (eventsQueued) return;
  eventsQueued = true;
  requestAnimationFrame(() => {
    eventsQueued = false;
    $('events').replaceChildren(...eventLog.map(ev => {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><span class="times"></span>';
      li.firstChild.textContent = `"${ev.sign}"`;
      li.lastChild.textContent = `×${ev.count}`;
      return li;
    }));
  });
}

// ---------- Accuracy check ----------

$('evalBtn').addEventListener('click', () => {
  if (!classifier.size) return alert('Load some samples first.');
  $('evalBtn').disabled = true;
  $('evalBtn').textContent = 'Testing…';
  setTimeout(() => {
    const r = classifier.evaluate();
    renderEvaluation(r);
    $('evalBtn').disabled = false;
    $('evalBtn').textContent = 'Test accuracy on the recorded samples';
  }, 30);
});

function renderEvaluation(r) {
  const rows = Object.entries(r.perSign)
    .map(([sign, v]) => ({ sign, acc: v.correct / v.total, total: v.total }))
    .sort((a, b) => a.acc - b.acc);

  const signRows = rows.map(x =>
    `<tr><td>${escape(labelOf(x.sign))}</td><td class="num ${x.acc < 0.85 ? 'low' : ''}">${Math.round(x.acc * 100)}%</td><td class="num">${x.total}</td></tr>`
  ).join('');
  const confRows = r.confusions.slice(0, 8).map(([pair, n]) =>
    `<tr><td>${escape(pair.split(' → ').map(labelOf).join(' → '))}</td><td class="num">${n}</td></tr>`
  ).join('') || '<tr><td colspan="2">No mix-ups</td></tr>';

  $('evalOut').innerHTML = `
    <p class="eval-summary"><b>${Math.round(r.accuracy * 100)}%</b> correct · ${escape(r.method)}</p>
    <div class="grid2">
      <div><h3>Per sign (worst first)</h3>
        <table><thead><tr><th>Sign</th><th class="num">Correct</th><th class="num">Samples</th></tr></thead><tbody>${signRows}</tbody></table>
      </div>
      <div><h3>Most common mix-ups (actual → guessed)</h3>
        <table><thead><tr><th>Mix-up</th><th class="num">Times</th></tr></thead><tbody>${confRows}</tbody></table>
      </div>
    </div>`;
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- Start ----------

async function main() {
  if (!(await loadSaved())) await loadDataFile();
  applyThreshold();

  try {
    $('modelPill').innerHTML = 'Model: <b>loading…</b>';
    recognizer = await startRecognizer($('video'), {
      classifier,
      canvas: $('canvas'),
      minConfidence,
      onPrediction: showPrediction
    });
    applyStabilizer();
    $('modelPill').innerHTML = 'Model: <b>ready</b>';
    $('modelPill').className = 'pill ok';
  } catch (err) {
    console.error(err);
    const msg = err && err.name === 'NotAllowedError'
      ? 'Camera permission was blocked. Allow it in the address bar and reload.'
      : (err && err.message) || String(err);
    $('modelPill').textContent = `Error: ${msg}`;
    $('modelPill').className = 'pill err';
  }
}

main();

// Exposed for automated testing.
window.__recognize = { classifier, showPrediction };
