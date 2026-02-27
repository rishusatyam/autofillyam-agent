// ========================================
// Travellers Fields Detector
// Scans popup contents for counters and travel class
// ========================================

(function () {
  'use strict';

  /**
   * Scan travellers popup for counter and class fields.
   * @param {Element} popup - The popup/modal element
   * @param {Map<string, object>} existingFields - Already detected fields
   * @returns {Array<{ key: string, field: object }>}
   */
  function scanTravellersFields(popup, existingFields) {
    const { Logger } = window.TravelID || {};
    if (!popup) return [];

    Logger?.group('[TravellersFieldsDetector] Scanning popup fields');

    const results = [];

    // Scan for counter fields (Adults, Children, Infants)
    const counters = scanCounterFields(popup, existingFields);
    results.push(...counters);
    Logger?.debug(`[TravellersFieldsDetector] Found ${counters.length} counter fields`);

    // Scan for travel class field
    const classField = scanTravelClassField(popup, existingFields);
    if (classField) {
      results.push(classField);
      Logger?.debug('[TravellersFieldsDetector] Found travel class field');
    }

    Logger?.info(`[TravellersFieldsDetector] Total fields scanned: ${results.length}`);
    Logger?.groupEnd();

    return results;
  }

  // ─── Counter Fields Scanner ──────────────────────────────────────────

  /**
   * Scan for counter fields (Adults, Children, Infants).
   * @param {Element} popup
   * @param {Map<string, object>} existingFields
   * @returns {Array<{ key: string, field: object }>}
   */
  function scanCounterFields(popup, existingFields) {
    const { Logger } = window.TravelID || {};
    const results = [];

    // Counter keywords to look for
    const counterTypes = [
      { keywords: ['adult'], label: 'Adults' },
      { keywords: ['child', 'children'], label: 'Children' },
      { keywords: ['infant'], label: 'Infants' },
    ];

    for (const { keywords, label } of counterTypes) {
      const counterElement = findCounterElement(popup, keywords);
      
      if (!counterElement) {
        Logger?.debug(`[TravellersFieldsDetector] Counter not found: ${label}`);
        continue;
      }

      const dedupKey = `counter:${_normalise(label)}`;
      if (existingFields.has(dedupKey)) {
        Logger?.debug(`[TravellersFieldsDetector] Counter already exists: ${label}`);
        continue;
      }

      // Extract current value
      const value = extractCounterValue(counterElement);
      
      // Detect +/- buttons
      const hasButtons = detectCounterButtons(counterElement);

      Logger?.debug(`[TravellersFieldsDetector] Counter detected: ${label} = ${value}`, {
        hasButtons,
        element: counterElement.className,
      });

      results.push({
        key: dedupKey,
        field: {
          type: 'counter',
          label,
          placeholder: value || '0',
          section: 'Travellers',
          options: [],
          _element: counterElement,
          _meta: {
            hasButtons,
            counterType: label.toLowerCase(),
            isPopupField: true,
          },
        },
      });
    }

    return results;
  }

  /**
   * Find counter element by keywords.
   * @param {Element} popup
   * @param {string[]} keywords
   * @returns {Element|null}
   */
  function findCounterElement(popup, keywords) {
    // Try to find by class name
    for (const keyword of keywords) {
      const byClass = popup.querySelector(`[class*="${keyword}" i]`);
      if (byClass) return byClass.closest('[class*="counter" i], [class*="row" i], li, div');
    }

    // Try to find by label text
    const allElements = Array.from(popup.querySelectorAll('div, li, span, label'));
    for (const el of allElements) {
      const text = el.textContent.toLowerCase();
      if (keywords.some(kw => text.includes(kw))) {
        return el.closest('[class*="counter" i], [class*="row" i], li, div');
      }
    }

    return null;
  }

  /**
   * Extract current counter value from element.
   * @param {Element} element
   * @returns {string}
   */
  function extractCounterValue(element) {
    // Look for input field
    const input = element.querySelector('input[type="text"], input[type="number"]');
    if (input && input.value) return input.value;

    // Look for span/div with number
    const numberElements = Array.from(element.querySelectorAll('span, div, p'));
    for (const el of numberElements) {
      const text = el.textContent.trim();
      if (/^\d+$/.test(text)) return text;
    }

    return '0';
  }

  /**
   * Detect if counter has +/- buttons.
   * @param {Element} element
   * @returns {boolean}
   */
  function detectCounterButtons(element) {
    const buttons = Array.from(element.querySelectorAll('button, [role="button"], span[class*="button" i]'));
    
    let hasPlus = false;
    let hasMinus = false;

    for (const btn of buttons) {
      const text = btn.textContent.trim();
      const className = btn.className.toLowerCase();
      
      if (text === '+' || className.includes('plus') || className.includes('increment')) {
        hasPlus = true;
      }
      if (text === '-' || text === '−' || className.includes('minus') || className.includes('decrement')) {
        hasMinus = true;
      }
    }

    return hasPlus && hasMinus;
  }

  // ─── Travel Class Field Scanner ──────────────────────────────────────

  /**
   * Scan for travel class field (Economy, Premium, Business, First).
   * @param {Element} popup
   * @param {Map<string, object>} existingFields
   * @returns {{ key: string, field: object }|null}
   */
  function scanTravelClassField(popup, existingFields) {
    const { Logger } = window.TravelID || {};

    const dedupKey = 'toggle:travelclass';
    if (existingFields.has(dedupKey)) {
      Logger?.debug('[TravellersFieldsDetector] Travel class already exists');
      return null;
    }

    // Find the travel class section
    const classSection = findTravelClassSection(popup);
    if (!classSection) {
      Logger?.debug('[TravellersFieldsDetector] Travel class section not found');
      return null;
    }

    // Extract class options
    const options = extractClassOptions(classSection);
    if (options.length === 0) {
      Logger?.debug('[TravellersFieldsDetector] No class options found');
      return null;
    }

    // Find selected option
    const selectedOption = findSelectedClass(classSection, options);

    Logger?.debug('[TravellersFieldsDetector] Travel class detected', {
      options,
      selected: selectedOption,
      element: classSection.className,
    });

    return {
      key: dedupKey,
      field: {
        type: 'toggle',
        label: 'Travel Class',
        placeholder: selectedOption || options[0],
        section: 'Travellers',
        options,
        _element: classSection,
        _meta: {
          isPopupField: true,
          isMutuallyExclusive: true,
        },
      },
    };
  }

  /**
   * Find travel class section in popup.
   * @param {Element} popup
   * @returns {Element|null}
   */
  function findTravelClassSection(popup) {
    // Try by class name
    const byClass = popup.querySelector('[class*="class" i]:not([class*="traveller" i])');
    if (byClass) return byClass;

    // Try by text content
    const keywords = ['economy', 'premium', 'business', 'first class'];
    const allElements = Array.from(popup.querySelectorAll('div, section, ul'));
    
    for (const el of allElements) {
      const text = el.textContent.toLowerCase();
      const matchCount = keywords.filter(kw => text.includes(kw)).length;
      if (matchCount >= 2) return el;
    }

    return null;
  }

  /**
   * Extract class options from section.
   * @param {Element} section
   * @returns {string[]}
   */
  function extractClassOptions(section) {
    const options = [];
    const classKeywords = ['economy', 'premium', 'business', 'first'];

    // Try buttons first
    const buttons = Array.from(section.querySelectorAll('button, [role="button"], li, [class*="option" i]'));
    
    for (const btn of buttons) {
      const text = btn.textContent.trim();
      const lowerText = text.toLowerCase();
      
      // Check if this is a class option
      if (classKeywords.some(kw => lowerText.includes(kw))) {
        // Clean up the text
        const cleanText = text.replace(/\s*\(.*?\)\s*/g, '').trim();
        if (cleanText && !options.includes(cleanText)) {
          options.push(cleanText);
        }
      }
    }

    return options;
  }

  /**
   * Find currently selected class option.
   * @param {Element} section
   * @param {string[]} options
   * @returns {string|null}
   */
  function findSelectedClass(section, options) {
    // Look for selected/active indicators
    const selected = section.querySelector('[class*="selected" i], [class*="active" i], [aria-selected="true"], [aria-checked="true"]');
    
    if (selected) {
      const text = selected.textContent.trim().replace(/\s*\(.*?\)\s*/g, '').trim();
      if (options.includes(text)) return text;
    }

    // Default to first option
    return options[0] || null;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  function _normalise(text) {
    return (text || '').toLowerCase().replace(/\s+/g, '').trim();
  }

  // ─── Export ──────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.scanTravellersFields = scanTravellersFields;
})();
