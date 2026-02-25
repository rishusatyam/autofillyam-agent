// ========================================
// Search Processor — Block Extractor
// ========================================
// Extracts interactive blocks from a search container.
//
// Fixes:
//   - Keeps LABELED children over unlabeled parents (reversed logic)
//   - Better visibility + size filtering
//   - Handles deeply nested SPA component trees
// ========================================
(function () {
  'use strict';

  /** Selectors for elements that represent interactive search blocks */
  const BLOCK_SELECTORS = [
    '[role="button"]',
    '[role="combobox"]',
    '[role="textbox"]',
    '[role="listbox"]',
    '[aria-haspopup]',
    '[tabindex]:not([tabindex="-1"])',
    'div[class*="input" i]',
    'div[class*="field" i]',
    'div[class*="picker" i]',
    'div[class*="select" i]',
    'div[class*="box" i]',
    'div[class*="widget" i]',
    'button[class*="toggle" i]',
    'button[class*="tab" i]',
    '[data-testid*="field" i]',
    '[data-testid*="picker" i]',
    '[data-testid*="input" i]',
  ].join(',');

  /** Minimum pixel size — skip tiny/invisible blocks */
  const MIN_BLOCK_SIZE = 20;

  /** Maximum text length — blocks with more text are containers, not fields */
  const MAX_TEXT_LENGTH = 200;

  /** Selectors for elements that should NEVER be treated as search fields */
  const BLOCK_REJECT_SELECTORS = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button[type="reset"]',
  ].join(',');

  /** Text / attribute patterns that mark an element as a search/CTA button */
  const SUBMIT_TEXT_RE = /^\s*(search|find|submit|book|go|explore|show|get|check|look|search flights?|search hotels?|search buses?|search trains?|search cabs?|find flights?|book now|let'?s? go|check availability)\s*$/i;
  const SUBMIT_CLASS_RE = /\b(search.?btn|submit.?btn|cta.?btn|search.?button|submit.?button|searchBtn|submitBtn|primaryCta|primary.?cta|search-cta|book-btn)\b/i;

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Extract all interactive blocks from the search container.
   * Returns de-nested, visible blocks with meaningful content.
   *
   * Strategy:
   *   1. Query all elements matching BLOCK_SELECTORS inside root
   *   2. Filter for visibility and reasonable text length
   *   3. De-nest: if both parent and child are in the set, keep the
   *      one with a direct label attribute; if both or neither have one,
   *      keep the CHILD (more specific)
   *
   * @param {Element} root - the search container
   * @returns {Element[]}
   */
  function extractSearchBlocks(root) {
    const allNodes = Array.from(root.querySelectorAll(BLOCK_SELECTORS));

    // Phase 1: Filter for visible, non-trivial blocks
    const visible = allNodes.filter(el => {
      if (!_isVisible(el)) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;

      const text = (el.textContent || '').trim();
      if (text.length === 0) return false;
      if (text.length > MAX_TEXT_LENGTH) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_BLOCK_SIZE || rect.height < MIN_BLOCK_SIZE) return false;

      // ── Reject search / submit / CTA buttons ─────────────────────────
      if (el.matches(BLOCK_REJECT_SELECTORS)) return false;
      if (_isSubmitLikeButton(el, text)) return false;

      return true;
    });

    // Phase 2: De-nest parent/child pairs
    const set = new Set(visible);
    const toRemove = new Set();

    for (const el of visible) {
      let ancestor = el.parentElement;
      while (ancestor && ancestor !== root) {
        if (set.has(ancestor)) {
          // Both el (child) and ancestor (parent) are in the set
          const childHasLabel  = _hasDirectLabel(el);
          const parentHasLabel = _hasDirectLabel(ancestor);

          if (parentHasLabel && !childHasLabel) {
            // Parent has a label, child doesn't → remove child
            toRemove.add(el);
          } else {
            // Child has label OR neither has label → remove parent (keep specific)
            toRemove.add(ancestor);
          }
        }
        ancestor = ancestor.parentElement;
      }
    }

    return visible.filter(el => !toRemove.has(el));
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Check if an element has a direct label attribute
   * (not inherited from textContent).
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function _hasDirectLabel(el) {
    return !!(
      el.getAttribute('aria-label') ||
      el.getAttribute('data-label') ||
      el.getAttribute('data-placeholder') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title')
    );
  }

  /**
   * Check whether an element looks like a search / submit / CTA button.
   * These should never be treated as fillable search fields.
   *
   * @param {Element} el
   * @param {string}  text - already-trimmed textContent
   * @returns {boolean}
   */
  function _isSubmitLikeButton(el, text) {
    // Only applies to button-like elements
    const tag = el.tagName;
    const role = el.getAttribute('role') || '';
    const isButton = tag === 'BUTTON' || tag === 'A' ||
                     role === 'button' || role === 'link';
    if (!isButton) return false;

    // Check text content
    if (SUBMIT_TEXT_RE.test(text)) return true;

    // Check class / aria-label
    const cls = (el.className || '').toString();
    if (SUBMIT_CLASS_RE.test(cls)) return true;

    const ariaLabel = (el.getAttribute('aria-label') || '').trim();
    if (ariaLabel && SUBMIT_TEXT_RE.test(ariaLabel)) return true;

    return false;
  }

  /** @param {Element} el @returns {boolean} */
  function _isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.extractSearchBlocks = extractSearchBlocks;
})();
