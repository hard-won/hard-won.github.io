# Migration: Hexo → Astro

This repository is the GitHub Pages user site for **Shengyi Wei**
(`hard-won.github.io`). In 2026 it was rebuilt from a Hexo blog into an Astro
portfolio. This document records what was there, what was recoverable, what was
lost, and how to work on the site now.

---

## 1. What the old site was

- **Generator:** Hexo 7.2.0
- **Theme:** NexT 7.8.0
- **Language:** Chinese (`lang="zh-CN"`)
- **Title:** 肖恩 Wei's Blog — 数字芯片工程师
- **Content:** 16 posts plus an `/about/` page, published between 2018-09-02
  and 2024-06-04, on PCIe, ASIC synthesis, computer architecture, encoding,
  RTL coding style and GPU microarchitecture.

## 2. Where the source did and did not exist

The repository contained **only Hexo's generated output** — the committed build
artefacts of the site. It did **not** contain, anywhere in the working tree or
in git history:

- `_config.yml`
- `source/` (the original Markdown)
- `themes/`
- `package.json` / any Hexo dependency manifest

Verified with
`git log hexo-final --diff-filter=A --name-only`: across the whole pre-rebuild
history, none of those paths was ever added. (The repository was published with
`hexo-deployer-git`, which pushes only the build output — hence the uniform
"Site updated: …" commit messages.) The `package.json` now at the root is the
new Astro one, added by this rebuild.

The original post Markdown is therefore gone. The only recoverable form of the
content was the rendered HTML.

The pre-existing state of `main` is preserved at the local git tag
**`hexo-final`**. Do not delete it: it is the only record of the old build, and
the migration script's input can be restored from it (see §4).

## 3. How content was extracted

`scripts/migrate-hexo.mjs` is a one-off Node script (kept in the repo for
reference and re-runnability). It:

1. Reads each of the 16 `index.html` files.
2. Parses with **jsdom**, scoping to `.post-block` → `.post-body`.
3. Extracts:
   - **title** from `h1.post-title`, falling back to `og:title` then `<title>`;
   - **date** from the `datetime` attribute of the post header's
     `time[itemprop~="dateCreated"]`;
   - **categories** from `.post-meta [itemprop="about"] [itemprop="name"]`;
   - **tags** from `.post-footer .post-tags a` — deliberately *not* from a
     global `rel="tag"` search, because NexT's sidebar tag cloud also uses
     `rel="tag"` and would contaminate every post with the same three tags.
4. Converts the body to Markdown with **turndown** + **turndown-plugin-gfm**.
5. Writes `src/content/archive/<slug>.md`.

### The code-block problem

NexT does not render highlighted code as `<pre><code>`. It renders a
two-column table — line numbers in one column, code in the other:

```html
<figure class="highlight verilog">
  <table><tr>
    <td class="gutter"><pre><span class="line">1</span><br>…</pre></td>
    <td class="code"><pre><span class="line">…code…</span><br>…</pre></td>
  </tr></table>
</figure>
```

Run through Turndown with the GFM table plugin, this becomes a Markdown table
with line numbers interleaved into the source — unreadable. The script instead
rewrites every `figure.highlight` into a plain
`<pre><code class="language-X">` **before** conversion, taking text from the
`.code` column only and dropping the `.gutter` column. The language comes from
the figure's class list.

Two traps worth recording:

- **Line joining.** The separators between lines are `<br>` elements, so
  reading `textContent` off the code column concatenates every line into one
  with no newlines. The script walks `span.line` children and joins with `\n`.
- **Rule ordering.** Doing this as a Turndown `addRule` instead would require
  registering it *after* `.use(gfm)`, because `addRule` prepends and the GFM
  table rule would otherwise match the figure first. Preprocessing the DOM
  avoids the question entirely.

### Verification

Every post is checked automatically on each run. For each file the script
asserts:

- fenced block count == `figure.highlight` count in the source body
- Markdown image count == `<img>` count in the source body
- Markdown heading count == `<h1>`–`<h6>` count in the source body
- no `class="gutter"`, `class="line"`, `<figure` or `<span class=` survives

Counting is done with a fence-aware scanner, because a naive `grep '^```'`
miscounts twice in this corpus: Turndown widens a fence to ```` ```` ```` when
the content itself contains ```` ``` ```` (TechQA), and a block nested in a
list item is indented (GPU2).

All 16 posts pass. Four were also read manually end to end: **PCIe-4** (tables
and images), **ASIC_Syn_1**, **GPU2** (Verilog blocks, one nested in a list)
and **RTL-style** (ten long Verilog blocks).

### Dates

Frontmatter carries two date fields:

- `date` — the full original timestamp with its UTC offset
  (e.g. `2024-04-15T21:08:30-07:00`), used for sorting and `article:published_time`.
- `displayDate` — the calendar date as the old site rendered it (`2024-04-15`),
  used for display and year grouping.

Both exist because formatting the UTC instant shifts evening-Pacific posts
forward by a day, which would make the displayed date disagree with the old
permalink.

## 4. Re-running the migration

The source HTML is no longer in the working tree. To re-run:

```bash
git restore --source=hexo-final --worktree -- 2018 2022 2024
npm run migrate
rm -rf 2018 2022 2024
```

The script is deterministic: re-running it reproduces the committed Markdown
byte for byte.

## 5. Old → new URL map

Every old permalink still works. `astro.config.mjs` declares these in
`redirects`, and Astro's static build emits a meta-refresh redirect page with
`<meta name="robots" content="noindex">` and a canonical link to the new URL.

| Old URL | New URL |
| --- | --- |
| `/2018/09/02/hello-world/` | `/archive/zh/hello-world/` |
| `/2022/01/01/ASIC_Syn_1/` | `/archive/zh/ASIC_Syn_1/` |
| `/2024/04/02/PCIe-1/` | `/archive/zh/PCIe-1/` |
| `/2024/04/12/Advanced-Architecture-CA1/` | `/archive/zh/Advanced-Architecture-CA1/` |
| `/2024/04/14/PCIe-2/` | `/archive/zh/PCIe-2/` |
| `/2024/04/14/PCIe-3/` | `/archive/zh/PCIe-3/` |
| `/2024/04/14/Resources/` | `/archive/zh/Resources/` |
| `/2024/04/15/PCIe-4/` | `/archive/zh/PCIe-4/` |
| `/2024/04/17/Encoding/` | `/archive/zh/Encoding/` |
| `/2024/04/18/PCIe-5/` | `/archive/zh/PCIe-5/` |
| `/2024/05/23/RTL-style/` | `/archive/zh/RTL-style/` |
| `/2024/05/29/LifeManual/` | `/archive/zh/LifeManual/` |
| `/2024/06/02/TechQA/` | `/archive/zh/TechQA/` |
| `/2024/06/03/GPU1/` | `/archive/zh/GPU1/` |
| `/2024/06/04/GPU2/` | `/archive/zh/GPU2/` |
| `/2024/06/04/GPU3/` | `/archive/zh/GPU3/` |
| `/about/` | `/about/` — **served natively**, not redirected |
| `/archives/`, `/categories/`, `/tags/` | `/archive/zh/` |

`/about/` is not listed in `redirects`: a self-redirect would collide with
`src/pages/about.astro`. The path resolves because the new About page is built
at the same URL. Its *content* is new English text, not a translation of the
old Chinese About page (see §8).

`/archives/`, `/categories/` and `/tags/` were Hexo listing pages with no
equivalent in the new site; they redirect to the archive index rather than 404.

## 6. What was preserved for SEO

- **`public/robots.txt`** — kept, with the `Sitemap:` line updated to
  `https://hard-won.github.io/sitemap-index.xml`.
- **`public/googlebeed87a8a77c79c6.html`** — the Google Search Console
  verification file, copied **byte-identical** (MD5 `39cf75e0…`).
- **`<meta name="google-site-verification" content="iYL9tkwv4TxFVf_3Ge-4SRYl7Vf376N_yQZxc_9eD3w">**
  — present in `<head>` on every page via `BaseLayout.astro`.
- **Per-post images** keep their original absolute paths
  (`public/2024/04/02/PCIe-1/p1.png` etc.), so existing hotlinks to those
  images still resolve. `images/` and `download/` moved to `public/` unchanged.
- **The old static `sitemap.xml` was deleted** so it cannot shadow the sitemap
  generated by `@astrojs/sitemap`. The generated sitemap **excludes** the
  redirect stubs and the legacy listing pages.
- Every page emits a canonical URL, a description, OpenGraph and Twitter card
  meta, and the correct `lang` (`en` for English pages, `zh-CN` for archive
  posts).

## 7. Working on the site

### Run and build

```bash
npm install
npm run dev      # dev server
npm run build    # static build into dist/
npm run preview  # serve dist/
npx astro check  # type check (currently 0 errors, 0 warnings, 0 hints)
```

Node 22 is what CI uses. Node 26 works locally.

Code blocks are highlighted by Shiki with dual themes
(`github-light-high-contrast` / `github-dark-high-contrast`) and
`defaultColor: false`, so the palette follows the site theme. Both palettes
were measured against the code-block background: every token clears 4.5:1 in
both themes.

### Add an English note

Create `src/content/notes/<slug>.md` (or `.mdx`). It is published at
`/notes/<slug>/` and appears on `/notes`, newest first.

```yaml
---
title: "A short descriptive title"
date: 2026-10-01
description: "One sentence. Used for the meta description and OG tags."
tags: ["memory", "noc"]   # optional
draft: false              # optional; true hides it from the build
---
```

### Add a project entry

Edit the `projects` array in `src/data/projects.ts`:

```ts
{
  title: 'Project name',
  summary: 'What it is and what it showed.',
  status: 'shipped',              // 'in design' | 'active' | 'shipped'
  topics: ['memory systems', 'simulation'],
  links: [{ label: 'Repository', href: 'https://github.com/hard-won/…' }],
}
```

Entries with status `in design` render under **Planned directions**. Anything
else renders as real work, on `/projects` **and** in **Selected work** on the
homepage — which is currently empty by design. Do not promote an entry until
there is something to look at.

### Add a contact link

`src/data/site.ts` → `SITE.links`. Adding `{ label: 'LinkedIn', href: '…' }`
makes it appear on both the homepage and `/about` automatically. It is empty
because only the GitHub URL and the email address are confirmed.

### Deployment

`.github/workflows/deploy.yml` builds on push to `main` (and on
`workflow_dispatch`) with `withastro/action@v3` on Node 22, then deploys with
`actions/deploy-pages@v4`.

> **Required settings change:** in the repository settings, **Pages → Build and
> deployment → Source** must be switched from *Deploy from a branch* to
> **GitHub Actions**. Until that is done the workflow runs but the site is not
> served from it.

## 8. Known limitations and lossy conversions

- **The original Markdown is unrecoverable.** Everything in
  `src/content/archive/` is a round-trip through rendered HTML. It is faithful
  in structure and content, but the exact original Markdown formatting (list
  markers, line wrapping, link reference style, HTML comments, Hexo tag
  plugins) is gone.
- **Syntax highlighting metadata is reduced to a language name.** The old site
  shipped pre-highlighted spans; the new site emits plain fenced blocks with a
  language tag, re-highlighted at build time by Shiki. The 38 recovered blocks
  carry `verilog` (18), `bash` (4), `tex` (4), `c` (2), `cpp` (2), `javascript`
  (1) and `python` (1); the remainder had no language on the original
  `figure.highlight` and are emitted as plain fences. Anything NexT encoded
  only in span classes is lost.
- **The old Chinese `/about/` page was dropped by design.** `/about` is new
  English text describing current work. The old page's content was not carried
  over or translated.
- **The NexT sidebar, tag cloud, category tree, "我的微信" WeChat block, post
  navigation and comment integrations are gone.** Only the article body was
  migrated.
- **Only the three legacy index paths redirect.** `/archives/`, `/categories/`
  and `/tags/` go to the archive index, but their sub-pages do not: a deep link
  such as `/categories/技术/数字IC/`, `/tags/NexT/` or a Hexo pagination URL
  like `/page/2/` will 404. Category and tag values are preserved in each
  post's frontmatter, so per-taxonomy pages could be rebuilt later if the
  404s show up in Search Console.
- **Two image files were renamed.** `3:5.png` → `3-5.png` and
  `8b:10b_structure.png` → `8b-10b_structure.png` (both under
  `/2024/04/17/Encoding/`). Colons in paths are legal in URLs but break on
  Windows checkouts and some tooling. Direct links to the two original
  filenames will not resolve; the in-post references were rewritten.
- **`GPU3` has an empty body** and `PCIe-5` is a two-line stub. That is how
  they were published — nothing was lost in conversion.
- **One external link in `PCIe-4` is malformed in the source.** Two URLs were
  joined by a Chinese comma and auto-linked as a single link by the old Hexo
  renderer. It was preserved as-is rather than guessed at.
- **Posts are not translated.** They remain in Chinese, under `/archive/zh`,
  and are not maintained.
- **No analytics, no comments, no search.** The only client-side JavaScript on
  the site is the theme toggle.
