// ========================================
// Content Script — TravelID Autofill
// ========================================
// Orchestrates the scan pipeline and hands off to the autofill
// engine.  All heavy lifting is in the modular sub-files.
// ========================================
(function () {
  'use strict';

  const { Logger, DOMScanner, autofillFromBackend, postScanResult } =
    window.TravelID;

  /** @type {InstanceType<DOMScanner>|null} */
  let scanner = null;

  /** @type {import('./scanner/types').FieldRegistry|null} */
  let fieldRegistry = null;

  let isScanning = false;

  Logger.info('TravelID content script loaded');

  // ─── Message handler ────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'SCAN_PAGE') {
      _handleScanRequest(sendResponse);
      return true; // keep channel open for async response
    }
  });

  // ─── Scan orchestration ─────────────────────────────────────────

  async function _handleScanRequest(sendResponse) {
    if (isScanning) {
      sendResponse({ success: false, error: 'Scan already in progress' });
      return;
    }

    try {
      isScanning = true;
      Logger.info('Scan requested');

      scanner = new DOMScanner();
      const result = await scanner.scan();

      fieldRegistry = scanner.getFieldRegistry();
      Logger.info('Registry built:', Object.keys(fieldRegistry).length, 'fields');

      _showNotification(`✅ Scan Complete — ${result.fields.length} fields`, '#4CAF50', 20);

      // Post to backend (non-blocking for popup response)
      _postAndAutofill(result);

      sendResponse({ success: true, data: result });
    } catch (err) {
      Logger.error('Scan failed:', err);
      sendResponse({ success: false, error: err.message });
    } finally {
      isScanning = false;
    }
  }

  async function _postAndAutofill(result) {
    const data = await postScanResult(result);

    if (data?.values && fieldRegistry) {
      Logger.info('Starting autofill…');
      const summary = await autofillFromBackend(data, fieldRegistry);

      if (summary.filled > 0) {
        _showNotification(
          `🎯 Autofill — ${summary.filled} fields filled`,
          '#2196F3',
          80
        );
      }

      // Release DOM references after a short cooldown
      setTimeout(() => {
        scanner?.destroy();
        scanner = null;
        fieldRegistry = null;
      }, 1000);
    }
  }

  // ─── UI notifications ────────────────────────────────────────────

  // Inject slide-in keyframe once
  (function _injectStyle() {
    const s = document.createElement('style');
    s.textContent = `
      @keyframes _travelid_slide {
        from { transform: translateX(420px); opacity: 0; }
        to   { transform: translateX(0);      opacity: 1; }
      }`;
    document.head.appendChild(s);
  })();

  /**
   * @param {string} text
   * @param {string} bg     - CSS background colour
   * @param {number} topPx  - vertical offset from top of viewport
   */
  function _showNotification(text, bg, topPx) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; top:${topPx}px; right:20px;
      background:${bg}; color:#fff;
      padding:14px 22px; border-radius:8px;
      box-shadow:0 4px 12px rgba(0,0,0,.3);
      z-index:999999; font:500 14px/1.4 system-ui,sans-serif;
      animation:_travelid_slide .3s ease-out;
      pointer-events:none;
    `;
    el.innerHTML = text;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.animation = '_travelid_slide .3s ease-out reverse';
      setTimeout(() => el.remove(), 320);
    }, 3000);
  }

  Logger.info('Ready — click the extension button to scan.');
})();
