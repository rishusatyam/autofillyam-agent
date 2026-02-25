// ========================================
// Search Autofill Strategy — Toggle
// ========================================
// Selects trip type (One Way / Round Trip), cabin class, etc.
//
// Fixes:
//   - EXACT match before partial match (avoids "Premium Economy" for "Economy")
//   - Searches deeper in the tree (up to 3 parent levels)
//   - Among partial matches, picks the shortest text (most specific)
//   - Handles both ARIA roles and plain buttons
// ========================================
(function () {
  'use strict';

  /** Selectors for clickable toggle/radio/tab elements */
  const TOGGLE_CANDIDATES = '[role="radio"], [role="tab"], button, li, [role="option"]';

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Select a toggle option.
   *
   * @param {HTMLElement} el      - toggle group container
   * @param {string}      value   - desired value (e.g. "One Way", "Economy")
   * @param {string[]}    options - known option labels from scanner
   * @returns {Promise<boolean>}
   */
  async function fillSearchToggle(el, value, options) {
    const { searchClick, searchSleep, searchNormalizeText } = window.TravelID;
    const target = searchNormalizeText(value);

    // Build search scope: el → parent → grandparent → great-grandparent
    const roots = [el];
    let p = el.parentElement;
    for (let i = 0; i < 3 && p; i++) {
      roots.push(p);
      p = p.parentElement;
    }

    // Phase 1: Exact text match (highest confidence)
    for (const root of roots) {
      const candidates = Array.from(root.querySelectorAll(TOGGLE_CANDIDATES));
      for (const btn of candidates) {
        if (searchNormalizeText(btn.textContent) === target) {
          searchClick(btn);
          await searchSleep(200);
          return true;
        }
      }
    }

    // Phase 2: Starts-with match (e.g. target "economy" ↔ "Economy Class")
    for (const root of roots) {
      const candidates = Array.from(root.querySelectorAll(TOGGLE_CANDIDATES));
      for (const btn of candidates) {
        const text = searchNormalizeText(btn.textContent);
        if (text.startsWith(target) || target.startsWith(text)) {
          searchClick(btn);
          await searchSleep(200);
          return true;
        }
      }
    }

    // Phase 3: Contains match — pick the SHORTEST match to avoid
    // clicking "Premium Economy" when "Economy" is wanted
    const allCandidates = [];
    for (const root of roots) {
      const candidates = Array.from(root.querySelectorAll(TOGGLE_CANDIDATES));
      for (const btn of candidates) {
        const text = searchNormalizeText(btn.textContent);
        if (text.includes(target)) {
          allCandidates.push({ btn, text });
        }
      }
    }

    if (allCandidates.length > 0) {
      allCandidates.sort((a, b) => a.text.length - b.text.length);
      searchClick(allCandidates[0].btn);
      await searchSleep(200);
      return true;
    }

    // Phase 4: Fallback — match by options index
    if (options && options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        if (searchNormalizeText(options[i]).includes(target)) {
          const allBtns = Array.from(
            (el.parentElement || el).querySelectorAll('[role="radio"], [role="tab"], button')
          );
          if (allBtns[i]) {
            searchClick(allBtns[i]);
            await searchSleep(200);
            return true;
          }
        }
      }
    }

    return false;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.fillSearchToggle = fillSearchToggle;
})();
