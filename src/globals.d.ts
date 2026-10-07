// Build information, filled in by `define` in vite.config.ts.
declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_BRANCH__: string;

// Every word-bank entry, joined with candidate data at build time (scripts/word-bank-plugin.ts).
declare module 'virtual:word-bank' {
  const entries: import('./lib/content/bank').BankEntry[];
  export default entries;
}
