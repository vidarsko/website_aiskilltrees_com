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

  var T = {
    by: {
      en: 'AI Skill Trees — an open method by Vidar Skogvoll.',
      nb: 'AI Skill Trees — en åpen metode av Vidar Skogvoll.',
      sv: 'AI Skill Trees — en öppen metod av Vidar Skogvoll.'
    },
    licence: {
      en: 'The engine is MIT-licensed; the instructions and the trees are CC BY 4.0.',
      nb: 'Motoren er MIT-lisensiert; instruksene og trærne er CC BY 4.0.',
      sv: 'Motorn är MIT-licensierad; instruktionerna och träden är CC BY 4.0.'
    },
    affiliation: {
      en: 'Part of a research project at <a href="https://www.mn.uio.no/kurt/index.html">KURT – Centre for Teaching and Learning in Science</a>, University of Oslo.',
      nb: 'Del av et forskningsprosjekt ved <a href="https://www.mn.uio.no/kurt/index.html">Kompetansesenter for undervisning i realfag og teknologi (KURT)</a>, Universitetet i Oslo.',
      sv: 'Del av ett forskningsprojekt vid <a href="https://www.mn.uio.no/kurt/index.html">KURT – Centre for Teaching and Learning in Science</a>, Universitetet i Oslo.'
    },
    links: { en: 'Footer', nb: 'Bunntekst', sv: 'Sidfot' }
  };

  var LINKS = [
    { href: '/contribute/', label: { en: 'Submit your tree', nb: 'Send inn treet ditt', sv: 'Skicka in ditt träd' } },
    { href: '/privacy/',    label: { en: 'Privacy',          nb: 'Personvern',          sv: 'Integritet' } },
    { href: 'https://github.com/vidarsko/ai-skill-trees', label: { en: 'Source code', nb: 'Kildekode', sv: 'Källkod' } }
  ];

  var host = document.querySelector('[data-site-footer]');
  if (!host) return;

  function lang() {
    var l = (window.i18n && window.i18n.lang) || document.documentElement.lang || 'en';
    return /^(nb|no|nn)/.test(l) ? 'nb' : (/^sv/.test(l) ? 'sv' : 'en');
  }

  function render() {
    var L = lang();
    var links = LINKS.map(function (x) {
      return '<li><a href="' + x.href + '">' + (x.label[L] || x.label.en) + '</a></li>';
    }).join('');
    host.innerHTML =
      '<div class="band__inner sitefooter__inner">' +
        '<p class="sitefooter__by">' + T.by[L] + '</p>' +
        '<ul class="sitefooter__links" aria-label="' + T.links[L] + '">' + links + '</ul>' +
        '<p class="sitefooter__meta">' + T.licence[L] + '</p>' +
        '<p class="sitefooter__meta">' + T.affiliation[L] + '</p>' +
      '</div>';
  }

  render();
  if (window.i18n && window.i18n.onChange) window.i18n.onChange(render);
})();
