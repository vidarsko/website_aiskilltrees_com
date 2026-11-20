/* ==========================================================================
   header.js — the site header bar, rendered for every page.

   WHY THIS IS JAVASCRIPT AND NOT MARKUP IN EACH PAGE. The bar carries a
   wordmark, the nav links, a language menu and a drawer for narrow screens.
   One file owns it, so the nav cannot drift between pages.

   Its labels are site chrome, not page content: English is the fallback
   here, and every language (English included) is in /i18n/<lang>/_site.json,
   read through window.i18n.s(). The language list itself is in js/i18n.js.

   THE LANGUAGE MENU (2026-11-19, when the site went from three languages to
   about forty). Vidar: pages that exist in only some languages must show it
   clearly. So the menu has two groups: the languages THIS page is in, on
   top, and below them every other language, greyed out and not clickable.
   A filter field on top finds a language by its own name, its English name
   or its code. A page in every language shows one plain list.

   Load order on every page:  i18n.js (defer) → header.js (defer)
   ========================================================================== */
(function () {
  'use strict';

  /* The site's pages. Adding one is a line here, and a key in _site.json. */
  var NAV = [
    { href: '/how-to-use/',    key: 'nav-how-to-use',    en: 'How to use' },
    { href: '/trees/',         key: 'nav-trees',         en: 'Trees' },
    { href: '/make-your-own/', key: 'nav-make-your-own', en: 'Make your own' },
    { href: '/prompts/',       key: 'nav-prompts',       en: 'The prompts' },
    { href: '/about/',         key: 'nav-about',         en: 'About' },
    { href: '/research/',      key: 'nav-research',      en: 'Research' }
  ];

  var UI = {
    menu:           'Menu',
    language:       'Language',
    chooseLanguage: 'Choose language',
    main:           'Main',
    availableHere:  'This page is in',
    notHere:        'Not on this page',
    search:         'Find a language',
    noMatch:        'No language matches'
  };
  var UI_KEYS = {
    menu: 'ui-menu', language: 'ui-language', chooseLanguage: 'ui-choose-language', main: 'ui-main',
    availableHere: 'ui-available-here', notHere: 'ui-not-here', search: 'ui-search-language',
    noMatch: 'ui-no-language-match'
  };

  /* English names, only so the filter finds "German" as well as "Deutsch". */
  var ENGLISH = {
    en: 'English', sq: 'Albanian', az: 'Azerbaijani', bs: 'Bosnian', cnr: 'Montenegrin', cs: 'Czech',
    da: 'Danish', de: 'German', et: 'Estonian', es: 'Spanish', fr: 'French', hr: 'Croatian',
    is: 'Icelandic', it: 'Italian', lv: 'Latvian', lt: 'Lithuanian', hu: 'Hungarian', mt: 'Maltese',
    nl: 'Dutch', nb: 'Norwegian', uz: 'Uzbek', pl: 'Polish', pt: 'Portuguese', ro: 'Romanian',
    sk: 'Slovak', sl: 'Slovenian', fi: 'Finnish', sv: 'Swedish', tr: 'Turkish', el: 'Greek',
    be: 'Belarusian', bg: 'Bulgarian', kk: 'Kazakh', ky: 'Kyrgyz', mk: 'Macedonian', ru: 'Russian',
    sr: 'Serbian', tg: 'Tajik', uk: 'Ukrainian', ka: 'Georgian', hy: 'Armenian'
  };

  /* Icons are drawn as SVG, never emoji (ux-design rule 11). The mark is the
     same drawing as /favicon.svg. Keep the two in step. */
  var ICON = {
    mark: '<svg viewBox="0 0 32 32" width="22" height="22" focusable="false">' +
          '<path d="M7 9 L11.5 16 M25 9 L20.5 16" fill="none" stroke="var(--amber)" stroke-width="2.4" stroke-linecap="round"/>' +
          '<rect x="1.5" y="1.5" width="11" height="8" rx="0.6" fill="var(--blue)"/>' +
          '<rect x="19.5" y="1.5" width="11" height="8" rx="2.4" fill="var(--primary)"/>' +
          '<rect x="5" y="15" width="22" height="15" rx="6.5" fill="var(--amber)"/>' +
          '<circle cx="12" cy="22.5" r="2.3" fill="var(--ink-inverse)"/>' +
          '<circle cx="20" cy="22.5" r="2.3" fill="var(--ink-inverse)"/></svg>',
    globe: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" focusable="false">' +
           '<circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="2.8" ry="6.5"/>' +
           '<path d="M1.5 8h13M2.7 4.6h10.6M2.7 11.4h10.6"/></svg>'
  };

  var host = document.querySelector('[data-site-header]');
  if (!host) return;

  function I() { return window.i18n || {}; }
  function lang() { return I().lang || document.documentElement.lang || 'en'; }
  function s(key, fallback) { return I().s ? I().s(key, fallback) : fallback; }
  function ui(name) { return s(UI_KEYS[name], UI[name]); }
  function languages() {
    return I().languages || [{ code: 'en', short: 'EN', name: 'English' }];
  }
  function available() {
    return I().available || [lang()];
  }

  function isCurrent(href) {
    var p = location.pathname;
    return p === href || p.indexOf(href) === 0;
  }

  function byName(a, b) { return a.name.localeCompare(b.name); }

  function render() {
    var L = lang();
    var langs = languages();
    var avail = available();
    var current = langs.filter(function (x) { return x.code === L; })[0] || langs[0];

    host.innerHTML = '';
    var inner = el('div', 'siteheader__inner');

    var mark = el('a', 'wordmark');
    mark.href = '/';
    mark.innerHTML = '<span class="wordmark__mark" aria-hidden="true">' + ICON.mark + '</span>AI Skill Trees';
    inner.appendChild(mark);

    var toggle = el('button', 'navtoggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'sitenav-panel');
    toggle.setAttribute('aria-label', ui('menu'));
    toggle.innerHTML = '<span class="navtoggle__bars" aria-hidden="true"></span>';
    inner.appendChild(toggle);

    var panel = el('div', 'sitenav-panel');
    panel.id = 'sitenav-panel';

    var nav = el('nav', 'sitenav');
    nav.setAttribute('aria-label', ui('main'));
    NAV.forEach(function (item) {
      var a = el('a');
      a.href = item.href;
      a.textContent = s(item.key, item.en);
      if (isCurrent(item.href)) {
        a.classList.add('is-current');
        a.setAttribute('aria-current', 'page');
      }
      nav.appendChild(a);
    });
    panel.appendChild(nav);

    /* ---- Language menu ---- */
    var select = el('div', 'lang-select');

    var btn = el('button', 'lang-select__button');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', ui('language') + ': ' + current.name);
    btn.innerHTML = '<span class="lang-select__globe" aria-hidden="true">' + ICON.globe + '</span>' +
                    '<span class="lang-select__code">' + current.short + '</span>' +
                    '<span class="lang-select__caret" aria-hidden="true">&#9662;</span>';
    select.appendChild(btn);

    var menu = el('div', 'lang-select__menu');

    var filter = null;
    if (langs.length > 8) {
      filter = el('input', 'lang-select__filter');
      filter.type = 'search';
      filter.placeholder = ui('search');
      filter.setAttribute('aria-label', ui('search'));
      filter.autocomplete = 'off';
      menu.appendChild(filter);
    }

    var here = langs.filter(function (x) { return avail.indexOf(x.code) !== -1; }).sort(byName);
    var elsewhere = langs.filter(function (x) { return avail.indexOf(x.code) === -1; }).sort(byName);
    var split = elsewhere.length > 0;

    var list = el('ul', 'lang-select__list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', ui('chooseLanguage'));

    function group(label) {
      var li = el('li', 'lang-select__group');
      li.setAttribute('role', 'presentation');
      li.textContent = label;
      list.appendChild(li);
      return li;
    }
    function option(item, enabled) {
      var li = el('li');
      li.setAttribute('role', 'presentation');
      li.setAttribute('data-search', (item.name + ' ' + (ENGLISH[item.code] || '') + ' ' + item.code).toLowerCase());
      var opt = el('button', 'lang-select__option' + (enabled ? '' : ' is-unavailable'));
      opt.type = 'button';
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-lang', item.code);
      opt.setAttribute('lang', item.code);
      opt.setAttribute('aria-selected', item.code === L ? 'true' : 'false');
      if (!enabled) {
        opt.disabled = true;
        opt.setAttribute('aria-disabled', 'true');
      }
      /* The tick marks the active language as well as the fill does —
         never colour alone. */
      opt.innerHTML = '<span class="lang-select__tick" aria-hidden="true">' +
                      (item.code === L ? '&#10003;' : '') + '</span>' +
                      '<span class="lang-select__name"></span>' +
                      '<span class="lang-select__short" aria-hidden="true">' + item.short + '</span>';
      opt.querySelector('.lang-select__name').textContent = item.name;
      li.appendChild(opt);
      list.appendChild(li);
    }

    if (split) group(ui('availableHere'));
    here.forEach(function (x) { option(x, true); });
    if (split) {
      group(ui('notHere')).classList.add('lang-select__group--off');
      elsewhere.forEach(function (x) { option(x, false); });
    }
    var none = el('li', 'lang-select__none');
    none.setAttribute('role', 'presentation');
    none.textContent = ui('noMatch');
    none.hidden = true;
    list.appendChild(none);

    menu.appendChild(list);
    select.appendChild(menu);
    panel.appendChild(select);

    inner.appendChild(panel);
    host.appendChild(inner);

    wire(toggle, btn, menu, list, filter, none);
  }

  function wire(toggle, btn, menu, list, filter, none) {
    function setDrawer(open) {
      host.setAttribute('data-open', open ? 'true' : 'false');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) setMenu(false);
    }
    toggle.addEventListener('click', function () {
      setDrawer(host.getAttribute('data-open') !== 'true');
    });

    function enabledOptions() {
      return [].slice.call(list.querySelectorAll('.lang-select__option:not([disabled])'))
        .filter(function (o) { return !o.parentNode.hidden; });
    }

    function setMenu(open) {
      menu.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && filter) { filter.value = ''; runFilter(); }
    }

    function runFilter() {
      var q = filter ? filter.value.trim().toLowerCase() : '';
      var shown = 0;
      [].slice.call(list.children).forEach(function (li) {
        var key = li.getAttribute('data-search');
        if (key == null) return;
        var hit = !q || key.indexOf(q) !== -1;
        li.hidden = !hit;
        if (hit) shown++;
      });
      /* A group label hides when nothing under it is left. */
      [].slice.call(list.querySelectorAll('.lang-select__group')).forEach(function (g) {
        var n = g.nextElementSibling, any = false;
        while (n && !n.classList.contains('lang-select__group')) {
          if (n.getAttribute('data-search') != null && !n.hidden) any = true;
          n = n.nextElementSibling;
        }
        g.hidden = !any;
      });
      none.hidden = shown > 0;
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !menu.classList.contains('is-open');
      setMenu(open);
      if (open && filter && window.matchMedia('(pointer: fine)').matches) filter.focus();
    });

    if (filter) {
      filter.addEventListener('input', runFilter);
      filter.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          var first = enabledOptions()[0];
          if (!first) return;
          e.preventDefault();
          if (e.key === 'Enter') first.click(); else first.focus();
        }
      });
    }

    list.addEventListener('click', function (e) {
      var opt = e.target.closest('.lang-select__option');
      if (!opt || opt.disabled) return;
      setMenu(false);
      setDrawer(false);
      if (window.i18n && window.i18n.setLang) window.i18n.setLang(opt.getAttribute('data-lang'));
    });

    list.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var opts = enabledOptions();
      var i = opts.indexOf(document.activeElement);
      e.preventDefault();
      var next = e.key === 'ArrowDown' ? i + 1 : i - 1;
      if (next < 0) { if (filter) { filter.focus(); return; } next = opts.length - 1; }
      if (next >= opts.length) next = 0;
      opts[next].focus();
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenu(true);
        (filter || enabledOptions()[0]).focus();
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
  if (window.i18n && window.i18n.onChange) window.i18n.onChange(render);
})();
