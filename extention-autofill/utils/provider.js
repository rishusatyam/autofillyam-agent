// ========================================
// Provider — extract site identifier from URL
// ========================================
(function () {
  'use strict';

  /**
   * Return the bare hostname (no www) of a URL.
   * Used as the provider key throughout the pipeline.
   *
   * @param {string} url
   * @returns {string}
   */
  function extractProvider(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.extractProvider = extractProvider;
})();
