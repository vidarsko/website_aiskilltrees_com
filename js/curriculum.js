/* ==========================================================================
   curriculum.js — search and "only subjects with a tree" on a curriculum page
   (/gy25/). The list itself is static markup written by
   tools/build-gy25-page.ps1, so the page works without this file; this only
   hides rows. No text lives here: the empty-state message is in the page's
   own markup, and this only shows or hides it.
   ========================================================================== */
(function () {
  'use strict';

  var input = document.querySelector('[data-subject-search]');
  var onlyTrees = document.querySelector('[data-subject-only-trees]');
  var empty = document.querySelector('[data-subject-empty]');
  if (!input || !onlyTrees) return;

  var rows = Array.prototype.slice.call(document.querySelectorAll('.subject'));

  function apply() {
    var words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    rows.forEach(function (row) {
      var name = row.getAttribute('data-name') || '';
      var ok = words.every(function (w) { return name.indexOf(w) !== -1; });
      if (ok && onlyTrees.checked) ok = !!row.querySelector('a.level');
      row.hidden = !ok;
      if (ok) shown++;
    });
    /* Open a folded group when a search finds something inside it, and
       hide a group heading with nothing left under it. */
    var filtering = words.length > 0 || onlyTrees.checked;
    document.querySelectorAll('.subject-group').forEach(function (g) {
      var any = g.querySelector('.subject:not([hidden])');
      g.hidden = filtering && !any;
      if (filtering && any && g.tagName === 'DETAILS') g.open = true;
    });
    if (empty) empty.hidden = shown !== 0;
  }

  input.addEventListener('input', apply);
  onlyTrees.addEventListener('change', apply);
  apply();
})();
