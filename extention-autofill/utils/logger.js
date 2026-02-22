// ========================================
// Logger — centralized debug output
// ========================================
// All scanner/autofill output flows through here.
// Set LOG_LEVEL to 'none' in production to silence everything.
// ========================================
(function () {
  'use strict';

  /** @typedef {'debug'|'info'|'warn'|'error'|'none'} LogLevel */

  const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 99 };

  /**
   * @type {LogLevel}
   */
  let currentLevel = 'debug';

  const Logger = {
    /**
     * Change the minimum log level at runtime.
     * @param {LogLevel} level
     */
    setLevel(level) {
      if (LEVELS[level] !== undefined) currentLevel = level;
    },

    /**
     * @param {...*} args
     */
    debug(...args) {
      if (LEVELS.debug >= LEVELS[currentLevel]) console.debug('[TravelID]', ...args);
    },

    /**
     * @param {...*} args
     */
    info(...args) {
      if (LEVELS.info >= LEVELS[currentLevel]) console.log('[TravelID]', ...args);
    },

    /**
     * @param {...*} args
     */
    warn(...args) {
      if (LEVELS.warn >= LEVELS[currentLevel]) console.warn('[TravelID]', ...args);
    },

    /**
     * @param {...*} args
     */
    error(...args) {
      if (LEVELS.error >= LEVELS[currentLevel]) console.error('[TravelID]', ...args);
    },

    /**
     * Open a named group. Pass an empty string to use a plain log instead.
     * @param {string} label
     */
    group(label) {
      if (LEVELS.debug >= LEVELS[currentLevel]) console.group(`[TravelID] ${label}`);
    },

    groupEnd() {
      if (LEVELS.debug >= LEVELS[currentLevel]) console.groupEnd();
    },
  };

  window.TravelID = window.TravelID || {};
  window.TravelID.Logger = Logger;
})();
