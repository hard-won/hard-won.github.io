/**
 * One-off migration: Hexo 7.2.0 / NexT 7.8.0 generated HTML  ->  Markdown
 * content collection entries under src/content/archive/.
 *
 * There is no Hexo source in this repo (no _config.yml, no source/, no themes/),
 * so the only available input is the rendered output that was committed to the
 * GitHub Pages user site. This script parses that output.
 *
 * Run:  npm run migrate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT_DIR = path.join(ROOT, 'src/content/archive');
const PUBLIC_DIR = path.join(ROOT, 'public');

/** The 16 posts, as old site paths. */
const POSTS = [
  '2018/09/02/hello-world',
  '2022/01/01/ASIC_Syn_1',
  '2024/04/02/PCIe-1',
  '2024/04/12/Advanced-Architecture-CA1',
  '2024/04/14/PCIe-2',
  '2024/04/14/PCIe-3',
  '2024/04/14/Resources',
  '2024/04/15/PCIe-4',
  '2024/04/17/Encoding',
  '2024/04/18/PCIe-5',
  '2024/05/23/RTL-style',
  '2024/05/29/LifeManual',
  '2024/06/02/TechQA',
  '2024/06/03/GPU1',
  '2024/06/04/GPU2',
  '2024/06/04/GPU3',
];

/**
 * Asset filenames containing a colon break on Windows checkouts and on some
 * tooling, so they are renamed on copy and their references rewritten.
 */
const ASSET_RENAMES = new Map([
  ['/2024/04/17/Encoding/3:5.png', '/2024/04/17/Encoding/3-5.png'],
  ['/2024/04/17/Encoding/8b:10b_structure.png', '/2024/04/17/Encoding/8b-10b_structure.png'],
]);

// ---------------------------------------------------------------------------
// Turndown
// ---------------------------------------------------------------------------

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});
turndown.use(gfm);

// Keep <br> as a hard line break rather than dropping it.
turndown.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '\n',
});

// ---------------------------------------------------------------------------
// NexT-specific DOM normalisation, applied BEFORE Turndown runs.
// ---------------------------------------------------------------------------

/**
 * NexT renders highlighted code as:
 *   <figure class="highlight verilog">
 *     <table><tr>
 *       <td class="gutter"><pre><span class="line">1</span><br>...</pre></td>
 *       <td class="code"><pre><span class="line">...code...</span><br>...</pre></td>
 *     </tr></table>
 *   </figure>
 *
 * Naive Turndown (with the gfm table plugin) turns this into a two-column table
 * with line numbers interleaved. We replace the whole figure with a plain
 * <pre><code class="language-X"> so Turndown's built-in fenced-code rule emits a
 * correct fenced block.
 *
 * Note the line-join trap: textContent of td.code pre concatenates every line
 * with no separator, because the newlines are <br> elements. We therefore
 * iterate span.line and join explicitly with "\n".
 */
function normaliseHighlightFigures(doc, body) {
  const figures = body.querySelectorAll('figure.highlight');
  for (const figure of figures) {
    const codeCell = figure.querySelector('td.code') || figure.querySelector('.code');
    let text;
    if (codeCell) {
      const lines = codeCell.querySelectorAll('.line');
      text = lines.length
        ? Array.from(lines).map((l) => l.textContent.replace(/ /g, ' ').replace(/\s+$/, '')).join('\n')
        : codeCell.textContent;
    } else {
      text = figure.textContent;
    }

    const lang = Array.from(figure.classList)
      .filter((c) => c !== 'highlight' && c !== 'plain' && c !== 'plaintext' && c !== 'text')
      .join(' ')
      .trim();

    const pre = doc.createElement('pre');
    const code = doc.createElement('code');
    if (lang) code.className = `language-${lang}`;
    code.textContent = text.replace(/\n+$/, '') + '\n';
    pre.appendChild(code);
    figure.replaceWith(pre);
  }
}

/** Remove NexT scaffolding that has no meaning in Markdown. */
function stripScaffolding(body) {
  for (const sel of ['span#more', 'a.headerlink', '.post-spread', 'script', 'style']) {
    body.querySelectorAll(sel).forEach((el) => el.remove());
  }
  // Empty heading anchors left behind by hexo-renderer-marked.
  body.querySelectorAll('h1 a, h2 a, h3 a, h4 a, h5 a, h6 a').forEach((a) => {
    if (!a.textContent.trim() && !a.querySelector('img')) a.remove();
  });
}

/** Rewrite asset URLs. Images keep their original absolute paths (served from public/). */
function rewriteAssets(body) {
  for (const img of body.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src) continue;
    if (ASSET_RENAMES.has(src)) img.setAttribute('src', ASSET_RENAMES.get(src));
    // NexT lazy-load leaves the real src on data-src.
    const dataSrc = img.getAttribute('data-src');
    if (dataSrc && (!src || src.startsWith('data:'))) {
      img.setAttribute('src', ASSET_RENAMES.get(dataSrc) ?? dataSrc);
    }
  }
  // Old in-site post links point at legacy paths; those are redirected, so leave
  // them alone rather than guessing at rewrites.
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function extract(postPath) {
  const file = path.join(ROOT, postPath, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const article = doc.querySelector('.post-block') || doc.querySelector('article');
  if (!article) throw new Error(`no article container in ${file}`);

  const body = article.querySelector('.post-body');
  if (!body) throw new Error(`no .post-body in ${file}`);

  // Title
  const titleEl = article.querySelector('h1.post-title, .post-title');
  let title = titleEl ? titleEl.textContent.trim() : '';
  if (!title) {
    const og = doc.querySelector('meta[property="og:title"]');
    title = og ? og.getAttribute('content').trim() : doc.title.split('|')[0].trim();
  }

  // Dates, from the post header only.
  const header = article.querySelector('.post-meta') || article;
  const created = header.querySelector('time[itemprop~="dateCreated"], time[itemprop*="datePublished"]');
  const updated = header.querySelector('time[itemprop="dateModified"]');
  const dateEl = created ?? updated;
  const date = dateEl?.getAttribute('datetime');
  if (!date) throw new Error(`no date in ${file}`);
  // The calendar date as the old site rendered it. The datetime attribute
  // carries the author's UTC offset (e.g. 2024-04-15T21:08:30-07:00), so its
  // first ten characters are already the local date; formatting the UTC instant
  // instead would shift evening posts forward by a day.
  const displayDate = date.slice(0, 10);

  // Categories: scoped to the post meta block (the sidebar has its own lists).
  const categories = Array.from(
    header.querySelectorAll('[itemprop="about"] [itemprop="name"]'),
  ).map((el) => el.textContent.trim()).filter(Boolean);

  // Tags: scoped to the post footer (NOT rel="tag" globally — the sidebar
  // tag cloud uses rel="tag" too and would contaminate every post).
  const tags = Array.from(article.querySelectorAll('.post-footer .post-tags a'))
    .map((a) => a.textContent.replace(/^\s*#\s*/, '').trim())
    .filter(Boolean);

  stripScaffolding(body);
  // Counted before normalisation, while the original markup is still intact.
  const figureCount = body.querySelectorAll('figure.highlight').length;
  const headingCount = body.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
  normaliseHighlightFigures(doc, body);
  rewriteAssets(body);

  const markdown = turndown.turndown(body.innerHTML).replace(/\n{3,}/g, '\n\n').trim();

  return {
    slug: postPath.split('/').pop(),
    title,
    date,
    displayDate,
    categories,
    tags,
    originalUrl: `/${postPath}/`,
    markdown,
    // Diagnostics for the post-run assertions.
    counts: {
      figures: figureCount,
      images: body.querySelectorAll('img').length,
      headings: headingCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

const yamlString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const yamlList = (a) => (a.length ? `[${a.map(yamlString).join(', ')}]` : '[]');

function frontmatter(post) {
  return [
    '---',
    `title: ${yamlString(post.title)}`,
    `date: ${post.date}`,
    `displayDate: ${yamlString(post.displayDate)}`,
    `slug: ${yamlString(post.slug)}`,
    'lang: zh',
    `categories: ${yamlList(post.categories)}`,
    `tags: ${yamlList(post.tags)}`,
    `originalUrl: ${yamlString(post.originalUrl)}`,
    '---',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Asset copying
// ---------------------------------------------------------------------------

function copyAssets() {
  const copied = [];
  const copyFile = (from, to) => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(path.relative(ROOT, to));
  };
  const copyTree = (relDir) => {
    const src = path.join(ROOT, relDir);
    if (!fs.existsSync(src)) return;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const rel = path.join(relDir, entry.name);
      if (entry.isDirectory()) copyTree(rel);
      else if (entry.name !== 'index.html' && entry.name !== '.DS_Store') {
        const absFrom = path.join(ROOT, rel);
        const publicRel = ASSET_RENAMES.get('/' + rel.split(path.sep).join('/'))?.slice(1) ?? rel;
        copyFile(absFrom, path.join(PUBLIC_DIR, publicRel));
      }
    }
  };

  // Per-post assets keep their original absolute paths so that old hotlinks to
  // images still resolve after the rebuild.
  for (const p of POSTS) copyTree(p);
  copyTree('images');
  copyTree('download');

  // Preserve verbatim SEO / verification files.
  for (const f of ['robots.txt', 'googlebeed87a8a77c79c6.html']) {
    const from = path.join(ROOT, f);
    if (fs.existsSync(from)) copyFile(from, path.join(PUBLIC_DIR, f));
  }
  return copied;
}

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

/**
 * Count fenced code blocks correctly. Naive `grep -c '^```'` is wrong here for
 * two reasons seen in this corpus: Turndown widens a fence to ```` when the
 * content itself contains ``` (TechQA), and a block nested in a list item is
 * indented (GPU2).
 */
function scanFences(md) {
  let fences = 0;
  let open = null;
  const outsideFences = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\s*(`{3,})/);
    if (m) {
      if (open === null) {
        open = m[1].length;
        continue;
      }
      if (m[1].length >= open && line.trim() === m[1]) {
        fences += 1;
        open = null;
      }
      continue;
    }
    if (open === null) outsideFences.push(line);
  }
  return { fences, outsideFences: outsideFences.join('\n') };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fs.mkdirSync(OUT_DIR, { recursive: true });

const report = [];
for (const p of POSTS) {
  const post = extract(p);
  const out = path.join(OUT_DIR, `${post.slug}.md`);
  fs.writeFileSync(out, frontmatter(post) + post.markdown + '\n', 'utf8');

  const md = post.markdown;
  const { fences, outsideFences } = scanFences(md);
  const mdImages = (outsideFences.match(/!\[/g) || []).length;
  const mdHeadings = (outsideFences.match(/^ {0,3}#{1,6} \S/gm) || []).length;
  // Structural guarantee: every figure.highlight was replaced with a <pre><code>
  // before Turndown ran, so no gutter column or highlight span may survive.
  const leak = /class="(gutter|line)"|<figure|<span class=/.test(md);

  report.push({
    slug: post.slug,
    date: post.date.slice(0, 10),
    bytes: fs.statSync(out).size,
    fences: `${fences}/${post.counts.figures}`,
    images: `${mdImages}/${post.counts.images}`,
    headings: `${mdHeadings}/${post.counts.headings}`,
    leak,
    ok:
      fences === post.counts.figures &&
      mdImages === post.counts.images &&
      mdHeadings === post.counts.headings &&
      !leak,
  });
}

const assets = copyAssets();

console.table(report);
console.log(`\n${report.length} posts written to src/content/archive/`);
console.log(`${assets.length} asset files copied into public/`);
const bad = report.filter((r) => !r.ok);
if (bad.length) {
  console.error('\nFAILED assertions:', bad.map((b) => b.slug).join(', '));
  process.exitCode = 1;
}
