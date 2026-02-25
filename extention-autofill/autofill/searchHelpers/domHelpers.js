// ========================================
// Search Autofill — DOM Helpers
// ========================================
// Shared DOM manipulation utilities for all search autofill strategies.
//
// Exports on window.TravelID:
//   searchClick, searchSetNativeValue, searchDispatchChangeEvent,
//   searchCloseOverlay, searchNormalizeText, searchTypeCharByChar
// ========================================
(function () {
  'use strict';

  // ─── Form Submission Prevention ──────────────────────────────────────
  // During autofill we MUST block any accidental form submissions
  // (Enter key, click on submit button, etc.). These two functions
  // install / remove a capture-phase listener on the document that
  // intercepts submit events before they trigger navigation.

  /** @type {((e: Event) => void)|null} */
  let _submitBlocker = null;

  /** Keywords in button text / attributes that indicate a submit / search action */
  const SUBMIT_BUTTON_RE = /\b(search|submit|find|book|go|explore|show|get|check|look)\b/i;

  /**
   * Start blocking form submissions on the page.
   * Safe to call multiple times — only one blocker is installed.
   */
  function searchBlockFormSubmit() {
    if (_submitBlocker) return;
    _submitBlocker = function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener('submit', _submitBlocker, true);

    // Also block click on <a> / buttons with type=submit inside forms
    document.addEventListener('click', _onClickGuard, true);
  }

  /**
   * Stop blocking form submissions.
   */
  function searchUnblockFormSubmit() {
    if (_submitBlocker) {
      document.removeEventListener('submit', _submitBlocker, true);
      _submitBlocker = null;
    }
    document.removeEventListener('click', _onClickGuard, true);
  }

  /**
   * Capture-phase click guard: prevent clicks on submit / search buttons
   * from propagating during autofill.
   * @param {MouseEvent} e
   */
  function _onClickGuard(e) {
    const target = e.target?.closest?.(
      'button[type="submit"], input[type="submit"], ' +
      'a[class*="search" i], button[class*="search" i], ' +
      'button[class*="submit" i], [class*="searchBtn" i], ' +
      '[class*="search-btn" i], [class*="cta" i], ' +
      '[class*="searchButton" i], [class*="submit-btn" i], ' +
      '[class*="primaryBtn" i], [class*="primary-btn" i], ' +
      '[data-testid*="search-btn" i], [data-testid*="submit" i], ' +
      '[data-testid*="searchButton" i]'
    );
    if (target) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  /**
   * Check if an element looks like a search/submit button.
   * Used by searchClick to avoid accidentally triggering searches.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function _isSubmitButton(el) {
    if (!el) return false;

    // Native submit buttons
    if (el.tagName === 'BUTTON' && el.type === 'submit') return true;
    if (el.tagName === 'INPUT'  && el.type === 'submit') return true;

    // Check text + attributes for search / submit keywords
    const text = (el.textContent || '').trim();
    const ariaLabel = el.getAttribute('aria-label') || '';
    const cls = (el.className || '').toString().toLowerCase();
    const title = el.getAttribute('title') || '';
    const testId = (el.getAttribute('data-testid') || '').toLowerCase();

    const isButton = el.tagName === 'BUTTON' ||
                     el.tagName === 'A' ||
                     el.getAttribute('role') === 'button' ||
                     el.getAttribute('role') === 'link';

    // Very short text that exactly matches a CTA word
    if (text.length < 30 && SUBMIT_BUTTON_RE.test(text) && isButton) {
      return true;
    }

    // Aria-label hint on button-like elements
    if (isButton && SUBMIT_BUTTON_RE.test(ariaLabel)) return true;

    // Class-based detection (broad patterns)
    if (/search.?btn|submit.?btn|cta.?btn|search.?button|submit.?button|searchButton|submitButton|primaryBtn|primary.?btn|primary-?cta|searchCta|search.?cta|book.?btn|find.?btn/i.test(cls)) return true;

    // data-testid hints
    if (/search.?btn|search.?button|submit|search-cta/i.test(testId)) return true;

    // Icon-only buttons: a BUTTON with no meaningful text but has SVG/icon child
    // These are often search icon buttons (magnifying glass)
    if (isButton && text.length <= 3) {
      const hasSvg = el.querySelector('svg, i[class*="icon"], span[class*="icon"], img');
      if (hasSvg) {
        // Check if the SVG or icon has search-related hints
        const svgContent = el.innerHTML.toLowerCase();
        if (/search|magnif|glass|loupe|find|submit/i.test(svgContent + ' ' + cls + ' ' + ariaLabel + ' ' + title)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Simulate a real click on an element (mousedown → mouseup → click).
   * Scrolls the element into view first.
   * **Will NOT click elements that look like search / submit buttons.**
   *
   * @param {Element} el
   */
  function searchClick(el) {
    if (!el) return;

    // Guard: never click a submit / search button during autofill
    if (_isSubmitButton(el)) {
      (window.TravelID?.Logger || console).warn(
        '[searchClick] Blocked click on submit/search button:', el.textContent?.trim()?.slice(0, 40)
      );
      return;
    }

    el.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
  }

  /**
   * Set the value of an input using the native property setter.
   * Resets React's internal _valueTracker so React sees the change.
   *
   * @param {HTMLElement} el
   * @param {string} value
   */
  function searchSetNativeValue(el, value) {
    // Contenteditable elements
    if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // Use native setter to bypass React/Vue value tracking
    const proto = (el.tagName === 'TEXTAREA')
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    // ── React _valueTracker reset ─────────────────────────────────────────
    // React 16+ attaches a _valueTracker to controlled inputs.
    // If the tracker's stored value matches the new value, React thinks
    // nothing changed and skips the onChange callback.
    // We reset it to a dummy so React's diff always triggers.
    const tracker = el._valueTracker;
    if (tracker) {
      tracker.setValue('');
    }

    if (setter) {
      setter.call(el, String(value));
    } else {
      el.value = String(value);
    }

    // Dispatch InputEvent — React 16+ reads inputType to identify real input
    try {
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        data: String(value),
        inputType: 'insertText',
      }));
    } catch (_) {
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  /**
   * Type a string character-by-character into an input element.
   * Each character dispatches keydown → keypress → input → keyup, which
   * triggers incremental suggestion fetching on React/Angular sites.
   *
   * @param {HTMLInputElement} el
   * @param {string}           text
   * @param {number}           [charDelay=40] — ms between characters
   * @returns {Promise<void>}
   */
  async function searchTypeCharByChar(el, text, charDelay = 40) {
    el.focus();

    const proto = (el.tagName === 'TEXTAREA')
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    for (let i = 0; i < text.length; i++) {
      const char      = text[i];
      const partial   = text.slice(0, i + 1);
      const keyCode   = char.charCodeAt(0);

      // keydown + keypress
      el.dispatchEvent(new KeyboardEvent('keydown',  { key: char, keyCode, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: char, keyCode, bubbles: true }));

      // Reset React tracker before each character
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue(text.slice(0, i));

      // Set value to partial string
      if (setter) {
        setter.call(el, partial);
      } else {
        el.value = partial;
      }

      // input event
      try {
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true, composed: true, data: char, inputType: 'insertText',
        }));
      } catch (_) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // keyup
      el.dispatchEvent(new KeyboardEvent('keyup', { key: char, keyCode, bubbles: true }));

      // small delay between characters
      if (i < text.length - 1) {
        await new Promise(r => setTimeout(r, charDelay));
      }
    }
  }

  /**
   * Dispatch blur + change events to finalize a value.
   *
   * @param {HTMLElement} el
   */
  function searchDispatchChangeEvent(el) {
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true, composed: true }));
  }

  /**
   * Close open overlays using multiple strategies:
   *   1. Press Escape on the active element
   *   2. Look for a close/dismiss button inside visible overlays
   *   3. Click body to trigger click-outside dismissals
   */
  function searchCloseOverlay() {
    const active = document.activeElement || document.body;

    // Strategy 1: Escape key
    active.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })
    );

    // Strategy 2: Find and click close buttons
    const closeButtons = document.querySelectorAll(
      '[aria-label*="close" i], [aria-label*="dismiss" i], ' +
      'button[class*="close" i], [class*="close-btn" i], ' +
      'button[class*="dismiss" i]'
    );
    for (const btn of closeButtons) {
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        btn.click();
        break;
      }
    }
  }

  /**
   * Normalize text for fuzzy matching: lowercase, collapse whitespace.
   *
   * @param {string} text
   * @returns {string}
   */
  function searchNormalizeText(text) {
    return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.searchClick              = searchClick;
  window.TravelID.searchSetNativeValue     = searchSetNativeValue;
  window.TravelID.searchTypeCharByChar     = searchTypeCharByChar;
  window.TravelID.searchDispatchChangeEvent = searchDispatchChangeEvent;
  window.TravelID.searchCloseOverlay       = searchCloseOverlay;
  window.TravelID.searchNormalizeText      = searchNormalizeText;
  window.TravelID.searchBlockFormSubmit    = searchBlockFormSubmit;
  window.TravelID.searchUnblockFormSubmit  = searchUnblockFormSubmit;
})();
