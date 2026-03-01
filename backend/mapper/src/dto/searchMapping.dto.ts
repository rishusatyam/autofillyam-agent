/**
 * DTOs for the Search Mapping API.
 *
 * Intentionally kept separate from mapping.dto.ts — the search domain has a
 * different field structure (adds `vertical`) and a different semantic key space
 * (search.* keys instead of user profile paths).
 */

/**
 * Travel verticals supported by the search mapping API.
 * Typed as a union for documentation/autocompletion; the service layer accepts
 * any `string` so new verticals can be added without a deploy of the core logic.
 */
export type SearchVertical = 'flight' | 'hotel' | 'train' | 'bus' | 'cab';

/** Field types the extension can report on a search form */
export type SearchFieldType = 'text' | 'date' | 'dropdown' | 'radio' | 'checkbox' | 'toggle';

/** Semantic search keys the LLM is allowed to assign (per vertical + generic) */
export type SearchSemanticKey =
  // Flight
  | 'search.from_city'
  | 'search.to_city'
  | 'search.departure_date'
  | 'search.return_date'
  | 'search.passengers'
  | 'search.adults'
  | 'search.children'
  | 'search.infants'
  | 'search.cabin_class'
  // Hotel
  | 'search.destination'
  | 'search.checkin_date'
  | 'search.checkout_date'
  | 'search.guests'
  // Train
  | 'search.from_station'
  | 'search.to_station'
  // Bus
  | 'search.from_city_bus'
  | 'search.to_city_bus'
  // Cab
  | 'search.pickup_location'
  | 'search.dropoff_location'
  // Generic fallbacks
  | 'search.date'
  | 'search.location';

/** A single scanned field from the browser extension (search form variant) */
export interface SearchField {
  fieldId: string;             // Unique identifier the extension assigned to this field
  type: SearchFieldType;       // How the field renders in the UI
  label: string | null;        // Visible label text
  placeholder: string | null;
  section: string | null;      // Form section / heading this field belongs to
  options: string[];           // Option texts for dropdown/radio; empty for text/date
}

/** POST /mapping/search — request body */
export interface SearchMappingRequest {
  provider: string;   // Domain, e.g. "goibibo.com"
  vertical: string;   // Travel vertical, e.g. "flight" — string (not union) for extensibility
  fields: SearchField[];
}

/** POST /mapping/search — response body */
export interface SearchMappingResponse {
  provider: string;
  vertical: string;
  mapping: Record<string, string | null>;  // fieldId → "search.semantic_key" or null
  values:  Record<string, any>;            // fieldId → resolved value from preferences or null
}
