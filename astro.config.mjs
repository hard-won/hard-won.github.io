// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

/**
 * Legacy Hexo URLs -> new archive URLs.
 * Astro emits a meta-refresh redirect page for each of these in a static build,
 * so every old permalink keeps working.
 *
 * `/about/` is NOT listed: it is served natively by src/pages/about.astro, and a
 * self-redirect would collide with that route.
 */
const legacyPosts = {
  '/2018/09/02/hello-world/': 'hello-world',
  '/2022/01/01/ASIC_Syn_1/': 'ASIC_Syn_1',
  '/2024/04/02/PCIe-1/': 'PCIe-1',
  '/2024/04/12/Advanced-Architecture-CA1/': 'Advanced-Architecture-CA1',
  '/2024/04/14/PCIe-2/': 'PCIe-2',
  '/2024/04/14/PCIe-3/': 'PCIe-3',
  '/2024/04/14/Resources/': 'Resources',
  '/2024/04/15/PCIe-4/': 'PCIe-4',
  '/2024/04/17/Encoding/': 'Encoding',
  '/2024/04/18/PCIe-5/': 'PCIe-5',
  '/2024/05/23/RTL-style/': 'RTL-style',
  '/2024/05/29/LifeManual/': 'LifeManual',
  '/2024/06/02/TechQA/': 'TechQA',
  '/2024/06/03/GPU1/': 'GPU1',
  '/2024/06/04/GPU2/': 'GPU2',
  '/2024/06/04/GPU3/': 'GPU3',
};

const redirects = Object.fromEntries(
  Object.entries(legacyPosts).map(([from, slug]) => [from, `/archive/zh/${slug}/`]),
);

// The old Hexo listing pages have no equivalent; send them to the archive index.
for (const from of ['/archives/', '/categories/', '/tags/']) {
  redirects[from] = '/archive/zh/';
}

export default defineConfig({
  site: 'https://hard-won.github.io',
  trailingSlash: 'ignore',
  redirects,
  integrations: [
    mdx(),
    sitemap({
      // Redirect stubs and the legacy listing pages must not be indexed.
      filter: (page) => !/^https:\/\/hard-won\.github\.io\/(2018|2022|2024|archives|categories|tags)\//.test(page),
    }),
  ],
  build: {
    format: 'directory',
  },
});
