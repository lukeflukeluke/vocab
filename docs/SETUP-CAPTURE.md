# Set up capture (about 10 minutes, once)

Capture sends a word you meet while reading, with the sentence it was in, to the
**Inbox** tab. There you pick the meaning and choose **Learn**, **I know it** or
**Ignore**. Words you choose to learn come first in your next session.

Do this on the **live app** (`vocab-build.pages.dev`), not a preview link: the Shortcut
and the bookmark point at the address you set them up from.

Sync must be on first (`docs/SETUP-SYNC.md`): the iPhone Shortcut sends words through the
sync server.

---

## iPhone: the "Add to Wordhoard" Shortcut (about 5 minutes)

The app shows these steps too, with copy buttons: **Settings**, **Capture words**, **How to
make it**. Use those, because they hold your own key.

1. Open the **Shortcuts** app, tap **+**, and name it **Add to Wordhoard**.
2. Tap **i** (Details) and turn on **Show in Share Sheet**. In the first line, "Receive ...
   from Share Sheet", keep only **Text**, and set "If there's no input" to **Ask For Text**.
3. Add the action **Get Contents of URL**. Address: `https://vocab-build.pages.dev/api/capture`
4. Tap **Show More**. Method: **POST**. Headers: add one with the key **Authorization** and
   the value `Bearer ` followed by your sync key (copy it from the app).
5. Request Body: **JSON**. Add a **Text** field with the key `text`; for its value, tap and
   pick **Shortcut Input**.
6. Add the action **Show Notification** and set its text to **Contents of URL**.

To use it: select a word in Safari (or any app), tap **Share**, then **Add to Wordhoard**. A
notification says "Added ... to your Wordhoard Inbox". You can also select a whole sentence;
the Inbox then asks which word you meant. Running the Shortcut from the Shortcuts app (or
a home-screen icon) asks you to type a word.

Why a Shortcut and not a link: on iPhone, a link opens Safari, which keeps separate
storage from the home-screen app. The Shortcut sends the word to the sync server, which
adds it to your history, and both devices pick it up on their next sync.

## PC: the +Hoard bookmark (about 1 minute)

1. Open the installed app (or `vocab-build.pages.dev` in the same browser), go to
   **Settings**, **Capture words**.
2. Show the bookmarks bar (**Ctrl+Shift+B**) and drag the **+Hoard** button onto it.

To use it: select a word on any web page and click **+Hoard**. A small window saves the
word, the sentence around it, and the page's title, then closes. It is in the Inbox
straight away on the PC, and on the iPhone after the next sync.

## In the app

- **Inbox** tab: a box to type a word you met (and paste its sentence), and the words
  waiting to be sorted. The tab shows how many are waiting.
- Words in the word bank link to their full entry, and your sentence becomes one of their
  examples and fill-in-the-blanks. Other words get a simple entry from a built-in
  dictionary (WordNet), or you write the meaning yourself.

## If something goes wrong

- **The Shortcut says the key is missing or mistyped**: check the Authorization header is
  `Bearer ` plus the key from Settings, Sync (dashes and spaces don't matter).
- **The Shortcut says the sync server isn't set up**: see `docs/SETUP-SYNC.md`.
- **Nothing happens when you click +Hoard**: allow pop-ups for that site (the icon at the
  right of the address bar), then try again.
