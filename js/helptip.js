/* ==========================================================================
   helptip.js — the «?» explanations on the content pages.

   Markup (spans, so it can sit inside a heading or a sentence):

     <span class="helptip">
       <button type="button" class="helptip__btn" aria-expanded="false">?</button>
       <span class="helptip__bubble" role="note" hidden>
         <span>First paragraph.</span>
         <span>Second paragraph.</span>
       </span>
     </span>

   A click on «?» opens the bubble over the content; it pushes nothing
   (ux-design rules 6 and 7). Another click, Esc or a click outside closes
   it, and only one is open at a time. The bubble is moved sideways so it
   stays inside the screen, and the arrow follows the button.

   The button gets its accessible name here when the markup has none, so the
   pages need no dictionary key for it.
   ========================================================================== */
(function () {
  'use strict';

  var NAME = { en: 'Explain', nb: 'Forklar', sv: 'Förklara' };

  function lang() {
    var l = (window.i18n && window.i18n.lang) || document.documentElement.lang || 'en';
    return /^(nb|no|nn)/.test(l) ? 'nb' : (/^sv/.test(l) ? 'sv' : 'en');
  }

  function name() {
    document.querySelectorAll('.helptip__btn').forEach(function (b) {
      if (!b.hasAttribute('data-own-label')) b.setAttribute('aria-label', NAME[lang()]);
    });
  }

  function bubbleOf(btn) { return btn.parentNode.querySelector('.helptip__bubble'); }

  function close(btn) {
    btn.setAttribute('aria-expanded', 'false');
    bubbleOf(btn).hidden = true;
  }

  function closeAll(except) {
    document.querySelectorAll('.helptip__btn[aria-expanded="true"]').forEach(function (b) {
      if (b !== except) close(b);
    });
  }

  function open(btn) {
    var bubble = bubbleOf(btn);
    bubble.style.removeProperty('--bubble-left');
    bubble.hidden = false;
    btn.setAttribute('aria-expanded', 'true');

    /* Keep the bubble on screen: shift it left if it runs past the right
       edge, never past the left one. The arrow stays under the button. */
    var margin = 16;
    /* clientWidth, not innerWidth: on a phone, a bubble that sticks out
       widens the layout viewport, and innerWidth grows with it, so the
       bubble never looked too wide and stayed half off screen (bug until
       2026-11-14). */
    var vw = document.documentElement.clientWidth;
    var r = bubble.getBoundingClientRect();
    var b = btn.getBoundingClientRect();
    var shift = 0;
    if (r.right > vw - margin) shift = vw - margin - r.right;
    if (r.left + shift < margin) shift = margin - r.left;
    var left = (r.left + shift) - b.left;
    bubble.style.setProperty('--bubble-left', left + 'px');
    bubble.style.setProperty('--arrow-left', (b.left + b.width / 2 - (b.left + left) - 6) + 'px');
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.helptip__btn');
    if (btn) {
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      closeAll(btn);
      if (isOpen) close(btn); else open(btn);
      return;
    }
    if (!(e.target.closest && e.target.closest('.helptip__bubble'))) closeAll();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var openBtn = document.querySelector('.helptip__btn[aria-expanded="true"]');
    if (openBtn) { close(openBtn); openBtn.focus(); }
  });

  window.addEventListener('resize', function () { closeAll(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', name);
  else name();
  /* Some «?» are built by script after load (the catalogue's facets). */
  new MutationObserver(function () {
    if (document.querySelector('.helptip__btn:not([aria-label])')) name();
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (window.i18n && window.i18n.onChange) window.i18n.onChange(name);
})();
