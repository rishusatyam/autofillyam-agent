// DOM Scanner — detects 5 field types with fieldType classification

class DOMScanner {
  constructor() {
    this.fields = new Map();  // key → field metadata
    this.groups = new Set();  // processed group keys
    this.observer = null;
    this.startTime = null;
  }

  async scan() {
    this.startTime = Date.now();
    this.fields.clear();
    this.groups.clear();

    // --- DEBUG: element counts on the page ---
    console.group('[AutofillScanner] Pre-scan counts');
    console.log('input/textarea (all):', document.querySelectorAll('input,textarea').length);
    console.log('[role=combobox]:', document.querySelectorAll('[role="combobox"]').length);
    console.log('[role=listbox]:', document.querySelectorAll('[role="listbox"]').length);
    console.log('[aria-haspopup=listbox]:', document.querySelectorAll('[aria-haspopup="listbox"]').length);
    console.log('[role=button]:', document.querySelectorAll('[role="button"]').length);
    console.log('[role=radio]:', document.querySelectorAll('[role="radio"]').length);
    console.log('[role=radiogroup]:', document.querySelectorAll('[role="radiogroup"]').length);
    console.log('[role=group]:', document.querySelectorAll('[role="group"]').length);
    console.log('[role=tablist]:', document.querySelectorAll('[role="tablist"]').length);
    console.log('[role=checkbox]:', document.querySelectorAll('[role="checkbox"]').length);
    console.groupEnd();

    this._detectTextInputs(document.body);
    this._detectNativeDropdowns(document.body);

    const beforeCustomDropdowns = this.fields.size;
    this._detectCustomDropdowns(document.body);
    console.log('[AutofillScanner] _detectCustomDropdowns added:', this.fields.size - beforeCustomDropdowns,
      '| new fields:', Array.from(this.fields.values()).slice(beforeCustomDropdowns).map(f => ({ label: f.label, domPath: f.domPath })));

    const beforeToggleGroups = this.fields.size;
    this._detectToggleGroups(document.body);
    console.log('[AutofillScanner] _detectToggleGroups added:', this.fields.size - beforeToggleGroups,
      '| new fields:', Array.from(this.fields.values()).slice(beforeToggleGroups).map(f => ({ label: f.label, options: f.options })));

    const beforeCheckboxes = this.fields.size;
    this._detectCheckboxes(document.body);
    console.log('[AutofillScanner] _detectCheckboxes added:', this.fields.size - beforeCheckboxes);

    const beforeRadios = this.fields.size;
    this._detectRadios(document.body);
    console.log('[AutofillScanner] _detectRadios added:', this.fields.size - beforeRadios);

    // Pattern-based detectors (class-based frameworks — no ARIA roles)
    const beforePatternDropdowns = this.fields.size;
    this._detectPatternDropdowns(document.body);
    console.log('[AutofillScanner] _detectPatternDropdowns added:', this.fields.size - beforePatternDropdowns);

    const beforePatternToggles = this.fields.size;
    this._detectPatternToggles(document.body);
    console.log('[AutofillScanner] _detectPatternToggles added:', this.fields.size - beforePatternToggles);

    const beforePatternCheckboxes = this.fields.size;
    this._detectPatternCheckboxes(document.body);
    console.log('[AutofillScanner] _detectPatternCheckboxes added:', this.fields.size - beforePatternCheckboxes);

    await this._observe();
    return this._buildResult();
  }

  // Run all detectors on a root node (used by MutationObserver for dynamic nodes only)
  _scanRoot(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    this._detectTextInputs(root);
    this._detectNativeDropdowns(root);
    this._detectCustomDropdowns(root);
    this._detectToggleGroups(root);
    this._detectCheckboxes(root);
    this._detectRadios(root);
    this._detectPatternDropdowns(root);
    this._detectPatternToggles(root);
    this._detectPatternCheckboxes(root);
  }

  // 1. Text inputs and textareas
  _detectTextInputs(root) {
    const SKIP = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'checkbox', 'radio']);
    root.querySelectorAll('input,textarea').forEach(el => {
      if (SKIP.has(el.type) || !isElementVisible(el) || el.disabled) return;
      // Skip React Select hidden inputs — handled by _detectPatternDropdowns
      if (/^react-select-/.test(el.id || '')) return;
      this._add({
        fieldType: 'text',
        id: el.id || null,
        name: el.name || null,
        tag: el.tagName.toLowerCase(),
        inputType: el.type || 'text',
        label: resolveLabel(el),
        placeholder: el.placeholder || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        section: findSection(el),
        options: null,
        required: el.required || el.hasAttribute('required'),
        domPath: getDOMPath(el),
        value: el.value || null
      });
    });
  }

  // 2. Native <select>
  _detectNativeDropdowns(root) {
    root.querySelectorAll('select').forEach(el => {
      if (!isElementVisible(el) || el.disabled) return;
      this._add({
        fieldType: 'dropdown',
        id: el.id || null,
        name: el.name || null,
        tag: 'select',
        inputType: 'select',
        label: resolveLabel(el),
        placeholder: null,
        ariaLabel: el.getAttribute('aria-label') || null,
        section: findSection(el),
        options: getSelectOptions(el),
        required: el.required || el.hasAttribute('required'),
        domPath: getDOMPath(el),
        value: el.value || null
      });
    });
  }

  // 3. Custom dropdowns (React Select, comboboxes)
  _detectCustomDropdowns(root) {
    const seen = new Set();
    const CLS_RE = /\b(select|dropdown|combobox)[-_]?(control|container|wrapper)?\b/i;

    const process = (el, source) => {
      if (!isElementVisible(el)) {
        console.log('[CustomDropdown] SKIP invisible:', el.tagName, el.className.slice(0,60));
        return;
      }
      if (seen.has(el)) return;
      if (el.tagName === 'SELECT' || el.tagName === 'INPUT') {
        console.log('[CustomDropdown] SKIP native tag:', el.tagName);
        return;
      }
      if (el.querySelector('input,select')) {
        console.log('[CustomDropdown] SKIP has child input/select:', el.tagName, el.className.slice(0,60),
          '| source:', source, '| child:', el.querySelector('input,select').tagName);
        return;
      }
      seen.add(el);
      console.log('[CustomDropdown] ADD:', el.tagName, el.className.slice(0,60), '| source:', source);
      this._add({
        fieldType: 'dropdown',
        id: el.id || null,
        name: el.getAttribute('name') || null,
        tag: el.tagName.toLowerCase(),
        inputType: 'custom-dropdown',
        label: resolveLabel(el),
        placeholder: el.getAttribute('placeholder') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        section: findSection(el),
        options: null,
        required: el.getAttribute('aria-required') === 'true',
        domPath: getDOMPath(el),
        value: getCustomDropdownValue(el)
      });
    };

    root.querySelectorAll('[role="combobox"],[role="listbox"],[aria-haspopup="listbox"]').forEach(el => process(el, 'aria-role'));
    root.querySelectorAll('[class]').forEach(el => { if (CLS_RE.test(el.className)) process(el, 'class-match'); });
  }

  // 4. Toggle groups (Gender, cabin class, tabs)
  _detectToggleGroups(root) {
    const ACTIVE = /\b(active|selected|checked|current)\b/i;

    const process = container => {
      const key = getGroupKey(container);
      if (this.groups.has(key)) return;
      if (!isElementVisible(container)) {
        console.log('[ToggleGroup] SKIP invisible:', container.tagName, container.getAttribute('role'), container.className.slice(0,50));
        return;
      }
      const items = Array.from(
        container.querySelectorAll('button,[role="button"],[role="radio"],[role="tab"]')
      ).filter(isElementVisible);
      if (items.length < 2) {
        console.log('[ToggleGroup] SKIP <2 items:', container.tagName, container.getAttribute('role'), '| found:', items.length,
          '| all children:', container.querySelectorAll('button,[role="button"],[role="radio"],[role="tab"]').length);
        return;
      }
      console.log('[ToggleGroup] ADD:', container.tagName, container.getAttribute('role'), '| items:', items.length,
        '| texts:', items.map(b => b.textContent.trim().slice(0,20)));
      this.groups.add(key);

      const options = items.map(b => ({
        text: b.textContent.trim() || b.getAttribute('aria-label') || null,
        value: b.getAttribute('data-value') || b.getAttribute('value') || b.textContent.trim() || null,
        selected: ACTIVE.test(b.className) || b.getAttribute('aria-checked') === 'true' || b.getAttribute('aria-selected') === 'true'
      }));

      this._add({
        fieldType: 'toggle',
        id: container.id || null,
        name: container.getAttribute('name') || null,
        tag: container.tagName.toLowerCase(),
        inputType: 'toggle-group',
        label: resolveLabel(container) || container.getAttribute('aria-label') || null,
        placeholder: null,
        ariaLabel: container.getAttribute('aria-label') || null,
        section: findSection(container),
        options,
        required: container.getAttribute('aria-required') === 'true',
        domPath: getDOMPath(container),
        value: (options.find(o => o.selected) || {}).value || null
      }, key);
    };

    const containers = root.querySelectorAll('[role="radiogroup"],[role="group"],[role="tablist"]');
    console.log('[ToggleGroup] Container candidates found:', containers.length);
    containers.forEach(process);
  }

  // 5. Checkboxes (native + custom)
  _detectCheckboxes(root) {
    root.querySelectorAll('input[type="checkbox"],[role="checkbox"]').forEach(el => {
      if (!isElementVisible(el) || el.disabled) return;
      const native = el.tagName === 'INPUT';
      this._add({
        fieldType: 'checkbox',
        id: el.id || null,
        name: el.name || null,
        tag: el.tagName.toLowerCase(),
        inputType: native ? 'checkbox' : 'custom-checkbox',
        label: resolveLabel(el),
        placeholder: null,
        ariaLabel: el.getAttribute('aria-label') || null,
        section: findSection(el),
        options: null,
        required: el.required || el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        domPath: getDOMPath(el),
        value: native ? (el.checked ? 'checked' : 'unchecked') : (el.getAttribute('aria-checked') || null)
      });
    });
  }

  // 6. Radio groups (grouped by name)
  _detectRadios(root) {
    const map = new Map();
    // Do NOT filter by isElementVisible — styled radio buttons hide the native input
    root.querySelectorAll('input[type="radio"]').forEach(el => {
      if (el.disabled) return;
      const key = el.name || getDOMPath(el.parentElement);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(el);
    });

    map.forEach((radios, groupName) => {
      // Skip groups where no radio is inside a visible container
      const first = radios[0];
      const container = first.closest('fieldset') || first.parentElement;
      if (!isElementVisible(container)) return;

      const options = radios.map(r => ({
        // Prefer the label text over raw value
        text: (() => {
          const lbl = document.querySelector(`label[for="${r.id}"]`);
          if (lbl) {
            const clone = lbl.cloneNode(true);
            clone.querySelectorAll('input').forEach(n => n.remove());
            return clone.textContent.trim() || r.value;
          }
          return r.value;
        })(),
        value: r.value,
        selected: r.checked
      }));

      this._add({
        fieldType: 'radio',
        id: groupName,
        name: groupName,
        tag: 'input',
        inputType: 'radio',
        label: findSection(first) || groupName,
        placeholder: null,
        ariaLabel: null,
        section: findSection(first),
        options,
        required: first.required || first.hasAttribute('required'),
        domPath: getDOMPath(container),
        value: (options.find(o => o.selected) || {}).value || null
      }, `radio|${groupName}`);
    });
  }

  // 7. Pattern Dropdowns — React Select and class-based dropdowns (no ARIA roles)
  _detectPatternDropdowns(root) {
    let count = 0;
    const processed = new Set();

    root.querySelectorAll('input[id^="react-select-"]').forEach(input => {
      // Walk up to find the container div with "container" in its class
      let container = input.parentElement;
      for (let i = 0; i < 6 && container && container !== document.body; i++) {
        if (/select.*container|container.*select/i.test(container.className || '')) break;
        container = container.parentElement;
      }
      if (!container || container === document.body) container = input.closest('[class*="select"]') || input.parentElement;
      if (!container || processed.has(container) || !isElementVisible(container)) return;
      processed.add(container);
      count++;

      const valueEl = container.querySelector('[class*="single-value"],[class*="singleValue"],[class*="placeholder"]');
      const val = (valueEl && !/placeholder/i.test(valueEl.className)) ? valueEl.textContent.trim() : null;

      console.log('[PatternDropdown] react-select ADD — id:', input.id, '| value:', val);
      this._add({
        fieldType: 'dropdown',
        id: input.id || null,
        name: input.name || null,
        tag: container.tagName.toLowerCase(),
        inputType: 'react-select',
        // resolveLabel(input) fails because input is nested deep; try container's siblings too
        label: resolveLabel(input) || resolveLabel(container) || findSection(container),
        placeholder: input.placeholder || null,
        ariaLabel: input.getAttribute('aria-label') || null,
        section: findSection(container),
        options: null,
        required: false,
        domPath: getDOMPath(container),
        value: val
      }, `react-select|${input.id}`);
    });

    console.log('[PatternDropdown] total:', count);
  }

  // 8. Pattern Toggles — class-based toggle groups (no ARIA roles)
  _detectPatternToggles(root) {
    let count = 0;
    const ACTIVE = /\b(active|selected|checked|current)\b/i;
    // Informational sections that are NOT user input controls
    const EXCLUDE_TEXT = /\b(policy|rules|fees|secure|insurance|summary|journey|penalty|cancel|fare|baggage|coupon|promo)\b/i;
    const seen = new Set();

    // Check if a container is near actual form fields (within 3 parent levels)
    const hasFormContext = el => {
      let cur = el.parentElement;
      for (let i = 0; i < 3 && cur && cur !== document.body; i++) {
        if (cur.querySelector('input:not([type="hidden"]),select,textarea,[id^="react-select-"]')) return true;
        cur = cur.parentElement;
      }
      return false;
    };

    // Check if container has at least one signal that it's interactive
    const hasInteractionSignal = el => {
      // Hidden input inside (common in custom toggles)
      if (el.querySelector('input')) return true;
      // aria-selected or aria-checked anywhere inside
      if (el.querySelector('[aria-selected],[aria-checked]')) return true;
      // pointer cursor on any direct visible child
      return Array.from(el.children).some(c =>
        isElementVisible(c) && window.getComputedStyle(c).cursor === 'pointer'
      );
    };

    const isSelected = c => {
      if (ACTIVE.test(c.className || '')) return true;
      if (c.getAttribute('aria-checked') === 'true') return true;
      const cs = window.getComputedStyle(c);
      if (cs.fontWeight === '700' || cs.fontWeight === 'bold') return true;
      const bg = cs.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return true;
      return false;
    };

    const tryGroup = container => {
      if (seen.has(container) || !isElementVisible(container)) return;
      if (container.querySelectorAll('*').length > 30) return;

      const children = Array.from(container.children).filter(isElementVisible);
      if (children.length < 2) return;

      // All children must be short text
      if (!children.every(c => {
        const t = c.textContent.trim();
        return t.length > 0 && t.length < 40;
      })) return;

      // At least one child is selected (class or style-based)
      if (!children.some(isSelected)) return;

      // Must be near a real form field
      if (!hasFormContext(container)) return;

      // Must have an interaction signal
      if (!hasInteractionSignal(container)) return;

      // Skip if label or section is an informational keyword
      const labelText = (resolveLabel(container) || findSection(container) || '').toLowerCase();
      if (EXCLUDE_TEXT.test(labelText)) return;

      const key = getGroupKey(container);
      if (this.groups.has(key)) return;
      seen.add(container);
      this.groups.add(key);
      count++;

      const options = children.map(c => ({
        text: c.textContent.trim(),
        value: c.getAttribute('data-value') || c.getAttribute('value') || c.textContent.trim(),
        selected: isSelected(c)
      }));

      console.log('[PatternToggle] ADD:', container.className.slice(0, 50), '| options:', options.map(o => o.text));
      this._add({
        fieldType: 'toggle',
        id: container.id || null,
        name: null,
        tag: container.tagName.toLowerCase(),
        inputType: 'pattern-toggle',
        label: resolveLabel(container) || findSection(container),
        placeholder: null,
        ariaLabel: container.getAttribute('aria-label') || null,
        section: findSection(container),
        options,
        required: false,
        domPath: getDOMPath(container),
        value: (options.find(o => o.selected) || {}).value || null
      }, key);
    };

    // Strategy A: container has explicit toggle/gender/cabin class
    const HINT_CLS = /\b(toggle|gender|cabin|class|traveller|pax.?type|trip.?type|seat.?type)\b/i;
    root.querySelectorAll('[class]').forEach(el => {
      if (HINT_CLS.test(el.className)) tryGroup(el);
    });

    // Strategy B: small container anywhere with active-child pattern
    root.querySelectorAll('div,ul').forEach(tryGroup);

    console.log('[PatternToggle] total:', count);
  }

  // 9. Pattern Checkboxes — class-based checkboxes (no ARIA roles)
  _detectPatternCheckboxes(root) {
    let count = 0;
    const CHECKED = /\b(checked|active|selected)\b/i;
    const seen = new Set();

    root.querySelectorAll('[class]').forEach(el => {
      if (!/\bcheckbox\b/i.test(el.className)) return;
      if (el.tagName === 'INPUT') return;           // native, handled already
      if (!isElementVisible(el) || seen.has(el)) return;
      const native = el.querySelector('input[type="checkbox"]');
      if (native && isElementVisible(native)) return; // skip wrappers over visible native checkboxes
      seen.add(el);
      count++;

      const isChecked = CHECKED.test(el.className) || el.getAttribute('aria-checked') === 'true';
      const labelText = el.textContent.trim().slice(0, 80) || null;

      console.log('[PatternCheckbox] ADD:', el.className.slice(0, 50), '| checked:', isChecked, '| label:', labelText);
      this._add({
        fieldType: 'checkbox',
        id: el.id || null,
        name: null,
        tag: el.tagName.toLowerCase(),
        inputType: 'pattern-checkbox',
        label: resolveLabel(el) || labelText,
        placeholder: null,
        ariaLabel: el.getAttribute('aria-label') || null,
        section: findSection(el),
        options: null,
        required: false,
        domPath: getDOMPath(el),
        value: isChecked ? 'checked' : 'unchecked'
      });
    });

    console.log('[PatternCheckbox] total:', count);
  }

  // Add field — dedup by key
  _add(field, key) {
    const k = key || field.domPath;
    if (!this.fields.has(k)) this.fields.set(k, field);
  }

  // MutationObserver — 2-second window for dynamic content
  _observe() {
    return new Promise(resolve => {
      this.observer = new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) this._scanRoot(node);
        }));
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { this.observer.disconnect(); resolve(); }, 2000);
    });
  }

  // Build output — no URL, no userAgent
  _buildResult() {
    const fields = Array.from(this.fields.values());
    console.group('[AutofillScanner] Fields before buildResult (' + fields.length + ' total)');
    fields.forEach((f, i) => console.log(i, f.fieldType, '|', f.label || f.ariaLabel || '(no label)', '|', f.domPath));
    console.groupEnd();
    const typeSummary = fields.reduce((acc, f) => {
      acc[f.fieldType] = (acc[f.fieldType] || 0) + 1;
      return acc;
    }, {});
    return {
      provider: extractProvider(window.location.href),
      scannedAt: new Date().toISOString(),
      fields,
      metadata: {
        totalFields: fields.length,
        scanDuration: Date.now() - this.startTime,
        typeSummary
      }
    };
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
    this.fields.clear();
    this.groups.clear();
  }
}

function highlightDetectedFields(fields) {
  fields.forEach(f => {
    try {
      const el = document.querySelector(f.domPath);
      if (!el) return;
      el.style.outline = '2px solid #4CAF50';
      setTimeout(() => { el.style.outline = ''; }, 3000);
    } catch { /* skip */ }
  });
}
