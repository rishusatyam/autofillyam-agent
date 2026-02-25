// ========================================
// Search Detector — Toggle / Tab Controls
// ========================================
// Detects trip type (One Way / Round Trip), cabin class, etc.
//
// Three strategies:
//   A. ARIA radio/tab groups (role="radio" or role="tab", ≥ 2 items)
//   B. Button groups whose label/text matches toggle keywords
//   C. CSS-only toggles with class*="toggle"/"switch"
// ========================================
(function () {
  'use strict';

  const TOGGLE_KEYWORDS = [
    'oneway', 'one way', 'round trip', 'roundtrip', 'multi city',
    'multicity', 'economy', 'business', 'first class', 'premium',
    'trip type', 'one-way', 'return', 'domestic', 'international',
  ];

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Detect toggle fields from blocks and the search container.
   *
   * @param {Element[]} blocks
   * @param {Element}   container - search container root
   * @param {Map<string, object>} existingFields
   * @returns {Array<{ key: string, field: object }>}
   */
  function detectSearchToggles(blocks, container, existingFields) {
    const results = [];

    // Strategy A: ARIA radio/tab groups
    _detectAriaGroups(container, existingFields, results);

    // Strategy B: Toggle-keyword blocks
    _detectKeywordToggles(blocks, existingFields, results);

    // Strategy C: CSS toggle/switch elements
    _detectCssToggles(container, existingFields, results);

    return results;
  }

  // ─── Strategy A ─────────────────────────────────────────────────────────

  /**
   * ARIA radio or tab groups.
   * Groups radios by their nearest common ancestor (tablist/radiogroup/parent).
   */
  function _detectAriaGroups(container, existingFields, results) {
    // Custom ARIA radios / tabs
    const ariaRadios = Array.from(
      container.querySelectorAll('[role="radio"], [role="tab"]')
    ).filter(el => _isVisible(el));

    // Native radio inputs (goibibo, cleartrip, etc.)
    const nativeRadios = Array.from(
      container.querySelectorAll('input[type="radio"]')
    ).filter(el => _isVisible(el));

    const allRadios = [...ariaRadios, ...nativeRadios];
    if (allRadios.length < 2) return;

    // Group by nearest common parent
    const groups = new Map();
    for (const radio of allRadios) {
      const group =
        radio.closest('[role="tablist"], [role="radiogroup"], fieldset') ||
        radio.closest('label')?.parentElement ||
        radio.parentElement ||
        container;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(radio);
    }

    for (const [groupEl, members] of groups) {
      if (members.length < 2) continue;

      const options = members
        .map(el => {
          // For native radios, get text from wrapping <label>
          if (el.tagName === 'INPUT') {
            const lbl = el.closest('label') ||
              (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
            return lbl ? lbl.textContent.trim() : el.value || '';
          }
          return el.textContent.trim();
        })
        .filter(Boolean);

      const label = _resolveToggleLabel(groupEl) || 'Trip Type';
      const dedupKey = `toggle:${_normalise(label)}`;
      if (existingFields.has(dedupKey)) continue;

      results.push({
        key: dedupKey,
        field: {
          type: 'toggle',
          label,
          placeholder: '',
          section: 'Search',
          options,
          _element: groupEl,
        },
      });
    }
  }

  // ─── Strategy B ─────────────────────────────────────────────────────────

  /**
   * Blocks whose label or text matches toggle keywords.
   */
  function _detectKeywordToggles(blocks, existingFields, results) {
    const { extractSearchLabel } = window.TravelID;

    for (const block of blocks) {
      const label = extractSearchLabel(block);
      if (!label) continue;
      if (!_matchesKeywords(label, TOGGLE_KEYWORDS)) continue;

      const dedupKey = `toggle:${_normalise(label)}`;
      if (existingFields.has(dedupKey)) continue;

      // Already detected by strategy A?
      if (_alreadyCaptured(block, results)) continue;

      const options = Array.from(
        block.querySelectorAll(
          'button, li, [role="option"], [role="radio"], [role="tab"]'
        )
      )
        .map(el => el.textContent.trim())
        .filter(Boolean);

      results.push({
        key: dedupKey,
        field: {
          type: 'toggle',
          label,
          placeholder: '',
          section: 'Search',
          options: [...new Set(options)],
          _element: block,
        },
      });
    }
  }

  // ─── Strategy C ─────────────────────────────────────────────────────────

  /**
   * CSS-class toggles/switches not caught by A or B.
   */
  function _detectCssToggles(container, existingFields, results) {
    const toggleEls = Array.from(
      container.querySelectorAll(
        '[class*="toggle" i], [class*="switch" i], [role="switch"]'
      )
    ).filter(
      el => _isVisible(el) && el.getAttribute('aria-hidden') !== 'true'
    );

    for (const el of toggleEls) {
      if (_alreadyCaptured(el, results)) continue;

      // Check existingFields too
      let capturedInExisting = false;
      for (const [, field] of existingFields) {
        if (field._element &&
            (field._element === el || field._element.contains(el))) {
          capturedInExisting = true;
          break;
        }
      }
      if (capturedInExisting) continue;

      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('data-label') ||
        el.textContent.trim().substring(0, 50) ||
        'Toggle';

      const dedupKey = `toggle:${_normalise(label)}`;
      if (existingFields.has(dedupKey)) continue;

      results.push({
        key: dedupKey,
        field: {
          type: 'toggle',
          label,
          placeholder: '',
          section: 'Search',
          options: ['on', 'off'],
          _element: el,
        },
      });
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Resolve the label for a toggle group element.
   *
   * @param {Element} groupEl
   * @returns {string|null}
   */
  function _resolveToggleLabel(groupEl) {
    if (groupEl.getAttribute('aria-label'))
      return groupEl.getAttribute('aria-label').trim();

    const labelledBy = groupEl.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref) return ref.textContent.trim();
    }

    const legend = groupEl.querySelector('legend');
    if (legend) return legend.textContent.trim();

    const prev = groupEl.previousElementSibling;
    if (prev && prev.textContent.trim().length < 40) {
      return prev.textContent.trim();
    }

    return null;
  }

  /**
   * Check if an element is already captured by a just-detected result.
   *
   * @param {Element} el
   * @param {Array<{ field: { _element: Element } }>} results
   * @returns {boolean}
   */
  function _alreadyCaptured(el, results) {
    for (const r of results) {
      if (r.field._element &&
          (r.field._element === el || r.field._element.contains(el))) {
        return true;
      }
    }
    return false;
  }

  function _matchesKeywords(text, keywords) {
    const n = _normalise(text);
    return keywords.some(kw => n.includes(kw));
  }

  function _normalise(text) {
    return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function _isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' ||
        parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.detectSearchToggles = detectSearchToggles;
})();
