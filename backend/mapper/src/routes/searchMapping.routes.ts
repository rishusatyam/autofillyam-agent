import { Router } from 'express';
import { handleSearchMapping } from '../controllers/searchMapping.controller';

const router = Router();

/**
 * POST /mapping/search
 *
 * Body: { provider: string, vertical: string, fields: SearchField[] }
 * Response: { provider, vertical, mapping: { fieldId: "search.*" | null }, values: { fieldId: any } }
 */
router.post('/mapping/search', handleSearchMapping);

export default router;
