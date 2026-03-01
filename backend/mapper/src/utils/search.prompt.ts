import { SearchField } from '../dto/searchMapping.dto';

/**
 * Allowed semantic search keys per vertical.
 *
 * Design: kept as plain data (not code) so adding a new vertical is a single
 * array entry in VERTICAL_KEYS — no changes to prompt logic or service layer.
 */
const VERTICAL_KEYS: Record<string, string[]> = {
  flight: [
    'search.from_city',
    'search.to_city',
    'search.departure_date',
    'search.return_date',
    'search.passengers',
    'search.adults',
    'search.children',
    'search.infants',
    'search.cabin_class',
  ],
  hotel: [
    'search.destination',
    'search.checkin_date',
    'search.checkout_date',
    'search.guests',
  ],
  train: [
    'search.from_station',
    'search.to_station',
    'search.departure_date',
  ],
  bus: [
    'search.from_city',
    'search.to_city',
    'search.departure_date',
  ],
  cab: [
    'search.pickup_location',
    'search.dropoff_location',
    'search.departure_date',
  ],
};

/** Generic keys always included regardless of vertical */
const GENERIC_KEYS: string[] = ['search.date', 'search.location'];

/**
 * Returns the full list of allowed semantic keys for a given vertical.
 * Unknown verticals receive generic keys only, so the system degrades
 * gracefully without any code change.
 */
export function getAllowedKeysForVertical(vertical: string): string[] {
  const specific = VERTICAL_KEYS[vertical.toLowerCase()] ?? [];
  // Deduplicate in case a vertical already included a generic key
  const all = [...specific, ...GENERIC_KEYS];
  return [...new Set(all)];
}

/**
 * Builds the LLM prompt for search form field mapping.
 *
 * Separate from the traveller mapping prompt because:
 *   1. The semantic key namespace is different ("search.*" vs nested user paths).
 *   2. The allowed keys are scoped per vertical.
 *   3. The context (booking search) differs from traveller identity forms.
 *
 * @param provider  - e.g. "goibibo.com"
 * @param vertical  - e.g. "flight"
 * @param fields    - Scanned fields from the extension
 */
export function buildSearchMappingPrompt(
  provider: string,
  vertical: string,
  fields: SearchField[],
): string {
  const allowedKeys = getAllowedKeysForVertical(vertical);
  const keysList = allowedKeys.map(k => `- ${k}`).join('\n');

  // Strip placeholder — not used in mapping decisions
  const fieldsSummary = fields.map(f => ({
    fieldId:  f.fieldId,
    type:     f.type,
    label:    f.label,
    section:  f.section,
    options:  f.options.length > 0 ? f.options : undefined,
  }));

  return `You are mapping search form fields to semantic booking keys for a travel site.

PROVIDER: ${provider}
VERTICAL: ${vertical}

ALLOWED SEMANTIC KEYS FOR THIS VERTICAL:
${keysList}

FORM FIELDS TO MAP:
${JSON.stringify(fieldsSummary, null, 2)}

INSTRUCTIONS (CRITICAL):
1. Return ONLY a raw JSON object. No markdown, no code blocks, no explanation text.
2. Map ONLY the fieldIds listed in FORM FIELDS above — do not add extra keys.
3. Each fieldId maps to EXACTLY ONE key from ALLOWED SEMANTIC KEYS above, or null.
4. Use EXACT key strings from the list. Do not invent new keys.
5. A semantic key should be used at most once (no duplicates).
6. For fields with no clear match → use null.
7. Common mappings for ${vertical}:
${_commonMappings(vertical)}

Output format (raw JSON, nothing else):
{ "fieldId1": "search.semantic_key", "fieldId2": null, ... }`;
}

/** Returns inline mapping hints so the LLM has strong per-vertical anchors. */
function _commonMappings(vertical: string): string {
  const hints: Record<string, string> = {
    flight: `   - "From" / "Origin" / "Departure city" → search.from_city
   - "To" / "Destination" / "Arrival city"   → search.to_city
   - "Departure" / "Onward date"              → search.departure_date
   - "Return" / "Return date"                 → search.return_date
   - "Passengers" / "Travellers"              → search.passengers
   - "Adults" / "Adult passengers"            → search.adults
   - "Children" / "Child passengers"          → search.children
   - "Infants" / "Infant passengers"          → search.infants
   - "Class" / "Cabin class"                  → search.cabin_class`,
    hotel: `   - "Destination" / "City" / "Where"        → search.destination
   - "Check-in" / "Arrival date"              → search.checkin_date
   - "Check-out" / "Departure date"           → search.checkout_date
   - "Guests" / "Rooms" / "Adults"            → search.guests`,
    train: `   - "From" / "Origin station"               → search.from_station
   - "To" / "Destination station"             → search.to_station
   - "Date" / "Journey date"                  → search.departure_date`,
    bus: `   - "From" / "Origin"                       → search.from_city
   - "To" / "Destination"                     → search.to_city
   - "Date" / "Travel date"                   → search.departure_date`,
    cab: `   - "Pickup" / "From"                        → search.pickup_location
   - "Drop" / "To" / "Destination"            → search.dropoff_location
   - "Date" / "Travel date"                   → search.departure_date`,
  };
  return hints[vertical.toLowerCase()] ?? '   - Match fields to keys by semantic meaning.';
}
