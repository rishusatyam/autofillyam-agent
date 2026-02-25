// ========================================
// Search Autofill Strategy — Location Picker
// ========================================
// Fills From / To / Destination / Pickup / Drop-off location fields.
//
// CRITICAL RULE — NEVER trigger the search button:
//   • NEVER dispatch Enter / Return key on any element
//   • NEVER click an element that looks like a search / submit / CTA button
//   • NEVER click a "suggestion" unless it actually matches the location text
//   • If no matching suggestion found → just set the value and blur quietly
//
// Strategy:
//   1. Click the field → look for an input that appears (search/typeahead)
//   2. Type the location char-by-char to trigger autocomplete suggestions
//   3. Wait for suggestion dropdown to appear
//   4. Score all suggestions — ONLY click one that actually matches
//   5. If nothing matches, set value + blur (no Enter, no click elsewhere)
// ========================================
(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────

  /** How long to wait after clicking, before looking for an input */
  const CLICK_DELAY = 500;

  /** How many chars to type before waiting for suggestions */
  const MIN_CHARS_FOR_SUGGESTIONS = 3;

  /** Extra chars to type if first batch didn't produce suggestions */
  const EXTRA_CHARS = 2;

  /** Max time to wait for suggestion dropdown after typing */
  const SUGGESTION_TIMEOUT = 3000;

  /** Polling interval when waiting for suggestions */
  const SUGGESTION_POLL = 150;

  /** Pause after selecting a suggestion to let the SPA settle */
  const SETTLE_DELAY = 400;

  /**
   * Selectors for autocomplete suggestion items.
   * Intentionally NARROWED — removed overly broad selectors like
   * li[class*="item"], div[class*="item"], div[class*="option"]
   * which were matching navigation menus, CTA buttons, etc.
   */
  const SUGGESTION_SELECTORS = [
    // ARIA patterns (most reliable)
    '[role="option"]',
    '[role="listbox"] > li',
    '[role="listbox"] > div',

    // Class-based location/city/airport suggestions
    'li[class*="suggestion" i]',
    'li[class*="result" i]',
    'li[class*="location" i]',
    'li[class*="city" i]',
    'li[class*="airport" i]',
    'li[class*="station" i]',
    'div[class*="suggestion" i]',
    'div[class*="result" i]',
    'div[class*="location" i]',
    'div[class*="city" i]',
    'div[class*="airport" i]',
    'div[class*="station" i]',

    // Suggestion containers → direct children only
    'ul[class*="suggestion" i] > li',
    'ul[class*="autocomplete" i] > li',
    'ul[class*="results" i] > li',
    'ul[class*="options" i] > li',
    'ul[class*="dropdown" i] > li',
    'ul[class*="listbox" i] > li',

    // Test-id patterns
    '[data-testid*="suggestion" i]',
    '[data-testid*="option" i]',
  ].join(',');

  /** Selectors to find the search input once the location field is clicked */
  const INPUT_SELECTORS = [
    'input[type="text"]',
    'input[type="search"]',
    'input:not([type])',
    'input[role="combobox"]',
    'input[role="searchbox"]',
    'input[aria-autocomplete]',
    '[contenteditable="true"]',
  ].join(',');

  /** Minimum score a suggestion must reach to be considered a real match */
  const MIN_SUGGESTION_SCORE = 40;

  /**
   * Reject any "suggestion" whose text matches these CTA / button words.
   * This stops us ever clicking "Search Flights", "Find", "Go", etc.
   */
  const REJECT_SUGGESTION_RE = /^\s*(search|find|submit|book|go|explore|show|get|check|look|search flights?|search hotels?|search buses?|search trains?|find flights?|book now|let'?s?\s*go|check availability|modify search)\s*$/i;

  /**
   * Tags / roles that should never be treated as a city suggestion.
   */
  const REJECT_TAG_ROLES = new Set(['BUTTON', 'A', 'FORM', 'NAV', 'HEADER', 'FOOTER']);

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fill a location picker field.
   *
   * @param {HTMLElement} el     - location field element (from scanner registry)
   * @param {string}      value  - city/airport/station name (e.g. "New Delhi")
   * @returns {Promise<boolean>}
   */
  async function fillSearchLocation(el, value) {
    const {
      Logger, searchClick, searchSleep, searchNormalizeText,
      searchTypeCharByChar, searchSetNativeValue,
      searchWaitForCondition,
    } = window.TravelID;

    const target = searchNormalizeText(value);
    if (!target) return false;

    Logger.info(`[LocationFill] Filling: "${value}"`);

    // ── Step 1: Click field to activate / open typeahead ──────────────────
    // GUARD: Only click if the element is NOT a search/submit button
    if (!_looksLikeSubmitButton(el)) {
      searchClick(el);
      await searchSleep(CLICK_DELAY);
    } else {
      Logger.warn('[LocationFill] Skipped click — element looks like a submit button');
      return false;
    }

    // Some sites need a deeper click on a combobox / textbox role inside
    // IMPORTANT: Only click combobox/textbox roles — NOT generic "button"
    const innerClickable = el.querySelector('[role="combobox"], [role="textbox"], [role="searchbox"]');
    if (innerClickable && innerClickable !== el) {
      searchClick(innerClickable);
      await searchSleep(300);
    }

    // ── Step 2: Find the text input (might be inside el, or newly opened) ─
    let input = _findInput(el);

    // Some sites open a modal/overlay with the input
    if (!input) {
      input = await searchWaitForCondition(() => {
        // Search globally for a newly focused/visible input
        const active = document.activeElement;
        if (active && active.tagName === 'INPUT' && _isLocationInput(active)) {
          return active;
        }

        // Look for recently appeared inputs
        const all = document.querySelectorAll(INPUT_SELECTORS);
        for (const inp of all) {
          const r = inp.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && _isLocationInput(inp)) {
            return inp;
          }
        }
        return null;
      }, 1500, 150);
    }

    if (!input) {
      Logger.warn('[LocationFill] No input found — trying direct value set');
      return _fallbackDirectSet(el, value);
    }

    Logger.info('[LocationFill] Input found, typing…');

    // ── Step 3: Clear existing value and type location ────────────────────
    input.focus();
    searchSetNativeValue(input, '');
    await searchSleep(100);

    // Snapshot existing suggestions BEFORE typing
    const existingSuggestions = new Set(document.querySelectorAll(SUGGESTION_SELECTORS));

    // Type enough characters to trigger autocomplete
    const charsToType = Math.min(value.length, MIN_CHARS_FOR_SUGGESTIONS);
    await searchTypeCharByChar(input, value.slice(0, charsToType), 50);
    await searchSleep(600);

    // ── Step 4: Wait for suggestions to appear ───────────────────────────
    let suggestions = await _waitForSuggestions(existingSuggestions);

    // If no suggestions yet, type more characters
    if (!suggestions || suggestions.length === 0) {
      const moreChars = value.slice(charsToType, charsToType + EXTRA_CHARS);
      if (moreChars) {
        await searchTypeCharByChar(input, moreChars, 50);
        await searchSleep(800);
        suggestions = await _waitForSuggestions(existingSuggestions);
      }
    }

    // If still no suggestions, type the full value
    if (!suggestions || suggestions.length === 0) {
      const remaining = value.slice(charsToType + EXTRA_CHARS);
      if (remaining) {
        await searchTypeCharByChar(input, remaining, 30);
        await searchSleep(800);
        suggestions = await _waitForSuggestions(existingSuggestions);
      }
    }

    // ── Step 5: Pick the best matching suggestion ────────────────────────
    // CRITICAL: Only click a suggestion if it actually matches the location.
    //           NEVER blindly click the first item — it could be a search button.
    if (suggestions && suggestions.length > 0) {
      const best = _pickBestSuggestion(suggestions, target);
      if (best) {
        Logger.info(`[LocationFill] Selecting suggestion: "${best.textContent.trim().slice(0, 60)}"`);
        searchClick(best);
        await searchSleep(SETTLE_DELAY);
        return true;
      }

      // No exact match — select the top suggestion as fallback
      Logger.info(`[LocationFill] No exact match — selecting top suggestion: "${suggestions[0].textContent.trim().slice(0, 60)}"`);
      searchClick(suggestions[0]);
      await searchSleep(SETTLE_DELAY);
      return true;
    } else {
      Logger.info('[LocationFill] No suggestions appeared');
    }

    // ── Step 6: No good suggestion — set value directly and blur ─────────
    // IMPORTANT: Do NOT press Enter — it submits the search form.
    // IMPORTANT: Do NOT click any other element — could hit the search button.
    // Just set the value and blur the input to finalize.
    searchSetNativeValue(input, value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await searchSleep(300);
    return true;
  }

  // ─── Suggestion handling ───────────────────────────────────────────────

  /**
   * Wait for suggestion elements to appear.
   * Filters out anything that looks like a button, CTA, or non-suggestion.
   *
   * @param {Set<Element>} existingBefore - suggestions that existed before typing
   * @returns {Promise<Element[]|null>}
   */
  async function _waitForSuggestions(existingBefore) {
    const { searchWaitForCondition } = window.TravelID;

    return searchWaitForCondition(() => {
      const all = Array.from(document.querySelectorAll(SUGGESTION_SELECTORS));

      // Prefer NEW suggestions that appeared after typing
      const newOnes = all.filter(el => !existingBefore.has(el));
      const candidates = newOnes.length > 0 ? newOnes : all;

      // Filter: visible + not a button/CTA + has meaningful text
      const valid = candidates.filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;

        // Reject if it's a button/link/nav element
        if (REJECT_TAG_ROLES.has(el.tagName)) return false;
        if (el.getAttribute('role') === 'button') return false;
        if (el.getAttribute('role') === 'link') return false;

        // Reject if it's a submit/search type
        if (el.type === 'submit') return false;

        // Reject if text matches CTA words
        const text = (el.textContent || '').trim();
        if (REJECT_SUGGESTION_RE.test(text)) return false;

        // Must have some text content
        if (text.length === 0 || text.length > 200) return false;

        // Reject if any ancestor is a nav/header/footer
        if (el.closest('nav, header, footer')) return false;

        return true;
      });

      return valid.length > 0 ? valid : null;
    }, SUGGESTION_TIMEOUT, SUGGESTION_POLL);
  }

  /**
   * Score and pick the best matching suggestion.
   * Returns null if no suggestion meets the minimum score threshold.
   *
   * @param {Element[]} suggestions
   * @param {string}    target - normalized location string
   * @returns {Element|null}
   */
  function _pickBestSuggestion(suggestions, target) {
    const { searchNormalizeText } = window.TravelID;

    let bestEl    = null;
    let bestScore = -1;

    for (const el of suggestions) {
      // Double-check: skip anything that looks like a button / CTA
      if (_looksLikeSubmitButton(el)) continue;

      const text = searchNormalizeText(el.textContent);
      const score = _scoreSuggestion(text, target);
      if (score > bestScore) {
        bestScore = score;
        bestEl    = el;
      }
    }

    // Only return if the score is high enough to be a real location match
    if (bestScore >= MIN_SUGGESTION_SCORE) {
      return bestEl;
    }

    return null;
  }

  /**
   * Score a suggestion against the target location.
   *
   * Scoring (higher is better):
   *  100 — exact match
   *   90 — text starts with target
   *   80 — target starts with text (e.g. "delhi" ⊂ "new delhi")
   *   70 — target is fully contained in text
   *   60 — text contains target (partial)
   *   50 — significant word overlap
   *   -1 — no match
   *
   * @param {string} text
   * @param {string} target
   * @returns {number}
   */
  function _scoreSuggestion(text, target) {
    if (!text) return -1;
    if (text === target) return 100;

    if (text.startsWith(target)) return 90;
    if (target.startsWith(text)) return 80;
    if (text.includes(target))   return 70;
    if (target.includes(text))   return 60;

    // Word overlap: check if significant words from target appear in text
    const targetWords = target.split(/\s+/).filter(w => w.length > 2);
    const textLower   = text;
    const matchedWords = targetWords.filter(w => textLower.includes(w));

    if (matchedWords.length > 0 && matchedWords.length >= targetWords.length * 0.5) {
      return 50;
    }

    return -1;
  }

  // ─── Safety checks ─────────────────────────────────────────────────────

  /**
   * Check if an element looks like a submit / search / CTA button.
   * We must NEVER click such an element during location autofill.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function _looksLikeSubmitButton(el) {
    if (!el) return false;

    // Native submit
    if (el.tagName === 'BUTTON' && el.type === 'submit') return true;
    if (el.tagName === 'INPUT'  && el.type === 'submit') return true;

    const text = (el.textContent || '').trim();
    const ariaLabel = (el.getAttribute('aria-label') || '').trim();
    const cls = (el.className || '').toString().toLowerCase();

    // Short CTA text on a button-like element
    const isButtonLike = el.tagName === 'BUTTON' || el.tagName === 'A' ||
                         el.getAttribute('role') === 'button' ||
                         el.getAttribute('role') === 'link';

    if (isButtonLike && REJECT_SUGGESTION_RE.test(text)) return true;
    if (isButtonLike && REJECT_SUGGESTION_RE.test(ariaLabel)) return true;

    // Class hints
    if (/search.?btn|submit.?btn|cta.?btn|search.?button|submit.?button|searchButton|submitButton|primaryCta|primary.?cta|search-cta|book-btn/i.test(cls)) {
      return true;
    }

    return false;
  }

  /**
   * Check if an input element is plausibly a location/city search input
   * (not a generic page search or unrelated input).
   *
   * @param {HTMLInputElement} el
   * @returns {boolean}
   */
  function _isLocationInput(el) {
    const combined = (
      (el.className || '') + ' ' +
      (el.placeholder || '') + ' ' +
      (el.getAttribute('aria-label') || '') + ' ' +
      (el.name || '') + ' ' +
      (el.id || '')
    ).toLowerCase();
    return /city|airport|station|location|from|to|where|destination|origin|depart|arrive|pickup|drop|place|autocomplete|typeahead|search/.test(combined);
  }

  // ─── Input finding ─────────────────────────────────────────────────────

  /**
   * Find the location search input inside or near the element.
   * ONLY searches inside el and one level up — not grandparent.
   *
   * @param {HTMLElement} el
   * @returns {HTMLInputElement|null}
   */
  function _findInput(el) {
    // The element itself might be an input
    if (el.tagName === 'INPUT') return el;

    // Search inside el
    let input = el.querySelector(INPUT_SELECTORS);
    if (input) return input;

    // Search in parent (for wrapper divs) — but only pick inputs
    // that look like location inputs, not random form inputs
    if (el.parentElement) {
      const parentInputs = el.parentElement.querySelectorAll(INPUT_SELECTORS);
      for (const inp of parentInputs) {
        // Prefer the one inside or closest to our element
        if (el.contains(inp)) return inp;
      }
      // Fallback: any visible input in parent
      for (const inp of parentInputs) {
        const r = inp.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return inp;
      }
    }

    // Check if any input is currently focused
    const active = document.activeElement;
    if (active && active.tagName === 'INPUT' && active.type !== 'submit') {
      return active;
    }

    return null;
  }

  // ─── Fallback ──────────────────────────────────────────────────────────

  /**
   * Last resort: set the value directly on the element or its child input.
   * NEVER dispatches Enter. NEVER clicks another element.
   *
   * @param {HTMLElement} el
   * @param {string} value
   * @returns {Promise<boolean>}
   */
  async function _fallbackDirectSet(el, value) {
    const { searchSetNativeValue, searchSleep } = window.TravelID;

    // Try any input-like element in the vicinity
    const roots = [el, el.parentElement].filter(Boolean);

    for (const root of roots) {
      const inputs = root.querySelectorAll('input, [contenteditable="true"]');
      for (const input of inputs) {
        if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') continue;
        searchSetNativeValue(input, value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        await searchSleep(200);
        return true;
      }
    }

    // If the el itself accepts text (contenteditable)
    if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    return false;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.fillSearchLocation = fillSearchLocation;
})();
