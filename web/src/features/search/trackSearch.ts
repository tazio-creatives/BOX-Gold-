import { pixelSearch } from '../../analytics/metaPixel';

// One Meta Pixel Search event per distinct search. The dropdown fires once
// the typed term settles; pressing Enter then opens the results page for
// the same term, which mustn't count it a second time.
let lastTracked: string | null = null;

export function trackSearch(term: string) {
  const key = term.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key || key === lastTracked) return;
  lastTracked = key;
  pixelSearch(term.trim());
}
