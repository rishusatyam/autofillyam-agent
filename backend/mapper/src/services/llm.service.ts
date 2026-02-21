import OpenAI from 'openai';
import { ScannedField } from '../dto/mapping.dto';
import { buildMappingPrompt } from '../utils/llm.prompt';
import { SEMANTIC_KEY_PATHS } from '../utils/transform.util';

/**
 * Maps semantic keys to nested paths (fallback if LLM returns old format)
 */
const SEMANTIC_TO_PATH: Record<string, string> = {
  first_name:   'user.name.first',
  last_name:    'user.name.last',
  email:        'user.contact.email',
  phone:        'user.contact.phone.primary',
  gender:       'user.gender',
  country_code: 'user.preferences.travel.country_code',
};

/**
 * Calls the Azure OpenAI API and sanitizes output.
 * Returns fieldId → nested path mapping (only requested fieldIds, no garbage).
 *
 * @param provider - Site domain for context
 * @param fields   - Scanned fields from extension
 * @returns        Mapping object: { fieldId: "user.path.to.field" | null }
 */
export async function callLLMForMapping(
  provider: string,
  fields: ScannedField[]
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

  const prompt    = buildMappingPrompt(provider, fields);
  const maxRetries = 3;
  let lastError: unknown;

  // Build set of valid fieldIds for sanitization
  const validFieldIds = new Set(fields.map(f => f.fieldId));

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model:    'gpt-5.2-chat',
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.choices[0].message.content ?? '{}';
      const parsed = JSON.parse(text);

      // Extract mapping from response
      let mapping = (parsed.mapping ?? parsed) as Record<string, string | null>;

      // Sanitize: only keep requested fieldIds
      const sanitized: Record<string, string | null> = {};
      for (const fieldId of validFieldIds) {
        const value = mapping[fieldId];
        
        if (value === null || value === undefined) {
          sanitized[fieldId] = null;
          continue;
        }

        // If LLM returned a semantic key (old format), convert to nested path
        if (SEMANTIC_TO_PATH[value]) {
          console.log(`[LLM] Converting semantic key "${value}" → nested path for fieldId ${fieldId}`);
          sanitized[fieldId] = SEMANTIC_TO_PATH[value];
        } else if (typeof value === 'string' && value.includes('.')) {
          // Already a nested path
          sanitized[fieldId] = value;
        } else {
          // Unknown value, treat as no match
          console.warn(`[LLM] Unknown value for fieldId ${fieldId}: "${value}", setting to null`);
          sanitized[fieldId] = null;
        }
      }

      console.log(`[LLM] Cleaned response: ${Object.keys(sanitized).length} fields mapped`);
      return sanitized;
    } catch (error: any) {
      lastError = error;

      // Respect rate-limit retry-after header (429)
      if (error.status === 429 && attempt < maxRetries) {
        const retryAfter = error.headers?.['retry-after'] ?? 60;
        const waitMs     = (typeof retryAfter === 'string' ? parseInt(retryAfter) : retryAfter) * 1000;
        console.log(`[LLM:FormMapping] Rate limited. Retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
