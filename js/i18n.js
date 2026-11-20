/* ==========================================================================
   i18n.js — the site's language state and the translation of page content.

   From 2026-11-19 the site has many languages, not three, and the
   translations no longer live inside each page:

     - English is inline. Each page's #i18n-dict holds the English strings
       (and the static markup holds them too), so the default needs no fetch
       and never flashes.
     - Every other language is a file, /i18n/<lang>/<page>.json, fetched when
       that language is chosen. <meta name="i18n-page" content="<page>">
       says which file. Site chrome (header, language menu, footer, the ?
       bubbles) is /i18n/<lang>/_site.json.
     - Which languages a page EXISTS in is <meta name="i18n-available">,
       written by tools/i18n-sync.py from the files that exist. The language
       menu in js/header.js shows those first and greys out the rest.

   THE SKILL TREES THEMSELVES ARE NOT TRANSLATED. Each tree under
   /trees/<slug>/ is written in one language by the teacher who made it;
   a tree page loads no switcher at all. See AGENTS.md, "Språk".

   Authoring a page against this file:
     <meta name="i18n-page" content="about">
     <script type="application/json" id="i18n-dict"> { "key": { "en": "…" } } </script>
     <span data-i18n="key">English text, verbatim from the dict</span>
     <meta content="…" data-i18n-attr="content:key">
     <p data-i18n-html="key">…with <em>inline</em> markup…</p>
   ========================================================================== */
(function () {
  'use strict';

  /* Every language the site can be shown in. `name` is the endonym, so the
     menu reads the same whichever language is active. `short` is what the
     header button shows; NO reads better than NB to a Norwegian. Hebrew is
     left out on purpose until the right-to-left layout is designed. */
  var LANGS = [
    { code: 'en',  short: 'EN',  name: 'English' },
    { code: 'sq',  short: 'SQ',  name: 'Shqip' },
    { code: 'az',  short: 'AZ',  name: 'Azərbaycanca' },
    { code: 'bs',  short: 'BS',  name: 'Bosanski' },
    { code: 'cnr', short: 'CNR', name: 'Crnogorski' },
    { code: 'cs',  short: 'CS',  name: 'Čeština' },
    { code: 'da',  short: 'DA',  name: 'Dansk' },
    { code: 'de',  short: 'DE',  name: 'Deutsch' },
    { code: 'et',  short: 'ET',  name: 'Eesti' },
    { code: 'es',  short: 'ES',  name: 'Español' },
    { code: 'fr',  short: 'FR',  name: 'Français' },
    { code: 'hr',  short: 'HR',  name: 'Hrvatski' },
    { code: 'is',  short: 'IS',  name: 'Íslenska' },
    { code: 'it',  short: 'IT',  name: 'Italiano' },
    { code: 'lv',  short: 'LV',  name: 'Latviešu' },
    { code: 'lt',  short: 'LT',  name: 'Lietuvių' },
    { code: 'hu',  short: 'HU',  name: 'Magyar' },
    { code: 'mt',  short: 'MT',  name: 'Malti' },
    { code: 'nl',  short: 'NL',  name: 'Nederlands' },
    { code: 'nb',  short: 'NO',  name: 'Norsk' },
    { code: 'uz',  short: 'UZ',  name: 'Oʻzbekcha' },
    { code: 'pl',  short: 'PL',  name: 'Polski' },
    { code: 'pt',  short: 'PT',  name: 'Português' },
    { code: 'ro',  short: 'RO',  name: 'Română' },
    { code: 'sk',  short: 'SK',  name: 'Slovenčina' },
    { code: 'sl',  short: 'SL',  name: 'Slovenščina' },
    { code: 'fi',  short: 'FI',  name: 'Suomi' },
    { code: 'sv',  short: 'SV',  name: 'Svenska' },
    { code: 'tr',  short: 'TR',  name: 'Türkçe' },
    { code: 'el',  short: 'EL',  name: 'Ελληνικά' },
    { code: 'be',  short: 'BE',  name: 'Беларуская' },
    { code: 'bg',  short: 'BG',  name: 'Български' },
    { code: 'kk',  short: 'KK',  name: 'Қазақ тілі' },
    { code: 'ky',  short: 'KY',  name: 'Кыргызча' },
    { code: 'mk',  short: 'MK',  name: 'Македонски' },
    { code: 'ru',  short: 'RU',  name: 'Русский' },
    { code: 'sr',  short: 'SR',  name: 'Српски' },
    { code: 'tg',  short: 'TG',  name: 'Тоҷикӣ' },
    { code: 'uk',  short: 'UK',  name: 'Українська' },
    { code: 'ka',  short: 'KA',  name: 'ქართული' },
    { code: 'hy',  short: 'HY',  name: 'Հայերեն' }
  ];
  var SUPPORTED = LANGS.map(function (l) { return l.code; });
  var DEFAULT_LANG = 'en';

  /* Inbound aliases. A stored 'no' from before 2026-09-20, a ?lang=no link
     already out there, and a browser asking for plain Norwegian all resolve
     to bokmål; so does nynorsk, until 'nn' exists. A Montenegrin browser
     often reports sr-ME. */
  var ALIASES = { no: 'nb', nn: 'nb', nob: 'nb', nno: 'nb', me: 'cnr' };

  function normalise(code) {
    if (!code) return null;
    code = String(code).toLowerCase();
    if (code === 'sr-me' || code.indexOf('sr-latn-me') === 0) return 'cnr';
    if (SUPPORTED.indexOf(code) !== -1) return code;
    var base = code.split('-')[0];
    if (SUPPORTED.indexOf(base) !== -1) return base;
    if (ALIASES[base] && SUPPORTED.indexOf(ALIASES[base]) !== -1) return ALIASES[base];
    return null;
  }

  function meta(name) {
    var m = document.querySelector('meta[name="' + name + '"]');
    return m ? m.getAttribute('content') : null;
  }

  /* The languages THIS page exists in. Without the meta, English only. */
  var AVAILABLE = (meta('i18n-available') || 'en').split(/\s+/).map(normalise).filter(Boolean);
  if (!AVAILABLE.length) AVAILABLE = [DEFAULT_LANG];
  var PAGE = meta('i18n-page');

  /* NOTHING IS STORED. The choice lives in the URL (?lang=xx), so the site
     writes nothing to the visitor's device (see /privacy/). The order is
       1. ?lang=xx   2. the browser's own language list   3. English,
     each only if THIS page exists in that language. A ?lang= this page
     lacks is kept in the URL, so the next page that has it uses it. */
  function urlLang() {
    try { return normalise(new URLSearchParams(location.search).get('lang')); } catch (e) { return null; }
  }
  function browserLangs() {
    var list = navigator.languages || [navigator.language || ''];
    return list.map(normalise).filter(Boolean);
  }
  function detectLang() {
    var wanted = [urlLang()].concat(browserLangs());
    for (var i = 0; i < wanted.length; i++) {
      if (wanted[i] && AVAILABLE.indexOf(wanted[i]) !== -1) return wanted[i];
    }
    return AVAILABLE.indexOf(DEFAULT_LANG) !== -1 ? DEFAULT_LANG : AVAILABLE[0];
  }

  function writeUrl(lang) {
    try {
      var url = new URL(location.href);
      var browser = browserLangs()[0] || DEFAULT_LANG;
      if (lang === browser) url.searchParams.delete('lang');
      else url.searchParams.set('lang', lang);
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function loadDict() {
    var el = document.getElementById('i18n-dict');
    if (!el) return {};
    try { return JSON.parse(el.textContent) || {}; } catch (e) {
      console.error('i18n: #i18n-dict is not valid JSON —', e);
      return {};
    }
  }

  var dict = loadDict();          // { key: { en: '…', fr: '…' } }
  var site = { en: null };        // { lang: { key: '…' } } — site chrome
  var loaded = { en: true };
  var current = DEFAULT_LANG;

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.json();
    });
  }

  /* Fetch a language's page file and site file once, and fold them into
     the dictionaries. English site chrome is fetched too: header.js and
     footer.js carry only a fallback. */
  function ensure(lang) {
    if (loaded[lang] === true) return Promise.resolve();
    if (loaded[lang]) return loaded[lang];
    var jobs = [fetchJson('/i18n/' + lang + '/_site.json').then(function (d) { site[lang] = d; }, function () {})];
    if (PAGE && lang !== DEFAULT_LANG) {
      jobs.push(fetchJson('/i18n/' + lang + '/' + PAGE + '.json').then(function (d) {
        Object.keys(d).forEach(function (k) {
          if (k.charAt(0) === '_') return;
          (dict[k] = dict[k] || {})[lang] = d[k];
        });
      }, function (e) { console.error('i18n:', e); }));
    }
    loaded[lang] = Promise.all(jobs).then(function () { loaded[lang] = true; });
    return loaded[lang];
  }

  /* t(key) — the page string in the current language, else English, else
     the key itself. Scripts that BUILD markup call this. */
  function t(key) {
    var entry = dict[key];
    if (!entry) return key;
    if (entry[current] != null) return entry[current];
    if (entry[DEFAULT_LANG] != null) return entry[DEFAULT_LANG];
    return key;
  }

  /* s(key, fallback) — a site-chrome string (header, footer, ?-bubbles). */
  function s(key, fallback) {
    var d = site[current];
    if (d && d[key] != null) return d[key];
    d = site[DEFAULT_LANG];
    if (d && d[key] != null) return d[key];
    return fallback != null ? fallback : key;
  }

  function apply(lang) {
    document.documentElement.setAttribute('lang', lang);

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var entry = dict[nodes[i].getAttribute('data-i18n')];
      if (entry) nodes[i].textContent = entry[lang] != null ? entry[lang] : entry[DEFAULT_LANG];
    }

    /* Only ever fed strings from this site's own dictionary files — never
       from a URL, a form or anything a visitor can reach. */
    var htmlNodes = document.querySelectorAll('[data-i18n-html]');
    for (var h = 0; h < htmlNodes.length; h++) {
      var htmlEntry = dict[htmlNodes[h].getAttribute('data-i18n-html')];
      if (htmlEntry) htmlNodes[h].innerHTML = htmlEntry[lang] != null ? htmlEntry[lang] : htmlEntry[DEFAULT_LANG];
    }

    var attrNodes = document.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrNodes.length; j++) {
      var node = attrNodes[j];
      var pairs = node.getAttribute('data-i18n-attr').split(',');
      for (var k = 0; k < pairs.length; k++) {
        var parts = pairs[k].split(':');
        var attrEntry = dict[parts[1]];
        if (attrEntry) node.setAttribute(parts[0], attrEntry[lang] != null ? attrEntry[lang] : attrEntry[DEFAULT_LANG]);
      }
    }

    var docTitle = dict['doc-title'];
    if (docTitle) document.title = docTitle[lang] != null ? docTitle[lang] : docTitle[DEFAULT_LANG];

    document.documentElement.classList.remove('i18n-pending');
    /* Anything that builds its own markup (header, catalogue …) redraws on this. */
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  function switchTo(lang) {
    return ensure(lang).then(function () {
      if (lang !== DEFAULT_LANG) ensure(DEFAULT_LANG);
      current = lang;
      apply(lang);
    });
  }

  window.i18n = {
    t: t,
    s: s,
    get lang() { return current; },
    languages: LANGS.slice(),
    available: AVAILABLE.slice(),
    supported: SUPPORTED.slice(),
    setLang: function (lang) {
      lang = normalise(lang);
      if (!lang || lang === current || AVAILABLE.indexOf(lang) === -1) return;
      var from = current;
      writeUrl(lang);
      switchTo(lang);
      if (window.aistTrack) window.aistTrack('language_switch', { language: lang, language_from: from });
    },
    onChange: function (fn) { document.addEventListener('langchange', function (e) { fn(e.detail.lang); }); }
  };

  /* Carry an explicit ?lang= to the next page on this site. Only links
     between the site's content pages: a tree has no switcher and is in its
     own language whatever the URL says. */
  document.addEventListener('click', function (e) {
    var lang = urlLang();
    if (!lang) return;
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    if (/^\/trees\/[^\/]+\//.test(url.pathname) || url.pathname.indexOf('/assets/') === 0) return;
    if (url.searchParams.has('lang')) return;
    url.searchParams.set('lang', lang);
    a.setAttribute('href', url.pathname + url.search + url.hash);
  });

  var first = detectLang();
  if (first !== DEFAULT_LANG) {
    /* Hide the English text until the chosen language has arrived (see
       base.css); a failed fetch still shows the page after 1.5 s. */
    document.documentElement.classList.add('i18n-pending');
    setTimeout(function () { document.documentElement.classList.remove('i18n-pending'); }, 1500);
  }
  ensure(DEFAULT_LANG);
  switchTo(first);
})();
