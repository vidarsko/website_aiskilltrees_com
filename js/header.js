/* ==========================================================================
   header.js — the site header bar, rendered for every page.

   WHY THIS IS JAVASCRIPT AND NOT MARKUP IN EACH PAGE. The bar now carries a
   wordmark, three nav links, a language dropdown and a drawer for narrow
   screens. Copied into four pages that would be four places to fix a typo,
   four places to add a page, and four chances for the nav to drift out of
   sync — which is exactly the failure this repo just spent a refactor
   removing from the skill-tree engine. One file owns it instead.

   Its labels live HERE, not in each page's #i18n-dict, for the same reason:
   the header is site chrome, not page content, and duplicating "Trees" into
   every page's dictionary is the same bug one level down.

   Load order on every page:  i18n.js (defer) → header.js (defer)
   i18n.js owns the language STATE; this file owns the visible control and
   calls window.i18n.setLang(). A page needs only an empty
   <header class="siteheader" data-site-header></header> in its markup.
   ========================================================================== */
(function () {
  'use strict';

  /* The site's pages. Adding one is a line here — nothing else. */
  var NAV = [
    { href: '/trees/',         label: { en: 'Trees',         nb: 'Ferdighetstrær', sv: 'Färdighetsträd' } },
    { href: '/make-your-own/', label: { en: 'Make your own', nb: 'Lag ditt eget',  sv: 'Gör ditt eget' } },
    { href: '/prompts/',       label: { en: 'The prompts',   nb: 'Instruksene',    sv: 'Instruktionerna' } },
    { href: '/about/',         label: { en: 'About',         nb: 'Om',             sv: 'Om' } },
    { href: '/research/',      label: { en: 'Research',      nb: 'Forskning',      sv: 'Forskning' } }
  ];

  /* Endonyms: a language is named in its own language, so this list reads
     the same whichever language is active and needs no translating. */
  /* `code` is the BCP 47 tag ('nb' = bokmål, leaving room for 'nn'); `short`
     is only what the button shows, and NO reads better than NB to a
     Norwegian. The two deliberately differ. */
  var LANGS = [
    { code: 'en', short: 'EN', name: 'English' },
    { code: 'nb', short: 'NO', name: 'Norsk' },
    { code: 'sv', short: 'SV', name: 'Svenska' }
  ];

  var UI = {
    menu:     { en: 'Menu',            nb: 'Meny',        sv: 'Meny' },
    language: { en: 'Language',        nb: 'Språk',       sv: 'Språk' },
    chooseLanguage: { en: 'Choose language', nb: 'Velg språk', sv: 'Välj språk' },
    main:     { en: 'Main',            nb: 'Hovedmeny',   sv: 'Huvudmeny' }
  };

  var host = document.querySelector('[data-site-header]');
  if (!host) return;

  function lang() {
    return (window.i18n && window.i18n.lang) || 'en';
  }
  function txt(entry) {
    return entry[lang()] || entry.en;
  }

  /* A nav link is current when the path starts with its href. '/trees/'
     therefore stays lit inside '/trees/no-vgs-matte-2p/' — but tree pages do not
     load this header at all (they are single-language, see js/engine.js). */
  function isCurrent(href) {
    var p = location.pathname;
    return p === href || p.indexOf(href) === 0;
  }

  function render() {
    var L = lang();
    var current = LANGS.filter(function (x) { return x.code === L; })[0] || LANGS[0];

    host.innerHTML = '';

    var inner = el('div', 'siteheader__inner');

    var mark = el('a', 'wordmark');
    mark.href = '/';
    mark.innerHTML = '<span class="wordmark__mark" aria-hidden="true">&#9679;</span>AI Skill Trees';
    inner.appendChild(mark);

    /* Burger. Hidden above 768px in CSS; it is not removed from the DOM,
       so a resize needs no re-render. */
    var toggle = el('button', 'navtoggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'sitenav-panel');
    toggle.setAttribute('aria-label', txt(UI.menu));
    toggle.innerHTML = '<span class="navtoggle__bars" aria-hidden="true"></span>';
    inner.appendChild(toggle);

    /* One panel holding nav + language. Inline row on desktop, drawer below
       the bar on narrow screens — a CSS switch, not two markup variants. */
    var panel = el('div', 'sitenav-panel');
    panel.id = 'sitenav-panel';

    var nav = el('nav', 'sitenav');
    nav.setAttribute('aria-label', txt(UI.main));
    NAV.forEach(function (item) {
      var a = el('a');
      a.href = item.href;
      a.textContent = txt(item.label);
      if (isCurrent(item.href)) {
        a.classList.add('is-current');
        a.setAttribute('aria-current', 'page');
      }
      nav.appendChild(a);
    });
    panel.appendChild(nav);

    /* Language dropdown. A button + listbox rather than three buttons side
       by side: three fit, but a fourth language would not, and the bar has
       nav links to make room for now. */
    var select = el('div', 'lang-select');

    var btn = el('button', 'lang-select__button');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', txt(UI.language) + ': ' + current.name);
    btn.innerHTML = '<span class="lang-select__globe" aria-hidden="true">&#127760;</span>' +
                    '<span class="lang-select__code">' + current.short + '</span>' +
                    '<span class="lang-select__caret" aria-hidden="true">&#9662;</span>';
    select.appendChild(btn);

    var menu = el('ul', 'lang-select__menu');
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', txt(UI.chooseLanguage));
    LANGS.forEach(function (item) {
      var li = el('li');
      var opt = el('button', 'lang-select__option');
      opt.type = 'button';
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-lang', item.code);
      opt.setAttribute('aria-selected', item.code === L ? 'true' : 'false');
      /* The tick marks the active language as well as the fill does —
         never colour alone. */
      opt.innerHTML = '<span class="lang-select__tick" aria-hidden="true">' +
                      (item.code === L ? '&#10003;' : '') + '</span>' +
                      '<span>' + item.name + '</span>';
      li.appendChild(opt);
      menu.appendChild(li);
    });
    select.appendChild(menu);
    panel.appendChild(select);

    inner.appendChild(panel);
    host.appendChild(inner);

    wire(toggle, btn, menu);
  }

  function wire(toggle, btn, menu) {
    /* --- drawer --- */
    function setDrawer(open) {
      host.setAttribute('data-open', open ? 'true' : 'false');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) setMenu(false);
    }
    toggle.addEventListener('click', function () {
      setDrawer(host.getAttribute('data-open') !== 'true');
    });

    /* --- language dropdown --- */
    function setMenu(open) {
      menu.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenu(!menu.classList.contains('is-open'));
    });

    menu.addEventListener('click', function (e) {
      var opt = e.target.closest('.lang-select__option');
      if (!opt) return;
      setMenu(false);
      setDrawer(false);
      if (window.i18n) window.i18n.setLang(opt.getAttribute('data-lang'));
    });

    /* Arrow keys inside the open list, Escape out of either layer. */
    menu.addEventListener('keydown', function (e) {
      var opts = [].slice.call(menu.querySelectorAll('.lang-select__option'));
      var i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        if (next < 0) next = opts.length - 1;
        if (next >= opts.length) next = 0;
        opts[next].focus();
      }
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenu(true);
        var first = menu.querySelector('.lang-select__option');
        if (first) first.focus();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (menu.classList.contains('is-open')) { setMenu(false); btn.focus(); return; }
      if (host.getAttribute('data-open') === 'true') { setDrawer(false); toggle.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!host.contains(e.target)) { setMenu(false); setDrawer(false); }
    });
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  render();
  /* The dropdown's own labels are endonyms and never change, but the nav
     links and aria-labels do. */
  if (window.i18n && window.i18n.onChange) window.i18n.onChange(render);
})();
