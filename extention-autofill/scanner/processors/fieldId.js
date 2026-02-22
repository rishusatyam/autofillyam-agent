// ========================================
// Processor — Field ID Generator
// ========================================
// Produces a stable, deterministic 8-char hex id for each field
// using SHA-256 over: provider|label|placeholder|section|type|index
// ========================================
(function () {
  'use strict';

  /**
   * Generate a deterministic id string for a field.
   *
   * @param {string}  provider
   * @param {string|null} label
   * @param {string|null} placeholder
   * @param {string|null} section
   * @param {string}  type
   * @param {number}  index        - position index (0-based) for uniqueness
   * @returns {Promise<string>}    - e.g. "f_3a9c1b2d"
   */
  async function generateFieldId(provider, label, placeholder, section, type, index) {
    const input = [
      provider || '',
      (label || '').toLowerCase().trim(),
      (placeholder || '').toLowerCase().trim(),
      (section || '').toLowerCase().trim(),
      type || '',
      String(index),
    ].join('|');

    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return 'f_' + hashHex.substring(0, 8);
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.generateFieldId = generateFieldId;
})();
