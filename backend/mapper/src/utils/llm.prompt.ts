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
/**
 * Recursively extracts all dot-notation paths from a nested object.
 * Used to dynamically generate available paths from user profile.
 */
function extractAllPaths(obj: any, prefix: string = ''): string[] {
  const paths: string[] = [];
  
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    
    const currentPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively explore nested objects
      paths.push(...extractAllPaths(value, currentPath));
    } else {
      // Leaf node - this is an actual data field
      paths.push(currentPath);
    }
  }
  
  return paths;
}

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

  // Dynamically extract all available paths from the user profile
  const availablePaths = extractAllPaths(MOCK_USER_PROFILE).sort();
  const pathsList = availablePaths.map(path => `- ${path}`).join('\n');

  return `You are an autofill mapping AI for a travel booking site.

Your task: Map form fieldIds to EXACT dot-notation paths from the user profile structure below.

⚠️  CRITICAL: Return NESTED PATHS ONLY. NOT semantic keys like "first_name" or "email".

PROVIDER: ${provider}

USER PROFILE STRUCTURE:
${JSON.stringify(MOCK_USER_PROFILE, null, 2)}

AVAILABLE PATHS (dynamically extracted from profile above):
${pathsList}

FORM FIELDS TO MAP:
${JSON.stringify(fieldsSummary, null, 2)}

INSTRUCTIONS (CRITICAL):
1. Return ONLY a raw JSON object. No markdown, code blocks, or explanation.
2. Map ONLY the fieldIds provided in FORM FIELDS above (do not add extra fields).
3. Each fieldId maps to EXACTLY ONE path from AVAILABLE PATHS above, or null if no clear match.
4. Use EXACT path strings from the list above. Match based on semantic meaning.
5. No duplicates — each path should be used at most once across all fields.
6. For unambiguous matches → use the path. For ambiguous or irrelevant fields → use null.
7. Common mappings:
   - First/Given name → user.name.first
   - Middle name → user.name.middle
   - Last/Surname/Family name → user.name.last
   - Email → user.contact.email
   - Phone/Mobile → user.contact.phone.primary
   - Country code/dial code → user.contact.countryCode
   - Gender/Sex → user.gender
   - Date of birth/DOB → user.dateOfBirth
   - Nationality/Citizenship → user.nationality
   - Passport number → user.documents.passport.number
   - Passport expiry → user.documents.passport.expiryDate
   - Passport issue date → user.documents.passport.issueDate
   - Passport country → user.documents.passport.issuingCountry
   - Address/Street → user.address.residential
   - City → user.address.city
   - State/Province → user.address.state
   - Postal/Zip code → user.address.postalCode
   - Country → user.address.country
   - Emergency contact name → user.emergency.contact.name
   - Emergency contact phone → user.emergency.contact.phone
   - Promotional/Subscribe fields → null

REQUIRED JSON FORMAT (example):
{
  "mapping": {
    "f1": "user.name.first",
    "f2": "user.name.last",
    "f3": "user.gender",
    "f4": "user.dateOfBirth",
    "f5": "user.contact.email",
    "f6": "user.documents.passport.number",
    "f7": null,
    "f8": null
  }
}`;
}
