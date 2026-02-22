// ========================================
// Autofill Strategy — Checkbox
// ========================================
(function () {
  'use strict';

  /**
   * Toggle a checkbox (native or ARIA) to reach `desiredState`.
   * Operation is idempotent — does nothing when already in the desired state.
   *
   * @param {HTMLInputElement|Element} element
   * @param {boolean|string|number} value  - truthy = checked
   * @returns {boolean}
   */
  function fillCheckbox(element, value) {
    if (!element) return false;

    const { dispatchInputEvents } = window.TravelID;
    const desired = Boolean(value);
    const current =
      element.checked !== undefined
        ? element.checked
        : element.getAttribute('aria-checked') === 'true';

    if (current !== desired) {
      element.click();
      dispatchInputEvents(element);
    }

    return true;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.fillCheckbox = fillCheckbox;
})();
