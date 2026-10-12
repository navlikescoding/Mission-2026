/**
 * webcam.js - Smart Glasses AR Lens Video Feed
 * Handles camera initialization, mirroring, permission states, and fallback loops.
 */

(function () {
  'use strict';

  const videoElement = document.getElementById('webcam');
  const fallbackElement = document.getElementById('webcam-fallback');
  const btnToggleCam = document.getElementById('btn-toggle-cam');
  const btnRetryCamera = document.getElementById('btn-retry-camera');
  const btnMockFeed = document.getElementById('btn-mock-feed');

  let mediaStream = null;
  let isCamActive = true;
  let mockAnimationId = null;

  /**
   * Initialize user media webcam feed
   */
  async function initWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showFallback('Camera API not supported in this browser.');
      return;
    }

    try {
      // Ideal specs for smart glasses HUD: 720p or 1080p widescreen
      const constraints = {
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false // Audio is handled separately by Web Speech API
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = mediaStream;
      await videoElement.play();

      fallbackElement.classList.add('hidden');
      isCamActive = true;
      if (btnToggleCam) btnToggleCam.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        <span>Cam: ON</span>
      `;
    } catch (err) {
      console.warn('[Webcam] Camera permission denied or not found:', err);
      showFallback('Camera access needed to simulate Smart Glasses POV.');
    }
  }

  /**
   * Display fallback HUD screen when camera is unavailable
   */
  function showFallback(message) {
    if (fallbackElement) {
      fallbackElement.classList.remove('hidden');
      const hint = fallbackElement.querySelector('.fallback-hint');
      if (hint && message) hint.textContent = message;
    }
    if (btnToggleCam) btnToggleCam.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>
      <span>Cam: OFF</span>
    `;
  }

  /**
   * Toggle camera stream on/off
   */
  function toggleCamera() {
    if (mediaStream && isCamActive) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
      videoElement.srcObject = null;
      isCamActive = false;
      showFallback('Camera paused by user.');
    } else {
      initWebcam();
    }
  }

  /**
   * Simulated animated canvas feed for testing when no physical camera exists
   */
  function startMockFeed() {
    fallbackElement.classList.add('hidden');

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    videoElement.srcObject = stream;
    videoElement.play();

    let frame = 0;
    function renderMock() {
      frame++;
      // Dark futuristic grid backdrop
      ctx.fillStyle = '#060c18';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid lines
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Simulated Signer silhouette with moving hand markers
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 + 30;

      // Body silhouette
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 60, 35, 0, Math.PI * 2); // Head
      ctx.fill();

      ctx.beginPath();
      ctx.roundRect(centerX - 55, centerY - 15, 110, 120, 20); // Torso
      ctx.fill();

      // Simulated moving hand landmarks (ISL simulation)
      const handY = centerY - 10 + Math.sin(frame * 0.08) * 25;
      const handX1 = centerX - 40 + Math.cos(frame * 0.06) * 20;
      const handX2 = centerX + 40 + Math.sin(frame * 0.07) * 20;

      // Hand 1 (Left)
      ctx.fillStyle = '#00f59b';
      ctx.beginPath();
      ctx.arc(handX1, handY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00f59b';
      ctx.strokeRect(handX1 - 18, handY - 18, 36, 36);

      // Hand 2 (Right)
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(handX2, handY + 10, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00e5ff';
      ctx.strokeRect(handX2 - 18, handY - 8, 36, 36);

      // Mock detection label
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText('[SIMULATED ISL SIGNER IN POV]', 20, 30);
      ctx.fillText(`KEYPOINTS: 21 HANDS DETECTED (${(Math.sin(frame * 0.05) * 5 + 92).toFixed(1)}% CONFIDENCE)`, 20, 50);

      mockAnimationId = requestAnimationFrame(renderMock);
    }

    renderMock();
  }

  // Event Listeners
  if (btnToggleCam) btnToggleCam.addEventListener('click', toggleCamera);
  if (btnRetryCamera) btnRetryCamera.addEventListener('click', initWebcam);
  if (btnMockFeed) btnMockFeed.addEventListener('click', startMockFeed);

  // Initialize camera when DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    initWebcam();
  });

  // Expose global controller
  window.AuraWebcam = {
    init: initWebcam,
    toggle: toggleCamera,
    startMock: startMockFeed
  };

})();
