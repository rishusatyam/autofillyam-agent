import OpenAI from 'openai';
import { SearchField } from '../dto/searchMapping.dto';
import { buildSearchMappingPrompt, getAllowedKeysForVertical } from '../utils/search.prompt';

/**
 * Calls the Azure OpenAI API for search form field mapping.
 *
 * Differences from the traveller `llm.service.ts`:
 *   - Uses a search-specific prompt (buildSearchMappingPrompt)
 *   - Valid values are "search.*" keys (not nested user-profile paths)
 *   - Validation is done against the allowed key list for the given vertical
 *
 * @param provider  - e.g. "goibibo.com"
 * @param vertical  - e.g. "flight"
 * @param fields    - Scanned fields from the extension
 * @returns         - { fieldId: "search.semantic_key" | null }
 */
export async function callLLMForSearchMapping(
  provider: string,
  vertical: string,
  fields: SearchField[],
): Promise<Record<string, string | null>> {
  const endpoint = 'https://ayush-mjprwu4d-eastus2.cognitiveservices.azure.com/openai/v1/';
  const apiKey   = process.env.AZURE_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('AZURE_OPENAI_API_KEY not set in environment');
  }

  const client = new OpenAI({
    apiKey,
    baseURL: endpoint,
    defaultHeaders: { 'api-key': apiKey },
  });

  const prompt      = buildSearchMappingPrompt(provider, vertical, fields);
  const maxRetries  = 3;
  let   lastError: unknown;

  // Build allowed key set and valid fieldId set for sanitization
  const allowedKeys   = new Set(getAllowedKeysForVertical(vertical));
  const validFieldIds = new Set(fields.map(f => f.fieldId));

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model:    'gpt-5.2-chat',
        messages: [{ role: 'user', content: prompt }],
      });

      const text   = response.choices[0].message.content ?? '{}';
      const parsed = JSON.parse(text);

      // LLM may wrap output — unwrap if needed
      const raw = (parsed.mapping ?? parsed) as Record<string, unknown>;

      // Sanitize: only keep requested fieldIds with valid search.* values
      const sanitized: Record<string, string | null> = {};

      for (const fieldId of validFieldIds) {
        const value = raw[fieldId];

        if (value === null || value === undefined) {
          sanitized[fieldId] = null;
          continue;
        }

        if (typeof value === 'string' && allowedKeys.has(value)) {
          // Valid semantic search key
          sanitized[fieldId] = value;
        } else {
          // LLM hallucinated an unknown key — treat as no match
          console.warn(
            `[SearchLLM] Unknown value for fieldId "${fieldId}": "${value}", setting to null`,
          );
          sanitized[fieldId] = null;
        }
      }

      console.log(`[SearchLLM] Mapped ${Object.values(sanitized).filter(Boolean).length}/${fields.length} fields`);
      return sanitized;

    } catch (error: any) {
      lastError = error;

      // Respect rate-limit retry-after header (429)
      if (error.status === 429 && attempt < maxRetries) {
        const retryAfter = error.headers?.['retry-after'] ?? 60;
        const waitMs = (typeof retryAfter === 'string' ? parseInt(retryAfter, 10) : retryAfter) * 1000;
        console.log(
          `[SearchLLM] Rate limited. Retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // Non-retryable or exhausted retries — re-throw
      if (attempt >= maxRetries) break;
    }
  }

  throw lastError ?? new Error('[SearchLLM] Failed after retries');
}
