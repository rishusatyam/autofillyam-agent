import express, { Express, Request, Response } from 'express';
import formMappingRoutes from './routes/formMapping.routes';

/**
 * Creates and configures the Express application.
 * Registers all middleware and routes.
 */
export function createApp(): Express {
  const app = express();

  // Parse JSON request bodies
  app.use(express.json({ limit: '5mb' }));

  // CORS — allow Chrome extension to call this API
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.sendStatus(200); return; }
    next();
  });

  // Routes
  app.use('/', formMappingRoutes);

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 404
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
