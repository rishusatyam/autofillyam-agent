// ========================================
// Detector — Text Inputs & Textareas
// ========================================
// Finds all visible text-like inputs and textareas.
// Returns raw field objects; no filtering applied here.
// ========================================
(function () {
  'use strict';

  const SKIP_TYPES = new Set([
    'hidden', 'submit', 'button', 'reset',
    'image', 'file', 'checkbox', 'radio',
  ]);

  /**
   * Find all text-like form fields within `root`.
   *
   * @param {Element}  root
   * @param {Set<Element>} processedElements  - shared dedup set (mutated)
   * @returns {Array<{ key: string, field: import('../types').RawField }>}
   */
  function detectTextInputs(root, processedElements) {
    const { isInteractable, resolveLabel, findSection } = window.TravelID;
    const results = [];

    root.querySelectorAll('input, textarea').forEach((el) => {
      if (el.tagName === 'INPUT' && SKIP_TYPES.has(el.type)) return;

      // Skip React Select hidden inputs — handled by dropdown detector
      if (/^react-select-/.test(el.id || '')) return;

      if (!isInteractable(el)) return;
      if (processedElements.has(el)) return;
      processedElements.add(el);

      /** @type {import('../types').RawField} */
      const field = {
        type: 'text',
        label: resolveLabel(el),
        placeholder: el.placeholder || null,
        section: findSection(el),
        options: [],
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
    if (el.id) return `txt_${el.id}`;
    if (el.name) return `txt_${el.name}`;
    const r = el.getBoundingClientRect();
    return `txt_${el.tagName}_${Math.round(r.top)}_${Math.round(r.left)}`;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.detectTextInputs = detectTextInputs;
})();
