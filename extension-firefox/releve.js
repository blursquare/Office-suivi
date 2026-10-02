// Relevé de la page d'Authentic affichée. Définit window.__claireRelever(), appelée au clic sur le
// bouton (capture.js) et à chaque changement de page dans Authentic (auto.js, étude 02/10 : mise à jour
// automatique à l'affichage). Rien n'est deviné ici : on relève ce que la page montre — champs avec
// leur libellé et leur rubrique, paires libellé/valeur (<dl>), tableaux, texte visible — et CLAIRE fait
// le tri. Jamais un mot de passe ni un champ caché.
window.__claireRelever = function () {
  'use strict';
  var net = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  var visible = function (el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); };

  function texteSans(el, exclu) {
    var copie = el.cloneNode(true);
    copie.querySelectorAll('input, select, textarea, button, script, style').forEach(function (x) { x.remove(); });
    return net(copie.textContent).replace(net(exclu || ''), '').trim();
  }

  function libelleDe(el) {
    if (el.id) {
      try {
        var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lab) return texteSans(lab);
      } catch (e) { /* identifiant exotique */ }
    }
    var parent = el.closest('label');
    if (parent) { var t = texteSans(parent); if (t) return t; }
    if (el.getAttribute('aria-label')) return net(el.getAttribute('aria-label'));
    var ids = el.getAttribute('aria-labelledby');
    if (ids) {
      var lu = ids.split(/\s+/).map(function (i) { var x = document.getElementById(i); return x ? x.textContent : ''; }).join(' ');
      if (net(lu)) return net(lu);
    }
    var cellule = el.closest('td, th');
    if (cellule && cellule.previousElementSibling) { var c = texteSans(cellule.previousElementSibling); if (c) return c; }
    var prec = el.previousElementSibling;
    while (prec && !texteSans(prec)) prec = prec.previousElementSibling;
    if (prec) return texteSans(prec).slice(0, 200);
    if (el.parentElement) {
      var p = el.parentElement.previousElementSibling;
      while (p && !texteSans(p)) p = p.previousElementSibling;
      if (p) return texteSans(p).slice(0, 200);
    }
    return net(el.getAttribute('placeholder') || el.getAttribute('title') || el.name || '');
  }

  // Rubrique : la légende du <fieldset>, sinon le titre le plus proche au-dessus dans un ancêtre.
  function groupeDe(el) {
    var fs = el.closest('fieldset');
    if (fs) { var lg = fs.querySelector('legend'); if (lg && net(lg.textContent)) return net(lg.textContent); }
    var noeud = el;
    for (var n = 0; n < 8 && noeud && noeud !== document.body; n++) {
      var parent = noeud.parentElement;
      if (!parent) break;
      var titres = parent.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > [role="heading"], :scope > legend');
      for (var i = titres.length - 1; i >= 0; i--) {
        if (titres[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return net(titres[i].textContent).slice(0, 200);
      }
      noeud = parent;
    }
    return '';
  }

  function valeurDe(el) {
    var tag = el.tagName;
    if (tag === 'SELECT') {
      var opt = el.options[el.selectedIndex];
      return opt ? net(opt.textContent) : '';
    }
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return el.checked ? 'oui' : 'non';
    return net(el.value);
  }

  var champs = [];
  document.querySelectorAll('input, select, textarea').forEach(function (el) {
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (['password', 'hidden', 'file', 'submit', 'button', 'reset', 'image'].indexOf(type) !== -1) return;
    if (!visible(el)) return;
    // Bouton radio : seulement celui qui est coché, avec le libellé du choix comme valeur.
    if (type === 'radio') {
      if (!el.checked) return;
      champs.push({ groupe: groupeDe(el), libelle: el.name || '', valeur: libelleDe(el) });
      return;
    }
    champs.push({ groupe: groupeDe(el), libelle: libelleDe(el), valeur: valeurDe(el) });
  });
  document.querySelectorAll('dl').forEach(function (dl) {
    if (!visible(dl)) return;
    dl.querySelectorAll('dt').forEach(function (dt) {
      var dd = dt.nextElementSibling;
      if (dd && dd.tagName === 'DD') champs.push({ groupe: groupeDe(dl), libelle: net(dt.textContent), valeur: net(dd.textContent) });
    });
  });

  // Titre d'un tableau : sa légende, son aria-label, sinon le texte court qui le précède (titre de
  // panneau, d'onglet ou de chemise dans Authentic), sinon la rubrique.
  function titreTableau(t) {
    var cap = t.querySelector('caption');
    if (cap && net(cap.textContent)) return net(cap.textContent).slice(0, 200);
    if (t.getAttribute('aria-label')) return net(t.getAttribute('aria-label')).slice(0, 200);
    var noeud = t;
    for (var n = 0; n < 5 && noeud && noeud !== document.body; n++) {
      var prec = noeud.previousElementSibling;
      while (prec && !net(prec.textContent)) prec = prec.previousElementSibling;
      if (prec) {
        var tx = net(prec.innerText || prec.textContent);
        if (tx && tx.length <= 120 && !prec.querySelector('table')) return tx;
        if (tx) break;
      }
      noeud = noeud.parentElement;
    }
    return groupeDe(t);
  }

  // Une cellule sans texte peut porter une icône parlante (« Signé », « PDF », « Envoyé ») : son titre.
  function iconeDe(c) {
    var el = c.querySelector('[title], [aria-label], img[alt]');
    if (!el) return '';
    var t = net(el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('alt'));
    return t ? '⟦icône⟧ ' + t.slice(0, 80) : '';
  }

  var tableaux = [];
  document.querySelectorAll('table').forEach(function (t) {
    if (!visible(t) || t.querySelector('table')) return;   // tableaux de mise en page imbriqués : on garde les plus intérieurs
    // En-tête = ligne du <thead>, ou première ligne faite uniquement de <th> / role=columnheader :
    // seuls ces libellés passent la copie « sans données ».
    var entete = [];
    var lignes = [];
    t.querySelectorAll('tr').forEach(function (tr) {
      var cases = tr.querySelectorAll('th, td');
      var estEntete = !!tr.closest('thead') || Array.prototype.every.call(cases, function (c) { return c.tagName === 'TH' || c.getAttribute('role') === 'columnheader'; });
      if (!lignes.length && !entete.length && cases.length && estEntete) {
        entete = Array.prototype.map.call(cases, function (c) { return net(c.textContent) || (iconeDe(c) ? iconeDe(c).replace('⟦icône⟧ ', '') : ''); });
        return;
      }
      var cellules = Array.prototype.map.call(cases, function (c) {
        var champ = c.querySelector('input, select, textarea');
        var type = champ ? (champ.getAttribute('type') || '').toLowerCase() : '';
        if (champ && type !== 'password' && type !== 'hidden') return valeurDe(champ) || texteSans(c);
        return net(c.innerText || c.textContent) || iconeDe(c);
      });
      if (cellules.some(function (x) { return x; })) lignes.push(cellules);
    });
    if (lignes.length || entete.length) tableaux.push({ titre: titreTableau(t), entete: entete, lignes: lignes });
  });

  return {
    titre: document.title,
    adresse: location.origin + location.pathname,
    champs: champs,
    tableaux: tableaux,
    texte: document.body ? document.body.innerText : ''
  };
};
