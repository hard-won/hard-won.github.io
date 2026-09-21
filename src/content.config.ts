import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { READING_CATEGORIES } from './lib/reading';

/** An upstream work: the one a note was taken from, or a further reading. */
const sourceRef = z.object({
  title: z.string(),
  url: z.string(),
});

/**
 * Reading notes: worked through from someone else's material, and named as
 * such. `source` is the point of the collection — it is what keeps a derivative
 * note from reading as original work — but it is optional, because three of the
 * migrated posts state no source anywhere in their own text and inventing one
 * would be worse than admitting the gap. A note without `source` renders as
 * `SOURCE NOT RECORDED` rather than silently as original writing.
 */
const reading = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reading' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    /** Calendar date as the original site displayed it, in the author's own
     *  timezone. Used for display and year grouping; `date` is the precise
     *  instant, used for sorting and structured metadata. */
    displayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slug: z.string(),
    /** The language of the body. Every entry is still `zh` pending translation. */
    lang: z.enum(['zh', 'en']).default('zh'),
    /** One category from a closed set: a typo fails the build. */
    category: z.enum(READING_CATEGORIES),
    tags: z.array(z.string()).default([]),
    /** The upstream work the note was worked through from. */
    source: sourceRef.optional(),
    /** Everything else the note cites, in the note's own order. */
    furtherReading: z.array(sourceRef).default([]),
    description: z.string().optional(),
    originalUrl: z.string(),
  }),
});

/** New English technical notes. */
const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { reading, notes };
