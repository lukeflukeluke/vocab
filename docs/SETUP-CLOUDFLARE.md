# Connect Cloudflare Pages (about 10 minutes, once)

This puts the app online at a free `something.pages.dev` address. After this:
- every time work is merged into `main`, the live app updates by itself
- every pull request gets its own **preview link** to test on your iPhone before merging

Do this once S1 is merged into `main`.

---

## 1. Create the Pages project

1. Sign in at **dash.cloudflare.com**. Make a free account if you don't have one.
2. In the left menu, open **Workers & Pages** (it may sit under **Compute**).
3. Click **Create** (or **Create application**) and choose **Pages**.
   Cloudflare changes this screen now and then. If you only see Workers options, look
   for a link like "Looking to deploy Pages? Get started".
4. Choose **Import an existing Git repository** (it may say **Connect to Git**).
5. Connect your GitHub account. When GitHub asks which repositories Cloudflare may
   use, pick **Only select repositories** and choose **vocab**.
6. Select **vocab** and click **Begin setup**.

## 2. Build settings

| Setting | Value |
|---|---|
| Project name | Anything, for example `vocab-luke`. It becomes your address (`vocab-luke.pages.dev`). **Pick one you'll keep:** your iPhone's data is tied to this address. |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |

Leave everything else as it is and click **Save and Deploy**. The first build takes a
minute or two.

## 3. Check it

- When the build finishes, open your `https://...pages.dev` address. You should see the
  Vocab home screen. At the bottom, **Version** shows the commit it was built from.
- From now on, Cloudflare comments on each pull request with a preview link.

## 4. Put it on your iPhone

1. Open your `pages.dev` address in **Safari**.
2. Tap **Share** (the square with the arrow), then **Add to Home Screen**, then **Add**.
3. Open **Vocab** from the home screen. Under "This device", **Works offline** should
   say **Ready**.
4. Test offline: turn on **Airplane Mode**, swipe the app away completely, and open it
   again. It should still open.
5. Turn Airplane Mode off.

**Always use the home-screen icon, not Safari.** On iPhone the two keep separate
storage, and your progress lives in the home-screen app.

## If something goes wrong

- **Build failed:** open the failed deployment in Cloudflare, copy the build log, and
  start a session with: `Vocab app: fix this first: the Cloudflare build failed: ...`
  followed by the log.
- **Wrong Node version:** the repo's `.node-version` file tells Cloudflare to use
  Node 22. If the log shows an older one, add an environment variable
  `NODE_VERSION` = `22` in the project's settings and redeploy.
