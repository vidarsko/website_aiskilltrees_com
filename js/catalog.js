'use strict';

/* ------------------------------------------------------------------ */
/* Katalogen på /trees/ — søk og filtrering over alle ferdighetstrærne. */
/*                                                                      */
/* Datamodell: hvert tre eier sin egen /trees/<slug>/meta.json. Denne   */
/* fila henter /trees/trees.json (bare en liste over slugs) og deretter */
/* alle meta.json-filene parallelt. Det finnes altså INGEN samlet,      */
/* generert katalogfil — metadataene bor sammen med treet de beskriver, */
/* og å legge til et tre er å legge til en mappe + én linje i           */
/* trees.json. Det er et bevisst valg: repoet har ikke noe byggesteg,   */
/* og et tre som flyttes eller kopieres tar metadataene sine med seg.   */
/*                                                                      */
/* Skalering: med noen titalls trær er N små, parallelle fetch-er helt  */
/* uproblematisk. Skulle antallet en dag bli stort nok til at det       */
/* merkes, er svaret en generert samlefil — ikke å duplisere feltene    */
/* inn i trees.json for hånd, som garantert vil komme ut av synk.       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Fasettene. ENESTE stedet filterdimensjonene er definert.            */
/*                                                                      */
/* `key` er feltnavnet i meta.json, `label` overskriften i filterlista. */
/* Verdiene i lista bygges av seg selv ut fra metadataene, så et nytt   */
/* land/nivå/fagområde dukker opp av seg selv så snart ett tre bruker   */
/* det — ingen kodeendring. Å legge til en ny DIMENSJON er én linje     */
/* her pluss feltet i meta.json.                                        */
/*                                                                      */
/* Rekkefølgen under er rekkefølgen i filterlista, fra det som deler    */
/* utvalget grovest (land) til det som deler det finest (status).       */
/* ------------------------------------------------------------------ */
const FACETS = [
  { key: 'country',     label: 'Land' },
  { key: 'level',       label: 'Nivå' },
  { key: 'subjectArea', label: 'Fagområde' },
  { key: 'institution', label: 'Institusjon' },
  { key: 'language',    label: 'Språk' },
  { key: 'status',      label: 'Status' },
];

/* Felt som fritekstsøket leter i. `topics` og `keywords` er lister —
   join-es før søk, slik at et søk på «annuitetslån» treffer et tre som
   aldri nevner ordet i tittelen. */
const SEARCH_FIELDS = [
  'title', 'subtitle', 'summary', 'course', 'courseCode',
  'grade', 'subjectArea', 'institution', 'curriculum', 'author',
  'topics', 'keywords',
];

const SORTS = {
  relevans:  { label: 'Mest relevant',        fn: (a, b) => b._score - a._score || cmpTitle(a, b) },
  tittel:    { label: 'Tittel (A–Å)',         fn: cmpTitle },
  storst:    { label: 'Flest ferdigheter',    fn: (a, b) => (b.nodeCount || 0) - (a.nodeCount || 0) || cmpTitle(a, b) },
  oppdatert: { label: 'Sist oppdatert',       fn: (a, b) => String(b.updated || '').localeCompare(String(a.updated || '')) || cmpTitle(a, b) },
};

/* Hvor mange ULIKE verdier en fasett må ha før den vises i filterlista.
   1 = vis alltid. En fasett der alle trærne har samme verdi filtrerer jo
   ingenting, så argumentet for 2 er åpenbart — men den forteller fortsatt
   noe (at katalogen bare inneholder norske trær, f.eks.), og mens katalogen
   er liten er en tom filterliste verre enn en triviell. Sett den til 2 når
   katalogen er stor nok til at enverdi-fasetter bare er støy. */
const MIN_FACET_VALUES = 1;

function cmpTitle(a, b) {
  return String(a.title || '').localeCompare(String(b.title || ''), 'nb');
}

/* ------------------------------------------------------------------ */
/* Tilstand                                                             */
/* ------------------------------------------------------------------ */

let TREES = [];                         // alle trær, med et forhåndsbygget søkeindeks-felt
const selected = new Map();             // fasettnøkkel -> Set av valgte verdier
let query = '';
let sort = 'relevans';

FACETS.forEach(f => selected.set(f.key, new Set()));

const el = {};

/* ------------------------------------------------------------------ */
/* Oppstart                                                             */
/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  el.search   = document.getElementById('search');
  el.sort     = document.getElementById('sort');
  el.filters  = document.getElementById('filters');
  el.facets   = document.getElementById('facet-list');
  el.chips    = document.getElementById('chips');
  el.count    = document.getElementById('result-count');
  el.grid     = document.getElementById('treegrid');
  el.status   = document.getElementById('load-status');
  el.reset    = document.getElementById('reset');
  el.toggle   = document.getElementById('filters-toggle');

  Object.keys(SORTS).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = SORTS[key].label;
    el.sort.appendChild(opt);
  });

  el.search.addEventListener('input', () => { query = el.search.value.trim(); render(); syncUrl(); });
  el.sort.addEventListener('change', () => { sort = el.sort.value; render(); syncUrl(); });
  el.reset.addEventListener('click', clearAll);

  // Filterlista er sammenslått på smal skjerm. Knappen finnes bare der
  // (skjult i CSS over 900px), men lyttes på uansett — enklere enn å
  // rive den ned og opp igjen på resize.
  el.toggle.addEventListener('click', () => {
    const collapsed = el.filters.getAttribute('data-collapsed') === 'true';
    el.filters.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
    el.toggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
  });

  window.addEventListener('popstate', () => { readUrl(); reflectControls(); render(); });

  loadTrees();
});

function loadTrees() {
  fetch('trees.json')
    .then(res => {
      if (!res.ok) throw new Error('trees.json ga HTTP ' + res.status);
      return res.json();
    })
    .then(manifest => {
      const slugs = (manifest && manifest.trees) || [];
      if (!slugs.length) throw new Error('trees.json inneholder ingen trær.');
      return Promise.all(slugs.map(loadOne));
    })
    .then(list => {
      TREES = list.filter(Boolean).map(prepare);
      if (!TREES.length) throw new Error('Ingen av trærne kunne lastes.');
      el.status.hidden = true;
      readUrl();
      reflectControls();
      buildFacets();
      render();
    })
    .catch(err => {
      // Den vanligste årsaken lokalt er at sida er åpnet rett fra disk:
      // fetch() av JSON feiler da i de fleste nettlesere.
      el.status.hidden = false;
      el.status.textContent =
        'Klarte ikke å laste katalogen: ' + err.message +
        ' (kjører du sida via en lokal server? fetch() av JSON-filer feiler hvis index.html åpnes direkte fra disk.)';
    });
}

function loadOne(slug) {
  return fetch(slug + '/meta.json')
    .then(res => {
      if (!res.ok) throw new Error(slug + '/meta.json ga HTTP ' + res.status);
      return res.json();
    })
    .then(meta => Object.assign({ slug: slug }, meta))
    // Ett tre med ødelagt metadatafil skal ikke ta ned hele katalogen —
    // det utelates, og feilen går til konsollen for den som vedlikeholder.
    .catch(err => { console.error('Hopper over treet «' + slug + '»:', err); return null; });
}

/* Bygger søketeksten én gang per tre, i stedet for å sette den sammen på
   nytt for hvert tastetrykk. */
function prepare(tree) {
  const parts = [];
  SEARCH_FIELDS.forEach(field => {
    const v = tree[field];
    if (Array.isArray(v)) parts.push(v.join(' '));
    else if (v) parts.push(String(v));
  });
  tree._haystack = parts.join(' ').toLowerCase();
  tree._score = 0;
  if (!tree.path) tree.path = '/trees/' + tree.slug + '/';
  return tree;
}

/* ------------------------------------------------------------------ */
/* Filtrering og søk                                                    */
/* ------------------------------------------------------------------ */

/* Alle ord i søket må finnes (AND), hvert av dem som delstreng. Det gjør
   «2p statistikk» til et nyttig søk uten at noen må skrive en parser. */
function matchesQuery(tree, terms) {
  return terms.every(t => tree._haystack.includes(t));
}

/* Innenfor én fasett er valgene ELLER (huker du av Norge og Sverige, vil du
   se begge). På tvers av fasetter er de OG (Norge + Matematikk = norske
   matematikktrær). Det er slik en produktfiltrering oppfører seg, og det er
   det folk forventer uten å tenke over det. */
function matchesFacets(tree, skipKey) {
  for (const facet of FACETS) {
    if (facet.key === skipKey) continue;
    const chosen = selected.get(facet.key);
    if (!chosen.size) continue;
    if (!chosen.has(tree[facet.key])) return false;
  }
  return true;
}

function terms() {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function currentResults() {
  const t = terms();
  return TREES.filter(tree => matchesQuery(tree, t) && matchesFacets(tree, null));
}

/* Enkel relevansscore: treff i tittel/kurs veier tyngst, deretter
   ingress/undertittel, deretter alt annet. Uten søketekst er alle like og
   sorteringen faller tilbake på tittel. */
function score(tree, t) {
  if (!t.length) return 0;
  const title = String(tree.title + ' ' + (tree.course || '')).toLowerCase();
  const near = String((tree.subtitle || '') + ' ' + (tree.summary || '')).toLowerCase();
  let s = 0;
  t.forEach(term => {
    if (title.includes(term)) s += 10;
    else if (near.includes(term)) s += 4;
    else s += 1;
  });
  return s;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

function render() {
  const t = terms();
  const results = currentResults();
  results.forEach(tree => { tree._score = score(tree, t); });
  results.sort(SORTS[sort].fn);

  renderCounts();
  renderChips();

  el.count.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = String(results.length);
  el.count.appendChild(strong);
  el.count.appendChild(document.createTextNode(
    results.length === 1 ? ' ferdighetstre' : ' ferdighetstrær'
  ));
  if (results.length !== TREES.length) {
    el.count.appendChild(document.createTextNode(' av ' + TREES.length));
  }

  el.reset.hidden = !hasActiveFilters();

  el.grid.innerHTML = '';
  if (!results.length) {
    el.grid.appendChild(emptyState());
    return;
  }
  results.forEach(tree => el.grid.appendChild(card(tree)));
}

function emptyState() {
  const li = document.createElement('li');
  li.className = 'empty';
  li.style.gridColumn = '1 / -1';

  const h = document.createElement('h3');
  h.textContent = 'Ingen ferdighetstrær passer';
  li.appendChild(h);

  const p = document.createElement('p');
  p.textContent = 'Prøv færre filtre eller et bredere søk.';
  li.appendChild(p);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'linkbtn';
  btn.textContent = 'Nullstill alt';
  btn.addEventListener('click', clearAll);
  li.appendChild(btn);

  return li;
}

function card(tree) {
  const li = document.createElement('li');

  const a = document.createElement('a');
  a.className = 'treecard';
  a.href = tree.path;

  const meta = document.createElement('p');
  meta.className = 'treecard__meta';
  [tree.country, tree.level, tree.subjectArea].filter(Boolean).forEach(v => {
    const span = document.createElement('span');
    span.textContent = v;
    meta.appendChild(span);
  });
  a.appendChild(meta);

  const h3 = document.createElement('h3');
  h3.className = 'treecard__title';
  h3.textContent = tree.title;
  a.appendChild(h3);

  if (tree.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'treecard__subtitle';
    sub.textContent = tree.subtitle;
    a.appendChild(sub);
  }

  if (tree.summary) {
    const sum = document.createElement('p');
    sum.className = 'treecard__summary';
    sum.textContent = tree.summary;
    a.appendChild(sum);
  }

  const foot = document.createElement('div');
  foot.className = 'treecard__foot';

  const left = document.createElement('span');
  const counts = [];
  if (tree.skillCount) counts.push(tree.skillCount + ' ferdigheter');
  if (tree.conceptCount) counts.push(tree.conceptCount + ' begreper');
  left.textContent = counts.join(' · ') || (tree.nodeCount ? tree.nodeCount + ' noder' : '');
  foot.appendChild(left);

  // Utkast flagges med et ord, ikke bare en farge.
  if (tree.status && tree.status.toLowerCase() !== 'publisert') {
    const pill = document.createElement('span');
    pill.className = 'pill pill--draft';
    pill.textContent = tree.status;
    foot.appendChild(pill);
  } else {
    const go = document.createElement('span');
    go.className = 'treecard__go';
    go.textContent = 'Åpne treet →';
    foot.appendChild(go);
  }

  a.appendChild(foot);
  li.appendChild(a);
  return li;
}

/* ------------------------------------------------------------------ */
/* Filterlista                                                          */
/* ------------------------------------------------------------------ */

function buildFacets() {
  el.facets.innerHTML = '';

  FACETS.forEach(facet => {
    const values = uniqueValues(facet.key);
    if (values.length < MIN_FACET_VALUES) return;

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'facet';
    fieldset.dataset.facet = facet.key;

    const legend = document.createElement('legend');
    legend.className = 'facet__legend';
    legend.textContent = facet.label;
    fieldset.appendChild(legend);

    const ul = document.createElement('ul');
    ul.className = 'facet__list';

    values.forEach(value => {
      const li = document.createElement('li');

      const label = document.createElement('label');
      label.className = 'facet__row';
      label.dataset.value = value;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.checked = selected.get(facet.key).has(value);
      input.addEventListener('change', () => {
        const set = selected.get(facet.key);
        if (input.checked) set.add(value); else set.delete(value);
        render();
        syncUrl();
      });

      const name = document.createElement('span');
      name.className = 'facet__name';
      name.textContent = value;

      const count = document.createElement('span');
      count.className = 'facet__count';

      label.append(input, name, count);
      li.appendChild(label);
      ul.appendChild(li);
    });

    fieldset.appendChild(ul);
    el.facets.appendChild(fieldset);
  });

  renderCounts();
}

function uniqueValues(key) {
  const seen = new Set();
  TREES.forEach(tree => { if (tree[key]) seen.add(tree[key]); });
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'nb'));
}

/* Tallet bak hver verdi er hvor mange treff DEN verdien ville gitt med alle
   ANDRE filtre stående — ikke hvor mange som er igjen nå. Det er derfor
   `matchesFacets` kan hoppe over sin egen fasett: uten det ville hver
   verdi du ikke hadde huket av vist 0 så snart du huket av én, og
   filterlista ville vært ubrukelig til å se hva neste klikk gir. */
function renderCounts() {
  const t = terms();

  el.facets.querySelectorAll('.facet').forEach(fieldset => {
    const key = fieldset.dataset.facet;
    const pool = TREES.filter(tree => matchesQuery(tree, t) && matchesFacets(tree, key));

    const counts = new Map();
    pool.forEach(tree => {
      const v = tree[key];
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    });

    fieldset.querySelectorAll('.facet__row').forEach(row => {
      const n = counts.get(row.dataset.value) || 0;
      const input = row.querySelector('input');
      row.querySelector('.facet__count').textContent = String(n);
      // En avhuket verdi skal aldri låses — ellers kan man ikke huke den av igjen.
      const dead = n === 0 && !input.checked;
      row.classList.toggle('is-empty', dead);
      input.disabled = dead;
    });
  });
}

function renderChips() {
  el.chips.innerHTML = '';

  FACETS.forEach(facet => {
    selected.get(facet.key).forEach(value => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('aria-label', 'Fjern filteret ' + facet.label + ': ' + value);

      const text = document.createElement('span');
      text.textContent = facet.label + ': ' + value;

      const x = document.createElement('span');
      x.className = 'chip__x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';

      chip.append(text, x);
      chip.addEventListener('click', () => {
        selected.get(facet.key).delete(value);
        reflectControls();
        render();
        syncUrl();
      });

      el.chips.appendChild(chip);
    });
  });
}

function hasActiveFilters() {
  if (query) return true;
  return FACETS.some(f => selected.get(f.key).size > 0);
}

function clearAll() {
  query = '';
  el.search.value = '';
  FACETS.forEach(f => selected.get(f.key).clear());
  reflectControls();
  render();
  syncUrl();
}

/* Skriver tilstanden tilbake til avkrysningsboksene. Kalles etter alt som
   endrer `selected` utenfor selve boksen (chip, nullstill, tilbakeknapp). */
function reflectControls() {
  el.search.value = query;
  el.sort.value = sort;
  el.facets.querySelectorAll('.facet').forEach(fieldset => {
    const key = fieldset.dataset.facet;
    fieldset.querySelectorAll('.facet__row input').forEach(input => {
      input.checked = selected.get(key).has(input.value);
    });
  });
}

/* ------------------------------------------------------------------ */
/* URL-synk — et filtrert utvalg skal kunne deles som en lenke          */
/* ------------------------------------------------------------------ */

function syncUrl() {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  FACETS.forEach(f => {
    const set = selected.get(f.key);
    if (set.size) params.set(f.key, Array.from(set).join('|'));
  });
  if (sort !== 'relevans') params.set('sort', sort);

  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  query = params.get('q') || '';
  sort = SORTS[params.get('sort')] ? params.get('sort') : 'relevans';
  FACETS.forEach(f => {
    const set = selected.get(f.key);
    set.clear();
    const raw = params.get(f.key);
    if (raw) raw.split('|').filter(Boolean).forEach(v => set.add(v));
  });
}
