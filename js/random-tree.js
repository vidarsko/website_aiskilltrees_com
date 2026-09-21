/* ==========================================================================
   random-tree.js — «Se et tilfeldig tre» på forsida.

   Knappen er en ekte lenke til /trees/ i markupen, og dette scriptet bytter
   bare ut href-en når katalogen er hentet. Slår noe feil — scriptet er ikke
   lastet, trees.json er borte, JavaScript er av — havner den besøkende i
   katalogen og kan velge selv. En knapp som ikke gjør noe er verre enn en
   knapp som gjør noe nest best.

   Treet velges på nytt ved hvert klikk, ikke ved sidelasting: den som
   trykker to ganger skal få to forskjellige trær.

   TREET SKAL VÆRE PÅ LESERENS SPRÅK. Et ferdighetstre er enspråklig — det
   er skrevet på ett språk av den som laget det — så en svensk besøkende som
   lander på et norsk tre ser noe hen ikke kan bruke, og det er et dårlig
   førsteinntrykk av en metode hen ikke kjenner. Språket står i hvert tres
   `meta.json`, ikke i `trees.json` (som med vilje bare er en liste over
   slugs), så det koster én liten forespørsel per tre å vite det. Katalogen
   gjør nøyaktig det samme, og filene er noen hundre bytes hver.

   Finnes det ikke noe tre på leserens språk, går knappen til et tilfeldig
   av alle. Et tre på feil språk er fortsatt et tre å se på; ingenting er
   ikke noe å se på.
   ========================================================================== */

(function () {
  'use strict';

  var link = document.querySelector('[data-random-tree]');
  if (!link) return;

  var slugs = null;          // alle trærne, som før
  var byLanguage = null;     // { nb: [...], sv: [...] } — null til metadataene er inne
  var languageOf = {};       // slug → språk, for sporingen

  fetch('/trees/trees.json')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      var list = Array.isArray(data) ? data : (data && data.trees) || [];
      if (!list.length) return;
      slugs = list;
      return loadLanguages(list);
    })
    .catch(function () { /* lenka blir stående på /trees/ */ });

  /* Alle meta.json-ene parallelt. En som ikke svarer, utelates framfor å
     stoppe resten: da mangler ett tre i språkutvalget, og knappen virker. */
  function loadLanguages(list) {
    return Promise.all(list.map(function (slug) {
      return fetch('/trees/' + slug + '/meta.json')
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (meta) { return meta && meta.language ? { slug: slug, lang: meta.language } : null; })
        .catch(function () { return null; });
    })).then(function (entries) {
      var map = {};
      entries.forEach(function (entry) {
        if (!entry) return;
        (map[entry.lang] = map[entry.lang] || []).push(entry.slug);
        languageOf[entry.slug] = entry.lang;
      });
      byLanguage = map;
    });
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  link.addEventListener('click', function (e) {
    if (!slugs) return;                       // la lenka gå til katalogen

    /* Leses ved klikk, ikke ved lasting: språket kan byttes i toppbaren
       mens sida står åpen. Er metadataene ikke inne ennå, velges det fra
       alle framfor å vente på nettet med en besøkende som har trykket. */
    var ui = (window.i18n && window.i18n.lang) || 'en';
    var inLanguage = byLanguage && byLanguage[ui];
    var slug = pick(inLanguage && inLanguage.length ? inLanguage : slugs);
    if (!slug) return;

    e.preventDefault();
    if (window.aistTrack) {
      window.aistTrack('random_tree', {
        slug: slug,
        ui_language: ui,
        /* Er de to ulike, fantes det ikke noe tre på leserens språk. Det er
           det tallet som sier hvilket språk som mangler et tre. */
        tree_language: languageOf[slug] || 'unknown',
      });
    }
    location.href = '/trees/' + slug + '/';
  });
})();
