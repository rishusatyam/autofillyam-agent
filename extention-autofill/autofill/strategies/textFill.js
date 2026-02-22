// ========================================
// Autofill Strategy — Text Input
// ========================================
(function () {
  'use strict';

  /**
   * Dispatch the standard trio of events that React/Vue/Angular
   * use to detect programmatic value changes.
   *
   * @param {HTMLElement} element
   */
  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
  }

  /**
   * Fill a text input or textarea, bypassing React's value tracking
   * via the native property setter.
   *
   * @param {HTMLInputElement|HTMLTextAreaElement} element
   * @param {string} value
   * @returns {boolean}
   */
  function fillTextInput(element, value) {
    if (!element || !element.tagName) return false;

    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (element.tagName === 'TEXTAREA' && nativeTextAreaSetter) {
      nativeTextAreaSetter.call(element, String(value));
    } else if (element.tagName === 'INPUT' && nativeInputSetter) {
      nativeInputSetter.call(element, String(value));
    } else {
      element.value = String(value);
    }

    dispatchInputEvents(element);
    return true;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.fillTextInput = fillTextInput;
  window.TravelID.dispatchInputEvents = dispatchInputEvents;
})();
