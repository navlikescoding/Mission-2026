// Turning MediaPipe results into samples.
//
// Sample format (agreed with the team):
//   { "sign": "medicine", "landmarks": [[x, y, z], ... 42 points] }
// Points 0-20 are the first hand, 21-41 the second. When only one hand is visible it goes in
// the first slot and the second slot is all zeros. With two hands, they're ordered by
// position on screen (left of the image first), which is steadier than MediaPipe's
// left/right labels.

export const POINTS_PER_HAND = 21;
const ZERO_HAND = Array.from({ length: POINTS_PER_HAND }, () => [0, 0, 0]);

const round = v => Math.round(v * 10000) / 10000;

// ---------- Ignoring other people's hands ----------
//
// The camera also sees people behind the signer. Their hands are small in the frame because
// they're further away, so a hand only counts if it's big enough: the distance from the wrist
// to the base of the middle finger must be at least MIN_HAND_SIZE of the frame. That's true
// for someone signing within about 1.5 m of a laptop camera, and false for people behind them.
// Of the hands that are big enough, the two biggest are used.

export const MIN_HAND_SIZE = 0.055;

export function handSizeOf(hand) {
  return Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y);
}

export function isUsableHand(hand) {
  return handSizeOf(hand) >= MIN_HAND_SIZE;
}

// The signer's hands: usable hands only, biggest two.
export function signerHands(result) {
  const hands = (result && result.landmarks) || [];
  return hands
    .filter(isUsableHand)
    .sort((a, b) => handSizeOf(b) - handSizeOf(a))
    .slice(0, 2);
}

export function handCount(result) {
  return signerHands(result).length;
}

// Returns 42 [x, y, z] points, or null when none of the signer's hands are visible.
export function toLandmarks(result) {
  const hands = signerHands(result);
  if (!hands.length) return null;

  const ordered = hands.sort((a, b) => a[0].x - b[0].x);
  const toPoints = hand => hand.map(p => [round(p.x), round(p.y), round(p.z)]);

  const first = toPoints(ordered[0]);
  const second = ordered[1] ? toPoints(ordered[1]) : ZERO_HAND.map(p => p.slice());
  return first.concat(second);
}

// ---------- Features for the classifier ----------
//
// Raw points depend on where the hand is and how close it is to the camera. The classifier
// needs the hand's SHAPE, so each hand is normalized: points are measured from the wrist and
// divided by the hand's size (wrist to the base of the middle finger).
//
// LOCATION matters in ISL (DOCTOR is signed at the chest; the same hand shape at the face is a
// different sign), so the hand's position is measured RELATIVE TO THE SIGNER'S FACE, in face
// sizes: "half a face below the chin" means the same thing wherever the person stands in the
// frame or however far they are from the camera.

const WRIST = 0, MIDDLE_BASE = 9;
const Z_WEIGHT = 0.5;          // MediaPipe's depth estimate is noisy, so it counts for less
const TWO_HANDS_WEIGHT = 3;    // one-hand vs two-hand signs should never be confused
const RELATIVE_WEIGHT = 0.5;   // where the second hand is relative to the first
const LOCATION_WEIGHT = 1.5;   // where the hand is relative to the face (face vs chest vs side)
const FACE_FLAG_WEIGHT = 1;    // whether a face was visible (samples without a face match each other)

export const FEATURE_SIZE = POINTS_PER_HAND * 3 * 2 + 2 + 1 + 3;

// Faces are stored in samples as [cx, cy, w, h] (fractions of the frame). Accepts that, a
// { cx, cy, w, h } object, or nothing.
export function faceToArray(face) {
  if (!face) return null;
  const arr = Array.isArray(face) ? face : [face.cx, face.cy, face.w, face.h];
  if (arr.length !== 4 || !(arr[2] > 0) || !(arr[3] > 0)) return null;
  return arr.map(v => Math.round(v * 10000) / 10000);
}

function isZeroHand(points) {
  return points.every(p => p[0] === 0 && p[1] === 0 && p[2] === 0);
}

function handScale(points) {
  const w = points[WRIST], m = points[MIDDLE_BASE];
  return Math.hypot(m[0] - w[0], m[1] - w[1]) || 1e-6;
}

function writeHand(out, offset, points, scale) {
  const w = points[WRIST];
  for (let i = 0; i < POINTS_PER_HAND; i++) {
    const p = points[i];
    out[offset + i * 3] = (p[0] - w[0]) / scale;
    out[offset + i * 3 + 1] = (p[1] - w[1]) / scale;
    out[offset + i * 3 + 2] = ((p[2] - w[2]) / scale) * Z_WEIGHT;
  }
}

// landmarks: the 42 points from toLandmarks() or a recorded sample.
// face: the signer's face ([cx, cy, w, h] or { cx, cy, w, h }), or null if not visible.
export function toFeatures(landmarks, face) {
  const out = new Float32Array(FEATURE_SIZE);
  const h1 = landmarks.slice(0, POINTS_PER_HAND);
  const h2 = landmarks.slice(POINTS_PER_HAND, POINTS_PER_HAND * 2);
  const twoHands = h2.length === POINTS_PER_HAND && !isZeroHand(h2);
  const s1 = handScale(h1);
  const handLen = POINTS_PER_HAND * 3;

  writeHand(out, 0, h1, s1);
  if (twoHands) writeHand(out, handLen, h2, handScale(h2));

  let i = handLen * 2;
  out[i++] = twoHands ? ((h2[WRIST][0] - h1[WRIST][0]) / s1) * RELATIVE_WEIGHT : 0;
  out[i++] = twoHands ? ((h2[WRIST][1] - h1[WRIST][1]) / s1) * RELATIVE_WEIGHT : 0;
  out[i++] = twoHands ? TWO_HANDS_WEIGHT : 0;

  // Where the centre of the (first) hand is, measured from the face centre in face sizes.
  const f = faceToArray(face);
  if (f) {
    const [cx, cy, w, h] = f;
    out[i++] = ((h1[MIDDLE_BASE][0] - cx) / w) * LOCATION_WEIGHT;
    out[i++] = ((h1[MIDDLE_BASE][1] - cy) / h) * LOCATION_WEIGHT;
    out[i++] = FACE_FLAG_WEIGHT;
  }
  return out;
}
