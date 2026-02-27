// ========================================
// Search Scanner — Orchestrator
// ========================================
// Pipeline: findContainer → waitForHydration → extractBlocks →
//           detectFields → observeDOM → dedupe → generateIds → build
//
// All side-effects delegated to specialist modules:
//   searchProcessors/  — containerFinder, blockExtractor, labelExtractor, searchDedupe
//   searchDetectors/   — locationDetector, dateDetector, counterDetector, toggleDetector
//
// API surface (unchanged for backward compat):
//   scanner = new SearchScanner(vertical)
//   result  = await scanner.scan()
//   reg     = scanner.getFieldRegistry()
//   scanner.destroy()
// ========================================
(function () {
  'use strict';

  /** Max ms to wait for SPA hydration before proceeding */
  const HYDRATION_WAIT = 2000;

  /** Polling interval during hydration wait */
  const HYDRATION_POLL = 200;

  /** Selectors used to detect interactive content during hydration */
  const INTERACTIVE_CHECK =
    '[role="button"],[role="combobox"],[aria-haspopup],[tabindex]:not([tabindex="-1"])';

  // ────────────────────────────────────────────────────────────────────────

  class SearchScanner {
    /**
     * @param {string} vertical - pre-detected vertical ("flight"|"hotel"|etc.)
     */
    constructor(vertical) {
      this.vertical = vertical;

      /** @type {string} */
      this.provider = '';

      /** @type {Element|null} */
      this.container = null;

      /** @type {number} */
      this.startTime = 0;

      /**
       * Detected fields keyed by a stable dedup key (type:normalizedLabel).
       * @type {Map<string, object>}
       */
      this.fields = new Map();

      /**
       * Field registry for autofill: fieldId → { element, type, options, meta }
       * @type {Record<string, object>}
       */
      this._registry = {};
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /**
     * Run the full search scan pipeline.
     * @returns {Promise<object>}
     */
    async scan() {
      const {
        Logger,
        extractProvider,
        findSearchContainer,
        extractSearchBlocks,
        dedupeSearchFields,
      } = window.TravelID;

      this.startTime = Date.now();
      this.fields.clear();
      this._registry = {};

      this.provider = extractProvider(window.location.href);
      Logger.group(`SearchScanner — ${this.provider} / ${this.vertical}`);

      // Step 1: Find the main search container (most specific match)
      this.container = findSearchContainer();
      Logger.debug('Container:', _desc(this.container));

      // Step 2: Wait for SPA hydration (lazy-loaded widgets)
      await this._waitForHydration();

      // Step 3: Extract interactive blocks from the container
      const blocks = extractSearchBlocks(this.container);
      Logger.debug(`Extracted ${blocks.length} interactive blocks`);

      // Step 4: Run all field detectors on the blocks (async for travellers)
      await this._runDetectors(blocks);
      Logger.debug(`Detected ${this.fields.size} fields after detection`);

      // Step 4.5: Remove cross-detector element duplicates
      this._dedupeByElement();

      // Step 5: Observe DOM for dynamically added fields (1s window)
      await this._observeDOM(1000);

      // Step 6: Deduplicate
      dedupeSearchFields(this.fields);
      Logger.debug(`${this.fields.size} fields after dedup`);

      // Step 7: Generate deterministic field IDs
      await this._generateFieldIds();

      // Step 8: Build registry and result
      this._buildRegistry();
      const result = this._buildResult();

      Logger.info(
        `Done — ${result.fields.length} fields in ${result.metadata.scanDuration}ms`,
        result.metadata.typeSummary
      );
      Logger.groupEnd();

      return result;
    }

    /**
     * Return fieldId-keyed registry for the autofill engine.
     * @returns {Record<string, object>}
     */
    getFieldRegistry() {
      return this._registry;
    }

    /** Release DOM references. */
    destroy() {
      this.fields.clear();
      this._registry = {};
      this.container = null;
    }

    // ─── Detection phase ─────────────────────────────────────────────────

    /**
     * Run all search-specific detectors.
     * Each detector skips fields already in this.fields (dedup by key).
     *
     * @param {Element[]} blocks
     * @returns {Promise<void>}
     */
    async _runDetectors(blocks) {
      const {
        detectSearchLocations,
        detectSearchDates,
        detectAndOpenTravellersPopup,
        scanTravellersFields,
        Logger,
      } = window.TravelID;

      // Sync detectors - run immediately
      for (const { key, field } of detectSearchLocations(blocks, this.fields)) {
        this.fields.set(key, field);
      }
      for (const { key, field } of detectSearchDates(blocks, this.fields)) {
        this.fields.set(key, field);
      }

      // Async travellers detector - open popup and scan fields
      Logger?.debug('[SearchScanner] Starting travellers detection...');
      const popup = await detectAndOpenTravellersPopup(blocks);
      
      if (popup) {
        Logger?.debug('[SearchScanner] Popup ready, scanning fields...');
        const travellersFields = scanTravellersFields(popup, this.fields);
        
        for (const { key, field } of travellersFields) {
          this.fields.set(key, field);
        }
        
        Logger?.info(`[SearchScanner] Added ${travellersFields.length} travellers fields`);
      } else {
        Logger?.debug('[SearchScanner] No travellers popup detected');
      }
    }

    /**
     * If multiple detectors claimed the SAME DOM element, keep only
     * the first detection.  Prevents e.g. "Travellers & Class" being
     * registered as both counter and toggle.
     */
    _dedupeByElement() {
      const seen = new Map();
      const toRemove = [];

      this.fields.forEach((field, key) => {
        if (!field._element) return;
        if (seen.has(field._element)) {
          toRemove.push(key);
        } else {
          seen.set(field._element, key);
        }
      });

      toRemove.forEach(k => this.fields.delete(k));
    }

    // ─── SPA hydration wait ──────────────────────────────────────────────

    /**
     * If the container has very few interactive elements, wait for SPA
     * frameworks to hydrate. Uses both MutationObserver + polling for
     * early resolution.
     *
     * @returns {Promise<void>}
     */
    _waitForHydration() {
      const { Logger } = window.TravelID;

      // Already has interactive blocks → no need to wait
      if (this.container.querySelectorAll(INTERACTIVE_CHECK).length >= 2) {
        return Promise.resolve();
      }

      Logger.debug('Waiting for SPA hydration…');

      return new Promise(resolve => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          observer.disconnect();
          resolve();
        };

        const observer = new MutationObserver(() => {
          if (this.container.querySelectorAll(INTERACTIVE_CHECK).length >= 2) {
            done();
          }
        });

        observer.observe(this.container, { childList: true, subtree: true });

        // Polling backup
        const poll = () => {
          if (resolved) return;
          if (this.container.querySelectorAll(INTERACTIVE_CHECK).length >= 2) {
            done();
            return;
          }
          setTimeout(poll, HYDRATION_POLL);
        };
        setTimeout(poll, HYDRATION_POLL);

        // Hard timeout
        setTimeout(done, HYDRATION_WAIT);
      });
    }

    // ─── DOM observation for late fields ─────────────────────────────────

    /**
     * Watch the container for dynamically added subtrees and re-run
     * detectors on each batch of new nodes.
     *
     * @param {number} duration - observation window in ms
     * @returns {Promise<void>}
     */
    _observeDOM(duration) {
      return new Promise(resolve => {
        const observer = new MutationObserver(mutations => {
          let hasNew = false;
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                hasNew = true;
              }
            }
          }
          if (hasNew) {
            // Re-extract blocks and re-run detectors (they skip existing keys)
            const { extractSearchBlocks } = window.TravelID;
            const blocks = extractSearchBlocks(this.container);
            this._runDetectors(blocks);
          }
        });

        observer.observe(this.container, { childList: true, subtree: true });

        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, duration);
      });
    }

    // ─── Field ID generation ─────────────────────────────────────────────

    async _generateFieldIds() {
      const { generateFieldId } = window.TravelID;
      const fieldsArray = Array.from(this.fields.values());

      for (let i = 0; i < fieldsArray.length; i++) {
        const f = fieldsArray[i];
        // Include vertical in ID so flight/"From" ≠ hotel/"From"
        f.fieldId = await generateFieldId(
          `${this.provider}/${this.vertical}`,
          f.label,
          f.placeholder,
          f.section,
          f.type,
          i
        );
      }
    }

    // ─── Registry + Result ───────────────────────────────────────────────

    _buildRegistry() {
      this._registry = {};
      for (const field of this.fields.values()) {
        if (!field.fieldId) continue;
        this._registry[field.fieldId] = {
          type:    field.type,
          element: field._element,
          options: field.options || [],
          meta:    field._meta || {},
        };
      }
    }

    _buildResult() {
      const fields = Array.from(this.fields.values()).map(f => ({
        fieldId:     f.fieldId,
        type:        f.type,
        label:       f.label || '',
        placeholder: f.placeholder || '',
        section:     f.section || 'Search',
        options:     f.options || [],
      }));

      const typeSummary = fields.reduce((acc, f) => {
        acc[f.type] = (acc[f.type] || 0) + 1;
        return acc;
      }, {});

      return {
        provider: this.provider,
        vertical: this.vertical,
        fields,
        metadata: {
          totalFields:  fields.length,
          scanDuration: Date.now() - this.startTime,
          typeSummary,
        },
      };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Short description for debug logs. */
  function _desc(el) {
    if (!el) return '<null>';
    return `<${el.tagName.toLowerCase()} class="${(el.className || '').toString().substring(0, 50)}">`;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.SearchScanner = SearchScanner;
})();
