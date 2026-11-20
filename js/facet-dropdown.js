/* ==========================================================================
   facet-dropdown.js — a long filter list becomes a dropdown.

   Vidar, 2026-11-20: with trees from some 40 countries in some 40
   languages, the country and language filters can no longer be plain lists
   of checkboxes. A facet with more than DROPDOWN_FROM values is folded into
   a button that says what is chosen ("All", "Norway", "Norway, Sweden",
   "Norway +3"); pressing it opens the same checkbox list, with a field on
   top that narrows it as you type. Short facets stay as they were.

   Used by js/catalog.js (/trees/) and js/tree-picker.js (/make-your-own/),
   which build the fieldset as before and then call
       window.facetDropdown.enhance(fieldset)
   and, whenever the checked state may have changed without a click
   (chips, "reset", the back button),
       window.facetDropdown.refresh(rootElement)

   The checkboxes are the same elements as before, so counting, URL state
   and chips in those scripts keep working untouched. The panel opens in
   the flow (it pushes the next filter down) rather than floating, because
   the filter rail is sticky on a wide screen and a drawer on a phone, and a
   floating panel would be cut off in both.
   ========================================================================== */
(function () {
  'use strict';

  var DROPDOWN_FROM = 8;

  function t(key, fallback) {
    var s = (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
    return s === key ? fallback : s;
  }

  function chosenText(fieldset) {
    var names = [].slice.call(fieldset.querySelectorAll('.facet__row input:checked'))
      .map(function (i) { var n = i.parentNode.querySelector('.facet__name'); return n ? n.textContent : i.value; });
    if (!names.length) return t('facet-all', 'All');
    if (names.length <= 2) return names.join(', ');
    return names[0] + ' +' + (names.length - 1);
  }

  function refreshOne(fieldset) {
    var summary = fieldset.querySelector('.facet__summary-text');
    if (summary) summary.textContent = chosenText(fieldset);
    var details = fieldset.querySelector('.facet__dropdown');
    if (details) details.classList.toggle('has-choice', !!fieldset.querySelector('.facet__row input:checked'));
  }

  function enhance(fieldset) {
    var ul = fieldset.querySelector('.facet__list');
    if (!ul || ul.children.length <= DROPDOWN_FROM || fieldset.querySelector('.facet__dropdown')) return;
    var key = fieldset.dataset.facet;

    var details = document.createElement('details');
    details.className = 'facet__dropdown';
    /* Remember an open dropdown across a rebuild (choosing a country
       rebuilds the facets, and the list should not snap shut under you). */
    var st = state(key);
    if (st.open) details.open = true;

    var summary = document.createElement('summary');
    summary.className = 'facet__summary';
    summary.innerHTML = '<span class="facet__summary-text"></span><span class="facet__caret" aria-hidden="true">&#9662;</span>';
    details.appendChild(summary);

    var panel = document.createElement('div');
    panel.className = 'facet__panel';
    var find = document.createElement('input');
    find.type = 'search';
    find.className = 'facet__find';
    find.placeholder = t('facet-find', 'Find…');
    find.setAttribute('aria-label', find.placeholder);
    find.autocomplete = 'off';
    find.addEventListener('input', function () {
      var q = find.value.trim().toLowerCase();
      [].slice.call(ul.children).forEach(function (li) {
        var name = (li.textContent || '').toLowerCase();
        var value = ((li.querySelector('[data-value]') || {}).dataset || {}).value || '';
        li.hidden = !!q && name.indexOf(q) === -1 && value.toLowerCase().indexOf(q) === -1;
      });
    });
    panel.appendChild(find);
    ul.parentNode.insertBefore(details, ul);
    panel.appendChild(ul);
    details.appendChild(panel);

    /* Keep the list where it was, and the page too. Choosing a country
       rebuilds every facet (the school-type facet depends on it), which
       otherwise snaps the list back to the top and drops the focus — the
       "jump" Vidar saw on 2026-11-20. */
    ul.addEventListener('scroll', function () { st.scroll = ul.scrollTop; });
    fieldset.addEventListener('change', function (e) {
      st.focus = e.target && e.target.value;
      st.scroll = ul.scrollTop;
      pendingPageY = window.scrollY;
    }, true);
    if (st.open) {
      ul.scrollTop = st.scroll || 0;
      if (st.focus != null) {
        var again = ul.querySelector('input[value="' + String(st.focus).replace(/"/g, '\\"') + '"]');
        if (again) again.focus({ preventScroll: true });
      }
    }

    details.addEventListener('toggle', function () {
      st.open = details.open;
      if (details.open) {
        /* One open dropdown at a time. */
        document.querySelectorAll('.facet__dropdown[open]').forEach(function (d) {
          if (d !== details) d.open = false;
        });
        if (window.matchMedia('(pointer: fine)').matches) find.focus();
      } else {
        find.value = '';
        [].slice.call(ul.children).forEach(function (li) { li.hidden = false; });
      }
    });
    fieldset.addEventListener('change', function () { refreshOne(fieldset); });
    details.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && details.open) { details.open = false; summary.focus(); }
    });
    refreshOne(fieldset);
  }
  var states = {};
  function state(key) { return states[key] || (states[key] = { open: false, scroll: 0, focus: null }); }
  var pendingPageY = null;

  function refresh(root) {
    (root || document).querySelectorAll('.facet').forEach(refreshOne);
    /* After a rebuild, put the page back where it was. */
    if (pendingPageY != null) {
      var y = pendingPageY;
      pendingPageY = null;
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    }
  }

  window.facetDropdown = { enhance: enhance, refresh: refresh };
})();
