/**
 * The vocabulary of the /reading section.
 *
 * `/reading` holds notes worked through from someone else's material, so the
 * section has two fixed pieces of vocabulary: a closed set of categories, and
 * the shape of the attribution every entry carries.
 */

/**
 * The only categories a reading note may carry. Closed on purpose: the schema
 * validates against this tuple, so a typo fails the content load rather than
 * quietly creating a phantom category with one entry in it.
 */
export const READING_CATEGORIES = [
  'interconnect',
  'gpu',
  'rtl',
  'notebook',
] as const;

export type ReadingCategory = (typeof READING_CATEGORIES)[number];

/**
 * Categories that stay off the front page. `notebook` is personal reading, not
 * technical work: it keeps its own entry under /reading like everything else,
 * but it does not belong in the site's writing index. Stated as a category
 * rather than a slug so the rule holds for entries added later.
 */
export const UNFEATURED_CATEGORIES: readonly ReadingCategory[] = ['notebook'];

/** Whether an entry of this category may appear in the homepage writing index. */
export function isFeatured(category: ReadingCategory): boolean {
  return !UNFEATURED_CATEGORIES.includes(category);
}

/** The upstream work a note was taken from, or a further-reading entry. */
export interface SourceRef {
  title: string;
  url: string;
}

/**
 * Whether a string contains CJK. Source titles are the upstream work's own
 * title, so they are Chinese where the upstream is Chinese; the pages that
 * render them are otherwise English and must mark those runs `zh-CN` so a
 * screen reader does not read them in English.
 *
 * Covers unified ideographs (plus extension A) and the CJK punctuation block,
 * which is enough for the titles this site cites.
 */
export function hasCJK(text: string): boolean {
  return /[　-〿㐀-䶿一-鿿＀-￯]/.test(text);
}

/** `zh-CN` for a Chinese title, `en` otherwise — for a `lang` attribute. */
export function titleLang(title: string): 'zh-CN' | 'en' {
  return hasCJK(title) ? 'zh-CN' : 'en';
}
