import { Request, Response } from 'express';
import { SearchMappingRequest } from '../dto/searchMapping.dto';
import { resolveSearchMapping } from '../services/searchMapping.service';

/**
 * POST /mapping/search
 *
 * Accepts scanned search form fields from the browser extension (with provider
 * and vertical), and returns:
 *   - mapping: fieldId → "search.semantic_key" | null
 *   - values:  fieldId → autofill value derived from user preferences
 *
 * Internally uses (provider + vertical + formSignature) to cache LLM results
 * and avoid redundant API calls for the same search widget layout.
 */
export async function handleSearchMapping(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as SearchMappingRequest;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!body.provider || typeof body.provider !== 'string') {
      res.status(400).json({ error: 'provider is required and must be a string' });
      return;
    }

    if (!body.vertical || typeof body.vertical !== 'string') {
      res.status(400).json({ error: 'vertical is required and must be a string (e.g. "flight", "hotel")' });
      return;
    }

    if (!Array.isArray(body.fields) || body.fields.length === 0) {
      res.status(400).json({ error: 'fields must be a non-empty array' });
      return;
    }

    // Validate each field has at minimum a fieldId and type
    for (const field of body.fields) {
      if (!field.fieldId || typeof field.fieldId !== 'string') {
        res.status(400).json({ error: 'each field must have a fieldId string' });
        return;
      }
      if (!field.type || typeof field.type !== 'string') {
        res.status(400).json({ error: `field "${field.fieldId}" must have a type string` });
        return;
      }
      // Normalise: ensure options is always an array (tolerant of missing prop)
      if (!Array.isArray(field.options)) {
        field.options = [];
      }
    }

    const result = await resolveSearchMapping(body);
    res.status(200).json(result);

  } catch (error: any) {
    console.error('[SearchMapping] Error:', error?.message ?? error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
