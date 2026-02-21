import { createHash } from 'crypto';
import { ScannedField } from '../dto/mapping.dto';

/**
 * Generates a deterministic SHA256 signature that represents the COMPLETE
 * form field configuration including fieldIds and all properties.
 *
 * Any change to fieldIds, types, labels, placeholders, sections, or options
 * will produce a different signature, triggering a fresh LLM call.
 *
 * Algorithm:
 *  1. For each field: "fieldId:type:label:placeholder:section:opt1,opt2"
 *  2. Sort field strings (order-independent)
 *  3. Join with "|"
 *  4. SHA256 → hex
 *
 * This ensures:
 *  - Same form structure with different fieldIds → different hash → LLM called
 *  - Any label change → different hash → LLM called
 *  - Any type change → different hash → LLM called
 */
export function generateFormSignature(fields: ScannedField[]): string {
  const fieldStrings = fields.map(f => {
    const fieldId     = (f.fieldId ?? '').toString().toLowerCase().trim();
    const type        = (f.type ?? '').toString().toLowerCase().trim();
    const label       = (f.label       ?? '').toString().toLowerCase().trim();
    const placeholder = (f.placeholder ?? '').toString().toLowerCase().trim();
    const section     = (f.section     ?? '').toString().toLowerCase().trim();
    const options     = (f.options ?? [])
      .map(o => (o ?? '').toString().toLowerCase().trim())
      .sort()
      .join(',');

    // Include fieldId in the canonical form
    return `${fieldId}:${type}:${label}:${placeholder}:${section}:${options}`;
  });

  // Sort so field order doesn't matter
  fieldStrings.sort();

  const raw = fieldStrings.join('|');
  return createHash('sha256').update(raw).digest('hex');
}
