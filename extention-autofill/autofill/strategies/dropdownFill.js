// ========================================
// Autofill Strategy — Dropdown
// ========================================
(function () {
  'use strict';

  function _normalize(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function _scoreMatch(optionText, needle) {
    const t = _normalize(optionText);
    if (!t) return -1;
    if (t === needle) return 100;
    if (t.startsWith(needle)) return 80;
    if (t.includes(needle)) return 60;
    if (needle.includes(t)) return 40;
    return -1;
  }

  function _findMenu(root) {
    return (
      root.querySelector('[class*="__menu-list"]') ||
      root.querySelector('[class*="__menu"]') ||
      root.querySelector('[role="listbox"]') ||
      root.querySelector('[role="menu"]')
    );
  }

  function _findOptionElements(menu) {
    return Array.from(
      menu.querySelectorAll(
        '[class*="__option"],[role="option"],li,div,span'
      )
    ).filter((el) => {
      const txt = _normalize(el.textContent);
      if (!txt) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  async function _openAndPickOption(control, value) {
    const { Logger } = window.TravelID;
    const needle = _normalize(value);
    if (!needle) return false;

    const tryClose = () => {
      try {
        control.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        control.blur();
      } catch (_) {
        /* noop */
      }
    };

    const existingMenu = _findMenu(document);
    if (existingMenu) {
      const options = _findOptionElements(existingMenu);
      let best = null;
      let bestScore = -1;
      for (const el of options) {
        const s = _scoreMatch(el.textContent, needle);
        if (s > bestScore) {
          bestScore = s;
          best = el;
        }
      }
      if (best && bestScore >= 40) {
        best.click();
        return true;
      }
    }

    return new Promise((resolve) => {
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(timer);
        if (!ok) tryClose();
        resolve(ok);
      };

      const observer = new MutationObserver(() => {
        const menu = _findMenu(document);
        if (!menu) return;
        const optionEls = _findOptionElements(menu);
        if (optionEls.length === 0) return;

        let best = null;
        let bestScore = -1;
        for (const el of optionEls) {
          const s = _scoreMatch(el.textContent, needle);
          if (s > bestScore) {
            bestScore = s;
            best = el;
          }
        }

        if (best && bestScore >= 40) {
          try {
            best.click();
            finish(true);
          } catch (err) {
            Logger.warn('[DropdownFill] option click failed:', err.message);
            finish(false);
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-expanded'],
      });

      const timer = setTimeout(() => {
        finish(false);
      }, 2000);

      try {
        control.click();
      } catch (err) {
        Logger.warn('[DropdownFill] control click failed:', err.message);
        finish(false);
      }
    });
  }

  /**
   * Fill a native <select> dropdown by matching option text or value.
   * Falls back to partial matching so "India" matches "India (+91)".
   *
   * @param {HTMLSelectElement} element
   * @param {string} value
   * @returns {Promise<boolean>|boolean}
   */
  function fillDropdown(element, value) {
    if (!element || !element.tagName) return false;

    if (element.tagName !== 'SELECT') {
      const control =
        element.querySelector?.('[class*="__control"]') ||
        element.querySelector?.('[role="combobox"]') ||
        element;
      return _openAndPickOption(control, value);
    }

    const { dispatchInputEvents } = window.TravelID;
    const needle = String(value).toLowerCase().trim();

    // 1. Exact match on option text or value attribute
    for (const option of element.options) {
      const text = option.textContent.toLowerCase().trim();
      const val = option.value.toLowerCase().trim();
      if (text === needle || val === needle) {
        element.value = option.value;
        dispatchInputEvents(element);
        return true;
      }
    }

    // 2. Partial / contains match
    for (const option of element.options) {
      const text = option.textContent.toLowerCase().trim();
      if (text.includes(needle) || needle.includes(text)) {
        element.value = option.value;
        dispatchInputEvents(element);
        return true;
      }
    }

    window.TravelID.Logger.warn(
      `[DropdownFill] No match for "${value}" in select`
    );
    return false;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.fillDropdown = fillDropdown;
})();
