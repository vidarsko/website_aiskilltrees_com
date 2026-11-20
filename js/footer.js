/* ==========================================================================
   footer.js — the site footer, rendered for every page.

   Same reasoning as header.js: the footer is site chrome, so one file owns
   it, and every page carries the same footer with the same links in the
   same place (ux-design rule 3). Until 2026-11-12 each page had its own
   copy, and the middle line had drifted into a per-page status note
   ("Placeholder landing page", "Parts of this page are still being
   written"). Status notes do not belong in the footer.

   A page needs only
     <footer class="band band--dark sitefooter" data-site-footer></footer>
   and <script src="/js/footer.js" defer></script> after i18n.js.

   The KURT name differs by language on purpose: Norwegian uses the centre's
   Norwegian name, every other language its English one. See AGENTS.md,
   "Tilknytning — KURT ved UiO".
   ========================================================================== */
(function () {
  'use strict';

  /* English fallbacks. Every language, English included, is in
     /i18n/<lang>/_site.json (keys footer-*), read through window.i18n.s(). */
  var T = {
    by: ['footer-by', 'AI Skill Trees — an open method by Vidar Skogvoll.'],
    licence: ['footer-licence', 'The engine is MIT-licensed; the instructions and the trees are CC BY 4.0.'],
    affiliation: ['footer-affiliation', 'Part of a research project at <a href="https://www.mn.uio.no/kurt/index.html">KURT – Centre for Teaching and Learning in Science</a>, University of Oslo.'],
    links: ['footer-links', 'Footer']
  };

  var LINKS = [
    { href: '/contribute/', label: ['footer-submit', 'Submit your tree'] },
    { href: '/privacy/',    label: ['footer-privacy', 'Privacy'] },
    { href: 'https://github.com/vidarsko/ai-skill-trees', label: ['footer-source', 'Source code'] }
  ];

  var host = document.querySelector('[data-site-footer]');
  if (!host) return;

  function s(pair) {
    return (window.i18n && window.i18n.s) ? window.i18n.s(pair[0], pair[1]) : pair[1];
  }

  /* The strings come from the site's own files, never from a visitor, so
     innerHTML is safe here; the KURT line carries a link. */
  function render() {
    var links = LINKS.map(function (x) {
      return '<li><a href="' + x.href + '">' + s(x.label) + '</a></li>';
    }).join('');
    host.innerHTML =
      '<div class="band__inner sitefooter__inner">' +
        '<p class="sitefooter__by">' + s(T.by) + '</p>' +
        '<ul class="sitefooter__links" aria-label="' + s(T.links) + '">' + links + '</ul>' +
        '<p class="sitefooter__meta">' + s(T.licence) + '</p>' +
        '<p class="sitefooter__meta">' + s(T.affiliation) + '</p>' +
      '</div>';
  }

  render();
  if (window.i18n && window.i18n.onChange) window.i18n.onChange(render);
})();
