import { Router } from 'express';
import { handleMapping } from '../controllers/formMapping.controller';

const router = Router();

/**
 * POST /mapping
 * Body: { provider: string, fields: ScannedField[] }
 * Response: { provider: string, mapping: { fieldId: semanticKey | null } }
 */
router.post('/mapping', handleMapping);

export default router;
