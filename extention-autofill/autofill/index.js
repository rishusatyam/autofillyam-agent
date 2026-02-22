// ========================================
// Autofill — Engine
// ========================================
// Fills form fields from a backend response.
// Delegates to per-type strategy functions.
// ========================================
(function () {
  'use strict';

  /**
   * Fill all fields described in `response` using DOM references from `registry`.
   *
   * @param {{ values: Record<string, *> }} response  - backend response
   * @param {import('./registry').FieldRegistry|import('../scanner/types').FieldRegistry} registry
   *   Either a FieldRegistry instance or a plain fieldId→entry map.
   * @returns {{ filled: number, skipped: number, errors: number }}
   */
  async function autofillFromBackend(response, registry) {
    const { Logger, fillTextInput, fillDropdown, fillRadio, fillCheckbox } =
      window.TravelID;

    if (!response?.values || !registry) {
      Logger.warn('[Autofill] Invalid input', { response, registry });
      return { filled: 0, skipped: 0, errors: 0 };
    }

    // Support both FieldRegistry instances and plain objects
    const lookup =
      typeof registry.get === 'function'
        ? (id) => registry.get(id)
        : (id) => registry[id];

    Logger.group('Autofill');
    Logger.info('Values to fill:', response.values);

    let filled = 0;
    let skipped = 0;
    let errors = 0;

    for (const [fieldId, value] of Object.entries(response.values)) {
      if (value === null || value === undefined) {
        skipped++;
        continue;
      }

      const entry = lookup(fieldId);
      if (!entry) {
        Logger.warn(`[Autofill] "${fieldId}" not in registry`);
        skipped++;
        continue;
      }

      try {
        const ok = await _fillEntry(entry, value, {
          fillTextInput,
          fillDropdown,
          fillRadio,
          fillCheckbox,
        });
        if (ok) {
          filled++;
          Logger.debug(`✓ ${fieldId} (${entry.type}):`, value);
        } else {
          skipped++;
          Logger.warn(`[Autofill] could not fill "${fieldId}"`);
        }
      } catch (err) {
        errors++;
        Logger.error(`[Autofill] error filling "${fieldId}":`, err);
      }
    }

    Logger.info(`Summary: ${filled} filled, ${skipped} skipped, ${errors} errors`);
    Logger.groupEnd();

    return { filled, skipped, errors };
  }

  /**
   * Dispatch fill to the correct strategy.
   *
   * @param {import('../scanner/types').RegistryEntry} entry
   * @param {*} value
   * @param {{ fillTextInput: Function, fillDropdown: Function, fillRadio: Function, fillCheckbox: Function }} strategies
   * @returns {boolean}
   */
  async function _fillEntry(entry, value, strategies) {
    const { type, element, elements } = entry;

    switch (type) {
      case 'text':
        return strategies.fillTextInput(element, value);

      case 'dropdown':
        return await strategies.fillDropdown(element, value);

      case 'radio':
        return strategies.fillRadio(elements || [element], value);

      case 'checkbox':
        return strategies.fillCheckbox(element, value);

      case 'toggle':
        return strategies.fillCheckbox(element, value); // same semantics

      default:
        window.TravelID.Logger.warn('[Autofill] Unknown type:', type);
        return false;
    }
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.autofillFromBackend = autofillFromBackend;
})();
