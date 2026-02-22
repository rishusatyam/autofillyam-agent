import { SemanticKey } from '../dto/mapping.dto';

type ScannedFieldLike = {
  fieldId: string;
  type?: string | null;
  label?: string | null;
  placeholder?: string | null;
};

/**
 * Transformation utilities for converting LLM mapping output into autofill values.
 *
 * Flow:
 *   LLM mapping (fieldId → semantic path)
 *     + user profile (nested object)
 *   = autofill values (fieldId → resolved value)
 */

/**
 * Maps each flat SemanticKey (used by LLM) to its dot-notation path in MOCK_USER_PROFILE.
 * Acts as the bridge between the LLM layer and the transformation layer.
 */
export const SEMANTIC_KEY_PATHS: Record<SemanticKey, string> = {
  first_name:   'user.name.first',
  last_name:    'user.name.last',
  email:        'user.contact.email',
  phone:        'user.contact.phone.primary',
  gender:       'user.gender',
  country_code: 'user.preferences.travel.country_code',
};

/**
 * Safely resolves a dot-notation path against a nested object.
 *
 * Examples:
 *   getValueByPath(profile, "user.name.first")     → "Ayush"
 *   getValueByPath(profile, "user.contact.phone.primary") → "9876543210"
 *   getValueByPath(profile, "user.does.not.exist") → null
 *
 * Rules:
 *   - Returns null (never throws) for any missing or invalid path
 *   - Handles null/undefined at any level of traversal
 *   - O(d) where d = depth of path
 */
export function getValueByPath(
  obj: Record<string, any>,
  path: string | null | undefined
): any {
  // Guard: empty or missing path
  if (!path || typeof path !== 'string' || path.trim() === '') return null;

  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    // Stop traversal if we hit a dead end
    if (current === null || current === undefined || typeof current !== 'object') {
      return null;
    }
    current = current[key];
  }

  // Return undefined as null for consistency
  return current ?? null;
}

/**
 * Converts an LLM mapping into concrete autofill values by resolving each
 * semantic path against the user profile.
 *
 * @param mapping - { fieldId: "user.name.first" | null }  (LLM output)
 * @param profile - Nested user profile object
 * @returns       - { fieldId: resolvedValue | null }
 *
 * Guarantees:
 *   - Never throws — all errors produce null for that field
 *   - O(n) — one path resolution per field, no deep cloning
 *   - Order-independent — output depends only on mapping keys, not their order
 *   - null mapping values pass through as null without attempting resolution
 */
export function transformMappingToValues(
  mapping: Record<string, string | null>,
  profile: Record<string, any>,
  fields?: ScannedFieldLike[]
): Record<string, any> {
  const result: Record<string, any> = {};

  const fieldsById: Record<string, ScannedFieldLike> = {};
  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (f?.fieldId) fieldsById[f.fieldId] = f;
    }
  }

  for (const fieldId of Object.keys(mapping)) {
    const semanticPath = mapping[fieldId];

    // Null path means LLM found no match — preserve null
    if (semanticPath === null) {
      result[fieldId] = null;
      continue;
    }

    try {
      result[fieldId] = getValueByPath(profile, semanticPath);
    } catch {
      // Defensive catch — getValueByPath should never throw, but just in case
      result[fieldId] = null;
    }

    // Post-process: if UI expects a combined name string, compose it from profile.
    const field = fieldsById[fieldId];
    const composed = field ? _composeNameValue(field, profile) : null;
    if (composed !== null) {
      result[fieldId] = composed;
    }
  }

  return result;
}

function _norm(s: unknown): string {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function _joinParts(parts: Array<string | null | undefined>): string | null {
  const out = parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0);
  return out.length > 0 ? out.join(' ') : null;
}

function _composeNameValue(field: ScannedFieldLike, profile: Record<string, any>): string | null {
  // Only for text-like fields
  const t = _norm(field.type);
  if (t && t !== 'text') return null;

  const label = _norm(field.label);
  const ph = _norm(field.placeholder);
  const hay = `${label} ${ph}`.trim();
  if (!hay) return null;

  const first = getValueByPath(profile, 'user.name.first');
  const middle = getValueByPath(profile, 'user.name.middle');
  const last = getValueByPath(profile, 'user.name.last');

  const hasFirst = /\b(first|given)\b/.test(hay);
  const hasMiddle = /\bmiddle\b/.test(hay);
  const hasLast = /\b(last|surname|family)\b/.test(hay);
  const hasFull = /\bfull\s*name\b/.test(hay);

  // First & Middle
  if ((hasFirst && hasMiddle) && !hasLast && !hasFull) {
    return _joinParts([first, middle]);
  }

  // First & Last (single field)
  if ((hasFirst && hasLast) && !hasMiddle && !hasFull) {
    return _joinParts([first, last]);
  }

  // Full name: First Middle Last
  if (hasFull || (hasFirst && hasMiddle && hasLast)) {
    return _joinParts([first, middle, last]);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Mock profile — used for local testing and LLM prompt context
// ---------------------------------------------------------------------------

export const MOCK_USER_PROFILE = {
  user: {
    name: {
      first:  'Ayush',
      middle: 'Kumar',
      last:   'Sharma',
    },
    gender: 'Male',
    dateOfBirth: '1995-03-15',
    nationality: 'Indian',
    contact: {
      phone: {
        primary:   '9876543210',
        secondary: '9123456780',
      },
      email: 'ayush@example.com',
      countryCode: '+91',
    },
    address: {
      residential: '123 MG Road, Koramangala',
      city: 'Bangalore',
      state: 'Karnataka',
      postalCode: '560034',
      country: 'India',
    },
    preferences: {
      travel: {
        country_code: '+91',
        seat:         'Window',
      },
    },
    documents: {
      passport: {
        number: 'N1234567',
        issueDate: '2020-03-15',
        expiryDate: '2030-03-15',
        issuingCountry: 'India',
      },
    },
    emergency: {
      contact: {
        name: 'Priya Sharma',
        relationship: 'Spouse',
        phone: '9988776655',
      },
    },
  },
};
