// ========================================
// Detector — Checkboxes
// ========================================
// Finds native <input type="checkbox"> and ARIA checkbox roles.
// Returns raw field objects; no filtering applied here.
// ========================================
(function () {
  'use strict';

  /**
   * Detect checkboxes within `root`.
   *
   * @param {Element}  root
   * @param {Set<Element>} processedElements  - shared dedup set (mutated)
   * @returns {Array<{ key: string, field: import('../types').RawField }>}
   */
  function detectCheckboxes(root, processedElements) {
    const { isInteractable, resolveLabel, findSection } = window.TravelID;
    const results = [];

    root
      .querySelectorAll('input[type="checkbox"], [role="checkbox"]')
      .forEach((el) => {
        if (!isInteractable(el)) return;
        if (processedElements.has(el)) return;
        processedElements.add(el);

        /** @type {import('../types').RawField} */
        const field = {
          type: 'checkbox',
          label: resolveLabel(el),
          placeholder: null,
          section: findSection(el),
          options: ['checked', 'unchecked'],
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
    if (el.id) return `chk_${el.id}`;
    if (el.name) return `chk_${el.name}`;
    const r = el.getBoundingClientRect();
    return `chk_${el.tagName}_${Math.round(r.top)}_${Math.round(r.left)}`;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.detectCheckboxes = detectCheckboxes;
})();
