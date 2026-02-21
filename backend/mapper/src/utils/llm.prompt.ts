import { ScannedField } from '../dto/mapping.dto';
import { MOCK_USER_PROFILE } from './transform.util';

/**
 * Builds the LLM prompt for autofill field mapping.
 *
 * The prompt instructs the LLM to map each fieldId to a nested path in the user
 * profile using dot-notation. It provides:
 *  - The complete nested user profile structure so the LLM understands all available paths
 *  - The full list of scanned fields (without DOM paths or values)
 *  - Strict output format requirements (raw JSON only)
 *
 * @param provider - e.g. "makemytrip.com"
 * @param fields   - Scanned fields from the extension
 */
export function buildMappingPrompt(provider: string, fields: ScannedField[]): string {
  // Strip fieldId-independent info only — no values, no DOM paths
  const fieldsSummary = fields.map(f => ({
    fieldId:     f.fieldId,
    type:        f.type,
    label:       f.label,
    placeholder: f.placeholder,
    section:     f.section,
    options:     f.options.length > 0 ? f.options : undefined,
  }));

  return `You are an autofill mapping AI for a travel booking site.

Your task: Map form fieldIds to EXACT dot-notation paths from a user profile.

⚠️  CRITICAL: Return NESTED PATHS ONLY. NOT semantic keys like "first_name" or "email".

PROVIDER: ${provider}

USER PROFILE STRUCTURE:
${JSON.stringify(MOCK_USER_PROFILE, null, 2)}

EXACT AVAILABLE PATHS (use EXACTLY these):
- user.name.first (for first/given name)
- user.name.last (for last/surname/family name)
- user.gender (for gender/sex fields)
- user.contact.email (for email)
- user.contact.phone.primary (for phone/mobile)
- user.preferences.travel.country_code (for country code/dial code)

FORM FIELDS TO MAP:
${JSON.stringify(fieldsSummary, null, 2)}

INSTRUCTIONS (CRITICAL):
1. Return ONLY a raw JSON object. No markdown, code blocks, or explanation.
2. Map ONLY the fieldIds provided above (do not add extra fields).
3. Each fieldId maps to EXACTLY ONE of the AVAILABLE PATHS above, or null if no match.
4. Use EXACT path strings. WRONG: "first_name", "email". CORRECT: "user.name.first", "user.contact.email"
5. No duplicates — each path used at most once across all fields.
6. For unambiguous fields → use the exact path. For ambiguous → use null.
7. Examples:
   - Label "First Name" + type "text" → "user.name.first"
   - Label "Gender" + options ["Male", "Female"] → "user.gender"
   - Label "Country Code" + dropdown → "user.preferences.travel.country_code"
   - Label "Subscribe" → null (not a profile field)

REQUIRED JSON FORMAT (example):
{
  "mapping": {
    "f1": "user.name.first",
    "f2": "user.name.last",
    "f3": "user.gender",
    "f6": "user.contact.email",
    "f7": null,
    "f8": null
  }
}`;
}
