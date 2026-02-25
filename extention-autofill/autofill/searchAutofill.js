// ========================================
// Search Autofill — Orchestrator
// ========================================
// Routes fill requests to the correct strategy file.
// Isolated from traveller form autofill (autofill/index.js).
//
// Strategies in searchStrategies/:
//   locationFill, dateFill, counterFill, toggleFill, dropdownFill
//
// Helpers in searchHelpers/:
//   domHelpers, waitHelpers
//
// Main export:
//   autofillSearch(values, fieldRegistry) → { filled, skipped, errors }
// ========================================
(function () {
  'use strict';

  /** Pause between consecutive field fills to let SPA settle */
  const WAIT_BETWEEN_FIELDS = 300;

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fill all search widget fields using values from the /mapping/search API.
   *
   * @param {Record<string, string>} values        - fieldId → value
   * @param {Record<string, { type: string, element: HTMLElement, options?: string[], meta?: object }>} fieldRegistry
   * @returns {Promise<{ filled: number, skipped: number, errors: number }>}
   */
  async function autofillSearch(values, fieldRegistry) {
    const {
      Logger, searchSleep, searchRetryAction,
      searchBlockFormSubmit, searchUnblockFormSubmit,
    } = window.TravelID;

    if (!values || !fieldRegistry) {
      Logger.warn('[SearchAutofill] Invalid input — values or registry missing');
      return { filled: 0, skipped: 0, errors: 0 };
    }

    const startTime = Date.now();
    let filled = 0, skipped = 0, errors = 0;

    // ── Block all form submissions while we are filling fields ────────
    // This prevents stray Enter keys or button clicks from triggering
    // a search / navigation before autofill completes.
    searchBlockFormSubmit();
    Logger.info('[SearchAutofill] Form submissions blocked during autofill');

    Logger.group('SearchAutofill');
    Logger.info('Values to fill:', values);

    for (const [fieldId, value] of Object.entries(values)) {
      if (value === null || value === undefined || value === '') {
        skipped++;
        continue;
      }

      const entry = fieldRegistry[fieldId];
      if (!entry || !entry.element) {
        Logger.warn(`[SearchAutofill] "${fieldId}" not in registry or missing element`);
        skipped++;
        continue;
      }

      Logger.info(`[SearchAutofill] Filling "${fieldId}" (${entry.type}): "${value}"`);

      try {
        // Use retry wrapper for resilience (1 retry = 2 total attempts)
        const ok = await searchRetryAction(
          () => _fillByType(entry, value),
          1,
          400
        );

        if (ok) {
          filled++;
          Logger.info(`[SearchAutofill] ✓ "${fieldId}" filled with "${value}"`);
        } else {
          skipped++;
          Logger.warn(`[SearchAutofill] ✗ Could not fill "${fieldId}"`);
        }
      } catch (err) {
        errors++;
        Logger.warn(`[SearchAutofill] Error filling "${fieldId}":`, err?.message ?? err);
      }

      // Pause between fields
      await searchSleep(WAIT_BETWEEN_FIELDS);
    }

    // ── Re-enable form submissions ─────────────────────────────────────
    searchUnblockFormSubmit();
    Logger.info('[SearchAutofill] Form submissions unblocked');

    const duration = Date.now() - startTime;
    Logger.info(`[SearchAutofill] Done in ${duration}ms — ${filled} filled, ${skipped} skipped, ${errors} errors`);
    Logger.groupEnd();

    return { filled, skipped, errors };
  }

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Route to the correct fill strategy.
   *
   * @param {{ type: string, element: HTMLElement, options?: string[], meta?: object }} entry
   * @param {string} value
   * @returns {Promise<boolean>}
   */
  async function _fillByType(entry, value) {
    const {
      fillSearchLocation, fillSearchDate,
      fillSearchCounter, fillSearchToggle,
      fillSearchDropdown,
    } = window.TravelID;

    switch (entry.type) {
      case 'location':  return fillSearchLocation(entry.element, value);
      case 'date':      return fillSearchDate(entry.element, value);
      case 'counter':   return fillSearchCounter(entry.element, value);
      case 'toggle':    return fillSearchToggle(entry.element, value, entry.options || []);
      case 'dropdown':  return fillSearchDropdown(entry.element, value);
      default:
        window.TravelID.Logger.warn(`[SearchAutofill] Unknown type: ${entry.type}`);
        return false;
    }
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.autofillSearch = autofillSearch;
})();
