// Build information, filled in by `define` in vite.config.ts.
declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_BRANCH__: string;

// URL of the word-bank JSON file (scripts/word-bank-plugin.ts).
declare module 'virtual:word-bank' {
  const url: string;
  export default url;
}
