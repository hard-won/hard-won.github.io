// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

/**
 * Every URL this site has ever published for a post, and where it goes now.
 *
 * Two generations of permalink point at the same content: the original Hexo
 * `/YYYY/MM/DD/<slug>/`, and `/archive/zh/<slug>/` from the first rebuild. Both
 * were live, so both are redirected. Astro emits a meta-refresh page for each
 * in a static build, so every old permalink keeps working.
 *
 * Four of the sixteen have no destination of their own any more:
 *   - `hello-world` was the 2018 Hexo default post, and `TechQA` was retired;
 *     both go to the section index.
 *   - `GPU3` and `PCIe-5` were empty stubs of a series, so each goes to the
 *     post that precedes it rather than to a page that says nothing.
 *   - `Resources` was a link list, not a note, and is now its own page.
 *
 * `/about/` is NOT listed: it is served natively by src/pages/about.astro, and
 * a self-redirect would collide with that route.
 */
const postDates = {
  'hello-world': '2018/09/02',
  ASIC_Syn_1: '2022/01/01',
  'PCIe-1': '2024/04/02',
  'Advanced-Architecture-CA1': '2024/04/12',
  'PCIe-2': '2024/04/14',
  'PCIe-3': '2024/04/14',
  Resources: '2024/04/14',
  'PCIe-4': '2024/04/15',
  Encoding: '2024/04/17',
  'PCIe-5': '2024/04/18',
  'RTL-style': '2024/05/23',
  LifeManual: '2024/05/29',
  TechQA: '2024/06/02',
  GPU1: '2024/06/03',
  GPU2: '2024/06/04',
  GPU3: '2024/06/04',
};

/** Where each old slug resolves now. Absent from /reading => somewhere else. */
const movedElsewhere = {
  'hello-world': '/reading/',
  TechQA: '/reading/',
  Resources: '/links/',
  GPU3: '/reading/GPU2/',
  'PCIe-5': '/reading/PCIe-4/',
};

const redirects = {};
for (const [slug, date] of Object.entries(postDates)) {
  const to = movedElsewhere[slug] ?? `/reading/${slug}/`;
  redirects[`/${date}/${slug}/`] = to;
  redirects[`/archive/zh/${slug}/`] = to;
}

// The old archive index, and the Hexo listing pages that never had an
// equivalent, all point at the section that replaced them.
for (const from of ['/archive/zh/', '/archives/', '/categories/', '/tags/']) {
  redirects[from] = '/reading/';
}

export default defineConfig({
  site: 'https://hard-won.github.io',
  trailingSlash: 'ignore',
  redirects,
  integrations: [
    mdx(),
    sitemap({
      // Redirect stubs and the legacy listing pages must not be indexed.
      filter: (page) =>
        !/^https:\/\/hard-won\.github\.io\/(2018|2022|2024|archive|archives|categories|tags)\//.test(
          page,
        ),
    }),
  ],
  markdown: {
    shikiConfig: {
      // Dual themes with no default colour: Shiki emits both palettes as CSS
      // variables and global.css picks one, so code blocks follow the site
      // theme instead of pinning a dark block onto a light page.
      themes: { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
      defaultColor: false,
      wrap: false,
    },
  },
  build: {
    format: 'directory',
  },
});
