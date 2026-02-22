// ========================================
// Detector — Toggle / Switch Controls
// ========================================
// Finds ARIA switch roles and common CSS-named toggles.
// Returns raw field objects; no filtering applied here.
// ========================================
(function () {
  'use strict';

  /**
   * Detect toggle/switch elements within `root`.
   *
   * @param {Element}  root
   * @param {Set<Element>} processedElements  - shared dedup set (mutated)
   * @returns {Array<{ key: string, field: import('../types').RawField }>}
   */
  function detectToggles(root, processedElements) {
    const { isElementVisible, resolveLabel, findSection } = window.TravelID;
    const results = [];

    // ARIA switch role
    root.querySelectorAll('[role="switch"]').forEach((el) => {
      if (!isElementVisible(el)) return;
      if (processedElements.has(el)) return;
      processedElements.add(el);

      /** @type {import('../types').RawField} */
      const field = {
        type: 'toggle',
        label: resolveLabel(el) || el.getAttribute('aria-label') || null,
        placeholder: null,
        section: findSection(el),
        options: ['on', 'off'],
        _element: el,
      };

      results.push({ key: _elKey(el), field });
    });

    // CSS-class toggles (not already captured by ARIA)
    root
      .querySelectorAll('[class*="toggle"], [class*="switch"]')
      .forEach((el) => {
        // Skip wrappers that already contain an ARIA switch
        if (el.querySelector('[role="switch"]')) return;
        // Must look like a standalone clickable toggle
        const role = el.getAttribute('role');
        if (role && role !== 'button') return;
        if (!isElementVisible(el)) return;
        if (processedElements.has(el)) return;

        // Ignore decorative toggles that are too small (< 10px)
        const r = el.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return;

        processedElements.add(el);

        /** @type {import('../types').RawField} */
        const field = {
          type: 'toggle',
          label: resolveLabel(el) || null,
          placeholder: null,
          section: findSection(el),
          options: ['on', 'off'],
          _element: el,
        };

        results.push({ key: _elKey(el), field });
      });

    return results;
  }

  /**
   * Stable map key for an element.
   * @param {Element} el
   * @returns {string}
   */
  function _elKey(el) {
    if (el.id) return `tog_${el.id}`;
    const r = el.getBoundingClientRect();
    return `tog_${el.tagName}_${Math.round(r.top)}_${Math.round(r.left)}`;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.detectToggles = detectToggles;
})();
