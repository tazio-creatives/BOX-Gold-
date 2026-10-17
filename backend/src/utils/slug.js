export function slugify(input) {
  return String(input)
    // Accented letters become their plain form (María → maria) instead of
    // being dropped as separators — previously "María" slugged to "mar-a".
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
