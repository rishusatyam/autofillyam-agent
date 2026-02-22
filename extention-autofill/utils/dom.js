// ========================================
// DOM — general DOM traversal helpers
// ========================================
(function () {
  'use strict';

  /**
   * Find the best booking-form boundary element on the page.
   * Returns the narrowest element that reliably contains all booking fields.
   *
   * @returns {Element}
   */
  function findFormBoundary() {
    const { Logger } = window.TravelID;

    // 1. Single <form> tag
    const forms = Array.from(document.querySelectorAll('form'));
    if (forms.length === 1) return forms[0];

    // 2. <form> with the most visible inputs
    let maxInputs = 0;
    let bestForm = null;
    for (const form of forms) {
      const count = form.querySelectorAll(
        'input:not([type="hidden"]),textarea,select'
      ).length;
      if (count > maxInputs) {
        maxInputs = count;
        bestForm = form;
      }
    }
    if (bestForm && maxInputs > 3) return bestForm;

    // 3. Multiple sibling sections with inputs → use entire body
    const bodySections = Array.from(document.body.children).filter((el) => {
      const tag = el.tagName.toLowerCase();
      const hasInputs =
        el.querySelectorAll('input:not([type="hidden"]),textarea,select').length > 0;
      return (tag === 'section' || tag === 'div') && hasInputs;
    });
    if (bodySections.length > 1) {
      Logger.info('Multiple top-level sections — scanning full document');
      return document.body;
    }

    // 4. Containers with booking-keyword class/id + enough inputs
    const keywords = [
      'booking',
      'traveller',
      'passenger',
      'checkout',
      'payment',
      'reservation',
    ];
    const candidates = [];
    for (const kw of keywords) {
      document
        .querySelectorAll(`[class*="${kw}"], [id*="${kw}"]`)
        .forEach((el) => {
          const count = el.querySelectorAll(
            'input:not([type="hidden"]),textarea,select'
          ).length;
          if (count >= 3) candidates.push({ el, count });
        });
    }

    if (candidates.length > 0) {
      if (candidates.length > 1) {
        const firstParent = candidates[0].el.parentElement;
        const allSameParent = candidates.every(
          (c) => c.el.parentElement === firstParent
        );
        if (allSameParent && firstParent) {
          Logger.debug('Sibling booking containers — using common parent');
          return firstParent;
        }
      }
      candidates.sort((a, b) => b.count - a.count);
      return candidates[0].el;
    }

    // 5. Any container with 5+ inputs
    for (const container of document.querySelectorAll('div, section, main')) {
      const count = container.querySelectorAll(
        'input:not([type="hidden"]),textarea,select'
      ).length;
      if (count >= 5) return container;
    }

    // 6. Last resort
    return document.body;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.findFormBoundary = findFormBoundary;
})();
