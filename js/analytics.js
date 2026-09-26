/* ==========================================================================
   analytics.js — GoatCounter loader + the site's event helper.
   Include on any page with: <script src="/js/analytics.js"></script>
   in <head>, right after the stylesheets.

   GoatCounter site: aiskilltrees.goatcounter.com. Chosen 2026-09-26 in place
   of Google Analytics: no cookies, nothing stored on the visitor's device,
   no IP addresses kept, so no consent banner. Free for a non-commercial site.

   WHAT THIS SENDS MUST MATCH /privacy/. That page is cited from the paper.
   Add an event, or a detail to one, and the page changes in the same commit.
   ========================================================================== */
(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', 'https://aiskilltrees.goatcounter.com/count');
  s.onload = flush;
  document.head.appendChild(s);

  /* ------------------------------------------------------------------ */
  /* aistTrack(name, params) — the ONLY way the rest of the site sends an */
  /* event. Call sites (and the engine) stay as they were under GA.       */
  /*                                                                      */
  /* GoatCounter has no event properties: an event is a path and a count. */
  /* So the few details worth keeping are folded into the path, e.g.       */
  /* `copy_instruction/node/no-vgs-matte-2p`. DETAILS is a whitelist:      */
  /* a param not named here is never sent, whatever a call site passes.    */
  /*                                                                      */
  /* gc.zgo.at is often blocked by ad blockers. Events fired before the   */
  /* script has loaded wait in `queue`; if it never loads, they are       */
  /* dropped and nothing throws. Callers still guard with                  */
  /* `window.aistTrack && window.aistTrack(…)`.                            */
  /* ------------------------------------------------------------------ */
  var DETAILS = {
    copy_instruction:   ['instruction_kind', 'tree_slug'],
    tree_open:          ['tree_slug'],
    tree_download:      ['tree_slug'],
    random_tree:        ['slug'],
    catalog_filter:     ['facet', 'facet_value'],
    catalog_no_results: ['search_term'],
    cta_click:          ['cta_id'],
    language_switch:    ['language_from', 'language'],
    prompts_language:   ['prompt_language'],
    prompts_family:     ['prompt_family'],
    builder_build:      [],
    builder_copy_errors: [],
    builder_download:   []
  };

  var queue = [];

  function clean(v) {
    return String(v).toLowerCase().trim().replace(/[\s\/]+/g, '-').slice(0, 60);
  }

  function send(path) {
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: path, title: path, event: true });
    } else {
      queue.push(path);
    }
  }

  function flush() {
    while (queue.length) send(queue.shift());
  }

  window.aistTrack = function (name, params) {
    var keys = DETAILS[name];
    if (!keys) return;   // not a listed event: `search` on every keystroke pause, say
    var parts = [name];
    for (var i = 0; i < keys.length; i++) {
      var v = params && params[keys[i]];
      if (v != null && v !== '') parts.push(clean(v));
    }
    send(parts.join('/'));
  };

  /* ------------------------------------------------------------------ */
  /* Declarative CTA tracking. Any element carrying data-track-cta="id"  */
  /* reports a `cta_click` when it is activated — no per-page script.    */
  /* Delegated on `document`, which exists even though this file runs in  */
  /* <head> before <body> is parsed.                                      */
  /* ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-track-cta]');
    if (!el) return;
    window.aistTrack('cta_click', { cta_id: el.getAttribute('data-track-cta') });
  });
})();
