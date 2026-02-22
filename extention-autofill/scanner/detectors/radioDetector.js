// ========================================
// Detector — Radio Buttons
// ========================================
// Finds all native radio inputs and ARIA radiogroups.
// Returns raw grouped structures; organisation into a single
// field record is handled by the scanner orchestrator.
// ========================================
(function () {
  'use strict';

  /**
   * Detect radio groups within `root`.
   *
   * @param {Element}  root
   * @param {Set<Element>} processedElements  - shared dedup set (mutated)
   * @returns {Map<string, Array<Element|{ element:Element, label:string, value:string, checked:boolean }>>}
   *          groupName → array of radio elements / ARIA radio descriptors
   */
  function detectRadioButtons(root, processedElements) {
    const { isElementVisible } = window.TravelID;
    const radioGroups = new Map();

    // ── 1. Native <input type="radio"> ──
    root.querySelectorAll('input[type="radio"]').forEach((el) => {
      if (el.disabled) return;

      const groupName =
        el.name ||
        _elKey(el.closest('[role="radiogroup"]') || el.parentElement);

      if (!radioGroups.has(groupName)) radioGroups.set(groupName, []);
      radioGroups.get(groupName).push(el);
      processedElements.add(el);
    });

    // ── 2. ARIA radiogroups (custom styled radios) ──
    root.querySelectorAll('[role="radiogroup"]').forEach((group) => {
      if (!isElementVisible(group)) return;

      const radios = group.querySelectorAll('[role="radio"]');
      if (radios.length < 2) return;

      const groupKey = _elKey(group);
      const radioArray = [];

      radios.forEach((radio) => {
        if (!isElementVisible(radio)) return;
        radioArray.push({
          element: radio,
          label:
            radio.textContent.trim() ||
            radio.getAttribute('aria-label') ||
            '',
          value:
            radio.getAttribute('value') || radio.textContent.trim(),
          checked: radio.getAttribute('aria-checked') === 'true',
        });
        processedElements.add(radio);
      });

      if (radioArray.length >= 2) radioGroups.set(groupKey, radioArray);
    });

    return radioGroups;
  }

  /**
   * Stable map key for an element.
   * @param {Element} el
   * @returns {string}
   */
  function _elKey(el) {
    if (!el) return 'unknown';
    if (el.id) return el.id;
    if (el.name) return el.name;
    const r = el.getBoundingClientRect();
    return `${el.tagName}_${Math.round(r.top)}_${Math.round(r.left)}`;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.detectRadioButtons = detectRadioButtons;
})();
