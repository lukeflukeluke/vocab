// Cloudflare Pages Function: POST /api/tick, called every 10 minutes by a scheduled GitHub
// Action (.github/workflows/tick.yml). The logic lives in server/reminders.ts.
import { handleTick, type ReminderEnv } from '../../server/reminders';

interface Context {
  request: Request;
  env: ReminderEnv;
}

export const onRequestPost = (context: Context) =>
  handleTick(context.request, context.env, Date.now());
