// ========================================
// Processor — Label Resolver
// ========================================
// 9-step priority chain to extract a human-readable label
// for any form element.
// ========================================
(function () {
  'use strict';

  /**
   * Resolve the best human-readable label for a form element.
   * Priority chain:
   *   1. <label for="id">
   *   2. aria-label
   *   3. aria-labelledby
   *   4. Wrapped in <label>
   *   5. Previous sibling short text
   *   6. Walk up 4 parent levels checking previous sibling
   *   7. Parent element id as fallback
   *   8. placeholder attribute
   *
   * @param {Element} el
   * @returns {string|null}
   */
  function resolveLabel(el) {
    if (!el) return null;

    // 1. <label for="id">
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) return lbl.textContent.trim();
    }

    // 2. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // 3. aria-labelledby
    const lbId = el.getAttribute('aria-labelledby');
    if (lbId) {
      const ref = document.getElementById(lbId);
      if (ref) return ref.textContent.trim();
    }

    // 4. Wrapped inside <label>
    const wrapped = el.closest('label');
    if (wrapped) {
      const clone = wrapped.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button').forEach((n) =>
        n.remove()
      );
      const t = clone.textContent.trim();
      if (t) return t;
    }

    // 5. Previous sibling with short text (no nested inputs)
    const prev = el.previousElementSibling;
    if (
      prev &&
      !prev.querySelector('input,select,textarea') &&
      prev.textContent.trim().length < 80
    ) {
      const t = prev.textContent.trim();
      if (t) return t;
    }

    // 6. Walk up 4 parent levels — check each parent's previous sibling
    let cur = el;
    for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
      const parent = cur.parentElement;
      if (!parent) break;

      const parentPrev = parent.previousElementSibling;
      if (parentPrev) {
        if (parentPrev.tagName === 'LABEL') return parentPrev.textContent.trim();
        const text = parentPrev.textContent.trim();
        if (
          text.length > 0 &&
          text.length < 80 &&
          !parentPrev.querySelector('input,select,textarea,button')
        ) {
          return text;
        }
      }

      // Direct <label> child of parent
      const siblingLabel = parent.querySelector(':scope > label');
      if (siblingLabel) return siblingLabel.textContent.trim();

      cur = parent;
    }

    // 7. Parent element id → humanised text
    let p = el.parentElement;
    for (let i = 0; i < 5 && p && p !== document.body; i++, p = p.parentElement) {
      if (p.id && !/^\d+$/.test(p.id) && p.id.length > 1 && p.id.length < 60) {
        return p.id
          .replace(/[-_]/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .trim();
      }
    }

    // 8. Placeholder
    return el.placeholder || null;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.resolveLabel = resolveLabel;
})();
