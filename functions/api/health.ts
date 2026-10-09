// Cloudflare Pages Function: GET /api/health. Tells the app whether sync is set up.
import { handleHealth, type SyncDb } from '../../server/sync';

interface Context {
  env: { DB?: SyncDb };
}

export const onRequestGet = (context: Context) => handleHealth(context.env.DB);
