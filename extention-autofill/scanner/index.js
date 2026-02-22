// ========================================
// Scanner — Orchestrator
// ========================================
// Pipeline: detect → normalize → filter → dedupe → generateIds
//
// All side-effects (DOM queries, MutationObserver, hashing) are
// delegated to the specialist modules; this file just wires them.
// ========================================
(function () {
  'use strict';

  class DOMScanner {
    constructor() {
      /** @type {Map<string, import('./types').RawField>} */
      this.fields = new Map();

      /**
       * groupName → array of radio elements / ARIA radio descriptors
       * @type {Map<string, Array>}
       */
      this.radioGroups = new Map();

      /** @type {Set<Element>} shared across all detectors to prevent double-emit */
      this.processedElements = new Set();

      /** @type {Element|null} */
      this.formBoundary = null;

      /** @type {string} */
      this.provider = '';

      /** @type {number} */
      this.fieldIndex = 0;

      /** @type {number} */
      this.startTime = 0;
    }

    // ─── Public API ────────────────────────────────────────────────────────

    /**
     * Run the full scan pipeline.
     * @returns {Promise<import('./types').ScanResult>}
     */
    async scan() {
      const {
        Logger,
        extractProvider,
        findFormBoundary,
      } = window.TravelID;

      this.startTime = Date.now();
      this.fields.clear();
      this.radioGroups.clear();
      this.processedElements.clear();
      this.fieldIndex = 0;

      this.provider = extractProvider(window.location.href);
      Logger.group(`Scanner — ${this.provider}`);

      // ── Step 1: Find form boundary ──────────────────────────────────────
      this.formBoundary = findFormBoundary();
      Logger.debug(
        'Boundary:',
        this.formBoundary?.tagName,
        (this.formBoundary?.className || '').substring(0, 50)
      );

      // ── Step 2: Detect ──────────────────────────────────────────────────
      this._detect();

      // ── Step 3: Observe DOM for dynamically added fields (1 s window) ───
      await this._observeDOM(1000);

      // ── Step 4: Scrape options for custom dropdowns via MutationObserver ─
      await window.TravelID.scrapeAllPendingOptions(this.fields);

      // ── Step 5: Normalize radio groups into unified field records ────────
      this._normalizeRadioGroups();

      // ── Step 6: Relevance filter ─────────────────────────────────────────
      this._applyRelevanceFilter();

      // ── Step 7: Deduplicate ───────────────────────────────────────────────
      window.TravelID.dedupeFields(this.fields);

      // ── Step 8: Generate stable field IDs ────────────────────────────────
      await this._generateFieldIds();

      // ── Step 9: Build and return result ──────────────────────────────────
      const result = this._buildResult();
      Logger.info(
        `Done — ${result.fields.length} fields in ${result.metadata.scanDuration}ms`,
        result.metadata.typeSummary
      );
      Logger.groupEnd();

      return result;
    }

    /**
     * Build a fieldId-keyed registry for the autofill engine.
     * Called after scan() completes.
     *
     * @returns {import('./types').FieldRegistry}
     */
    getFieldRegistry() {
      /** @type {import('./types').FieldRegistry} */
      const registry = {};

      for (const [key, field] of this.fields.entries()) {
        if (!field.fieldId) continue;

        /** @type {import('./types').RegistryEntry} */
        const entry = {
          type: field.type,
          options: field.options || [],
          element: field._element,
        };

        if (field.type === 'radio') {
          // key format is "radio_<groupName>"
          const groupName = key.replace(/^radio_/, '');
          entry.elements = this.radioGroups.get(groupName) || [];
        }

        registry[field.fieldId] = entry;
      }

      return registry;
    }

    /** Release all retained DOM references. */
    destroy() {
      this.fields.clear();
      this.radioGroups.clear();
      this.processedElements.clear();
    }

    // ─── Detect phase ──────────────────────────────────────────────────────

    _detect() {
      const root = this.formBoundary || document.body;
      this._runDetectorsOn(root);
    }

    /**
     * @param {Element} root
     */
    _runDetectorsOn(root) {
      const {
        detectTextInputs,
        detectDropdowns,
        detectRadioButtons,
        detectCheckboxes,
        detectToggles,
      } = window.TravelID;

      // Text
      for (const { key, field } of detectTextInputs(root, this.processedElements)) {
        this.fields.set(key, field);
      }

      // Dropdowns (native + custom)
      for (const { key, field } of detectDropdowns(root, this.processedElements)) {
        this.fields.set(key, field);
      }

      // Radio buttons — merged into this.radioGroups
      const groups = detectRadioButtons(root, this.processedElements);
      groups.forEach((radios, groupName) => {
        if (!this.radioGroups.has(groupName)) {
          this.radioGroups.set(groupName, radios);
        } else {
          // Merge additional radios found by the DOM observer pass
          const existing = this.radioGroups.get(groupName);
          for (const r of radios) {
            if (!existing.includes(r)) existing.push(r);
          }
        }
      });

      // Checkboxes
      for (const { key, field } of detectCheckboxes(root, this.processedElements)) {
        this.fields.set(key, field);
      }

      // Toggles
      for (const { key, field } of detectToggles(root, this.processedElements)) {
        this.fields.set(key, field);
      }
    }

    // ─── DOM observation ──────────────────────────────────────────────────

    /**
     * Watch the boundary for dynamically added subtrees and run
     * detectors on each new node batch.
     *
     * @param {number} duration  - observation window in ms
     * @returns {Promise<void>}
     */
    _observeDOM(duration) {
      return new Promise((resolve) => {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                this._runDetectorsOn(/** @type {Element} */ (node));
              }
            }
          }
        });

        observer.observe(this.formBoundary || document.body, {
          childList: true,
          subtree: true,
        });

        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, duration);
      });
    }

    // ─── Normalize radio groups ────────────────────────────────────────────

    _normalizeRadioGroups() {
      const { resolveLabel, findSection, isElementVisible } = window.TravelID;

      this.radioGroups.forEach((radios, groupName) => {
        if (radios.length < 2) return;

        const firstRadio = radios[0].element || radios[0];
        const container =
          firstRadio.closest('fieldset') || firstRadio.parentElement;
        if (!isElementVisible(container)) return;

        // Build options array
        const options = radios.map((radio) => {
          const el = radio.element || radio;
          let label = '';
          let value = '';

          if (el.tagName === 'INPUT') {
            const labelEl = el.id
              ? document.querySelector(`label[for="${el.id}"]`)
              : null;
            if (labelEl) {
              const clone = labelEl.cloneNode(true);
              clone.querySelectorAll('input').forEach((n) => n.remove());
              label = clone.textContent.trim();
            } else {
              label = resolveLabel(el) || el.value;
            }
            value = el.value;
          } else {
            label = radio.label || '';
            value = radio.value || '';
          }

          return { text: label || value, value };
        });

        /** @type {import('./types').RawField} */
        const field = {
          type: 'radio',
          label:
            resolveLabel(firstRadio) ||
            findSection(firstRadio) ||
            groupName,
          placeholder: null,
          section: findSection(firstRadio),
          options: options.map((o) => o.text),
          _element: container,
        };

        this.fields.set(`radio_${groupName}`, field);
      });
    }

    // ─── Relevance filter ──────────────────────────────────────────────────

    _applyRelevanceFilter() {
      const { isRelevantField } = window.TravelID;
      for (const [key, field] of this.fields) {
        if (!isRelevantField(field)) this.fields.delete(key);
      }
    }

    // ─── Field ID generation ───────────────────────────────────────────────

    async _generateFieldIds() {
      const { generateFieldId } = window.TravelID;
      const fieldsArray = Array.from(this.fields.values());

      for (let i = 0; i < fieldsArray.length; i++) {
        fieldsArray[i].fieldId = await generateFieldId(
          this.provider,
          fieldsArray[i].label,
          fieldsArray[i].placeholder,
          fieldsArray[i].section,
          fieldsArray[i].type,
          i
        );
      }
    }

    // ─── Build result ──────────────────────────────────────────────────────

    /**
     * @returns {import('./types').ScanResult}
     */
    _buildResult() {
      const fields = Array.from(this.fields.values()).map((f) => ({
        fieldId: f.fieldId,
        type: f.type,
        label: f.label || '',
        placeholder: f.placeholder || '',
        section: f.section || '',
        options: f.options || [],
      }));

      const typeSummary = fields.reduce((acc, f) => {
        acc[f.type] = (acc[f.type] || 0) + 1;
        return acc;
      }, {});

      return {
        provider: this.provider,
        fields,
        metadata: {
          totalFields: fields.length,
          scanDuration: Date.now() - this.startTime,
          typeSummary,
        },
      };
    }
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.DOMScanner = DOMScanner;
})();
