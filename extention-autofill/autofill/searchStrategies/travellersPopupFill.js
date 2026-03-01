// ========================================
// Search Autofill Strategy — Travellers Popup
// ========================================
// Handles autofill for travellers popup containing:
//   - Counter fields (Adults, Children, Infants)
//   - Travel class selection (Economy, Premium, Business, First)
//
// Works with multiple UI patterns:
//   Pattern A: Direct number buttons (MakeMyTrip, Goibibo, Cleartrip)
//   Pattern B: +/- increment buttons (Booking.com, Expedia)
//   Pattern C: Numeric input fields (Hotel sites)
//   Pattern D: Button groups, dropdowns, radio buttons for class
//
// Flow:
//   1. Open travellers popup (click trigger field)
//   2. Fill counter fields (Adults, Children, Infants)
//   3. Fill travel class field
//   4. Close/Apply popup
//   5. Verify values applied
// ========================================
(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────

  /** Delay after opening popup */
  const POPUP_OPEN_DELAY = 800;

  /** Delay after clicking a field */
  const CLICK_DELAY = 300;

  /** Delay after filling all fields before closing */
  const SETTLE_DELAY = 400;

  /** Delay after closing popup */
  const POPUP_CLOSE_DELAY = 500;

  /** Max attempts to click increment/decrement buttons */
  const MAX_INCREMENT_CLICKS = 20;

  /** Keywords for counter types */
  const COUNTER_KEYWORDS = {
    adults: ['adult', 'adults', 'pax'],
    children: ['child', 'children', 'kids'],
    infants: ['infant', 'infants', 'baby', 'babies'],
  };

  /** Keywords for travel class */
  const CLASS_KEYWORDS = ['economy', 'premium', 'business', 'first', 'class'];

  // ────────────────────────────────────────────────────────────────────────
  // Main Entry Point
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fill travellers popup with counter and class values.
   * 
   * @param {HTMLElement} triggerElement - The element that opens the popup
   * @param {Object} values - Values to fill { adults, children, infants, travelClass }
   * @param {Object} travellersFieldMap - Map of semantic keys to field info { adults: {type, counterType, element}, travelClass: {...} }
   * @returns {Promise<boolean>}
   */
  async function fillTravellersPopup(triggerElement, values, travellersFieldMap) {
    const { Logger, searchSleep } = window.TravelID;

    Logger.group('[TravellersPopupFill] ========== Starting Travellers Popup Autofill ==========');
    Logger.info('[TravellersPopupFill] Trigger element:', triggerElement?.tagName, triggerElement?.className);
    Logger.info('[TravellersPopupFill] Values to fill:', values);
    Logger.info('[TravellersPopupFill] Field map keys available:', Object.keys(travellersFieldMap));

    try {
      // ── Step 1: Open popup ─────────────────────────────────────────────
      Logger.info('[TravellersPopupFill] ========== STEP 1: Opening Popup ==========');
      Logger.debug('[TravellersPopupFill] Clicking trigger element to open popup...');
      const popupOpened = await openTravellersPopup(triggerElement);
      
      if (!popupOpened) {
        Logger.error('[TravellersPopupFill] ✗ Failed to open popup - aborting autofill');
        Logger.groupEnd();
        return false;
      }
      Logger.info('[TravellersPopupFill] ✓ Popup opened successfully');

      await searchSleep(POPUP_OPEN_DELAY);

      // ── Step 2: Fill counter fields ────────────────────────────────────
      Logger.info('[TravellersPopupFill] ========== STEP 2: Filling Counter Fields ==========');
      
      const countersToFill = [
        { key: 'adults', value: values.adults },
        { key: 'children', value: values.children },
        { key: 'infants', value: values.infants },
      ];
      
      Logger.debug('[TravellersPopupFill] Counters to process:', countersToFill.map(c => `${c.key}=${c.value || 'skip'}`).join(', '));

      for (const { key, value } of countersToFill) {
        if (value === null || value === undefined || value === '') {
          Logger.debug(`[TravellersPopupFill] Skipping ${key} (no value)`);
          continue;
        }

        // Find field info from travellersFieldMap by counterType
        const fieldInfo = Object.values(travellersFieldMap).find(f => f.counterType === key);
        if (!fieldInfo) {
          Logger.warn(`[TravellersPopupFill] Counter field not found in field map: ${key}`);
          continue;
        }

        Logger.info(`[TravellersPopupFill] Filling ${key} = ${value}`);
        const filled = await fillCounterField(key, value, fieldInfo);
        
        if (filled) {
          Logger.info(`[TravellersPopupFill] ✓ ${key} filled successfully`);
        } else {
          Logger.warn(`[TravellersPopupFill] ✗ Failed to fill ${key}`);
        }

        await searchSleep(CLICK_DELAY);
      }

      // ── Step 3: Fill travel class ──────────────────────────────────────
      Logger.info('[TravellersPopupFill] ========== STEP 3: Filling Travel Class ==========');
      
      if (values.travelClass) {
        // Find travel class field from travellersFieldMap
        const classFieldInfo = Object.values(travellersFieldMap).find(f => f.type === 'toggle');
        
        if (classFieldInfo) {
          Logger.info(`[TravellersPopupFill] Filling travel class = ${values.travelClass}`);
          const filled = await fillTravelClass(values.travelClass, classFieldInfo);
          
          if (filled) {
            Logger.info('[TravellersPopupFill] ✓ Travel class filled successfully');
          } else {
            Logger.warn('[TravellersPopupFill] ✗ Failed to fill travel class');
          }
        } else {
          Logger.warn('[TravellersPopupFill] Travel class field not found in field map');
        }
      } else {
        Logger.debug('[TravellersPopupFill] Skipping travel class (no value)');
      }

      await searchSleep(SETTLE_DELAY);

      // ── Step 4: Close popup ────────────────────────────────────────────
      Logger.info('[TravellersPopupFill] ========== STEP 4: Closing Popup ==========');
      Logger.debug('[TravellersPopupFill] Looking for Apply/Done button or closing popup...');
      await closeTravellersPopup();
      await searchSleep(POPUP_CLOSE_DELAY);
      Logger.info('[TravellersPopupFill] ✓ Popup closed');

      // ── Step 5: Verify ──────────────────────────────────────────────────
      Logger.info('[TravellersPopupFill] ========== STEP 5: Verifying Values ==========');
      Logger.debug('[TravellersPopupFill] Checking if values were applied to trigger element...');
      const verified = verifyTravellersApplied(triggerElement, values);
      
      if (verified) {
        Logger.info('[TravellersPopupFill] ✓ Values verified in trigger element text');
      } else {
        Logger.warn('[TravellersPopupFill] ⚠ Could not verify values in trigger text (may still be correct)');
      }

      Logger.info('[TravellersPopupFill] ========== Autofill Completed Successfully ==========');
      Logger.groupEnd();
      return true;

    } catch (error) {
      Logger.error('[TravellersPopupFill] ========== ERROR DURING AUTOFILL ==========');
      Logger.error('[TravellersPopupFill] Error message:', error?.message);
      Logger.error('[TravellersPopupFill] Stack trace:', error?.stack);
      Logger.groupEnd();
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Open Popup
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Open the travellers popup by clicking the trigger element.
   * 
   * @param {HTMLElement} triggerElement
   * @returns {Promise<boolean>}
   */
  async function openTravellersPopup(triggerElement) {
    const { Logger, searchClick, searchSleep } = window.TravelID;

    if (!triggerElement) {
      Logger.warn('[TravellersPopupFill] No trigger element provided');
      return false;
    }

    Logger.debug('[TravellersPopupFill] Clicking trigger element');
    searchClick(triggerElement);
    await searchSleep(400);

    // Try clicking inner button if exists
    const innerBtn = triggerElement.querySelector('button, [role="button"], [tabindex]');
    if (innerBtn && innerBtn !== triggerElement) {
      Logger.debug('[TravellersPopupFill] Clicking inner button');
      searchClick(innerBtn);
      await searchSleep(400);
    }

    // Verify popup opened
    const popup = findTravellersPopup();
    if (popup) {
      Logger.debug('[TravellersPopupFill] Popup opened successfully');
      return true;
    }

    Logger.warn('[TravellersPopupFill] Popup not found after clicking');
    return false;
  }

  /**
   * Find the opened travellers popup in the DOM.
   * 
   * @returns {HTMLElement|null}
   */
  function findTravellersPopup() {
    const { Logger } = window.TravelID;

    Logger.debug('[TravellersPopupFill] Searching for popup in DOM...');

    // Strategy A: Look for visible modals/dialogs
    const modals = document.querySelectorAll(
      '[role="dialog"], [class*="modal" i], [class*="popup" i], ' +
      '[class*="dropdown" i], [class*="overlay" i]'
    );

    for (const modal of modals) {
      const rect = modal.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Check if it contains traveller-related content
        const text = modal.textContent.toLowerCase();
        const hasTravellerContent = 
          text.includes('adult') || 
          text.includes('child') || 
          text.includes('infant') ||
          text.includes('traveller') ||
          text.includes('passenger') ||
          text.includes('economy') ||
          text.includes('business');

        if (hasTravellerContent) {
          Logger.debug('[TravellersPopupFill] Found popup:', modal.className);
          return modal;
        }
      }
    }

    // Strategy B: Look for recently visible elements with traveller keywords
    const containers = document.querySelectorAll(
      '[class*="traveller" i], [class*="passenger" i], [class*="pax" i], ' +
      '[class*="guest" i], [class*="counter" i]'
    );

    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100) {
        Logger.debug('[TravellersPopupFill] Found popup container:', container.className);
        return container;
      }
    }

    Logger.debug('[TravellersPopupFill] No popup found');
    return null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Fill Counter Fields
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fill a counter field (Adults, Children, Infants).
   * 
   * @param {string} counterType - 'adults', 'children', or 'infants'
   * @param {string|number} targetValue - Desired count
   * @param {Object} fieldInfo - Field info from registry
   * @returns {Promise<boolean>}
   */
  async function fillCounterField(counterType, targetValue, fieldInfo) {
    const { Logger } = window.TravelID;

    const targetCount = parseInt(String(targetValue), 10);
    if (isNaN(targetCount) || targetCount < 0) {
      Logger.warn(`[TravellersPopupFill] Invalid counter value: ${targetValue}`);
      return false;
    }

    Logger.debug(`[TravellersPopupFill] Filling ${counterType} counter to ${targetCount}`);

    // Find the counter element in the popup
    const popup = findTravellersPopup();
    if (!popup) {
      Logger.warn('[TravellersPopupFill] Popup not found');
      return false;
    }

    const counterElement = findCounterElement(popup, counterType);
    if (!counterElement) {
      Logger.warn(`[TravellersPopupFill] Counter element not found for ${counterType}`);
      return false;
    }

    // Detect the counter pattern and fill accordingly
    const pattern = detectCounterPattern(counterElement);
    Logger.debug(`[TravellersPopupFill] Detected pattern for ${counterType}: ${pattern}`);

    switch (pattern) {
      case 'direct-buttons':
        return await fillByDirectButtons(counterElement, targetCount);
      case 'increment-buttons':
        return await fillByIncrementButtons(counterElement, targetCount);
      case 'numeric-input':
        return await fillByNumericInput(counterElement, targetCount);
      default:
        Logger.warn(`[TravellersPopupFill] Unknown counter pattern: ${pattern}`);
        return false;
    }
  }

  /**
   * Find counter element in popup by counter type.
   * 
   * @param {HTMLElement} popup
   * @param {string} counterType
   * @returns {HTMLElement|null}
   */
  function findCounterElement(popup, counterType) {
    const { Logger } = window.TravelID;
    const keywords = COUNTER_KEYWORDS[counterType] || [];

    Logger.debug(`[TravellersPopupFill] Looking for counter: ${counterType} with keywords:`, keywords);

    // Strategy A: Find by data-cy attribute (MakeMyTrip pattern)
    // Look for elements like <li data-cy="adults-1">, <li data-cy="adults-2">, etc.
    for (const keyword of keywords) {
      const dataCyPattern = `[data-cy*="${keyword}"]`;
      const byDataCy = popup.querySelector(dataCyPattern);
      if (byDataCy) {
        // Found an element with data-cy attribute
        // Get its parent (usually a ul or div containing all the number buttons)
        const parent = byDataCy.parentElement;
        if (parent) {
          Logger.debug(`[TravellersPopupFill] Found counter by data-cy: ${keyword} (parent: ${parent.tagName})`);
          return parent;
        }
        // Fallback to the element itself if no parent
        Logger.debug(`[TravellersPopupFill] Found counter by data-cy: ${keyword}`);
        return byDataCy;
      }
    }

    // Strategy B: Find by class name
    for (const keyword of keywords) {
      const byClass = popup.querySelector(`[class*="${keyword}" i]`);
      if (byClass) {
        const container = byClass.closest('[class*="counter" i], [class*="row" i], li, div');
        if (container) {
          Logger.debug(`[TravellersPopupFill] Found counter by class: ${keyword}`);
          return container;
        }
      }
    }

    // Strategy C: Find by text content
    const allElements = Array.from(popup.querySelectorAll('div, li, section, label'));
    for (const el of allElements) {
      const text = el.textContent.toLowerCase();
      if (keywords.some(kw => text.includes(kw))) {
        const container = el.closest('[class*="counter" i], [class*="row" i], li, div');
        if (container) {
          Logger.debug(`[TravellersPopupFill] Found counter by text content`);
          return container;
        }
      }
    }

    Logger.debug(`[TravellersPopupFill] Counter not found: ${counterType}`);
    return null;
  }

  /**
   * Detect which UI pattern the counter uses.
   * 
   * @param {HTMLElement} counterElement
   * @returns {'direct-buttons'|'increment-buttons'|'numeric-input'|'unknown'}
   */
  function detectCounterPattern(counterElement) {
    const { Logger } = window.TravelID;
    
    Logger.debug('[TravellersPopupFill] Detecting counter UI pattern...');

    // Pattern C: Numeric input (check first as it's most specific)
    const numInput = counterElement.querySelector('input[type="number"], input[type="text"]');
    if (numInput) {
      const value = numInput.value;
      if (/^\d*$/.test(value)) {
        Logger.debug('[TravellersPopupFill] Pattern: numeric-input');
        return 'numeric-input';
      }
    }

    // Get all clickable elements (buttons, li, span, div)
    const clickables = Array.from(
      counterElement.querySelectorAll('button, [role="button"], li, span[class*="button" i], div[class*="button" i]')
    );

    if (clickables.length === 0) {
      Logger.debug('[TravellersPopupFill] Pattern: unknown (no clickables)');
      return 'unknown';
    }

    // Pattern A: Direct number buttons (multiple clickables with numeric text or data-cy)
    const numericButtons = clickables.filter(btn => {
      // Strategy 1: Check data-cy attribute for number
      const dataCy = btn.getAttribute('data-cy');
      if (dataCy) {
        const match = dataCy.match(/(\d+)$/);
        if (match) return true;
      }
      
      // Strategy 2: Check text content
      const text = btn.textContent.trim();
      return /^\d+$/.test(text) || /^\+\d+$/.test(text);
    });

    Logger.debug(`[TravellersPopupFill] Found ${numericButtons.length} numeric clickables`);

    if (numericButtons.length >= 3) {
      Logger.debug('[TravellersPopupFill] Pattern: direct-buttons');
      return 'direct-buttons';
    }

    // Pattern B: Increment/decrement buttons (+ and - buttons)
    let hasPlus = false;
    let hasMinus = false;

    for (const btn of clickables) {
      const text = btn.textContent.trim();
      const className = (btn.className || '').toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();

      const combined = `${text} ${className} ${ariaLabel}`;

      if (/\+|plus|increment|increase|add/.test(combined)) {
        hasPlus = true;
      }
      if (/-|−|minus|decrement|decrease|subtract/.test(combined)) {
        hasMinus = true;
      }
    }

    if (hasPlus && hasMinus) {
      Logger.debug('[TravellersPopupFill] Pattern: increment-buttons');
      return 'increment-buttons';
    }

    Logger.debug('[TravellersPopupFill] Pattern: unknown');
    return 'unknown';
  }

  // ─── Pattern A: Direct Number Buttons ──────────────────────────────────

  /**
   * Fill counter by clicking direct number buttons (e.g., 1, 2, 3, 4, +9).
   * 
   * @param {HTMLElement} counterElement
   * @param {number} targetCount
   * @returns {Promise<boolean>}
   */
  async function fillByDirectButtons(counterElement, targetCount) {
    const { Logger, searchClick, searchSleep } = window.TravelID;

    Logger.info(`[TravellersPopupFill] → Using Pattern A: Direct Number Buttons (target: ${targetCount})`);

    // Find all clickable elements (buttons, li, span, div)
    const clickables = Array.from(
      counterElement.querySelectorAll('button, [role="button"], li, span[class*="button" i], div[class*="button" i]')
    );

    Logger.debug(`[TravellersPopupFill] Total clickables found: ${clickables.length}`);

    const numericButtons = clickables
      .map(btn => {
        let value = null;
        let text = btn.textContent.trim();

        // Strategy 1: Extract from data-cy attribute (e.g., "adults-1", "adults-2")
        const dataCy = btn.getAttribute('data-cy');
        if (dataCy) {
          const match = dataCy.match(/(\d+)$/);
          if (match) {
            value = parseInt(match[1], 10);
            text = match[1];
            Logger.debug(`[TravellersPopupFill] Found number from data-cy: ${dataCy} → ${value}`);
          }
        }

        // Strategy 2: Match exact number from text (e.g., "1", "2", "3")
        if (value === null && /^\d+$/.test(text)) {
          value = parseInt(text, 10);
        }
        
        // Strategy 3: Match +N format (e.g., "+9", "+6")
        if (value === null && /^\+\d+$/.test(text)) {
          const match = text.match(/^\+(\d+)$/);
          value = parseInt(match[1], 10);
        }

        return { btn, value, text };
      })
      .filter(item => item.value !== null)
      .sort((a, b) => a.value - b.value);

    Logger.info('[TravellersPopupFill] Found numeric buttons:', numericButtons.map(b => b.text).join(', '));

    if (numericButtons.length === 0) {
      Logger.error('[TravellersPopupFill] ✗ No numeric buttons found');
      Logger.debug('[TravellersPopupFill] Sample clickables:', clickables.slice(0, 5).map(el => ({
        tag: el.tagName,
        text: el.textContent.trim().substring(0, 20),
        dataCy: el.getAttribute('data-cy')
      })));
      return false;
    }

    // Find exact match
    const exactMatch = numericButtons.find(item => item.value === targetCount);
    if (exactMatch) {
      Logger.debug(`[TravellersPopupFill] Clicking exact match button: ${exactMatch.text}`);
      searchClick(exactMatch.btn);
      await searchSleep(CLICK_DELAY);
      return true;
    }

    // Find closest button (if target is higher than max button)
    const maxButton = numericButtons[numericButtons.length - 1];
    if (targetCount > maxButton.value) {
      Logger.debug(`[TravellersPopupFill] Target ${targetCount} > max button ${maxButton.value}, clicking max`);
      searchClick(maxButton.btn);
      await searchSleep(CLICK_DELAY);
      return true;
    }

    // Find closest lower button
    const closestButton = numericButtons.reverse().find(item => item.value <= targetCount);
    if (closestButton) {
      Logger.debug(`[TravellersPopupFill] Clicking closest button: ${closestButton.text}`);
      searchClick(closestButton.btn);
      await searchSleep(CLICK_DELAY);
      return true;
    }

    Logger.warn('[TravellersPopupFill] Could not find suitable button');
    return false;
  }

  // ─── Pattern B: Increment/Decrement Buttons ────────────────────────────

  /**
   * Fill counter by clicking +/- buttons repeatedly.
   * 
   * @param {HTMLElement} counterElement
   * @param {number} targetCount
   * @returns {Promise<boolean>}
   */
  async function fillByIncrementButtons(counterElement, targetCount) {
    const { Logger, searchClick, searchSleep } = window.TravelID;

    Logger.info(`[TravellersPopupFill] → Using Pattern B: +/- Increment Buttons (target: ${targetCount})`);

    // Find + and - buttons
    const buttons = Array.from(
      counterElement.querySelectorAll('button, [role="button"], span[class*="button" i]')
    );

    let plusBtn = null;
    let minusBtn = null;

    for (const btn of buttons) {
      const text = btn.textContent.trim();
      const className = (btn.className || '').toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const combined = `${text} ${className} ${ariaLabel}`;

      if (/\+|plus|increment|increase|add/.test(combined) && !plusBtn) {
        plusBtn = btn;
      }
      if (/-|−|minus|decrement|decrease|subtract/.test(combined) && !minusBtn) {
        minusBtn = btn;
      }
    }

    if (!plusBtn || !minusBtn) {
      Logger.warn('[TravellersPopupFill] Could not find +/- buttons');
      return false;
    }

    Logger.debug('[TravellersPopupFill] Found + and - buttons');

    // Find current count display
    const countDisplay = findCountDisplay(counterElement);
    let currentCount = readCountValue(countDisplay);
    Logger.debug(`[TravellersPopupFill] Current count: ${currentCount}, Target: ${targetCount}`);

    // Click + or - to reach target
    let clicks = 0;

    if (targetCount > currentCount) {
      // Need to increment
      while (currentCount < targetCount && clicks < MAX_INCREMENT_CLICKS) {
        searchClick(plusBtn);
        clicks++;
        await searchSleep(200);

        const newCount = readCountValue(countDisplay);
        if (newCount === currentCount) {
          Logger.warn(`[TravellersPopupFill] Increment stuck at ${currentCount}`);
          break;
        }
        currentCount = newCount;
      }
    } else if (targetCount < currentCount) {
      // Need to decrement
      while (currentCount > targetCount && clicks < MAX_INCREMENT_CLICKS) {
        searchClick(minusBtn);
        clicks++;
        await searchSleep(200);

        const newCount = readCountValue(countDisplay);
        if (newCount === currentCount) {
          Logger.warn(`[TravellersPopupFill] Decrement stuck at ${currentCount}`);
          break;
        }
        currentCount = newCount;
      }
    }

    Logger.debug(`[TravellersPopupFill] After ${clicks} clicks, count = ${currentCount}`);
    return currentCount === targetCount;
  }

  /**
   * Find the count display element (shows current number).
   * 
   * @param {HTMLElement} counterElement
   * @returns {HTMLElement|null}
   */
  function findCountDisplay(counterElement) {
    // Look for input first
    const input = counterElement.querySelector('input[type="number"], input[type="text"]');
    if (input) return input;

    // Look for elements with numeric text
    const candidates = Array.from(
      counterElement.querySelectorAll('span, div, p, [class*="count" i], [class*="value" i]')
    );

    for (const el of candidates) {
      const text = el.textContent.trim();
      if (/^\d+$/.test(text)) {
        return el;
      }
    }

    return counterElement;
  }

  /**
   * Read current count value from display element.
   * 
   * @param {HTMLElement} element
   * @returns {number}
   */
  function readCountValue(element) {
    if (!element) return 0;

    // Input element
    if (element.tagName === 'INPUT') {
      const val = parseInt(element.value, 10);
      return isNaN(val) ? 0 : val;
    }

    // Text content
    const text = element.textContent.trim();
    const match = text.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  // ─── Pattern C: Numeric Input ───────────────────────────────────────────

  /**
   * Fill counter by setting numeric input value directly.
   * 
   * @param {HTMLElement} counterElement
   * @param {number} targetCount
   * @returns {Promise<boolean>}
   */
  async function fillByNumericInput(counterElement, targetCount) {
    const { Logger, searchSetNativeValue, searchDispatchChangeEvent, searchSleep } = window.TravelID;

    Logger.info(`[TravellersPopupFill] → Using Pattern C: Numeric Input (target: ${targetCount})`);

    const input = counterElement.querySelector('input[type="number"], input[type="text"]');
    if (!input) {
      Logger.warn('[TravellersPopupFill] Numeric input not found');
      return false;
    }

    searchSetNativeValue(input, String(targetCount));
    searchDispatchChangeEvent(input);
    await searchSleep(CLICK_DELAY);

    Logger.debug('[TravellersPopupFill] Numeric input value set');
    return true;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Fill Travel Class
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fill travel class field (Economy, Premium, Business, First).
   * 
   * @param {string} targetClass - Desired travel class
   * @param {Object} fieldInfo - Field info from registry
   * @returns {Promise<boolean>}
   */
  async function fillTravelClass(targetClass, fieldInfo) {
    const { Logger } = window.TravelID;

    Logger.debug(`[TravellersPopupFill] Filling travel class: ${targetClass}`);

    const popup = findTravellersPopup();
    if (!popup) {
      Logger.warn('[TravellersPopupFill] Popup not found');
      return false;
    }

    const classElement = findTravelClassElement(popup);
    if (!classElement) {
      Logger.warn('[TravellersPopupFill] Travel class element not found');
      return false;
    }

    // Detect pattern and fill
    const pattern = detectTravelClassPattern(classElement);
    Logger.debug(`[TravellersPopupFill] Detected travel class pattern: ${pattern}`);

    switch (pattern) {
      case 'button-group':
        return await fillClassByButtonGroup(classElement, targetClass);
      case 'dropdown':
        return await fillClassByDropdown(classElement, targetClass);
      case 'radio-buttons':
        return await fillClassByRadioButtons(classElement, targetClass);
      default:
        Logger.warn(`[TravellersPopupFill] Unknown travel class pattern: ${pattern}`);
        return false;
    }
  }

  /**
   * Find travel class element in popup.
   * 
   * @param {HTMLElement} popup
   * @returns {HTMLElement|null}
   */
  function findTravelClassElement(popup) {
    const { Logger } = window.TravelID;

    // Strategy A: Find by class name
    const byClass = popup.querySelector('[class*="class" i]:not([class*="traveller" i])');
    if (byClass) {
      Logger.debug('[TravellersPopupFill] Found travel class by class name');
      return byClass;
    }

    // Strategy B: Find by text content (must contain multiple class keywords)
    const allElements = Array.from(popup.querySelectorAll('div, section, ul, [role="group"]'));
    
    for (const el of allElements) {
      const text = el.textContent.toLowerCase();
      const matchCount = CLASS_KEYWORDS.filter(kw => text.includes(kw)).length;
      
      if (matchCount >= 2) {
        Logger.debug('[TravellersPopupFill] Found travel class by text content');
        return el;
      }
    }

    Logger.debug('[TravellersPopupFill] Travel class element not found');
    return null;
  }

  /**
   * Detect which UI pattern the travel class uses.
   * 
   * @param {HTMLElement} classElement
   * @returns {'button-group'|'dropdown'|'radio-buttons'|'unknown'}
   */
  function detectTravelClassPattern(classElement) {
    const { Logger } = window.TravelID;

    // Pattern C: Radio buttons
    const radios = classElement.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      Logger.debug('[TravellersPopupFill] Travel class pattern: radio-buttons');
      return 'radio-buttons';
    }

    // Pattern B: Dropdown/select
    const select = classElement.querySelector('select');
    if (select) {
      Logger.debug('[TravellersPopupFill] Travel class pattern: dropdown');
      return 'dropdown';
    }

    // Pattern A: Button group (most common)
    const buttons = classElement.querySelectorAll('button, [role="button"], li, [class*="option" i]');
    if (buttons.length >= 2) {
      Logger.debug('[TravellersPopupFill] Travel class pattern: button-group');
      return 'button-group';
    }

    Logger.debug('[TravellersPopupFill] Travel class pattern: unknown');
    return 'unknown';
  }

  // ─── Pattern A: Button Group ───────────────────────────────────────────

  /**
   * Fill travel class by clicking a button in a button group.
   * 
   * @param {HTMLElement} classElement
   * @param {string} targetClass
   * @returns {Promise<boolean>}
   */
  async function fillClassByButtonGroup(classElement, targetClass) {
    const { Logger, searchClick, searchSleep, searchNormalizeText } = window.TravelID;

    Logger.info(`[TravellersPopupFill] → Using Pattern A: Button Group (target: ${targetClass})`);

    const buttons = Array.from(
      classElement.querySelectorAll('button, [role="button"], li, [class*="option" i]')
    );

    const target = searchNormalizeText(targetClass);

    // Phase 1: Exact match
    for (const btn of buttons) {
      const text = searchNormalizeText(btn.textContent);
      if (text === target) {
        Logger.debug(`[TravellersPopupFill] Exact match found: ${btn.textContent}`);
        searchClick(btn);
        await searchSleep(CLICK_DELAY);
        return true;
      }
    }

    // Phase 2: Starts-with match
    for (const btn of buttons) {
      const text = searchNormalizeText(btn.textContent);
      if (text.startsWith(target) || target.startsWith(text)) {
        Logger.debug(`[TravellersPopupFill] Starts-with match found: ${btn.textContent}`);
        searchClick(btn);
        await searchSleep(CLICK_DELAY);
        return true;
      }
    }

    // Phase 3: Contains match (pick shortest to avoid "Premium Economy" for "Economy")
    const matches = buttons
      .map(btn => ({
        btn,
        text: searchNormalizeText(btn.textContent),
      }))
      .filter(item => item.text.includes(target))
      .sort((a, b) => a.text.length - b.text.length);

    if (matches.length > 0) {
      Logger.debug(`[TravellersPopupFill] Contains match found: ${matches[0].btn.textContent}`);
      searchClick(matches[0].btn);
      await searchSleep(CLICK_DELAY);
      return true;
    }

    Logger.warn('[TravellersPopupFill] No matching button found');
    return false;
  }

  // ─── Pattern B: Dropdown ────────────────────────────────────────────────

  /**
   * Fill travel class by selecting from dropdown.
   * 
   * @param {HTMLElement} classElement
   * @param {string} targetClass
   * @returns {Promise<boolean>}
   */
  async function fillClassByDropdown(classElement, targetClass) {
    const { Logger, searchClick, searchSleep, searchNormalizeText } = window.TravelID;

    Logger.info(`[TravellersPopupFill] → Using Pattern B: Dropdown (target: ${targetClass})`);

    const select = classElement.querySelector('select');
    if (!select) {
      Logger.warn('[TravellersPopupFill] Select element not found');
      return false;
    }

    const target = searchNormalizeText(targetClass);
    const options = Array.from(select.querySelectorAll('option'));

    for (const option of options) {
      const text = searchNormalizeText(option.textContent);
      if (text === target || text.includes(target)) {
        Logger.debug(`[TravellersPopupFill] Selecting option: ${option.textContent}`);
        select.value = option.value;
        
        // Trigger change event
        const event = new Event('change', { bubbles: true });
        select.dispatchEvent(event);
        
        await searchSleep(CLICK_DELAY);
        return true;
      }
    }

    Logger.warn('[TravellersPopupFill] No matching option found');
    return false;
  }

  // ─── Pattern C: Radio Buttons ───────────────────────────────────────────

  /**
   * Fill travel class by clicking radio button.
   * 
   * @param {HTMLElement} classElement
   * @param {string} targetClass
   * @returns {Promise<boolean>}
   */
  async function fillClassByRadioButtons(classElement, targetClass) {
    const { Logger, searchClick, searchSleep, searchNormalizeText } = window.TravelID;

    Logger.info(`[TravellersPopupFill] → Using Pattern C: Radio Buttons (target: ${targetClass})`);

    const radios = Array.from(classElement.querySelectorAll('input[type="radio"]'));
    const target = searchNormalizeText(targetClass);

    for (const radio of radios) {
      // Check label
      const label = classElement.querySelector(`label[for="${radio.id}"]`);
      const labelText = label ? searchNormalizeText(label.textContent) : '';
      
      // Check parent text
      const parentText = radio.parentElement ? searchNormalizeText(radio.parentElement.textContent) : '';

      if (labelText.includes(target) || parentText.includes(target)) {
        Logger.debug(`[TravellersPopupFill] Clicking radio: ${labelText || parentText}`);
        searchClick(radio);
        await searchSleep(CLICK_DELAY);
        return true;
      }
    }

    Logger.warn('[TravellersPopupFill] No matching radio button found');
    return false;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Close Popup
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Close the travellers popup (click Apply/Done button or click outside).
   * 
   * @returns {Promise<void>}
   */
  async function closeTravellersPopup() {
    const { Logger, searchClick, searchSleep } = window.TravelID;

    Logger.debug('[TravellersPopupFill] Attempting to close popup');

    const popup = findTravellersPopup();
    if (!popup) {
      Logger.debug('[TravellersPopupFill] Popup already closed');
      return;
    }

    // Strategy A: Look for Apply/Done/OK button
    const applyButtons = Array.from(
      popup.querySelectorAll('button, [role="button"]')
    );

    for (const btn of applyButtons) {
      const text = btn.textContent.toLowerCase().trim();
      if (text === 'apply' || text === 'done' || text === 'ok' || text === 'confirm') {
        Logger.debug(`[TravellersPopupFill] Clicking close button: ${text}`);
        searchClick(btn);
        await searchSleep(300);
        return;
      }
    }

    // Strategy B: Click outside the popup (on overlay/backdrop)
    const overlay = document.querySelector('[class*="overlay" i], [class*="backdrop" i]');
    if (overlay) {
      Logger.debug('[TravellersPopupFill] Clicking overlay to close');
      searchClick(overlay);
      await searchSleep(300);
      return;
    }

    // Strategy C: Press Escape key
    Logger.debug('[TravellersPopupFill] Pressing Escape to close');
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
    document.dispatchEvent(escEvent);
    await searchSleep(300);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Step 5: Verify
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Verify that traveller values were applied (optional check).
   * 
   * @param {HTMLElement} triggerElement
   * @param {Object} values
   * @returns {boolean}
   */
  function verifyTravellersApplied(triggerElement, values) {
    const { Logger } = window.TravelID;

    if (!triggerElement) return false;

    // Check if trigger element text updated
    const text = triggerElement.textContent.toLowerCase();
    
    let verified = true;

    if (values.adults) {
      const adultsMatch = text.includes(String(values.adults)) && text.includes('adult');
      if (!adultsMatch) {
        Logger.debug('[TravellersPopupFill] Adults value not verified in trigger text');
        verified = false;
      }
    }

    if (values.travelClass) {
      const classMatch = text.includes(values.travelClass.toLowerCase());
      if (!classMatch) {
        Logger.debug('[TravellersPopupFill] Travel class not verified in trigger text');
        verified = false;
      }
    }

    return verified;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.fillTravellersPopup = fillTravellersPopup;
})();
