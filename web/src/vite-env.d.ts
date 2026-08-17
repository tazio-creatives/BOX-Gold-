/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  // Injected by web/server as an inline <script> before entry-client.tsx
  // runs (plan §1a) — the dehydrated TanStack Query cache from SSR.
  __REACT_QUERY_STATE__?: unknown;
}
