// Product SEO wording built only from a product's real attributes — never
// generic keyword lists. "Natural diamond" is said only for pieces that
// actually carry diamond details (colour, clarity or weight).

interface ProductAttrs {
  name: string;
  metalType?: 'GOLD' | 'PLATINUM' | null;
  purity?: string | null;
  goldColor?: 'YELLOW' | 'ROSE' | 'WHITE' | null;
  diamondColour?: string | null;
  diamondClarity?: string | null;
  diamondWeightCarats?: number | null;
}

// Top-level category name -> singular jewellery type. Categories that aren't
// a jewellery type (Gents, Kids, Gifting…) return null and are left out.
const JEWELLERY_TYPES: Record<string, string> = {
  rings: 'Ring',
  ring: 'Ring',
  earrings: 'Earrings',
  earring: 'Earrings',
  necklaces: 'Necklace',
  necklace: 'Necklace',
  pendants: 'Pendant',
  pendant: 'Pendant',
  bangles: 'Bangle',
  bangle: 'Bangle',
  bracelets: 'Bracelet',
  bracelet: 'Bracelet',
};

export function jewelleryType(rootCategoryName: string | null | undefined): string | null {
  return rootCategoryName ? (JEWELLERY_TYPES[rootCategoryName.trim().toLowerCase()] ?? null) : null;
}

export function hasDiamonds(p: ProductAttrs): boolean {
  return !!(p.diamondColour || p.diamondClarity || (p.diamondWeightCarats ?? 0) > 0);
}

// "9K yellow gold" / "platinum"
export function metalLabel(p: ProductAttrs): string | null {
  if (p.metalType === 'PLATINUM') return 'platinum';
  const colour = p.goldColor ? p.goldColor.toLowerCase() : null;
  const parts = [p.purity, colour, 'gold'].filter(Boolean);
  return p.purity || colour ? parts.join(' ') : null;
}

const MAX_TITLE = 60; // roughly what Google shows before cutting a title off

// "Aurora Ring | Natural Diamond Ring | BOX DIAMONDS" — the middle part is
// added only when it fits in 60 characters and isn't a repeat of the name
// ("Nerina Diamond Pendant | Natural Diamond Pendant | …" said it twice and
// ran long on most products); otherwise just "Name | BOX DIAMONDS".
export function productSeoTitle(p: ProductAttrs, type: string | null): string {
  const short = `${p.name} | BOX DIAMONDS`;
  if (!type || !hasDiamonds(p)) return short;
  const nameSaysIt = /diamond/i.test(p.name) && new RegExp(`\\b${type}`, 'i').test(p.name);
  const full = `${p.name} | Natural Diamond ${type} | BOX DIAMONDS`;
  return nameSaysIt || full.length > MAX_TITLE ? short : full;
}

const MAX_DESCRIPTION = 160;

// "Nerina Diamond Pendant — a natural diamond pendant in 9K yellow gold."
function productSummary(p: ProductAttrs, type: string | null): string {
  const metal = metalLabel(p);
  const what = [hasDiamonds(p) ? 'natural diamond' : null, type ? type.toLowerCase() : 'jewellery']
    .filter(Boolean)
    .join(' ');
  return `${p.name} — a ${what}${metal ? ` in ${metal}` : ''}.`;
}

// Used when the product has no admin-written meta description. Always leads
// with the product's own name and attributes: short descriptions alone were
// shared across many products (97 necklaces had just "9K 16-Inch Classic
// Chain"), which made duplicate meta descriptions. The short description
// is kept after the summary when there's room, then the shop line.
export function productSeoDescription(p: ProductAttrs, type: string | null, shortDescription?: string | null): string {
  let text = productSummary(p, type);
  const extra = shortDescription?.trim().replace(/\s+/g, ' ');
  if (extra) {
    const sentence = /[.!?]$/.test(extra) ? extra : `${extra}.`;
    if (text.length + 1 + sentence.length <= MAX_DESCRIPTION) text += ` ${sentence}`;
  }
  const shop = ' Shop certified diamond jewellery online at BOX DIAMONDS.';
  return text.length + shop.length <= MAX_DESCRIPTION ? text + shop : text;
}

// "Teresa Diamond Oval Bangle, natural diamond bangle in 9K yellow gold"
export function productImageAlt(p: ProductAttrs, type?: string | null): string {
  const metal = metalLabel(p);
  const kind = hasDiamonds(p) && type ? `natural diamond ${type.toLowerCase()}` : null;
  if (kind) return `${p.name}, ${kind}${metal ? ` in ${metal}` : ''}`;
  return metal ? `${p.name} in ${metal}` : p.name;
}
