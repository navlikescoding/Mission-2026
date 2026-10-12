// Webcam + MediaPipe hand and face tracking, shared by the recording page and the live recognizer.
//
// Uses the bundled MediaPipe library in ./lib (works without internet). The models load from
// ./models/ if you've saved copies there, otherwise from Google.
//
// The face is tracked so a sign's LOCATION can be measured relative to the signer's body
// (at the face vs at the chest), not relative to the camera frame.

import { FilesetResolver, HandLandmarker, FaceDetector } from './lib/vision_bundle.mjs';
import { isUsableHand } from './features.js';

const MODELS = {
  hand: {
    local: new URL('./models/hand_landmarker.task', import.meta.url).href,
    remote: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    name: 'hand_landmarker.task'
  },
  face: {
    local: new URL('./models/blaze_face_short_range.tflite', import.meta.url).href,
    remote: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    name: 'blaze_face_short_range.tflite'
  }
};
const WASM_PATH = new URL('./lib/wasm', import.meta.url).href;
const FACE_EVERY_N_FRAMES = 3;   // faces move slowly, so check every 3rd frame to save time
const FACE_KEEP_MS = 600;        // keep using the last face for this long if it's briefly lost

export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

let filesetPromise = null;
const getFileset = () => (filesetPromise ||= FilesetResolver.forVisionTasks(WASM_PATH));

async function pickModel(model) {
  try {
    const res = await fetch(model.local, { method: 'HEAD', cache: 'no-store' });
    if (res.ok) return { path: model.local, source: 'local copy' };
  } catch (err) { /* no local copy */ }
  return { path: model.remote, source: 'Google (online)' };
}

// Creates a MediaPipe task, trying the GPU first (faster) and falling back to the CPU.
async function createTask(TaskClass, model, extraOptions) {
  const fileset = await getFileset();
  const picked = await pickModel(model);
  const options = delegate => ({
    baseOptions: { modelAssetPath: picked.path, delegate },
    runningMode: 'VIDEO',
    ...extraOptions
  });
  try {
    return { task: await TaskClass.createFromOptions(fileset, options('GPU')), delegate: 'GPU', source: picked.source };
  } catch (err) {
    console.warn('GPU not available, using CPU', err);
    try {
      return { task: await TaskClass.createFromOptions(fileset, options('CPU')), delegate: 'CPU', source: picked.source };
    } catch (err2) {
      if (picked.source !== 'local copy' && /fetch/i.test(String(err2))) {
        throw new Error(`Couldn't download ${model.name}. Check your internet, or save it into recognition/models/ (see README).`);
      }
      throw err2;
    }
  }
}

// Tracks up to 4 hands so people in the background can't crowd out the signer's two hands;
// features.js then keeps only the signer's (biggest) hands.
export async function createHandLandmarker({ numHands = 4 } = {}) {
  const { task, delegate, source } = await createTask(HandLandmarker, MODELS.hand, {
    numHands,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  return { landmarker: task, modelSource: source, delegate };
}

// Returns the face detector, or null if it can't load (recognition still works, just without
// face-relative location).
export async function createFaceDetector() {
  try {
    const { task } = await createTask(FaceDetector, MODELS.face, { minDetectionConfidence: 0.5 });
    return task;
  } catch (err) {
    console.warn('Face detector unavailable; sign location will not be used', err);
    return null;
  }
}

// The biggest face (the signer, who is closest to the camera), as fractions of the frame:
// { cx, cy, w, h } (centre x/y, width, height). Null when no face is visible.
function detectFace(faceDetector, video, timestamp) {
  const { detections } = faceDetector.detectForVideo(video, timestamp);
  const W = video.videoWidth, H = video.videoHeight;
  let best = null;
  for (const d of detections || []) {
    const b = d.boundingBox;
    if (!b || !W || !H) continue;
    if (!best || b.width * b.height > best.width * best.height) best = b;
  }
  if (!best) return null;
  return {
    cx: (best.originX + best.width / 2) / W,
    cy: (best.originY + best.height / 2) / H,
    w: best.width / W,
    h: best.height / H
  };
}

export async function startCamera(video) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera not available. Open this page from http://localhost, not by double-clicking the file.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

// Runs hand detection (and face detection, if a face detector is given) on every new camera
// frame and calls onResult(result, fps, face). Returns a stop() function.
export function runHandLoop(video, landmarker, onResult, { faceDetector = null } = {}) {
  let running = true, lastTime = -1, frames = 0, fps = 0, fpsStart = performance.now();
  let frameNo = 0, face = null, faceSeenAt = 0;

  const tick = () => {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);

      if (faceDetector && frameNo++ % FACE_EVERY_N_FRAMES === 0) {
        const found = detectFace(faceDetector, video, now);
        if (found) { face = found; faceSeenAt = now; }
      }
      if (face && now - faceSeenAt > FACE_KEEP_MS) face = null;

      frames++;
      if (now - fpsStart >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsStart));
        frames = 0;
        fpsStart = now;
      }
      onResult(result, fps, face);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { running = false; };
}

// Draws the hand skeletons (and the face box) onto a canvas laid over the video.
// The signer's hands are drawn in colour; hands that are ignored (too small, so probably someone
// in the background) are drawn faint grey.
export function drawHands(canvas, video, result, face) {
  const ctx = canvas.getContext('2d');
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (face) {
    ctx.save();
    ctx.strokeStyle = 'rgba(138, 180, 248, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect((face.cx - face.w / 2) * canvas.width, (face.cy - face.h / 2) * canvas.height,
      face.w * canvas.width, face.h * canvas.height);
    ctx.restore();
  }

  const colors = ['#f5b400', '#4fc3f7'];
  let used = 0;
  result.landmarks.forEach(hand => {
    const usable = isUsableHand(hand);
    ctx.globalAlpha = usable ? 1 : 0.35;
    ctx.strokeStyle = usable ? colors[used++ % 2] : '#9aa1ad';
    ctx.lineWidth = usable ? 3 : 2;
    for (const { start, end } of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(hand[start].x * canvas.width, hand[start].y * canvas.height);
      ctx.lineTo(hand[end].x * canvas.width, hand[end].y * canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, usable ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}
