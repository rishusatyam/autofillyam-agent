// ========================================
// Search Autofill Strategy — Counter Widget
// ========================================
// Fills passenger / guest / room counter widgets using +/- buttons.
//
// Works with: MakeMyTrip, Goibibo, Cleartrip, Booking.com, Expedia,
// Yatra, IRCTC, Redbus, Ixigo, Skyscanner, EaseMyTrip, etc.
//
// Strategy:
//   1. Click the counter field to open the travellers/guests panel
//   2. Find the current count value displayed
//   3. Determine how many times to press + or -
//   4. Click + or - buttons until the target count is reached
//   5. Close the panel / confirm
//
// Handles:
//   - ARIA increment/decrement buttons
//   - Custom +/- button patterns
//   - Numeric input inside the panel
//   - Stepper widgets
// ========================================
(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────

  /** Max clicks on + or - to prevent infinite loops */
  const MAX_CLICKS = 20;

  /** Delay after each +/- click */
  const CLICK_DELAY = 200;

  /** Delay after opening the counter panel */
  const OPEN_DELAY = 600;

  /** Delay after finishing counter adjustment */
  const SETTLE_DELAY = 400;

  /** Selectors for increment (+) buttons */
  const INCREMENT_SELECTORS = [
    'button[aria-label*="add" i]',
    'button[aria-label*="increase" i]',
    'button[aria-label*="increment" i]',
    'button[aria-label*="plus" i]',
    'button[aria-label*="more" i]',
    '[class*="increment" i]',
    '[class*="increase" i]',
    '[class*="plus" i]:not([class*="collapse" i])',
    '[class*="add" i]:not([class*="address" i]):not([class*="addon" i])',
    '[data-action="increase" i]',
    '[data-action="increment" i]',
    '[data-action="add" i]',
    '[data-testid*="increase" i]',
    '[data-testid*="increment" i]',
    '[data-testid*="plus" i]',
  ].join(',');

  /** Selectors for decrement (-) buttons */
  const DECREMENT_SELECTORS = [
    'button[aria-label*="subtract" i]',
    'button[aria-label*="decrease" i]',
    'button[aria-label*="decrement" i]',
    'button[aria-label*="minus" i]',
    'button[aria-label*="less" i]',
    'button[aria-label*="remove" i]',
    '[class*="decrement" i]',
    '[class*="decrease" i]',
    '[class*="minus" i]',
    '[class*="subtract" i]',
    '[class*="remove" i]:not([class*="text" i])',
    '[data-action="decrease" i]',
    '[data-action="decrement" i]',
    '[data-action="subtract" i]',
    '[data-testid*="decrease" i]',
    '[data-testid*="decrement" i]',
    '[data-testid*="minus" i]',
  ].join(',');

  /** Selectors for the count display (the current number shown) */
  const COUNT_DISPLAY_SELECTORS = [
    'input[type="number"]',
    'input[type="text"]',
    '[class*="count" i]',
    '[class*="value" i]',
    '[class*="number" i]',
    '[class*="quantity" i]',
    '[class*="amount" i]',
    '[class*="pax" i]',
    'span',
  ].join(',');

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fill a counter widget field.
   *
   * @param {HTMLElement} el     - counter field element (from scanner registry)
   * @param {string|number} value - target count (e.g. 2, "3")
   * @returns {Promise<boolean>}
   */
  async function fillSearchCounter(el, value) {
    const {
      Logger, searchClick, searchSleep,
      searchSetNativeValue, searchDispatchChangeEvent,
      searchCloseOverlay,
    } = window.TravelID;

    const targetCount = parseInt(String(value), 10);
    if (isNaN(targetCount) || targetCount < 0) {
      Logger.warn(`[CounterFill] Invalid counter value: "${value}"`);
      return false;
    }

    Logger.info(`[CounterFill] Target count: ${targetCount}`);

    // ── Step 1: Click to open counter panel ──────────────────────────────
    searchClick(el);
    await searchSleep(OPEN_DELAY);

    // Try clicking deeper (some wrappers need inner element click)
    const innerBtn = el.querySelector('[role="button"], button, [tabindex]');
    if (innerBtn && innerBtn !== el) {
      searchClick(innerBtn);
      await searchSleep(400);
    }

    // ── Step 2: Try direct numeric input ─────────────────────────────────
    const numInput = _findNumericInput(el);
    if (numInput) {
      Logger.info('[CounterFill] Found numeric input, setting directly');
      searchSetNativeValue(numInput, String(targetCount));
      searchDispatchChangeEvent(numInput);
      await searchSleep(SETTLE_DELAY);
      return true;
    }

    // ── Step 3: Find +/- buttons and current value ───────────────────────
    const context = _findCounterContext(el);

    if (!context) {
      Logger.warn('[CounterFill] Could not find +/- buttons');
      // Last resort: try setting text on the element
      return _fallbackCounter(el, targetCount);
    }

    const { incrementBtn, decrementBtn, countEl } = context;

    // Read current value
    let currentCount = _readCount(countEl);
    Logger.info(`[CounterFill] Current: ${currentCount}, Target: ${targetCount}`);

    // ── Step 4: Click +/- to reach target ────────────────────────────────
    let clicks = 0;

    if (targetCount > currentCount) {
      // Need to increment
      while (currentCount < targetCount && clicks < MAX_CLICKS) {
        searchClick(incrementBtn);
        clicks++;
        await searchSleep(CLICK_DELAY);

        // Re-read the count
        const newCount = _readCount(countEl);
        if (newCount === currentCount) {
          // Button didn't work — might be at max or wrong button
          Logger.warn(`[CounterFill] Increment stuck at ${currentCount}`);
          break;
        }
        currentCount = newCount;
      }
    } else if (targetCount < currentCount) {
      // Need to decrement
      while (currentCount > targetCount && clicks < MAX_CLICKS) {
        searchClick(decrementBtn);
        clicks++;
        await searchSleep(CLICK_DELAY);

        const newCount = _readCount(countEl);
        if (newCount === currentCount) {
          Logger.warn(`[CounterFill] Decrement stuck at ${currentCount}`);
          break;
        }
        currentCount = newCount;
      }
    }
    // If equal, nothing to do

    Logger.info(`[CounterFill] After ${clicks} clicks: count = ${currentCount}`);
    await searchSleep(SETTLE_DELAY);

    return currentCount === targetCount;
  }

  // ─── Context finding ───────────────────────────────────────────────────

  /**
   * Find the +/- buttons and count display near the element.
   * Searches upward through parents to find the counter widget scope.
   *
   * @param {HTMLElement} el
   * @returns {{ incrementBtn: Element, decrementBtn: Element, countEl: Element }|null}
   */
  function _findCounterContext(el) {
    // Search progressively wider scopes
    const roots = [el];
    let p = el.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      roots.push(p);
      p = p.parentElement;
    }

    // Also search globally for recently opened panels/modals
    const panels = document.querySelectorAll(
      '[class*="passenger" i], [class*="traveller" i], [class*="guest" i], ' +
      '[class*="pax" i], [class*="counter" i], [class*="stepper" i], ' +
      '[class*="room" i], [role="dialog"]'
    );
    for (const panel of panels) {
      const r = panel.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        roots.push(panel);
      }
    }

    for (const root of roots) {
      // Strategy A: Named selectors
      let incBtn = _findVisibleElement(root, INCREMENT_SELECTORS);
      let decBtn = _findVisibleElement(root, DECREMENT_SELECTORS);

      if (incBtn && decBtn) {
        const countEl = _findCountDisplay(root, incBtn, decBtn);
        return { incrementBtn: incBtn, decrementBtn: decBtn, countEl };
      }

      // Strategy B: +/- text buttons
      const textBtns = _findPlusMinusTextButtons(root);
      if (textBtns) {
        const countEl = _findCountDisplay(root, textBtns.plus, textBtns.minus);
        return { incrementBtn: textBtns.plus, decrementBtn: textBtns.minus, countEl };
      }

      // Strategy C: SVG icon buttons (common on modern sites)
      const svgBtns = _findSvgButtons(root);
      if (svgBtns) {
        const countEl = _findCountDisplay(root, svgBtns.plus, svgBtns.minus);
        return { incrementBtn: svgBtns.plus, decrementBtn: svgBtns.minus, countEl };
      }
    }

    return null;
  }

  /**
   * Find buttons with "+" and "-" text content.
   *
   * @param {Element} root
   * @returns {{ plus: Element, minus: Element }|null}
   */
  function _findPlusMinusTextButtons(root) {
    const btns = Array.from(
      root.querySelectorAll('button, [role="button"], span, div')
    ).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.width < 60 && r.height < 60;
    });

    let plus = null, minus = null;

    for (const btn of btns) {
      const text = btn.textContent.trim();
      if (text === '+' || text === 'add' || text === '＋') {
        if (!plus) plus = btn;
      }
      if (text === '-' || text === '−' || text === 'remove' || text === '﹣' || text === '–') {
        if (!minus) minus = btn;
      }
    }

    return (plus && minus) ? { plus, minus } : null;
  }

  /**
   * Find +/- buttons that use SVG icons (the buttons themselves still
   * have a small bounding box and are adjacent).
   *
   * @param {Element} root
   * @returns {{ plus: Element, minus: Element }|null}
   */
  function _findSvgButtons(root) {
    const btns = Array.from(
      root.querySelectorAll('button, [role="button"]')
    ).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.width < 60;
    });

    // Check consecutive pairs for +/- pattern
    for (let i = 0; i < btns.length - 1; i++) {
      const a = btns[i];
      const b = btns[i + 1];

      const aLabel = _getButtonIntent(a);
      const bLabel = _getButtonIntent(b);

      if (aLabel === 'minus' && bLabel === 'plus') {
        return { minus: a, plus: b };
      }
      if (aLabel === 'plus' && bLabel === 'minus') {
        return { plus: a, minus: b };
      }
    }

    return null;
  }

  /**
   * Determine if a button is a plus or minus button.
   *
   * @param {Element} btn
   * @returns {'plus'|'minus'|null}
   */
  function _getButtonIntent(btn) {
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    const cls  = (btn.className || '').toLowerCase();
    const text = btn.textContent.trim().toLowerCase();
    const title = (btn.getAttribute('title') || '').toLowerCase();

    const combined = `${aria} ${cls} ${text} ${title}`;

    if (/increase|increment|add|plus|\+|more/.test(combined)) return 'plus';
    if (/decrease|decrement|subtract|minus|remove|\-|−|less/.test(combined)) return 'minus';

    // Check SVG path hints
    const svg = btn.querySelector('svg');
    if (svg) {
      const paths = svg.querySelectorAll('path, line');
      // Plus icon typically has 2 lines (cross), minus has 1 line
      if (paths.length >= 2) return 'plus';
      if (paths.length === 1) return 'minus';
    }

    return null;
  }

  /**
   * Find the count display element between the +/- buttons.
   *
   * @param {Element} root
   * @param {Element} incBtn
   * @param {Element} decBtn
   * @returns {Element}
   */
  function _findCountDisplay(root, incBtn, decBtn) {
    // Strategy A: Look for an element between the two buttons in DOM order
    const allChildren = Array.from(
      (incBtn.parentElement || root).querySelectorAll(COUNT_DISPLAY_SELECTORS)
    );

    for (const el of allChildren) {
      const text = el.textContent.trim();
      // Must be a number or empty (will default to 0)
      if (/^\d+$/.test(text)) {
        // Check it's visually between the buttons
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          // Check it's not one of the buttons
          if (el !== incBtn && el !== decBtn &&
              !incBtn.contains(el) && !decBtn.contains(el)) {
            return el;
          }
        }
      }
    }

    // Strategy B: Common sibling search
    const parent = incBtn.parentElement || root;
    const siblings = Array.from(parent.children);
    for (const sib of siblings) {
      if (sib === incBtn || sib === decBtn) continue;
      if (sib.contains(incBtn) || sib.contains(decBtn)) continue;
      const text = sib.textContent.trim();
      if (/^\d+$/.test(text)) return sib;
    }

    // Strategy C: Input element
    const input = parent.querySelector('input[type="number"], input[type="text"]');
    if (input) return input;

    // Fallback: return the parent itself (readCount will try textContent)
    return parent;
  }

  // ─── Value reading ─────────────────────────────────────────────────────

  /**
   * Read the current count from a display element.
   *
   * @param {Element} el
   * @returns {number}
   */
  function _readCount(el) {
    if (!el) return 0;

    // Input element
    if (el.tagName === 'INPUT') {
      const val = parseInt(el.value, 10);
      return isNaN(val) ? 0 : val;
    }

    // Text content — find the first number
    const text = el.textContent.trim();
    const match = text.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Find a visible element matching a selector.
   *
   * @param {Element} root
   * @param {string} selector
   * @returns {Element|null}
   */
  function _findVisibleElement(root, selector) {
    const candidates = root.querySelectorAll(selector);
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
    return null;
  }

  /**
   * Find a numeric input inside the element or nearby.
   *
   * @param {HTMLElement} el
   * @returns {HTMLInputElement|null}
   */
  function _findNumericInput(el) {
    const roots = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean);

    // Also check open panels/modals
    const panels = document.querySelectorAll(
      '[class*="passenger" i], [class*="traveller" i], [class*="guest" i], ' +
      '[class*="counter" i], [class*="stepper" i], [role="dialog"]'
    );
    for (const panel of panels) {
      const r = panel.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) roots.push(panel);
    }

    for (const root of roots) {
      const input = root.querySelector('input[type="number"]');
      if (input) {
        const r = input.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return input;
      }
    }

    return null;
  }

  /**
   * Fallback: try to fill counter by setting text/attributes.
   *
   * @param {HTMLElement} el
   * @param {number} targetCount
   * @returns {Promise<boolean>}
   */
  async function _fallbackCounter(el, targetCount) {
    const { searchSetNativeValue, searchDispatchChangeEvent, searchSleep, Logger } = window.TravelID;

    // Find any input in the vicinity
    const roots = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean);

    for (const root of roots) {
      const inputs = root.querySelectorAll('input');
      for (const input of inputs) {
        if (input.type === 'hidden' || input.type === 'submit') continue;
        searchSetNativeValue(input, String(targetCount));
        searchDispatchChangeEvent(input);
        await searchSleep(200);
        Logger.info('[CounterFill] Used fallback input fill');
        return true;
      }
    }

    Logger.warn('[CounterFill] Fallback failed — no input found');
    return false;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.fillSearchCounter = fillSearchCounter;
})();
