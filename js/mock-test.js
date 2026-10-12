/**
 * mock-test.js - Hackathon Demo Simulator & Event Dispatcher
 * Allows rapid testing of two-way communication without needing live camera/mic.
 */

(function () {
  'use strict';

  const testerBar = document.getElementById('demo-tester-bar');
  const btnToggleTester = document.getElementById('btn-demo-panel-toggle');
  const customSignerInput = document.getElementById('custom-signer-input');
  const btnFullscreen = document.getElementById('btn-fullscreen');

  /**
   * Simulate a sign detected from the ISL Signer
   * Emits: CustomEvent('signer-said', { detail: { text } })
   */
  window.testSignerSaid = function (text) {
    console.log('[Tester] Emitting signer-said:', text);
    window.dispatchEvent(new CustomEvent('signer-said', {
      detail: {
        text: text,
        timestamp: Date.now()
      }
    }));
  };

  /**
   * Simulate a spoken reply from the Hearing Person
   * Emits: CustomEvent('reply', { detail: { text } })
   */
  window.testHearingReply = function (text) {
    console.log('[Tester] Emitting reply:', text);
    window.dispatchEvent(new CustomEvent('reply', {
      detail: {
        text: text,
        lang: document.getElementById('language-select')?.value || 'en-IN',
        timestamp: Date.now()
      }
    }));
  };

  /**
   * Custom signer text input emitter
   */
  window.triggerCustomSignerSaid = function () {
    if (!customSignerInput) return;
    const val = customSignerInput.value.trim();
    if (!val) return;
    window.testSignerSaid(val);
    customSignerInput.value = '';
  };

  /**
   * Toggle visibility of demo tester bar
   */
  window.toggleTesterBar = function () {
    if (testerBar) {
      testerBar.classList.toggle('hidden');
    }
  };

  if (btnToggleTester) {
    btnToggleTester.addEventListener('click', window.toggleTesterBar);
  }

  // Allow pressing Enter in custom signer input
  if (customSignerInput) {
    customSignerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        window.triggerCustomSignerSaid();
      }
    });
  }

  // Fullscreen button for Hackathon presentation projector
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Fullscreen request error:', err);
        });
      } else {
        document.exitFullscreen();
      }
    });
  }

  // Keyboard demo shortcuts
  window.addEventListener('keydown', (e) => {
    // Alt + 1: Quick sign test
    if (e.altKey && e.key === '1') {
      window.testSignerSaid('Namaste, where is the pharmacy?');
    }
    // Alt + 2: Quick voice reply test
    if (e.altKey && e.key === '2') {
      window.testHearingReply('The pharmacy is on the ground floor to your left.');
    }
  });

})();
