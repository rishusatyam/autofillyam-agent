// ========================================
// Autofill Engine - Production Ready
// ========================================
// Fills form fields based on backend response
// Handles React/Vue controlled inputs
// Resilient and idempotent
// ========================================

/**
 * Main autofill function
 * 
 * @param {Object} response - Backend response { mapping, values }
 * @param {Object} fieldRegistry - Map of fieldId → { element, type, options }
 */
function autofillFromBackend(response, fieldRegistry) {
  if (!response || !response.values || !fieldRegistry) {
    console.warn('⚠️ Autofill: Invalid input', { response, fieldRegistry });
    return;
  }

  console.group('🎯 Starting Autofill');
  console.log('Values to fill:', response.values);
  console.log('Registry size:', Object.keys(fieldRegistry).length);

  let filled = 0;
  let skipped = 0;
  let errors = 0;

  // Iterate over all values from backend
  for (const [fieldId, value] of Object.entries(response.values)) {
    // Skip null/undefined values
    if (value === null || value === undefined) {
      skipped++;
      continue;
    }

    // Find field in registry
    const fieldInfo = fieldRegistry[fieldId];
    if (!fieldInfo) {
      console.warn(`⚠️ Field not in registry: ${fieldId}`);
      skipped++;
      continue;
    }

    try {
      // Fill based on field type
      const success = fillFieldByType(fieldId, value, fieldInfo);
      if (success) {
        filled++;
        console.log(`✅ Filled ${fieldId} (${fieldInfo.type}):`, value);
      } else {
        skipped++;
        console.warn(`⚠️ Could not fill ${fieldId}`);
      }
    } catch (error) {
      errors++;
      console.error(`❌ Error filling ${fieldId}:`, error);
    }
  }

  console.log(`📊 Summary: ${filled} filled, ${skipped} skipped, ${errors} errors`);
  console.groupEnd();

  return { filled, skipped, errors };
}

/**
 * Fill field based on its type
 */
function fillFieldByType(fieldId, value, fieldInfo) {
  const { type, element, elements, options } = fieldInfo;

  switch (type) {
    case 'text':
      return fillTextInput(element, value);
    
    case 'dropdown':
      return fillDropdown(element, value, options);
    
    case 'radio':
      return fillRadio(elements || [element], value, options);
    
    case 'checkbox':
      return fillCheckbox(element, value);
    
    default:
      console.warn(`Unknown field type: ${type}`);
      return false;
  }
}

// ========================================
// TEXT INPUT FILLING
// ========================================

/**
 * Fill text input or textarea
 * Dispatches events for React/Vue compatibility
 */
function fillTextInput(element, value) {
  if (!element || !element.tagName) return false;

  // Set value
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;

  // Use native setter to bypass React's value tracking
  if (element.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
    nativeTextAreaValueSetter.call(element, String(value));
  } else if (element.tagName === 'INPUT' && nativeInputValueSetter) {
    nativeInputValueSetter.call(element, String(value));
  } else {
    element.value = String(value);
  }

  // Dispatch events for framework detection
  dispatchInputEvents(element);

  return true;
}

/**
 * Dispatch input and change events
 * Required for React/Vue/Angular controlled inputs
 */
function dispatchInputEvents(element) {
  // Input event (React listens to this)
  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  
  // Change event (traditional forms)
  element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  
  // Blur event (some forms validate on blur)
  element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
}

// ========================================
// DROPDOWN FILLING
// ========================================

/**
 * Fill native select dropdown
 */
function fillDropdown(element, value, options) {
  if (!element || element.tagName !== 'SELECT') return false;

  const valueStr = String(value).toLowerCase().trim();

  // Try exact match on option text or value
  for (const option of element.options) {
    const optionText = option.textContent.toLowerCase().trim();
    const optionValue = option.value.toLowerCase().trim();

    if (optionText === valueStr || optionValue === valueStr) {
      element.value = option.value;
      dispatchInputEvents(element);
      return true;
    }
  }

  // Try partial match (e.g., "India" matches "India (+91)")
  for (const option of element.options) {
    const optionText = option.textContent.toLowerCase().trim();
    if (optionText.includes(valueStr) || valueStr.includes(optionText)) {
      element.value = option.value;
      dispatchInputEvents(element);
      return true;
    }
  }

  console.warn(`No matching option for "${value}" in dropdown`);
  return false;
}

// ========================================
// RADIO BUTTON FILLING
// ========================================

/**
 * Fill radio button group
 * Clicks the radio that matches the value
 */
function fillRadio(elements, value, options) {
  if (!elements || elements.length === 0) return false;

  const valueStr = String(value).toLowerCase().trim();

  // Try to find matching radio
  for (const el of elements) {
    let radioValue = '';
    let radioLabel = '';

    if (el.tagName === 'INPUT' && el.type === 'radio') {
      // Native radio
      radioValue = (el.value || '').toLowerCase().trim();
      radioLabel = (resolveLabel(el) || '').toLowerCase().trim();
    } else if (el.label || el.value) {
      // ARIA radio (stored as object)
      radioValue = (el.value || '').toLowerCase().trim();
      radioLabel = (el.label || '').toLowerCase().trim();
    } else {
      continue;
    }

    // Check for match
    if (radioValue === valueStr || radioLabel === valueStr || 
        radioValue.includes(valueStr) || radioLabel.includes(valueStr)) {
      
      // Click the radio element
      if (el.tagName === 'INPUT') {
        el.click();
      } else if (el.element) {
        el.element.click();
      } else {
        el.click();
      }
      
      return true;
    }
  }

  console.warn(`No matching radio for "${value}"`);
  return false;
}

// ========================================
// CHECKBOX FILLING
// ========================================

/**
 * Fill checkbox
 * Toggles if current state differs from desired state
 */
function fillCheckbox(element, value) {
  if (!element) return false;

  // Interpret value as boolean
  const desiredState = Boolean(value);
  const currentState = element.checked || element.getAttribute('aria-checked') === 'true';

  // Toggle if states differ (idempotent)
  if (currentState !== desiredState) {
    element.click();
    dispatchInputEvents(element);
  }

  return true;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Resolve label for radio button (reused from utils.js pattern)
 */
function resolveLabel(el) {
  if (!el) return '';
  
  // 1. <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  
  // 2. aria-label
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
  
  // 3. Wrapped in <label>
  const wrapped = el.closest('label');
  if (wrapped) {
    const clone = wrapped.cloneNode(true);
    clone.querySelectorAll('input,select,textarea,button').forEach(n => n.remove());
    const t = clone.textContent.trim();
    if (t) return t;
  }
  
  // 4. Previous sibling
  const prev = el.previousElementSibling;
  if (prev && prev.textContent.trim().length < 80) return prev.textContent.trim();
  
  return '';
}
