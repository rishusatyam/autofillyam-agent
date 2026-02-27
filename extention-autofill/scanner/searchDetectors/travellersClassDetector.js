// ========================================
// Travel Class Detector — Async Version
// Opens Travellers dropdown and waits for it to be ready
// Returns popup element for field scanning
// ========================================

(function () {
  'use strict';

  const TRIGGER_KEYWORDS = ['traveller', 'passenger', 'class'];
  const MAX_WAIT_MS = 2000;
  const POLL_INTERVAL_MS = 100;

  /**
   * Detect and open travellers popup, then wait for it to be ready.
   * @param {Element[]} blocks
   * @returns {Promise<Element|null>} - Popup element or null if not found
   */
  async function detectAndOpenTravellersPopup(blocks) {
    const { extractSearchLabel, Logger } = window.TravelID || {};
    if (!blocks || !extractSearchLabel) return null;

    Logger?.group('[TravellersDetector] Starting detection');

    for (const block of blocks) {
      const label = extractSearchLabel(block);
      if (!label) continue;

      const norm = label.toLowerCase();
      if (!isTrigger(norm)) continue;

      Logger?.info('[TravellersDetector] Trigger found:', label);

      const container = resolveContainer(block);
      if (!container) {
        Logger?.warn('[TravellersDetector] Container not found');
        continue;
      }

      const input = container.querySelector('input');
      logState(container, 'Before interaction');

      // 🔑 MAIN TRIGGER → focus input
      if (input) {
        input.focus();
        input.dispatchEvent(new Event('focus', { bubbles: true }));
        Logger?.debug('[TravellersDetector] Input focused');
      }

      // 🖱️ pointer events (React friendly)
      safeClick(container);

      // Wait for popup to open and be ready
      const popup = await waitForPopup(container);
      
      if (popup) {
        Logger?.info('[TravellersDetector] ✅ Popup opened and ready');
        Logger?.groupEnd();
        return popup;
      } else {
        Logger?.warn('[TravellersDetector] ❌ Popup failed to open');
      }

      break;
    }

    Logger?.groupEnd();
    return null;
  }

  /**
   * Wait for popup to open and become interactive.
   * @param {Element} container
   * @returns {Promise<Element|null>}
   */
  async function waitForPopup(container) {
    const { Logger } = window.TravelID || {};
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkPopup = () => {
        const elapsed = Date.now() - startTime;

        // Check if popup is open
        const openStatus = isOpen(container);
        Logger?.debug(`[TravellersDetector] Check ${Math.floor(elapsed/100)}: isOpen=${openStatus}, classes=${container.className}`);
        
        if (openStatus) {
          logState(container, 'Popup opened');
          
          // Find the popup element
          const popup = findPopupElement();
          Logger?.debug('[TravellersDetector] Popup element found:', popup ? popup.className : 'null');
          
          if (popup) {
            // Check if popup has rendered content (counters or class buttons)
            const hasContent = popup.querySelector('[class*="adult" i], [class*="child" i], [class*="economy" i], [class*="class" i]');
            Logger?.debug('[TravellersDetector] Has content:', !!hasContent);
            
            if (hasContent) {
              Logger?.debug('[TravellersDetector] Popup content detected');
              resolve(popup);
              return;
            } else {
              Logger?.debug('[TravellersDetector] Popup found but no content yet, continuing...');
            }
          } else {
            Logger?.debug('[TravellersDetector] isOpen=true but popup element not found, continuing...');
          }
        }

        // Timeout check
        if (elapsed >= MAX_WAIT_MS) {
          Logger?.warn(`[TravellersDetector] Timeout after ${elapsed}ms`);
          resolve(null);
          return;
        }

        // Continue polling
        setTimeout(checkPopup, POLL_INTERVAL_MS);
      };

      // Start checking after initial delay
      setTimeout(checkPopup, POLL_INTERVAL_MS);
    });
  }

  /**
   * Find the popup/modal element in the DOM.
   * @returns {Element|null}
   */
  function findPopupElement() {
    // Try multiple strategies to find the popup
    return (
      document.querySelector('[class*="traveller" i][class*="popup" i]') ||
      document.querySelector('[class*="traveller" i][class*="modal" i]') ||
      document.querySelector('[class*="traveller" i][class*="dropdown" i]') ||
      document.querySelector('[role="dialog"]') ||
      document.querySelector('.activeWidget')
    );
  }

  // ─────────────────────────────

  function isTrigger(text) {
    return (text.includes('traveller') || text.includes('passenger')) && text.includes('class');
  }

  function resolveContainer(block) {
    return (
      block.closest('[data-cy*="traveller" i]') ||
      block.closest('[class*="flightTravllers" i]') ||
      block.closest('[class*="travell" i]')
    );
  }

  function safeClick(el) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function isOpen(container) {
    const hasActiveClass = container.classList.contains('activeWidget');
    const hasOpenElement = !!document.querySelector('[class*="traveller" i][class*="open" i]');
    const hasDialog = !!document.querySelector('[role="dialog"]');
    
    return hasActiveClass || hasOpenElement || hasDialog;
  }

  function logState(el, stage) {
    const { Logger } = window.TravelID || {};
    Logger?.debug(`[TravellersTest] ${stage}`, {
      classes: el.className,
      ariaExpanded: el.getAttribute('aria-expanded'),
    });
  }

  // ─────────────────────────────

  window.TravelID = window.TravelID || {};
  window.TravelID.detectAndOpenTravellersPopup = detectAndOpenTravellersPopup;
  // Backward compatibility
  window.TravelID.detectAndClickTravellers = detectAndOpenTravellersPopup;

})();