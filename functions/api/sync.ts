// Cloudflare Pages Function: POST /api/sync. The logic lives in server/sync.ts.
// The D1 database is bound to the Pages project as `DB` (docs/SETUP-SYNC.md).
import { handleSync, type SyncDb } from '../../server/sync';

interface Context {
  request: Request;
  env: { DB?: SyncDb };
}

export const onRequestPost = (context: Context) =>
  handleSync(context.request, context.env.DB, Date.now());
