---
title: "Rebuilding this site"
date: 2026-09-20
description: "Why this site moved from a Hexo blog to a small static portfolio, and how the sixteen old Chinese posts were recovered without any Hexo source."
tags: ["meta"]
---

This site used to be a Hexo 7.2 blog on the NexT theme. The problem was not the
generator — it was the shape. A reverse-chronological feed answers the question
"what did you post most recently", and that is not the question I want this
site to answer.

So it is now a portfolio: a small number of pages that say what I work on, and
an archive that keeps the old writing reachable.

## Recovering the old posts

The repository only ever contained Hexo's *generated output*. There was no
`_config.yml`, no `source/`, no `themes/` directory — nothing in the git
history either. The original Markdown was gone.

What remained was sixteen rendered `index.html` files, which is enough. A
one-off script (`scripts/migrate-hexo.mjs`) parses each one, pulls the title,
date and categories out of the NexT markup, and converts the article body back
to Markdown with Turndown.

The part that needed care was code blocks. NexT does not render highlighted
code as `<pre><code>`; it renders a two-column table, line numbers in one
column and code in the other:

```html
<figure class="highlight verilog">
  <table><tr>
    <td class="gutter"><pre><span class="line">1</span><br>…</pre></td>
    <td class="code"><pre><span class="line">…</span><br>…</pre></td>
  </tr></table>
</figure>
```

Run that through Turndown with the GFM table plugin and you get a Markdown
table with line numbers interleaved into the source. The fix is to rewrite each
figure into a plain `<pre><code class="language-verilog">` *before* conversion.
One trap there: the newlines between lines are `<br>` elements, so reading
`textContent` off the code column concatenates every line into one. You have to
walk `span.line` and join with `\n` yourself.

Everything else was verified by counting: fenced blocks against `figure`
elements, images against `<img>`, headings against `<h1>`–`<h6>`, per post.

## URLs

Every old permalink still resolves. Astro emits a redirect page for each of the
sixteen legacy paths, and the per-post images kept their original locations, so
old links to those images work too.
