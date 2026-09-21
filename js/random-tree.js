/* ==========================================================================
   random-tree.js — «Se et tilfeldig tre» på forsida.

   Knappen er en ekte lenke til /trees/ i markupen, og dette scriptet bytter
   bare ut href-en når katalogen er hentet. Slår noe feil — scriptet er ikke
   lastet, trees.json er borte, JavaScript er av — havner den besøkende i
   katalogen og kan velge selv. En knapp som ikke gjør noe er verre enn en
   knapp som gjør noe nest best.

   Treet velges på nytt ved hvert klikk, ikke ved sidelasting: den som
   trykker to ganger skal få to forskjellige trær.
   ========================================================================== */

(function () {
  'use strict';

  var link = document.querySelector('[data-random-tree]');
  if (!link) return;

  var slugs = null;

  fetch('/trees/trees.json')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      var list = Array.isArray(data) ? data : (data && data.trees) || [];
      if (list.length) slugs = list;
    })
    .catch(function () { /* lenka blir stående på /trees/ */ });

  link.addEventListener('click', function (e) {
    if (!slugs) return;                       // la lenka gå til katalogen
    var slug = slugs[Math.floor(Math.random() * slugs.length)];
    if (!slug) return;
    e.preventDefault();
    if (window.aistTrack) window.aistTrack('random_tree', { slug: slug });
    location.href = '/trees/' + slug + '/';
  });
})();
