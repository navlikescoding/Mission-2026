AURA-ISL

Two-way Indian Sign Language conversation on smart glasses.

The hearing person wears the glasses. The glasses read the signer's ISL and speak it in the hearing person's ear. When the hearing person replies, their words appear as large text for the signer. Hands-free, two-way, and built for Indian Sign Language.

Built in 8 hours at Mission '26 | Experto Innovatum (SCOPE, VIT Chennai, in collaboration with BIS), Specially Abled domain.

The problem

A deaf person who uses Indian Sign Language walks into a pharmacy with a fever. The pharmacist doesn't sign, and there's no interpreter: India has far fewer certified ISL interpreters than the people who need them. So they write notes, point, or bring a family member along. Something as simple as buying medicine depends on someone else.

Existing tools don't fix this:

Someone has to hold up a phone, which breaks the flow of a conversation.
Most only work one way: signs to text, with no way for the hearing person to reply.
Most are built for American Sign Language, not ISL.
Our solution
	
Hands-free	The hearing person wears the glasses, so the camera naturally faces the signer and nobody holds a phone.
Two-way	Signs become speech for the hearing person; their spoken reply becomes large text for the signer.
ISL-first	Trained on Indian Sign Language, including where a sign is made (face vs chest), which ISL depends on.
Private	Sign recognition runs entirely on the device. No video is uploaded.

In this prototype, a laptop webcam and microphone stand in for the glasses' camera and mic.

Demo: a pharmacy conversation
The customer signs FEVER, then MEDICINE. → The glasses say: "I need medicine for a fever."
The pharmacist replies by voice: "Take this twice a day after food." → The reply appears in large text on the signer's screen.
The customer signs HOW MUCH → "How much does it cost?"
The customer signs THANK YOU.

The whole conversation is kept as a chat on the signer's screen, so they can scroll back to the dosage.


1. Sign recognition (recognition/)
Hand and face tracking: Google's MediaPipe finds up to 4 hands (21 points each) and the face in every camera frame, in the browser.
Shape, not position: each hand's points are measured from the wrist and scaled by the hand's size, so a sign looks the same whether you're near or far, left or right in the frame.
Location matters in ISL: the hand's position is measured relative to the signer's face, in face-sized units. DOCTOR at the chest and the same hand shape at the face are different signs, wherever the person stands.
Classifier: k-nearest neighbours (k = 5) compares the hand with signs we recorded ourselves. No deep-learning training: new signs work as soon as they're recorded.
Safeguards for live use:
A sign only counts once the hand is held still for about 0.3 s, so in-between movements are never guessed.
Hands that don't match any recorded sign are rejected as "no sign".
People in the background are ignored (their hands are too small in the frame).
If the face isn't visible, nothing is recognised, rather than guessing the location.

2. Signs to sentences to speech (hearing-side/)
Accepts a sign once it's steady, so one held sign counts once.
Collects signs into a phrase; when the signer stops for 2 seconds, it becomes a natural sentence from templates: fever + medicine → "I need medicine for a fever." Unknown combinations still come out as readable words.
Speaks it with the browser's text-to-speech, in an Indian English voice where available.

3. Glasses view, speech-to-text and signer's screen (root app)
Glasses view: live camera with the hand skeleton, the sign being read, the phrase being built and the sentence being spoken.
Speech-to-text: push-to-talk (button or Space) or continuous listening, in English, Hindi or Tamil.
Signer's screen: the latest reply in very large, high-contrast text, font-size controls, and the full conversation as a colour-coded chat.
Phone view (stretch goal): scan a QR code to open the signer's screen on a phone.
No feedback loop: the microphone ignores audio while the app itself is speaking.
Getting started

Requirements: Python 3 (only to serve the files) and Google Chrome or Microsoft Edge. No installs, no build step.

bash
git clone https://github.com/navlikescoding/Mission-2026.git
cd Mission-2026
python serve.py

Open http://localhost:8000/, allow the camera and microphone, and click anywhere once (Chrome only allows speech after a click).


Tips for the best recognition

Face the camera and stay within about 1.5 m of it.
Hold each sign still until the glasses view shows a ✓.
Use earbuds for the glasses audio if you can.

Adding a new sign
Add it to recognition/signs.js, e.g. { id: 'tablet', label: 'Tablet', hands: 1 }.
Record about 3 attempts on record.html, lowering your hand between attempts.
Check for mix-ups with Test accuracy on recognize.html.
Export JSON and save it as recognition/data/samples.json.
Optionally add a sentence in hearing-side/signToSpeech.js, e.g. "tablet": "I need a tablet."

Working offline
The MediaPipe library is bundled in recognition/lib/. To run with no internet at all, save the two model files into recognition/models/ once (links in recognition/README.md). Speech-to-text and phone sync still need internet.

Signs supported
Recorded for a complete pharmacy conversation:
medicine · pain · fever · headache · how much · yes · no · thank you · help · water · doctor · again
plus a "no sign" class (resting or random hand positions), so the system knows when not to guess.
Accuracy: 98% on our recorded samples (leave-one-out test). This is measured on one person's recordings, so it's optimistic for new signers; recording a few more people improves it.

Accessibility standards (BIS)
AURA-ISL was designed following IS 17802, the Bureau of Indian Standards' standard for accessibility of ICT products and services, which is aligned with EN 301 549 and WCAG 2.1.

Project structure
├── index.html            Main app (glasses view + signer's screen)
├── mobile.html           Signer's screen on a phone
├── serve.py              Local server: python serve.py
├── css/                  App styles (+ integration.css for the glasses overlay)
├── js/
│   ├── webcam.js         Camera
│   ├── speech.js         Speech-to-text (en-IN, hi-IN, ta-IN)
│   ├── signer.js         Signer's screen and conversation history
│   ├── sync.js           Phone sync (WebRTC via PeerJS) and QR code
│   ├── mock-test.js      Test bar for demos without camera or mic
│   └── integration.js    Connects the recognizer and sign-to-speech to the app
├── hearing-side/
│   └── signToSpeech.js   Steady-sign filter, sentence templates, speech
└── recognition/
    ├── signs.js          The sign list
    ├── hands.js          Webcam + MediaPipe hand and face tracking
    ├── features.js       Normalised shape and face-relative location
    ├── classifier.js     k-nearest neighbours + accuracy check
    ├── stabilizer.js     Hold-still check
    ├── recognizer.js     Live recognition → 'sign' events
    ├── record.html       Recording tool
    ├── recognize.html    Test and tuning tool
    ├── data/samples.json Recorded signs
    └── lib/              Bundled MediaPipe Tasks Vision 1.1.0


Limitations
We'd rather be upfront:

Single, held signs only. It doesn't understand continuous signing; continuous sign language translation is still an open research problem.
A small vocabulary: 12 signs plus "no sign", chosen to cover one complete conversation.
Trained mostly on one signer, so accuracy for new people is lower than the 98% above until more people are recorded.
The laptop stands in for the glasses in this prototype.
Speech-to-text and phone sync need internet (the browser's speech service and public PeerJS / QR services).


Team
Member	Role
Navaneeth	- Sign recognition: tracking, classifier, recording tools, integration
Shyam Kumar M	- Sign list, user research, pitch and demo
Evan Joe Nelson G B	- Signs to sentences to speech
Dinesh Karthick S	- App interface, speech-to-text, signer's screen, phone sync

Acknowledgements
MediaPipe by Google (Apache 2.0) for hand and face tracking
PeerJS for phone sync, and the browser's Web Speech API for speech
IS 17802, Bureau of Indian Standards
The ISLRTC dictionary, for checking signs
