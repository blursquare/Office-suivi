  // ==== PRÉSENTATION DES OUTILS : sommaire en étapes, tout sur le même écran ====
  //
  // Étude 06/10 : « pour les outils, reprends bien la présentation, claire comme dans création de dossier ; utilise Web
  // Awesome, quelque chose de facile à utiliser et où l'on se repère bien » — puis, sur la question des étapes : « non, tous
  // sur le même écran ». Chaque outil garde donc un seul écran, mais porte en tête une barre d’étapes (composant wa-stepper, comme
  // l'indicateur de « Nouveau dossier ») : numéros des sections, coche quand une section est remplie, l'étape où l'on se
  // trouve suit le défilement, un clic mène à la section. Les titres de section (`h2.outil-section-tete[data-etape]`)
  // reçoivent le même numéro que leur étape.

  // Étapes de chaque outil, dans l'ordre de l'écran. `fait` dit si l'étape est remplie (coche) ; sans `fait`, jamais cochée
  // (choix déjà posés par défaut, ou rien à vérifier).
  var ETAPES_OUTILS = {
    'appel-fonds': [
      { cle: 'dossier', libelle: 'Dossier', fait: () => !!afDossierLie },
      { cle: 'decompte', libelle: 'Décompte', fait: () => (afLignes.debit || []).some(l => Number(l.montant) > 0) },
      { cle: 'clients', libelle: 'Clients', fait: () => afClients.some(c => String(c.nom || '').trim()) },
      { cle: 'rdv', libelle: 'Rendez-vous', fait: () => !!afValeur('af-date-rdv') },
      { cle: 'bien', libelle: 'Bien vendu', fait: () => !!(afValeur('af-designation') && afValeur('af-adresse-bien')) },
      { cle: 'financement', libelle: 'Financement' },
      { cle: 'courrier', libelle: 'Courrier', fait: () => !!afHistoriqueId }
    ],
    quotites: [
      { cle: 'dossier', libelle: 'Dossier', fait: () => !!(document.getElementById('qt-dossier-pill') || {}).innerHTML },
      { cle: 'bien', libelle: 'Bien' },
      { cle: 'acquereurs', libelle: 'Acquéreurs', fait: () => champsRemplisDans('qt-acquereurs') >= 1 },
      { cle: 'montant', libelle: 'Montant', fait: () => totalOutilAffiche('qt-total-operation') },
      { cle: 'financement', libelle: 'Financement', fait: () => totalOutilAffiche('qt-total-financement') },
      { cle: 'quotites', libelle: 'Quotités' },
      { cle: 'annexe', libelle: 'Annexe' }
    ],
    calculateur: [
      { cle: 'prix', libelle: 'Prix', fait: () => Number(valeurChamp('calc-price')) > 0 },
      { cle: 'acquereur', libelle: 'Acquéreur' },
      { cle: 'bien', libelle: 'Bien' },
      { cle: 'resultat', libelle: 'Provision', fait: () => Number(valeurChamp('calc-price')) > 0 }
    ],
    prorata: [
      { cle: 'somme', libelle: 'Somme', fait: () => Number(valeurChamp('prorata-montant')) > 0 },
      { cle: 'periode', libelle: 'Période', fait: () => !!(valeurChamp('prorata-debut') && valeurChamp('prorata-fin')) },
      { cle: 'acte', libelle: "Date de l'acte", fait: () => !!valeurChamp('prorata-date') },
      { cle: 'repartition', libelle: 'Répartition', fait: () => elementVisible('prorata-resultat') }
    ],
    inventaire: [
      { cle: 'droits', libelle: 'Droits simulés', fait: () => !!(valeurChamp('inv-droits-sans') && valeurChamp('inv-droits-avec')) },
      { cle: 'cout', libelle: "Coût de l'inventaire" },
      { cle: 'verdict', libelle: 'Verdict', fait: () => elementVisible('inv-decompte') }
    ]
  };

  var etapeChoisieOutil = null;     // étape cliquée dans la barre, gardée allumée le temps d'y défiler

  function valeurChamp(id) { const e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function elementVisible(id) { const e = document.getElementById(id); return !!e && e.style.display !== 'none'; }
  function champsRemplisDans(id) {
    const e = document.getElementById(id);
    return e ? [...e.querySelectorAll('input[type="text"], input:not([type])')].filter(i => String(i.value || '').trim()).length : 0;
  }
  function totalOutilAffiche(id) { const t = (document.getElementById(id) || {}).textContent || ''; return /\d/.test(t) && !/^0(,00)?\s*€?$/.test(t.trim()); }

  // Pure : l'étape où l'on se trouve, d'après la position verticale des titres de section (dans l'ordre des étapes) : le
  // titre passé au-dessus de la ligne de lecture le plus près d'elle — un titre d'une colonne voisine, remonté depuis
  // longtemps (l'aperçu du courrier, à droite), ne l'emporte pas sur celui qu'on vient de passer ; à hauteur égale (même
  // rangée, à 40 px près), la première étape. Aucun titre passé : la première étape. En bas de page (`basFenetre` donné),
  // les dernières sections ne peuvent plus monter jusqu'à la ligne : la dernière dont le titre est à l'écran.
  function etapeCouranteOutil(positions, ligneLecture, basFenetre) {
    if (basFenetre) {
      const visibles = positions.filter(p => p.haut >= 0 && p.haut < basFenetre);
      if (visibles.length) return visibles[visibles.length - 1].cle;
    }
    let choix = null;
    positions.forEach(p => {
      if (p.haut > ligneLecture) return;
      if (!choix || p.haut > choix.haut + 40) choix = p;
    });
    return choix ? choix.cle : (positions.length ? positions[0].cle : '');
  }

  function panneauOutil(outil) { return document.getElementById('onglet-' + outil); }

  function construireSommaireOutil(outil) {
    const panneau = panneauOutil(outil);
    const place = panneau && panneau.querySelector('.outil-sommaire-place');
    const etapes = ETAPES_OUTILS[outil];
    if (!place || !etapes || place.querySelector('wa-stepper')) return;
    place.innerHTML = `<wa-stepper class="outil-sommaire" clickable orientation="horizontal" label="Sections de l’outil">
      ${etapes.map(e => `<wa-step name="${e.cle}">${escapeHtml(e.libelle)}</wa-step>`).join('')}
    </wa-stepper>`;
    etapes.forEach((e, i) => {
      const titre = panneau.querySelector(`.outil-section-tete[data-etape="${e.cle}"]`);
      if (titre && !titre.querySelector('.outil-num')) titre.insertAdjacentHTML('afterbegin', `<span class="outil-num" aria-hidden="true">${i + 1}</span>`);
    });
    const stepper = place.querySelector('wa-stepper');
    stepper.addEventListener('wa-step-change', (ev) => {
      const titre = panneau.querySelector(`.outil-section-tete[data-etape="${ev.detail && ev.detail.name}"]`);
      // L'étape cliquée reste allumée pendant le défilement qui y mène (sinon le suivi du défilement la reprendrait).
      etapeChoisieOutil = { outil, jusqua: Date.now() + 1200 };
      if (titre) titre.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // Toute saisie ou tout clic dans l'outil peut remplir une section : la barre suit (au plus une fois par image).
    let attente = false;
    const planifier = () => { if (attente) return; attente = true; requestAnimationFrame(() => { attente = false; majSommaireOutil(outil); }); };
    ['input', 'change', 'click'].forEach(t => panneau.addEventListener(t, () => setTimeout(planifier, 0)));
  }

  function majSommaireOutil(outil) {
    const panneau = panneauOutil(outil);
    const stepper = panneau && panneau.querySelector('wa-stepper.outil-sommaire');
    if (!stepper || panneau.style.display === 'none') return;
    const etapes = ETAPES_OUTILS[outil] || [];
    etapes.forEach(e => {
      const step = stepper.querySelector(`wa-step[name="${e.cle}"]`);
      let fait = false;
      try { fait = !!(e.fait && e.fait()); } catch (err) { fait = false; }
      if (step && step.completed !== fait) step.completed = fait;
    });
    const positions = etapes.map(e => {
      const titre = panneau.querySelector(`.outil-section-tete[data-etape="${e.cle}"]`);
      return titre && titre.offsetParent ? { cle: e.cle, haut: titre.getBoundingClientRect().top } : null;
    }).filter(Boolean);
    if (etapeChoisieOutil && etapeChoisieOutil.outil === outil && Date.now() < etapeChoisieOutil.jusqua) return;
    const enBas = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    const courante = etapeCouranteOutil(positions, Math.max(160, window.innerHeight * 0.35), enBas ? window.innerHeight : 0);
    if (courante && stepper.active !== courante) stepper.active = courante;
  }

  function ongletOutilVisible() {
    return Object.keys(ETAPES_OUTILS).find(o => { const p = panneauOutil(o); return p && p.style.display !== 'none'; }) || '';
  }

  function initPresentationOutils() {
    Object.keys(ETAPES_OUTILS).forEach(construireSommaireOutil);
    let attente = false;
    window.addEventListener('scroll', () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; const o = ongletOutilVisible(); if (o) majSommaireOutil(o); });
    }, { passive: true });
    // Les lectures du NAS et les reprises de dossier finissent après le clic : un tour toutes les 2 s tant qu'un outil est
    // affiché suffit à cocher ce qu'elles ont rempli.
    setInterval(() => { const o = ongletOutilVisible(); if (o) majSommaireOutil(o); }, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPresentationOutils);
  else initPresentationOutils();

  // ==== Pièces à lire (appel de fonds, prorata) : une tuile par pièce ====
  //
  // Étude 06/10 : « revoir les boutons lire taxe foncière et appel de charges ». Les boutons texte sont remplacés par une tuile
  // par pièce (un <label> sur le champ fichier caché) qui dit son état — à choisir, lue avec ce qui en a été retenu, ou
  // illisible — : on voit d'un coup d'œil ce qui a déjà été lu. Une tuile reçoit aussi un PDF glissé dessus (data-piece).
  var TUILES_PIECES_OUTILS = {
    af: [
      { cle: 'tf', champ: 'af-avis-tf', titre: 'Avis de taxe foncière' },
      { cle: 'charges', champ: 'af-appel-charges', titre: 'Appel de charges' },
      { cle: 'etatDate', champ: 'af-etat-date', titre: 'État daté' },
      { cle: 'releve', champ: 'af-releve-compte', titre: 'Relevé de compte client' }
    ],
    prorata: [
      { cle: 'tf', champ: 'prorata-avis-tf', titre: 'Avis de taxe foncière' },
      { cle: 'charges', champ: 'prorata-appel-charges', titre: 'Appel de charges' }
    ]
  };

  // Pure : l'état d'une pièce lue, d'après ce que son lecteur a retenu (`lue` : avis, pièce de l'appel de fonds ou appel de
  // charges du prorata ; null si rien n'a été choisi).
  function etatTuilePiece(cle, lue) {
    if (!lue) return { etat: 'vide', texte: 'Choisir le PDF' };
    if (lue.erreur) return { etat: 'erreur', texte: cle === 'tf' ? 'Montant introuvable — à saisir' : 'PDF illisible' };
    if (cle === 'tf') return { etat: 'lu', texte: 'Lu · ' + formaterPrixCentimes(lue.retenu || lue.montantAvis) };
    const a = lue.analyse || {};
    if (cle === 'charges') {
      return a.montant == null ? { etat: 'erreur', texte: 'Montant introuvable — à saisir' } : { etat: 'lu', texte: 'Lu · ' + formaterPrixCentimes(a.montant) };
    }
    if (cle === 'etatDate') {
      if (a.montant == null) return { etat: 'erreur', texte: 'Fonds de travaux introuvable' };
      return { etat: 'lu', texte: a.absent ? 'Lu · pas de fonds de travaux' : 'Lu · fonds ' + formaterPrixCentimes(a.montant) };
    }
    const recu = a.recu || {};
    const total = (Number(recu.prix) || 0) + (Number(recu.frais) || 0);
    return { etat: 'lu', texte: total > 0 ? 'Lu · ' + formaterPrixCentimes(total) + ' versés' : 'Lu · aucun versement' };
  }

  function pieceLueOutil(outil, cle) {
    if (cle === 'tf') return typeof tfAvis !== 'undefined' ? tfAvis[outil] || null : null;
    if (outil === 'prorata') return typeof prorataCharges !== 'undefined' ? prorataCharges : null;
    return typeof afPieces !== 'undefined' ? afPieces[cle] || null : null;
  }

  function renderTuilesPieces(outil) {
    const zone = document.getElementById(outil + '-pieces-tuiles');
    if (!zone) return;
    zone.innerHTML = (TUILES_PIECES_OUTILS[outil] || []).map(t => {
      const e = etatTuilePiece(t.cle, pieceLueOutil(outil, t.cle));
      const ico = e.etat === 'lu' ? 'check' : e.etat === 'erreur' ? 'alert-triangle' : 'file-text';
      return `<label for="${t.champ}" class="piece-tuile piece-${e.etat}" data-piece="${t.cle}" title="${e.etat === 'vide' ? 'Choisir' : 'Remplacer'} : ${escapeAttr(t.titre)}">
        <span class="piece-tuile-icone" aria-hidden="true">${icone(ico)}</span>
        <span class="piece-tuile-texte"><span class="piece-tuile-titre">${escapeHtml(t.titre)}</span><span class="piece-tuile-etat">${escapeHtml(e.texte)}</span></span>
      </label>`;
    }).join('');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { renderTuilesPieces('af'); renderTuilesPieces('prorata'); });
  else { renderTuilesPieces('af'); renderTuilesPieces('prorata'); }
