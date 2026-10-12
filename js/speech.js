/**
 * speech.js - Web Speech API (Speech-to-Text) Engine
 * Listens to the hearing person, renders live interim transcripts,
 * and emits the 'reply' CustomEvent when final.
 * 
 * Supports: en-IN, hi-IN, ta-IN, Push-to-Talk, and Continuous Auto-Restart.
 */

(function () {
  'use strict';

  // DOM Elements
  const btnPtt = document.getElementById('btn-push-to-talk');
  const pttLabel = document.getElementById('ptt-btn-label');
  const toggleContinuous = document.getElementById('toggle-continuous');
  const languageSelect = document.getElementById('language-select');
  const interimDisplay = document.getElementById('interim-transcript-display');
  const micStatusLabel = document.getElementById('mic-status-label');
  const speechModeIndicator = document.getElementById('speech-mode-indicator');
  const unsupportedAlert = document.getElementById('speech-unsupported-alert');
  const hudAudioBars = document.getElementById('hud-audio-bars');

  // Check Web Speech API support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error('[Speech] Web Speech API (SpeechRecognition) is not supported in this browser.');
    if (unsupportedAlert) unsupportedAlert.classList.remove('hidden');
    if (btnPtt) btnPtt.disabled = true;
    if (toggleContinuous) toggleContinuous.disabled = true;
    if (interimDisplay) {
      interimDisplay.textContent = 'Speech recognition not supported in this browser. Please open in Google Chrome or Microsoft Edge.';
      interimDisplay.classList.add('error');
    }
    return;
  }

  // When the laptop last finished speaking (see onresult)
  let lastSpokeAt = 0;
  setInterval(() => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) lastSpokeAt = Date.now();
  }, 150);

  // Recognition Instance
  let recognition = null;
  let isListening = false;
  let isContinuous = false;
  let isPttActive = false;
  let restartTimeoutId = null;
  let currentLanguage = languageSelect ? languageSelect.value : 'en-IN';

  /**
   * Instantiate and configure SpeechRecognition
   */
  function createRecognition() {
    if (recognition) {
      try { recognition.abort(); } catch (_) {}
    }

    recognition = new SpeechRecognition();
    recognition.lang = currentLanguage;
    recognition.continuous = isContinuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Triggered when speech engine starts listening
    recognition.onstart = () => {
      isListening = true;
      updateVisualState(true);
      console.log(`[Speech] Started listening in [${currentLanguage}] (Continuous: ${isContinuous})`);
    };

    // Live speech results (Interim + Final)
    recognition.onresult = (event) => {
      // While the laptop is speaking a signed sentence (or just finished), the mic would pick up
      // its own voice and send it to the signer as the hearing person's reply. Ignore that audio.
      const synth = window.speechSynthesis;
      if (synth && (synth.speaking || Date.now() - lastSpokeAt < 800)) return;

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        const text = item[0].transcript;

        if (item.isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      // 1. Show live interim results live on screen
      if (interimTranscript) {
        interimDisplay.textContent = `"${interimTranscript.trim()}"`;
        interimDisplay.className = 'interim-text live';
      }

      // 2. When result is final, emit CustomEvent('reply') as required by spec:
      // window.dispatchEvent(new CustomEvent('reply', { detail: { text: 'Take this twice a day' } }))
      if (finalTranscript.trim()) {
        const cleanFinal = finalTranscript.trim();
        console.log(`[Speech] Final utterance recognized: "${cleanFinal}"`);

        // Emit exact event requested by prompt
        window.dispatchEvent(new CustomEvent('reply', {
          detail: {
            text: cleanFinal,
            lang: currentLanguage,
            timestamp: Date.now()
          }
        }));

        // Reset interim display after brief display
        interimDisplay.textContent = `Latest final: "${cleanFinal}"`;
        interimDisplay.className = 'interim-text';
      }
    };

    // Handle recognition errors gracefully
    recognition.onerror = (event) => {
      console.warn('[Speech] Recognition event error:', event.error);
      if (event.error === 'not-allowed') {
        interimDisplay.textContent = 'Microphone permission blocked. Please allow mic in browser settings.';
        stopListening(false);
      } else if (event.error === 'no-speech') {
        // Normal silence timeout; if continuous, onend will auto-restart
      } else if (event.error === 'network') {
        interimDisplay.textContent = 'Network error communicating with speech recognition service.';
      }
    };

    // When recognition stops
    recognition.onend = () => {
      isListening = false;

      // CONTINUOUS LISTENING RESTART LOGIC:
      // If continuous listening toggle is ON, restart automatically when recognition stops
      if (isContinuous && toggleContinuous && toggleContinuous.checked) {
        console.log('[Speech] Continuous mode active: Auto-restarting recognition...');
        clearTimeout(restartTimeoutId);
        restartTimeoutId = setTimeout(() => {
          if (isContinuous && toggleContinuous.checked) {
            startListening();
          }
        }, 200);
      } else {
        updateVisualState(false);
      }
    };
  }

  /**
   * Start listening
   */
  function startListening() {
    if (!recognition) createRecognition();

    try {
      recognition.lang = currentLanguage;
      recognition.continuous = isContinuous;
      recognition.start();
    } catch (err) {
      // If already started or transitioning, ignore InvalidStateError
      if (err.name !== 'InvalidStateError') {
        console.error('[Speech] Failed to start:', err);
      }
    }
  }

  /**
   * Stop listening
   */
  function stopListening(forceAll = true) {
    clearTimeout(restartTimeoutId);
    if (forceAll) {
      isContinuous = false;
      if (toggleContinuous) toggleContinuous.checked = false;
    }

    if (recognition && isListening) {
      try {
        recognition.stop();
      } catch (err) {
        try { recognition.abort(); } catch (_) {}
      }
    }
    updateVisualState(false);
  }

  /**
   * Update UI badges, buttons, and HUD waveforms
   */
  function updateVisualState(listening) {
    if (listening) {
      if (btnPtt) {
        btnPtt.classList.add('recording');
        if (pttLabel) pttLabel.textContent = 'LISTENING...';
      }
      if (micStatusLabel) {
        micStatusLabel.textContent = '● MIC ACTIVE';
        micStatusLabel.className = 'mic-status-badge listening';
      }
      if (hudAudioBars) hudAudioBars.classList.add('active');
    } else {
      if (btnPtt) {
        btnPtt.classList.remove('recording');
        if (pttLabel) pttLabel.textContent = 'PUSH TO TALK';
      }
      if (micStatusLabel) {
        micStatusLabel.textContent = 'Mic Inactive';
        micStatusLabel.className = 'mic-status-badge';
      }
      if (hudAudioBars) hudAudioBars.classList.remove('active');
      if (interimDisplay && !isContinuous && !interimDisplay.textContent.startsWith('Latest final')) {
        interimDisplay.textContent = 'Press and hold Push-to-Talk or enable Continuous Listening...';
      }
    }
  }

  /* ==========================================================================
     EVENT HANDLERS & USER INTERACTIONS
     ========================================================================== */

  // 1. Language Dropdown Change: en-IN, hi-IN, ta-IN
  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      currentLanguage = e.target.value;
      console.log(`[Speech] Language switched to: ${currentLanguage}`);
      if (isListening) {
        // Restart with new language
        createRecognition();
        startListening();
      }
    });
  }

  // 2. Continuous Listening Toggle
  if (toggleContinuous) {
    toggleContinuous.addEventListener('change', (e) => {
      isContinuous = e.target.checked;
      if (speechModeIndicator) {
        speechModeIndicator.textContent = isContinuous ? 'Mode: Continuous Listening' : 'Mode: Push-to-Talk';
      }

      if (isContinuous) {
        createRecognition();
        startListening();
      } else {
        stopListening(true);
      }
    });
  }

  // 3. Big Push-To-Talk Button (Supports both Press & Hold AND Click Toggle)
  if (btnPtt) {
    // Mouse Press & Hold
    btnPtt.addEventListener('mousedown', (e) => {
      if (isContinuous) return; // In continuous mode, mic is already persistent
      isPttActive = true;
      startListening();
    });

    btnPtt.addEventListener('mouseup', () => {
      if (isContinuous) return;
      if (isPttActive) {
        isPttActive = false;
        // Give short delay to catch final speech syllable
        setTimeout(() => {
          if (!isPttActive && !isContinuous) {
            if (recognition) recognition.stop();
          }
        }, 350);
      }
    });

    // Touch device support (tablets / mobile touch)
    btnPtt.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (isContinuous) return;
      isPttActive = true;
      startListening();
    });

    btnPtt.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (isContinuous) return;
      isPttActive = false;
      setTimeout(() => {
        if (!isPttActive && !isContinuous) {
          if (recognition) recognition.stop();
        }
      }, 350);
    });

    // Keyboard shortcut: Spacebar hold for Push-To-Talk
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT') {
        if (!isContinuous && !isPttActive) {
          isPttActive = true;
          startListening();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        if (!isContinuous && isPttActive) {
          isPttActive = false;
          setTimeout(() => {
            if (!isPttActive && !isContinuous) {
              if (recognition) recognition.stop();
            }
          }, 350);
        }
      }
    });
  }

  // Initialize recognition instance on startup
  createRecognition();

  // Expose global controller
  window.AuraSpeech = {
    start: startListening,
    stop: stopListening,
    setLanguage: (lang) => {
      currentLanguage = lang;
      if (languageSelect) languageSelect.value = lang;
      createRecognition();
    }
  };

})();
