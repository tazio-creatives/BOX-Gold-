// The one place the results-page URL is built (dropdown link, Enter key).
export function searchResultsUrl(q: string, page = 1): string {
  const params = new URLSearchParams({ q: q.trim() });
  if (page > 1) params.set('page', String(page));
  return `/search?${params.toString()}`;
}
