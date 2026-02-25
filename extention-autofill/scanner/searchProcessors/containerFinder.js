// ========================================
// Search Processor — Container Finder
// ========================================
// Locates the most specific search widget container on the page.
//
// Fixes over the previous monolithic approach:
//   - Returns the SMALLEST qualifying container (most specific)
//   - Scores by interactive-block density, not raw count
//   - Tries Shadow DOM penetration for web-component widgets
//   - Falls back to density heuristic if explicit selectors fail
// ========================================
(function () {
  'use strict';

  /** CSS selectors that typically wrap a search widget, tried in priority order */
  const CONTAINER_SELECTORS = [
    '[aria-label*="search" i]',
    '[aria-label*="booking" i]',
    '[id*="search" i]',
    '[id*="booking" i]',
    '[id*="widget" i]',
    '[class*="SearchWidget" i]',
    '[class*="search-widget" i]',
    '[class*="booking-widget" i]',
    '[class*="BookingWidget" i]',
    '[class*="search-form" i]',
    '[class*="SearchForm" i]',
    '[class*="flight-search" i]',
    '[class*="hotel-search" i]',
    '[class*="FlightSearch" i]',
    '[class*="HotelSearch" i]',
    '[class*="search-container" i]',
    '[class*="SearchContainer" i]',
    '[data-testid*="search" i]',
    '[data-testid*="widget" i]',
    'form[action*="search" i]',
    'form[action*="booking" i]',
  ];

  /** Selectors for interactive elements inside a search widget */
  const INTERACTIVE_SELECTORS =
    '[role="button"],[role="combobox"],[role="textbox"],[aria-haspopup],' +
    '[tabindex]:not([tabindex="-1"]),input:not([type="hidden"])';

  /** Minimum interactive blocks needed for a container to qualify */
  const MIN_INTERACTIVE_BLOCKS = 2;

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Find the best search container on the page.
   * Returns the most specific (smallest) qualifying element.
   *
   * @returns {Element}
   */
  function findSearchContainer() {
    const { Logger } = window.TravelID;

    // Strategy 1: Explicit selectors — pick smallest qualifying match
    const explicitCandidates = _findExplicitContainers();
    if (explicitCandidates.length > 0) {
      const best = _pickSmallest(explicitCandidates);
      Logger.debug('[ContainerFinder] Explicit match:', _desc(best));
      return best;
    }

    // Strategy 2: Heuristic — find containers by interactive-block density
    const heuristicBest = _findByDensity();
    if (heuristicBest) {
      Logger.debug('[ContainerFinder] Density heuristic:', _desc(heuristicBest));
      return heuristicBest;
    }

    // Strategy 3: Shadow DOM — check open shadow roots
    const shadowResult = _searchShadowRoots(document.body);
    if (shadowResult) {
      Logger.debug('[ContainerFinder] Shadow DOM match:', _desc(shadowResult));
      return shadowResult;
    }

    Logger.warn('[ContainerFinder] No container found — falling back to body');
    return document.body;
  }

  // ────────────────────────────────────────────────────────────────────────

  /**
   * Find all containers matching explicit selectors, filtered for
   * visibility and minimum interactive block count.
   *
   * @returns {Element[]}
   */
  function _findExplicitContainers() {
    const results = [];

    for (const selector of CONTAINER_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (!_isVisible(el)) continue;
          const interactiveCount = el.querySelectorAll(INTERACTIVE_SELECTORS).length;
          if (interactiveCount >= MIN_INTERACTIVE_BLOCKS) {
            results.push(el);
          }
        }
      } catch { /* skip invalid selector */ }
    }

    return results;
  }

  /**
   * Pick the SMALLEST qualifying container from a list.
   * "Smallest" = fewest total descendant elements (most specific).
   * If a candidate is an ancestor of another candidate, prefer the descendant.
   *
   * @param {Element[]} candidates
   * @returns {Element}
   */
  function _pickSmallest(candidates) {
    if (candidates.length === 1) return candidates[0];

    // Remove ancestors: if A contains B, drop A
    const filtered = candidates.filter(a => {
      return !candidates.some(b => b !== a && a.contains(b));
    });

    if (filtered.length === 0) return candidates[0];

    // Among remaining, pick the one with fewest children (most specific)
    let best = filtered[0];
    let bestSize = best.querySelectorAll('*').length;

    for (let i = 1; i < filtered.length; i++) {
      const size = filtered[i].querySelectorAll('*').length;
      if (size < bestSize) {
        bestSize = size;
        best = filtered[i];
      }
    }

    return best;
  }

  /**
   * Heuristic: score every visible div/section/form/main by
   * interactive-block DENSITY (blocks / total descendants).
   * Higher density + smaller size = more focused widget.
   *
   * @returns {Element|null}
   */
  function _findByDensity() {
    const all = Array.from(
      document.querySelectorAll('div, section, form, main, nav')
    ).filter(el => _isVisible(el));

    let best = null;
    let bestScore = 0;

    for (const el of all) {
      const total = el.querySelectorAll('*').length;
      if (total < 3 || total > 2000) continue;

      const interactive = el.querySelectorAll(INTERACTIVE_SELECTORS).length;
      if (interactive < MIN_INTERACTIVE_BLOCKS) continue;

      // Density + size bonus (smaller containers score higher)
      const density = interactive / total;
      const sizeBonus = 1 / Math.log2(total + 2);
      const score = density + sizeBonus;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return best;
  }

  /**
   * Recursively search open shadow roots for search containers.
   *
   * @param {Element} root
   * @returns {Element|null}
   */
  function _searchShadowRoots(root) {
    const elements = root.querySelectorAll('*');
    for (const el of elements) {
      if (el.shadowRoot) {
        for (const selector of CONTAINER_SELECTORS) {
          try {
            const match = el.shadowRoot.querySelector(selector);
            if (match && _isVisible(match)) {
              const count = match.querySelectorAll(INTERACTIVE_SELECTORS).length;
              if (count >= MIN_INTERACTIVE_BLOCKS) return match;
            }
          } catch { /* skip */ }
        }
        const deeper = _searchShadowRoots(el.shadowRoot);
        if (deeper) return deeper;
      }
    }
    return null;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** @param {Element} el @returns {boolean} */
  function _isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** Short description for debug logs. @param {Element} el @returns {string} */
  function _desc(el) {
    return `<${el.tagName.toLowerCase()} class="${(el.className || '').toString().substring(0, 50)}">`;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.findSearchContainer = findSearchContainer;
})();
