/* ==========================================================================
   mail-link.js — puts an email address together in the browser.

   The address is never written out whole in the HTML source, so a scraper
   reading the markup finds no address to harvest. The page carries the two
   halves as data attributes on a hidden link:

     <a data-mail-user="name" data-mail-domain="example.org" hidden></a>

   and this file joins them, sets the mailto: href and the visible text, and
   unhides the link. Without JavaScript the link stays hidden and the page's
   <noscript> fallback ("name [at] example [dot] org") is shown instead.
   ========================================================================== */
(function () {
  'use strict';

  var links = document.querySelectorAll('[data-mail-user][data-mail-domain]');
  for (var i = 0; i < links.length; i++) {
    var a = links[i];
    var address = a.getAttribute('data-mail-user') + '@' + a.getAttribute('data-mail-domain');
    a.setAttribute('href', 'mailto:' + address);
    a.textContent = address;
    a.hidden = false;
  }
})();
