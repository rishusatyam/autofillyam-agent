import { MappingRequest, MappingResponse } from '../dto/mapping.dto';
import { generateFormSignature } from '../utils/signature.util';
import { findMapping, saveMapping } from '../repository/formMapping.repository';
import { callLLMForMapping } from './llm.service';
import { transformMappingToValues, MOCK_USER_PROFILE } from '../utils/transform.util';

/**
 * Core business logic for the form mapping service.
 *
 * Flow:
 *  1. Generate formSignature from field structure (no values, no fieldIds)
 *  2. Check DB — if found, return cached mapping immediately
 *  3. If not found — call LLM, store result, return mapping
 */
export async function resolveMapping(req: MappingRequest): Promise<MappingResponse> {
  const { provider, fields } = req;

  // Step 1: Generate a deterministic signature from field structure only
  const formSignature = generateFormSignature(fields);
  console.log(`[FormMapping] provider=${provider} signature=${formSignature.slice(0, 16)}...`);

  // Step 2: Check DB for existing mapping
  const existing = await findMapping(provider, formSignature);
  if (existing) {
    console.log(`[FormMapping] Cache hit — returning stored mapping`);
    // Sanitize: only include requested fieldIds
    const mapping: Record<string, string | null> = {};
    for (const field of fields) {
      mapping[field.fieldId] = existing[field.fieldId] ?? null;
    }
    
    // Transform directly: path → value
    const values = transformMappingToValues(mapping, MOCK_USER_PROFILE);
    
    return { provider, mapping, values };
  }

  // Step 3: No cached mapping — call LLM
  console.log(`[FormMapping] Cache miss — calling LLM for ${fields.length} fields`);
  const rawMapping = await callLLMForMapping(provider, fields);

  // LLM already sanitizes output, but double-check: keep only requested fieldIds
  const mapping: Record<string, string | null> = {};
  for (const field of fields) {
    mapping[field.fieldId] = rawMapping[field.fieldId] ?? null;
  }

  // Step 4: Persist to DB
  await saveMapping(provider, formSignature, mapping);
  console.log(`[FormMapping] Stored mapping for ${provider}`);

  // Transform directly: path → value
  const values = transformMappingToValues(mapping, MOCK_USER_PROFILE);

  return { provider, mapping, values };
}
