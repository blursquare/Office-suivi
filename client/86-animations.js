  // ==== Animations qui aident à comprendre (étude 18/10) ====
  //
  // « Pour un outil de notaire, l'animation doit aider à comprendre ce qui vient de se passer. » Règles de l'étude :
  //   - 150 à 250 ms, courbe douce, aucune attente avant la réaction à un clic ;
  //   - seulement l'opacité et la position (transform), jamais la taille de la mise en page ;
  //   - « réduire les animations » du système : aucun mouvement, seulement un changement de couleur ;
  //   - un montant animé reste lisible et exact à l'arrêt, chiffres alignés.
  // Ce fichier : les montants qui défilent et leur ligne qui s'éclaire (provision, prorata, quotités, arbitrage), le passage du
  // courrier modifié surligné quand un champ change à gauche (appel de fonds, constitution de dossier), le bouton « Enregistrer »
  // qui passe à « Enregistré » à la place du message, la cascade du tableau de bord au démarrage. Le reste est en CSS
  // (style.css, bloc « Animations ») : fondu des écrans, tiroir des outils, étapes, tâche cochée, dépôt d'un PDF.

  var DUREE_MONTANT_MS = 250;
  var SELECTEUR_MONTANTS = ['#calc-emol', '#calc-tre', '#calc-total', '#calc-total2', '#prorata-part-acquereur', '#prorata-part-vendeur',
    '#qt-total-operation', '#qt-total-financement', '[id^="qt-source-total-"]', '[id^="qt-part-montant-"]',
    '#inv-verdict-montant', '#inv-l-droits-sans', '#inv-l-droits-avec', '#inv-l-brutes', '#inv-l-cout', '#inv-l-net'].join(', ');
  var PANNEAUX_MONTANTS = ['onglet-calculateur', 'onglet-prorata', 'onglet-quotites', 'onglet-inventaire'];
  var APERCUS_COURRIER = ['af-lettre', 'cst-apercu', 'qt-feuille'];

  function mouvementReduit() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  // Pure : un montant affiché (« 24.145,55 € », « 1 200 € », « — ») en nombre, ou null. Point des milliers, virgule des centimes.
  function nombreDepuisMontantAffiche(texte) {
    const t = String(texte == null ? '' : texte);
    if (!/\d/.test(t) || !/€/.test(t)) return null;
    const brut = t.replace(/[^\d,-]/g, '').replace(',', '.');
    const n = Number(brut);
    return brut && Number.isFinite(n) ? n : null;
  }

  // Pure : la valeur intermédiaire d'un montant qui défile (courbe douce, arrivée exacte).
  function montantIntermediaire(depart, arrivee, avancement) {
    const p = Math.max(0, Math.min(1, avancement));
    const doux = 1 - Math.pow(1 - p, 3);
    return p >= 1 ? arrivee : depart + (arrivee - depart) * doux;
  }

  function eclairerLigne(el) {
    const ligne = el.closest('tr, .calc-pill, .calc-resultat, .qt-quotite, .qt-ligne, .qt-total, .prorata-part, [data-anim-ligne]') || el;
    ligne.classList.remove('anim-eclaire');
    void ligne.offsetWidth;
    ligne.classList.add('anim-eclaire');
    clearTimeout(ligne.__animEclaire);
    ligne.__animEclaire = setTimeout(() => ligne.classList.remove('anim-eclaire'), 1000);
  }

  // Un montant vient d'être écrit par l'outil : il défile de l'ancienne valeur à la nouvelle, puis le texte exact de l'outil revient.
  function animerMontant(el, ancienTexte) {
    const final = el.textContent;
    if (final === el.__animEcrit) return;
    // Le même montant réécrit pendant qu'il défile vers lui (l'outil écrit parfois deux fois) : le défilement continue.
    if (el.__animFinal != null && final === el.__animFinal) return;
    const depart = nombreDepuisMontantAffiche(el.__animAffiche != null ? el.__animAffiche : ancienTexte);
    // Toute écriture de l'outil arrête le défilement en cours (relecture : « — » écrit pendant un défilement était recouvert par l'ancien montant).
    cancelAnimationFrame(el.__animTrame || 0);
    el.__animAffiche = null;
    el.__animEcrit = undefined;
    el.__animFinal = null;
    const arrivee = nombreDepuisMontantAffiche(final);
    if (depart === null || arrivee === null || Math.abs(depart - arrivee) < 0.005) return;
    eclairerLigne(el);
    if (mouvementReduit()) return;
    const centimes = /,\d\d/.test(final);
    const formater = typeof formaterPrixCentimes === 'function' && centimes ? formaterPrixCentimes : (typeof formaterPrix === 'function' ? formaterPrix : null);
    if (!formater) return;
    // Signe ou mot écrit devant le montant (« − 1.200,00 € ») : recollé sur chaque valeur intermédiaire.
    const tete = (final.match(/^[^\d]*/) || [''])[0];
    const prefixe = /-/.test(tete) ? '' : tete;
    el.__animFinal = final;
    const debut = performance.now();
    const pas = (t) => {
      const p = (t - debut) / DUREE_MONTANT_MS;
      if (p >= 1) { el.__animEcrit = final; el.__animAffiche = null; el.__animFinal = null; el.textContent = final; return; }
      const texte = prefixe + formater(montantIntermediaire(depart, arrivee, p));
      el.__animEcrit = texte;
      el.__animAffiche = texte;
      el.textContent = texte;
      el.__animTrame = requestAnimationFrame(pas);
    };
    el.__animTrame = requestAnimationFrame(pas);
  }

  function observerMontants() {
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Quotités : la répartition par acquéreur est redessinée à chaque saisie — les montants sont appariés par rang.
        if (m.type === 'childList' && m.target.id === 'qt-quotites') {
          const anciens = Array.from(m.removedNodes).filter(n => n.nodeType === 1);
          Array.from(m.addedNodes).filter(n => n.nodeType === 1).forEach((n, i) => {
            const nouveau = n.querySelector('.qt-quotite-montant');
            const ancien = anciens[i] && anciens[i].querySelector('.qt-quotite-montant');
            if (nouveau && ancien && ancien.textContent !== nouveau.textContent) animerMontant(nouveau, ancien.textContent);
          });
          continue;
        }
        const el = m.type === 'characterData' ? m.target.parentElement : m.target;
        if (!el || !el.matches || !el.matches(SELECTEUR_MONTANTS)) continue;
        if (el.textContent === el.__animEcrit) continue;
        const ancien = m.type === 'characterData' ? m.oldValue : Array.from(m.removedNodes).map(n => n.textContent).join('');
        animerMontant(el, ancien);
      }
    });
    PANNEAUX_MONTANTS.forEach(id => {
      const p = document.getElementById(id);
      if (p) obs.observe(p, { childList: true, characterData: true, characterDataOldValue: true, subtree: true });
    });
  }

  // ---- Courrier : le passage modifié est surligné quand un champ change à gauche (« un notaire relit le courrier, pas le formulaire »).
  var derniereSaisieFormulaire = { panneau: null, le: 0 };

  // Pure (sur des nœuds) : les plus petits éléments ajoutés dont le texte diffère de celui qu'ils remplacent, appariés par rang.
  function elementsModifies(retires, ajoutes, parent, profondeur, sortie) {
    const n = Math.max(retires.length, ajoutes.length);
    for (let i = 0; i < n && sortie.length <= 12; i++) {
      const a = ajoutes[i];
      const r = retires[i];
      if (!a) continue;
      if (r && r.textContent === a.textContent) continue;
      if (a.nodeType !== 1) { if (parent && (a.textContent || '').trim()) sortie.push(parent); continue; }
      if (!(a.textContent || '').trim()) continue;
      if (r && r.nodeType === 1 && profondeur < 6 && a.childNodes.length && a.childNodes.length === r.childNodes.length) {
        elementsModifies(Array.from(r.childNodes), Array.from(a.childNodes), a, profondeur + 1, sortie);
      } else sortie.push(a);
    }
    return sortie;
  }

  function surlignerCourrier(elements) {
    const uniques = [...new Set(elements)].filter(e => e && e.classList);
    // Un tout autre courrier affiché (autre modèle, autre dossier) : rien à montrer.
    if (!uniques.length || uniques.length > 12) return;
    uniques.forEach(e => {
      e.classList.remove('anim-surligne');
      void e.offsetWidth;
      e.classList.add('anim-surligne');
      clearTimeout(e.__animSurligne);
      e.__animSurligne = setTimeout(() => e.classList.remove('anim-surligne'), 2600);
    });
  }

  function observerCourriers() {
    if (typeof MutationObserver === 'undefined') return;
    const noterSaisie = (ev) => {
      const t = ev.target;
      if (!t || !t.closest || APERCUS_COURRIER.some(id => t.closest('#' + id))) return;
      derniereSaisieFormulaire = { panneau: t.closest('.onglet-panel'), le: Date.now() };
    };
    document.addEventListener('input', noterSaisie, true);
    document.addEventListener('change', noterSaisie, true);
    const obs = new MutationObserver((mutations) => {
      if (Date.now() - derniereSaisieFormulaire.le > 900) return;
      const trouves = [];
      for (const m of mutations) {
        const cible = m.type === 'characterData' ? m.target.parentElement : m.target;
        if (!cible || !derniereSaisieFormulaire.panneau || !derniereSaisieFormulaire.panneau.contains(cible)) continue;
        // Ce que l'on tape dans le courrier lui-même n'est pas surligné.
        if (document.activeElement && document.activeElement.isContentEditable && document.activeElement.contains(cible)) continue;
        if (m.type === 'characterData') { if (m.oldValue !== m.target.textContent) trouves.push(cible); continue; }
        // Un bloc AJOUTÉ sans rien remplacer (page 2 créée par la mise en page du courrier) n'est pas un passage modifié.
        if (!m.removedNodes.length && Array.from(m.addedNodes).some(n => n.nodeType === 1)) continue;
        elementsModifies(Array.from(m.removedNodes), Array.from(m.addedNodes), cible, 0, trouves);
      }
      surlignerCourrier(trouves);
    });
    APERCUS_COURRIER.forEach(id => {
      const z = document.getElementById(id);
      if (z) obs.observe(z, { childList: true, characterData: true, characterDataOldValue: true, subtree: true });
    });
  }

  // ---- « Enregistrer » → « Enregistré ✓ » sur le bouton lui-même, plutôt qu'un message qui apparaît puis disparaît.
  var dernierBoutonEnregistrer = { bouton: null, le: 0 };

  // Pure : un message de confirmation simple d'un enregistrement (pas une erreur, pas un message à lire en entier).
  function messageEnregistrementSimple(message) {
    const m = String(message || '').trim();
    return m.length > 0 && m.length <= 70 && /enregistré|sauvegardé/i.test(m) && !/non |pas |impossible|erreur|échec|refus|—|:/i.test(m);
  }

  function noterClicEnregistrer(ev) {
    const b = ev.target && ev.target.closest ? ev.target.closest('wa-button, button') : null;
    if (b && /^\s*Enregistrer\b/i.test(b.textContent || '')) {
      dernierBoutonEnregistrer = { bouton: b, le: Date.now() };
      // Posé dès le clic : un lecteur d'écran annonce mieux une zone qui existe avant que son texte change.
      b.setAttribute('aria-live', 'polite');
    }
  }

  // Appelé par afficherToast : vrai si la confirmation est montrée sur le bouton (le message n'est alors pas affiché).
  function confirmerSurBoutonEnregistrer(message, texteBouton, onUndo) {
    const b = dernierBoutonEnregistrer.bouton;
    if (!b || onUndo || Date.now() - dernierBoutonEnregistrer.le > 8000 || !document.body.contains(b) || !b.offsetParent) return false;
    if (!messageEnregistrementSimple(message)) return false;
    dernierBoutonEnregistrer = { bouton: null, le: 0 };
    if (b.__animLibelle == null) b.__animLibelle = b.innerHTML;
    clearTimeout(b.__animEnregistre);
    b.innerHTML = `<span class="anim-enregistre">${typeof icone === 'function' ? icone('check') : ''}Enregistré</span>`;
    b.classList.add('anim-bouton-enregistre');
    b.__animEnregistre = setTimeout(() => {
      b.removeAttribute('aria-live'); // le libellé qui revient n'est pas annoncé
      b.innerHTML = b.__animLibelle;
      b.__animLibelle = null;
      b.classList.remove('anim-bouton-enregistre');
    }, 1800);
    return true;
  }

  // Tableau de bord : plus aucune animation au démarrage (étude 19/10 : « retire l'animation des widgets qui s'affiche au démarrage »).

  function initAnimations() {
    if (typeof document.addEventListener !== 'function') return;
    observerMontants();
    observerCourriers();
    document.addEventListener('click', noterClicEnregistrer, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAnimations);
  else initAnimations();
