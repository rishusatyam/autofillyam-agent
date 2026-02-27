// ========================================
// Search Autofill Strategy — Date Picker
// ========================================
// Fills date pickers in search widgets.
//
// Fixes:
//   - Calendar MONTH NAVIGATION — clicks Next/Prev to reach target month
//   - Better day-cell matching using data-date + aria-label + month context
//   - Multiple date format support for text input fallback
//   - Native <input type="date"> fast-path
// ========================================
(function () {
  'use strict';

  /** Text input selectors inside a date picker */
  const INPUT_INSIDE_PICKER = [
    'input[type="date"]',
    'input[type="text"]',
    'input[type="search"]',
    'input:not([type="hidden"])',
  ].join(',');

  /** Selectors for calendar day cells */
  const CALENDAR_DAY_SELECTORS = [
    '[data-date]',
    '[data-value]',
    'td[aria-label]',
    'div[aria-label][role="button"]',
    'button[aria-label]',
    '[class*="DayPicker-Day" i]',
    'td[class*="day" i]:not([class*="disabled" i])',
    'div[class*="day" i]:not([class*="disabled" i])',
    'button[class*="day" i]:not([class*="disabled" i])',
  ].join(',');

  /** Selectors for calendar next-month buttons */
  const NEXT_MONTH_SELECTORS = [
    'button[aria-label*="next" i]',
    'button[aria-label*="forward" i]',
    '[class*="next" i]:not([class*="disabled" i])',
    '[class*="forward" i]',
    '[class*="right-arrow" i]',
    '[class*="rightArrow" i]',
    'button[class*="arrow-right" i]',
  ].join(',');

  /** Selectors for calendar prev-month buttons */
  const PREV_MONTH_SELECTORS = [
    'button[aria-label*="prev" i]',
    'button[aria-label*="back" i]',
    '[class*="prev" i]:not([class*="disabled" i])',
    '[class*="back" i]',
    '[class*="left-arrow" i]',
    '[class*="leftArrow" i]',
    'button[class*="arrow-left" i]',
  ].join(',');

  /** Maximum month navigations before giving up */
  const MAX_MONTH_NAVIGATIONS = 12;

  const WAIT_AFTER_CLICK = 400;

  const MONTH_NAMES = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const SHORT_MONTHS = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ];

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Click a calendar day cell with full event sequence for React compatibility.
   * Uses multiple strategies: direct click, focus+Enter, and event simulation.
   *
   * @param {Element} cell
   */
  function _clickCalendarDay(cell) {
    if (!cell) return;
    
    const { Logger } = window.TravelID;
    
    cell.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    
    const rect = cell.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Strategy 1: Try native click first (most reliable if it works)
    try {
      cell.click();
      Logger.info(`[DateFill] Native click dispatched`);
    } catch (e) {
      Logger.warn(`[DateFill] Native click failed: ${e.message}`);
    }

    // Strategy 2: Focus + Enter key (works for keyboard-accessible calendars)
    try {
      if (cell.tabIndex === -1) cell.tabIndex = 0; // Make focusable
      cell.focus();
      
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      cell.dispatchEvent(enterEvent);
      
      const spaceEvent = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        keyCode: 32,
        which: 32,
        bubbles: true,
        cancelable: true
      });
      cell.dispatchEvent(spaceEvent);
      
      Logger.info(`[DateFill] Focus + keyboard events dispatched`);
    } catch (e) {
      Logger.warn(`[DateFill] Focus/keyboard strategy failed: ${e.message}`);
    }

    // Strategy 3: Full event sequence with coordinates
    const shared = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window };

    try {
      // Pointer events
      cell.dispatchEvent(new PointerEvent('pointerdown', { ...shared, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
      cell.dispatchEvent(new PointerEvent('pointerup',   { ...shared, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
      
      // Mouse events
      cell.dispatchEvent(new MouseEvent('mousedown', shared));
      cell.dispatchEvent(new MouseEvent('mouseup',   shared));
      cell.dispatchEvent(new MouseEvent('click',     { ...shared, detail: 1 }));
      
      Logger.info(`[DateFill] Full event sequence dispatched at (${cx.toFixed(0)}, ${cy.toFixed(0)})`);
    } catch (e) {
      Logger.warn(`[DateFill] Event sequence failed: ${e.message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fill a date picker.
   *
   * @param {HTMLElement} el    - date picker container
   * @param {string}      value - YYYY-MM-DD
   * @returns {Promise<boolean>}
   */
  async function fillSearchDate(el, value) {
    const {
      Logger, searchClick, searchSetNativeValue, searchSleep,
      searchWaitForElement, searchDispatchChangeEvent,
    } = window.TravelID;

    Logger.info(`[DateFill] Starting date fill for: ${value}`);

    const targetDate = new Date(value);
    if (isNaN(targetDate.getTime())) {
      Logger.warn('[DateFill] Invalid date:', value);
      return false;
    }

    // Step 1: Native date input fast-path
    const nativeInput = el.querySelector('input[type="date"]');
    if (nativeInput) {
      Logger.info('[DateFill] Using native date input');
      searchSetNativeValue(nativeInput, value);
      searchDispatchChangeEvent(nativeInput);
      return true;
    }

    // Step 2: Click to open calendar and wait for cells to appear
    Logger.info('[DateFill] Clicking field to open calendar');
    searchClick(el);
    await searchSleep(WAIT_AFTER_CLICK);

    // Wait for calendar cells to appear (retry if needed)
    let existingCells = document.querySelectorAll(CALENDAR_DAY_SELECTORS);
    for (let retry = 0; retry < 3 && existingCells.length === 0; retry++) {
      Logger.info(`[DateFill] No cells yet (attempt ${retry + 1}/3), retrying click…`);
      searchClick(el);
      await searchSleep(600);
      existingCells = document.querySelectorAll(CALENDAR_DAY_SELECTORS);
    }
    if (existingCells.length === 0) {
      Logger.warn('[DateFill] Calendar did not open after retries');
      return false;
    }
    Logger.info(`[DateFill] Calendar ready with ${existingCells.length} cells`);

    // Step 3: Navigate months + click the correct day cell
    const clicked = await _navigateAndClickDay(targetDate);
    if (clicked) {
      Logger.info('[DateFill] Day cell clicked, waiting for UI update...');
      await searchSleep(500);
      
      // Verify the date was actually selected by checking for aria-selected or selected class
      const targetDay = targetDate.getDate();
      const selectedCells = document.querySelectorAll(
        '[aria-selected="true"], [class*="selected" i]:not([class*="disabled" i])'
      );
      
      let verified = false;
      for (const cell of selectedCells) {
        const text = (cell.textContent || '').trim();
        const dayMatch = text.match(/^(\d{1,2})\b/);
        if (dayMatch && dayMatch[1] === String(targetDay)) {
          verified = true;
          Logger.info(`[DateFill] ✓ Verified: Day ${targetDay} is now selected`);
          break;
        }
      }
      
      if (!verified) {
        Logger.warn(`[DateFill] ⚠ Click succeeded but day ${targetDay} not showing as selected. Calendar might need different interaction.`);
      }
      
      return true;
    }

    Logger.warn('[DateFill] ✗ Failed to click date cell in calendar');

    // Step 4: Text input fallback
    const input = await searchWaitForElement(
      INPUT_INSIDE_PICKER,
      document.body,
      1500
    );
    if (input) {
      const formatted = _formatDateForSite(value);
      searchSetNativeValue(input, formatted);
      await searchSleep(200);
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })
      );
      return true;
    }

    return false;
  }

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Navigate the calendar to the target month and click the day cell.
   *
   * @param {Date} targetDate
   * @returns {Promise<boolean>}
   */
  async function _navigateAndClickDay(targetDate) {
    const { searchClick, searchSleep, Logger } = window.TravelID;
    const targetDay   = targetDate.getDate();
    const targetMonth = targetDate.getMonth();
    const targetYear  = targetDate.getFullYear();

    for (let nav = 0; nav < MAX_MONTH_NAVIGATIONS; nav++) {
      // Try to click by exact data-date / aria-label
      const clicked = _tryClickDayCell(targetDay, targetMonth, targetYear);
      if (clicked) return true;

      // Detect what month the calendar is currently showing
      const current = _detectCalendarMonth();
      if (current !== null) {
        Logger.info(`[DateFill] Calendar showing: ${MONTH_NAMES[current.month]} ${current.year}`);
        const cmDate = new Date(current.year, current.month);
        const tgDate = new Date(targetYear, targetMonth);

        if (cmDate.getTime() === tgDate.getTime()) {
          // Correct month shown — try clicking by day number
          Logger.info(`[DateFill] Correct month visible, trying day number match for day ${targetDay}`);
          return _clickDayByNumber(targetDay);
        }

        // Navigate forward or backward
        const selector = tgDate > cmDate ? NEXT_MONTH_SELECTORS : PREV_MONTH_SELECTORS;
        const navBtn = document.querySelector(selector);
        if (navBtn) {
          Logger.info(`[DateFill] Navigating ${tgDate > cmDate ? 'forward' : 'backward'}`);
          searchClick(navBtn);
          await searchSleep(300);
          continue;
        }
      } else {
        Logger.info('[DateFill] Could not detect calendar month, trying day number match');
      }

      // Month detection failed — still try clicking by day number as fallback
      const clickedByNum = _clickDayByNumber(targetDay);
      if (clickedByNum) return true;

      // Can't detect month, can't find day — try next month
      const nextBtn = document.querySelector(NEXT_MONTH_SELECTORS);
      if (nextBtn) {
        searchClick(nextBtn);
        await searchSleep(300);
      } else {
        break;
      }
    }

    // Last resort after loop exhaustion
    Logger.info('[DateFill] Last resort: trying day number match');
    return _clickDayByNumber(targetDay);
  }

  /**
   * Try to click a day cell matching the exact date via data-date/aria-label.
   *
   * @param {number} day
   * @param {number} month - 0-indexed
   * @param {number} year
   * @returns {boolean}
   */
  function _tryClickDayCell(day, month, year) {
    const { Logger } = window.TravelID;
    const cells = Array.from(document.querySelectorAll(CALENDAR_DAY_SELECTORS));
    Logger.info(`[DateFill] Searching ${cells.length} cells for day ${day}/${month+1}/${year} via data attributes`);

    for (const cell of cells) {
      if (_isDisabledCell(cell)) continue;

      // Strategy 1: data-date attribute (most reliable)
      const dataDate = cell.getAttribute('data-date') || cell.getAttribute('data-value');
      if (dataDate) {
        const d = new Date(dataDate);
        if (!isNaN(d.getTime()) &&
            d.getFullYear() === year &&
            d.getMonth() === month &&
            d.getDate() === day) {
          Logger.info(`[DateFill] ✓ Found exact match via data-date: ${dataDate} (${cell.tagName}.${(cell.className || '').toString().slice(0, 40)})`);
          _clickCalendarDay(cell);
          return true;
        }
      }

      // Strategy 2: aria-label with parseable date
      const ariaLabel = cell.getAttribute('aria-label') || '';
      if (ariaLabel) {
        const d = _parseAriaDate(ariaLabel);
        if (d && d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
          Logger.info(`[DateFill] ✓ Found exact match via aria-label: ${ariaLabel} (${cell.tagName}.${(cell.className || '').toString().slice(0, 40)})`);
          _clickCalendarDay(cell);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Fallback: click a day cell by day number alone.
   * Only used when we've confirmed the correct month is displayed.
   *
   * @param {number} day
   * @returns {boolean}
   */
  function _clickDayByNumber(day) {
    const { Logger } = window.TravelID;
    const cells = Array.from(document.querySelectorAll(CALENDAR_DAY_SELECTORS));
    Logger.info(`[DateFill] Trying text match for day ${day} across ${cells.length} cells`);

    for (const cell of cells) {
      if (_isDisabledCell(cell)) continue;

      // Skip elements that are too large to be day cells (date range displays, banners)
      const rect = cell.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.width > 120 || rect.height > 100) continue;

      // MMT cells often contain: "17\n4294" (day + fare). Match the leading day.
      const raw = (cell.textContent || '').replace(/\s+/g, ' ').trim();
      const m = raw.match(/^(\d{1,2})\b/);
      const dayNum = m ? m[1] : '';

      if (dayNum === String(day)) {
        Logger.info(`[DateFill] ✓ Found day ${day} via text match (${rect.width.toFixed(0)}x${rect.height.toFixed(0)}px): "${raw.slice(0, 20)}" (${cell.tagName}.${(cell.className || '').toString().slice(0, 40)})`);
        _clickCalendarDay(cell);
        return true;
      }
    }

    Logger.warn(`[DateFill] ✗ Day ${day} not found by text match`);
    return false;
  }

  function _isDisabledCell(cell) {
    try {
      if (cell.getAttribute('aria-disabled') === 'true') return true;

      const cls = (cell.className || '').toString().toLowerCase();
      if (cls.includes('disabled') || cls.includes('inactive') || cls.includes('blocked') || cls.includes('outside')) {
        return true;
      }

      // If the cell is in a hidden subtree, ignore it
      if (cell.closest('[aria-hidden="true"]')) return true;
    } catch (_) {
      // ignore
    }
    return false;
  }

  /**
   * Detect what month/year the calendar is currently showing.
   * Looks for month + year text in calendar headers.
   *
   * @returns {{ month: number, year: number }|null}
   */
  function _detectCalendarMonth() {
    const headers = document.querySelectorAll(
      '[class*="month" i], [class*="header" i], [class*="title" i], [class*="caption" i]'
    );

    for (const header of headers) {
      const text = header.textContent.trim().toLowerCase();

      // Real month headers are short (e.g., "March 2026"), skip long page elements
      if (text.length > 50) continue;

      const yearMatch = text.match(/\b(20\d{2})\b/);
      if (!yearMatch) continue;

      const year = parseInt(yearMatch[1], 10);
      for (let i = 0; i < MONTH_NAMES.length; i++) {
        if (text.includes(MONTH_NAMES[i]) || text.includes(SHORT_MONTHS[i])) {
          return { month: i, year };
        }
      }
    }

    return null;
  }

  /**
   * Parse a date from an aria-label string.
   *
   * @param {string} text
   * @returns {Date|null}
   */
  function _parseAriaDate(text) {
    const d = new Date(text);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;

    // Try DD/MM/YYYY or DD-MM-YYYY
    const parts = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      const parsed = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
      if (!isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }

  /**
   * Format YYYY-MM-DD for text input fallback.
   * Uses "DD MMM YYYY" which is widely accepted by Indian travel sites.
   *
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {string}
   */
  function _formatDateForSite(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const day   = String(d.getDate()).padStart(2, '0');
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    const year  = d.getFullYear();

    return `${day} ${month} ${year}`;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.fillSearchDate = fillSearchDate;
})();
