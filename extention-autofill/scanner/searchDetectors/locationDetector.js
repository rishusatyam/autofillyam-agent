// ========================================
// Search Detector — Location Pickers
// ========================================
// Detects From / To / Destination / Pickup / Dropoff location fields
// from the extracted interactive blocks.
// ========================================
(function () {
  'use strict';

  const LOCATION_KEYWORDS = [
    'from', 'to', 'destination', 'city', 'airport', 'station',
    'origin', 'source', 'pickup', 'drop', 'dropoff', 'location',
    'where', 'flying from', 'flying to', 'going to', 'leaving from',
    'departure city', 'arrival city', 'depart from',
  ];

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Detect location picker fields from extracted blocks.
   *
   * @param {Element[]} blocks
   * @param {Map<string, object>} existingFields - already detected fields (for dedup)
   * @returns {Array<{ key: string, field: object }>}
   */
  function detectSearchLocations(blocks, existingFields) {
    const { extractSearchLabel, extractSearchValue } = window.TravelID;
    const results = [];

    for (const block of blocks) {
      const label = extractSearchLabel(block);
      if (!label) continue;
      if (!_matchesKeywords(label, LOCATION_KEYWORDS)) continue;

      const dedupKey = `location:${_normalise(label)}`;
      if (existingFields.has(dedupKey)) continue;

      const value = extractSearchValue(block, label);

      results.push({
        key: dedupKey,
        field: {
          type: 'location',
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
  window.TravelID.detectSearchLocations = detectSearchLocations;
})();
