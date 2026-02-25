// ========================================
// Utility — Mode Detector
// ========================================
// Determines whether the current scan represents a search page
// (flight/hotel/train search widget) or a traveller form page
// (first name, email, passport, etc.).
//
// Two detection strategies:
//
//   detectModeFromPage()  — pre-scan, uses URL + page title + DOM structure.
//                           Called BEFORE running any scanner so the right
//                           scanner is chosen from the start.
//
//   detectMode(fields)    — post-scan fallback, scores field labels/placeholders.
//                           Used only if detectModeFromPage() is inconclusive.
// ========================================
(function () {
  'use strict';

  // ─── URL / Title Signals ──────────────────────────────────────────────

  // Travel-vertical keywords — very strong search signal when found in URL/title
  const SEARCH_URL_SIGNALS = [
    'flight', 'flights', 'hotel', 'hotels', 'train', 'trains',
    'bus', 'buses', 'cab', 'cabs', 'holiday', 'holidays',
  ];

  // Traveller-form keywords — strong form signal when found in URL/title
  const FORM_URL_SIGNALS = [
    'traveller', 'passenger', 'checkout', 'payment', 'review',
    'personal', 'contact', 'confirm', 'itinerary',
  ];

  // ─── DOM-based Search Widget Clues ────────────────────────────────────

  /**
   * Count search-widget-specific DOM patterns.
   * These appear on travel search pages but NOT on traveller form pages.
   */
  function _countSearchWidgetClues() {
    let clues = 0;

    // 1. Calendar / date-picker widgets
    if (document.querySelector(
      '[class*="calendar" i], [class*="datepick" i], [class*="date-pick" i], ' +
      '[class*="DayPicker" i], [data-testid*="date" i], input[type="date"]'
    )) clues++;

    // 2. Swap / exchange button (From ↔ To)
    if (document.querySelector(
      '[class*="swap" i], [class*="exchange" i], [class*="reverse" i], ' +
      '[data-testid*="swap" i]'
    )) clues++;

    // 3. Prominent "SEARCH" button
    const buttons = document.querySelectorAll('button, input[type="submit"], a[role="button"]');
    for (const btn of buttons) {
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (txt === 'search' || txt === 'search flights' || txt === 'search buses' ||
          txt === 'search hotels' || txt === 'search trains') {
        clues++;
        break;
      }
    }

    // 4. From / To location-picker widgets (div-based, not native inputs)
    const customPickers = document.querySelectorAll(
      '[class*="location" i], [class*="autocomplete" i], [class*="fromTo" i], ' +
      '[class*="origin" i], [class*="destination" i], [data-testid*="from" i], ' +
      '[data-testid*="to" i]'
    );
    if (customPickers.length >= 2) clues++;

    return clues;
  }

  // ─── DOM-based Form Clues ─────────────────────────────────────────────

  /**
   * Count form-specific DOM patterns.
   * These appear on traveller/checkout pages but NOT on search pages.
   */
  function _countFormClues() {
    let clues = 0;

    // Form-specific input types (email, tel) — search pages almost never have these
    const emailTel = document.querySelectorAll('input[type="email"], input[type="tel"]');
    if (emailTel.length >= 1) clues++;

    // Autocomplete attributes that indicate personal-data form
    const personalInputs = document.querySelectorAll(
      'input[autocomplete="given-name"], input[autocomplete="family-name"], ' +
      'input[autocomplete="email"], input[autocomplete="tel"]'
    );
    if (personalInputs.length >= 1) clues++;

    // Name-bearing inputs inside a <form> element
    const formInputs = document.querySelectorAll(
      'form input[name*="name" i], form input[name*="email" i], ' +
      'form input[name*="phone" i], form input[name*="passport" i]'
    );
    if (formInputs.length >= 2) clues++;

    return clues;
  }

  // ─── Pre-scan Detection ───────────────────────────────────────────────

  /**
   * Pre-scan mode detection: does NOT require any scanned fields.
   * Checks URL path, page title, and page-level DOM clues.
   *
   * Returns "search" | "form" | "unknown".
   *
   * @returns {"search" | "form" | "unknown"}
   */
  function detectModeFromPage() {
    const { Logger } = window.TravelID;

    const url   = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const combined = `${url} ${title}`;

    let searchScore = 0;
    let formScore   = 0;

    // ── URL / title keyword scoring ─────────────────────────────────────
    for (const signal of SEARCH_URL_SIGNALS) {
      if (combined.includes(signal)) searchScore++;
    }
    for (const signal of FORM_URL_SIGNALS) {
      if (combined.includes(signal)) formScore++;
    }

    Logger.info(
      `[ModeDetector] URL/title: searchScore=${searchScore} formScore=${formScore}`
    );

    // ── Decisive URL-based detection ────────────────────────────────────
    // When only one side has URL/title signals, trust it immediately.
    if (searchScore > 0 && formScore === 0) return 'search';
    if (formScore > 0 && searchScore === 0) return 'form';

    // Both sides have URL signals (e.g. "makemytrip.com/flights/checkout")
    // → form keywords are more specific, so form wins ties.
    if (formScore > 0 && searchScore > 0) {
      const mode = formScore >= searchScore ? 'form' : 'search';
      Logger.info(`[ModeDetector] mixed URL signals → "${mode}"`);
      return mode;
    }

    // ── No URL signals — fall back to DOM heuristics ────────────────────
    const searchClues = _countSearchWidgetClues();
    const formClues   = _countFormClues();

    Logger.info(
      `[ModeDetector] DOM clues: search=${searchClues} form=${formClues}`
    );

    if (searchClues > formClues) return 'search';
    if (formClues > searchClues) return 'form';

    return 'unknown';
  }

  /** Keywords that indicate a search widget */
  const SEARCH_SIGNALS = [
    'from', 'to', 'destination', 'departure', 'arrival',
    'check-in', 'check-out', 'checkin', 'checkout',
    'passengers', 'guests', 'travellers', 'rooms',
    'origin', 'return', 'depart', 'return date', 'travel date',
    'pickup', 'drop', 'source', 'station', 'bus stop',
  ];

  /** Keywords that indicate a traveller detail form */
  const FORM_SIGNALS = [
    'first name', 'last name', 'surname', 'given name',
    'email', 'phone', 'mobile', 'contact',
    'passport', 'nationality', 'gender', 'date of birth',
    'dob', 'country code', 'title', 'middle name',
  ];

  /**
   * Score a list of signals against all field text (label + placeholder).
   *
   * @param {string[]} signals
   * @param {string[]} fieldTexts  - pre-lowercased label/placeholder strings
   * @returns {number}
   */
  function _score(signals, fieldTexts) {
    let score = 0;
    for (const text of fieldTexts) {
      for (const signal of signals) {
        if (text.includes(signal)) {
          score++;
          break; // count each field once per signal check
        }
      }
    }
    return score;
  }

  /**
   * Detect whether the scanned fields represent a "search" or "form" page.
   *
   * @param {Array<{ label?: string|null, placeholder?: string|null }>} fields
   * @returns {"search" | "form"}
   */
  function detectMode(fields) {
    const { Logger } = window.TravelID;

    // Build a list of lowercased text tokens from each field
    const fieldTexts = fields.map(f => {
      const label       = (f.label       ?? '').toLowerCase().trim();
      const placeholder = (f.placeholder ?? '').toLowerCase().trim();
      return `${label} ${placeholder}`;
    });

    const searchScore = _score(SEARCH_SIGNALS, fieldTexts);
    const formScore   = _score(FORM_SIGNALS,   fieldTexts);

    const mode = searchScore >= formScore ? 'search' : 'form';

    Logger.info(
      `[ModeDetector] search=${searchScore} form=${formScore} → mode="${mode}"`
    );

    return mode;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.detectMode         = detectMode;
  window.TravelID.detectModeFromPage = detectModeFromPage;
})();
