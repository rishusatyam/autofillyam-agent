// ========================================
// API — Mapping Client
// ========================================
// Sends the scan payload to the backend mapping API and returns
// the backend's response (or null if the backend is offline).
//
// External API contract (unchanged):
//   POST http://localhost:3000/mapping
//   Body: { provider, fields: [{ fieldId, type, label, placeholder, section, options }] }
//   Response: { values: Record<fieldId, string> }
// ========================================
(function () {
  'use strict';

  const API_URL = 'http://localhost:3000/mapping';

  /**
   * Post a scan result to the backend mapping API.
   *
   * @param {import('../scanner/types').ScanResult} scanResult
   * @returns {Promise<{ values: Record<string,string> }|null>}
   *   Resolves with the parsed JSON on success, or null if the backend
   *   is unreachable / returns an error.  Never rejects — callers can
   *   always proceed without autofill data.
   */
  async function postScanResult(scanResult) {
    const { Logger } = window.TravelID;

    const payload = {
      provider: scanResult.provider,
      fields: scanResult.fields.map((f) => ({
        fieldId: f.fieldId,
        type: f.type,
        label: f.label,
        placeholder: f.placeholder,
        section: f.section,
        options: f.options,
      })),
    };

    Logger.group('API → POST /mapping');
    Logger.info('Provider:', payload.provider, '| Fields:', payload.fields.length);
    Logger.debug('Payload:', payload);
    Logger.groupEnd();

    // Fire-and-forget: persist payload for debugging
    _savePayloadToFile(payload, scanResult.provider).catch((err) =>
      Logger.warn('[MappingClient] payload save failed:', err.message)
    );

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      Logger.info('[MappingClient] ✓ response:', data);
      return data;
    } catch (err) {
      Logger.warn(
        '[MappingClient] backend unreachable:',
        err.message,
        '— start with: cd backend/mapper && npm run dev'
      );
      return null;
    }
  }

  /**
   * Download the payload as a JSON file for offline debugging.
   * Uses chrome.downloads (requires "downloads" permission).
   *
   * @param {object} payload
   * @param {string} provider
   * @returns {Promise<void>}
   */
  async function _savePayloadToFile(payload, provider) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, -5);
    const filename = `payload_${provider}_${timestamp}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);

    try {
      await chrome.downloads.download({
        url,
        filename: `TravelID_Payloads/${filename}`,
        saveAs: false,
        conflictAction: 'uniquify',
      });
      window.TravelID.Logger.debug('[MappingClient] payload saved:', filename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.postScanResult = postScanResult;
})();
