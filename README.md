# AURA-ISL: Two-Way ISL Communication on Smart Glasses

A hearing person wears smart glasses (simulated by a laptop webcam and mic). The glasses recognize the signer's Indian Sign Language and speak it in the hearing person's ear; the hearing person's spoken reply appears as large text for the signer.

Built for an 8-hour hackathon: plain HTML, CSS and JavaScript, no build step, runs entirely in the browser.

## Run it

```
python serve.py
```

Then open **http://localhost:8000/** in Chrome or Edge, allow the camera and microphone, and click anywhere once (Chrome only allows speech after a click).

It must be served by `serve.py` (or another local server). Double-clicking `index.html` doesn't work: the camera, the sign recognizer and the speech features all need `http://localhost`.

## How the parts connect

```
Webcam (js/webcam.js)
  → sign recognizer (recognition/)            emits 'sign' while a sign is held still
  → sentence builder + speech (hearing-side/) emits 'signer-said' after speaking the sentence
  → signer's display (js/signer.js)           shows it in the conversation

Mic (js/speech.js)                            emits 'reply' when the hearing person finishes speaking
  → signer's display (js/signer.js)           shows it in very large text
```

`js/integration.js` wires the recognizer to the webcam and shows the live sign, the phrase being built and the spoken sentence inside the glasses view.

| Folder / file | Owner | What it does |
| :--- | :--- | :--- |
| `recognition/` | Member 1 | Hand + face tracking (MediaPipe), sign recorder, k-nearest-neighbours classifier, live recognizer. See `recognition/README.md`. |
| `recognition/data/samples.json` | Member 1 | The recorded signs the recognizer learns from |
| `hearing-side/signToSpeech.js` | Member 3 | Accepts steady signs, builds English sentences from templates, speaks them |
| `hearing-side/index.html` | Member 3 | Standalone test page for the sign-to-speech part |
| `index.html`, `css/`, `js/` | Member 4 | Main app: glasses view, speech-to-text, signer's display, test bar |
| `mobile.html`, `js/sync.js` | Member 4 | Stretch goal: signer's view on a phone |
| `js/integration.js`, `css/integration.css` | Integration | Connects the recognizer and sign-to-speech to the main app |

## Events

| Event | Sent by | Detail |
| :--- | :--- | :--- |
| `sign` | recognizer | `{ sign, confidence }`, many times a second while a sign is held still |
| `sign-accepted`, `phrase-update`, `sentence-ready` | sign-to-speech | progress of the sentence being built |
| `signer-said` | sign-to-speech, test bar, phone | `{ text, handled }`; `handled: true` means it was already spoken |
| `reply` | speech-to-text, phone | `{ text, lang }` |

## Demo tips

- **Use earbuds** for the glasses audio if you can. Without them, the laptop speaker can be heard by the mic. The mic ignores audio while the laptop is speaking, but earbuds are more reliable.
- **Face the camera** while signing: the sign's location (face vs chest) is measured from the face.
- The **Simulate / Test** bar sends sentences and replies without a camera or mic, as a backup if something fails live.
- **Offline:** save the two model files into `recognition/models/` beforehand (see `recognition/README.md`). Phone sync and the QR code need internet (they use public PeerJS and QR services).
