// Cloudflare Pages Function: /api/push/key, subscribe, unsubscribe, done and test.
// The logic lives in server/reminders.ts.
import { handlePush, type ReminderEnv } from '../../../server/reminders';

interface Context {
  request: Request;
  env: ReminderEnv;
  params: { action?: string | string[] };
}

export const onRequest = (context: Context) =>
  handlePush(String(context.params.action ?? ''), context.request, context.env, Date.now());
