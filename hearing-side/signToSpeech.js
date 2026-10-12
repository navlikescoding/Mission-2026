
(function () {
  "use strict";

  // The recognizer already filters out weak matches and waits for a still hand (about 0.3 s)
  // before sending events, and its confidence comes in steps of 20% (0.6, 0.8, 1.0).
  const CONFIDENCE_THRESHOLD = 0.6;
  const STABILITY_DURATION = 300;
  const NO_HAND_TIMEOUT = 700;

  let candidateSign = null;
  let candidateSince = 0;
  let lockedSign = null;
  let idleTimer = null;

  function emit(eventName, detail) {
    window.dispatchEvent(
      new CustomEvent(eventName, { detail })
    );
  }

  function publishStatus(sign, confidence, state, stableForMs = 0) {
    emit("sign-status", {
      sign,
      confidence,
      state,
      stableForMs,
      lockedSign
    });
  }

  function resetCandidate() {
    candidateSign = null;
    candidateSince = 0;
  }

  function handleNoHand() {
    resetCandidate();
    lockedSign = null;

    emit("sign-no-hand", {
      timestamp: Date.now()
    });

    publishStatus(null, null, "no-hand");
  }

  function onSign(event) {
    const data = event.detail || {};
    const sign = typeof data.sign === "string"
      ? data.sign.trim().toLowerCase()
      : "";

    const confidence = Number(data.confidence);
    const now = Date.now();

    // Every incoming event indicates recent recognizer activity.
    clearTimeout(idleTimer);
    idleTimer = setTimeout(handleNoHand, NO_HAND_TIMEOUT);

    // Reject malformed or low-confidence predictions.
    if (
      !sign ||
      !Number.isFinite(confidence) ||
      confidence < CONFIDENCE_THRESHOLD
    ) {
      // Skip this frame, but don't restart the stability timer: one weak frame in the middle
      // of a held sign shouldn't throw away the time it has already been held.
      publishStatus(sign || null, confidence, "low-confidence");
      return;
    }

    // Do not repeatedly accept a sign that is being held.
    if (sign === lockedSign) {
      resetCandidate();
      publishStatus(sign, confidence, "held");
      return;
    }

    // A new candidate must remain consistent for 500 ms.
    if (sign !== candidateSign) {
      candidateSign = sign;
      candidateSince = now;

      publishStatus(sign, confidence, "stabilizing", 0);
      return;
    }

    const stableForMs = now - candidateSince;

    if (stableForMs >= STABILITY_DURATION) {
      lockedSign = sign;
      resetCandidate();

      const acceptedDetail = {
        sign,
        confidence,
        timestamp: now
      };

      emit("sign-accepted", acceptedDetail);
      publishStatus(sign, confidence, "accepted", stableForMs);
      return;
    }

    publishStatus(sign, confidence, "stabilizing", stableForMs);
  }

  // Connect to the recognizer's agreed event contract.
  window.addEventListener("sign", onSign);

  console.log("SignBridge sign smoother initialized.");
})();

// Phase 2: Phrase collection and sentence templates
(function () {
  "use strict";

  const PHRASE_TIMEOUT_MS = 2000;

  const SENTENCE_TEMPLATES = {
    // Single signs
  "medicine": "I need medicine.",
  "fever": "I have a fever.",
  "thank you": "Thank you.",
  "how much": "How much does it cost?",
  "water": "I need water.",
  "doctor": "I need to see a doctor.",
  "help": "I need help.",
  "pain": "I am in pain.",
  "yes": "Yes.",
  "no": "No.",
  "headache": "I have a headache.",
  "again": "Could you say that again, please?",

  // Headache
  "headache|medicine": "I need medicine for a headache.",
  "medicine|headache": "I need medicine for a headache.",
  "headache|fever": "I have a headache and a fever.",
  "fever|headache": "I have a headache and a fever.",
  "headache|doctor": "I have a headache and need a doctor.",
  "doctor|headache": "I have a headache and need a doctor.",
  "headache|pain": "I have a bad headache.",
  "pain|headache": "I have a bad headache.",
  "headache|yes": "Yes, I have a headache.",
  "yes|headache": "Yes, I have a headache.",
  "headache|no": "No, I don't have a headache.",
  "no|headache": "No, I don't have a headache.",
  "how much|headache": "How much is the headache medicine?",
  "headache|how much": "How much is the headache medicine?",

  // Fever and medicine
  "fever|medicine": "I need medicine for a fever.",
  "medicine|fever": "I need medicine for a fever.",
  "fever|doctor": "I have a fever and need a doctor.",
  "doctor|fever": "I have a fever and need a doctor.",
  "fever|help": "Please help me with my fever.",
  "help|fever": "Please help me with my fever.",
  "fever|yes": "Yes, I have a fever.",
  "yes|fever": "Yes, I have a fever.",
  "fever|no": "No, I don't have a fever.",
  "no|fever": "No, I don't have a fever.",

  // Pain and treatment
  "pain|medicine": "I need medicine for the pain.",
  "medicine|pain": "I need medicine for the pain.",
  "pain|doctor": "I have pain and need a doctor.",
  "doctor|pain": "I have pain and need a doctor.",
  "pain|help": "Please help me with the pain.",
  "help|pain": "Please help me with the pain.",
  "pain|fever": "I have pain and a fever.",
  "fever|pain": "I have pain and a fever.",
  "pain|yes": "Yes, I am in pain.",
  "yes|pain": "Yes, I am in pain.",
  "pain|no": "No, I am not in pain.",
  "no|pain": "No, I am not in pain.",

  // Help and assistance
  "help|medicine": "Please help me get my medicine.",
  "medicine|help": "Please help me get my medicine.",
  "help|doctor": "Please help me see a doctor.",
  "doctor|help": "Please help me see a doctor.",
  "help|water": "Please help me get some water.",
  "water|help": "Please help me get some water.",
  "help|yes": "Yes, I need help.",
  "yes|help": "Yes, I need help.",
  "help|no": "No, I don't need help.",
  "no|help": "No, I don't need help.",

  // Water and medicine
  "water|yes": "Yes, please give me water.",
  "yes|water": "Yes, please give me water.",
  "water|no": "No, I don't want water.",
  "no|water": "No, I don't want water.",
  "medicine|water": "Can I take the medicine with water?",
  "water|medicine": "Can I take the medicine with water?",

  // Yes/no responses about medicine
  "medicine|yes": "Yes, I need medicine.",
  "yes|medicine": "Yes, I need medicine.",
  "medicine|no": "No, I don't need medicine.",
  "no|medicine": "No, I don't need medicine.",

  // Doctor-related responses
  "doctor|yes": "Yes, I want to see a doctor.",
  "yes|doctor": "Yes, I want to see a doctor.",
  "doctor|no": "No, I don't want to see a doctor.",
  "no|doctor": "No, I don't want to see a doctor.",
  "doctor|medicine": "I need a doctor and medicine.",
  "medicine|doctor": "I need a doctor and medicine.",

  // Questions about cost
  "how much|medicine": "How much does the medicine cost?",
  "medicine|how much": "How much does the medicine cost?",
  "how much|doctor": "How much does it cost to see a doctor?",
  "doctor|how much": "How much does it cost to see a doctor?",
  "how much|water": "How much does the water cost?",
  "water|how much": "How much does the water cost?",
  "how much|pain": "How much will the pain treatment cost?",
  "pain|how much": "How much will the pain treatment cost?",

  // Thank-you combinations
  "thank you|doctor": "Thank you, doctor.",
  "doctor|thank you": "Thank you, doctor.",
  "thank you|help": "Thank you for your help.",
  "help|thank you": "Thank you for your help.",
  "thank you|medicine": "Thank you for the medicine.",
  "medicine|thank you": "Thank you for the medicine.",
  "thank you|water": "Thank you for the water.",
  "water|thank you": "Thank you for the water.",

  // Three-sign combinations
  "fever|pain|medicine": "I need medicine for my fever and pain.",
  "pain|fever|medicine": "I need medicine for my fever and pain.",
  "medicine|fever|pain": "I need medicine for my fever and pain.",
  "fever|medicine|doctor": "I have a fever and need medicine and a doctor.",
  "doctor|medicine|fever": "I have a fever and need medicine and a doctor.",
  "pain|medicine|doctor": "I have pain and need medicine and a doctor.",
  "doctor|pain|medicine": "I have pain and need medicine and a doctor.",
  "how much|medicine|fever": "How much does the fever medicine cost?",
  "fever|how much|medicine": "How much does the fever medicine cost?",
  "medicine|water|help": "Please help me take my medicine with water."
  };

  let phrase = [];
  let phraseTimer = null;

  function emit(eventName, detail) {
    window.dispatchEvent(
      new CustomEvent(eventName, { detail })
    );
  }

  function updatePhrase() {
    emit("phrase-update", {
      signs: [...phrase],
      text: phrase.join(" ")
    });
  }

  function finishPhrase() {
    if (phrase.length === 0) return;

    const completedSigns = [...phrase];
    const key = completedSigns.join("|");

    let sentence = SENTENCE_TEMPLATES[key];

    if (!sentence) {
      // Fallback: join the recognized signs into a phrase.
      sentence = completedSigns.join(" ");
      sentence =
        sentence.charAt(0).toUpperCase() + sentence.slice(1);

      if (!/[.!?]$/.test(sentence)) {
        sentence += ".";
      }
    }

    emit("sentence-ready", {
      text: sentence,
      signs: completedSigns,
      timestamp: Date.now()
    });

    phrase = [];
    phraseTimer = null;
    updatePhrase();
  }

  // While the signer is still signing (holding a sign, or moving into the next one), keep the
  // phrase open. The recognizer only sends 'sign' events while a sign is held, so 2 seconds
  // without any event means the signer has finished.
  window.addEventListener("sign", function () {
    if (phrase.length === 0) return;
    clearTimeout(phraseTimer);
    phraseTimer = setTimeout(finishPhrase, PHRASE_TIMEOUT_MS);
  });

  window.addEventListener("sign-accepted", function (event) {
    const sign = event.detail?.sign;

    if (typeof sign !== "string" || !sign.trim()) return;

    phrase.push(sign.trim().toLowerCase());

    updatePhrase();

    // Every accepted sign restarts the 2-second timer.
    clearTimeout(phraseTimer);
    phraseTimer = setTimeout(
      finishPhrase,
      PHRASE_TIMEOUT_MS
    );
  });

  console.log("SignBridge sentence builder initialized.");
})();


/* Phase 3: Speech synthesis and sentence handoff */
(function () {
  "use strict";

  const synth = window.speechSynthesis;

  function emit(eventName, detail) {
    window.dispatchEvent(
      new CustomEvent(eventName, { detail })
    );
  }

  function getPreferredVoice() {
    const voices = synth.getVoices();

    return (
      voices.find(voice =>
        voice.lang.toLowerCase() === "en-in"
      ) ||
      voices.find(voice =>
        voice.lang.toLowerCase().startsWith("en")
      ) ||
      null
    );
  }

  function createUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getPreferredVoice();

    utterance.lang = voice ? voice.lang : "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    if (voice) {
      utterance.voice = voice;
    }

    return utterance;
  }

  // Call this from a button click to test/enable speech.
  function enableSpeech() {
    if (!("speechSynthesis" in window)) {
      emit("speech-error", {
        text: "",
        error: "Speech synthesis is not supported."
      });
      return;
    }

    synth.resume();

    const testUtterance = createUtterance(
      "SignBridge speech is ready."
    );

    synth.speak(testUtterance);
  }

  window.SignBridgeSpeech = {
    enable: enableSpeech
  };

  window.addEventListener("sentence-ready", event => {
    const text = event.detail?.text;

    if (typeof text !== "string" || !text.trim()) {
      return;
    }

    if (!("speechSynthesis" in window)) {
      emit("speech-error", {
        text,
        error: "Speech synthesis is not supported."
      });
      return;
    }

    // The main app's "Glasses Audio" switch turns speech off; the signer's screen still
    // gets the sentence. ('handled' tells the main app this sentence needs no further speech.)
    const audioSwitch = document.getElementById("tts-audio-toggle");
    if (audioSwitch && !audioSwitch.checked) {
      emit("signer-said", { text, handled: true });
      return;
    }

    const utterance = createUtterance(text);

    utterance.onstart = () => {
      emit("speech-start", { text });
    };

    utterance.onend = () => {
      // Notify the rest of the app after speech finishes. 'handled' = already spoken here,
      // so the main app doesn't speak it a second time.
      emit("signer-said", { text, handled: true });
    };

    utterance.onerror = event => {
      emit("speech-error", {
        text,
        error: event.error
      });
      // Still show the sentence on the signer's side, even if it couldn't be spoken.
      emit("signer-said", { text, handled: true });
    };

    // The browser queues utterances in order.
    synth.speak(utterance);
  });

  console.log("SignBridge speech module initialized.");
})();
