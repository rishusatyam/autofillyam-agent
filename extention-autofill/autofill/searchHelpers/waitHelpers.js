// ========================================
// Search Autofill — Wait Helpers
// ========================================
// Async utilities for timing, polling, element waiting, and retry.
//
// Exports on window.TravelID:
//   searchSleep, searchWaitForElement, searchWaitForCondition,
//   searchRetryAction
// ========================================
(function () {
  'use strict';

  /**
   * Sleep for a fixed number of milliseconds.
   *
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function searchSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for a matching element to appear in the DOM.
   * Uses MutationObserver for efficiency with a polling safety net.
   *
   * @param {string}  selector
   * @param {Element} root
   * @param {number}  timeout - ms
   * @returns {Promise<Element|null>}
   */
  function searchWaitForElement(selector, root, timeout) {
    return new Promise(resolve => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      let done = false;

      const finish = (el) => {
        if (done) return;
        done = true;
        observer.disconnect();
        resolve(el);
      };

      const observer = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (found) finish(found);
      });

      observer.observe(root, { childList: true, subtree: true });

      // Safety timeout
      setTimeout(() => {
        finish(root.querySelector(selector) || null);
      }, timeout);
    });
  }

  /**
   * Wait until a predicate function returns a truthy value.
   * Polls at the given interval. Returns the truthy value or null on timeout.
   *
   * @param {() => any} predicate
   * @param {number}    timeout  - ms
   * @param {number}    [interval=100] - ms
   * @returns {Promise<any|null>}
   */
  function searchWaitForCondition(predicate, timeout, interval = 100) {
    return new Promise(resolve => {
      const deadline = Date.now() + timeout;

      const check = () => {
        const result = predicate();
        if (result) return resolve(result);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(check, interval);
      };

      check();
    });
  }

  /**
   * Retry an async action up to `maxRetries` times with delay between attempts.
   *
   * @param {() => Promise<boolean>} action
   * @param {number} [maxRetries=2]  - number of retries (total attempts = 1 + retries)
   * @param {number} [delayMs=300]   - delay between retries
   * @returns {Promise<boolean>}
   */
  async function searchRetryAction(action, maxRetries = 2, delayMs = 300) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ok = await action();
      if (ok) return true;
      if (attempt < maxRetries) {
        await searchSleep(delayMs);
      }
    }
    return false;
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.searchSleep            = searchSleep;
  window.TravelID.searchWaitForElement   = searchWaitForElement;
  window.TravelID.searchWaitForCondition = searchWaitForCondition;
  window.TravelID.searchRetryAction      = searchRetryAction;
})();
