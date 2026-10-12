/**
 * signer.js - Signer's View Controller
 * Manages the high-contrast latest reply display and scrolling conversation history.
 * 
 * Subscribes to:
 * 1. 'reply' CustomEvent: Hearing person's speech (e.detail.text)
 * 2. 'signer-said' CustomEvent: Signer's recognized sign translation (e.detail.text)
 */

(function () {
  'use strict';

  // DOM Elements
  const latestReplyText = document.getElementById('latest-reply-text');
  const latestReplyTime = document.getElementById('latest-reply-time');
  const latestReplyLang = document.getElementById('latest-reply-lang');
  const latestReplyCard = document.getElementById('latest-reply-card');
  const replyPulseDot = document.getElementById('reply-pulse-indicator');
  const conversationFeed = document.getElementById('conversation-feed');
  const historyWelcome = document.getElementById('history-welcome');
  const historyCountBadge = document.getElementById('history-count-badge');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const btnFontLarger = document.getElementById('btn-font-larger');
  const btnFontNormal = document.getElementById('btn-font-normal');
  const ttsAudioToggle = document.getElementById('tts-audio-toggle');

  let messageCount = 0;

  /**
   * Format human-readable time (e.g. "1:45:20 PM")
   */
  function getFormattedTime() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /**
   * 1. Handle Spoken Reply from Hearing Person
   * Triggered by: window.dispatchEvent(new CustomEvent('reply', { detail: { text: ... } }))
   */
  function handleHearingReply(event) {
    const text = event?.detail?.text;
    if (!text || !text.trim()) return;

    const cleanText = text.trim();
    const timeStr = getFormattedTime();
    const lang = event.detail.lang || 'en-IN';

    // A) Update HUGE high-contrast latest reply card
    if (latestReplyText) {
      latestReplyText.textContent = `"${cleanText}"`;
    }
    if (latestReplyTime) {
      latestReplyTime.textContent = timeStr;
    }
    if (latestReplyLang) {
      latestReplyLang.textContent = `Language: ${lang}`;
    }

    // High-contrast glow flash animation
    if (latestReplyCard) {
      latestReplyCard.classList.remove('glow-update');
      void latestReplyCard.offsetWidth; // Trigger reflow
      latestReplyCard.classList.add('glow-update');
    }

    // B) Add to scrolling chat history as Hearing Person (Cyan style)
    appendChatMessage({
      sender: 'hearing',
      senderLabel: 'Hearing Person (Glasses Voice)',
      time: timeStr,
      text: cleanText
    });
  }

  /**
   * 2. Handle Sign Translation from ISL Signer
   * Triggered by: window.dispatchEvent(new CustomEvent('signer-said', { detail: { text: ... } }))
   */
  function handleSignerSaid(event) {
    const text = event?.detail?.text;
    if (!text || !text.trim()) return;

    const cleanText = text.trim();
    const timeStr = getFormattedTime();

    // A) Add to scrolling chat history as Signer (Emerald Green style)
    appendChatMessage({
      sender: 'signer',
      senderLabel: 'ISL Signer (Gestures)',
      time: timeStr,
      text: cleanText
    });

    // B) Smart Glasses Audio Out (TTS) for Hearing Person:
    // If enabled, read the signer's translated sign aloud through the laptop speakers / glasses earpiece!
    // Sentences from the sign recognizer are already spoken by hearing-side/signToSpeech.js
    // (detail.handled), so only speak the others (test buttons, phone messages).
    if (!event.detail.handled && ttsAudioToggle && ttsAudioToggle.checked && 'speechSynthesis' in window) {
      speakSignerText(cleanText);
    }
  }

  /**
   * Render a chat bubble into the scrolling conversation feed
   */
  function appendChatMessage({ sender, senderLabel, time, text }) {
    if (!conversationFeed) return;

    // Hide initial welcome banner once real dialogue starts
    if (historyWelcome && !historyWelcome.classList.contains('hidden')) {
      historyWelcome.classList.add('hidden');
    }

    const bubble = document.createElement('div');
    bubble.className = `message-bubble bubble-${sender}`;

    const iconSvg = sender === 'hearing' 
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v7"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 4v4a7 7 0 0 1-7 7H9a7 7 0 0 1-7-7v-3a2 2 0 0 1 4 0v1"/></svg>`;

    bubble.innerHTML = `
      <div class="bubble-meta">
        <span class="bubble-sender">
          ${iconSvg}
          <span>${senderLabel}</span>
        </span>
        <span class="bubble-time">${time}</span>
      </div>
      <div class="bubble-text">${escapeHtml(text)}</div>
    `;

    conversationFeed.appendChild(bubble);

    // Increment count
    messageCount++;
    if (historyCountBadge) {
      historyCountBadge.textContent = `${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`;
    }

    // Smooth auto-scroll to bottom of conversation
    conversationFeed.scrollTop = conversationFeed.scrollHeight;
  }

  /**
   * Web Speech Synthesis: Voice the signer's signs into the hearing person's earpiece
   */
  function speakSignerText(text) {
    try {
      window.speechSynthesis.cancel(); // Stop any pending utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      // Try to choose an Indian English / localized voice if available
      const voices = window.speechSynthesis.getVoices();
      const inVoice = voices.find(v => v.lang.includes('IN') || v.lang.includes('en'));
      if (inVoice) utterance.voice = inVoice;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[Signer TTS] Speech synthesis failed:', e);
    }
  }

  /**
   * Escape HTML to prevent injection
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Clear History
   */
  function clearHistory() {
    if (!conversationFeed) return;
    conversationFeed.innerHTML = '';
    messageCount = 0;
    if (historyCountBadge) historyCountBadge.textContent = '0 messages';
    if (historyWelcome) {
      historyWelcome.classList.remove('hidden');
      conversationFeed.appendChild(historyWelcome);
    }
  }

  /* ==========================================================================
     EVENT LISTENERS AS SPECIFIED IN REQUIREMENTS
     ========================================================================== */

  // 1. Listen for spoken reply from hearing person:
  // window.dispatchEvent(new CustomEvent('reply', { detail: { text: 'Take this twice a day' } }))
  window.addEventListener('reply', handleHearingReply);

  // 2. Listen for signer's recognized signs:
  // window.addEventListener('signer-said', e => e.detail.text)
  window.addEventListener('signer-said', handleSignerSaid);

  // Accessibility Font Controls
  if (btnFontLarger) {
    btnFontLarger.addEventListener('click', () => {
      document.body.classList.add('font-large');
    });
  }
  if (btnFontNormal) {
    btnFontNormal.addEventListener('click', () => {
      document.body.classList.remove('font-large');
    });
  }

  // Clear history button
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', clearHistory);
  }

  // Expose global controller
  window.AuraSigner = {
    clear: clearHistory,
    addHearingReply: (text) => handleHearingReply({ detail: { text } }),
    addSignerSaid: (text) => handleSignerSaid({ detail: { text } })
  };

})();
