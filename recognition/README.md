# Recognition (Member 1)

Hand tracking and sign recognition for the ISL glasses project, running entirely in the browser.

## Run it

From the project's main folder:

```
python serve.py
```

Then open **http://localhost:8000/recognition/record.html** in Chrome and allow the camera.
The page must be opened through `localhost`, not by double-clicking the file, or the camera won't work.

## Step 1: Record samples (`record.html`)

1. Type your name, pick a sign.
2. Press **Enter** (or the yellow button): 3-2-1 countdown, then it records for 3 seconds at about 10 samples per second. Hold **Space** instead to record for as long as you hold it.
3. Aim for **30 samples per sign, per person**. While recording, move slightly: closer, further, turned a little. Variety makes recognition more reliable.
4. Record the **"No sign"** class too: hands resting, scratching, reaching. It teaches the model when *not* to guess a sign.
5. Click **Export JSON** to save the file. Samples are also kept in the browser, so refreshing doesn't lose them.

To combine recordings from teammates, each person exports their file and one person uses **Import JSON** to merge them.

Before recording, fix the `hands` value for each sign in `signs.js` (1 or 2), checked against the ISLRTC dictionary. A sample is only captured when that many hands are visible.

## Step 2: Test recognition (`recognize.html`)

Open **http://localhost:8000/recognition/recognize.html**. It uses the samples saved by the recording page automatically.

- **The big label** shows the live prediction. It turns green when the sign is confident enough to be sent to the rest of the app.
- **Events sent** shows exactly what teammates' code receives.
- **Test accuracy** checks the recorded samples. With 2+ people (each typed their name when recording), each person is tested using only the others' samples, which is the honest score: it's how well it works for a stranger such as a judge. With one person, the score is optimistic.
- **Mix-ups** shows which signs get confused. Re-record those, or swap one for a more distinct sign.

Tuning:
- **Match tolerance**: how far a hand can be from the recorded samples and still count as a sign. Lower it if random hand movements get recognized as signs; raise it if real signs show "No sign".
- **Minimum confidence to send**: the share of the 5 nearest samples that must agree before an event is sent.
- **Movement allowed**: raise it if the label says "Moving…" while you're holding still.
- **Hold time before sending**: how long a sign must be held before it counts.

## For teammates: using the recognizer

Put the team's merged samples file at `recognition/data/samples.json`, then in any page served by `serve.py`:

```js
import { startRecognizer } from '/recognition/recognizer.js';

const video = document.querySelector('video');   // the camera starts automatically
await startRecognizer(video, { samplesUrl: '/recognition/data/samples.json' });

window.addEventListener('sign', e => console.log(e.detail));  // { sign: 'medicine', confidence: 0.8 }
```

A `sign` event fires on every camera frame **while a known sign is held still** (after about 0.3 seconds), many times a second. **Nothing is sent while the hand is moving, when no hand is visible, or when the hand isn't doing a known sign**, so in-between hand shapes and the "No sign" class never reach teammates' code.

Optional settings: `minConfidence` (default 0.6), `holdMs` (how long a sign must be held, default 300), `motionLimit` (how much movement counts as "still", default 1.2), `k` (default 5), `canvas` (draws the hand skeleton), `onPrediction` (called on every frame with a `state`: nohand, moving, none, settling or stable).

## Sign location (face vs chest)

The face is tracked too (dashed blue box), and each sign's location is measured relative to the face, in face sizes. So DOCTOR at the chest and the same hand shape at the face are different signs, and both work wherever you stand in the frame. This means:

- **Face the camera** when recording and signing. The recorder won't save samples without a visible face.
- If the face isn't visible during recognition, nothing is recognized (rather than guessing the location).
- Samples recorded before face tracking was added have no location. The Recognize page warns about them; re-record them.

## Sample format

```json
[{ "sign": "medicine", "landmarks": [[x, y, z], ... 42 points], "face": [cx, cy, w, h], "by": "Navaneeth" }]
```

`face` is the signer's face box as fractions of the frame (centre x, centre y, width, height).

Points 0-20 are the first hand, 21-41 the second (all zeros when only one hand is visible). With two hands, the hand further left in the camera image comes first.

## Working offline

The MediaPipe library is bundled in `lib/`. The two models download from Google when the page loads. If the venue's Wi-Fi is unreliable, download them once and save them in `recognition/models/`; the pages use local copies automatically:

- https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task → `models/hand_landmarker.task`
- https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite → `models/blaze_face_short_range.tflite`

## Files

```
signs.js      The sign list (edit here)
hands.js      Webcam + MediaPipe hand and face tracking (shared with the live recognizer)
features.js   Turns hand results into 42-point samples, and samples into classifier features
classifier.js k-nearest-neighbours classifier + accuracy check
recognizer.js Live recognition that sends 'sign' events (what teammates import)
stabilizer.js Only accepts a sign once the hand is held still
record.html   Step 1: recording page (+ record.js, style.css)
recognize.html Step 2: recognition test page (+ recognize.js, recognize.css)
data/         Put the team's merged samples.json here
lib/          Bundled MediaPipe library (version 1.1.0)
models/       Optional local copy of the hand model
```
