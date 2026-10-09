# Set up sync (about 10 minutes, once)

Sync keeps your iPhone and PC in step. The app already contains the sync server (it
runs on Cloudflare next to the app, in `functions/api/`). It only needs a database,
which you create and connect in the Cloudflare dashboard. No code, no SQL: the app
makes its own tables the first time it syncs.

---

## 1. Create two databases

1. Sign in at **dash.cloudflare.com**.
2. In the left menu, open **Storage & Databases**, then **D1 SQL Database**. (Cloudflare
   moves this now and then; it may sit under **Workers & Pages**.)
3. Click **Create Database**. Name it `vocab-sync`. Leave the location as it is. Click
   **Create**.
4. Do it again with the name `vocab-sync-preview`.

The second one is for preview links, so testing a pull request never touches your real
data.

## 2. Connect them to the app

1. Open **Workers & Pages** and click the project **vocab-build**.
2. Open **Settings**, then **Bindings** (on older screens: **Functions**, then
   **D1 database bindings**).
3. Make sure the environment switch at the top says **Production**. Click **Add**, choose
   **D1 database**, and fill in:
   - Variable name: `DB` (exactly, in capitals)
   - D1 database: `vocab-sync`
   Click **Save**.
4. Switch the environment to **Preview** and do the same, with variable name `DB` and
   database `vocab-sync-preview`.

## 3. Redeploy

Bindings take effect on the next deployment.

1. Open **Deployments**.
2. On the latest **Production** deployment, open the **...** menu and choose
   **Retry deployment**. Do the same for the newest **Preview** deployment if you want
   to test sync on a preview link.

To check it worked, open `https://vocab-build.pages.dev/api/health` in a browser. It
should say `{"ok":true}`. If it says `no-database`, the binding is missing or the
deployment is older than the binding.

## 4. Link your iPhone

1. Open Vocab from the home screen, go to **Settings**, then **Sync**.
2. Tap **Make a sync key**, then **Turn on sync**. The top bar should say **Synced**.
3. **Show key** under **Sync** brings the key back whenever you need it. Treat it like a password:
   anyone with it can read and add to your study history.

## 5. Install the app on your PC

1. Open `https://vocab-build.pages.dev` in **Chrome** or **Edge**.
2. Click the **Install** icon at the right of the address bar (a screen with a down
   arrow), then **Install**. Vocab opens in its own window and gets a Start menu entry.
3. On the welcome screen, choose **I already use Vocab on another device** and type the
   key from your iPhone (capitals, spaces and dashes don't matter). Your words appear.
   If you already went past the welcome screen, use **Settings**, **Sync**,
   **I have a key** instead.

If you tried the app in this browser before, those practice answers get merged into
your real data when you link. To start the PC clean, clear the site first: click the
icon left of the address, **Site settings**, **Delete data**, then reload.

## How it behaves

- Sync runs when the app opens, when you come back to it, after you pause or finish a
  session, and every 3 minutes while it is open. **Sync now** in Settings forces one.
- Offline is fine: everything works on the device and sends when you are back online.
- Studying on both devices on the same day is fine. Nothing is ever overwritten; both
  devices end up with every answer from both.
- Time travel (the hidden test mode) never syncs.
- **Turn off on this device** forgets the key on that device only. Your data stays
  on the device and on the server.

## If something goes wrong

- **Settings says "The sync server isn't set up yet"**: steps 2 and 3 are not done for
  this address. A preview link uses the **Preview** binding; the live app uses
  **Production**.
- **The top bar says Offline**: no internet, or Cloudflare is unreachable. It retries by
  itself.
- **"That key doesn't look right"**: a character is mistyped. The last character is a
  check, so most typos are caught before anything is sent.
- Anything else: start a session with `Vocab app: fix this first: sync ...` and describe
  what you see.
