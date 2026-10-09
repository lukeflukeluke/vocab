// Cloudflare Pages Function: POST /api/capture (the iOS Shortcut). Logic in server/capture.ts.
import { handleCapture } from '../../server/capture';
import type { SyncDb } from '../../server/sync';

interface Context {
  request: Request;
  env: { DB?: SyncDb };
}

export const onRequestPost = (context: Context) =>
  handleCapture(context.request, context.env.DB, Date.now());
