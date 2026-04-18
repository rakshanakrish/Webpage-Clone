'use strict';

/**
 * lib/page-builder.js
 * Takes parsed MHTML data and produces a fully self-contained HTML string:
 *   - All image src  → data URIs
 *   - All <link CSS> → inline <style>
 *   - All <script src> → inline <script>
 *   - url() in CSS  → data URIs
 *   - Injects Font Awesome CDN so all icons render correctly
 *   - Rewires ALL navigation links to Express routes on EVERY page
 */

const cheerio = require('cheerio');
const { URL }  = require('url');

// ── URL resolution ─────────────────────────────────────────────────────────
function resolveUrl(base, rel) {
  if (!rel || rel.startsWith('data:')) return rel;
  try { return new URL(rel, base).href; } catch { return rel; }
}

// ── Resource lookup — tries exact, then resolved ───────────────────────────
function getRes(resources, url, base) {
  if (!url || url.startsWith('data:')) return null;
  if (resources.has(url))                   return resources.get(url);
  if (base) {
    const resolved = resolveUrl(base, url);
    if (resources.has(resolved))             return resources.get(resolved);
  }
  return null;
}

// ── Convert resource to data URI ───────────────────────────────────────────
function dataUri(res) {
  return `data:${res.contentType};base64,${res.data.toString('base64')}`;
}

// ── Rewrite url() references inside a CSS string ───────────────────────────
function rewriteCss(css, resources, base) {
  return css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g, (match, q, url) => {
    const res = getRes(resources, url, base);
    return res ? `url(${dataUri(res)})` : match;
  });
}

// ── Global link rules — applied on EVERY page ─────────────────────────────
//
// Each rule matches <a> elements by:
//   iconClass  — the <a> contains a child <i> with this FA class
//   text       — the <a>'s text content contains this string
//
// ALL rules run on ALL pages so tab/sidebar navigation works from anywhere.
//
const { ROUTE_MAP } = require('./routes');

const R = ROUTE_MAP; // shorthand

const GLOBAL_LINKS = [
  // Main tab navigation (matched by Font Awesome icon class)
  { iconClass: 'fa-home',      href: R['/']                  },  // Home tab
  { iconClass: 'fa-pencil',    href: R['/author']            },  // Author tab
  { iconClass: 'fa-comment-o', href: R['/review']            },  // Review tab

  // Author sidebar links (matched by text content)
  { text: 'Manuscripts with Decisions',       href: R['/author']            },
  { text: 'Start New Submission',             href: R['/author/submission'] },
  { text: '5 Most Recent E-mails',            href: R['/author/email']      },
  { text: 'English Language Editing Service', href: R['/author/editing']    },
];


/**
 * Rewire all known navigation anchors on the page to Express routes.
 * Runs on EVERY page so clicking any tab/sidebar link from anywhere works.
 */
function fixLinks($) {
  for (const rule of GLOBAL_LINKS) {

    if (rule.iconClass) {
      $(`a i.${rule.iconClass}`).each((_, icon) => {
        const $a = $(icon).closest('a');
        $a.attr('href', rule.href);
        $a.removeAttr('onclick');
      });
    }

    if (rule.text) {
      $('a').each((_, el) => {
        const $a   = $(el);
        const text = $a.text().replace(/\s+/g, ' ').trim();
        if (text.includes(rule.text)) {
          $a.attr('href', rule.href);
          $a.removeAttr('onclick');
        }
      });
    }
  }
}

// ── Main builder ───────────────────────────────────────────────────────────
function buildPage(html, resources, baseUrl) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // ── 1. Inject Font Awesome 4.7 CDN so all fa-* icons render correctly ──
  //    The MHTML embeds FA CSS but webfont binary files are often missing,
  //    causing empty square placeholder boxes instead of icons.
  $('head').prepend(
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css" />'
  );

  // ── 2. Inline all stylesheets ──────────────────────────────────────────
  $('link[rel="stylesheet"], link[type="text/css"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const res = getRes(resources, href, baseUrl);
    if (res) {
      const css = rewriteCss(res.data.toString('utf8'), resources, href);
      $(el).replaceWith(`<style>\n${css}\n</style>`);
    }
  });

  // ── 3. Rewrite <img src> ───────────────────────────────────────────────
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    const res = getRes(resources, src, baseUrl);
    if (res) $(el).attr('src', dataUri(res));
  });

  // ── 4. Rewrite inline style= url() references ─────────────────────────
  $('[style]').each((_, el) => {
    const s = $(el).attr('style') || '';
    if (s.includes('url(')) {
      $(el).attr('style', rewriteCss(s, resources, baseUrl));
    }
  });

  // ── 5. Inline all external scripts ────────────────────────────────────
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    const res = getRes(resources, src, baseUrl);
    if (res) {
      $(el).removeAttr('src').html(res.data.toString('utf8'));
    }
  });

  // ── 6. Rewrite background images in <body>, <table> etc ───────────────
  $('[background]').each((_, el) => {
    const bg  = $(el).attr('background');
    const res = getRes(resources, bg, baseUrl);
    if (res) $(el).attr('background', dataUri(res));
  });

  // ── 7. Fix <link rel="icon"> ──────────────────────────────────────────
  $('link[rel~="icon"]').each((_, el) => {
    const href = $(el).attr('href');
    const res  = getRes(resources, href, baseUrl);
    if (res) $(el).attr('href', dataUri(res));
  });

  // ── 8. Wire ALL navigation links on this page to Express routes ────────
  fixLinks($);

  return $.html();
}

module.exports = { buildPage };
