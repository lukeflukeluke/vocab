import type { BrowserContext } from '@playwright/test';
import { handleCapture } from '../server/capture';
import { handleHealth, handleSync, type SyncDb } from '../server/sync';

// The sync server inside the test: requests to /api/* are answered by the real server code
// (server/*.ts) on an in-memory SQLite database standing in for Cloudflare D1.

export async function serve(context: BrowserContext, db: SyncDb | undefined) {
  await context.route('**/api/**', async (route) => {
    const req = route.request();
    const request = new Request(req.url(), {
      method: req.method(),
      headers: await req.allHeaders(),
      ...(req.postData() !== null && { body: req.postData()! }),
    });
    const path = new URL(req.url()).pathname;
    const res =
      path === '/api/health'
        ? await handleHealth(db)
        : path === '/api/capture'
          ? await handleCapture(request, db, Date.now())
          : await handleSync(request, db, Date.now());
    await route.fulfill({
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
      body: await res.text(),
    });
  });
}
