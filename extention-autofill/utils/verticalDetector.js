// ========================================
// Utility — Vertical Detector
// ========================================
// Determines the search vertical (flight, hotel, train, bus, cab)
// from scanned field labels and placeholders.
//
// Called only when detectMode() returns "search".
//
// Strategy: first-match wins across verticals in priority order.
// "flight" is the default fallback since it is the most common case.
// ========================================
(function () {
  'use strict';

  /** Signal map: vertical → keywords to match */
  const VERTICAL_SIGNALS = {
    hotel: ['check-in', 'check-out', 'checkin', 'checkout', 'guest', 'room', 'hotel'],
    train: ['station', 'train', 'pnr', 'berth', 'coach'],
    bus:   ['bus', 'pickup', 'drop', 'boarding', 'bus stop'],
    cab:   ['ride', 'cab', 'driver', 'pick up', 'drop off', 'taxi'],
    // flight is the default — no signals needed
  };

  /**
   * Detect the search vertical from scanned fields AND page URL/title.
   * URL/title is checked first (more reliable), then field text signals.
   *
   * @param {Array<{ label?: string|null, placeholder?: string|null }>} fields
   * @returns {"flight" | "hotel" | "train" | "bus" | "cab"}
   */
  function detectVertical(fields) {
    const { Logger } = window.TravelID;

    // ── Primary: URL + page title (works even before scanning) ──────────────
    const pageText = `${window.location.href} ${document.title}`.toLowerCase();

    // Ordered by specificity: more specific verticals checked before "hotel" etc.
    const URL_VERTICAL_MAP = [
      { vertical: 'train', signals: ['train', '/rail', 'irctc'] },
      { vertical: 'bus',   signals: ['/bus', 'busticket', 'redbus'] },
      { vertical: 'cab',   signals: ['/cab', '/taxi', 'ola.com', 'uber.com'] },
      { vertical: 'hotel', signals: ['hotel', '/stay', 'hostel'] },
      { vertical: 'flight', signals: ['flight', '/air', 'airline'] },
    ];

    for (const { vertical, signals } of URL_VERTICAL_MAP) {
      if (signals.some(s => pageText.includes(s))) {
        Logger.info(`[VerticalDetector] URL/title matched → vertical="${vertical}"`);
        return vertical;
      }
    }

    // ── Secondary: field text signals ────────────────────────────────────────
    const fieldTexts = fields.map(f => {
      const label       = (f.label       ?? '').toLowerCase().trim();
      const placeholder = (f.placeholder ?? '').toLowerCase().trim();
      return `${label} ${placeholder}`;
    });

    for (const [vertical, signals] of Object.entries(VERTICAL_SIGNALS)) {
      for (const text of fieldTexts) {
        for (const signal of signals) {
          if (text.includes(signal)) {
            Logger.info(`[VerticalDetector] field signal "${signal}" → vertical="${vertical}"`);
            return vertical;
          }
        }
      }
    }

    Logger.info('[VerticalDetector] no signals matched → vertical="flight" (default)');
    return 'flight';
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.detectVertical = detectVertical;
})();
