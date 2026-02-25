// ========================================
// Search Detector — Date Pickers
// ========================================
// Detects Departure / Return / Check-in / Check-out date fields
// from the extracted interactive blocks.
// ========================================
(function () {
  'use strict';

  const DATE_KEYWORDS = [
    'date', 'departure', 'depart', 'return', 'check-in', 'checkout',
    'checkin', 'check-out', 'travel date', 'journey', 'onward',
    'arrival', 'when', 'leaving on',
  ];

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Detect date picker fields from extracted blocks.
   *
   * @param {Element[]} blocks
   * @param {Map<string, object>} existingFields
   * @returns {Array<{ key: string, field: object }>}
   */
  function detectSearchDates(blocks, existingFields) {
    const { extractSearchLabel, extractSearchValue } = window.TravelID;
    const results = [];

    for (const block of blocks) {
      const label = extractSearchLabel(block);
      if (!label) continue;
      if (!_matchesKeywords(label, DATE_KEYWORDS)) continue;

      const dedupKey = `date:${_normalise(label)}`;
      if (existingFields.has(dedupKey)) continue;

      const value = extractSearchValue(block, label);

      results.push({
        key: dedupKey,
        field: {
          type: 'date',
          label,
          placeholder: value || label,
          section: 'Search',
          options: [],
          _element: block,
        },
      });
    }

    return results;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  function _matchesKeywords(text, keywords) {
    const n = _normalise(text);
    return keywords.some(kw => n.includes(kw));
  }

  function _normalise(text) {
    return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.detectSearchDates = detectSearchDates;
})();
