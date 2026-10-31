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
  // `saisie` : section de champs, présentée titre à gauche, champs grisés à droite (étude 24/10, maquette D). `requis` : section à
  // remplir avant la suite — les sections de saisie qui suivent la première section requise pas encore remplie restent pâles
  // (pleines au survol ou dès qu'on y saisit), pour mener la saisie dans l'ordre (étude 24/10 : « mettre en avant l'étape un… les
  // étapes après en transparent, pleines quand la première est remplie »). Jamais bloquant : tout reste cliquable.
  var ETAPES_OUTILS = {
    'appel-fonds': [
      { cle: 'dossier', libelle: 'Dossier', saisie: true, fait: () => !!afDossierLie },
      { cle: 'decompte', libelle: 'Décompte', saisie: true, requis: true, fait: () => (afLignes.debit || []).some(l => Number(l.montant) > 0) },
      { cle: 'clients', libelle: 'Clients', saisie: true, requis: true, fait: () => afClients.some(c => String(c.nom || '').trim()) },
      { cle: 'rdv', libelle: 'Rendez-vous', saisie: true, requis: true, fait: () => !!afValeur('af-date-rdv') },
      { cle: 'bien', libelle: 'Bien vendu', saisie: true, requis: true, fait: () => !!(afValeur('af-designation') && afValeur('af-adresse-bien')) },
      { cle: 'financement', libelle: 'Financement', saisie: true },
      { cle: 'courrier', libelle: 'Courrier', fait: () => !!afHistoriqueId }
    ],
    quotites: [
      { cle: 'dossier', libelle: 'Dossier', saisie: true, fait: () => !!(document.getElementById('qt-dossier-pill') || {}).innerHTML },
      { cle: 'bien', libelle: 'Bien', saisie: true },
      { cle: 'acquereurs', libelle: 'Acquéreurs', saisie: true, requis: true, fait: () => champsRemplisDans('qt-acquereurs') >= 1 },
      { cle: 'montant', libelle: 'Montant', saisie: true, requis: true, fait: () => totalOutilAffiche('qt-total-operation') },
      { cle: 'financement', libelle: 'Financement', saisie: true, requis: true, fait: () => totalOutilAffiche('qt-total-financement') },
      { cle: 'quotites', libelle: 'Quotités' },
      { cle: 'annexe', libelle: 'Annexe' }
    ],
    calculateur: [
      { cle: 'prix', libelle: 'Prix', saisie: true, requis: true, fait: () => montantSaisiFr(valeurChamp('calc-price')) > 0 },
      { cle: 'acquereur', libelle: 'Acquéreur', saisie: true },
      { cle: 'bien', libelle: 'Bien', saisie: true },
      { cle: 'resultat', libelle: 'Provision', fait: () => montantSaisiFr(valeurChamp('calc-price')) > 0 }
    ],
    prorata: [
      { cle: 'somme', libelle: 'Somme', saisie: true, requis: true, fait: () => montantSaisiFr(valeurChamp('prorata-montant')) > 0 },
      { cle: 'periode', libelle: 'Période', saisie: true, requis: true, fait: () => !!(valeurChamp('prorata-debut') && valeurChamp('prorata-fin')) },
      { cle: 'acte', libelle: "Date de l'acte", saisie: true, requis: true, fait: () => !!valeurChamp('prorata-date') },
      { cle: 'repartition', libelle: 'Répartition', fait: () => elementVisible('prorata-resultat') }
    ],
    inventaire: [
      { cle: 'droits', libelle: 'Droits simulés', saisie: true, requis: true, fait: () => !!(valeurChamp('inv-droits-sans') && valeurChamp('inv-droits-avec')) },
      { cle: 'cout', libelle: "Coût de l'inventaire", saisie: true },
      { cle: 'verdict', libelle: 'Verdict', fait: () => elementVisible('inv-decompte') }
    ]
  };

  // Pure : pour chaque étape, son état d'affichage — 'attente' (pâle : une section requise d'avant n'est pas remplie), 'courante'
  // (la première section requise pas encore remplie), '' sinon. `faits` = { cle: booléen }.
  function etatsSectionsOutil(etapes, faits) {
    let bloque = false;
    return (etapes || []).map(e => {
      if (!e.saisie) return { cle: e.cle, etat: '' };
      if (bloque) return { cle: e.cle, etat: 'attente' };
      if (e.requis && !faits[e.cle]) { bloque = true; return { cle: e.cle, etat: 'courante' }; }
      return { cle: e.cle, etat: '' };
    });
  }

  // Regroupe chaque titre de section de saisie et ce qui le suit (jusqu'au titre suivant) dans `.outil-section` > titre +
  // `.outil-section-corps` ; la carte qui les porte devient `.outil-formulaire` (conteneur des règles de largeur). Une fois.
  function structurerSectionsOutil(outil) {
    const panneau = panneauOutil(outil);
    if (!panneau) return;
    (ETAPES_OUTILS[outil] || []).filter(e => e.saisie).forEach(e => {
      const titre = panneau.querySelector(`.outil-section-tete[data-etape="${e.cle}"]`);
      if (!titre || !titre.parentElement || titre.parentElement.classList.contains('outil-section')) return;
      const carte = titre.parentElement;
      carte.classList.add('outil-formulaire', 'outil-champs');
      const section = document.createElement('div');
      section.className = 'outil-section';
      section.dataset.section = e.cle;
      const corps = document.createElement('div');
      corps.className = 'outil-section-corps';
      titre.before(section);
      section.append(titre, corps);
      while (section.nextSibling && !(section.nextSibling.nodeType === 1 && (section.nextSibling.matches('.outil-section-tete') || section.nextSibling.matches('.outil-section')))) {
        corps.append(section.nextSibling);
      }
    });
  }

  // Appel de fonds (étude 28/10) : l'espace de dépôt reste, les champs à remplir se déplient sous « Modifier les champs ».
  function basculerChampsAppelFonds(ouvrir) {
    const form = document.querySelector('#onglet-appel-fonds .af-form');
    if (!form) return;
    const replie = typeof ouvrir === 'boolean' ? !ouvrir : !form.classList.contains('af-replie');
    form.classList.toggle('af-replie', replie);
    const bouton = document.getElementById('af-modifier-btn');
    if (bouton) bouton.textContent = replie ? 'Modifier les champs' : 'Masquer les champs';
  }

  var etapeChoisieOutil = null;     // étape cliquée dans la barre, gardée allumée le temps d'y défiler

  function valeurChamp(id) { const e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function elementVisible(id) { const e = document.getElementById(id); return !!e && e.style.display !== 'none'; }
  function champsRemplisDans(id) {
    const e = document.getElementById(id);
    return e ? [...e.querySelectorAll('input[type="text"], input:not([type])')].filter(i => String(i.value || '').trim()).length : 0;
  }
  // Un montant qui défile (client/86) se lit à sa valeur d'arrivée.
  function totalOutilAffiche(id) { const el = document.getElementById(id) || {}; const t = (el.__animFinal != null ? el.__animFinal : el.textContent) || ''; return /\d/.test(t) && !/^0(,00)?\s*€?$/.test(t.trim()); }

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
    structurerSectionsOutil(outil);
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
      const reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (titre && outil === 'appel-fonds' && !titre.offsetParent) basculerChampsAppelFonds(true);
      if (titre) titre.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' });
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
    // Le trait ne se remplit que d'une étape faite à l'autre DEPUIS LA PREMIÈRE (étude 24/10 : des étapes préremplies plus loin
    // coloraient un bout de trait isolé, commencé au milieu d'une liaison) : `data-suite` sur les étapes faites sans trou avant elles.
    let suite = true;
    const faits = {};
    etapes.forEach(e => {
      const step = stepper.querySelector(`wa-step[name="${e.cle}"]`);
      let fait = false;
      try { fait = !!(e.fait && e.fait()); } catch (err) { fait = false; }
      faits[e.cle] = fait;
      // Web Awesome colore aussi, de lui-même, la liaison qui suit une étape faite (relecture 24/10) : neutralisée quand l'étape
      // d'avant n'est pas dans la suite faite depuis la première (`data-avant-suite` absent).
      if (step) step.toggleAttribute('data-avant-suite', suite);
      suite = suite && fait;
      if (step) step.toggleAttribute('data-suite', suite);
      if (step) step.toggleAttribute('data-trait', suite);
      if (step && step.completed !== fait) {
        step.completed = fait;
        // Étude 18/10 : la pastille de l'étape terminée se coche d'un petit tracé (seulement quand elle se termine sous les yeux).
        const coche = step.querySelector('.anim-etape-coche');
        if (fait && !coche) step.insertAdjacentHTML('beforeend', `<span slot="icon" class="anim-etape-coche${step.dataset.vu ? ' anim-trace' : ''}" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" pathLength="1"/></svg></span>`);
        else if (!fait && coche) coche.remove();
      }
      if (step) step.dataset.vu = '1';
    });
    poserTraitsEtapes(stepper);
    etatsSectionsOutil(etapes, faits).forEach(({ cle, etat }) => {
      const section = panneau.querySelector(`.outil-section[data-section="${cle}"]`);
      if (!section) return;
      section.classList.toggle('outil-section-attente', etat === 'attente');
      section.classList.toggle('outil-section-courante', etat === 'courante');
    });
    const positions = etapes.map(e => {
      const titre = panneau.querySelector(`.outil-section-tete[data-etape="${e.cle}"]`);
      return titre && titre.offsetParent ? { cle: e.cle, haut: titre.getBoundingClientRect().top } : null;
    }).filter(Boolean);
    if (etapeChoisieOutil && etapeChoisieOutil.outil === outil && Date.now() < etapeChoisieOutil.jusqua) return;
    // Outil monté dans le panneau de « Demander à CLAIRE » (client/99) : c'est le panneau qui défile, pas la page — positions,
    // ligne de lecture et bas de l'écran se prennent dans le panneau.
    const conteneur = panneau.closest('.asst-art-corps');
    let courante;
    if (conteneur) {
      const haut = conteneur.getBoundingClientRect().top;
      const h = conteneur.clientHeight;
      const enBasPanneau = conteneur.scrollTop > 0 && conteneur.scrollTop + h >= conteneur.scrollHeight - 4;
      courante = etapeCouranteOutil(positions.map(p => ({ cle: p.cle, haut: p.haut - haut })), Math.max(120, h * 0.35), enBasPanneau ? h : 0);
    } else {
      const enBas = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      courante = etapeCouranteOutil(positions, Math.max(160, window.innerHeight * 0.35), enBas ? window.innerHeight : 0);
    }
    if (courante && stepper.active !== courante) stepper.active = courante;
  }

  function ongletOutilVisible() {
    return Object.keys(ETAPES_OUTILS).find(o => { const p = panneauOutil(o); return p && p.style.display !== 'none' && p.getClientRects().length; }) || '';
  }

  function initPresentationOutils() {
    Object.keys(ETAPES_OUTILS).forEach(construireSommaireOutil);
    let attente = false;
    // En capture sur le document : le défilement de la page ET celui du panneau d'un outil monté (un « scroll » ne remonte pas).
    document.addEventListener('scroll', () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; const o = ongletOutilVisible(); if (o) majSommaireOutil(o); });
    }, { passive: true, capture: true });
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

  // État d'avant de chaque tuile : une pièce qui vient d'être lue « se pose » dans sa case (étude 18/10).
  var etatsTuilesAvant = {};
  function renderTuilesPieces(outil) {
    const zone = document.getElementById(outil + '-pieces-tuiles');
    if (!zone) return;
    zone.innerHTML = (TUILES_PIECES_OUTILS[outil] || []).map(t => {
      const e = etatTuilePiece(t.cle, pieceLueOutil(outil, t.cle));
      const ico = e.etat === 'lu' ? 'check' : e.etat === 'erreur' ? 'alert-triangle' : 'file-text';
      const pose = e.etat === 'lu' && etatsTuilesAvant[outil + ':' + t.cle] !== undefined && etatsTuilesAvant[outil + ':' + t.cle] !== e.texte;
      etatsTuilesAvant[outil + ':' + t.cle] = e.etat === 'lu' ? e.texte : '';
      // Relevé de compte client : dossier relié à Authentic = lu dans sa comptabilité, plus de PDF à déposer (étude 30/10).
      if (outil === 'af' && t.cle === 'releve' && typeof dossierAppelFondsLie === 'function' && (dossierAppelFondsLie() || {}).referenceAuthentic) {
        return `<button type="button" class="piece-tuile piece-${e.etat}${pose ? ' anim-pose' : ''}" data-piece="${t.cle}" onclick="lireReleveCompteDansAuthentic()" title="Lire le relevé dans la comptabilité d’Authentic">
        <span class="piece-tuile-icone" aria-hidden="true">${icone(ico)}</span>
        <span class="piece-tuile-texte"><span class="piece-tuile-titre">${escapeHtml(t.titre)}</span><span class="piece-tuile-etat">${escapeHtml(e.etat === 'vide' ? 'Lire dans Authentic' : e.texte)}</span></span>
      </button>`;
      }
      return `<label for="${t.champ}" class="piece-tuile piece-${e.etat}${pose ? ' anim-pose' : ''}" data-piece="${t.cle}" title="${e.etat === 'vide' ? 'Choisir' : 'Remplacer'} : ${escapeAttr(t.titre)}">
        <span class="piece-tuile-icone" aria-hidden="true">${icone(ico)}</span>
        <span class="piece-tuile-texte"><span class="piece-tuile-titre">${escapeHtml(t.titre)}</span><span class="piece-tuile-etat">${escapeHtml(e.texte)}</span></span>
      </label>`;
    }).join('');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { renderTuilesPieces('af'); renderTuilesPieces('prorata'); });
  else { renderTuilesPieces('af'); renderTuilesPieces('prorata'); }

// Trait entre les numéros d'étape (étude 31/10 : « l'animation entre le trait des numéros d'étape ne fonctionne pas »). Web Awesome
// dessine chaque liaison en DEUX moitiés, une par étape (connector-end de l'étape k, connector-start de k + 1), sous le même nom de
// partie : un style posé sur ::part(connector) remplissait les deux moitiés d'une même étape — d'où un demi-trait vers l'étape en cours —
// et une barre recréée à chaque étape n'avait rien à animer. Ici : la liaison k → k + 1 se remplit quand les deux étapes portent
// `data-trait` (atteinte, ou faite dans la suite pour les outils), moitié de gauche puis moitié de droite, en partant de l'état d'avant
// de la même barre (gardé par son libellé) quand elle a été recréée.
var traitsEtapesVus = new Map();
function poserTraitsEtapes(stepper) {
  if (!stepper || !stepper.isConnected) return;
  const steps = [...stepper.querySelectorAll('wa-step')];
  if (!steps.length) return;
  const etat = steps.map(s => s.hasAttribute('data-trait'));
  // Clé : le panneau + le libellé (relecture 0.416.0 : tous les outils portent « Sections de l’outil » et deux d’entre eux le même nombre
  // d’étapes — l’un partait de l’état de l’autre).
  const panneau = stepper.closest('[id^="onglet-"]');
  const cle = `${panneau ? panneau.id : ''}|${stepper.getAttribute('label') || ''}`;
  const avant = traitsEtapesVus.get(cle);
  traitsEtapesVus.set(cle, etat);
  const calme = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pose = (e, anime) => steps.forEach((s, k) => {
    const racine = s.shadowRoot;
    if (!racine) return;
    [['.connector-start', k > 0 && e[k - 1] && e[k], '200ms'], ['.connector-end', k < steps.length - 1 && e[k] && e[k + 1], '0ms']].forEach(([sel, plein, delai]) => {
      const el = racine.querySelector(sel);
      if (!el) return;
      el.style.backgroundImage = 'linear-gradient(var(--focus), var(--focus))';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.transition = anime && !calme ? `background-size 200ms var(--anim-courbe) ${plein ? delai : (delai === '0ms' ? '200ms' : '0ms')}` : 'none';
      el.style.backgroundSize = plein ? '100% 100%' : '0% 100%';
    });
  });
  Promise.all(steps.map(s => (window.customElements ? customElements.whenDefined('wa-step') : Promise.resolve()).then(() => s.updateComplete))).then(() => {
    const depart = avant && avant.length === etat.length ? avant : etat;
    pose(depart, false);
    requestAnimationFrame(() => requestAnimationFrame(() => pose(etat, true)));
  });
}

// Appelée après chaque rendu d'une barre d'étapes (client/44 majSommaireOutil, client/152, client/72) — pas d'observateur sur tout le
// document (relecture 0.416.0 : du travail à chaque mutation de l'application pour trois barres).
function poserTraitsEtapesDans(zone) {
  if (!zone || !zone.querySelectorAll) return;
  setTimeout(() => zone.querySelectorAll('wa-stepper.outil-sommaire').forEach(poserTraitsEtapes), 0);
}
