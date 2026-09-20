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
  var SUPPORTED = ['en', 'no', 'sv'];
  var DEFAULT_LANG = 'en';

  /* The value for <html lang>. 'no' is what the UI and localStorage call it
     (it is what the button says); 'nb' is what a browser and a screen reader
     need, since the copy is bokmål. */
  var HTML_LANG = { en: 'en', no: 'nb', sv: 'sv' };

  function detectLang() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;

    var browserLangs = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < browserLangs.length; i++) {
      var code = (browserLangs[i] || '').toLowerCase();
      if (code.indexOf('sv') === 0) return 'sv';
      if (code.indexOf('no') === 0 || code.indexOf('nb') === 0 || code.indexOf('nn') === 0) return 'no';
      if (code.indexOf('en') === 0) return 'en';
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

    var buttons = document.querySelectorAll('.lang-btn');
    for (var b = 0; b < buttons.length; b++) {
      var isActive = buttons[b].getAttribute('data-lang') === lang;
      buttons[b].classList.toggle('is-active', isActive);
      buttons[b].setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    /* Anything that builds its own markup (catalog.js) redraws on this. */
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  /* Read by scripts that generate text. `lang` is a live getter, not a copy,
     so a handler registered before the first switch still sees the truth. */
  window.i18n = {
    t: t,
    get lang() { return current; },
    supported: SUPPORTED.slice(),
    onChange: function (fn) { document.addEventListener('langchange', function (e) { fn(e.detail.lang); }); }
  };

  apply(current);

  var switchEl = document.querySelector('.lang-switch');
  if (switchEl) {
    switchEl.addEventListener('click', function (event) {
      var btn = event.target.closest('.lang-btn');
      if (!btn) return;
      var lang = btn.getAttribute('data-lang');
      if (!lang || lang === current) return;
      var from = current;
      current = lang;
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
      apply(current);
      if (window.aistTrack) window.aistTrack('language_switch', { language: lang, language_from: from });
    });
  }
})();
