# Reminders and backups

## Daily reminder (2 minutes, on the iPhone)

Needs sync on (`docs/SETUP-SYNC.md`) and iOS 16.4 or later.

1. Open Wordhoard **from the Home Screen** (reminders don't work in Safari itself).
2. **Settings**, **Daily reminder**: pick a time, tap **Turn on reminders**, then
   **Allow** when the iPhone asks.
3. Tap **Send a test**. A notification should arrive within a few seconds.

The reminder comes once a day at about that time, and only if today's session isn't done
(done on any device counts). Change the time or turn it off in the same place. On the PC,
the installed app can have its own reminder the same way.

### How it works

Cloudflare Pages cannot run anything on a timer, so a scheduled GitHub Action
(`.github/workflows/tick.yml`) calls the app's `/api/tick` every 10 minutes; that sends
the reminders that are due. Nothing to set up: it runs on its own once merged into `main`.

- GitHub sometimes starts scheduled runs a few minutes late, so a 19:00 reminder may come
  at 19:05 or so.
- To see it working: GitHub, the repo, **Actions**, **Tick**. Each run should be green.
- GitHub pauses scheduled workflows in a repository with no activity for 60 days, and
  emails you first. Open the **Tick** workflow and click **Enable workflow** to restart it.
- The repository is public, so the Action costs nothing. (If it is ever made private,
  every-10-minutes runs would use more than GitHub's free monthly minutes; change the
  schedule in `tick.yml` to every 30 minutes, `*/30 * * * *`.)

## Weekly backup to Cloudflare R2 (optional, about 5 minutes)

Your history already lives on the server and on each device, and Cloudflare keeps 30
days of database history. A weekly copy in R2 adds an independent backup you can download.

1. In the Cloudflare dashboard, open **R2 Object Storage**. If asked, turn R2 on (it may
   ask for a payment method; this use stays inside the free 10 GB).
2. **Create bucket**, name it `vocab-backups`, keep the defaults.
3. Open **Workers & Pages**, the project **vocab-build**, **Settings**, **Bindings**.
   With **Production** selected, **Add**, **R2 bucket**: variable name `BACKUPS`, bucket
   `vocab-backups`. **Save**.
4. **Deployments**: retry the latest production deployment.

From then on, the tick writes one file a week per account, named like
`vocab-backup-2026-10-17.json`.

**To restore:** in R2, open the bucket, download the newest file, then in the app go to
**Settings**, **Import** and pick it. Import only adds what is missing, so it is safe.
