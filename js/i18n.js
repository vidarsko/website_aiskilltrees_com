/* ==========================================================================
   i18n.js — NO/EN/SV language toggle. Same mechanism as skogvoll.com's
   js/i18n.js, so the two sites behave identically for a visitor, with two
   additions this site needs (see `data-i18n-html` and `window.i18n` below).

   English is the default here, unlike skogvoll.com: the method aims
   internationally and the pages are authored in English, with Norwegian and
   Swedish in the dictionary. A Norwegian or Swedish browser still gets its
   own language on the first visit — the default only decides what an
   unrecognised locale falls back to.

   THE SKILL TREES THEMSELVES ARE NOT TRANSLATED. Each tree under
   /trees/<slug>/ is written in one language by the teacher who made it, and
   that language is a fact about the tree (meta.json `language`), not a view
   of it. This file therefore runs on the landing page and the catalogue
   only; a tree page loads no switcher at all. See AGENTS.md, "Språk".

   Authoring a page against this file:
     <script type="application/json" id="i18n-dict"> { … } </script>
     <span data-i18n="key">English text, verbatim from the dict</span>
     <meta content="…" data-i18n-attr="content:key">
     <p data-i18n-html="key">…with <em>inline</em> markup…</p>
   The static markup must hold the ENGLISH string, because English is the
   default — that way the common case never flashes a wrong language before
   this file runs.
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'lang';

  /* BCP 47 codes, so there is room for 'nn' (nynorsk) beside 'nb' (bokmål)
     later without renaming anything. The catalogue and the tree engine now
     agree: languages/nb.json was already called nb, while the page
     dictionaries said 'no' — that split is gone. */
  var SUPPORTED = ['en', 'nb', 'sv'];
  var DEFAULT_LANG = 'en';

  /* Inbound aliases. A stored 'no' from before 2026-09-20, a ?lang=no link
     that is already out there, and a browser asking for plain Norwegian all
     resolve to bokmål. 'nn' lands here too FOR NOW — a nynorsk reader is
     better served bokmål than English — but the moment 'nn' joins SUPPORTED,
     the exact match below wins and this alias stops applying to it. */
  var ALIASES = { no: 'nb', nn: 'nb', nob: 'nb', nno: 'nb' };

  function normalise(code) {
    if (!code) return null;
    code = String(code).toLowerCase();
    if (SUPPORTED.indexOf(code) !== -1) return code;
    var base = code.split('-')[0];
    if (SUPPORTED.indexOf(base) !== -1) return base;
    if (ALIASES[base] && SUPPORTED.indexOf(ALIASES[base]) !== -1) return ALIASES[base];
    return null;
  }

  /* The code IS the <html lang> value now, so this map is an identity —
     kept as the one place to diverge if a language ever needs to. */
  var HTML_LANG = { en: 'en', nb: 'nb', sv: 'sv' };

  function detectLang() {
    /* ?lang=no beats everything, and is then remembered like a click.
       It exists so another domain can point at a language: ferdighetstre.no
       redirects to aiskilltrees.com/?lang=no. Also makes a link shareable in
       a chosen language. See AGENTS.md, "Domener". */
    var fromUrl = null;
    try { fromUrl = normalise(new URLSearchParams(location.search).get('lang')); } catch (e) {}
    if (fromUrl) {
      try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch (e) {}
      return fromUrl;
    }

    var stored = null;
    try { stored = normalise(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
    if (stored) {
      // Rewrite a legacy 'no' in place, so it is normalised once, not forever.
      try { localStorage.setItem(STORAGE_KEY, stored); } catch (e) {}
      return stored;
    }

    var browserLangs = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < browserLangs.length; i++) {
      var hit = normalise(browserLangs[i]);
      if (hit) return hit;
    }
    return DEFAULT_LANG;
  }

  function loadDict() {
    var el = document.getElementById('i18n-dict');
    if (!el) return {};
    try { return JSON.parse(el.textContent) || {}; } catch (e) {
      console.error('i18n: #i18n-dict is not valid JSON —', e);
      return {};
    }
  }

  var dict = loadDict();
  var current = detectLang();

  /* t(key) — the string in the current language. Falls back to English, then
     to the key itself, so a missing translation degrades to readable English
     rather than to a blank element. Scripts that BUILD markup (catalog.js)
     call this; static markup uses the data-attributes instead. */
  function t(key) {
    var entry = dict[key];
    if (!entry) return key;
    if (entry[current] != null) return entry[current];
    if (entry[DEFAULT_LANG] != null) return entry[DEFAULT_LANG];
    return key;
  }

  function apply(lang) {
    document.documentElement.setAttribute('lang', HTML_LANG[lang] || lang);

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var entry = dict[nodes[i].getAttribute('data-i18n')];
      if (entry && entry[lang] != null) nodes[i].textContent = entry[lang];
    }

    /* Only ever fed strings from this page's own dictionary — never from a
       URL, a fetch or anything a visitor can reach. It exists because a few
       sentences carry an <em>, and splitting those into three text nodes per
       language would be worse than this. */
    var htmlNodes = document.querySelectorAll('[data-i18n-html]');
    for (var h = 0; h < htmlNodes.length; h++) {
      var htmlEntry = dict[htmlNodes[h].getAttribute('data-i18n-html')];
      if (htmlEntry && htmlEntry[lang] != null) htmlNodes[h].innerHTML = htmlEntry[lang];
    }

    var attrNodes = document.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrNodes.length; j++) {
      var node = attrNodes[j];
      var pairs = node.getAttribute('data-i18n-attr').split(',');
      for (var k = 0; k < pairs.length; k++) {
        var parts = pairs[k].split(':');
        var attrEntry = dict[parts[1]];
        if (attrEntry && attrEntry[lang] != null) node.setAttribute(parts[0], attrEntry[lang]);
      }
    }

    var docTitle = dict['doc-title'];
    if (docTitle && docTitle[lang] != null) document.title = docTitle[lang];

    /* Anything that builds its own markup (catalog.js) redraws on this. */
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  /* Read by scripts that generate text. `lang` is a live getter, not a copy,
     so a handler registered before the first switch still sees the truth. */
  /* The visible switcher lives in js/header.js, which renders the whole
     header bar for every page. This file owns the language STATE and the
     translation of page content; it renders no control of its own. */
  window.i18n = {
    t: t,
    get lang() { return current; },
    supported: SUPPORTED.slice(),
    setLang: function (lang) {
      lang = normalise(lang);
      if (!lang || lang === current) return;
      var from = current;
      current = lang;
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
      apply(current);
      if (window.aistTrack) window.aistTrack('language_switch', { language: lang, language_from: from });
    },
    onChange: function (fn) { document.addEventListener('langchange', function (e) { fn(e.detail.lang); }); }
  };

  apply(current);
})();
