// ========================================
// Detector — Dropdown Fields
// ========================================
// Handles:
//   1. Native <select>
//   2. React Select (react-select-* input ids)
//   3. Generic React-Select containers (*-container + __control)
//   4. Generic behavior-based dropdowns:
//      clickable element + displays current value + opens menu on click
//   5. ARIA combobox / listbox
//
// Option scraping uses MutationObserver — no arbitrary timeouts.
// Returns raw field objects; no filtering applied here.
// ========================================
(function () {
  'use strict';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Return true if `el` is nested inside an element already processed
   * as a dropdown container/control. Prevents one dropdown being emitted twice.
   * @param {Element} el
   * @param {Set<Element>} processed
   * @param {Set<Element>} innerProcessed
   * @returns {boolean}
   */
  function _isNestedInProcessed(el, processed, innerProcessed) {
    let cur = el.parentElement;
    for (let i = 0; i < 10 && cur && cur !== document.body; i++) {
      if (processed.has(cur) || innerProcessed.has(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  /**
   * Try to resolve a stable field label (e.g. "Country Code") rather than the
   * current selected value shown inside the dropdown (e.g. "India(91)").
   * @param {Element} el
   * @returns {string|null}
   */
  function _resolveDropdownLabel(el) {
    const { resolveLabel } = window.TravelID;
    const selfText = (el.textContent || '').trim();
    const direct = resolveLabel(el);

    // If resolveLabel returns something different than the current displayed value,
    // it's usually the correct label.
    if (direct && _norm(direct) && _norm(direct) !== _norm(selfText)) return direct;

    // Otherwise try to find a nearby static label (common on Goibibo-like UIs)
    // 1) previous sibling
    const prev = el.previousElementSibling;
    if (prev) {
      const t = (prev.textContent || '').trim();
      if (t && t.length < 80 && !prev.querySelector('input,select,textarea,button')) {
        return t;
      }
    }

    // 2) walk up a few levels, look for :scope > label or previous sibling text
    let cur = el;
    for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
      const p = cur.parentElement;
      if (!p) break;
      const lblEl = p.querySelector(':scope > label');
      if (lblEl) {
        const t = (lblEl.textContent || '').trim();
        if (t && t.length < 80) return t;
      }
      const pPrev = p.previousElementSibling;
      if (pPrev) {
        const t = (pPrev.textContent || '').trim();
        if (t && t.length < 80 && !pPrev.querySelector('input,select,textarea,button')) {
          return t;
        }
      }
      cur = p;
    }

    return direct || null;
  }

  function _norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Stable map key for an element.
   * @param {Element} el
   * @returns {string}
   */
  function _elKey(el) {
    if (el.id) return `dd_${el.id}`;
    if (el.name) return `dd_${el.name}`;
    const r = el.getBoundingClientRect();
    return `dd_${el.tagName}_${Math.round(r.top)}_${Math.round(r.left)}`;
  }

  /**
   * Walk up toward body to find the React-Select container element.
   * @param {Element} el
   * @returns {Element|null}
   */
  function _findSelectContainer(el) {
    let cur = el.parentElement;
    for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
      const cls = cur.className || '';
      if (/-container\b/.test(cls)) return cur;
      if (/\bselectList\b/.test(cls)) return cur;         // Goibibo
      cur = cur.parentElement;
    }
    return el.closest('[class*="-container"]') || el.parentElement;
  }

  /**
   * Extract label + placeholder from a dropdown container.
   * @param {Element} container
   * @returns {{ label: string|null, placeholder: string|null }}
   */
  function _extractMeta(container) {
    const { resolveLabel } = window.TravelID;
    const input = container.querySelector('input');
    const phEl = container.querySelector(
      '[class*="__placeholder"],[class*="placeholder"]'
    );
    return {
      label:
        (input ? resolveLabel(input) : null) ||
        resolveLabel(container),
      placeholder:
        (input ? input.placeholder || null : null) ||
        (phEl ? phEl.textContent.trim() : null),
    };
  }

  // ─── MutationObserver-based option scrapers ──────────────────────────────

  /**
   * Click a control element and wait for the option menu to appear
   * using MutationObserver, then read options and close.
   * Returns a Promise that resolves with the scraped option strings.
   *
   * @param {Element} control          - the element to click to open
   * @param {Element} [menuAnchor]     - ancestor to watch for menu; defaults to document.body
   * @param {number}  [timeout=2000]   - max wait ms before giving up
   * @returns {Promise<string[]>}
   */
  function scrapeOptionsViaMutationObserver(control, menuAnchor, timeout) {
    const { Logger } = window.TravelID;
    menuAnchor = menuAnchor || document.body;
    timeout = timeout || 2000;

    const findMenu = () => {
      // Prefer explicit known menus first
      return (
        // React-Select
        menuAnchor.querySelector('[class*="__menu-list"]') ||
        menuAnchor.querySelector('[class*="__menu"]') ||
        document.querySelector('[class*="__menu-list"]') ||
        document.querySelector('[class*="__menu"]') ||
        // ARIA menus/listboxes
        document.querySelector('[role="listbox"]') ||
        document.querySelector('[role="menu"]') ||
        // Goibibo-like country code lists
        document.querySelector('[class*="selectList"]') ||
        // Generic dropdown containers
        document.querySelector('[class*="dropdown"][class*="menu"]') ||
        document.querySelector('[class*="dropdown"][class*="list"]')
      );
    };

    const extractOptions = (menu) => {
      if (!menu) return [];

      // Restrict to reliable option-like elements.
      const optionEls = menu.querySelectorAll(
        '[class*="__option"],[role="option"],li,[data-value]'
      );

      const out = [];
      const seen = new Set();
      for (const o of Array.from(optionEls)) {
        const t = (o.textContent || '').trim();
        if (!t || t.length >= 120) continue;
        const k = _norm(t);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out;
    };

    const tryOpen = () => {
      try {
        control.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, cancelable: true })
        );
        control.dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, cancelable: true })
        );
      } catch (_) {
        /* noop */
      }

      try {
        control.click();
        return;
      } catch (_) {
        /* noop */
      }

      // Some UIs only open when clicking a specific inner element
      try {
        const inner =
          control.querySelector?.('input,button,[role="button"],[aria-haspopup]') ||
          null;
        if (inner && typeof inner.click === 'function') inner.click();
      } catch (_) {
        /* noop */
      }
    };

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (options) => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        clearTimeout(timer);
        // Close the dropdown
        try {
          control.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
          );
          control.blur();
        } catch (_) { /* best-effort close */ }
        resolve(options);
      };

      // Watch for any menu elements being added/expanded
      const observer = new MutationObserver(() => {
        const menu = findMenu();
        if (!menu) return;
        const options = extractOptions(menu);
        if (options.length === 0) return;
        Logger.debug(`[DropdownDetector] scraped ${options.length} options`);
        finish(options);
      });

      observer.observe(menuAnchor, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

      // Timeout fallback
      const timer = setTimeout(() => {
        Logger.warn('[DropdownDetector] option scrape timed out');
        finish([]);
      }, timeout);

      // Trigger the dropdown open
      try {
        tryOpen();
      } catch (err) {
        Logger.warn('[DropdownDetector] click failed:', err.message);
        finish([]);
      }
    });
  }

  // ─── Generic behavior-based dropdown detection ───────────────────────────

  /**
   * A "generic" dropdown is any clickable element that:
   *   - Is not already a native select / React-Select / ARIA combobox
   *   - Has aria-expanded or aria-haspopup="listbox"/"true"
   *   - OR has a class that strongly suggests a select control
   *
   * @param {Element}  root
   * @param {Set<Element>} processed
   * @param {Set<Element>} innerProcessed
   * @returns {Array<{ key: string, field: import('../types').RawField }>}
   */
  function _detectGenericDropdowns(root, processed, innerProcessed) {
    const { isElementVisible, resolveLabel, findSection } = window.TravelID;
    const results = [];

    const candidates = root.querySelectorAll(
      '[aria-expanded],[aria-haspopup="listbox"],[aria-haspopup="true"],' +
      '[class*="select__"],[class*="dropdown__"],[class*="picker__"]'
    );

    candidates.forEach((el) => {
      // Skip native selects — handled separately
      if (el.tagName === 'SELECT') return;
      if (_isNestedInProcessed(el, processed, innerProcessed)) return;
      // Skip elements already captured
      if (processed.has(el) || innerProcessed.has(el)) return;
      // Must be visible
      if (!isElementVisible(el)) return;
      // Must look interactive
      const role = (el.getAttribute('role') || '').toLowerCase();
      const hasInteractiveSignal =
        el.tabIndex >= 0 ||
        role === 'button' ||
        role === 'combobox' ||
        !!el.getAttribute('aria-haspopup') ||
        typeof el.onclick === 'function';
      if (!hasInteractiveSignal) return;
      // Must have minimum dimensions
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 10) return;
      // Skip if it contains a recognized dropdown structure (avoid double-collect)
      if (el.querySelector('[class*="__control"]')) return;

      innerProcessed.add(el);

      /** @type {import('../types').RawField} */
      const field = {
        type: 'dropdown',
        label: _resolveDropdownLabel(el) || resolveLabel(el) || findSection(el),
        placeholder: el.getAttribute('placeholder') || null,
        section: findSection(el),
        options: [],
        _element: el,
        _control: el,
      };

      results.push({ key: _elKey(el), field });
    });

    return results;
  }

  // ─── Public detector ────────────────────────────────────────────────────────

  /**
   * Detect all dropdown-type fields within `root`.
   * Attaches `_control` and `_pendingScrape = true` on fields that need
   * async option scraping; the orchestrator calls `scrapeAllPendingOptions`
   * afterwards.
   *
   * @param {Element}  root
   * @param {Set<Element>} processedElements  - shared dedup set (mutated)
   * @returns {Array<{ key: string, field: import('../types').RawField }>}
   */
  function detectDropdowns(root, processedElements) {
    const { isElementVisible, isInteractable, resolveLabel, findSection } =
      window.TravelID;

    /** @type {Array<{ key: string, field: import('../types').RawField }>} */
    const results = [];
    /** @type {Set<Element>} */
    const innerProcessed = new Set(); // local — prevents double-emit within this run

    // ── 1. Native <select> ────────────────────────────────────────────────
    root.querySelectorAll('select').forEach((el) => {
      if (!isInteractable(el)) return;
      if (processedElements.has(el)) return;
      processedElements.add(el);
      innerProcessed.add(el);

      const options = Array.from(el.options)
        .filter((opt) => opt.value || opt.textContent.trim())
        .map((opt) => opt.textContent.trim())
        .filter((t) => t.length > 0);

      /** @type {import('../types').RawField} */
      const field = {
        type: 'dropdown',
        label: resolveLabel(el),
        placeholder: null,
        section: findSection(el),
        options,
        _element: el,
      };

      results.push({ key: _elKey(el), field });
    });

    // ── 2. React Select: inputs prefixed "react-select-*" ────────────────
    root.querySelectorAll('input[id^="react-select-"]').forEach((input) => {
      const container = _findSelectContainer(input);
      if (!container || container === document.body) return;
      if (innerProcessed.has(container)) return;
      if (!isElementVisible(container)) return;

      innerProcessed.add(container);
      if (processedElements.has(container)) return;
      processedElements.add(container);

      const { label, placeholder } = _extractMeta(container);

      /** @type {import('../types').RawField} */
      const field = {
        type: 'dropdown',
        label: label || findSection(container),
        placeholder,
        section: findSection(container),
        options: [],
        _element: container,
        _control: container,
        _pendingScrape: true,
      };

      results.push({ key: input.id || _elKey(container), field });
    });

    // ── 3. Generic React-Select containers ───────────────────────────────
    root.querySelectorAll('[class*="-container"]').forEach((container) => {
      if (!container.querySelector('[class*="__control"]')) return;
      if (innerProcessed.has(container)) return;
      if (!isElementVisible(container)) return;

      const r = container.getBoundingClientRect();
      if (r.width < 20 || r.height < 10) return;

      innerProcessed.add(container);
      if (processedElements.has(container)) return;
      processedElements.add(container);

      const { label, placeholder } = _extractMeta(container);

      /** @type {import('../types').RawField} */
      const field = {
        type: 'dropdown',
        label: label || findSection(container),
        placeholder,
        section: findSection(container),
        options: [],
        _element: container,
        _control: container,
        _pendingScrape: true,
      };

      results.push({ key: _elKey(container), field });
    });

    // ── 4. ARIA combobox / listbox (non-React-Select custom dropdowns) ───
    root
      .querySelectorAll('[role="combobox"],[aria-haspopup="listbox"]')
      .forEach((el) => {
        if (innerProcessed.has(el)) return;
        if (!isElementVisible(el)) return;
        if (_isNestedInProcessed(el, processedElements, innerProcessed)) return;
        // Skip containers that already house an input or select
        if (el.querySelector('input, select')) return;

        innerProcessed.add(el);
        if (processedElements.has(el)) return;
        processedElements.add(el);

        /** @type {import('../types').RawField} */
        const field = {
          type: 'dropdown',
          label: resolveLabel(el) || findSection(el),
          placeholder: el.getAttribute('placeholder') || null,
          section: findSection(el),
          options: [],
          _element: el,
          _control: el,
          _pendingScrape: true,
        };

        results.push({ key: _elKey(el), field });
      });

    // ── 5. Generic behavior-based dropdowns ──────────────────────────────
    const generic = _detectGenericDropdowns(root, processedElements, innerProcessed);
    for (const item of generic) {
      item.field._pendingScrape = true;
      processedElements.add(item.field._element);
      results.push(item);
    }

    return results;
  }

  /**
   * For each field that has `_pendingScrape = true`, click it open,
   * observe the DOM for the menu, scrape options, then close.
   * Runs serially to avoid stomping on the DOM.
   *
   * @param {Map<string, import('../types').RawField>} fieldsMap
   * @returns {Promise<void>}
   */
  async function scrapeAllPendingOptions(fieldsMap) {
    const { Logger } = window.TravelID;
    const pending = [];

    for (const [, field] of fieldsMap) {
      if (field.type === 'dropdown' && field._pendingScrape && field._control) {
        pending.push(field);
      }
    }

    if (pending.length === 0) return;
    Logger.info(`[DropdownDetector] Scraping options for ${pending.length} dropdown(s)`);

    for (const field of pending) {
      if (field.options.length > 0) continue; // already filled by another path
      try {
        const options = await scrapeOptionsViaMutationObserver(
          field._control,
          document.body,
          2000
        );
        if (options.length > 0) {
          field.options = options;
          Logger.debug(
            `[DropdownDetector] "${field.label}": ${options.length} options`,
            options.slice(0, 5)
          );
        }
      } catch (err) {
        Logger.warn(`[DropdownDetector] scrape failed for "${field.label}":`, err.message);
      }
      field._pendingScrape = false;
      // Small breathing room between dropdowns so the page can settle
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.detectDropdowns = detectDropdowns;
  window.TravelID.scrapeAllPendingOptions = scrapeAllPendingOptions;
})();
