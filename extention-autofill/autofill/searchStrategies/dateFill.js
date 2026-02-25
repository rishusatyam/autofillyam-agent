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

    const targetDate = new Date(value);
    if (isNaN(targetDate.getTime())) {
      Logger.warn('[DateFill] Invalid date:', value);
      return false;
    }

    // Step 1: Native date input fast-path
    const nativeInput = el.querySelector('input[type="date"]');
    if (nativeInput) {
      searchSetNativeValue(nativeInput, value);
      searchDispatchChangeEvent(nativeInput);
      return true;
    }

    // Step 2: Click to open calendar
    searchClick(el);
    await searchSleep(WAIT_AFTER_CLICK);

    // Step 3: Navigate months + click the correct day cell
    const clicked = await _navigateAndClickDay(targetDate);
    if (clicked) return true;

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
    const { searchClick, searchSleep } = window.TravelID;
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
        const cmDate = new Date(current.year, current.month);
        const tgDate = new Date(targetYear, targetMonth);

        if (cmDate.getTime() === tgDate.getTime()) {
          // Correct month shown — try clicking by day number alone
          return _clickDayByNumber(targetDay);
        }

        // Navigate forward or backward
        const selector = tgDate > cmDate ? NEXT_MONTH_SELECTORS : PREV_MONTH_SELECTORS;
        const navBtn = document.querySelector(selector);
        if (navBtn) {
          searchClick(navBtn);
          await searchSleep(300);
          continue;
        }
      }

      // Can't detect month — try next anyway
      const nextBtn = document.querySelector(NEXT_MONTH_SELECTORS);
      if (nextBtn) {
        searchClick(nextBtn);
        await searchSleep(300);
      } else {
        break;
      }
    }

    return false;
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
    const { searchClick } = window.TravelID;
    const cells = Array.from(document.querySelectorAll(CALENDAR_DAY_SELECTORS));

    for (const cell of cells) {
      // Strategy 1: data-date attribute (most reliable)
      const dataDate = cell.getAttribute('data-date') || cell.getAttribute('data-value');
      if (dataDate) {
        const d = new Date(dataDate);
        if (!isNaN(d.getTime()) &&
            d.getFullYear() === year &&
            d.getMonth() === month &&
            d.getDate() === day) {
          searchClick(cell);
          return true;
        }
      }

      // Strategy 2: aria-label with parseable date
      const ariaLabel = cell.getAttribute('aria-label') || '';
      if (ariaLabel) {
        const d = _parseAriaDate(ariaLabel);
        if (d && d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
          searchClick(cell);
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
    const { searchClick } = window.TravelID;
    const cells = Array.from(document.querySelectorAll(CALENDAR_DAY_SELECTORS));

    for (const cell of cells) {
      const text = cell.textContent.trim();
      if (text === String(day)) {
        if (cell.getAttribute('aria-disabled') === 'true') continue;
        if ((cell.className || '').toString().toLowerCase().includes('disabled')) continue;
        searchClick(cell);
        return true;
      }
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
