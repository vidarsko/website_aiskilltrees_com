/* ==========================================================================
   analytics.js — Google tag (gtag.js) loader + the site's event helper.
   Include on any page with: <script src="/js/analytics.js"></script>
   in <head>, right after the stylesheets. Same pattern as skogvoll.com.

   GA4 property: G-LMMC13S1J0, created for aiskilltrees.com and used by this
   site ONLY. skogvoll.com has its own separate property (G-V8JLR6J024) and
   is deliberately not merged into this one — decided 2026-09-20, so that
   site's existing history keeps accruing where it already lives. Do not
   paste this ID into another site without Vidar saying so.
   ========================================================================== */
(function () {
  var GA_ID = 'G-LMMC13S1J0';

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_ID);

  /* ------------------------------------------------------------------ */
  /* aistTrack(name, params) — the ONLY way the rest of the site sends an */
  /* event. Two reasons it exists rather than calling gtag() directly:    */
  /*                                                                      */
  /* 1. gtag.js comes from googletagmanager.com, which ad blockers stop.  */
  /*    The stub pushed to dataLayer above still exists, so a blocked     */
  /*    load is harmless — but callers should not have to know that.      */
  /* 2. Every event gets `page_kind` for free, so a copied instruction on */
  /*    the front page and one inside a tree are distinguishable in GA    */
  /*    without each call site remembering to say where it is.            */
  /*                                                                      */
  /* Callers must still guard: `window.aistTrack && window.aistTrack(…)`. */
  /* A page that forgets to load this file should not throw.              */
  /* ------------------------------------------------------------------ */
  function pageKind() {
    var p = location.pathname;
    if (p === '/' || p === '/index.html') return 'landing';
    if (/^\/trees\/?$/.test(p) || /^\/trees\/index\.html$/.test(p)) return 'catalog';
    if (p.indexOf('/trees/') === 0) return 'tree';
    return 'other';
  }

  window.aistTrack = function (name, params) {
    var payload = { page_kind: pageKind() };
    if (params) {
      for (var k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k) && params[k] != null) {
          payload[k] = params[k];
        }
      }
    }
    gtag('event', name, payload);
  };

  /* ------------------------------------------------------------------ */
  /* Declarative CTA tracking. Any element carrying data-track-cta="id"  */
  /* reports a `cta_click` when it is activated — no per-page script.    */
  /*                                                                      */
  /* Worth having on THIS site specifically: the landing page's three     */
  /* entry points ("Make your own", "Research") still point at `#`        */
  /* because the destinations are undecided. Which of them people press   */
  /* while they are dead is the evidence for what to build first.         */
  /*                                                                      */
  /* Delegated on `document`, which exists even though this file runs in  */
  /* <head> before <body> is parsed.                                      */
  /* ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-track-cta]');
    if (!el) return;
    var href = el.getAttribute('href');
    window.aistTrack('cta_click', {
      cta_id: el.getAttribute('data-track-cta'),
      link_url: href || null,
      // A `#` href is a CTA whose destination does not exist yet.
      cta_live: href && href !== '#' ? 'yes' : 'no'
    });
  });
})();
