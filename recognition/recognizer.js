// Live sign recognizer: the piece teammates plug into the app.
//
// Usage (in any page served from this project):
//
//   import { startRecognizer } from '/recognition/recognizer.js';
//   const video = document.querySelector('video');
//   await startRecognizer(video, { samplesUrl: '/recognition/data/samples.json' });
//
//   window.addEventListener('sign', e => console.log(e.detail)); // { sign: 'medicine', confidence: 0.8 }
//
// A 'sign' event is sent for every camera frame while a known sign is HELD STILL (after about
// 0.3 s), many times a second. Nothing is sent while the hand is moving, when no hand is
// visible, or when the hand isn't doing a known sign, so silence means "no sign right now".

import { createHandLandmarker, createFaceDetector, startCamera, runHandLoop, drawHands } from './hands.js';
import { toLandmarks } from './features.js';
import { KNNClassifier, NONE } from './classifier.js';
import { Stabilizer } from './stabilizer.js';

export const RECORDER_STORAGE_KEY = 'isl-recorder-samples-v1';

// Loads samples from: an array you pass, a JSON file URL, or the recording page's saved data.
export async function loadSamples({ samples, samplesUrl } = {}) {
  if (Array.isArray(samples)) return samples;
  if (samplesUrl) {
    const res = await fetch(samplesUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Couldn't load samples from ${samplesUrl} (${res.status})`);
    return res.json();
  }
  try {
    const saved = JSON.parse(localStorage.getItem(RECORDER_STORAGE_KEY) || '[]');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (err) { /* fall through */ }
  throw new Error('No samples found. Record some on record.html, or pass samplesUrl.');
}

/**
 * Starts the camera (if the video isn't already showing one), hand tracking and recognition.
 *
 * options:
 *   samples / samplesUrl   training data (default: what's saved by record.html in this browser)
 *   classifier             an already-trained KNNClassifier (skips loading samples)
 *   k                      neighbours to compare (default 5)
 *   minConfidence          only send 'sign' events at or above this (default 0.6)
 *   holdMs                 how long a sign must be held still before it's sent (default 300)
 *   motionLimit            hand-sizes per second above which the hand counts as moving (default 1.2)
 *   canvas                 optional canvas over the video to draw the hand skeleton on
 *   onPrediction(p, raw)   optional callback for every frame. p.state is one of
 *                          'nohand' | 'moving' | 'none' | 'settling' | 'stable'
 *
 * Returns { classifier, stabilizer, stop(), setThreshold(v), setMinConfidence(v) }.
 */
export async function startRecognizer(video, options = {}) {
  const { k = 5, canvas, onPrediction } = options;
  let minConfidence = options.minConfidence ?? 0.6;

  const classifier = options.classifier || new KNNClassifier({ k }).fit(await loadSamples(options));
  // A classifier passed in may be filled later (the test page does this); one we load must have data.
  if (!options.classifier && !classifier.size) throw new Error('The sample file is empty.');

  if (!video.srcObject) await startCamera(video);
  const [{ landmarker }, faceDetector] = await Promise.all([
    createHandLandmarker({ numHands: 4 }),
    createFaceDetector()
  ]);

  const stabilizer = new Stabilizer({
    ...(options.holdMs != null && { holdMs: options.holdMs }),
    ...(options.motionLimit != null && { motionLimit: options.motionLimit })
  });

  const stop = runHandLoop(video, landmarker, (result, fps, face) => {
    if (canvas) drawHands(canvas, video, result, face);
    const landmarks = toLandmarks(result);
    // Without the face, a sign's location (face vs chest) can't be checked, so rather than risk a
    // wrong guess, nothing is recognized until the face is back in view. (Only when the samples
    // were recorded with face tracking and the face detector is running.)
    const needsFace = faceDetector && classifier.size > (classifier.withoutFace || 0);
    const prediction = !landmarks
      ? { sign: null, confidence: 0, distance: Infinity, ranked: [] }
      : needsFace && !face
        ? { sign: NONE, confidence: 0, distance: Infinity, ranked: [] }
        : classifier.predict(landmarks, face);
    const status = stabilizer.update(landmarks, prediction);

    prediction.state = status.state;
    prediction.motion = status.motion;
    prediction.progress = status.progress || 0;
    prediction.fps = fps;
    prediction.faceVisible = !!face;
    if (onPrediction) onPrediction(prediction, result);

    if (status.state === 'stable' && prediction.confidence >= minConfidence) {
      window.dispatchEvent(new CustomEvent('sign', {
        detail: { sign: prediction.sign, confidence: Math.round(prediction.confidence * 100) / 100 }
      }));
    }
  }, { faceDetector });

  return {
    classifier,
    stabilizer,
    stop,
    setThreshold(value) { classifier.threshold = value; },
    setMinConfidence(value) { minConfidence = value; }
  };
}
