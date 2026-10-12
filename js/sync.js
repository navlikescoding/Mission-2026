/**
 * sync.js - Stretch Goal: Real-Time Phone Sync via WebRTC (PeerJS) & BroadcastChannel
 * Synchronizes messages between Laptop and Mobile Phone on the same Wi-Fi with ZERO server code.
 */

(function () {
  'use strict';

  // UI Elements
  const btnPhoneSync = document.getElementById('btn-phone-sync');
  const modalPhoneSync = document.getElementById('modal-phone-sync');
  const btnCloseModal = document.getElementById('btn-close-sync-modal');
  const qrBox = document.getElementById('qrcode-canvas');
  const syncUrlInput = document.getElementById('sync-url-input');
  const btnCopySyncUrl = document.getElementById('btn-copy-sync-url');
  const peerIdDisplay = document.getElementById('sync-peer-id-display');
  const statusPill = document.getElementById('webrtc-status-pill');
  const statusText = document.getElementById('sync-status-text');
  const btnTestPing = document.getElementById('btn-test-sync-ping');

  // BroadcastChannel for instant same-browser / multi-tab sync
  let broadcastChannel = null;
  try {
    broadcastChannel = new BroadcastChannel('aura-isl-sync');
    broadcastChannel.onmessage = (event) => {
      handleIncomingSyncMessage(event.data);
    };
  } catch (e) {
    console.warn('[Sync] BroadcastChannel not supported:', e);
  }

  // PeerJS WebRTC Setup
  let peer = null;
  let activeConnections = [];
  let peerId = null;

  // Generate a friendly room ID
  const roomSuffix = Math.floor(1000 + Math.random() * 9000);
  const targetPeerId = `aura-isl-${roomSuffix}`;

  /**
   * Initialize PeerJS WebRTC Host on the laptop
   */
  function initPeerHost() {
    if (typeof Peer === 'undefined') {
      console.warn('[Sync] PeerJS library not loaded from CDN. Using BroadcastChannel fallback.');
      updateStatus('Sync: Multi-tab Ready', 'dot-active');
      generateQR(buildMobileUrl('tab-mode'));
      return;
    }

    try {
      // Connect to free public WebRTC broker
      peer = new Peer(targetPeerId, {
        debug: 1
      });

      peer.on('open', (id) => {
        peerId = id;
        console.log('[Sync] PeerJS Host online with ID:', id);
        if (peerIdDisplay) peerIdDisplay.textContent = id;
        
        updateStatus('Sync: Waiting for Phone...', 'dot-active');

        // Build and display QR code with the URL for the phone
        const mobileUrl = buildMobileUrl(id);
        if (syncUrlInput) syncUrlInput.value = mobileUrl;
        generateQR(mobileUrl);
      });

      // Handle phone connecting to laptop
      peer.on('connection', (conn) => {
        console.log('[Sync] New mobile peer connected:', conn.peer);
        activeConnections.push(conn);

        updateStatus(`Sync: Phone Connected (${activeConnections.length})`, 'dot-sync');

        conn.on('open', () => {
          // Send welcome handshake & latest state to phone
          const latestText = document.getElementById('latest-reply-text')?.textContent || '';
          conn.send({
            type: 'init-sync',
            latestReply: latestText.replace(/^"|"$/g, '')
          });
        });

        // Handle data coming from phone to laptop
        conn.on('data', (data) => {
          console.log('[Sync] Received from phone:', data);
          handleIncomingSyncMessage(data);
        });

        conn.on('close', () => {
          activeConnections = activeConnections.filter(c => c !== conn);
          if (activeConnections.length === 0) {
            updateStatus('Sync: Waiting for Phone...', 'dot-active');
          } else {
            updateStatus(`Sync: Phone Connected (${activeConnections.length})`, 'dot-sync');
          }
        });
      });

      peer.on('error', (err) => {
        console.warn('[Sync] PeerJS error:', err.type, err);
        if (err.type === 'unavailable-id') {
          // Fallback to auto-generated ID if collision occurs
          peer = new Peer({ debug: 1 });
        }
      });

    } catch (e) {
      console.error('[Sync] PeerJS initialization exception:', e);
    }
  }

  const syncHostInput = document.getElementById('sync-host-input');
  const btnUpdateQr = document.getElementById('btn-update-qr');

  /**
   * Build the mobile URL to be encoded in the QR code
   */
  function buildMobileUrl(id) {
    const customHost = syncHostInput?.value?.trim();
    if (customHost) {
      const cleanHost = customHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return `http://${cleanHost}/mobile.html?peer=${id}`;
    }

    const origin = window.location.origin;
    const pathname = window.location.pathname.replace(/index\.html$/, '');
    // If running on local server, use actual host; if file://, guide user
    if (window.location.protocol === 'file:') {
      return `http://<YOUR-LAPTOP-IP>:8000/mobile.html?peer=${id}`;
    }
    return `${origin}${pathname}mobile.html?peer=${id}`;
  }

  /**
   * Generate QR Code into the DOM
   */
  function generateQR(url) {
    if (!qrBox) return;

    try {
      // 1. Try qrcode-generator library
      if (typeof qrcode !== 'undefined') {
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        qrBox.innerHTML = qr.createSvgTag({ scalable: true, cellSize: 4 });
        return;
      }
    } catch (e) {
      console.warn('qrcode-generator failed, falling back:', e);
    }

    // 2. High-reliability fallback image using public QR service
    qrBox.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}" alt="Scan to connect phone" style="width:180px;height:180px;">`;
  }

  /**
   * Broadcast message to phone over WebRTC & BroadcastChannel
   */
  function broadcastMessage(payload) {
    // 1. Send via WebRTC DataChannel to connected phones
    activeConnections.forEach(conn => {
      if (conn && conn.open) {
        try {
          conn.send(payload);
        } catch (e) {
          console.warn('[Sync] Failed to send over WebRTC:', e);
        }
      }
    });

    // 2. Send via local BroadcastChannel for multi-tab
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(payload);
      } catch (e) {}
    }
  }

  /**
   * Process message received from phone or secondary tab
   */
  function handleIncomingSyncMessage(data) {
    if (!data || !data.type) return;

    if (data.type === 'signer-said') {
      // Phone signer typed or selected a sign translation
      window.dispatchEvent(new CustomEvent('signer-said', {
        detail: {
          text: data.text,
          fromPhone: true,
          timestamp: Date.now()
        }
      }));
    } else if (data.type === 'reply') {
      // Voice reply from peer
      window.dispatchEvent(new CustomEvent('reply', {
        detail: {
          text: data.text,
          fromPhone: true,
          timestamp: Date.now()
        }
      }));
    } else if (data.type === 'ping') {
      alert(`📱 Ping received from phone: "${data.text || 'Hello from phone!'}"`);
    }
  }

  /**
   * Update header status indicator
   */
  function updateStatus(label, dotClass) {
    if (statusText) statusText.textContent = label;
    if (statusPill) {
      const dot = statusPill.querySelector('.status-dot');
      if (dot) {
        dot.className = `status-dot ${dotClass}`;
      }
    }
  }

  /* ==========================================================================
     INTERCEPT LOCAL APP EVENTS & RELAY OVER SYNC
     ========================================================================== */

  // When hearing person speaks a reply on laptop, relay to phone
  window.addEventListener('reply', (e) => {
    if (e.detail?.fromPhone) return; // Don't echo back
    broadcastMessage({
      type: 'reply',
      text: e.detail.text,
      lang: e.detail.lang,
      timestamp: Date.now()
    });
  });

  // When signer signs on laptop (via vision or tester), relay to phone
  window.addEventListener('signer-said', (e) => {
    if (e.detail?.fromPhone) return; // Don't echo back
    broadcastMessage({
      type: 'signer-said',
      text: e.detail.text,
      timestamp: Date.now()
    });
  });

  /* ==========================================================================
     UI MODAL CONTROLS
     ========================================================================== */
  if (btnPhoneSync) {
    btnPhoneSync.addEventListener('click', () => {
      if (modalPhoneSync) modalPhoneSync.classList.remove('hidden');
    });
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      if (modalPhoneSync) modalPhoneSync.classList.add('hidden');
    });
  }

  if (btnCopySyncUrl) {
    btnCopySyncUrl.addEventListener('click', async () => {
      if (syncUrlInput) {
        try {
          await navigator.clipboard.writeText(syncUrlInput.value);
          btnCopySyncUrl.textContent = 'Copied!';
          setTimeout(() => { btnCopySyncUrl.textContent = 'Copy'; }, 1500);
        } catch (_) {
          syncUrlInput.select();
          document.execCommand('copy');
        }
      }
    });
  }

  if (btnUpdateQr) {
    btnUpdateQr.addEventListener('click', () => {
      if (peerId) {
        const newUrl = buildMobileUrl(peerId);
        if (syncUrlInput) syncUrlInput.value = newUrl;
        generateQR(newUrl);
      }
    });
  }

  // Pre-fill hostname if served over HTTP
  if (syncHostInput && window.location.host) {
    syncHostInput.placeholder = window.location.host;
  }

  if (btnTestPing) {
    btnTestPing.addEventListener('click', () => {
      broadcastMessage({
        type: 'reply',
        text: 'TEST SYNC: Hearing person says Hello from the Laptop Glasses HUD!'
      });
      alert('Sent test message to connected phone!');
    });
  }

  // Start Peer Host
  window.addEventListener('DOMContentLoaded', () => {
    initPeerHost();
  });

  // Expose global controller
  window.AuraSync = {
    broadcast: broadcastMessage,
    getPeerId: () => peerId
  };

})();
