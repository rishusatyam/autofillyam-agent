import { createHash } from 'crypto';
import { SearchField } from '../dto/searchMapping.dto';

/**
 * Generates a deterministic SHA256 signature for a search form.
 *
 * Includes fieldId, type, label, and section to ensure:
 *   - Extension generates deterministic fieldIds (based on form structure)
 *   - fieldId is the source of truth for field identity
 *   - Same form structure with reloads = same fieldIds = same signature
 *   - Different forms = different fieldIds = different signatures = correct cache behavior
 *
 * Algorithm:
 *  1. prefix:  `${provider}|${vertical}`           (scope guard)
 *  2. per field: `${fieldId}:${type}:${label}:${section}` (complete identity)
 *  3. sort field strings (order-independent)
 *  4. join with "|", prepend scope
 *  5. SHA256 → hex
 */
export function generateSearchSignature(
  provider: string,
  vertical: string,
  fields: SearchField[],
): string {
  const scope = `${provider.toLowerCase().trim()}|${vertical.toLowerCase().trim()}`;

  const fieldStrings = fields.map(f => {
    const fieldId = (f.fieldId ?? '').toString().toLowerCase().trim();
    const type    = (f.type    ?? '').toString().toLowerCase().trim();
    const label   = (f.label   ?? '').toString().toLowerCase().trim();
    const section = (f.section ?? '').toString().toLowerCase().trim();
    return `${fieldId}:${type}:${label}:${section}`;
  });

  // Sort so field declaration order in the scanned array does not change the hash
  fieldStrings.sort();

  const raw = `${scope}|${fieldStrings.join('|')}`;
  return createHash('sha256').update(raw).digest('hex');
}
