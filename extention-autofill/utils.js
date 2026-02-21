// Utility functions for the extension

// Domain only — strips protocol, www, and path
function extractProvider(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'unknown'; }
}

// Visibility — CSS + dimensions check
function isElementVisible(el) {
  if (!el) return false;
  const s = window.getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Label resolution — 6-step priority chain
function resolveLabel(el) {
  // 1. <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  // 2. aria-label
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
  // 3. aria-labelledby
  const lbId = el.getAttribute('aria-labelledby');
  if (lbId) { const ref = document.getElementById(lbId); if (ref) return ref.textContent.trim(); }
  // 4. Wrapped in <label>
  const wrapped = el.closest('label');
  if (wrapped) {
    const clone = wrapped.cloneNode(true);
    clone.querySelectorAll('input,select,textarea,button').forEach(n => n.remove());
    const t = clone.textContent.trim();
    if (t) return t;
  }
  // 5. Previous sibling short text
  const prev = el.previousElementSibling;
  if (prev && prev.textContent.trim().length < 80) return prev.textContent.trim();
  // 6. Parent's previous sibling short text (label sibling of container pattern)
  if (el.parentElement) {
    const parentPrev = el.parentElement.previousElementSibling;
    if (parentPrev && parentPrev.textContent.trim().length < 80) return parentPrev.textContent.trim();
  }
  return el.placeholder || null;
}

// Nearest section heading for context grouping
function findSection(el) {
  let cur = el.parentElement;
  for (let i = 0; i < 10 && cur; i++, cur = cur.parentElement) {
    if (cur.tagName === 'FIELDSET') {
      const legend = cur.querySelector('legend');
      if (legend) return legend.textContent.trim();
    }
    const h = cur.querySelector('h1,h2,h3,h4,h5,h6');
    if (h) return h.textContent.trim();
  }
  return null;
}

// ========================================
// SCANNER V2 - NEW UTILITIES
// ========================================

/**
 * Generate stable, deterministic field ID
 * Hash of: provider + label + placeholder + section + type + index
 */
async function generateFieldId(provider, label, placeholder, section, type, index) {
  const input = [
    provider || '',
    (label || '').toLowerCase().trim(),
    (placeholder || '').toLowerCase().trim(),
    (section || '').toLowerCase().trim(),
    type || '',
    index.toString()
  ].join('|');
  
  // Simple hash using Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Return first 8 chars prefixed with f_
  return 'f_' + hashHex.substring(0, 8);
}

/**
 * Check if field is relevant for booking (not UI noise)
 * Returns true if field should be included in scan
 */
function isRelevantField(field) {
  const section = (field.section || '').toLowerCase();
  const label = (field.label || '').toLowerCase();
  const placeholder = (field.placeholder || '').toLowerCase();
  
  // IGNORE sections
  const ignoreSections = [
    'insurance', 'policy', 'upgrade', 'add-on', 'addon', 'promo', 
    'fare rules', 'secure trip', 'trip secure', 'fare upgrade',
    'benefits', 'protection', 'cover', 'covid', 'cancellation'
  ];
  
  for (const ignore of ignoreSections) {
    if (section.includes(ignore)) return false;
  }
  
  // IGNORE labels
  const ignoreLabels = [
    'coupon', 'promo code', 'discount', 'apply', 'redeem',
    'fare upgrade', 'insurance', 'secure', 'protect', 'cancel',
    'flexible', 'flexibility', 'add-on', 'upgrade'
  ];
  
  for (const ignore of ignoreLabels) {
    if (label.includes(ignore) || placeholder.includes(ignore)) {
      return false;
    }
  }
  
  // KEEP sections
  const keepSections = [
    'traveller', 'passenger', 'contact', 'booking', 'details',
    'payment', 'guest', 'customer', 'personal', 'information',
    'user', 'profile', 'billing', 'delivery', 'address', 'emergency'
  ];
  
  for (const keep of keepSections) {
    if (section.includes(keep)) return true;
  }
  
  // If no section, check label for booking relevance
  const keepLabels = [
    'name', 'first', 'last', 'middle', 'email', 'phone', 'mobile',
    'gender', 'age', 'date of birth', 'dob', 'passport', 'nationality',
    'country', 'address', 'city', 'state', 'zip', 'postal', 'code',
    'birth', 'expiry', 'issue', 'valid', 'confirm'
  ];
  
  for (const keep of keepLabels) {
    if (label.includes(keep) || placeholder.includes(keep)) {
      return true;
    }
  }
  
  // Default: keep if no strong signals either way
  return true;
}

/**
 * Check if element is interactable (visible, enabled, editable)
 */
function isInteractable(el) {
  if (!el) return false;
  
  // Check disabled/readonly
  if (el.disabled || el.readOnly) return false;
  
  // Check hidden attribute
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  
  // Check visibility
  if (!isElementVisible(el)) return false;
  
  // Check if in viewport tree (rough check - element has offsetParent)
  if (!el.offsetParent && el.tagName !== 'BODY') return false;
  
  return true;
}

/**
 * Find the main booking form container
 * Returns the container element that likely holds booking fields
 */
function findFormBoundary() {
  // 1. Look for <form> tag
  const forms = Array.from(document.querySelectorAll('form'));
  if (forms.length === 1) return forms[0];
  
  // 2. Find form with most input fields
  let maxInputs = 0;
  let bestForm = null;
  
  for (const form of forms) {
    const inputs = form.querySelectorAll('input:not([type="hidden"]),textarea,select').length;
    if (inputs > maxInputs) {
      maxInputs = inputs;
      bestForm = form;
    }
  }
  
  if (bestForm && maxInputs > 3) return bestForm;
  
  // 3. Check if there are multiple sibling sections - scan all if so
  const bodySections = Array.from(document.body.children).filter(el => {
    const tag = el.tagName.toLowerCase();
    const hasInputs = el.querySelectorAll('input:not([type="hidden"]),textarea,select').length > 0;
    return (tag === 'section' || tag === 'div') && hasInputs;
  });
  
  // If multiple sections with inputs at top level, scan entire body
  if (bodySections.length > 1) {
    console.log('Multiple sections detected, scanning entire document');
    return document.body;
  }
  
  // 4. Find container with booking keywords and most inputs
  const keywords = ['booking', 'traveller', 'passenger', 'checkout', 'payment', 'reservation'];
  const containers = [];
  
  for (const keyword of keywords) {
    const elements = document.querySelectorAll(`[class*="${keyword}"], [id*="${keyword}"]`);
    for (const el of elements) {
      const inputs = el.querySelectorAll('input:not([type="hidden"]),textarea,select').length;
      if (inputs >= 3) {
        containers.push({ el, inputs, keyword });
      }
    }
  }
  
  if (containers.length > 0) {
    // If multiple containers found, check if they're siblings - if so, use parent
    if (containers.length > 1) {
      const firstParent = containers[0].el.parentElement;
      const allSameParent = containers.every(c => c.el.parentElement === firstParent);
      if (allSameParent) {
        console.log('Multiple sibling containers detected, using common parent');
        return firstParent || document.body;
      }
    }
    // Sort by input count
    containers.sort((a, b) => b.inputs - a.inputs);
    return containers[0].el;
  }
  
  // 5. Fallback: find any container with 5+ inputs
  const allContainers = document.querySelectorAll('div, section, main');
  for (const container of allContainers) {
    const inputs = container.querySelectorAll('input:not([type="hidden"]),textarea,select').length;
    if (inputs >= 5) {
      return container;
    }
  }
  
  // 6. Last resort: scan entire document
  return document.body;
}
