// k-nearest-neighbours sign classifier.
//
// To recognize a hand, it finds the k recorded samples whose features are closest, and the
// sign most of them belong to wins. Confidence = the share of neighbours that agree.
// If even the closest sample is far away, the hand isn't doing any known sign, so the
// answer is 'none' instead of a forced guess.

import { toFeatures, POINTS_PER_HAND, MIN_HAND_SIZE } from './features.js';

export const NONE = 'none';
const MIN_LIMIT = 1.5;
const MAX_LIMIT = 6;

// Recorded samples may contain hands of people in the background (recorded before the
// background filter existed). A first hand that's too small means the sample isn't the
// signer, so it's dropped; a too-small second hand is removed from the sample.
function sizeOf(points) {
  return Math.hypot(points[9][0] - points[0][0], points[9][1] - points[0][1]);
}
function cleanSample(s) {
  const lm = s.landmarks;
  if (sizeOf(lm) < MIN_HAND_SIZE) return null;
  const second = lm.slice(POINTS_PER_HAND, POINTS_PER_HAND * 2);
  const hasSecond = second.length === POINTS_PER_HAND && second.some(p => p[0] || p[1] || p[2]);
  if (hasSecond && sizeOf(second) < MIN_HAND_SIZE) {
    return { ...s, landmarks: lm.slice(0, POINTS_PER_HAND).concat(second.map(() => [0, 0, 0])) };
  }
  return s;
}

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export class KNNClassifier {
  constructor({ k = 5 } = {}) {
    this.k = k;
    this.features = [];
    this.labels = [];
    this.people = [];
    this.threshold = Infinity;
    this.autoThreshold = Infinity;
  }

  // samples: [{ sign, landmarks, by? }]
  fit(samples) {
    const wellFormed = samples.filter(s => s && s.sign && Array.isArray(s.landmarks) && s.landmarks.length >= 21);
    const valid = wellFormed.map(cleanSample).filter(Boolean);
    this.dropped = wellFormed.length - valid.length; // background-hand samples removed
    this.features = valid.map(s => toFeatures(s.landmarks, s.face));
    this.withoutFace = valid.filter(s => !s.face).length; // recorded before face tracking existed
    this.labels = valid.map(s => s.sign);
    this.people = valid.map(s => s.by || '');
    this.signs = [...new Set(this.labels)];
    this.autoThreshold = this._estimateThreshold();
    this.threshold = this.autoThreshold;
    return this;
  }

  get size() { return this.features.length; }

  // The k nearest samples to `f`. `exclude(i)` can skip samples (used when testing).
  _neighbours(f, exclude) {
    const k = Math.min(this.k, this.size);
    const best = []; // sorted ascending by distance, at most k long
    for (let i = 0; i < this.size; i++) {
      if (exclude && exclude(i)) continue;
      const d = distance(f, this.features[i]);
      if (best.length < k || d < best[best.length - 1].d) {
        let j = best.length < k ? best.length : k - 1;
        if (best.length < k) best.push(null);
        while (j > 0 && best[j - 1].d > d) { best[j] = best[j - 1]; j--; }
        best[j] = { i, d };
      }
    }
    return best;
  }

  _vote(best) {
    const votes = new Map();
    for (const { i, d } of best) {
      const v = votes.get(this.labels[i]) || { count: 0, dist: 0 };
      v.count++;
      v.dist += d;
      votes.set(this.labels[i], v);
    }
    // Most votes wins; ties go to the sign whose neighbours are closer.
    const ranked = [...votes.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[1].dist - b[1].dist)
      .map(([sign, v]) => ({ sign, share: v.count / best.length }));
    return ranked;
  }

  // How far a hand can be from the recorded samples and still count as a known sign.
  //
  // Samples recorded in the same burst (10 per second while holding still) are nearly
  // identical, so comparing a sample with its next-door neighbour says nothing about how
  // much a sign naturally varies. Instead, each sample is compared with samples of the same
  // sign recorded at a DIFFERENT moment (or by a different person), which measures the
  // real variation between attempts. Hands much further than that aren't a known sign.
  _estimateThreshold() {
    if (this.size < 10) return Infinity;
    const GAP = 15; // ~1.5 seconds of recording apart = a different attempt
    const step = Math.max(1, Math.floor(this.size / 300)); // check up to ~300 samples
    const apart = [], any = [];
    for (let i = 0; i < this.size; i += step) {
      let minApart = Infinity, minAny = Infinity;
      for (let j = 0; j < this.size; j++) {
        if (j === i || this.labels[j] !== this.labels[i]) continue;
        const d = distance(this.features[i], this.features[j]);
        if (d < minAny) minAny = d;
        const differentAttempt = Math.abs(j - i) > GAP || (this.people[i] && this.people[j] !== this.people[i]);
        if (differentAttempt && d < minApart) minApart = d;
      }
      if (minApart < Infinity) apart.push(minApart);
      if (minAny < Infinity) any.push(minAny);
    }
    const pick = apart.length >= any.length * 0.5 ? apart : any;
    if (!pick.length) return Infinity;
    pick.sort((a, b) => a - b);
    // The median (typical) distance, so a few odd samples can't inflate the limit, with a
    // generous margin. Kept between MIN_LIMIT and MAX_LIMIT so a very still recording can't
    // make it too strict and messy data can't make it accept everything.
    const median = pick[Math.floor(pick.length * 0.5)];
    return Math.min(Math.max(median * 4, MIN_LIMIT), MAX_LIMIT);
  }

  // landmarks: 42 points; face: the signer's face or null. Returns { sign, confidence, distance, ranked }.
  predict(landmarks, face) {
    return this.predictFeatures(toFeatures(landmarks, face));
  }

  predictFeatures(f, exclude) {
    if (!this.size) return { sign: NONE, confidence: 0, distance: Infinity, ranked: [] };
    const best = this._neighbours(f, exclude);
    if (!best.length) return { sign: NONE, confidence: 0, distance: Infinity, ranked: [] };
    const ranked = this._vote(best);
    const nearest = best[0].d;
    if (nearest > this.threshold) return { sign: NONE, confidence: 0, distance: nearest, ranked };
    return { sign: ranked[0].sign, confidence: ranked[0].share, distance: nearest, ranked };
  }

  // Tests the classifier on the recorded samples.
  // With samples from 2+ people, each person is tested using only the OTHER people's samples
  // (an honest score: like a stranger using it). With one person, each sample is tested
  // against all others, which is optimistic because neighbouring frames are nearly identical.
  evaluate() {
    const people = [...new Set(this.people.filter(Boolean))];
    const byPerson = people.length >= 2 && this.people.every(Boolean);
    const perSign = {};
    const confusions = {};
    let correct = 0;

    for (let i = 0; i < this.size; i++) {
      const exclude = byPerson ? j => this.people[j] === this.people[i] : j => j === i;
      const best = this._neighbours(this.features[i], exclude);
      const guess = best.length ? this._vote(best)[0].sign : NONE;
      const truth = this.labels[i];
      perSign[truth] = perSign[truth] || { correct: 0, total: 0 };
      perSign[truth].total++;
      if (guess === truth) {
        correct++;
        perSign[truth].correct++;
      } else {
        const key = `${truth} → ${guess}`;
        confusions[key] = (confusions[key] || 0) + 1;
      }
    }

    return {
      method: byPerson ? `tested on each person using the other ${people.length - 1}` : 'leave-one-out (one person: optimistic)',
      accuracy: this.size ? correct / this.size : 0,
      perSign,
      confusions: Object.entries(confusions).sort((a, b) => b[1] - a[1])
    };
  }
}
