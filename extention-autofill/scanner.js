// ========================================
// DOM Scanner V2 - Production Ready
// ========================================
// Detects only relevant booking fields
// Generates stable field IDs
// Sends clean payload to backend API
// ========================================

class DOMScanner {
  constructor() {
    this.fields = new Map(); // fieldId → field object
    this.radioGroups = new Map(); // groupName → radio array
    this.processedElements = new Set(); // avoid duplicates
    this.formBoundary = null;
    this.provider = null;
    this.fieldIndex = 0; // for stable ID generation
    this.startTime = null;
  }

  async scan() {
    this.startTime = Date.now();
    this.fields.clear();
    this.radioGroups.clear();
    this.processedElements.clear();
    this.provider = extractProvider(window.location.href);
    this.fieldIndex = 0;

    console.group('[Scanner V2] Starting scan for:', this.provider);
    
    // Step 1: Find main booking form boundary
    this.formBoundary = findFormBoundary();
    console.log('Form boundary:', this.formBoundary?.tagName, this.formBoundary?.className?.substring(0, 50));

    // Step 2: Run all detectors within boundary
    await this._detectAllFields();

    // Step 3: Group radio buttons
    this._groupRadioButtons();

    // Step 4: Remove duplicates
    this._removeDuplicates();

    // Step 5: Generate stable field IDs
    await this._generateFieldIds();

    // Step 6: Build final result
    const result = this._buildResult();
    
    console.log('Total fields detected:', result.fields.length);
    console.log('Type breakdown:', result.metadata.typeSummary);
    console.groupEnd();

    return result;
  }

  // ========================================
  // FIELD DETECTION
  // ========================================

  async _detectAllFields() {
    const root = this.formBoundary || document.body;

    // Text inputs & textareas
    this._detectTextInputs(root);

    // Native select dropdowns
    this._detectNativeDropdowns(root);

    // Custom dropdowns (React Select, ARIA combobox)
    this._detectCustomDropdowns(root);

    // Radio buttons (native - will be grouped later)
    this._detectRadioButtons(root);

    // Checkboxes
    this._detectCheckboxes(root);

    // Observe for 1.5s to catch dynamically loaded fields
    await this._observeDOM(1500);
  }

  _detectTextInputs(root) {
    const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'checkbox', 'radio']);
    
    root.querySelectorAll('input, textarea').forEach(el => {
      // Skip non-text inputs
      if (el.tagName === 'INPUT' && SKIP_TYPES.has(el.type)) return;
      
      // Skip React Select hidden inputs (handled separately)
      if (/^react-select-/.test(el.id || '')) return;
      
      // Only interactable fields
      if (!isInteractable(el)) return;
      
      // Skip if already processed
      if (this.processedElements.has(el)) return;
      this.processedElements.add(el);

      const field = {
        type: 'text',
        label: resolveLabel(el),
        placeholder: el.placeholder || null,
        section: findSection(el),
        options: [],
        _element: el  // Used for duplicate detection
      };

      // Relevance filter
      if (!isRelevantField(field)) return;

      this.fields.set(this._generateKey(el), field);
    });
  }

  _detectNativeDropdowns(root) {
    root.querySelectorAll('select').forEach(el => {
      if (!isInteractable(el)) return;
      if (this.processedElements.has(el)) return;
      this.processedElements.add(el);

      const options = Array.from(el.options)
        .filter(opt => opt.value || opt.textContent.trim())
        .map(opt => opt.textContent.trim())
        .filter(text => text.length > 0);

      const field = {
        type: 'dropdown',
        label: resolveLabel(el),
        placeholder: null,
        section: findSection(el),
        options: options,
        _element: el  // Used for duplicate detection
      };

      if (!isRelevantField(field)) return;

      this.fields.set(this._generateKey(el), field);
    });
  }

  _detectCustomDropdowns(root) {
    const processed = new Set();

    // React Select dropdowns
    root.querySelectorAll('input[id^="react-select-"]').forEach(input => {
      let container = input.parentElement;
      
      // Find the select container
      for (let i = 0; i < 6 && container && container !== document.body; i++) {
        if (/select.*container|container.*select/i.test(container.className || '')) break;
        container = container.parentElement;
      }
      
      if (!container || container === document.body) {
        container = input.closest('[class*="select"]') || input.parentElement;
      }
      
      if (!container || processed.has(container)) return;
      if (!isElementVisible(container)) return;
      processed.add(container);

      if (this.processedElements.has(container)) return;
      this.processedElements.add(container);

      // Get current value
      const valueEl = container.querySelector('[class*="single-value"],[class*="singleValue"]');
      const currentValue = valueEl ? valueEl.textContent.trim() : null;

      const field = {
        type: 'dropdown',
        label: resolveLabel(input) || resolveLabel(container) || findSection(container),
        placeholder: input.placeholder || null,
        section: findSection(container),
        options: [],
        _element: container  // Used for duplicate detection
      };

      if (!isRelevantField(field)) return;

      this.fields.set(input.id || this._generateKey(container), field);
    });

    // ARIA combobox/listbox
    root.querySelectorAll('[role="combobox"],[aria-haspopup="listbox"]').forEach(el => {
      if (processed.has(el)) return;
      if (!isElementVisible(el)) return;
      if (el.querySelector('input, select')) return; // Skip wrappers
      processed.add(el);

      if (this.processedElements.has(el)) return;
      this.processedElements.add(el);

      const field = {
        type: 'dropdown',
        label: resolveLabel(el),
        placeholder: el.getAttribute('placeholder') || null,
        section: findSection(el),
        options: [],
        _element: el  // Used for duplicate detection
      };

      if (!isRelevantField(field)) return;

      this.fields.set(this._generateKey(el), field);
    });
  }

  _detectRadioButtons(root) {
    // Collect all radio inputs (including hidden ones for styled radios)
    root.querySelectorAll('input[type="radio"]').forEach(el => {
      if (el.disabled) return;
      
      const groupName = el.name || this._generateKey(el.closest('[role="radiogroup"]') || el.parentElement);
      
      if (!this.radioGroups.has(groupName)) {
        this.radioGroups.set(groupName, []);
      }
      
      this.radioGroups.get(groupName).push(el);
    });

    // Also check for ARIA radio groups
    root.querySelectorAll('[role="radiogroup"]').forEach(group => {
      if (!isElementVisible(group)) return;
      
      const radios = group.querySelectorAll('[role="radio"]');
      if (radios.length < 2) return;

      const groupKey = this._generateKey(group);
      const radioArray = [];

      radios.forEach(radio => {
        if (!isElementVisible(radio)) return;
        radioArray.push({
          element: radio,
          label: radio.textContent.trim() || radio.getAttribute('aria-label') || '',
          value: radio.getAttribute('value') || radio.textContent.trim(),
          checked: radio.getAttribute('aria-checked') === 'true'
        });
      });

      if (radioArray.length >= 2) {
        this.radioGroups.set(groupKey, radioArray);
      }
    });
  }

  _detectCheckboxes(root) {
    root.querySelectorAll('input[type="checkbox"], [role="checkbox"]').forEach(el => {
      if (!isInteractable(el)) return;
      if (this.processedElements.has(el)) return;
      this.processedElements.add(el);

      const isNative = el.tagName === 'INPUT';
      const isChecked = isNative ? el.checked : (el.getAttribute('aria-checked') === 'true');

      const field = {
        type: 'checkbox',
        label: resolveLabel(el),
        placeholder: null,
        section: findSection(el),
        options: ['checked', 'unchecked'],
        _element: el  // Used for duplicate detection
      };

      if (!isRelevantField(field)) return;

      this.fields.set(this._generateKey(el), field);
    });
  }

  // ========================================
  // POST-PROCESSING
  // ========================================

  _groupRadioButtons() {
    this.radioGroups.forEach((radios, groupName) => {
      if (radios.length < 2) return;

      // Check if at least one radio is in a visible container
      const firstRadio = radios[0].element || radios[0];
      const container = firstRadio.closest('fieldset') || firstRadio.parentElement;
      if (!isElementVisible(container)) return;

      // Build options array
      const options = radios.map(radio => {
        const el = radio.element || radio;
        let label = '';
        let value = '';
        let checked = false;

        if (el.tagName === 'INPUT') {
          // Native radio
          const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          if (labelEl) {
            const clone = labelEl.cloneNode(true);
            clone.querySelectorAll('input').forEach(n => n.remove());
            label = clone.textContent.trim();
          } else {
            label = resolveLabel(el) || el.value;
          }
          value = el.value;
          checked = el.checked;
        } else {
          // ARIA radio
          label = radio.label || '';
          value = radio.value || '';
          checked = radio.checked || false;
        }

        return {
          text: label || value,
          value: value,
          selected: checked
        };
      });

      const field = {
        type: 'radio',
        label: resolveLabel(firstRadio) || findSection(firstRadio) || groupName,
        placeholder: null,
        section: findSection(firstRadio),
        options: options.map(opt => opt.text),
        _element: container  // Used for duplicate detection
      };

      if (!isRelevantField(field)) return;

      this.fields.set(`radio_${groupName}`, field);
    });
  }

  _removeDuplicates() {
    const seen = new Map(); // key: label+section+type → field
    const toRemove = [];

    this.fields.forEach((field, key) => {
      const dupKey = `${field.type}|${(field.label || '').toLowerCase()}|${(field.section || '').toLowerCase()}`;
      
      if (seen.has(dupKey)) {
        // Duplicate found - keep the most visible/interactable one
        const existing = seen.get(dupKey);
        const existingEl = existing._element;
        const currentEl = field._element;

        // Prefer element with ID
        if (!existingEl.id && currentEl.id) {
          toRemove.push(seen.get(dupKey)._key);
          seen.set(dupKey, field);
          field._key = key;
        } else {
          toRemove.push(key);
        }
      } else {
        seen.set(dupKey, field);
        field._key = key;
      }
    });

    // Remove duplicates
    toRemove.forEach(key => this.fields.delete(key));
  }

  async _generateFieldIds() {
    const fieldsArray = Array.from(this.fields.values());
    
    for (let i = 0; i < fieldsArray.length; i++) {
      const field = fieldsArray[i];
      field.fieldId = await generateFieldId(
        this.provider,
        field.label,
        field.placeholder,
        field.section,
        field.type,
        i
      );
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  _generateKey(el) {
    if (el.id) return el.id;
    if (el.name) return el.name;
    
    // Fallback: position-based key
    const rect = el.getBoundingClientRect();
    return `${el.tagName}_${Math.round(rect.top)}_${Math.round(rect.left)}`;
  }

  _observeDOM(duration) {
    return new Promise(resolve => {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Re-run detectors on new nodes
              this._detectTextInputs(node);
              this._detectNativeDropdowns(node);
              this._detectCustomDropdowns(node);
              this._detectRadioButtons(node);
              this._detectCheckboxes(node);
            }
          });
        });
      });

      observer.observe(this.formBoundary || document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, duration);
    });
  }

  _buildResult() {
    const fields = Array.from(this.fields.values()).map(field => ({
      fieldId: field.fieldId,
      type: field.type,
      label: field.label || '',
      placeholder: field.placeholder || '',
      section: field.section || '',
      options: field.options || []
    }));

    const typeSummary = fields.reduce((acc, f) => {
      acc[f.type] = (acc[f.type] || 0) + 1;
      return acc;
    }, {});

    return {
      provider: this.provider,
      fields: fields,
      metadata: {
        totalFields: fields.length,
        scanDuration: Date.now() - this.startTime,
        typeSummary
      }
    };
  }

  /**
   * Build field registry for autofill engine
   * Returns a map of fieldId → { element, type, options }
   */
  getFieldRegistry() {
    const registry = {};
    
    for (const [key, field] of this.fields.entries()) {
      if (!field.fieldId) continue;
      
      const entry = {
        type: field.type,
        options: field.options || []
      };
      
      // For radio buttons, store all radio elements in the group
      if (field.type === 'radio') {
        const groupName = key.replace('radio_', '');
        const radioElements = this.radioGroups.get(groupName) || [];
        entry.elements = radioElements; // Array of radio elements
        entry.element = field._element; // Container for reference
      } else {
        // For other types, store the single element
        entry.element = field._element;
      }
      
      registry[field.fieldId] = entry;
    }
    
    return registry;
  }

  destroy() {
    this.fields.clear();
    this.radioGroups.clear();
    this.processedElements.clear();
  }
}
