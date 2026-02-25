// ========================================
// Search Autofill Strategy — Dropdown
// ========================================
// Fills custom dropdowns (cabin class, fare type, room type).
//
// Fixes:
//   - Snapshots DOM before click to ignore STALE options
//   - Score-based option matching (exact > starts-with > contains)
//   - Proper overlay cleanup on failure
// ========================================
(function () {
  'use strict';

  /** Selectors for dropdown option items */
  const OPTION_SELECTORS = [
    '[role="option"]',
    '[role="listitem"]',
    'li[class*="option" i]',
    'li[class*="item" i]',
    'div[class*="option" i]',
    'div[class*="item" i]',
    'div[class*="select" i]',
  ].join(',');

  const WAIT_AFTER_CLICK = 400;

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fill a custom dropdown by clicking it open and selecting a matching option.
   *
   * @param {HTMLElement} el    - dropdown trigger element
   * @param {string}      value - desired option text
   * @returns {Promise<boolean>}
   */
  async function fillSearchDropdown(el, value) {
    const {
      searchClick, searchSleep, searchNormalizeText,
      searchWaitForCondition, searchCloseOverlay,
    } = window.TravelID;

    const target = searchNormalizeText(value);
    if (!target) return false;

    // Snapshot existing option elements BEFORE clicking
    const existingOptions = new Set(document.querySelectorAll(OPTION_SELECTORS));

    // Click to open
    searchClick(el);
    await searchSleep(WAIT_AFTER_CLICK);

    // Wait for NEW option elements to appear
    const freshOptions = await searchWaitForCondition(() => {
      const all = Array.from(document.querySelectorAll(OPTION_SELECTORS));
      const newOnes = all.filter(opt => !existingOptions.has(opt));
      // Prefer newly added options; fall back to all visible ones
      const candidates = newOnes.length > 0 ? newOnes : all;
      const visible = candidates.filter(opt => {
        const r = opt.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return visible.length > 0 ? visible : null;
    }, 1500, 150);

    if (!freshOptions || freshOptions.length === 0) {
      searchCloseOverlay();
      return false;
    }

    // Score and pick best match
    let bestOpt   = null;
    let bestScore = -1;

    for (const opt of freshOptions) {
      const text = searchNormalizeText(opt.textContent);
      const score = _scoreOption(text, target);
      if (score > bestScore) {
        bestScore = score;
        bestOpt   = opt;
      }
    }

    if (bestOpt && bestScore >= 0) {
      searchClick(bestOpt);
      await searchSleep(200);
      return true;
    }

    searchCloseOverlay();
    return false;
  }

  /**
   * Score an option against the target text.
   *
   * @param {string} optionText
   * @param {string} target
   * @returns {number}
   */
  function _scoreOption(optionText, target) {
    if (!optionText) return -1;
    if (optionText === target) return 100;
    if (optionText.startsWith(target)) return 80;
    if (optionText.includes(target)) return 60;
    if (target.includes(optionText)) return 40;
    return -1;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.fillSearchDropdown = fillSearchDropdown;
})();
