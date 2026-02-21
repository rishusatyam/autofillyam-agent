// ========================================
// Content Script - Scanner V2
// ========================================
// Orchestrates scanning and sends to backend API

(function() {
  'use strict';

  let scanner = null;
  let fieldRegistry = null;
  let isScanning = false;

  console.log('✅ TravelID Scanner V2 loaded');

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

      // Build field registry for autofill
      fieldRegistry = scanner.getFieldRegistry();
      console.log('📋 Field registry built:', Object.keys(fieldRegistry).length, 'fields');

      // Log summary
      logScanSummary(result);

      // Send to backend API and autofill
      await sendToBackendAPI(result);

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
      // Note: Don't destroy scanner here - keep it alive for autofill
      // It will be cleaned up after autofill completes
    }
  }

  /**
   * Send scan data to backend mapping API
   */
  async function sendToBackendAPI(scanResult) {
    const API_URL = 'http://localhost:3000/mapping';

    // Prepare payload - only send relevant fields
    const payload = {
      provider: scanResult.provider,
      fields: scanResult.fields.map(field => ({
        fieldId: field.fieldId,
        type: field.type,
        label: field.label,
        placeholder: field.placeholder,
        section: field.section,
        options: field.options
      }))
    };

    console.group('📡 Sending to Backend API');
    console.log('URL:', API_URL);
    console.log('Provider:', payload.provider);
    console.log('Fields Count:', payload.fields.length);
    console.log('Payload:', payload);
    console.groupEnd();

    // Fire-and-forget: Save payload to file for debugging (doesn't block)
    savePayloadToFile(payload, scanResult.provider).catch(err => 
      console.warn('⚠️ Failed to save payload file:', err.message)
    );

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      console.group('✅ Backend API Response');
      console.log('Status:', response.status);
      console.log('Data:', data);
      console.groupEnd();

      // Autofill fields if we have values
      if (data && data.values && fieldRegistry) {
        console.log('🎯 Starting autofill...');
        const autofillResult = autofillFromBackend(data, fieldRegistry);
        
        // Show autofill notification
        if (autofillResult && autofillResult.filled > 0) {
          showAutofillNotification(autofillResult);
        }
        
        // Clean up scanner after autofill
        setTimeout(() => {
          if (scanner) {
            scanner.destroy();
            scanner = null;
          }
          fieldRegistry = null;
        }, 1000);
      }

      return data;

    } catch (error) {
      console.group('❌ Backend API Error');
      console.error('Error:', error.message);
      console.log('This is expected if backend is not running');
      console.log('Start backend with: cd backend/mapper && npm run dev');
      console.groupEnd();
      
      // Don't throw - allow scan to continue even if backend is down
      return null;
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
   * Show autofill notification
   */
  function showAutofillNotification(result) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: #2196F3;
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
      🎯 Autofill Complete<br>
      <small style="opacity: 0.9;">${result.filled} fields filled</small>
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Save payload to file for debugging (fire-and-forget)
   */
  async function savePayloadToFile(payload, provider) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `payload_${provider}_${timestamp}.json`;
    
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    try {
      await chrome.downloads.download({
        url: url,
        filename: `TravelID_Payloads/${filename}`,
        saveAs: false, // Auto-save without prompting
        conflictAction: 'uniquify'
      });
      
      console.log('💾 Payload saved:', filename);
    } finally {
      // Clean up the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  // Initialize
  console.log('🎯 Ready to scan. Click extension button to start.');
})();
