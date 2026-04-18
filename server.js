'use strict';

/**
 * server.js — Express backend for serving MHTML pages as a real website
 *
 * Routes:
 *   GET /                         → Home.mhtml
 *   GET /author                   → Author.mhtml  (sidebar wired, runtime patches)
 *   GET /review                   → Review.mhtml  (Submitted Reviews + Invitations wired)
 *   GET /author/submission        → Start New Submission (Author).mhtml
 *   GET /author/email             → Recent Email (Author).mhtml
 *   GET /author/editing           → English Editing (Author).mhtml (close → history.back)
 *   GET /download/accepted-draft  → streams IJIEOM accepted draft PDF
 *   GET /download/original-files  → streams original paper PDF
 */

const express  = require('express');
const path     = require('path');
const cheerio  = require('cheerio');
const { parseMhtml } = require('./lib/mhtml-parser');
const { buildPage  } = require('./lib/page-builder');
const { ROUTE_MAP  } = require('./lib/routes');

const app  = express();
const PORT = process.env.PORT || 3000;

const MHTML_DIR = path.join(__dirname, 'public');
const R = ROUTE_MAP; // shorthand

// ── Route → MHTML file mapping (uses hash paths) ────────────────────────────
const ROUTES = [
  { path: R['/'],                  file: 'Home.mhtml'                           },
  { path: R['/author'],            file: 'Author.mhtml'                         },
  { path: R['/review'],            file: 'Review.mhtml'                         },
  { path: R['/author/submission'], file: 'Start New Submission (Author).mhtml'  },
  { path: R['/author/email'],      file: 'Recent Email (Author).mhtml'          },
  { path: R['/author/editing'],    file: 'English Editing (Author).mhtml'       },
];

// ── PDF download file paths ────────────────────────────────────────────────
const DOWNLOADS = {
  'accepted-draft': path.join(__dirname, 'IJIEOM-04-2026-0114_Accepted_Draft.pdf'),
  'original-files': path.join(__dirname, 'Selective State Space Models for Real-Time Log Intelligence.pdf'),
};


// ═══════════════════════════════════════════════════════════════════════════
//  Page-specific transforms — applied to the parsed HTML after buildPage()
// ═══════════════════════════════════════════════════════════════════════════

/**
 * /author/editing — Close button and × button both go to previous page.
 */
function transformEditingPage($) {
  $('#closeBtn')
    .attr('href', 'javascript:history.back()')
    .removeAttr('data-dismiss')
    .removeAttr('onclick');

  $('button.close[data-dismiss="modal"], button.close[aria-hidden]').each((_, el) => {
    $(el)
      .attr('onclick', 'history.back(); return false;')
      .removeAttr('data-dismiss');
  });
}

/**
 * /author — Injects a carefully guarded runtime script.
 *
 * KEY DESIGN: The MutationObserver DISCONNECTS before patch() runs and
 * RECONNECTS after. Every DOM write is guarded so it only fires when the
 * value actually needs changing. This prevents the infinite-loop crash that
 * happens when a.textContent= triggers more mutations endlessly.
 */
function transformAuthorPage($) {
  $('body').append(`<script id="__author_patches__">
(function () {
  'use strict';

  var obs = null;

  var LINKS = [
    { text: 'Manuscripts with Decisions',       href: '${R['/author']}' },
    { text: 'Start New Submission',             href: '${R['/author/submission']}' },
    { text: '5 Most Recent E-mails',            href: '${R['/author/email']}' },
    { text: 'English Language Editing Service', href: '${R['/author/editing']}' }
  ];

  function patch() {
    /* ── Step 1: disconnect observer so our DOM writes don't re-trigger ── */
    if (obs) obs.disconnect();

    document.querySelectorAll('a').forEach(function (a) {
      var txt = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var cur = a.getAttribute('href') || '';

      /* Sidebar nav links — skip if href already correct */
      for (var i = 0; i < LINKS.length; i++) {
        if (txt.indexOf(LINKS[i].text) !== -1 && cur !== LINKS[i].href) {
          a.setAttribute('href', LINKS[i].href);
          a.removeAttribute('onclick');
        }
      }

      /* Remove "view decision letter" anchor only (not its parent row) */
      if (txt.toLowerCase().indexOf('view decision letter') !== -1) {
        a.remove();
        return;
      }

      /* "View Submission" → rename + wire download href */
      if (txt === 'View Submission') {
        a.textContent = 'View Accepted Draft';
        a.setAttribute('href', '/download/accepted-draft');
        a.removeAttribute('onclick');
        return;
      }

      /* If already renamed but href is wrong, fix href only (no textContent write) */
      if (txt === 'View Accepted Draft' && cur !== '/download/accepted-draft') {
        a.setAttribute('href', '/download/accepted-draft');
        a.removeAttribute('onclick');
        return;
      }

      /* "[View Original Files]" → download — guard prevents re-trigger */
      if ((txt === 'View Original Files' || txt === '[View Original Files]') &&
           cur !== '/download/original-files') {
        a.setAttribute('href', '/download/original-files');
        a.removeAttribute('onclick');
        return;
      }

      /* "Contact Journal" → Gmail compose in new tab — guard on href */
      if (txt === 'Contact Journal' && cur.indexOf('mail.google.com') === -1) {
        a.setAttribute('href', 'https://mail.google.com/mail/?view=cm&to=editorial.ijieom@gmail.com');
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.removeAttribute('data-dismiss');
        a.removeAttribute('onclick');
      }
    });

    /* ── Step 2: patch text nodes (status text + date) ── */
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      /* Replace date — only if old value still present */
      if (node.nodeValue.indexOf('03-Apr-2026') !== -1) {
        node.nodeValue = node.nodeValue.split('03-Apr-2026').join('02-Jan-2026');
      }
      /* Replace status text — exact match, guarded so it only fires once */
      if (node.nodeValue.indexOf('Immediate Reject (04-Apr-2026)') !== -1) {
        node.nodeValue = node.nodeValue.split('Immediate Reject (04-Apr-2026)')
          .join('Accepted on (04-Apr-2026) will be published on next issue');
      }
    }

    /* ── Step 3: reconnect observer ── */
    if (obs) obs.observe(document.body, { childList: true, subtree: true });
  }

  function setup() {
    patch();
    obs = new MutationObserver(function () { patch(); });
    obs.observe(document.body, { childList: true, subtree: true });
    /* Fallback runs for slow XHR-driven renders */
    setTimeout(patch, 800);
    setTimeout(patch, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

})();
<\/script>`);
}

/**
 * /review — Wires Submitted Reviews + Invitations sidebar items.
 */
function transformReviewPage($) {
  $('body').append(`<script id="__review_patches__">
(function () {
  'use strict';
  var obs = null;
  function patch() {
    if (obs) obs.disconnect();
    document.querySelectorAll('a').forEach(function (a) {
      var txt = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var cur = a.getAttribute('href') || '';
      if ((txt.indexOf('Submitted Reviews') !== -1 || txt.indexOf('Invitations') !== -1) &&
           (!cur || cur === '#')) {
        a.setAttribute('href', '/review');
      }
    });
    if (obs) obs.observe(document.body, { childList: true, subtree: true });
  }
  function setup() {
    patch();
    obs = new MutationObserver(function () { patch(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(patch, 800);
    setTimeout(patch, 2500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
<\/script>`);
}

// Map of route path → transform function
const PAGE_TRANSFORMS = {
  '/author/editing': transformEditingPage,
  '/author':         transformAuthorPage,
  '/review':         transformReviewPage,
};

// ═══════════════════════════════════════════════════════════════════════════
//  Startup: parse & cache all pages
// ═══════════════════════════════════════════════════════════════════════════

const pageCache = new Map();
console.log('\n📦 Parsing MHTML files — this may take a moment...\n');

for (const route of ROUTES) {
  const filePath = path.join(MHTML_DIR, route.file);
  try {
    const { html, resources, baseUrl } = parseMhtml(filePath);
    let   fullHtml                     = buildPage(html, resources, baseUrl);

    const transform = PAGE_TRANSFORMS[route.path];
    if (transform) {
      const $ = cheerio.load(fullHtml, { decodeEntities: false });
      transform($);
      fullHtml = $.html();
    }

    pageCache.set(route.path, fullHtml);
    console.log(`  ✅  ${route.path.padEnd(24)} ← ${route.file}`);
  } catch (err) {
    console.error(`  ❌  ${route.path.padEnd(24)} ← ${route.file}`);
    console.error(`       ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Routes
// ═══════════════════════════════════════════════════════════════════════════

for (const route of ROUTES) {
  app.get(route.path, (req, res) => {
    const html = pageCache.get(route.path);
    if (!html) {
      return res.status(503).send(
        `<h2>Page not loaded</h2><p>Failed to parse: ${route.file}</p>`
      );
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });
}

// ── PDF download routes ────────────────────────────────────────────────────
app.get('/download/:file', (req, res) => {
  const filePath = DOWNLOADS[req.params.file];
  if (!filePath) {
    return res.status(404).send('File not found');
  }
  res.download(filePath, (err) => {
    if (err && !res.headersSent) {
      console.error('Download error:', err.message);
      res.status(500).send('Could not send file');
    }
  });
});

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send(`
    <html><body style="font-family:sans-serif;padding:40px;background:#0f172a;color:#94a3b8;text-align:center;">
      <h1 style="color:#f8fafc">404 — Page not found</h1>
      <p>Available pages:</p>
      ${ROUTES.map(r => `<a href="${r.path}" style="color:#60a5fa;display:block;margin:4px">${r.path}</a>`).join('')}
    </body></html>
  `);
});

// ── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}\n`);
  console.log('  Available routes:');
  for (const route of ROUTES) {
    console.log(`    http://localhost:${PORT}${route.path}`);
  }
  console.log('');
});
