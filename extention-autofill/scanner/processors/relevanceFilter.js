// ========================================
// Processor — Relevance Filter
// ========================================
// Config-driven filter. Detectors produce ALL fields;
// this processor decides which ones are relevant for booking.
// ========================================
(function () {
  'use strict';

  // --------------- CONFIG ---------------

  /**
   * Sections that definitely contain noise — all fields inside are dropped.
   * @type {string[]}
   */
  const IGNORE_SECTIONS = [
    'insurance',
    'policy',
    'upgrade',
    'add-on',
    'addon',
    'promo',
    'fare rules',
    'secure trip',
    'trip secure',
    'fare upgrade',
    'benefits',
    'protection',
    'cover',
    'covid',
    'cancellation',
  ];

  /**
   * Label/placeholder substrings that indicate a noise field.
   * @type {string[]}
   */
  const IGNORE_LABELS = [
    'coupon',
    'promo code',
    'discount',
    'apply',
    'redeem',
    'fare upgrade',
    'insurance',
    'secure',
    'protect',
    'cancel',
    'flexible',
    'flexibility',
    'add-on',
    'upgrade',
  ];

  /**
   * Sections that reliably contain booking data — always keep.
   * @type {string[]}
   */
  const KEEP_SECTIONS = [
    'traveller',
    'traveler',
    'passenger',
    'adult',
    'contact',
    'booking',
    'details',
    'payment',
    'guest',
    'customer',
    'personal',
    'information',
    'user',
    'profile',
    'billing',
    'delivery',
    'address',
    'emergency',
  ];

  /**
   * Label/placeholder substrings that indicate booking-relevant data.
   * @type {string[]}
   */
  const KEEP_LABELS = [
    // Name & identity
    'name', 'first', 'last', 'middle', 'title', 'salutation', 'prefix', 'suffix',
    // Contact
    'email', 'phone', 'mobile',
    // Demographics
    'gender', 'age', 'date of birth', 'dob',
    // Travel docs
    'passport', 'nationality', 'country code', 'country',
    // Address
    'address', 'city', 'state', 'zip', 'postal', 'code',
    // Dates
    'birth', 'expiry', 'issue', 'valid',
    // Loyalty
    'frequent flyer', 'frequent', 'flyer', 'airline', 'loyalty',
    'membership', 'ffn', 'miles',
    // Misc booking
    'confirm', 'meal', 'seat', 'baggage', 'remarks',
  ];

  // --------------- IMPLEMENTATION ---------------

  /**
   * Return true if the raw field should pass through to the pipeline.
   *
   * @param {{ section?: string|null, label?: string|null, placeholder?: string|null }} field
   * @returns {boolean}
   */
  function isRelevantField(field) {
    const section = (field.section || '').toLowerCase();
    const label = (field.label || '').toLowerCase();
    const ph = (field.placeholder || '').toLowerCase();

    // Hard block on section
    for (const s of IGNORE_SECTIONS) {
      if (section.includes(s)) return false;
    }

    // Hard block on label/placeholder
    for (const ig of IGNORE_LABELS) {
      if (label.includes(ig) || ph.includes(ig)) return false;
    }

    // Definite keep on section
    for (const s of KEEP_SECTIONS) {
      if (section.includes(s)) return true;
    }

    // Definite keep on label/placeholder
    for (const kl of KEEP_LABELS) {
      if (label.includes(kl) || ph.includes(kl)) return true;
    }

    // No strong signal either way — include by default
    return true;
  }

  window.TravelID = window.TravelID || {};
  window.TravelID.isRelevantField = isRelevantField;

  // Expose config for runtime extension by host page / tests
  window.TravelID.relevanceConfig = {
    IGNORE_SECTIONS,
    IGNORE_LABELS,
    KEEP_SECTIONS,
    KEEP_LABELS,
  };
})();
