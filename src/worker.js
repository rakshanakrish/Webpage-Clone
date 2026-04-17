/**
 * Cloudflare Worker — Page Router
 *
 * Handles ?page= routing and serves MHTML files directly
 * with the correct Content-Type so browsers render them inline.
 *
 * Route map:
 *   /                  → Home.mhtml
 *   /?page=home        → Home.mhtml
 *   /?page=author      → Author.mhtml
 *   /?page=review      → Review.mhtml
 *   /?page=submission  → Start New Submission (Author).mhtml
 *   /?page=email       → Recent Email (Author).mhtml
 *   /?page=editing     → English Editing (Author).mhtml
 */

// ── Route definitions ──────────────────────────────────────────────────────
const ROUTES = {
  "":           "Home.mhtml",
  "home":       "Home.mhtml",
  "author":     "Author.mhtml",
  "review":     "Review.mhtml",
  "submission": "Start New Submission (Author).mhtml",
  "email":      "Recent Email (Author).mhtml",
  "editing":    "English Editing (Author).mhtml",
};

// ── MHTML Content-Type header ──────────────────────────────────────────────
const MHTML_CONTENT_TYPE = 'multipart/related; type="text/html"; charset=UTF-8';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // ── Resolve page key from ?page= query param ───────────────────────────
    const pageKey = (url.searchParams.get("page") || "").toLowerCase().trim();
    const mhtmlFile = ROUTES[pageKey];

    // ── If a valid route was matched, serve its MHTML directly ─────────────
    if (mhtmlFile !== undefined) {
      // Build the internal URL for the asset
      const assetUrl = new URL("/" + encodeURIComponent(mhtmlFile), url.origin);

      try {
        const assetResponse = await env.ASSETS.fetch(assetUrl.toString());

        if (!assetResponse.ok) {
          return new Response(`Page not found: ${mhtmlFile}`, { status: 404 });
        }

        // Return the MHTML body with correct headers so the browser renders it
        return new Response(assetResponse.body, {
          status: 200,
          headers: {
            "Content-Type": MHTML_CONTENT_TYPE,
            "X-Frame-Options": "SAMEORIGIN",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch (err) {
        return new Response(`Error loading page: ${err.message}`, { status: 500 });
      }
    }

    // ── For all other requests (JS, CSS, etc.) pass through to assets ──────
    return env.ASSETS.fetch(request);
  },
};
