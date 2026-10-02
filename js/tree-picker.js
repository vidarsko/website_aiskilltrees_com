'use strict';

/* ------------------------------------------------------------------ */
/* Treplukkeren på /make-your-own/ — «Finn et tre i katalogen».         */
/*                                                                      */
/* Et vindu over vinduet med veiene inn, med søk og filtre som på       */
/* /trees/ (fra 2026-10-02; før var det en nedtrekksliste med titlene). */
/* Samme data som katalogen: /trees/trees.json, hvert tres meta.json og */
/* /trees/vocabulary.json, og samme regler: alle søkeord må treffe, ELLER */
/* innenfor en fasett og OG på tvers, avhengige fasetter (land →        */
/* institusjon → inndeling, fagfamilie → fagområde), og tallet bak hver */
/* verdi er hva den ville gitt med de ANDRE filtrene stående.            */
/*                                                                      */
/* Det som med vilje er annerledes enn katalogen: ingen sortering å     */
/* velge, ingen URL-synk (adressen er verktøyets, og ?tree= betyr noe   */
/* der), og ingen måling — et valg her er ikke et `tree_open`, og en ny */
/* hendelse ville måttet stå på /privacy/. Et kort er en knapp, ikke en */
/* lenke: det åpner en kopi i verktøyet, ikke treet på sida.            */
/*                                                                      */
/* Stilen er katalogens egen (css/catalog.css), slik at de to ser like  */
/* ut; editor.css har bare det som trengs for at den står i et vindu.   */
/* ------------------------------------------------------------------ */

(function () {
  var FACETS = [
    { key: 'country',       labelKey: 'facet-country' },
    { key: 'institution',   labelKey: 'facet-institution', parent: 'country' },
    { key: 'division',      labelKey: 'facet-division',    parent: 'institution' },
    { key: 'subjectFamily', labelKey: 'facet-subjectFamily' },
    { key: 'subjectArea',   labelKey: 'facet-subjectArea', parent: 'subjectFamily' },
    { key: 'language',      labelKey: 'facet-language' },
  ];

  var SEARCH_FIELDS = [
    'title', 'subtitle', 'summary', 'course', 'courseCode',
    'curriculum', 'author', 'topics', 'keywords',
  ];

  var VOCAB = null;
  var TREES = null;          // null til lastet, [] hvis lastingen feilet
  var loading = null;
  var query = '';
  var selected = {};
  FACETS.forEach(function (f) { selected[f.key] = []; });

  var el = {};
  var onPick = null;
  var behind = null;
  var returnFocus = null;

  /* ---- Tekst ------------------------------------------------------ */

  function t(key, vars) {
    var text = (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
    });
  }

  function lang() { return (window.i18n && window.i18n.lang) || 'en'; }

  function localized(entry) {
    if (!entry) return null;
    return entry[lang()] || entry.en || null;
  }

  /* Samme oppslag som catalog.js: en institusjon har ett navn (`label`),
     inndelingen ligger nøstet under institusjonen sin. */
  function vocab(field, key) {
    if (!VOCAB || !VOCAB[field] || !key) return null;
    var entry = VOCAB[field][key];
    if (field === 'institution') return (entry && entry.label) || null;
    return localized(entry);
  }

  function divisionText(institutionKey, divisionKey) {
    var inst = VOCAB && VOCAB.institution && VOCAB.institution[institutionKey];
    return (inst && inst.divisions && localized(inst.divisions[divisionKey])) || null;
  }

  function valueText(facetKey, tree) {
    return facetKey === 'division'
      ? divisionText(tree.institution, tree.division)
      : vocab(facetKey, tree[facetKey]);
  }

  /* Legenden over inndelingen kommer fra institusjonen («Trinn»,
     «Fakultet») når alle de avhukede kaller den det samme. */
  function facetLegend(facet) {
    if (facet.key === 'division') {
      var labels = {};
      selected.institution.forEach(function (k) {
        var inst = VOCAB.institution && VOCAB.institution[k];
        var label = inst && localized(inst.divisionLabel);
        if (label) labels[label] = true;
      });
      var keys = Object.keys(labels);
      if (keys.length === 1) return keys[0];
    }
    return t(facet.labelKey);
  }

  function collator() { return { nb: 'nb', sv: 'sv' }[lang()] || 'en'; }

  /* ---- Data ------------------------------------------------------- */

  function getJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + ' HTTP ' + res.status);
      return res.json();
    });
  }

  function load() {
    if (loading) return loading;
    loading = Promise.all([getJson('/trees/vocabulary.json'), getJson('/trees/trees.json')])
      .then(function (both) {
        VOCAB = both[0] || {};
        var slugs = (both[1] && both[1].trees) || [];
        return Promise.all(slugs.map(function (slug) {
          return getJson('/trees/' + slug + '/meta.json').then(function (m) {
            return prepare(Object.assign({}, m, { slug: slug }));
          }, function () { return null; });
        }));
      })
      .then(function (list) {
        TREES = list.filter(Boolean);
        el.status.hidden = true;
        buildFacets();
        render();
      }, function () {
        TREES = [];
        loading = null;   // neste åpning prøver igjen
        el.status.hidden = false;
        el.status.textContent = t('picker-load-error');
      });
    return loading;
  }

  /* Søketeksten bygges én gang per tre, med vokabularverdiene på alle
     språk, slik at «matematikk» treffer et tre som lagrer `mathematics`. */
  function prepare(tree) {
    var parts = [];
    SEARCH_FIELDS.forEach(function (f) {
      var v = tree[f];
      if (Array.isArray(v)) parts.push(v.join(' '));
      else if (v) parts.push(String(v));
    });
    ['country', 'language', 'subjectFamily', 'subjectArea'].forEach(function (f) {
      var entry = VOCAB[f] && VOCAB[f][tree[f]];
      if (entry) Object.keys(entry).forEach(function (k) { if (typeof entry[k] === 'string') parts.push(entry[k]); });
    });
    var inst = VOCAB.institution && VOCAB.institution[tree.institution];
    if (inst) {
      if (typeof inst.label === 'string') parts.push(inst.label);
      var div = inst.divisions && inst.divisions[tree.division];
      if (div) Object.keys(div).forEach(function (k) { if (typeof div[k] === 'string') parts.push(div[k]); });
    }
    tree._haystack = parts.join(' ').toLowerCase();
    return tree;
  }

  /* ---- Filtrering ------------------------------------------------- */

  function words() { return query.toLowerCase().split(/\s+/).filter(Boolean); }

  function matchesQuery(tree, w) {
    return w.every(function (term) { return tree._haystack.indexOf(term) !== -1; });
  }

  function matchesFacets(tree, skipKey) {
    return FACETS.every(function (f) {
      if (f.key === skipKey) return true;
      var chosen = selected[f.key];
      return !chosen.length || chosen.indexOf(tree[f.key]) !== -1;
    });
  }

  function score(tree, w) {
    var title = String(tree.title + ' ' + (tree.course || '')).toLowerCase();
    var near = String((tree.subtitle || '') + ' ' + (tree.summary || '')).toLowerCase();
    var s = 0;
    w.forEach(function (term) {
      if (title.indexOf(term) !== -1) s += 10;
      else if (near.indexOf(term) !== -1) s += 4;
      else s += 1;
    });
    return s;
  }

  function hasChild(key) {
    return FACETS.some(function (f) { return f.parent === key; });
  }

  function hasActiveFilters() {
    return !!query || FACETS.some(function (f) { return selected[f.key].length > 0; });
  }

  /* ---- Tegning ---------------------------------------------------- */

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function buildFacets() {
    el.facets.innerHTML = '';
    FACETS.forEach(function (facet) {
      /* En avhengig fasett er skjult, og nullstilt, til foreldrefasetten
         har et valg - ellers ville et usynlig valg tynnet ut lista. */
      if (facet.parent && !selected[facet.parent].length) {
        selected[facet.key] = [];
        return;
      }
      var pool = facet.parent
        ? TREES.filter(function (tr) { return selected[facet.parent].indexOf(tr[facet.parent]) !== -1; })
        : TREES;
      var seen = {};
      var values = [];
      pool.forEach(function (tr) {
        var key = tr[facet.key];
        if (!key || seen[key]) return;
        var text = valueText(facet.key, tr);
        if (!text) return;
        seen[key] = true;
        values.push({ key: key, text: text });
      });
      if (!values.length) return;
      values.sort(function (a, b) { return a.text.localeCompare(b.text, collator(), { numeric: true }); });

      var ul = h('ul', { class: 'facet__list' });
      values.forEach(function (value) {
        var input = h('input', { type: 'checkbox', value: value.key });
        input.checked = selected[facet.key].indexOf(value.key) !== -1;
        input.addEventListener('change', function () {
          var set = selected[facet.key];
          var i = set.indexOf(value.key);
          if (input.checked && i === -1) set.push(value.key);
          if (!input.checked && i !== -1) set.splice(i, 1);
          if (hasChild(facet.key)) buildFacets();
          render();
        });
        var label = h('label', { class: 'facet__row' }, [
          input,
          h('span', { class: 'facet__name', text: value.text }),
          h('span', { class: 'facet__count' }),
        ]);
        label.dataset.value = value.key;
        ul.appendChild(h('li', {}, [label]));
      });
      var fieldset = h('fieldset', { class: 'facet' }, [
        h('legend', { class: 'facet__legend', text: facetLegend(facet) }),
        ul,
      ]);
      fieldset.dataset.facet = facet.key;
      el.facets.appendChild(fieldset);
    });
  }

  function renderCounts(w) {
    el.facets.querySelectorAll('.facet').forEach(function (fieldset) {
      var key = fieldset.dataset.facet;
      var counts = {};
      TREES.forEach(function (tr) {
        if (matchesQuery(tr, w) && matchesFacets(tr, key) && tr[key]) counts[tr[key]] = (counts[tr[key]] || 0) + 1;
      });
      fieldset.querySelectorAll('.facet__row').forEach(function (row) {
        var n = counts[row.dataset.value] || 0;
        var input = row.querySelector('input');
        row.querySelector('.facet__count').textContent = String(n);
        var dead = n === 0 && !input.checked;
        row.classList.toggle('is-empty', dead);
        input.disabled = dead;
      });
    });
  }

  function renderChips() {
    el.chips.innerHTML = '';
    FACETS.forEach(function (facet) {
      selected[facet.key].forEach(function (key) {
        var sample = TREES.filter(function (tr) { return tr[facet.key] === key; })[0];
        var text = (sample && valueText(facet.key, sample)) || key;
        var legend = facetLegend(facet);
        el.chips.appendChild(h('button', {
          type: 'button',
          class: 'chip',
          'aria-label': t('chip-remove-aria', { facet: legend, value: text }),
          onclick: function () {
            var set = selected[facet.key];
            set.splice(set.indexOf(key), 1);
            buildFacets();
            render();
          },
        }, [h('span', { text: legend + ': ' + text }), h('span', { class: 'chip__x', 'aria-hidden': 'true', text: '×' })]));
      });
    });
  }

  function render() {
    if (!TREES) return;
    var w = words();
    var results = TREES.filter(function (tr) { return matchesQuery(tr, w) && matchesFacets(tr, null); });
    results.forEach(function (tr) { tr._score = w.length ? score(tr, w) : 0; });
    results.sort(function (a, b) {
      return (b._score - a._score) || String(a.title || '').localeCompare(String(b.title || ''), collator());
    });

    renderCounts(w);
    renderChips();

    /* Tallet står i <strong>, der språket vil ha det i setningen. */
    el.count.innerHTML = '';
    var parts = String(t(results.length === 1 ? 'results-one' : 'results-many')).split('{n}');
    el.count.appendChild(document.createTextNode(parts[0] || ''));
    el.count.appendChild(h('strong', { text: String(results.length) }));
    el.count.appendChild(document.createTextNode(parts.length > 1 ? parts[1] : ''));
    if (results.length !== TREES.length) el.count.appendChild(document.createTextNode(t('results-of', { total: TREES.length })));
    el.reset.hidden = !hasActiveFilters();

    el.grid.innerHTML = '';
    if (!results.length) {
      el.grid.appendChild(h('li', { class: 'empty', style: 'grid-column: 1 / -1' }, [
        h('h3', { text: t('empty-title') }),
        h('p', { text: t('empty-body') }),
        h('button', { type: 'button', class: 'linkbtn', text: t('empty-reset'), onclick: clearAll }),
      ]));
      return;
    }
    results.forEach(function (tr) { el.grid.appendChild(card(tr)); });
  }

  function card(tree) {
    var meta = h('p', { class: 'treecard__meta' });
    [
      vocab('country', tree.country),
      divisionText(tree.institution, tree.division),
      vocab('subjectArea', tree.subjectArea),
      vocab('language', tree.language),
    ].filter(Boolean).forEach(function (v) { meta.appendChild(h('span', { text: v })); });

    var counts = [];
    if (tree.skillCount) counts.push(t('card-skills', { n: tree.skillCount }));
    if (tree.conceptCount) counts.push(t('card-concepts', { n: tree.conceptCount }));
    if (tree.factCount) counts.push(t('card-facts', { n: tree.factCount }));
    var countText = counts.join(' · ') || (tree.nodeCount ? t('card-nodes', { n: tree.nodeCount }) : '');

    var btn = h('button', { type: 'button', class: 'treecard ed-picker__card' }, [
      meta,
      h('span', { class: 'treecard__title', text: tree.title || tree.slug }),
      tree.subtitle ? h('span', { class: 'treecard__subtitle', text: tree.subtitle }) : null,
      tree.summary ? h('span', { class: 'treecard__summary', text: tree.summary }) : null,
      h('span', { class: 'treecard__foot' }, [
        h('span', { text: countText }),
        h('span', { class: 'treecard__go', text: t('picker-open') }),
      ]),
    ]);
    btn.addEventListener('click', function () {
      var pick = onPick;
      close();
      if (pick) pick(tree.slug);
    });
    return h('li', {}, [btn]);
  }

  function clearAll() {
    query = '';
    el.search.value = '';
    FACETS.forEach(function (f) { selected[f.key] = []; });
    buildFacets();
    render();
  }

  /* ---- Vinduet ---------------------------------------------------- */

  function open(options) {
    if (!init()) return;
    onPick = options && options.onPick;
    behind = options && options.behind;
    returnFocus = document.activeElement;
    el.root.hidden = false;
    if (behind) behind.inert = true;
    if (TREES && TREES.length) { buildFacets(); render(); }
    else load();
    requestAnimationFrame(function () { el.search.focus(); });
  }

  function close() {
    if (!el.root || el.root.hidden) return;
    el.root.hidden = true;
    if (behind) behind.inert = false;
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  var ready = false;
  function init() {
    if (ready) return true;
    el.root = document.getElementById('ed-picker');
    if (!el.root) return false;
    el.search = document.getElementById('picker-search');
    el.facets = document.getElementById('picker-facets');
    el.filters = document.getElementById('picker-filters');
    el.toggle = document.getElementById('picker-filters-toggle');
    el.chips = document.getElementById('picker-chips');
    el.count = document.getElementById('picker-count');
    el.reset = document.getElementById('picker-reset');
    el.grid = document.getElementById('picker-grid');
    el.status = document.getElementById('picker-status');

    el.search.addEventListener('input', function () { query = el.search.value.trim(); render(); });
    /* Enter i søkefeltet åpner treet når søket har snevret det inn til ett. */
    el.search.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var cards = el.grid.querySelectorAll('.ed-picker__card');
      if (cards.length === 1) cards[0].click();
    });
    el.reset.addEventListener('click', clearAll);
    el.toggle.addEventListener('click', function () {
      var collapsed = el.filters.getAttribute('data-collapsed') === 'true';
      el.filters.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      el.toggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
    });
    document.getElementById('picker-close').addEventListener('click', close);
    el.root.addEventListener('click', function (e) { if (e.target === el.root) close(); });
    /* Esc lukker plukkeren og ikke vinduet under den: lytteren på window i
       fangstfasen kommer før editor.js sin på document. */
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || el.root.hidden) return;
      e.stopPropagation();
      close();
    }, true);
    if (window.i18n && window.i18n.onChange) {
      window.i18n.onChange(function () {
        if (TREES && TREES.length) { buildFacets(); render(); }
      });
    }
    ready = true;
    return true;
  }

  window.AistTreePicker = { open: open, close: close, isOpen: function () { return !!el.root && !el.root.hidden; } };
})();
