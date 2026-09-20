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
/* `key` er feltnavnet i meta.json, `labelKey` slår opp overskriften i    */
/* sidas i18n-ordbok (se trees/index.html) — selve teksten bor der, ikke  */
/* her, siden katalogen finnes på tre språk.                              */
/*                                                                      */
/* Verdiene er NØKLER fra trees/vocabulary.json, ikke fri tekst. Fram    */
/* til 2026-09-20 skrev hvert tre verdien selv, og resultatet var        */
/* «Matematikk» og «Mathematics» som to atskilte valg i samme liste.     */
/* Nå lagrer meta.json nøkkelen og vokabularet eier teksten på alle tre  */
/* språk. Bivirkning verdt å ha med seg: en delt filterlenke inneholder  */
/* nå nøkler og virker derfor på tvers av språk — før lå det norsk tekst */
/* i URL-en.                                                             */
/*                                                                      */
/* `parent` gjør fasetten AVHENGIG: den vises ikke før foreldrefasetten  */
/* har et valg, og viser da bare verdiene som hører til det valget.      */
/* Kjeden er land → institusjon → inndeling, og den tømmer seg nedover:  */
/* fjernes landet, forsvinner både institusjonen og inndelingen, og      */
/* valgene i dem nullstilles. Det fungerer fordi FACETS står i den       */
/* rekkefølgen og buildFacets() går gjennom lista ovenfra og ned.        */
/* `division` er inndelingen INNENFOR en institusjon — Vg2, 8. trinn,    */
/* Årskurs 1, MN-fakultetet — og en sammenslått liste over alle fire     */
/* ville vært støy. Se `institution` i vocabulary.json for hvorfor       */
/* feltet heter noe så nøytralt som «division».                          */
/*                                                                      */
/* Rekkefølgen under er rekkefølgen i filterlista, fra det som deler    */
/* utvalget grovest (land) til det som deler det finest (språk).        */
/* ------------------------------------------------------------------ */
const FACETS = [
  { key: 'country',     labelKey: 'facet-country' },
  { key: 'institution', labelKey: 'facet-institution', parent: 'country' },
  { key: 'division',    labelKey: 'facet-division',    parent: 'institution' },
  { key: 'subjectArea', labelKey: 'facet-subjectArea' },
  { key: 'language',    labelKey: 'facet-language' },
];

/* Feltene som slår opp direkte i vocabulary.json. `division` står ikke
   her fordi verdiene ligger nøstet under sin institusjon og trenger et
   eget oppslag — se divisionText() og divisionLegend(). */
const VOCAB_FIELDS = ['country', 'language', 'subjectArea', 'institution'];

let VOCAB = null;   // trees/vocabulary.json, lastet før trærne

/* ------------------------------------------------------------------ */
/* Språk. Katalogens EGET språk veksles av js/i18n.js; selve trærne er  */
/* ikke oversatt — hvert tre er skrevet på ett språk av den som laget   */
/* det, og `language` i meta.json er et faktum om treet, ikke en visning */
/* av det.                                                              */
/*                                                                      */
/* Fasettenes overskrifter oversettes her, i sidas ordbok. VERDIENE     */
/* under dem oversettes i trees/vocabulary.json — fram til 2026-09-20   */
/* sto de urørt slik hvert tre hadde skrevet dem, og det ga «Matematikk» */
/* og «Mathematics» som to valg i samme liste.                          */
/*                                                                      */
/* t() og fmt() tåler at i18n.js ikke er lastet (da faller alt tilbake  */
/* til nøkkelen), slik at en side som glemmer scriptet degraderer i     */
/* stedet for å kaste.                                                  */
/* ------------------------------------------------------------------ */
function t(key) {
  return (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
}

/* fmt('card-skills', { n: 78 }) → «78 ferdigheter». Plassholderne er
   {navn} i ordboka, slik at hvert språk kan sette tallet der det hører
   hjemme i setningen. */
function fmt(key, vars) {
  return String(t(key)).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
  });
}

function lang() {
  return (window.i18n && window.i18n.lang) || 'en';
}

/* ------------------------------------------------------------------ */
/* Vokabularoppslag                                                     */
/*                                                                      */
/* Strengt, uten fallback til rå verdi. Vidar går gjennom hvert innsendt */
/* tre manuelt, så en nøkkel som ikke finnes i vocabulary.json kan ikke  */
/* nå sida uten at han har sett den — og da er det riktige svaret å      */
/* legge nøkkelen inn, ikke å la katalogen vise den rått og skjule       */
/* tabben. En ukjent nøkkel er altså en FEIL: treet utelates og grunnen  */
/* står i konsollen. Se validateVocab().                                 */
/*                                                                      */
/* En manglende OVERSETTELSE er noe annet enn en manglende nøkkel, og    */
/* faller tilbake på engelsk: da er verdien gyldig, bare ikke oversatt   */
/* ennå, og å skjule treet ville vært ute av proporsjon.                 */
/* ------------------------------------------------------------------ */

function localized(entry) {
  if (!entry) return null;
  return entry[lang()] || entry.en || null;
}

/* Visningstekst for en vokabularverdi, f.eks. vocab('subjectArea',
   'mathematics') → «Matematikk» på norsk. */
function vocab(field, key) {
  if (!VOCAB || !VOCAB[field] || !key) return null;
  const entry = VOCAB[field][key];
  /* En institusjon bærer også sin egen inndeling, så visningsnavnet ligger
     under `label` — og det er ÉN streng, ikke et språkoppslag. En
     institusjon har et navn: «Videregående skole» heter det på norsk
     uansett hvem som leser, på samme måte som et tre er skrevet på ett
     språk. De andre feltene er vanlige {språk: tekst}-oppslag. */
  if (field === 'institution') return (entry && entry.label) || null;
  return localized(entry);
}

function institutionEntry(key) {
  return (VOCAB && VOCAB.institution && VOCAB.institution[key]) || null;
}

/* Inndelingen ligger nøstet under institusjonen sin, så et oppslag av en
   division-verdi trenger å vite hvilken institusjon den hører til. */
function divisionText(institutionKey, divisionKey) {
  const inst = institutionEntry(institutionKey);
  if (!inst || !inst.divisions) return null;
  return localized(inst.divisions[divisionKey]);
}

/* Overskriften over division-fasetten kommer fra institusjonen, ikke fra
   sidas ordbok: «Trinn» for et skoleslag, «Fakultet» for et universitet.
   Er flere institusjoner huket av, og de kaller inndelingen sin ulike
   ting, faller vi tilbake på sidas nøytrale overskrift. */
function divisionLegend(institutionKeys) {
  const labels = new Set();
  institutionKeys.forEach(k => {
    const inst = institutionEntry(k);
    const label = inst && localized(inst.divisionLabel);
    if (label) labels.add(label);
  });
  return labels.size === 1 ? Array.from(labels)[0] : null;
}

/* Alle visningstekster for et tres vokabularverdier, på ALLE språk.
   Brukes bare til å bygge søkeindeksen: et søk på «matematikk» skal
   treffe et tre som lagrer `mathematics`, uansett hvilket språk
   katalogen står i. */
function vocabSynonyms(tree) {
  const out = [];
  if (!VOCAB) return out;
  VOCAB_FIELDS.forEach(field => {
    if (field === 'institution') return;   // håndteres under, via .label
    const entry = VOCAB[field] && VOCAB[field][tree[field]];
    if (entry) out.push(...Object.values(entry).filter(v => typeof v === 'string'));
  });
  const inst = institutionEntry(tree.institution);
  if (inst) {
    if (typeof inst.label === 'string') out.push(inst.label);
    const div = inst.divisions && inst.divisions[tree.division];
    if (div) out.push(...Object.values(div).filter(v => typeof v === 'string'));
  }
  return out;
}

/* Hvert vokabularfelt i et tre må finnes i vocabulary.json. Returnerer en
   liste over det som mangler — tom liste betyr at treet er i orden. */
function validateVocab(tree) {
  const problems = [];
  VOCAB_FIELDS.forEach(field => {
    const key = tree[field];
    if (!key) { problems.push(field + ' mangler'); return; }
    if (!VOCAB[field] || !VOCAB[field][key] || !vocab(field, key)) {
      problems.push(field + ' = «' + key + '» finnes ikke i vocabulary.json');
    }
  });
  const inst = institutionEntry(tree.institution);
  if (inst && tree.division && !(inst.divisions && inst.divisions[tree.division])) {
    problems.push('division = «' + tree.division + '» finnes ikke under institusjonen «' + tree.institution + '»');
  }
  return problems;
}

/* Sorteringslokalet følger katalogspråket, så «Å» havner sist på norsk og
   «Ö» sist på svensk. */
const COLLATION = { en: 'en', no: 'nb', sv: 'sv' };
function collator() {
  return COLLATION[lang()] || 'en';
}

/* Felt som fritekstsøket leter i. `topics` og `keywords` er lister —
   join-es før søk, slik at et søk på «annuitetslån» treffer et tre som
   aldri nevner ordet i tittelen. */
/* Vokabularfeltene står IKKE her — de lagrer nøkler («mathematics»), og
   et søk på «matematikk» ville ikke truffet. De legges i stedet inn som
   oversettelser på alle språk, via vocabSynonyms(). */
const SEARCH_FIELDS = [
  'title', 'subtitle', 'summary', 'course', 'courseCode',
  'curriculum', 'author', 'topics', 'keywords',
];

/* Nøklene er en del av delbare lenker (?sort=storst) og må derfor IKKE
   endres når teksten oversettes — labelKey slår opp visningsteksten. */
const SORTS = {
  relevans:  { labelKey: 'sort-relevans',  fn: (a, b) => b._score - a._score || cmpTitle(a, b) },
  tittel:    { labelKey: 'sort-tittel',    fn: cmpTitle },
  storst:    { labelKey: 'sort-storst',    fn: (a, b) => (b.nodeCount || 0) - (a.nodeCount || 0) || cmpTitle(a, b) },
  oppdatert: { labelKey: 'sort-oppdatert', fn: (a, b) => String(b.updated || '').localeCompare(String(a.updated || '')) || cmpTitle(a, b) },
};

/* Hvor mange ULIKE verdier en fasett må ha før den vises i filterlista.
   1 = vis alltid. En fasett der alle trærne har samme verdi filtrerer jo
   ingenting, så argumentet for 2 er åpenbart — men den forteller fortsatt
   noe (at katalogen bare inneholder norske trær, f.eks.), og mens katalogen
   er liten er en tom filterliste verre enn en triviell. Sett den til 2 når
   katalogen er stor nok til at enverdi-fasetter bare er støy. */
const MIN_FACET_VALUES = 1;

function cmpTitle(a, b) {
  return String(a.title || '').localeCompare(String(b.title || ''), collator());
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

  buildSortOptions();

  el.search.addEventListener('input', () => {
    query = el.search.value.trim();
    render();
    syncUrl();
    trackSearchSoon();
  });
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

  /* Katalogspråket byttes av js/i18n.js, som bare rører markup med
     data-i18n. Alt DENNE fila har bygget (fasettlista, kortene, telleren,
     sorteringsvalgene) må tegnes om for hånd. Rekkefølgen er viktig:
     buildFacets() leser `selected`, så avhukingene overlever. */
  if (window.i18n && window.i18n.onChange) {
    window.i18n.onChange(() => {
      buildSortOptions();
      el.sort.value = sort;
      if (TREES.length) { buildFacets(); render(); }
    });
  }

  loadTrees();
});

function buildSortOptions() {
  el.sort.innerHTML = '';
  Object.keys(SORTS).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = t(SORTS[key].labelKey);
    el.sort.appendChild(opt);
  });
}

function loadTrees() {
  /* Vokabularet må ligge klart FØR trærne valideres mot det, så de to
     hentes sammen framfor i rekkefølge. */
  Promise.all([
    fetch('vocabulary.json').then(res => {
      if (!res.ok) throw new Error('vocabulary.json ga HTTP ' + res.status);
      return res.json();
    }),
    fetch('trees.json').then(res => {
      if (!res.ok) throw new Error('trees.json ga HTTP ' + res.status);
      return res.json();
    }),
  ])
    .then(([vocabulary, manifest]) => {
      VOCAB = vocabulary;
      const slugs = (manifest && manifest.trees) || [];
      if (!slugs.length) throw new Error('trees.json inneholder ingen trær.');
      return Promise.all(slugs.map(loadOne));
    })
    .then(list => {
      TREES = list.filter(Boolean).filter(checkVocab).map(prepare);
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
      el.status.removeAttribute('data-i18n');   // ikke overskriv feilen ved språkbytte
      el.status.textContent = fmt('load-error', { message: err.message });
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

/* Et tre med en vokabularverdi vi ikke kjenner utelates, og grunnen står
   i konsollen. Se kommentaren over vocab(): dette skal være umulig i
   praksis, siden hvert tre er gjennomgått for hånd — treffer det, er det
   en skrivefeil i meta.json eller en verdi som mangler i vocabulary.json,
   og begge deler er noe som skal rettes framfor skjules. */
function checkVocab(tree) {
  const problems = validateVocab(tree);
  if (!problems.length) return true;
  console.error(
    'Treet «' + tree.slug + '» utelates fra katalogen — ukjente vokabularverdier:\n  ' +
    problems.join('\n  ') + '\nLegg nøkkelen inn i trees/vocabulary.json.'
  );
  return false;
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
  parts.push(vocabSynonyms(tree).join(' '));
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
function matchesQuery(tree, words) {
  return words.every(w => tree._haystack.includes(w));
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
  const words = terms();
  return TREES.filter(tree => matchesQuery(tree, words) && matchesFacets(tree, null));
}

/* Enkel relevansscore: treff i tittel/kurs veier tyngst, deretter
   ingress/undertittel, deretter alt annet. Uten søketekst er alle like og
   sorteringen faller tilbake på tittel. */
function score(tree, words) {
  if (!words.length) return 0;
  const title = String(tree.title + ' ' + (tree.course || '')).toLowerCase();
  const near = String((tree.subtitle || '') + ' ' + (tree.summary || '')).toLowerCase();
  let s = 0;
  words.forEach(term => {
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
  const words = terms();
  const results = currentResults();
  results.forEach(tree => { tree._score = score(tree, words); });
  results.sort(SORTS[sort].fn);

  renderCounts();
  renderChips();

  /* Tallet skal stå i <strong>, men hvor i setningen det havner er opp til
     språket ({n} i ordboka). Derfor splittes den oversatte strengen rundt
     tallet i stedet for å limes sammen av biter. */
  el.count.innerHTML = '';
  const countKey = results.length === 1 ? 'results-one' : 'results-many';
  const parts = String(t(countKey)).split('{n}');
  el.count.appendChild(document.createTextNode(parts[0] || ''));
  const strong = document.createElement('strong');
  strong.textContent = String(results.length);
  el.count.appendChild(strong);
  el.count.appendChild(document.createTextNode(parts.length > 1 ? parts[1] : ''));
  if (results.length !== TREES.length) {
    el.count.appendChild(document.createTextNode(fmt('results-of', { total: TREES.length })));
  }

  el.reset.hidden = !hasActiveFilters();

  el.grid.innerHTML = '';
  if (!results.length) {
    el.grid.appendChild(emptyState());
    return;
  }
  results.forEach((tree, i) => el.grid.appendChild(card(tree, i + 1)));
}

function emptyState() {
  const li = document.createElement('li');
  li.className = 'empty';
  li.style.gridColumn = '1 / -1';

  const h = document.createElement('h3');
  h.textContent = t('empty-title');
  li.appendChild(h);

  const p = document.createElement('p');
  p.textContent = t('empty-body');
  li.appendChild(p);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'linkbtn';
  btn.textContent = t('empty-reset');
  btn.addEventListener('click', clearAll);
  li.appendChild(btn);

  return li;
}

function card(tree, position) {
  const li = document.createElement('li');

  const a = document.createElement('a');
  a.className = 'treecard';
  a.href = tree.path;
  a.addEventListener('click', () => {
    if (!window.aistTrack) return;
    window.aistTrack('tree_open', {
      tree_slug: tree.slug,
      tree_title: tree.title,
      tree_language: tree.language || null,
      list_position: position,
      // Hvilket katalogspråk leseren sto i da treet ble åpnet. Sammen med
      // tree_language er det svaret på om noen går inn i et tre de ikke
      // kan lese språket i — se språknotatet på /trees/.
      ui_language: lang(),
      search_term: query || null
    });
  });

  /* Treets eget språk står på kortet, ikke bare i filteret: trærne er ikke
     oversatt, så språket er noe leseren trenger FØR klikket. Verdiene er
     nøkler i meta.json og slås opp i vokabularet på katalogens språk. */
  const meta = document.createElement('p');
  meta.className = 'treecard__meta';
  [
    vocab('country', tree.country),
    divisionText(tree.institution, tree.division),
    vocab('subjectArea', tree.subjectArea),
    vocab('language', tree.language),
  ].filter(Boolean).forEach(v => {
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
  if (tree.skillCount) counts.push(fmt('card-skills', { n: tree.skillCount }));
  if (tree.conceptCount) counts.push(fmt('card-concepts', { n: tree.conceptCount }));
  left.textContent = counts.join(' · ') || (tree.nodeCount ? fmt('card-nodes', { n: tree.nodeCount }) : '');
  foot.appendChild(left);

  /* Ingen utkast/publisert-merking: ligger treet på sida, er det
     publisert. Skillet ble fjernet 2026-09-20 — det beskrev hvor ferdig
     Vidar syntes et tre var, ikke noe leseren kunne bruke. */
  const go = document.createElement('span');
  go.className = 'treecard__go';
  go.textContent = t('card-open');
  foot.appendChild(go);

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
    /* En avhengig fasett er skjult til foreldrefasetten har et valg. Da
       må den også slutte å filtrere: et valg som ligger igjen i en skjult
       fasett ville tynnet ut resultatlista uten at noe på skjermen sa
       hvorfor. Derfor nullstilles den her framfor bare å utelates. */
    if (facet.parent && !selected.get(facet.parent).size) {
      selected.get(facet.key).clear();
      return;
    }

    const values = facetValues(facet);
    if (values.length < MIN_FACET_VALUES) return;

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'facet';
    fieldset.dataset.facet = facet.key;

    const legend = document.createElement('legend');
    legend.className = 'facet__legend';
    legend.textContent = facetLegend(facet);
    fieldset.appendChild(legend);

    const ul = document.createElement('ul');
    ul.className = 'facet__list';

    values.forEach(value => {
      const li = document.createElement('li');

      const label = document.createElement('label');
      label.className = 'facet__row';
      // Nøkkelen, ikke teksten: renderCounts() og delbare lenker bruker
      // den, og den skal være den samme på alle tre språk.
      label.dataset.value = value.key;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value.key;
      input.checked = selected.get(facet.key).has(value.key);
      input.addEventListener('change', () => {
        const set = selected.get(facet.key);
        if (input.checked) set.add(value.key); else set.delete(value.key);
        // Er dette fasetten en annen henger av, endrer valget hvilke
        // fasetter og verdier som i det hele tatt skal stå der.
        if (hasChildFacet(facet.key)) buildFacets();
        render();
        syncUrl();
        // Bare påslag rapporteres. Et avslag er som regel bare en angring,
        // og å telle begge ville gjort «hvilke filtre brukes» ubrukelig.
        if (input.checked && window.aistTrack) {
          window.aistTrack('catalog_filter', { facet: facet.key, facet_value: value.key });
        }
      });

      const name = document.createElement('span');
      name.className = 'facet__name';
      name.textContent = value.text;

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

function hasChildFacet(key) {
  return FACETS.some(f => f.parent === key);
}

/* Verdiene i en fasett, som {key, text}, sortert på det leseren ser —
   ikke på nøkkelen. «Kjemi» skal stå foran «Matematikk» på norsk selv om
   nøklene er `chemistry` og `mathematics`.

   En avhengig fasett (`division`) begrenses til foreldrevalget: bare
   inndelingene som hører til de avhukede institusjonene. */
function facetValues(facet) {
  const pool = facet.parent
    ? TREES.filter(tree => selected.get(facet.parent).has(tree[facet.parent]))
    : TREES;

  const seen = new Map();
  pool.forEach(tree => {
    const key = tree[facet.key];
    if (!key || seen.has(key)) return;
    const text = facet.key === 'division'
      ? divisionText(tree.institution, key)
      : vocab(facet.key, key);
    if (text) seen.set(key, text);
  });

  /* `numeric` so «Trinn 8» sorts before «Trinn 10». Without it the facet
     reads 10, 8, 9, because a plain string compare puts «1» before «8». */
  return Array.from(seen, ([key, text]) => ({ key: key, text: text }))
    .sort((a, b) => a.text.localeCompare(b.text, collator(), { numeric: true }));
}

/* Overskriften over fasetten. `division` henter sin fra institusjonen som
   er valgt — «Trinn» for et skoleslag, «Fakultet» for et universitet — og
   faller tilbake på sidas nøytrale overskrift når flere institusjoner med
   ulike ord er huket av samtidig. */
function facetLegend(facet) {
  if (facet.key === 'division') {
    const chosen = Array.from(selected.get('institution'));
    const fromInstitution = divisionLegend(chosen);
    if (fromInstitution) return fromInstitution;
  }
  return t(facet.labelKey);
}

/* Visningstekst for én valgt verdi — brukt av filterbrikkene, som lever
   utenfor fasettlista og derfor ikke kan lese teksten av avkryssingsboksen. */
function valueText(facetKey, key) {
  if (facetKey !== 'division') return vocab(facetKey, key);
  for (const tree of TREES) {
    if (tree.division === key) return divisionText(tree.institution, key);
  }
  return null;
}

/* Tallet bak hver verdi er hvor mange treff DEN verdien ville gitt med alle
   ANDRE filtre stående — ikke hvor mange som er igjen nå. Det er derfor
   `matchesFacets` kan hoppe over sin egen fasett: uten det ville hver
   verdi du ikke hadde huket av vist 0 så snart du huket av én, og
   filterlista ville vært ubrukelig til å se hva neste klikk gir. */
function renderCounts() {
  const words = terms();

  el.facets.querySelectorAll('.facet').forEach(fieldset => {
    const key = fieldset.dataset.facet;
    const pool = TREES.filter(tree => matchesQuery(tree, words) && matchesFacets(tree, key));

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
      const facetLabel = facetLegend(facet);
      const valueLabel = valueText(facet.key, value) || value;
      chip.setAttribute('aria-label', fmt('chip-remove-aria', { facet: facetLabel, value: valueLabel }));

      const text = document.createElement('span');
      text.textContent = facetLabel + ': ' + valueLabel;

      const x = document.createElement('span');
      x.className = 'chip__x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';

      chip.append(text, x);
      chip.addEventListener('click', () => {
        selected.get(facet.key).delete(value);
        // Fjerner man den siste institusjonen, skal inndelingsfasetten
        // forsvinne igjen — samme grunn som i buildFacets().
        if (hasChildFacet(facet.key)) buildFacets();
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
  buildFacets();          // avhengige fasetter skal forsvinne igjen
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
/* Analytics                                                            */
/*                                                                      */
/* Det ENE spørsmålet katalogen kan svare på som ingenting annet kan:   */
/* hvilke fag folk leter etter. Etter migreringen 2026-09-20 ligger alle */
/* de norske trærne her, så et bomsøk er ikke lenger «ikke flyttet ennå» */
/* — det er et fag som ikke finnes, og dermed den mest direkte beskjeden */
/* om hva som bør skrives eller bidras neste gang.                       */
/*                                                                      */
/* Hendelsen sendes ETTER at skrivinga har lagt seg (900 ms), ikke per  */
/* tastetrykk: ellers rapporteres «s», «st», «sta» … som fire søk.      */
/* Navnet `search` er GA4s eget standardnavn og havner derfor i den     */
/* innebygde søkerapporten framfor i en egendefinert.                   */
/* ------------------------------------------------------------------ */

const SEARCH_TRACK_DELAY = 900;
let searchTimer = null;
let lastTrackedQuery = '';

function trackSearchSoon() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const term = query.trim();
    // Under to tegn er det ikke et søk ennå, bare en påbegynt tanke.
    if (term.length < 2 || term === lastTrackedQuery) return;
    lastTrackedQuery = term;
    if (!window.aistTrack) return;

    const hits = currentResults().length;
    window.aistTrack('search', { search_term: term, results: hits, ui_language: lang() });
    if (hits === 0) window.aistTrack('catalog_no_results', { search_term: term, ui_language: lang() });
  }, SEARCH_TRACK_DELAY);
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
