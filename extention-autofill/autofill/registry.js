// ========================================
// Autofill — Field Registry
// ========================================
// Tracks the live DOM elements for every scanned field so the
// autofill engine can look them up cheaply by fieldId.
// ========================================
(function () {
  'use strict';

  /**
   * A thin wrapper around a plain object so callers never touch the
   * raw map directly.  Produced by DOMScanner.getFieldRegistry() and
   * consumed by autofillFromBackend().
   */
  class FieldRegistry {
    constructor() {
      /** @type {import('../scanner/types').FieldRegistry} */
      this._entries = {};
    }

    /**
     * Register or overwrite a field entry.
     *
     * @param {string} fieldId
     * @param {import('../scanner/types').RegistryEntry} entry
     */
    set(fieldId, entry) {
      this._entries[fieldId] = entry;
    }

    /**
     * @param {string} fieldId
     * @returns {import('../scanner/types').RegistryEntry|undefined}
     */
    get(fieldId) {
      return this._entries[fieldId];
    }

    /**
     * Build a registry from a plain fieldId→entry object
     * (the format returned by DOMScanner.getFieldRegistry()).
     *
     * @param {import('../scanner/types').FieldRegistry} plain
     * @returns {FieldRegistry}
     */
    static fromPlain(plain) {
      const r = new FieldRegistry();
      r._entries = plain;
      return r;
    }

    /** @returns {number} */
    get size() {
      return Object.keys(this._entries).length;
    }

    /** @returns {import('../scanner/types').FieldRegistry} */
    toPlain() {
      return this._entries;
    }

    /** Release all DOM element references. */
    clear() {
      this._entries = {};
    }
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.FieldRegistry = FieldRegistry;
})();
