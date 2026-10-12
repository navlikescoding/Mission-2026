// Stabilizer: decides when a prediction is real.
//
// While a hand is moving into position, every in-between frame looks like *some* sign, which
// produced a stream of wrong guesses. The stabilizer only accepts a sign when:
//   1. the hand is holding still (it measures how fast the hand moves, in hand-sizes per second), and
//   2. the classifier has predicted the same sign for HOLD_MS in a row.
//
// Each update returns a state:
//   'nohand'   no hand visible
//   'moving'   hand moving too fast to judge
//   'none'     hand still, but not a known sign
//   'settling' hand still on a sign, waiting for it to be held long enough
//   'stable'   confirmed sign: this is what gets sent to teammates

import { POINTS_PER_HAND } from './features.js';

export const DEFAULTS = {
  holdMs: 300,         // how long the same sign must be held
  motionLimit: 1.2,    // hand-sizes per second; above this the hand counts as moving
  smoothing: 0.35      // how quickly the motion estimate reacts (0-1)
};

const WINDOW_MS = 150;

function handSize(points) {
  const w = points[0], m = points[9];
  return Math.hypot(m[0] - w[0], m[1] - w[1]) || 1e-6;
}

export class Stabilizer {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.history = [];   // recent { t, hand } snapshots
    this.motion = 0;
    this.candidate = null;
    this.candidateSince = 0;
  }

  // Average speed of the first hand's points, in hand-sizes per second (smoothed).
  // Compared with where the hand was ~150 ms ago rather than one frame ago: tracking jitter
  // goes back and forth and cancels out over that time, while real movement adds up.
  _measureMotion(landmarks, now) {
    const hand = landmarks.slice(0, POINTS_PER_HAND).map(p => p.slice());
    this.history.push({ t: now, hand });
    while (this.history.length > 2 && now - this.history[1].t >= WINDOW_MS) this.history.shift();

    const past = this.history[0];
    const elapsed = (now - past.t) / 1000;
    if (elapsed > 0.03) {
      const size = handSize(hand);
      let sum = 0;
      for (let i = 0; i < POINTS_PER_HAND; i++) {
        sum += Math.hypot(hand[i][0] - past.hand[i][0], hand[i][1] - past.hand[i][1]);
      }
      const speed = sum / POINTS_PER_HAND / size / elapsed;
      const a = this.options.smoothing;
      this.motion = this.motion * (1 - a) + speed * a;
    }
    return this.motion;
  }

  // landmarks: 42 points or null; prediction: from the classifier (ignored when landmarks is null).
  update(landmarks, prediction, now = performance.now()) {
    if (!landmarks) {
      this.reset();
      return { state: 'nohand', sign: null, motion: 0 };
    }

    const motion = this._measureMotion(landmarks, now);
    if (motion > this.options.motionLimit) {
      this.candidate = null;
      return { state: 'moving', sign: null, motion };
    }

    if (!prediction || prediction.sign === 'none') {
      this.candidate = null;
      return { state: 'none', sign: null, motion };
    }

    if (prediction.sign !== this.candidate) {
      this.candidate = prediction.sign;
      this.candidateSince = now;
    }
    const held = now - this.candidateSince;
    const state = held >= this.options.holdMs ? 'stable' : 'settling';
    return { state, sign: prediction.sign, motion, progress: Math.min(1, held / this.options.holdMs) };
  }
}
