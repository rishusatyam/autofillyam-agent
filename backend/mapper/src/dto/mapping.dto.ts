/**
 * DTO (Data Transfer Objects) for the Form Mapping API.
 * Defines the exact shape of requests from the extension and responses back.
 */

/** Semantic profile keys the LLM is allowed to assign to a field */
export type SemanticKey =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'gender'
  | 'country_code';

/** All allowed semantic keys as an array — used for LLM prompt validation */
export const ALLOWED_SEMANTIC_KEYS: SemanticKey[] = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'gender',
  'country_code',
];

/** Field types the extension can report */
export type FieldType = 'text' | 'dropdown' | 'radio' | 'checkbox' | 'toggle';

/** A single scanned field from the browser extension */
export interface ScannedField {
  fieldId: string;           // Unique identifier the extension assigned to this field
  type: FieldType;           // How the field renders in the UI
  label: string | null;      // Visible label text
  placeholder: string | null;
  section: string | null;    // Form section / heading this field belongs to
  options: string[];         // Option texts for dropdown/radio/toggle; empty for text
}

/** POST /mapping — request body */
export interface MappingRequest {
  provider: string;          // Domain, e.g. "makemytrip.com"
  fields: ScannedField[];
}

/**
 * POST /mapping — response body.
 * provider + mapping (fieldId → nested path) + values (resolved from profile)
 */
export interface MappingResponse {
  provider: string;
  mapping: Record<string, string | null>;  // fieldId → nested path (e.g., "user.name.first") or null
  values: Record<string, any>;              // fieldId → actual profile value or null
}

