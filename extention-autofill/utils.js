// Utility functions for the extension

// Domain only — strips protocol, www, and path
function extractProvider(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'unknown'; }
}

// Stable CSS selector path for an element
function getDOMPath(el) {
  if (!el || el === document.body) return 'body';
  const path = [];
  let cur = el;
  while (cur && cur !== document.body) {
    let sel = cur.tagName.toLowerCase();
    if (cur.id) { path.unshift(sel + '#' + cur.id); break; }
    const siblings = cur.parentElement
      ? Array.from(cur.parentElement.children).filter(s => s.tagName === cur.tagName)
      : [];
    if (siblings.length > 1) sel += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
    path.unshift(sel);
    cur = cur.parentElement;
  }
  return path.join(' > ');
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

// Alias for backwards compatibility
const findLabel = resolveLabel;

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

// <select> options list
function getSelectOptions(el) {
  return Array.from(el.options)
    .filter(o => o.value || o.textContent.trim())
    .map(o => ({ value: o.value, text: o.textContent.trim() }));
}

// Dedup key — position-based to handle elements without id/name
function getFieldKey(el) {
  const r = el.getBoundingClientRect();
  return `${el.tagName}|${el.id || ''}|${Math.round(r.top)}|${Math.round(r.left)}`;
}

// Dedup key for toggle / radio group containers
function getGroupKey(container) {
  return `group|${getDOMPath(container)}`;
}

// Extract current value from a custom dropdown
function getCustomDropdownValue(el) {
  const sel = el.querySelector('[class*="single-value"],[class*="selected"],[aria-selected="true"]');
  if (sel) return sel.textContent.trim() || null;
  const t = el.textContent.trim();
  return t.length < 60 ? t : null;
}
