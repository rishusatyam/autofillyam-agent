// ========================================
// Search Detector — Counter Widgets
// ========================================
// Detects passenger / guest / room counters from extracted blocks.
// Also detects +/- button structure for better autofill hints.
// ========================================
(function () {
  'use strict';

  const COUNTER_KEYWORDS = [
    'traveller', 'passenger', 'guest', 'room', 'adult', 'child',
    'infant', 'cabin', 'class', 'seat', 'person', 'occupant', 'pax',
  ];

  /** Selectors that hint at +/- button structure */
  const INCREMENT_HINT = [
    'button[aria-label*="add" i]',
    'button[aria-label*="increase" i]',
    'button[aria-label*="plus" i]',
    'button[class*="increment" i]',
    'button[class*="plus" i]',
    '[class*="increment" i]',
  ].join(',');

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Detect counter fields from extracted blocks.
   *
   * @param {Element[]} blocks
   * @param {Map<string, object>} existingFields
   * @returns {Array<{ key: string, field: object }>}
   */
  function detectSearchCounters(blocks, existingFields) {
    const { extractSearchLabel, extractSearchValue } = window.TravelID;
    const results = [];

    for (const block of blocks) {
      const label = extractSearchLabel(block);
      if (!label) continue;
      if (!_matchesKeywords(label, COUNTER_KEYWORDS)) continue;

      const dedupKey = `counter:${_normalise(label)}`;
      if (existingFields.has(dedupKey)) continue;

      const value = extractSearchValue(block, label);

      // Detect if this block has +/- button structure (autofill hint)
      const hasButtons = !!(
        block.querySelector(INCREMENT_HINT) ||
        _findPlusMinusButtons(block)
      );

      results.push({
        key: dedupKey,
        field: {
          type: 'counter',
          label,
          placeholder: value || '',
          section: 'Search',
          options: [],
          _element: block,
          _meta: { hasButtons },
        },
      });
    }

    return results;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Look for +/- text buttons (many sites use "+" and "-" as button text).
   *
   * @param {Element} root
   * @returns {boolean}
   */
  function _findPlusMinusButtons(root) {
    const buttons = Array.from(
      root.querySelectorAll('button, [role="button"], span')
    );
    let hasPlus = false;
    let hasMinus = false;

    for (const btn of buttons) {
      const t = btn.textContent.trim();
      if (t === '+' || t === 'add') hasPlus = true;
      if (t === '-' || t === 'remove') hasMinus = true;
    }

    return hasPlus && hasMinus;
  }

  function _matchesKeywords(text, keywords) {
    const n = _normalise(text);
    return keywords.some(kw => n.includes(kw));
  }

  function _normalise(text) {
    return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.detectSearchCounters = detectSearchCounters;
})();
