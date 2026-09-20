import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/** Chinese posts migrated from the previous Hexo site. Read-only history. */
const archive = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/archive' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    /** Calendar date as the original site displayed it, in the author's own
     *  timezone. Used for display and year grouping; `date` is the precise
     *  instant, used for sorting and structured metadata. */
    displayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slug: z.string(),
    lang: z.literal('zh'),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
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

export const collections = { archive, notes };
