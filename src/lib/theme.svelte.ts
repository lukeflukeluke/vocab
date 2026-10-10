import { flushSync } from 'svelte';

// Light or dark (Settings, Appearance, or the button in the top bar). The choice is kept on
// this device only: a phone and a PC may well want different ones. index.html applies it
// before the first paint, so there is no flash of the wrong theme.
//
// A switch made by a tap is animated: the new theme spreads in a circle from the button
// (the View Transitions API, where the browser has it), with stars for dark and a glow for
// light (ThemeFx.svelte). Nothing moves for people who ask for reduced motion.

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** A switch to animate: which theme, and where on the screen it starts. */
export interface ThemeFlash {
  id: number;
  to: Theme;
  x: number;
  y: number;
}

/** How long the circle takes to cover the screen. Must match the duration in src/app.css. */
export const REVEAL_MS = 700;

/** Kept in localStorage; index.html reads the same key. */
export const THEME_KEY = 'wordhoard.theme';

/** The top bar's colour in each theme, for the browser's own toolbar (theme-color). */
const BAR: Record<Theme, string> = { light: '#0b0c12', dark: '#0b0c12' };

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

class ThemeController {
  choice = $state<ThemeChoice>(stored());
  system = $state<Theme>(darkQuery().matches ? 'dark' : 'light');
  readonly current: Theme = $derived(this.choice === 'system' ? this.system : this.choice);
  /** The switch being animated, for ThemeFx. */
  flash = $state<ThemeFlash | null>(null);
  #flashes = 0;

  constructor() {
    darkQuery().addEventListener('change', (e) => {
      this.system = e.matches ? 'dark' : 'light';
      this.#apply();
    });
    this.#apply();
  }

  /**
   * Changes the theme. With `from` (the element tapped), the change is animated from
   * there when the theme actually changes.
   */
  set(choice: ThemeChoice, from?: Element): void {
    const before = this.current;
    const commit = () => {
      this.choice = choice;
      try {
        if (choice === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, choice);
      } catch {
        // Storage blocked: the choice lasts until the app is closed.
      }
      this.#apply();
    };
    const after = choice === 'system' ? this.system : choice;
    if (!from || after === before || reducedMotion()) {
      commit();
      return;
    }

    const box = from.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const flash = { id: ++this.#flashes, to: after, x, y };
    if (!('startViewTransition' in document)) {
      commit();
      this.flash = flash;
      return;
    }
    // The browser pictures the page before and after. The new picture is revealed by a CSS
    // circle (theme-reveal in src/app.css) that starts from the tapped point, so it is
    // clipped from the first frame. The circle's centre and final radius are set first.
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const style = document.documentElement.style;
    style.setProperty('--reveal-x', `${x}px`);
    style.setProperty('--reveal-y', `${y}px`);
    style.setProperty('--reveal-r', `${radius}px`);
    // flushSync draws the new theme's screen (icons included) before the picture.
    const transition = document.startViewTransition(() => flushSync(commit));
    // The page is a still picture while the circle grows, so the stars or glow come after.
    void transition.finished.then(() => (this.flash = flash)).catch(() => undefined);
  }

  /** The top-bar button: switch to the other theme. */
  toggle(from?: Element): void {
    this.set(this.current === 'dark' ? 'light' : 'dark', from);
  }

  #apply(): void {
    const theme = this.choice === 'system' ? this.system : this.choice;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
  }
}

export const theme = new ThemeController();
