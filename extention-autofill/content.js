// ========================================
// Content Script — TravelID Autofill
// ========================================
// Orchestrates the scan pipeline and hands off to the autofill
// engine.  All heavy lifting is in the modular sub-files.
// ========================================
(function () {
  'use strict';

  const {
    Logger,
    DOMScanner,
    SearchScanner,
    autofillFromBackend,
    autofillSearch,
    postScanResult,
    postSearchScanResult,
    detectMode,
    detectModeFromPage,
    detectVertical,
  } = window.TravelID;

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

      // ── Pre-scan mode detection: choose the right scanner before scanning ──
      // Checks URL, page title, and native input count — no DOM scan needed.
      let mode = detectModeFromPage();
      Logger.info(`[Content] Pre-scan mode: "${mode}"`);

      let result;

      if (mode === 'search') {
        // Search page — use SearchScanner which understands custom widgets
        const vertical = detectVertical([]);
        Logger.info(`[Content] Pre-scan vertical: "${vertical}"`);
        scanner = new SearchScanner(vertical);
        result  = await scanner.scan();
      } else {
        // Form page or unknown — use DOMScanner (native HTML inputs)
        scanner = new DOMScanner();
        result  = await scanner.scan();

        // Safety net: if DOMScanner found very few fields (≤ 2),
        // the page might actually be a search widget (custom divs, not
        // native inputs).  Retry with SearchScanner.
        const shouldRetryAsSearch =
          (mode === 'unknown' && result.fields.length === 0) ||
          (mode === 'form'    && result.fields.length <= 2);

        if (shouldRetryAsSearch) {
          Logger.info(
            `[Content] DOMScanner found ${result.fields.length} fields (mode="${mode}") — retrying as search`
          );
          scanner.destroy();
          mode = 'search';
          const vertical = detectVertical([]);
          scanner = new SearchScanner(vertical);
          result  = await scanner.scan();
        } else if (mode === 'unknown') {
          // Have fields now — let field scoring settle the mode
          mode = detectMode(result.fields);
          Logger.info(`[Content] Field-score mode: "${mode}"`);
        }
      }

      fieldRegistry = scanner.getFieldRegistry();
      Logger.info('Registry built:', Object.keys(fieldRegistry).length, 'fields');

      _showNotification(`✅ Scan Complete — ${result.fields.length} fields`, '#4CAF50', 20);

      if (mode === 'search') {
        _postSearchAndAutofill(result);
      } else {
        _postAndAutofill(result);
      }

      sendResponse({ success: true, data: result });
    } catch (err) {
      Logger.error('Scan failed:', err);
      sendResponse({ success: false, error: err.message });
    } finally {
      isScanning = false;
    }
  }

  // ─── Search flow ────────────────────────────────────────────────

  async function _postSearchAndAutofill(result) {
    // vertical is already resolved and embedded in the result by SearchScanner
    const vertical = result.vertical || detectVertical(result.fields);
    Logger.info(`[Content] Search vertical: "${vertical}"`);

    const data = await postSearchScanResult(result, vertical);

    if (data?.values && fieldRegistry) {
      Logger.info('[Content] Starting search autofill…');
      // Use the dedicated search autofill engine (not the form one)
      const summary = await autofillSearch(data.values, fieldRegistry);

      if (summary.filled > 0) {
        _showNotification(
          `🔍 Search Autofill — ${summary.filled} fields filled`,
          '#9C27B0',
          80
        );
      }

      setTimeout(() => {
        scanner?.destroy();
        scanner = null;
        fieldRegistry = null;
      }, 1000);
    }
  }

  // ─── Form flow ──────────────────────────────────────────────────

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
