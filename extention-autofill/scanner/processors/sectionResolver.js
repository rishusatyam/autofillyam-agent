// ========================================
// Processor — Section Resolver
// ========================================
// Walks up the DOM to find the nearest section heading
// (fieldset > legend, or h1-h6) to provide context grouping.
// ========================================
(function () {
  'use strict';

  /**
   * Find the nearest section heading that contextually groups this element.
   *
   * @param {Element} el
   * @returns {string|null}
   */
  function findSection(el) {
    let cur = el.parentElement;
    for (let i = 0; i < 10 && cur; i++, cur = cur.parentElement) {
      if (cur.tagName === 'FIELDSET') {
        const legend = cur.querySelector('legend');
        if (legend) return legend.textContent.trim();
      }
      const h = cur.querySelector('h1,h2,h3,h4,h5,h6');
      if (h) return h.textContent.trim();
    }
    return null;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.findSection = findSection;
})();
