// ========================================
// Autofill Strategy — Radio
// ========================================
(function () {
  'use strict';

  /**
   * Click the radio in `elements` whose label or value matches `value`.
   * Works with both native <input type="radio"> and ARIA radio objects.
   *
   * @param {Array<HTMLInputElement|{ element: Element, label: string, value: string }>} elements
   * @param {string} value
   * @returns {boolean}
   */
  function fillRadio(elements, value) {
    if (!elements || elements.length === 0) return false;
    const { resolveLabel } = window.TravelID;

    const needle = String(value).toLowerCase().trim();

    for (const el of elements) {
      let radioValue = '';
      let radioLabel = '';

      if (el && el.tagName === 'INPUT' && el.type === 'radio') {
        // Native radio
        radioValue = (el.value || '').toLowerCase().trim();
        radioLabel = (resolveLabel(el) || '').toLowerCase().trim();
      } else if (el && (el.label !== undefined || el.value !== undefined)) {
        // ARIA radio descriptor object
        radioValue = (el.value || '').toLowerCase().trim();
        radioLabel = (el.label || '').toLowerCase().trim();
      } else {
        continue;
      }

      const matches =
        radioValue === needle ||
        radioLabel === needle ||
        radioValue.includes(needle) ||
        radioLabel.includes(needle);

      if (matches) {
        // Click the actual DOM element
        const target = el.element || el;
        if (target && typeof target.click === 'function') {
          target.click();
        }
        return true;
      }
    }

    window.TravelID.Logger.warn(`[RadioFill] No match for "${value}"`);
    return false;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.fillRadio = fillRadio;
})();
