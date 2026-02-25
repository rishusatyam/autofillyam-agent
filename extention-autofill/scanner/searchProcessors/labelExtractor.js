// ========================================
// Search Processor — Label Extractor
// ========================================
// Extracts meaningful labels for search widget blocks.
//
// Fixes:
//   - Distinguishes label text from value text (dates, city names)
//   - Walks UP the DOM for floating/positioned labels
//   - Uses ARIA relationships properly
//   - Won't return city names or dates as labels
// ========================================
(function () {
  'use strict';

  /** Patterns that indicate text is a VALUE not a label */
  const VALUE_PATTERNS = [
    /^\d{1,2}\s?\w{3}\s?\d{2,4}/,          // "15 Mar 2026"
    /^\d{4}-\d{2}-\d{2}/,                   // "2026-03-15"
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,  // "15/03/2026"
    /^[A-Z]{3}\s*[-–→]\s*[A-Z]{3}/,         // "DEL → BOM" (airport codes)
    /^\d+\s*(adult|child|infant|room|guest|passenger)/i,  // "2 Adults"
    /^[A-Z]{3},/,                            // "BOM, Chhatrapati…" (IATA code prefix)
    /^\d{1,2}\s*$/,                          // lone digit like "22" (date day)
  ];

  /** Classnames that indicate value / noise content (not labels) */
  const VALUE_CLASS_RE = /value|city|airport|date|code|price|count|number|amount|detail|sub-?text|desc|meta|badge|offer|promo|save|tag|chip|ribbon/i;

  /** Common search-widget label words — used to prefer the right child */
  const COMMON_LABEL_RE = /\b(from|to|departure|depart|return|check.?in|check.?out|date|travel|journey|class|cabin|seat|room|guest|adult|child|infant|passenger|traveller|traveler|city|airport|station|origin|destination|pickup|drop|dropoff|where|when|onward|arrival|trip|type|way)\b/i;

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Extract the best label for a search widget block.
   * Tries multiple strategies in priority order.
   *
   * @param {Element} el
   * @returns {string|null}
   */
  function extractSearchLabel(el) {
    if (!el) return null;

    // 1. aria-label — most reliable
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && _isLabel(ariaLabel)) return ariaLabel.trim();

    // 2. Explicit data attributes
    for (const attr of ['data-label', 'data-placeholder', 'placeholder', 'title']) {
      const v = el.getAttribute(attr);
      if (v && _isLabel(v)) return v.trim();
    }

    // 3. ARIA labelledby reference
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      for (const id of ids) {
        const ref = document.getElementById(id);
        if (ref) {
          const t = ref.textContent.trim();
          if (t && _isLabel(t)) return t;
        }
      }
    }

    // 4. Child label/heading with short text
    const labelChild = el.querySelector(
      'label, [class*="label" i], [class*="heading" i], [class*="title" i], ' +
      '[class*="placeholder" i], [class*="header" i], h1, h2, h3, h4, h5, h6'
    );
    if (labelChild) {
      const t = labelChild.textContent.trim();
      if (t && t.length < 50 && _isLabel(t)) return t;
    }

    // 4.5 Walk direct children — find first short label-relevant text.
    //     SPAs render label + value as sibling elements; textContent
    //     concatenates them ("FromColombo…"). This separates them.
    const directLabel = _findLabelFromDirectChildren(el);
    if (directLabel) return directLabel;

    // 5. Walk UP the DOM — floating label may be a sibling of a parent
    const floatingLabel = _findFloatingLabel(el);
    if (floatingLabel) return floatingLabel;

    // 6. Previous sibling with short text
    const prev = el.previousElementSibling;
    if (prev && prev.textContent.trim().length < 50 &&
        !prev.querySelector('input,select,[role="button"]')) {
      const t = prev.textContent.trim();
      if (t && _isLabel(t)) return t;
    }

    // 7. First short text child that is NOT a value
    const text = _getFirstLabelText(el);
    if (text) return text;

    return null;
  }

  /**
   * Extract the current visible value from a block (separate from label).
   *
   * @param {Element} el
   * @param {string}  label - already resolved label to exclude
   * @returns {string}
   */
  function extractSearchValue(el, label) {
    const normalLabel = _normalise(label);
    const candidates = Array.from(
      el.querySelectorAll(
        '[class*="value" i], [class*="text" i], [class*="city" i], ' +
        '[class*="airport" i], [class*="date" i], [class*="name" i], span, p'
      )
    );

    for (const child of candidates) {
      const t = child.textContent.trim();
      if (!t || t.length > 80) continue;
      if (_normalise(t) === normalLabel) continue;
      return t;
    }

    return '';
  }

  // ─── Internal helpers ───────────────────────────────────────────────────

  /**
   * Check if text appears to be a label (not a filled value).
   *
   * @param {string} text
   * @returns {boolean}
   */
  function _isLabel(text) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 60) return false;

    for (const pattern of VALUE_PATTERNS) {
      if (pattern.test(trimmed)) return false;
    }
    return true;
  }

  /**
   * Walk up parent elements looking for a floating/positioned label.
   * Many SPAs render:
   *   <div class="field">
   *     <label>From</label>
   *     <div class="picker">...</div>
   *   </div>
   * If `el` is the picker, we need to go up to find the label sibling.
   *
   * @param {Element} el
   * @returns {string|null}
   */
  function _findFloatingLabel(el) {
    let parent = el.parentElement;
    let depth = 0;

    while (parent && depth < 3) {
      for (const child of parent.children) {
        if (child === el || child.contains(el)) continue;

        const tag = child.tagName.toLowerCase();
        const cls = (child.className || '').toString().toLowerCase();

        if (tag === 'label' || cls.includes('label') ||
            cls.includes('heading') || cls.includes('title') ||
            cls.includes('placeholder')) {
          const t = child.textContent.trim();
          if (t && t.length < 50 && _isLabel(t)) return t;
        }
      }
      parent = parent.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Walk DIRECT children of the block to find the first short text
   * that matches common search-widget label vocabulary.
   *
   * Prevents SPA label+value concatenation (e.g. "FromColombo…").
   *
   * @param {Element} el
   * @returns {string|null}
   */
  function _findLabelFromDirectChildren(el) {
    const candidates = [];
    _collectLabelCandidates(el, candidates);

    // One level deeper when block has wrapper divs
    if (candidates.length === 0) {
      for (const child of el.children) {
        if (child.children && child.children.length > 0) {
          _collectLabelCandidates(child, candidates);
        }
      }
    }

    // Prefer a candidate matching common label words
    for (const c of candidates) {
      if (COMMON_LABEL_RE.test(c)) return c;
    }

    // Otherwise pick the shortest (most likely a label)
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.length - b.length);
      return candidates[0];
    }
    return null;
  }

  /**
   * Collect short non-value child texts into an array.
   *
   * @param {Element} parent
   * @param {string[]} out
   */
  function _collectLabelCandidates(parent, out) {
    for (const child of parent.children) {
      const cls = (child.className || '').toString();
      if (VALUE_CLASS_RE.test(cls)) continue;

      const t = child.textContent.trim();
      if (!t || t.length > 30 || !_isLabel(t)) continue;

      out.push(t);
    }
  }

  /**
   * Last-resort label extraction: walks child elements individually,
   * then falls back to newline-split of raw textContent.
   *
   * @param {Element} el
   * @returns {string|null}
   */
  function _getFirstLabelText(el) {
    // Per-child walk (avoids concatenation)
    for (const child of el.children) {
      const cls = (child.className || '').toString();
      if (VALUE_CLASS_RE.test(cls)) continue;

      const t = child.textContent.trim();
      if (t && t.length > 0 && t.length < 40 && _isLabel(t)) return t;
    }

    // Grandchildren
    for (const child of el.children) {
      for (const gc of child.children) {
        const cls = (gc.className || '').toString();
        if (VALUE_CLASS_RE.test(cls)) continue;

        const t = gc.textContent.trim();
        if (t && t.length > 0 && t.length < 40 && _isLabel(t)) return t;
      }
    }

    // Final fallback: raw textContent split by newlines
    const raw = (el.textContent || '').trim();
    const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.length < 50 && _isLabel(line)) return line;
    }
    return null;
  }

  /** @param {string} text @returns {string} */
  function _normalise(text) {
    return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.extractSearchLabel = extractSearchLabel;
  window.TravelID.extractSearchValue = extractSearchValue;
})();
