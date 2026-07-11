/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' when building the read-only static (GitHub Pages) bundle. */
  readonly VITE_STATIC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
