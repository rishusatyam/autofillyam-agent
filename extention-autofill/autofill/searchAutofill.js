// ========================================
// Search Autofill — Orchestrator
// ========================================
// Routes fill requests to the correct strategy file.
// Isolated from traveller form autofill (autofill/index.js).
//
// Strategies in searchStrategies/:
//   locationFill, dateFill, travellersPopupFill, dropdownFill
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
    Logger.info('[SearchAutofill] Values to fill:', values);
    Logger.info('[SearchAutofill] Registry keys:', Object.keys(fieldRegistry));

    // ── Special handling for travellers popup fields ──────────────────
    // Detect travellers fields by scanning registry for popup fields (counter/toggle with isPopupField meta)
    Logger.debug('[SearchAutofill] Scanning registry for travellers popup fields...');
    
    const travellersFieldIds = [];
    const travellersFieldMap = {}; // fieldId -> { type, counterType, element }
    let triggerElement = null;

    for (const [fieldId, entry] of Object.entries(fieldRegistry)) {
      if (!entry || !entry.meta) continue;

      // Check if this is a popup field (counter or toggle for travellers)
      const isPopupField = entry.meta.isPopupField === true;
      const isCounter = entry.type === 'counter';
      const isToggle = entry.type === 'toggle' && entry.meta.isMutuallyExclusive === true;

      if (isPopupField && (isCounter || isToggle)) {
        travellersFieldIds.push(fieldId);
        travellersFieldMap[fieldId] = {
          type: entry.type,
          counterType: entry.meta.counterType || null,
          element: entry.element,
          label: entry.label,
        };

        // Use first field as trigger element
        if (!triggerElement) {
          triggerElement = entry._element || entry.element;
        }

        Logger.debug(`[SearchAutofill] Found travellers field: ${fieldId} (${entry.type}, label: ${entry.label})`);
      }
    }

    Logger.info(`[SearchAutofill] Detected ${travellersFieldIds.length} travellers popup fields:`, travellersFieldIds);

    // Check if we have values for any of these travellers fields
    const travellersValuesToFill = {};
    let hasTravellersValues = false;

    for (const fieldId of travellersFieldIds) {
      if (values[fieldId] !== null && values[fieldId] !== undefined && values[fieldId] !== '') {
        const fieldInfo = travellersFieldMap[fieldId];
        
        // Map to semantic keys for the popup fill function
        if (fieldInfo.type === 'counter' && fieldInfo.counterType) {
          travellersValuesToFill[fieldInfo.counterType] = values[fieldId];
          Logger.debug(`[SearchAutofill] Mapping ${fieldId} -> ${fieldInfo.counterType} = ${values[fieldId]}`);
        } else if (fieldInfo.type === 'toggle') {
          travellersValuesToFill.travelClass = values[fieldId];
          Logger.debug(`[SearchAutofill] Mapping ${fieldId} -> travelClass = ${values[fieldId]}`);
        }
        hasTravellersValues = true;
      }
    }

    if (hasTravellersValues && triggerElement) {
      Logger.info('[SearchAutofill] ✓ Travellers popup fields detected, using popup fill strategy');
      Logger.info('[SearchAutofill] Travellers values to fill:', travellersValuesToFill);
      Logger.info('[SearchAutofill] Trigger element:', triggerElement.tagName, triggerElement.className);
      
      try {
        const ok = await searchRetryAction(
          () => window.TravelID.fillTravellersPopup(triggerElement, travellersValuesToFill, travellersFieldMap),
          1,
          400
        );

        if (ok) {
          // Count how many fields were filled
          for (const fieldId of travellersFieldIds) {
            if (values[fieldId]) {
              filled++;
              Logger.info(`[SearchAutofill] ✓ Travellers field "${fieldId}" filled with "${values[fieldId]}"`);
            }
          }
        } else {
          // Count as skipped
          for (const fieldId of travellersFieldIds) {
            if (values[fieldId]) {
              skipped++;
              Logger.warn(`[SearchAutofill] ✗ Could not fill travellers field "${fieldId}"`);
            }
          }
        }
      } catch (err) {
        errors++;
        Logger.error('[SearchAutofill] Error filling travellers popup:', err?.message ?? err);
        Logger.error('[SearchAutofill] Stack trace:', err?.stack);
      }

      await searchSleep(WAIT_BETWEEN_FIELDS);
    } else {
      if (travellersFieldIds.length > 0 && !hasTravellersValues) {
        Logger.debug('[SearchAutofill] Travellers fields detected but no values to fill');
      } else if (hasTravellersValues && !triggerElement) {
        Logger.warn('[SearchAutofill] Travellers values present but no trigger element found');
      } else {
        Logger.debug('[SearchAutofill] No travellers popup fields detected');
      }
    }

    // ── Fill remaining non-travellers fields ───────────────────────────
    Logger.info('[SearchAutofill] Processing remaining fields...');
    
    for (const [fieldId, value] of Object.entries(values)) {
      // Skip travellers fields (already handled above)
      if (travellersFieldIds.includes(fieldId)) {
        Logger.debug(`[SearchAutofill] Skipping "${fieldId}" (already handled by travellers popup)`);
        continue;
      }

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
   * Note: counter and toggle types for travellers are handled separately in autofillSearch.
   *
   * @param {{ type: string, element: HTMLElement, options?: string[], meta?: object }} entry
   * @param {string} value
   * @returns {Promise<boolean>}
   */
  async function _fillByType(entry, value) {
    const {
      fillSearchLocation, fillSearchDate,
      fillSearchDropdown,
    } = window.TravelID;

    switch (entry.type) {
      case 'location':  return fillSearchLocation(entry.element, value);
      case 'date':      return fillSearchDate(entry.element, value);
      case 'dropdown':  return fillSearchDropdown(entry.element, value);
      case 'counter':
      case 'toggle':
        // These should be handled by travellersPopupFill, not individually
        window.TravelID.Logger.warn(`[SearchAutofill] ${entry.type} should be handled by travellersPopupFill`);
        return false;
      default:
        window.TravelID.Logger.warn(`[SearchAutofill] Unknown type: ${entry.type}`);
        return false;
    }
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.autofillSearch = autofillSearch;
})();
