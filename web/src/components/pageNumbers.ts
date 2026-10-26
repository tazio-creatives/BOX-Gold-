// Which page numbers a pager shows (first few, around the current page, last
// two), with 'ellipsis' for the gaps. Shared by Pagination and the listing
// page links.
export function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  const keep = new Set<number>();
  for (const p of [1, 2, 3, 4, current - 1, current, current + 1, total - 1, total]) {
    if (p >= 1 && p <= total) keep.add(p);
  }
  const sorted = [...keep].sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) result.push('ellipsis');
    result.push(p);
    prev = p;
  }
  return result;
}
