import { SemanticKey } from '../dto/mapping.dto';

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
  profile: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};

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
  }

  return result;
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
    contact: {
      phone: {
        primary:   '9876543210',
        secondary: '9123456780',
      },
      email: 'ayush@example.com',
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
        expiry: '2030-01-01',
      },
    },
  },
};
