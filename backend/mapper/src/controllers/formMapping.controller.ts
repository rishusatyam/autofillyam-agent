import { Request, Response } from 'express';
import { MappingRequest } from '../dto/mapping.dto';
import { resolveMapping } from '../services/formMapping.service';

/**
 * POST /mapping
 *
 * Accepts scanned form fields from the browser extension.
 * Returns a fieldId → semantic key mapping.
 * Internally uses formSignature + DB cache to avoid redundant LLM calls.
 */
export async function handleMapping(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as MappingRequest;

    // Validate required fields
    if (!body.provider || typeof body.provider !== 'string') {
      res.status(400).json({ error: 'provider is required and must be a string' });
      return;
    }
    if (!Array.isArray(body.fields) || body.fields.length === 0) {
      res.status(400).json({ error: 'fields must be a non-empty array' });
      return;
    }

    const result = await resolveMapping(body);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('[FormMapping] Error:', error?.message ?? error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
