// ========================================
// API — Search Mapping Client
// ========================================
// Sends scanned search fields to the backend search mapping API and
// returns the response (or null if backend is offline / returns error).
//
// API contract (must not change):
//   POST http://localhost:4000/mapping/search
//   Body:     { provider, vertical, fields: [{ fieldId, type, label, placeholder, section, options }] }
//   Response: { provider, vertical, mapping: Record<fieldId, semanticKey>, values: Record<fieldId, value> }
// ========================================
(function () {
  'use strict';

  const SEARCH_API_URL = 'http://localhost:3000/mapping/search';

  /**
   * Post scanned search fields to the search mapping API.
   *
   * @param {import('../scanner/types').ScanResult} scanResult
   * @param {string} vertical  - detected vertical ("flight"|"hotel"|"train"|"bus"|"cab")
   * @returns {Promise<{ provider: string, vertical: string, mapping: Record<string,string|null>, values: Record<string,string> }|null>}
   *   Resolves with the parsed JSON on success, or null on any failure.
   *   Never rejects — callers always proceed gracefully without autofill data.
   */
  async function postSearchScanResult(scanResult, vertical) {
    const { Logger } = window.TravelID;

    const payload = {
      provider: scanResult.provider,
      vertical,
      fields: scanResult.fields.map((f) => ({
        fieldId:     f.fieldId,
        type:        f.type,
        label:       f.label,
        placeholder: f.placeholder,
        section:     f.section,
        options:     f.options,
      })),
    };

    Logger.group(`API → POST /mapping/search (${vertical})`);
    Logger.info('Provider:', payload.provider, '| Vertical:', vertical, '| Fields:', payload.fields.length);
    Logger.debug('Payload:', payload);
    Logger.groupEnd();

    try {
      const response = await fetch(SEARCH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      Logger.info('[SearchMappingClient] ✓ response:', data);
      return data;
    } catch (err) {
      Logger.warn(
        '[SearchMappingClient] backend unreachable:',
        err.message,
        '— start with: cd backend/mapper && npm run dev'
      );
      return null;
    }
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.postSearchScanResult = postSearchScanResult;
})();
