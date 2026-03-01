/**
 * Transformation utilities for the Search Mapping API.
 *
 * Architecture note — "mock data is temporary":
 *   MOCK_SEARCH_PREFERENCES is a static fallback used during development.
 *   The real entry point is `getUserSearchPreferences(userId?)` which is
 *   designed to be swapped for an API call to an external preferences service
 *   without any change to the service layer — the service calls the function,
 *   not the constant directly.
 */

// ---------------------------------------------------------------------------
// Preferences data structure
// ---------------------------------------------------------------------------

/**
 * Shape of the user search preferences object.
 * Each vertical is a flat key→value map of search parameters.
 * New verticals can be added here without touching any other file.
 */
export interface SearchPreferences {
  [vertical: string]: Record<string, any>;
}

/**
 * Mock search preferences — used as the data source until the external
 * preferences service is wired up.
 *
 * Structure mirrors the semantic key namespace:
 *   "search.from_city" → strip "search." → "from_city" → preferences[vertical]["from_city"]
 */
export const MOCK_SEARCH_PREFERENCES: SearchPreferences = {
  flight: {
    from_city:       'New Delhi',
    to_city:         'Mumbai',
    departure_date:  '2026-03-15',
    return_date:     '2026-03-22',
    passengers:      5,
    adults:          5,
    children:        2,
    infants:         2,
    cabin_class:     'Business',
  },
  hotel: {
    destination:    'Goa',
    checkin_date:   '2026-04-01',
    checkout_date:  '2026-04-05',
    guests:         2,
    rooms:          1,
  },
  train: {
    from_station:   'New Delhi',
    to_station:     'Mumbai Central',
    departure_date: '2026-03-15',
    travel_class:   'Sleeper',
  },
  bus: {
    from_city:      'New Delhi',
    to_city:        'Jaipur',
    departure_date: '2026-03-15',
  },
  cab: {
    pickup_location:  'Indira Gandhi Airport',
    dropoff_location: 'Connaught Place',
    departure_date:   '2026-03-15',
  },
};

// ---------------------------------------------------------------------------
// Preferences provider
// ---------------------------------------------------------------------------

/**
 * Returns search preferences for a user.
 *
 * CONTRACT (stable — callers do not change when data source changes):
 *   - Always returns a `SearchPreferences` object.
 *   - Missing verticals gracefully return an empty object in the transform.
 *
 * TODO: Replace mock with a real call to the user preferences microservice.
 * Example (future implementation):
 *   const resp = await fetch(`${PREFS_SERVICE_URL}/users/${userId}/search-preferences`);
 *   return resp.json() as SearchPreferences;
 *
 * @param userId - Optional user identifier for future API calls (unused now).
 */
export async function getUserSearchPreferences(
  userId?: string,
): Promise<SearchPreferences> {
  // TODO: call external preferences service when available
  // Keeping userId in signature so service layer doesn't change on migration
  void userId;
  return MOCK_SEARCH_PREFERENCES;
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

/**
 * Converts an LLM search mapping into concrete autofill values by resolving
 * each semantic key against the user's preferences for the given vertical.
 *
 * Resolution algorithm:
 *   1. mapping[fieldId] = "search.from_city"
 *   2. Strip "search." prefix → "from_city"
 *   3. Look up: preferences[vertical]["from_city"]  → "Delhi"
 *   4. result[fieldId] = "Delhi"
 *
 * Edge cases:
 *   - null mapping        → result[fieldId] = null
 *   - unknown vertical    → empty verticalPrefs → all fields get null
 *   - unknown pref key    → null (never throws)
 *   - value === 0 / false → preserved as-is (falsy ≠ missing)
 *
 * @param mapping      - LLM output: { fieldId: "search.from_city" | null }
 * @param preferences  - User preferences object (from getUserSearchPreferences)
 * @param vertical     - e.g. "flight"
 */
export function transformSearchData(
  mapping: Record<string, string | null>,
  preferences: SearchPreferences,
  vertical: string,
): Record<string, any> {
  const result: Record<string, any> = {};
  const verticalPrefs: Record<string, any> = preferences[vertical.toLowerCase()] ?? {};

  for (const fieldId of Object.keys(mapping)) {
    const semanticKey = mapping[fieldId];

    // Null path → LLM found no match
    if (semanticKey === null || semanticKey === undefined) {
      result[fieldId] = null;
      continue;
    }

    // Strip "search." prefix to get the bare preference key
    const prefKey = semanticKey.startsWith('search.')
      ? semanticKey.slice('search.'.length)
      : semanticKey;

    // Use undefined-check (not falsy) so 0 and false are preserved
    const value = verticalPrefs[prefKey];
    result[fieldId] = value !== undefined ? value : null;
  }

  return result;
}
