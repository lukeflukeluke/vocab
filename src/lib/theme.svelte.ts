// Light or dark (Settings, Appearance, or the button in the top bar). The choice is kept on
// this device only: a phone and a PC may well want different ones. index.html applies it
// before the first paint, so there is no flash of the wrong theme.

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** Kept in localStorage; index.html reads the same key. */
export const THEME_KEY = 'wordhoard.theme';

/** The top bar's colour in each theme, for the browser's own toolbar (theme-color). */
const BAR: Record<Theme, string> = { light: '#1b2240', dark: '#121629' };

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

class ThemeController {
  choice = $state<ThemeChoice>(stored());
  system = $state<Theme>(darkQuery().matches ? 'dark' : 'light');
  readonly current: Theme = $derived(this.choice === 'system' ? this.system : this.choice);

  constructor() {
    darkQuery().addEventListener('change', (e) => {
      this.system = e.matches ? 'dark' : 'light';
      this.#apply();
    });
    this.#apply();
  }

  set(choice: ThemeChoice): void {
    this.choice = choice;
    try {
      if (choice === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch {
      // Storage blocked: the choice lasts until the app is closed.
    }
    this.#apply();
  }

  /** The top-bar button: switch to the other theme. */
  toggle(): void {
    this.set(this.current === 'dark' ? 'light' : 'dark');
  }

  #apply(): void {
    const theme = this.choice === 'system' ? this.system : this.choice;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
  }
}

export const theme = new ThemeController();
