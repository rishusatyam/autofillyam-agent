// Content Script - Orchestrates scanning on the page
// Runs in the context of web pages

(function() {
  'use strict';

  let scanner = null;
  let isScanning = false;

  console.log('✅ TravelID Scanner content script loaded');

  /**
   * Handle messages from popup/background
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCAN_PAGE') {
      handleScanRequest(sendResponse);
      return true; // Keep the message channel open for async response
    }
  });

  /**
   * Main scan handler
   */
  async function handleScanRequest(sendResponse) {
    // Prevent multiple simultaneous scans
    if (isScanning) {
      sendResponse({
        success: false,
        error: 'Scan already in progress'
      });
      return;
    }

    try {
      isScanning = true;
      console.log('🚀 Scan requested by user');

      // Create new scanner instance
      scanner = new DOMScanner();

      // Execute scan
      const result = await scanner.scan();

      // Optional: Highlight fields in dev mode
      if (isDevelopmentMode()) {
        highlightDetectedFields(result.fields);
      }

      // Log summary
      logScanSummary(result);

      // Send result back to popup
      sendResponse({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Scan failed:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    } finally {
      isScanning = false;
      if (scanner) {
        scanner.destroy();
        scanner = null;
      }
    }
  }

  /**
   * Log scan summary to console
   */
  function logScanSummary(result) {
    console.group('📊 Scan Summary');
    console.log('Provider:', result.provider);
    console.log('Fields Detected:', result.fields.length);
    console.log('Scan Duration:', result.metadata.scanDuration + 'ms');
    console.log('Field Types:', result.metadata.typeSummary);
    console.log('Timestamp:', result.scannedAt);
    console.groupEnd();

    // Show notification
    showScanNotification(result.fields.length);
  }

  /**
   * Show temporary notification on page
   */
  function showScanNotification(fieldCount) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    `;
    
    notification.innerHTML = `
      ✅ Scan Complete<br>
      <small style="opacity: 0.9;">${fieldCount} fields detected</small>
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        notification.remove();
        style.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Check if in development mode
   */
  function isDevelopmentMode() {
    // Check if extension is in development mode (unpacked)
    return chrome.runtime.getManifest().update_url === undefined;
  }

  // Initialize
  console.log('🎯 Ready to scan. Click extension button to start.');
})();
