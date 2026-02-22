// ========================================
// Visibility — element visibility & interactability checks
// ========================================
(function () {
  'use strict';

  /**
   * Return true if the element is visible in the page
   * (CSS + dimension check, no viewport clipping).
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function isElementVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (
      s.display === 'none' ||
      s.visibility === 'hidden' ||
      parseFloat(s.opacity) === 0
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /**
   * Return true if the element is interactable:
   * visible, not disabled, not readonly, has an offset parent.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function isInteractable(el) {
    if (!el) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    if (!isElementVisible(el)) return false;
    // Elements detached from layout have no offsetParent (except BODY)
    if (!el.offsetParent && el.tagName !== 'BODY') return false;
    return true;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.isElementVisible = isElementVisible;
  window.TravelID.isInteractable = isInteractable;
})();
