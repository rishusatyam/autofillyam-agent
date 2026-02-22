// ========================================
// Processor — Dedupe
// ========================================
// Removes duplicate fields produced by multiple detectors.
// Keeps the best candidate when two fields share the same
// type + normalised-label + section fingerprint.
// ========================================
(function () {
  'use strict';

  /**
   * Remove duplicate raw fields from `fieldsMap` in-place.
   * "Best" = has an id attribute > has a name attribute > first seen.
   *
   * @param {Map<string, import('../types').RawField>} fieldsMap
   * @returns {void}
   */
  function dedupeFields(fieldsMap) {
    /** @type {Map<string, { key: string, field: import('../types').RawField }>} */
    const seen = new Map();
    /** @type {string[]} */
    const toRemove = [];

    fieldsMap.forEach((field, key) => {
      const fingerprint = [
        field.type,
        (field.label || '').toLowerCase().trim(),
        (field.section || '').toLowerCase().trim(),
      ].join('|');

      if (seen.has(fingerprint)) {
        const existing = seen.get(fingerprint);
        // Prefer the entry with an id attribute
        const existingEl = existing.field._element;
        const currentEl = field._element;
        const existingScore = _score(existing.field, existingEl);
        const currentScore = _score(field, currentEl);
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

    toRemove.forEach((k) => fieldsMap.delete(k));
  }

  /**
   * Heuristic score — higher is better.
   * Prefer fields that already have scraped options.
   * @param {import('../types').RawField} field
   * @param {Element} el
   * @returns {number}
   */
  function _score(field, el) {
    if (!el) return 0;
    let s = 0;
    const optLen = Array.isArray(field?.options) ? field.options.length : 0;
    if (optLen > 0) s += 10 + Math.min(optLen, 30) / 10;
    if (el.id) s += 2;
    if (el.name) s += 1;
    return s;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.dedupeFields = dedupeFields;
})();
