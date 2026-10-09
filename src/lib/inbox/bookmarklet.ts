// The PC bookmarklet (PLAN 13.5): select a word on any web page, click the "+Vocab"
// bookmark, and a small window of the app opens with the word, the sentence around it,
// and the page's title and address. That window saves the capture on the PC (the
// installed app shares its storage) and syncs it to your other devices.

/** Query parameters the capture window reads. */
export const CAPTURE_PARAM = 'capture';

export interface CaptureParams {
  word: string;
  context: string;
  title: string;
  url: string;
}

/** The capture in a page address, or null for a normal start of the app. */
export function captureParams(search: string): CaptureParams | null {
  const q = new URLSearchParams(search);
  if (!q.has(CAPTURE_PARAM)) return null;
  const get = (k: string) => (q.get(k) ?? '').slice(0, 2000);
  return { word: get('w'), context: get('s'), title: get('t'), url: get('u') };
}

/**
 * Runs on the page you are reading. Kept small and old-fashioned: it must work on any site
 * and is stored in a bookmark. The sentence is the one around the selection, within the
 * paragraph (or list item, table cell...) it sits in.
 */
function grab(origin: string) {
  const sel = getSelection();
  const w = String(sel ?? '')
    .trim()
    .slice(0, 100);
  let s = '';
  if (w && sel && sel.rangeCount) {
    const node = sel.getRangeAt(0).startContainer;
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
    const block =
      (el && el.closest('p,li,td,th,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6')) || el;
    const text = ((block as HTMLElement | null)?.innerText || '').replace(/\s+/g, ' ');
    const i = text.indexOf(w);
    if (i >= 0) {
      const head = /^.*[.!?]["')\]]?\s/s.exec(text.slice(0, i));
      const start = head ? head[0].length : 0;
      const n = text.slice(i + w.length).search(/[.!?](\s|$)/);
      const end = n < 0 ? text.length : i + w.length + n + 1;
      s = text.slice(start, end).trim().slice(0, 600);
    }
  }
  const q = new URLSearchParams({ capture: '1', w, s, t: document.title, u: location.href });
  window.open(`${origin}/?${q}`, 'vocab-capture', 'width=440,height=680');
}

/** The bookmark's address for an app served at `origin`. */
export function bookmarklet(origin: string): string {
  // Encoded, because browsers decode "%" sequences in a javascript: address.
  const code = `(${grab.toString()})(${JSON.stringify(origin)});void 0`;
  return `javascript:${encodeURIComponent(code)}`;
}
