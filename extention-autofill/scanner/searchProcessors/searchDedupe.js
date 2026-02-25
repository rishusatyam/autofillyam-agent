// ========================================
// Search Processor — Dedupe
// ========================================
// Removes duplicate search fields using type + normalised label.
// Keeps the field with the better label / element attributes.
// ========================================
(function () {
  'use strict';

  /**
   * Remove duplicate search fields from the map in-place.
   *
   * Fingerprint: type + normalised label.
   * When duplicates found, keep the one with:
   *   1. A direct aria-label or data-label attribute (+3/+2)
   *   2. An id on the element (+2)
   *   3. Scraped options (+1)
   *   4. First discovered (stable ordering)
   *
   * @param {Map<string, object>} fieldsMap
   */
  function dedupeSearchFields(fieldsMap) {
    /** @type {Map<string, { key: string, field: object }>} */
    const seen = new Map();
    const toRemove = [];

    fieldsMap.forEach((field, key) => {
      const fingerprint = [
        field.type,
        _normalise(field.label),
      ].join('|');

      if (seen.has(fingerprint)) {
        const existing = seen.get(fingerprint);
        const existingScore = _score(existing.field);
        const currentScore = _score(field);

        if (currentScore > existingScore) {
          toRemove.push(existing.key);
          seen.set(fingerprint, { key, field });
        } else {
          toRemove.push(key);
        }
      } else {
        seen.set(fingerprint, { key, field });
      }
    });

    toRemove.forEach(k => fieldsMap.delete(k));
  }

  /**
   * Score a field for dedup preference. Higher = better.
   *
   * @param {object} field
   * @returns {number}
   */
  function _score(field) {
    let s = 0;
    const el = field._element;
    if (!el) return 0;

    if (el.getAttribute('aria-label')) s += 3;
    if (el.getAttribute('data-label')) s += 2;
    if (el.id) s += 2;
    if (field.options && field.options.length > 0) s += 1;

    return s;
  }

  /** @param {string} text @returns {string} */
  function _normalise(text) {
    return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.dedupeSearchFields = dedupeSearchFields;
})();
