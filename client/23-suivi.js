  // ==== SUIVI : regroupement des échéances par semaine ====
  //
  // Demandé par l'étude : voir la charge de travail semaine par semaine plutôt qu'une liste plate
  // de dossiers. Une ligne = UNE ÉCHÉANCE (choix explicite de l'étude), donc un même dossier peut
  // figurer sous plusieurs semaines — son échéance de prêt en semaine 40, sa signature d'acte en
  // semaine 48. C'est la charge réelle de la semaine qu'on lit, pas un simple classement des
  // dossiers.
  //
  // Tout ce bloc est PUR et déclaré en `function`/`var` : testable depuis tests/helpers/load-app.js
  // (voir la limite du harnais rappelée dans CLAUDE.md — un `const`/`let` de premier niveau y est
  // invisible).

  // Lundi de la semaine contenant cette date, au format ISO. Semaine ISO 8601 (lundi → dimanche),
  // convention française — `getDay()` renvoyant 0 pour dimanche, on le ramène à 7 avant de reculer.
  function debutSemaine(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return null;
    const jour = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - (jour - 1));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function toutesEcheances(d) {
    return echeancesPlanning(d);
  }

  // Nombre de semaines affichées individuellement après la semaine courante ; au-delà, tout tombe
  // dans un unique groupe "Plus tard" — sur un portefeuille d'une soixantaine de dossiers, dérouler
  // cinquante en-têtes de semaine vides jusqu'à l'échéance la plus lointaine n'aurait aucun intérêt.
  var SEMAINES_AFFICHEES = 8;

  // Regroupe les échéances de plusieurs dossiers par semaine. `aujourdHui` est injecté (jamais lu
  // depuis l'horloge ici) pour que la fonction reste pure et testable à date fixe.
  // Renvoie les groupes dans l'ordre de lecture : retard d'abord (c'est ce qui presse), puis les
  // semaines à venir, puis le reste.
  function grouperEcheancesParSemaine(liste, aujourdHui) {
    const semaineCourante = debutSemaine(aujourdHui);
    const limite = semaineCourante ? addDays(semaineCourante, SEMAINES_AFFICHEES * 7) : null;

    const groupes = new Map();
    const ajouter = (cle, rang, libelle, item) => {
      if (!groupes.has(cle)) groupes.set(cle, { cle, rang, libelle, items: [] });
      groupes.get(cle).items.push(item);
    };

    for (const d of liste) {
      // UNE SEULE échéance par dossier : la plus proche encore en attente. Demandé par l'étude —
      // la première version listait toutes les échéances d'un dossier, qui apparaissait donc sous
      // chaque semaine où il avait quelque chose, y compris pour une signature d'acte dans trois
      // mois alors que sa condition de prêt n'était pas encore levée. On ne montre que ce qu'il y a
      // à faire maintenant ; la suivante apparaît quand celle-ci est passée ou validée (voir
      // echeanceValidee / validerEcheance).
      // Un dossier sans échéance datée en attente (rendez-vous à fixer sans date butoir, tout validé…)
      // n'est jamais omis (étude, 02/10 : « il faut afficher tous les dossiers ») : section « Sans
      // échéance datée » en dernier.
      // Acte signé (étude, 02/10) : section « Signés », la date affichée est celle de la signature.
      let signe = null;
      let echeances = [];
      try {
        signe = signatureFaiteSuivi(d);
        if (!signe) echeances = toutesEcheances(d).filter(x => x && typeof x.iso === 'string' && x.iso).sort((x, y) => x.iso.localeCompare(y.iso));
      } catch (e) {
        // Dossier abîmé : montré « sans échéance » plutôt que de faire tomber toute la vue (audit 12/10).
        ajouter('sans-date', 4, 'Sans échéance datée', { dossier: d, echeance: null });
        continue;
      }
      if (signe) { ajouter('signes', 3, 'Signés', { dossier: d, echeance: null, signe }); continue; }
      const e = echeances[0];
      const semaine = e ? debutSemaine(e.iso) : null;
      if (!e || !semaine) { ajouter('sans-date', 4, 'Sans échéance datée', { dossier: d, echeance: null }); continue; }
      const item = { dossier: d, echeance: e };
      if (semaineCourante && semaine < semaineCourante) ajouter('retard', 0, 'En retard', item);
      else if (limite && semaine >= limite) ajouter('plus-tard', 2, 'Plus tard', item);
      else ajouter('s-' + semaine, 1, semaine, item);
    }

    // Tri en deux temps : le rang place retard / semaines / plus tard, puis la clé ordonne les
    // semaines entre elles (une date ISO se trie comme une chaîne).
    const ordonnes = [...groupes.values()].sort((a, b) => (a.rang - b.rang) || a.cle.localeCompare(b.cle));
    for (const g of ordonnes) {
      if (g.cle === 'signes') { g.items.sort((a, b) => (b.signe.iso || '').localeCompare(a.signe.iso || '') || String(a.dossier.nom || '').localeCompare(String(b.dossier.nom || ''), 'fr')); continue; }
      g.items.sort((a, b) => ((a.echeance && a.echeance.iso) || '').localeCompare((b.echeance && b.echeance.iso) || '') || String(a.dossier.nom || '').localeCompare(String(b.dossier.nom || ''), 'fr'));
    }
    return ordonnes;
  }

  // Libellé lisible d'un groupe : "Semaine du 22 septembre" (l'année n'est rappelée que si elle
  // diffère de celle de la semaine courante — sur un planning à huit semaines, la répéter partout
  // n'apporte rien et allonge chaque en-tête).
  function libelleSemaine(groupe, aujourdHui) {
    if (groupe.cle === 'retard') return 'En retard';
    if (groupe.cle === 'plus-tard') return 'Plus tard';
    if (groupe.cle === 'sans-date') return 'Sans échéance datée';
    if (groupe.cle === 'signes') return 'Signés';
    const debut = new Date(groupe.libelle + 'T00:00:00');
    const memeAnnee = aujourdHui && debut.getFullYear() === new Date(aujourdHui + 'T00:00:00').getFullYear();
    const options = memeAnnee ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' };
    return 'Semaine du ' + debut.toLocaleDateString('fr-FR', options);
  }

  // La même échéance que la vue Échéances (grouperEcheancesParSemaine) : la plus ancienne datée, dépassée comprise (audit
  // 12/10 : la vue Tableau masquait une échéance dépassée derrière la suivante) ; à défaut de date, la première du planning.
  function prochaineEcheanceDetail(d) {
    const items = echeancesPlanning(d);
    if (!items.length) return null;
    const datees = items.filter(it => it && /^\d{4}-\d{2}-\d{2}$/.test(String(it.iso || ''))).sort((a, b) => a.iso.localeCompare(b.iso));
    const it = datees[0] || items[0];
    return { ...it, jours: it.iso ? joursRestants(it.iso) : null };
  }

  // Score de priorité (plus haut = plus urgent à traiter), combinant trois signaux qu'une simple
  // date d'échéance ne capture pas : la proximité de l'échéance elle-même, l'absence d'offre de
  // prêt (bloquant pour la suite du dossier), et un accès local perdu (empêche toute vérification
  // automatique tant que personne ne clique pour le reconfirmer). Seuil SEUIL_PRIORITE_ELEVEE
  // au-delà duquel le badge "Prioritaire" s'affiche (voir renderLigneTableau).
  const SEUIL_PRIORITE_ELEVEE = 90;
  function calculerPriorite(d) {
    let score = 0;
    const prochaine = prochaineEcheanceDetail(d);
    if (prochaine) {
      // Plafonné pour qu'une échéance très lointaine (ou très dépassée) ne domine pas ce que les
      // deux autres critères ont à dire — au-delà de 60 jours ou de 30 jours de retard, l'écart
      // supplémentaire n'ajoute plus rien au score.
      const jours = Math.max(-30, Math.min(prochaine.jours, 60));
      score += (60 - jours) * 2;
    }
    if (!d.sansPret && d.offrePretStatut === 'manquante') score += 60;
    return score;
  }

  // Statut des PIÈCES d'un dossier ('pret', 'arelier', 'aconfirmer', 'blocage', 'archive') — plus
  // affiché depuis le 29/09 (le badge est l'état général, voir etatDossier) ; il alimente les points
  // « À traiter » (pointsEtatDossier) et le statut d'avancement.
  // Logique donnée explicitement par l'étude, fondée uniquement sur les documents effectivement
  // retrouvés (offre de prêt + checklist de pièces), pas sur les échéances ni la confiance des
  // dates détectées (ces deux derniers signaux restent visibles ailleurs — bandeau "accès à
  // reconfirmer", badge "⚠️ à vérifier"/"≈ estimée" sur la date elle-même — la synthèse ne les
  // duplique plus) :
  //   🟢 vert    : toutes les pièces attendues sont trouvées — on peut signer.
  //   ⚪ gris    : rien n'a encore pu être vérifié (dossier jamais relié, ou pièces jamais
  //                recherchées) — pas un signal d'alarme, juste "pas encore su" ("À relier").
  //   🟡 orange  : une partie a été vérifiée et trouvée, il en manque encore d'autres — état
  //                intermédiaire ("Réception de pièces").
  //   🔴 rouge   : tout ce qui a été recherché a été confirmé absent ("Aucun document").
  // Un dossier jamais relié à un dossier local n'est donc plus confondu avec un dossier dont la
  // recherche a échoué : le premier est neutre (gris), le second est un vrai signal (rouge) — même
  // principe déjà appliqué à l'offre de prêt "inconnue" ailleurs dans l'outil. Un dossier sans rien à vérifier (achat comptant + rôle participant, qui ne
  // suit pas la checklist de pièces) est trivialement "prêt".
  function statutDossier(d) {
    if (d.archive) return 'archive';

    // Chaque pièce attendue porte l'un de trois états — pas un simple booléen — pour distinguer
    // "jamais cherchée" de "cherchée et confirmée absente" : seul ce second cas doit compter pour
    // le rouge, le premier ne doit pas pénaliser un dossier qu'on n'a pas encore eu l'occasion de
    // vérifier (même principe déjà appliqué à l'offre de prêt "inconnue" ailleurs dans l'outil).
    const items = [];
    if (!d.sansPret) {
      items.push(d.offrePretStatut === 'recue' ? 'recue' : (d.offrePretStatut === 'manquante' ? 'manquante' : 'inconnu'));
    }
    // La checklist de pièces compte dès que le dossier a été relié au moins une fois — sur un
    // dossier jamais relié, aucune pièce n'a pu être recherchée, ce n'est pas une absence, juste
    // une vérification qui n'a pas encore eu lieu (même traitement que l'offre "inconnue"
    // ci-dessus). Elle compte AUSSI pour un dossier "sans prêt" jamais relié (`|| d.sansPret`) :
    // sans condition de prêt, cette checklist est le seul signal qui existe pour ce dossier — le
    // laisser de côté tant qu'il n'est pas relié ferait apparaître "Prêt" par défaut alors que les
    // pièces d'urbanisme restent entièrement à vérifier. Signalé par l'étude.
    if (d.roleNotaire !== 'participant' && (d.dossierLie || d.sansPret)) {
      checklistPieces(d.typeVente, d).forEach(p => items.push((d.pieces || {})[p.cle] || 'inconnu'));
    }
    if (items.length === 0 || items.every(s => s === 'recue')) return 'pret';

    const verifies = items.filter(s => s !== 'inconnu');
    if (verifies.length === 0) return 'arelier';
    if (verifies.every(s => s === 'manquante')) return 'blocage';
    return 'aconfirmer';
  }

  // ---- État du dossier : LE statut affiché partout (demande de l'étude, 29/09) ----
  // Remplace « l'étape du dossier » du même jour : l'étape et la prochaine échéance disaient la même
  // chose, l'étude veut que le statut dise l'état GÉNÉRAL du dossier, dans cet ordre :
  //   À relier          — jamais relié à son dossier du NAS : rien n'a pu être vérifié ;
  //   Attente de pièces — il manque une pièce de la checklist, l'offre de prêt, ou la vente
  //                       préalable n'est pas réalisée (financement, étude 29/09) ;
  //   Complet           — toutes les pièces sont reçues, financement acquis (offre, vente préalable) ;
  //   Prêt              — complet ET rendez-vous de signature placé ;
  //   Urgent            — une date butoir est dépassée (vente préalable, obtention du prêt, date
  //                       butoir de réitération tant qu'aucun rendez-vous n'est fixé) : passe avant
  //                       tout le reste, et le dossier reprend son état normal dès que l'échéance est
  //                       levée (offre reçue, vente réalisée, rendez-vous fixé) — rien n'est stocké.
  // Les échéances elles-mêmes restent dans la colonne « Prochaine échéance » du Suivi et sur la fiche.
  // statutDossier() (pièces trouvées, absence confirmée ou pas encore cherchée) garde son rôle pour
  // les points « À traiter ».
  var ETATS_DOSSIER = [
    { cle: 'urgent', texte: 'Urgent', dl: 'dl-urgent' },
    { cle: 'arelier', texte: 'À relier', dl: 'dl-neutre' },
    { cle: 'attente', texte: 'Attente de pièces', dl: 'dl-pret' },
    { cle: 'complet', texte: 'Complet', dl: 'dl-complet' },
    { cle: 'pret', texte: 'Prêt', dl: 'dl-success' }
  ];
  // Ordre du tri « Statut » du Suivi : ce qui presse d'abord, ce qui est terminé en dernier.
  var ORDRE_ETAT_DOSSIER = ['urgent', 'arelier', 'attente', 'complet', 'pret', 'archive'];

  // Pure : les dates butoir dépassées et non levées, dans l'ordre du dossier.
  function datesButoirDepassees(d, aujourdhuiIso) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const depassees = [];
    // Acte signé (Authentic ou coché) : plus rien d'urgent (audit 12/10 : un prêt jamais noté laissait « Urgent ») ; une date
    // mal formée ne compte pas (« Invalid Date »).
    if (signatureFaiteSuivi(d)) return depassees;
    const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
    if (iso(d.ventebien) && d.ventebien < auj && !echeanceValidee(d, 'ventebien')) depassees.push({ type: 'ventebien', libelle: 'Vente préalable', iso: d.ventebien });
    if (!d.sansPret && iso(d.pret) && d.pret < auj && !echeanceValidee(d, 'pret')) depassees.push({ type: 'pret', libelle: 'Obtention du prêt', iso: d.pret });
    if (iso(d.acte) && d.acte < auj && !d.rendezVousSignature && !echeanceValidee(d, 'acte')) depassees.push({ type: 'acte', libelle: 'Date butoir', iso: d.acte });
    return depassees;
  }

  // ---- Onglet Analyse de la fiche : engagements du vendeur et documents relevés, cochés reçus ou
  // réalisés (étude, 02/10 : « le rendre coché pour indiquer si c'est reçu/réalisé ou non et le
  // prendre en compte dans la complétude du dossier et la probabilité de tenue du rendez-vous »).
  //  - Un document relevé qui est aussi une pièce de la checklist (cleChecklist) partage son état :
  //    le cocher valide la pièce à la main (piecesValideesManuellement), comme dans l'onglet Pièces —
  //    il n'est compté qu'une fois, par la checklist.
  //  - Un autre document : `doc.recu` (+ recuLe), sur le document lui-même.
  //  - Un engagement : `e.fait` (+ faitLe). Un engagement dont toutes les pièces qu'il fait réclamer
  //    sont reçues (justificatif d'entretien, facture des travaux…) est réalisé de lui-même (case
  //    grisée) ; sans pièce reconnue, il ne se coche qu'à la main.
  // Rien n'est compté pour un dossier en participation (l'étude n'y suit pas la checklist).

  // Pure : la clé de la pièce de la checklist que ce document désigne, si elle y figure encore.
  function cleChecklistDocumentAnalyse(d, doc) {
    const cle = clesChecklistDepuisDocuments([doc])[0];
    if (!cle) return '';
    return checklistPieces(d.typeVente, d).some(p => p.cle === cle) ? cle : '';
  }

  // Pure : document relevé reçu ?
  function documentAnalyseRecu(d, doc) {
    const cle = cleChecklistDocumentAnalyse(d, doc);
    if (cle) return (d.pieces || {})[cle] === 'recue';
    return !!(doc && typeof doc === 'object' && doc.recu);
  }

  // Pure : { fait, auto, motif } d'un engagement. `auto` : réalisé parce que ses pièces sont reçues.
  function etatEngagementAnalyse(d, e) {
    if (e && typeof e === 'object' && e.fait) {
      return { fait: true, auto: false, motif: e.faitLe ? `Coché le ${formatDateFr(String(e.faitLe).slice(0, 10))}` : 'Coché à la main' };
    }
    const releves = (d.analyseJuridique && d.analyseJuridique.documents) || [];
    const pieces = documentsDepuisClause(e).map(doc => releves.find(x => cleDocumentIdentifie(x) === cleDocumentIdentifie(doc)) || doc);
    if (pieces.length && pieces.every(doc => documentAnalyseRecu(d, doc))) {
      return { fait: true, auto: true, motif: `Pièce reçue : ${pieces.map(doc => typeof doc === 'string' ? doc : doc.label).join(', ')}` };
    }
    return { fait: false, auto: false, motif: '' };
  }

  var RE_ANCRE_ENGAGEMENT = /^.*?\b(?:s['’]\s*engage(?:\s+à)?|s['’]\s*oblige(?:\s+à)?|devra|remettra|produira|fournira|communiquera|justifiera|fera\s+son\s+affaire(?:\s+de)?)\s+/i;

  // Pure : l'objet d'un engagement, sans « Le PROMETTANT s'engage à » — pour une liste d'attente.
  function libelleCourtEngagement(e) {
    const phrase = String(typeof e === 'string' ? e : (e && e.phrase) || '').replace(/\s+/g, ' ').trim();
    let s = (phrase.replace(RE_ANCRE_ENGAGEMENT, '') || phrase).replace(/[.;:,]\s*$/, '');
    if (s.length > 60) s = s.slice(0, 58).replace(/\s+\S*$/, '') + '…';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Pure : ce que l'analyse attend encore — engagements non réalisés, documents hors checklist non
  // reçus (ceux de la checklist sont déjà comptés par elle). Libellés prêts à afficher.
  function elementsAnalyseEnAttente(d) {
    const vide = { engagements: [], documents: [] };
    if (!d || d.roleNotaire === 'participant' || !d.analyseJuridique) return vide;
    const engagements = (d.analyseJuridique.engagements || [])
      .filter(e => !etatEngagementAnalyse(d, e).fait)
      .map(e => `Engagement : ${libelleCourtEngagement(e)}`);
    const documents = (d.analyseJuridique.documents || [])
      .filter(doc => !cleChecklistDocumentAnalyse(d, doc) && !documentAnalyseRecu(d, doc))
      .map(doc => (typeof doc === 'string' ? doc : doc.label));
    return { engagements, documents };
  }

  // Pure : { faits, total } de l'onglet Analyse (compteur de l'onglet).
  function avancementAnalyse(d) {
    const a = (d && d.analyseJuridique) || {};
    const engs = a.engagements || [], docs = a.documents || [];
    const faits = engs.filter(e => etatEngagementAnalyse(d, e).fait).length + docs.filter(doc => documentAnalyseRecu(d, doc)).length;
    return { faits, total: engs.length + docs.length };
  }

  // Pure : ce qui manque encore (libellés) — le financement d'abord (vente préalable non réalisée,
  // offre de prêt non reçue), puis les pièces de la checklist non reçues, puis ce que l'onglet
  // Analyse attend encore (sauf participation, où l'étude ne suit pas la checklist). La vente préalable compte comme l'offre : elle finance
  // l'achat, un dossier qui l'attend n'est pas complet (étude, 29/09 au soir).
  function piecesAttenduesDossier(d) {
    const manque = [];
    if (d.ventebien && !echeanceValidee(d, 'ventebien')) manque.push('Vente préalable');
    if (!d.sansPret && !echeanceValidee(d, 'pret')) manque.push('Offre de prêt');
    if (d.roleNotaire !== 'participant') {
      const pieces = d.pieces || {};
      checklistPieces(d.typeVente, d).forEach(p => { if (pieces[p.cle] !== 'recue') manque.push(p.label); });
      // Documents relevés dans l'avant-contrat (hors checklist) et engagements du vendeur non cochés.
      const analyse = elementsAnalyseEnAttente(d);
      manque.push(...analyse.documents, ...analyse.engagements);
    }
    return manque;
  }

  // Pure et testable : { cle, texte, dl, detail }. detail = ce qui explique l'état (bulle du badge).
  function etatDossier(d, aujourdhuiIso) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const etat = (cle, detail) => {
      const e = ETATS_DOSSIER.find(x => x.cle === cle) || { cle, texte: 'Archivé', dl: 'dl-neutre' };
      return { cle, texte: e.texte, dl: e.dl, detail: detail || '' };
    };
    if (d.archive) return etat('archive', 'Dossier archivé');
    const depassees = datesButoirDepassees(d, auj);
    if (depassees.length) {
      return etat('urgent', depassees.map(x => `${x.libelle} dépassée depuis le ${formatDateFr(x.iso)}`).join(' · '));
    }
    if (!d.dossierLie) return etat('arelier', 'Dossier du NAS pas encore relié : pièces et offre non vérifiées');
    const manque = piecesAttenduesDossier(d);
    if (manque.length) return etat('attente', `En attente : ${manque.join(', ')}`);
    // Acte déjà signé (Authentic ou signature cochée, dateSignatureDossier) : la bulle le dit au passé, avec la date retenue partout.
    const signeLe = dateSignatureDossier(d, auj);
    if (signeLe) return etat('pret', `Toutes les pièces sont reçues ; acte signé le ${formatDateFr(signeLe)}`);
    if (d.rendezVousSignature) return etat('pret', `Toutes les pièces sont reçues ; signature le ${formatDateFr(d.rendezVousSignature)}`);
    return etat('complet', 'Toutes les pièces sont reçues ; rendez-vous de signature à placer');
  }

  // Pure : répartition des dossiers par statut pour l'en-tête du Suivi (étude, 30/09 : « les
  // statistiques des actes, en fonction des statuts »), dans l'ordre de ETATS_DOSSIER, avec pour
  // chacun le fait qui compte : le plus long retard, la pièce la plus attendue, la prochaine
  // signature. `liste` = dossiers non archivés, déjà filtrés comme la liste affichée.
  function syntheseEtatsSuivi(liste, aujourdhuiIso) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const parEtat = {};
    ETATS_DOSSIER.forEach(e => { parEtat[e.cle] = []; });
    (liste || []).forEach(d => { const e = etatDossier(d, auj); if (parEtat[e.cle]) parEtat[e.cle].push(d); });
    const jourCourt = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const detail = (cle, ds) => {
      if (!ds.length) return '';
      if (cle === 'urgent') {
        const plusAncienne = ds.map(d => datesButoirDepassees(d, auj).map(x => x.iso).sort()[0]).sort()[0];
        const retard = joursEntre(plusAncienne, auj) - 1;
        return `${ds.length > 1 ? "jusqu'à " : ''}${retard} j de retard`;
      }
      if (cle === 'arelier') return 'pièces non vérifiées';
      if (cle === 'attente') {
        const compte = {};
        ds.forEach(d => piecesAttenduesDossier(d).forEach(p => { compte[p] = (compte[p] || 0) + 1; }));
        const [piece, n] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0] || [];
        return piece ? `surtout : ${piece}${n > 1 ? ` (${n})` : ''}` : '';
      }
      if (cle === 'complet') return 'rendez-vous à placer';
      const prochaine = ds.map(d => d.rendezVousSignature).filter(iso => iso && iso >= auj).sort()[0];
      return prochaine ? `prochaine signature ${jourCourt(prochaine)}` : '';
    };
    return ETATS_DOSSIER.map(e => ({ cle: e.cle, texte: e.texte, nombre: parEtat[e.cle].length, detail: detail(e.cle, parEtat[e.cle]) }));
  }

  // Filtre de la liste par statut, posé par un clic sur la répartition (un second clic le retire).
  var filtreEtatSuivi = '';
  function filtrerEtatSuivi(cle) {
    filtreEtatSuivi = filtreEtatSuivi === cle ? '' : cle;
    render();
  }

  // Statuts en pastilles de filtre dans la barre d'outils du Suivi (étude, 30/09 : la grande bande
  // des statuts retirée) : « Urgent 2 · À relier 1 · … », un clic filtre, un second retire le filtre.
  function renderEtatsSuivi(synthese) {
    const zone = document.getElementById('suivi-statuts');
    if (!zone) return;
    const total = synthese.reduce((t, e) => t + e.nombre, 0);
    if (!total && !filtreEtatSuivi) { zone.innerHTML = ''; return; }
    zone.innerHTML = synthese.map(e => {
      const actif = filtreEtatSuivi === e.cle;
      return `<button type="button" class="suivi-statut${actif ? ' actif' : ''}${e.nombre ? '' : ' vide'}" data-etat="${e.cle}" aria-pressed="${actif}"
        onclick="filtrerEtatSuivi('${e.cle}')" title="${escapeAttr((e.detail ? e.detail.charAt(0).toUpperCase() + e.detail.slice(1) + ' — ' : '') + (actif ? 'afficher tous les statuts' : `afficher seulement : ${e.texte}`))}">
        <span class="pf-point pf-${e.cle}"></span>${escapeHtml(e.texte)}<span class="suivi-statut-n">${e.nombre}</span></button>`;
    }).join('');
  }

  // ---- Colonne de gauche du Suivi (étude, 01/10 : « met plutôt les dernières pièces rattachées sur
  // le commun, le nombre de dossiers à signer ce mois-ci, le nombre qui reste à placer et dont la date
  // butoir est dans le mois, le nombre de ventes (puis ensuite de successions) ») — remplace « Prévu
  // en {mois} ». Quatre compteurs du mois en cours, chacun filtre la liste ; puis les pièces trouvées
  // sur le NAS ces 14 derniers jours. Calculé sur la liste filtrée (mêmes filtres sauf statut).

  function isoLocalDepuisDate(v) {
    const d = new Date(v);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Pure. `actifs` : dossiers de la liste (les archivés sont écartés). Le mois est le mois en cours.
  //  - aSigner : rendez-vous de signature dans le mois (par date), `signees` = ceux déjà passés ;
  //  - aPlacer : sans rendez-vous, date butoir dans le mois ou déjà dépassée (un dossier dont la butoir
  //    est passée le mois dernier reste à placer), par date ; `depassees` = butoir passée ;
  //  - ventes / successions : par d.typeAffaire (absent = vente).
  function syntheseMoisSuivi(actifs, aujourdhuiIso) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const debut = auj.slice(0, 7) + '-01';
    const suivant = new Date(debut + 'T00:00:00');
    suivant.setMonth(suivant.getMonth() + 1);
    const fin = addDays(isoLocalDepuisDate(suivant), -1);
    const dansMois = iso => !!iso && iso >= debut && iso <= fin;
    const liste = (actifs || []).filter(d => d && !d.archive);
    const aSigner = liste.filter(d => dansMois(d.rendezVousSignature))
      .sort((a, b) => a.rendezVousSignature.localeCompare(b.rendezVousSignature));
    const aPlacer = liste.filter(d => !d.rendezVousSignature && d.acte && (dansMois(d.acte) || d.acte < auj) && !echeanceValidee(d, 'acte'))
      .sort((a, b) => a.acte.localeCompare(b.acte));
    return {
      mois: { cle: debut.slice(0, 7), debut, fin },
      aSigner, signees: aSigner.filter(d => !!dateSignatureDossier(d, auj)).length,
      aPlacer, depassees: aPlacer.filter(d => d.acte < auj).length,
      ventes: liste.filter(d => d.typeAffaire !== 'succession'),
      successions: liste.filter(d => d.typeAffaire === 'succession')
    };
  }

  // Filtre posé par un compteur de la colonne : '', 'signer', 'placer', 'vente' ou 'succession'.
  var filtreMoisSuivi = '';
  function filtrerMoisSuivi(cle) { filtreMoisSuivi = filtreMoisSuivi === cle ? '' : cle; render(); }
  // Pure : les dossiers que garde le filtre `cle` (tous si aucun filtre).
  function dossiersFiltreMoisSuivi(liste, cle, synthese) {
    const garde = { signer: synthese.aSigner, placer: synthese.aPlacer, vente: synthese.ventes, succession: synthese.successions }[cle];
    return garde ? (liste || []).filter(d => garde.includes(d)) : (liste || []);
  }

  var MAX_ACTIVITE_COLONNE_SUIVI = 12;

  // « Derniers dossiers ouverts » (étude 05/10 : à la place des dernières pièces, les fiches consultées récemment, pour y
  // revenir d'un clic). Liés au COLLABORATEUR, plus au navigateur (étude 06/10 : « il faut que ce soit lié à la personne
  // qui ouvre ») : gardés dans ses préférences sur le serveur (`dossiersConsultes`), chargés avec elles
  // (chargerPreferencesCollaborateur) ; la liste d'avant, gardée dans le navigateur, est reprise une fois.
  var MAX_DOSSIERS_CONSULTES = 10;
  var dossiersConsultesCollaborateur = null;   // null tant que les préférences du collaborateur ne sont pas lues
  function cleDossiersConsultes() { return 'claire-dossiers-consultes:' + (utilisateurPoste || 'poste'); }
  function lireDossiersConsultesLocaux() {
    try {
      const l = JSON.parse(localStorage.getItem(cleDossiersConsultes()) || '[]');
      return Array.isArray(l) ? l.filter(x => x && typeof x.id === 'string') : [];
    } catch (e) { return []; }
  }
  function lireDossiersConsultes() {
    return Array.isArray(dossiersConsultesCollaborateur) ? dossiersConsultesCollaborateur : lireDossiersConsultesLocaux();
  }
  // Préférences du collaborateur lues : sa liste du serveur, sinon (premier passage) celle de ce navigateur, envoyée.
  function appliquerDossiersConsultesServeur(liste) {
    if (Array.isArray(liste)) { dossiersConsultesCollaborateur = liste.slice(0, MAX_DOSSIERS_CONSULTES); return; }
    dossiersConsultesCollaborateur = lireDossiersConsultesLocaux().slice(0, MAX_DOSSIERS_CONSULTES);
    if (dossiersConsultesCollaborateur.length) enregistrerPreferenceCollaborateur({ dossiersConsultes: dossiersConsultesCollaborateur });
  }
  // Pure : la liste après l'ouverture de `id` à `le` — en tête, sans doublon, `max` au plus.
  function ajouterDossierConsulte(liste, id, le, max) {
    return [{ id, le }].concat((liste || []).filter(x => x && x.id !== id)).slice(0, max || MAX_DOSSIERS_CONSULTES);
  }
  function noterDossierConsulte(id) {
    if (!id) return;
    dossiersConsultesCollaborateur = ajouterDossierConsulte(lireDossiersConsultes(), id, new Date().toISOString());
    enregistrerPreferenceCollaborateur({ dossiersConsultes: dossiersConsultesCollaborateur });
  }
  // Pure : [{ dossier, le }] des dossiers encore présents (un dossier supprimé disparaît de la liste).
  function dossiersConsultesRecents(consultes, tous) {
    const parId = new Map((tous || []).map(d => [d.id, d]));
    return (consultes || []).map(c => ({ dossier: parId.get(c.id), le: c.le })).filter(x => x.dossier);
  }
  // « 10:32 » aujourd'hui, « hier », sinon « 3 oct. ».
  function quandConsulte(iso, maintenant) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const m = maintenant || new Date();
    const jour = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    if (jour(d) === jour(m)) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const hier = new Date(m); hier.setDate(hier.getDate() - 1);
    if (jour(d) === jour(hier)) return 'hier';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  // Carré « Activité de l'étude » de la colonne du Suivi (étude, 01/10 : « l'activité en live de
  // l'office en carré ») : le même fil que le widget du tableau de bord — tous les dossiers, tous les
  // collaborateurs, sans les filtres de la liste —, résumé du jour puis les dernières actions, qui
  // défilent dans le carré. Mis à jour à chaque sondage, comme le reste de la page.
  function renderActiviteColonneSuivi() {
    const p = partiesActiviteEtude(dossiers || [], 'grand', MAX_ACTIVITE_COLONNE_SUIVI);
    return `<section class="sm-bloc sm-activite activite-etude" data-filtre="tout" aria-label="Activité de l’étude">
        <h2 class="sm-titre">Activité de l’étude<span class="activite-direct"><span class="activite-direct-point"></span>En direct</span></h2>
        ${p.resume}
        <div class="sm-activite-fil">${p.fil}</div>
      </section>`;
  }

  function renderColonneSuivi(s, actifs) {
    const zone = document.getElementById('suivi-stats');
    if (!zone) return;
    const nomMois = new Date(s.mois.debut + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long' });
    const pluriel = (n, mot) => `${mot}${n > 1 ? 's' : ''}`;
    const tuile = (cle, n, libelle, sous, alerte, aide) => {
      const actif = filtreMoisSuivi === cle;
      return `<button type="button" class="sm-tuile${actif ? ' actif' : ''}${n ? '' : ' vide'}" onclick="filtrerMoisSuivi('${cle}')" aria-pressed="${actif}"
          title="${escapeAttr(actif ? 'Afficher tous les dossiers' : aide)}">
          <span class="sm-n">${n}</span>
          <span class="sm-lib">${escapeHtml(libelle)}</span>
          <span class="sm-sous${alerte ? ' alerte' : ''}">${escapeHtml(sous)}</span>
        </button>`;
    };
    const nS = s.aSigner.length, nP = s.aPlacer.length;
    const tuiles = [
      tuile('signer', nS, `à signer`, s.signees ? `dont ${s.signees} ${pluriel(s.signees, 'passé')}` : `en ${nomMois}`, false,
        `Afficher les dossiers dont la signature est en ${nomMois}`),
      tuile('placer', nP, `à placer`, s.depassees ? `${s.depassees} butoir ${pluriel(s.depassees, 'dépassée')}` : `butoir en ${nomMois}`, s.depassees > 0,
        `Afficher les dossiers sans rendez-vous dont la date butoir est en ${nomMois} ou déjà dépassée`),
      tuile('vente', s.ventes.length, pluriel(s.ventes.length, 'vente'), 'en cours', false, 'Afficher les ventes'),
      tuile('succession', s.successions.length, pluriel(s.successions.length, 'succession'), 'en cours', false, 'Afficher les successions')
    ].join('');

    const consultes = dossiersConsultesRecents(lireDossiersConsultes(), dossiers);
    const lignes = consultes.map(({ dossier: d, le }) => {
      const etat = etatDossier(d);
      return `<button type="button" class="sm-piece${dossierOuvert === d.id ? ' ouvert' : ''}" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')"
          title="${escapeAttr('Ouvrir la fiche — ' + libelleDossierAffiche(d))}">
          <span class="sm-piece-point pf-point pf-${escapeAttr(etat.cle)}" aria-hidden="true"></span>
          <span class="sm-piece-texte"><span class="sm-piece-titre">${escapeHtml(libelleDossierAffiche(d))}</span><span class="sm-piece-dossier">${escapeHtml(etat.texte)}${d.responsable ? ' · ' + escapeHtml(prenomCollaborateur(d.responsable)) : ''}</span></span>
          <span class="sm-piece-date">${escapeHtml(quandConsulte(le))}</span>
        </button>`;
    }).join('');

    zone.innerHTML = `<section class="sm-bloc" aria-label="Ce mois-ci">
        <h2 class="sm-titre">${escapeHtml(nomMois.charAt(0).toUpperCase() + nomMois.slice(1))}${filtreMoisSuivi ? `<button type="button" class="sm-effacer" onclick="filtrerMoisSuivi('')">Tout afficher</button>` : ''}</h2>
        <div class="sm-tuiles" role="group" aria-label="Filtrer la liste">${tuiles}</div>
      </section>
      <section class="sm-bloc" aria-label="Derniers dossiers ouverts">
        <h2 class="sm-titre">Derniers dossiers ouverts${infoBulle(`Les ${MAX_DOSSIERS_CONSULTES} dernières fiches ouvertes sur ce poste, la plus récente d’abord.`)}</h2>
        ${lignes ? `<div class="sm-pieces">${lignes}</div>` : '<p class="sm-rien">Aucune fiche ouverte pour l’instant.</p>'}
      </section>
      ${renderActiviteColonneSuivi()}`;
  }

  // « Scanner le commun » (ex-« Revérifier tous les dossiers », renommé par l'étude le 01/10 ; barre d'outils du Suivi), à la place de l'ancien bouton du
  // registre partagé — demandé par l'étude. Remplace aussi, et rend inutiles, le bandeau
  // « reconfirmer les accès », sa popup de démarrage et le bouton groupé qui les accompagnaient :
  // le NAS étant lu par le SERVEUR, il n'y a plus la moindre permission de navigateur à
  // reconfirmer (voir la section « DOSSIERS DU NAS » plus bas).
  //
  // Les dossiers sont revérifiés l'un après l'autre plutôt qu'en parallèle : chacun peut demander
  // au modèle IA local de confirmer une offre de prêt (voir confirmerOffrePretIa), et Ollama
  // sérialise de toute façon ses réponses — les lancer tous ensemble ne ferait qu'emboliser le
  // serveur sans rien accélérer.
  async function reverifierTousLesDossiers(btn) {
    const aVerifier = dossiers.filter(d => !d.archive && d.dossierLie && d.nasDossier);
    if (aVerifier.length === 0) {
      afficherToast('Aucun dossier reli\u00e9 \u00e0 un dossier du NAS pour l\u2019instant.', 'OK', null);
      return;
    }
    const texteOriginal = btn ? btn.innerHTML : '';
    if (btn) btn.disabled = true;
    // Geste explicite de l'étude : portée complète, comme un « Revérifier » dossier par dossier.
    // L'appel se fait pourtant avec viaClicUtilisateur = false, uniquement pour qu'un toast de
    // résultat ne s'affiche pas par dossier (la progression est dans le bouton, le bilan à la fin) —
    // le budget et la mémoire des PDF écartés (voir MAX_PDF_OUVERTS_TOUR_AUTO) sont donc levés ici
    // à la main, sans quoi ce bouton n'ouvrirait plus rien dès qu'un tour automatique a consommé
    // son budget.
    aVerifier.forEach(d => { delete pdfEcartesPourOffre[d.id]; });
    budgetOuverturesTourAuto = Infinity;
    try {
      for (let i = 0; i < aVerifier.length; i++) {
        if (btn) btn.innerHTML = `${icone('spinner', null, true)} ${i + 1}/${aVerifier.length}\u2026`;
        await verifierDossierLocal(aVerifier[i].id, false);
        await rendreLaMain();
      }
      afficherToast(`Commun scanné : ${aVerifier.length} dossier${aVerifier.length > 1 ? 's' : ''} relu${aVerifier.length > 1 ? 's' : ''}.`, 'OK', null);
    } finally {
      // Remis à zéro : le prochain tour automatique refixe son propre budget en démarrant, il ne
      // doit surtout pas hériter de l'illimité posé ci-dessus.
      budgetOuverturesTourAuto = 0;
      if (btn) { btn.disabled = false; btn.innerHTML = texteOriginal; }
      render();
    }
  }

  // « 2026-10-04 15:39 » → « 04/10 15:39 » (la date d'une version, affichée en petit à côté de son numéro).
  function dateVersionCourte(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(String(date || ''));
    return m ? `${m[3]}/${m[2]} ${m[4]}` : String(date || '');
  }

  // Écran "À propos" (voir VERSION_APP/HISTORIQUE_VERSIONS en tête de fichier) : peuple la version
  // et l'historique à chaque ouverture plutôt qu'une fois au chargement, au cas — improbable mais
  // sans coût à couvrir — où ces libellés seraient un jour recalculés dynamiquement plutôt que de
  // simples constantes figées.
  function ouvrirAPropos() {
    const valeur = document.getElementById('apropos-version-valeur');
    if (valeur) valeur.textContent = VERSION_APP;
    const dateVersion = document.getElementById('apropos-version-date');
    if (dateVersion) dateVersion.textContent = HISTORIQUE_VERSIONS[0] ? '· ' + dateVersionCourte(HISTORIQUE_VERSIONS[0].date) : '';
    const liste = document.getElementById('apropos-historique-liste');
    if (liste) {
      liste.innerHTML = HISTORIQUE_VERSIONS.map(h =>
        `<li><span class="apropos-historique-date">${escapeHtml(h.version)}</span> <span class="apropos-historique-jour">${escapeHtml(dateVersionCourte(h.date))}</span> — ${escapeHtml(h.resume)}</li>`
      ).join('');
    }
    const overlay = document.getElementById('apropos-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function fermerAPropos() {
    const overlay = document.getElementById('apropos-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // Le badge de statut d'un dossier, partout : son état général (voir etatDossier).
  function renderBadgeStatut(d) {
    const e = etatDossier(d);
    const marqueur = e.cle === 'archive' ? icone('lock') : '<span class="dot"></span>';
    return `<span class="dot-label ${e.dl}" title="${escapeAttr(e.detail)}">${marqueur}${escapeHtml(e.texte)}</span>`;
  }

  // Même libellé quand on n'a gardé que le nom (et l'identifiant) : le dossier retrouvé donne son type.
  function libelleDossierParNom(nom, id) {
    const d = id && typeof dossiers !== 'undefined' ? (dossiers || []).find(x => x.id === id) : null;
    return libelleDossierAffiche(d ? Object.assign({}, d, { nom: nom || d.nom }) : { nom });
  }

  // Propriétés du dossier, une ligne par donnée : icône et libellé à gauche, valeur à droite,
  // directement modifiable (même identifiants et mêmes fonctions que l'ancienne fiche — seule la
  // présentation change). Trois groupes séparés par un filet : le dossier lui-même, le bien et son
  // financement, les notaires.
  //
  // Champs secondaires vides (revue de l'interface, 29/09 : une fiche alignait cinq « Non détecté »
  // avant les onglets) : mobilier, séquestre, « versé à » et notaires sans valeur sont repliés
  // derrière « Compléter la fiche (N) ». Le prix et l'adresse restent toujours visibles, même vides :
  // un dossier sans eux doit se voir.
  const fichesChampsVidesOuverts = new Set();

  function basculerChampsVidesFiche(id) {
    if (fichesChampsVidesOuverts.has(id)) fichesChampsVidesOuverts.delete(id);
    else fichesChampsVidesOuverts.add(id);
    render();
  }

  function renderProprietesDossier(d, boutonOuvrirCompromis, boutonsDossierLocal) {
    // Une case de la grille : libellé court à gauche, valeur à droite. `cls` : 'prop-pleine' pour
    // une valeur longue (adresse, dossier du NAS, avant-contrat, notaires) qui prend toute la
    // largeur ; les autres vont deux par ligne. 'prop-vide' : champ secondaire vide, replié.
    let nbVides = 0;
    const siVide = (vide) => { if (vide) nbVides++; return vide ? ' prop-vide' : ''; };
    const ligne = (ic, libelle, valeur, pourId, cls) => `
      <div class="prop-ligne${cls ? ' ' + cls : ''}">
        <dt>${pourId ? `<label for="${pourId}">` : '<span>'}${icone(ic)}<span>${libelle}</span>${pourId ? '</label>' : '</span>'}</dt>
        <dd>${valeur}</dd>
      </div>`;
    const saisie = (id, valeur, fonction, extra, placeholder) => `<input type="text" id="${id}-${d.id}" class="prop-champ" value="${escapeAttr(valeur || '')}" placeholder="${placeholder || 'Non détecté'}" onblur="${fonction}('${escapeOnclickArg(d.id)}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"${extra || ''}>`;

    // Groupe 1 — le dossier.
    const responsable = `<select id="resp-${d.id}" class="prop-champ" onchange="changerResponsable('${escapeOnclickArg(d.id)}', this.value)">
        <option value="" ${d.responsable ? '' : 'selected'}>À définir</option>
        ${RESPONSABLES.map(r => `<option ${d.responsable === r ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}
      </select>`;
    const typeVente = `<select id="tv-${d.id}" class="prop-champ" onchange="changerTypeVente('${escapeOnclickArg(d.id)}', this.value)">
        <option value="maison" ${d.typeVente === 'maison' || !d.typeVente ? 'selected' : ''}>Maison</option>
        <option value="copropriete" ${d.typeVente === 'copropriete' ? 'selected' : ''}>Copropriété</option>
        <option value="terrain" ${d.typeVente === 'terrain' ? 'selected' : ''}>Terrain à bâtir</option>
        <option value="terre" ${d.typeVente === 'terre' ? 'selected' : ''}>Terre agricole / terrain non bâti</option>
      </select>`;
    const nas = `<span class="prop-texte${d.dossierLie ? '' : ' vide'}" title="${escapeAttr(d.nasDossier || '')}">${d.dossierLie ? escapeHtml(d.nasDossier || 'Relié') : 'Non relié'}</span>${boutonsDossierLocal}`;
    // « Lire » : chercher le mobilier dans l'avant-contrat du NAS (voir lireMobilierDepuisAvantContrat).
    const boutonLireMobilier = (!d.prixMobilier && d.dossierLie && d.nasDossier)
      ? (lecturesMobilierEnCours.has(d.id)
        ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" disabled>${icone('spinner', null, true)} Lecture…</wa-button>`
        : `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="lireMobilierDepuisAvantContrat('${escapeOnclickArg(d.id)}', true)" title="${d.mobilierLuLe ? 'Relire' : 'Chercher'} le mobilier dans l’avant-contrat du dossier du NAS">${icone('file-text')} Lire</wa-button>`)
      : '';
    // Ce que « Ouvrir le compromis » ouvrira, dans l'ordre où ouvrirCompromisTrouve() le résout :
    // le fichier DÉJÀ retrouvé (mémorisé dans d.fichiersTrouves après une première ouverture), sinon
    // le nom importé à la création, sinon — dossier NAS relié — il sera cherché à l'ouverture. Le
    // « Aucun fichier mémorisé » alarmant ne reste que pour un dossier sans NAS relié, où il n'y a
    // effectivement rien à ouvrir. Avant ce correctif, la ligne ne regardait que d.compromisNomFichier
    // et affichait donc « Aucun fichier mémorisé » même sur un dossier relié dont l'avant-contrat est
    // parfaitement joignable (et même après l'avoir ouvert une fois, le fichier trouvé étant rangé
    // dans d.fichiersTrouves, pas dans d.compromisNomFichier). Signalé par l'étude.
    const cheminCompromisTrouve = compromisMemoriseValide(d);
    const nomCompromisTrouve = cheminCompromisTrouve ? (String(cheminCompromisTrouve).split(/[\\/]/).pop() || '') : '';
    const nomAttendu = nomCompromisAttendu(d);
    const compromisConnu = !!(nomAttendu || nomCompromisTrouve);
    const libelleCompromis = nomAttendu
      ? nomAttendu
      : (nomCompromisTrouve || (d.dossierLie ? 'Recherché dans le dossier NAS à l’ouverture' : 'Aucun fichier mémorisé'));
    // Compromis jamais lu par CLAIRE (dossier créé depuis Authentic ou à la main) : « Compléter » relit le
    // compromis — déposé, ou trouvé sur le NAS — pour les échéances, engagements, prix… (étude, 03/10).
    const boutonCompleter = !d.compromisNomFichier && !d.archive && !estSuccession(d)
      ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="demarrerComplementCompromis('${escapeOnclickArg(d.id)}')" title="Lire le compromis pour compléter la fiche : échéances, engagements du vendeur, prix, notaires…">${icone('file-text')} Compléter</wa-button>` : '';
    // « Changer » : choisir à la main le bon PDF du NAS quand l'avant-contrat retrouvé n'est pas le bon (étude 05/10).
    const boutonChangerCompromis = d.dossierLie && d.nasDossier && !d.archive && !estSuccession(d)
      ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ouvrirChoixCompromis('${escapeOnclickArg(d.id)}')" title="Choisir un autre fichier du dossier du NAS comme avant-contrat">Changer</wa-button>` : '';
    const avantContrat = `<span class="prop-texte${compromisConnu ? '' : ' vide'}" title="${escapeAttr(cheminCompromisTrouve || nomAttendu || '')}">${escapeHtml(libelleCompromis)}</span>${boutonOuvrirCompromis}${boutonChangerCompromis}${boutonCompleter}`;

    // Groupe 2 — le bien et son financement.
    const offre = statutOffreAffichage(d);
    const apport = (!d.sansPret && d.offrePretStatut === 'recue') ? calculerApport(d) : null;
    const financement = d.sansPret
      ? `<span class="dot-label dl-pret" title="Achat comptant, sans prêt">${icone('banknote')}Comptant</span>`
      : apport
        ? `<span class="prop-texte" title="Prêt de ${escapeAttr(formaterPrix(d.montantPret))}"><span class="apport-cercle apport-${apport.niveau}"></span> Apport ${formaterPrix(apport.montant)} (${apport.pourcentage} %)</span>`
        : `<span class="dot-label ${offre.dl}" title="Prêt — statut de l’offre"><span class="dot"></span>Offre ${offre.texte.toLowerCase()}</span>`;

    // Groupe 3 — les notaires. Le bouton « Reçoit l'acte » EST le contrôle (voir
    // basculerCoteInstrumentaire), sur les deux lignes au même endroit.
    const detectes = notairesDetectesDossier(d);
    // Notaires lus dans l'acte et pas encore placés (étude, 02/10 : « le notaire était dans le
    // compromis mais a disparu de la fiche ») — visibles, à placer d'un clic, jamais repliés.
    const nonPlaces = notairesNonPlacesDossier(d);
    const listeId = `notaires-detectes-${d.id}`;
    // Liste déroulante : les notaires lus dans l'acte d'abord, puis ceux du carnet des confrères.
    const nomsDetectes = detectes.map(n => n.nom);
    const optionsNotaires = nomsDetectes.concat(optionsNotairesCarnet(carnetConfreres).filter(n => nomsDetectes.indexOf(n) === -1));
    const notaire = (cote, valeur) => {
      const actif = d.coteInstrumentaire === cote;
      return `<input type="text" id="not-${cote}-${d.id}" class="prop-champ" list="${listeId}" autocomplete="off" value="${escapeAttr(valeur || '')}" placeholder="Non détecté" oninput="proposerNotairesAnnuaire(this)" onblur="affecterNotaire('${escapeOnclickArg(d.id)}', '${cote}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
        ${valeur ? '' : `<button type="button" class="lien-action" onclick="affecterNotaire('${escapeOnclickArg(d.id)}', '${cote}', NOTAIRE_ETUDE_LIBELLE)" title="Mettre ${escapeAttr(NOTAIRE_ETUDE_LIBELLE)}">Notre office</button>`}
        <button type="button" class="dot-label ${actif ? 'dl-success' : 'dl-neutre'} notaire-redacteur${actif ? ' actif' : ''}"
          onclick="basculerCoteInstrumentaire('${escapeOnclickArg(d.id)}', '${cote}')"
          title="${actif ? 'Ce notaire reçoit l’acte. Cliquez pour retirer.' : 'Désigner ce notaire comme celui qui reçoit l’acte.'}">${actif ? icone('check') : '<span class="dot"></span>'}Reçoit l’acte</button>
        ${renderConfrereCarnetFiche(d, cote)}`;
    };
    // Rôle de l'étude : déduit dès que notre étude est reconnue d'un côté ET qu'un côté reçoit
    // l'acte (voir deduireRoleNotaireDossier) ; sinon cliquable, seul moyen de marquer un dossier
    // en participation quand l'acte ne nomme pas notre étude.
    const role = d.roleNotaire === 'participant' ? 'Participant' : 'Instrumentaire';
    const deduit = !!(coteEtudeDossier(d) && d.coteInstrumentaire);
    const ligneRole = deduit
      ? `<span class="notaire-role" title="Déduit du côté qui reçoit l’acte."><strong>${role}</strong> <span class="notaire-role-source">déduit</span></span>`
      : `<button type="button" class="notaire-role notaire-role-bouton" onclick="basculerRoleEtude('${escapeOnclickArg(d.id)}')"
           title="L’étude n’est reconnue dans aucun des deux notaires : cliquez pour changer son rôle."><strong>${role}</strong> ${icone('pencil')}</button>`;
    // L'acquéreur représenté par un office distinct : la déontologie interdit de le contacter
    // directement, les relances vont à son notaire (voir emailDestinataireRelance).
    // Étude, 03/10 : « si le confrère est du côté du vendeur, il n'y a nulle part où saisir son adresse ».
    const deuxConfreres = confrereRepresenteVendeur(d) && notaireParticipantRepresenteAcquereur(d);
    const emailConfrereVendeur = confrereRepresenteVendeur(d)
      ? ligne('mail', deuxConfreres ? 'Confrère du vendeur' : 'Confrère', `<input type="email" id="not-email-confrere-vendeur-${d.id}" class="prop-champ" value="${escapeAttr(d.emailConfrereVendeur || '')}" placeholder="${escapeAttr(emailOfficeConfrereVendeur(d) ? emailOfficeConfrereVendeur(d) + ' (annuaire)' : 'Non renseigné')}" title="Adresse du notaire du vendeur : ses emails sont rattachés au dossier, il est proposé pour les dates de signature. Vide : l'email de l'office tiré de l'annuaire." onblur="changerEmailConfrereVendeur('${escapeOnclickArg(d.id)}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">`, `not-email-confrere-vendeur-${d.id}`, 'prop-pleine')
      : '';
    const emailParticipant = notaireParticipantRepresenteAcquereur(d)
      ? ligne('mail', deuxConfreres ? 'Confrère de l’acquéreur' : 'Confrère', `<input type="email" id="not-email-participant-${d.id}" class="prop-champ" value="${escapeAttr(d.emailNotaireParticipant || '')}" placeholder="${escapeAttr(emailOfficeConfrereAcquereur(d) ? emailOfficeConfrereAcquereur(d) + ' (carnet)' : 'Non renseigné')}" title="Les relances (prêt, RIB) seront adressées à cette adresse plutôt qu'à l'acquéreur lui-même. Vide : l'email de l'office tiré du carnet des confrères." onblur="changerEmailNotaireParticipant('${escapeOnclickArg(d.id)}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">`, `not-email-participant-${d.id}`, 'prop-pleine')
      : '';

    // Téléphone du confrère, sous son email : saisi sur le dossier, sinon celui de l'annuaire ; le numéro est écrit en texte
    // (reconnu par l'extension 3CX) et le champ le corrige (étude 05/10).
    const telConfrere = (cote, libelle) => {
      const t = telephoneConfrereDossier(d, cote);
      const texte = t.effectif ? `<span class="coord-tel-texte">${liensAppelTelephone(t.effectif)}<span>${texteAppel3cx(t.effectif)}${t.saisi ? '' : ' <span class="hint">(annuaire)</span>'}</span></span>` : '';
      const champ = `<input type="tel" id="not-tel-${cote}-${d.id}" class="prop-champ coord-tel" value="${escapeAttr(t.saisi)}" placeholder="${t.effectif ? 'Corriger ou ajouter un numéro' : 'Téléphone'}" autocomplete="off" aria-label="Téléphone du ${escapeAttr(libelle.toLowerCase())}" title="Plusieurs numéros : séparés par « / ». Vide : le numéro de l'office tiré de l'annuaire. Un numéro saisi complète l'annuaire." onblur="changerTelephoneConfrere('${escapeOnclickArg(d.id)}', '${cote}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">`;
      return ligne('phone', 'Tél. ' + libelle.charAt(0).toLowerCase() + libelle.slice(1), `<span class="coord-tel-ligne">${texte}${champ}</span>`, `not-tel-${cote}-${d.id}`, 'prop-pleine');
    };
    const telConfrereVendeur = confrereRepresenteVendeur(d) ? telConfrere('vendeur', deuxConfreres ? 'Confrère du vendeur' : 'Confrère') : '';
    const telParticipant = notaireParticipantRepresenteAcquereur(d) ? telConfrere('acquereur', deuxConfreres ? 'Confrère de l’acquéreur' : 'Confrère') : '';

    // Succession (étude 15/10) : défunt, héritiers, régime, donation, testament, type et actes — client/74-fiche-succession.js.
    if (estSuccession(d)) return renderDossierSuccession(d, ligne, responsable, nas);

    const blocBien = `
      <dl class="fiche-proprietes">
        ${ligne('user', 'Responsable', responsable, `resp-${d.id}`)}
        ${ligne('home', 'Type de vente', typeVente, `tv-${d.id}`)}
        ${ligne('folder', 'Dossier NAS', nas, null, 'prop-pleine')}
        ${d.archive || d.roleNotaire === 'participant' ? '' : ligne('mail', 'Courriers', `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ouvrirConstitutionDepuisFiche('${escapeOnclickArg(d.id)}')" title="Préparer les courriers à la mairie (numérotage, alignement, péril, assainissement) : toutes les parcelles et tous les vendeurs d’Authentic">Constitution de dossier</wa-button>`, null, 'prop-pleine')}
        ${ligne('settings', 'Outils', renderOutilsVenteFiche(d), null, 'prop-pleine')}
        ${ligneProvisionFiche(d) ? ligne('banknote', 'Provision', ligneProvisionFiche(d), null, 'prop-pleine') : ''}
        ${ligne('file-text', 'Avant-contrat', avantContrat, null, 'prop-pleine')}
        ${estSuccession(d) ? '' : ligne('calendar', 'Signé le', `<input type="date" id="date-ac-${d.id}" class="prop-champ" value="${escapeAttr(d.dateAvantContrat || '')}" onchange="changerDateAvantContrat('${escapeOnclickArg(d.id)}', this.value)">`, `date-ac-${d.id}`, siVide(!d.dateAvantContrat).trim())}
      </dl>
      <dl class="fiche-proprietes fiche-coordonnees">
        ${ligne('user', 'Vendeurs', renderPersonnesCoteFiche(d, 'vendeur'), null, 'prop-pleine')}
        ${ligne('users', 'Acquéreurs', renderPersonnesCoteFiche(d, 'acquereur'), null, 'prop-pleine')}
        ${coordonneesPartiesDossier(d).map(c => ligne(c.partie === 'vendeur' ? 'user' : 'users', c.libelle, champsCoordonneesPartie(d, c, 'fiche'), c.parNotaire ? `fiche-tel-${c.partie}-${d.id}` : `fiche-email-${c.partie}-${d.id}`, 'prop-pleine')).join('')}
        ${renderClientsAPlacer(d, ligne)}
        ${renderPersonnesConnues(d, ligne)}
      </dl>
      <dl class="fiche-proprietes">
        ${ligne('map-pin', 'Adresse', saisie('adresse', normaliserAdresse(d.adresseBien), 'changerAdresseBien'), `adresse-${d.id}`, 'prop-pleine')}
        ${renderParcellesFiche(d) ? ligne('layout', 'Parcelles', renderParcellesFiche(d), null, 'prop-pleine') : ''}
        ${d.bien && Array.isArray(d.bien.lots) && d.bien.lots.length ? ligne('home', d.bien.lots.length > 1 ? 'Lots' : 'Lot', `<span class="prop-texte">${d.bien.lots.map(l => escapeHtml(libelleLotCopropriete(l, d.bien.tantiemesTotal))).join(' · ')}</span>`, null, 'prop-pleine') : ''}
        ${ligne('banknote', 'Prix', saisie('prix', d.prixVente ? formaterPrix(d.prixVente) : '', 'changerPrixVente', ' inputmode="numeric"'), `prix-${d.id}`)}
        ${ligne('package', 'Dont mobilier', saisie('mobilier', d.prixMobilier ? formaterPrix(d.prixMobilier) : '', 'changerPrixMobilier', ' inputmode="numeric" title="Part du prix qui porte sur des meubles : elle sort de l\'assiette des droits de mutation (frais d\'acte)."', 'Aucun') + boutonLireMobilier, `mobilier-${d.id}`, siVide(!d.prixMobilier).trim())}
        ${ligne('lock', 'Séquestre', saisie('depot', d.depotGarantie ? formaterPrix(d.depotGarantie) : '', 'changerDepotGarantie', ' inputmode="numeric" title="Montant séquestré (dépôt de garantie)"'), `depot-${d.id}`, siVide(!d.depotGarantie).trim())}
        ${ligne('shield', 'Versé à', saisie('sequestre', d.sequestreDepot, 'changerSequestreDepot', ' title="Entre les mains de qui l\'acquéreur verse le dépôt : l\'office, l\'agence, la CARPA…"'), `sequestre-${d.id}`, siVide(!d.sequestreDepot).trim())}
        ${ligne('trend-up', 'Financement', financement)}
        ${d.honoraires && !d.honoraires.direct ? ligne('users', 'Négociation', `<span class="prop-texte">${escapeHtml(libelleHonoraires(d.honoraires).replace(/^Négociée par /, ''))}</span>`, null, 'prop-pleine') : ''}
        ${d.fondsTravaux ? ligne('package', 'Fonds de travaux', `<span class="prop-texte">${escapeHtml(libelleFondsTravaux(d.fondsTravaux))}</span>`, null, 'prop-pleine') : ''}
      </dl>
      <dl class="fiche-proprietes">
        ${ligne('scale', 'Notaire vendeur', notaire('vendeur', d.notaireVendeur), `not-vendeur-${d.id}`, 'prop-pleine' + siVide(!d.notaireVendeur && d.coteInstrumentaire !== 'vendeur' && !nonPlaces.length))}
        ${ligne('scale', 'Notaire acquéreur', notaire('acquereur', d.notaireAcquereur), `not-acquereur-${d.id}`, 'prop-pleine' + siVide(!d.notaireAcquereur && d.coteInstrumentaire !== 'acquereur' && !nonPlaces.length))}
        ${nonPlaces.length ? ligne('scale', 'Lus, à placer', `<span class="notaires-a-placer">${nonPlaces.map(n => `<span class="notaires-a-placer-ligne"><span class="prop-texte">${escapeHtml(n.nom)}${n.role === 'instrumentaire' ? ' <span class="hint">· reçoit l’acte</span>' : n.role === 'participant' ? ' <span class="hint">· participe</span>' : ''}</span>
          <button type="button" class="lien-action" onclick="placerNotaireFiche('${escapeOnclickArg(d.id)}', ${detectes.findIndex(x => x.nom === n.nom)}, 'vendeur')">Vendeur</button>
          <button type="button" class="lien-action" onclick="placerNotaireFiche('${escapeOnclickArg(d.id)}', ${detectes.findIndex(x => x.nom === n.nom)}, 'acquereur')">Acquéreur</button>
          <button type="button" class="lien-action" onclick="placerNotaireFiche('${escapeOnclickArg(d.id)}', ${detectes.findIndex(x => x.nom === n.nom)}, 'deux')">Les deux</button></span>`).join('')}</span>`, null, 'prop-pleine') : ''}
        ${emailConfrereVendeur}
        ${telConfrereVendeur}
        ${emailParticipant}
        ${telParticipant}
        ${ligne('flag', 'Notre étude', ligneRole)}
      </dl>
      <datalist id="${listeId}" data-base="${escapeAttr(JSON.stringify(nomsDetectes))}">${optionsNotaires.map(n => `<option value="${escapeAttr(n)}"></option>`).join('')}</datalist>`;
    const ouvert = fichesChampsVidesOuverts.has(d.id);
    const bascule = nbVides
      ? `<wa-button appearance="outlined" type="button" class="bouton-ajout bouton-ajout-court fiche-completer${ouvert ? ' ouvert' : ''}" onclick="basculerChampsVidesFiche('${escapeOnclickArg(d.id)}')" aria-expanded="${ouvert}"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>${ouvert ? 'Masquer les champs vides' : `Compléter la fiche (${nbVides})`}</wa-button>`
      : '';
    // Ligne « Authentic » (étude 06/10 au soir : « sous Compléter la fiche ») : le dossier d'Authentic à reprendre, juste sous le bouton.
    // La ligne « À mettre à jour » (changements proposés par Authentic) y est aussi, au-dessus (étude 06/10 au soir : « oui aussi »).
    const ligneAuthentic = renderMajAuthentic(d, ligne) + renderCompleterAuthenticFiche(d, ligne);
    return `<div class="fiche-proprietes-bloc${ouvert ? ' champs-vides-ouverts' : ''}">${blocBien}${bascule}${ligneAuthentic ? `<dl class="fiche-proprietes fiche-authentic-completer">${ligneAuthentic}</dl>` : ''}</div>`;
  }

  // ---- Collaborateur du poste ----
  // Demandé par l'étude : adapter le tableau de bord à la personne qui l'ouvre. Un navigateur ne
  // peut lire ni le nom du PC ni la session Windows, et l'adresse IP d'un poste change sans
  // réservation dans la box : le collaborateur choisit donc UNE FOIS qui utilise ce poste, choix
  // retenu dans le navigateur (localStorage) et modifiable dans les Réglages ou depuis le tableau
  // de bord. Perdu seulement si les données du navigateur sont effacées, ou si CLAIRE est ouverte
  // par une autre adresse (localhost / IP : deux « sites » pour le navigateur) — CLAIRE repose
  // alors simplement la question, aucune donnée de dossier n'en dépend.
  // L'administrateur (Bastien ANGLUMENT, décision de l'étude) garde la vue de toute l'étude par
  // défaut ; les autres voient d'abord leurs propres dossiers, avec un bouton pour tout revoir.
  var CLE_UTILISATEUR_POSTE = 'claire-utilisateur-poste';
  var PREFIXE_DERNIERE_VISITE = 'claire-derniere-visite:';
  var ADMINISTRATEURS = ['Bastien ANGLUMENT'];
  var JOURS_RENDEZ_VOUS_DASHBOARD = 15;
  let utilisateurPoste = '';
  // null = vue par défaut selon le rôle ; true/false = choix fait avec la bascule du tableau de bord.
  let vueDashboardGlobale = null;
  // Date de la visite PRÉCÉDENTE de ce collaborateur sur ce poste (lue au démarrage, avant d'être
  // remplacée par celle d'aujourd'hui) : sert à « pièces arrivées depuis votre dernière visite ».
  let derniereVisitePrecedente = null;
  // Le filtre « Responsable » du Suivi n'est posé qu'à la première ouverture de la session : le
  // collaborateur doit pouvoir repasser sur « Tous » sans que CLAIRE le lui remette à chaque fois.
  let filtreSuiviPose = false;
  let questionPosteEcartee = false;

  function estAdministrateur(nom) { return ADMINISTRATEURS.indexOf(nom) !== -1; }

  // Écrans réservés à l'administrateur (étude 09/10 : « Relecture d'actes et Demander à CLAIRE que pour Bastien »).
  var ONGLETS_ADMINISTRATEUR = ['assistant', 'analyse-ia'];
  function ongletReserve(nom, utilisateur) { return ONGLETS_ADMINISTRATEUR.indexOf(nom) !== -1 && !estAdministrateur(utilisateur); }
  // Liens de la barre latérale réservés, montrés ou cachés selon le collaborateur du poste ; un écran réservé resté ouvert repart au tableau de bord.
  function majSidebarReservee() {
    const admin = estAdministrateur(utilisateurPoste);
    ONGLETS_ADMINISTRATEUR.forEach(nom => {
      const lien = document.getElementById('tab-' + nom);
      if (lien) lien.style.display = admin ? '' : 'none';
    });
    if (!admin && ongletReserve(ongletActuel, utilisateurPoste)) definirOnglet('dashboard');
  }

  // « Julie VASSELIN » → « Julie ». Pure.
  function prenomCollaborateur(nom) {
    const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
    if (!mots.length) return '';
    const prenom = mots.filter(m => m !== m.toUpperCase() || !/[A-ZÀ-Ý]/.test(m));
    return (prenom.length ? prenom : mots).join(' ');
  }

  // Pure : les dossiers que montre le tableau de bord. Sans collaborateur connu, ou en vue globale,
  // tout le portefeuille.
  function dossiersDuPerimetre(liste, utilisateur, global) {
    const l = Array.isArray(liste) ? liste : [];
    if (global || !utilisateur) return l.slice();
    return l.filter(d => d && d.responsable === utilisateur);
  }

  // Pure : la vue par défaut dépend du rôle, sauf choix explicite avec la bascule.
  function vueGlobalePour(utilisateur, choix) {
    if (!utilisateur) return true;
    if (choix === true || choix === false) return choix;
    return estAdministrateur(utilisateur);
  }

  function vueGlobaleDashboard() { return vueGlobalePour(utilisateurPoste, vueDashboardGlobale); }

  function isoAujourdhuiLocal() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  // Pure : les rendez-vous de signature des `jours` prochains jours, avec l'état des deux envois
  // qui doivent être partis avant (appel de fonds, projet d'acte). Aujourd'hui compris.
  function rendezVousProchains(dossiersActifs, aujourdhuiIso, jours) {
    const n = Number.isFinite(jours) ? jours : JOURS_RENDEZ_VOUS_DASHBOARD;
    const res = [];
    for (const d of dossiersActifs || []) {
      if (!d || !d.rendezVousSignature) continue;
      const j = ecartJours(aujourdhuiIso, d.rendezVousSignature);
      if (j === null || j < 0 || j > n) continue;
      res.push(rendezVousDepuisDossier(d, j));
    }
    return trierRendezVous(res);
  }

  function rendezVousDepuisDossier(d, jours) {
    return {
      dossier: d,
      date: d.rendezVousSignature,
      jours,
      heure: d.rendezVousSignatureHeure || '',
      heureFin: d.rendezVousSignatureHeureFin || '',
      lieu: d.rendezVousSignatureLieu || '',
      appelFondsEnvoye: echeanceValidee(d, 'appelFonds'),
      projetEnvoye: echeanceValidee(d, 'projetEnvoye')
    };
  }

  // Par date, puis par heure (un rendez-vous sans heure connue en fin de journée), puis par nom.
  function trierRendezVous(liste) {
    return liste.sort((a, b) => a.date.localeCompare(b.date)
      || (a.heure || '99').localeCompare(b.heure || '99')
      || String(a.dossier.nom).localeCompare(String(b.dossier.nom)));
  }

  // Pure : « 10 h 30 — 11 h 30 », « 10 h 30 », ou '' quand l'heure n'est pas connue.
  function plageHoraireRendezVous(heure, heureFin) {
    const f = (h) => (h ? h.replace(':', ' h ') : '');
    if (!heure) return '';
    return heureFin && heureFin !== heure ? `${f(heure)} — ${f(heureFin)}` : f(heure);
  }

  function effacerHoraireRendezVous(d) {
    d.rendezVousSignatureHeure = '';
    d.rendezVousSignatureHeureFin = '';
    d.rendezVousSignatureLieu = '';
    d.rendezVousSignatureCategories = [];
  }

  // Pure : les pièces trouvées APRÈS `depuisIso` (horodatage de la visite précédente).
  function piecesDepuisVisite(dossiersActifs, depuisIso) {
    if (!depuisIso) return [];
    const depuis = Date.parse(depuisIso);
    if (!Number.isFinite(depuis)) return [];
    const res = [];
    for (const d of dossiersActifs || []) {
      const dates = (d && d.piecesTrouveesLe) || {};
      for (const cle of Object.keys(dates)) {
        const t = Date.parse(dates[cle]);
        if (Number.isFinite(t) && t > depuis) res.push({ dossier: d, cle, le: dates[cle] });
      }
    }
    return res;
  }

  // Pure : la phrase de l'accueil. Ne dit que ce qui est non nul — une phrase de zéros ne dit rien.
  function resumeAccueilCollaborateur(c) {
    const x = c || {};
    const morceaux = [];
    const pl = (n, s, p) => `${n} ${n > 1 ? p : s}`;
    if (x.rendezVous) morceaux.push(pl(x.rendezVous, 'rendez-vous de signature', 'rendez-vous de signature') + ` dans les ${JOURS_RENDEZ_VOUS_DASHBOARD} jours`);
    if (x.echeances7) morceaux.push(pl(x.echeances7, 'échéance', 'échéances') + ' dans la semaine');
    if (x.piecesDepuisVisite) morceaux.push(pl(x.piecesDepuisVisite, 'pièce arrivée', 'pièces arrivées') + ' depuis votre dernière visite');
    if (!morceaux.length) return 'Rien d’urgent pour le moment.';
    const phrase = morceaux.length === 1 ? morceaux[0] : morceaux.slice(0, -1).join(', ') + ' et ' + morceaux[morceaux.length - 1];
    return phrase.charAt(0).toUpperCase() + phrase.slice(1) + '.';
  }

  function lireUtilisateurPoste() {
    let nom = '';
    try { nom = localStorage.getItem(CLE_UTILISATEUR_POSTE) || ''; } catch (e) { nom = ''; }
    return RESPONSABLES.indexOf(nom) !== -1 ? nom : '';
  }

  // Lit la visite précédente de ce collaborateur puis enregistre celle d'aujourd'hui.
  function enregistrerVisite(nom) {
    derniereVisitePrecedente = null;
    if (!nom) return;
    const cle = PREFIXE_DERNIERE_VISITE + nom;
    try {
      derniereVisitePrecedente = localStorage.getItem(cle) || null;
      ecrireLocal(cle, new Date().toISOString());
    } catch (e) { /* navigation privée : pas bloquant */ }
  }

  function definirUtilisateurPoste(nom) {
    const valide = RESPONSABLES.indexOf(nom) !== -1 ? nom : '';
    utilisateurPoste = valide;
    vueDashboardGlobale = null;
    dispositionWidgets = null;   // disposition des widgets propre à chaque collaborateur
    filtreSuiviPose = false;
    try {
      if (valide) ecrireLocal(CLE_UTILISATEUR_POSTE, valide);
      else localStorage.removeItem(CLE_UTILISATEUR_POSTE);
    } catch (e) { /* pas bloquant */ }
    enregistrerVisite(valide);
    const select = document.getElementById('reglages-utilisateur-poste');
    if (select) select.value = valide;
    const resp = document.getElementById('f-responsable');
    if (resp && !resp.value && valide) resp.value = valide;
    // Suivi déjà ouvert : le filtre passe tout de suite au nouveau collaborateur (« Tous » sans poste).
    const filtreSuivi = document.getElementById('filtre-responsable');
    if (filtreSuivi) filtreSuivi.value = '';
    const ongletSuivi = document.getElementById('tab-suivi');
    if (ongletSuivi && ongletSuivi.classList.contains('actif')) appliquerFiltreSuiviCollaborateur();
    majSidebarReservee();
    fermerChoixPoste();
    ajoutRappelOuvert = false;
    rappelsPerso = [];
    rappelsPersoCharges = false;
    dossiersConsultesCollaborateur = null;   // la liste du nouveau collaborateur arrive avec ses préférences
    render();
    chargerRappelsPerso();
    chargerPreferencesCollaborateur();
  }

  function initUtilisateurPoste() {
    utilisateurPoste = lireUtilisateurPoste();
    majSidebarReservee();
    enregistrerVisite(utilisateurPoste);
    const select = document.getElementById('reglages-utilisateur-poste');
    if (select) {
      select.innerHTML = '<option value="">— Non défini —</option>'
        + RESPONSABLES.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('');
      select.value = utilisateurPoste;
    }
    const resp = document.getElementById('f-responsable');
    if (resp && !resp.value && utilisateurPoste) resp.value = utilisateurPoste;
    const modeEmail = document.getElementById('reglages-mode-email');
    if (modeEmail) modeEmail.value = modeEmailPoste();
    const ouvertureAuto = document.getElementById('reglages-ouverture-auto');
    if (ouvertureAuto) ouvertureAuto.checked = ouvertureAutoActive();
    const sectionApplication = document.getElementById('reglages-section-application');
    if (sectionApplication) sectionApplication.style.display = estAdresseLocale(location.hostname) ? 'none' : '';
  }

  function ouvrirChoixPoste() {
    const overlay = document.getElementById('poste-overlay');
    if (!overlay) return;
    const liste = document.getElementById('poste-choix-liste');
    liste.innerHTML = RESPONSABLES.map(n => `
      <button type="button" class="poste-choix-btn${n === utilisateurPoste ? ' actif' : ''}" onclick="definirUtilisateurPoste('${escapeOnclickArg(n)}')">
        <span class="poste-choix-nom">${escapeHtml(n)}</span>
        ${estAdministrateur(n) ? '<span class="poste-choix-role">Vue de toute l’étude</span>' : ''}
      </button>`).join('');
    overlay.style.display = 'flex';
  }

  function fermerChoixPoste() {
    const overlay = document.getElementById('poste-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function ecarterChoixPoste() {
    questionPosteEcartee = true;
    fermerChoixPoste();
  }

  function demanderUtilisateurPosteSiInconnu() {
    if (!utilisateurPoste && !questionPosteEcartee) ouvrirChoixPoste();
  }

  function basculerVueDashboard(globale) {
    vueDashboardGlobale = !!globale;
    render();
  }

  // Filtre « Responsable » du Suivi posé sur le collaborateur du poste, une seule fois par session
  // (étude, 01/10 : « quand un collaborateur est sur sa session, présélectionner sa catégorie » —
  // l'administrateur compris, « Tous » reste à un clic). Un choix fait à la main ensuite est gardé ;
  // changer de collaborateur repose le filtre sur le nouveau (definirUtilisateurPoste).
  // Pure : le responsable pré-réglé dans le filtre du Suivi pour le collaborateur du poste — le sien,
  // sauf pour l'administrateur, qui voit tous les dossiers par défaut (étude, 02/10 : « remets-moi
  // l'affichage par défaut de tous les dossiers pour Bastien »).
  function filtreSuiviParDefaut(utilisateur) {
    return utilisateur && !estAdministrateur(utilisateur) ? utilisateur : '';
  }

  function appliquerFiltreSuiviCollaborateur() {
    if (filtreSuiviPose || !utilisateurPoste) return;
    const f = document.getElementById('filtre-responsable');
    if (!f) return;
    filtreSuiviPose = true;
    f.value = filtreSuiviParDefaut(utilisateurPoste);
  }

  // Barre du Suivi collée en haut (étude 06/10) : une fois collée, les filtres se replient (la recherche et les statuts restent)
  // et se rouvrent au survol ou au focus de la barre — voir `.suivi-barre.collee` dans style.css. Le repli retire de la hauteur
  // de la barre : `margin-bottom` la rend à la liste, qui ne bouge donc pas sous les yeux.
  var barreSuiviColleeInitialisee = false;
  function majBarreSuiviCollee() {
    const barre = document.getElementById('suivi-barre');
    const sentinelle = document.getElementById('suivi-barre-sentinelle');
    const filtres = barre ? barre.querySelector('.suivi-barre-filtres') : null;
    if (!barre || !sentinelle || !filtres || !barre.offsetParent) return;
    const colleePossible = getComputedStyle(barre).position === 'sticky';
    const collee = colleePossible && sentinelle.getBoundingClientRect().top < (parseFloat(getComputedStyle(barre).top) || 12);
    if (collee === barre.classList.contains('collee')) return;
    if (collee) {
      const hauteur = filtres.offsetHeight;
      barre.style.marginBottom = `${20 + hauteur}px`;
    } else {
      barre.style.marginBottom = '';
    }
    barre.classList.toggle('collee', collee);
  }

  function initBarreSuiviCollee() {
    if (barreSuiviColleeInitialisee) return;
    barreSuiviColleeInitialisee = true;
    let attente = false;
    const planifier = () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; majBarreSuiviCollee(); });
    };
    document.addEventListener('scroll', planifier, { capture: true, passive: true });
    window.addEventListener('resize', () => {
      const barre = document.getElementById('suivi-barre');
      if (barre && barre.classList.contains('collee')) { barre.classList.remove('collee'); barre.style.marginBottom = ''; }
      planifier();
    });
  }

  function renderAccueilDashboard(perimetreActifs, stats) {
    const eyebrow = document.getElementById('dash-date-jour');
    if (eyebrow) eyebrow.textContent = libelleDateDuJour();
    const titre = document.getElementById('dash-titre');
    const bloc = document.getElementById('dash-accueil');
    if (!titre || !bloc) return;
    if (!utilisateurPoste) {
      titre.textContent = 'Vue d’ensemble';
      bloc.innerHTML = `<button type="button" class="lien-discret" onclick="ouvrirChoixPoste()">Qui utilise ce poste ? Choisir</button>`;
      return;
    }
    titre.textContent = `Bonjour ${prenomCollaborateur(utilisateurPoste)}`;
    const global = vueGlobaleDashboard();
    const resume = resumeAccueilCollaborateur({
      rendezVous: rendezVousProchains(perimetreActifs, isoAujourdhuiLocal()).length,
      echeances7: stats.urgents,
      piecesDepuisVisite: piecesDepuisVisite(perimetreActifs, derniereVisitePrecedente).length
    });
    bloc.innerHTML = `
      <p class="dash-accueil-resume">${escapeHtml(resume)}</p>
      <div class="dash-accueil-actions">
        <wa-button-group class="vue-bascule" label="Dossiers affichés">
          <wa-button appearance="outlined" size="s" type="button" class="vue-bascule-btn${global ? '' : ' actif'}" aria-pressed="${!global}" onclick="basculerVueDashboard(false)">Mes dossiers</wa-button>
          <wa-button appearance="outlined" size="s" type="button" class="vue-bascule-btn${global ? ' actif' : ''}" aria-pressed="${global}" onclick="basculerVueDashboard(true)">Tous les dossiers</wa-button>
        </wa-button-group>
        <button type="button" class="lien-discret" onclick="ouvrirChoixPoste()">Pas ${escapeHtml(prenomCollaborateur(utilisateurPoste))} ? Changer</button>
        <button type="button" class="widgets-personnaliser" onclick="ouvrirGalerieWidgets()" title="Ajouter ou retirer des widgets">${icone('list')}Widgets</button>
        <button type="button" class="widgets-personnaliser${modeEditionWidgets ? ' actif' : ''}" onclick="basculerEditionWidgets()" aria-pressed="${modeEditionWidgets}">${modeEditionWidgets ? `${icone('check')}Terminé` : `${icone('layout')}Personnaliser`}</button>
      </div>`;
  }

  // ---- Widgets du tableau de bord (demandé par l'étude le 29/09 : « comme les widgets iOS ») ----
  // Grille de 4 colonnes (2 sur un écran étroit) à hauteur de rangée fixe, comme sur iPhone. Deux
  // réglages par carte (étude, 29/09 au soir) : la LARGEUR (petit = 1 colonne, moyen = 2, grand =
  // toute la ligne) et la HAUTEUR (1, 2 ou 3 rangées). Toutes les cartes acceptent toutes les
  // combinaisons ; leur CONTENU suit la place (varianteWidget : chiffre clé sur une case, liste
  // compacte sur une rangée, détail dès deux rangées)
  // — jamais une carte étirée avec du vide dedans (étude, 29/09 au soir). Les listes sont coupées à
  // ce qui tient réellement (ajusterWidgets), avec « Voir N de plus ». En mode « Personnaliser » :
  // glisser-déposer au pointeur (souris ou doigt), taille, flèches au clavier, masquer ; un appui
  // long sur le titre d'une carte ouvre aussi ce mode. Disposition propre à chaque collaborateur :
  // préférence « widgets » en base (voir routes/preferences.js), cache localStorage.
  // Disposition par défaut (étude, 29/09 au soir : « les widgets importants en premier, en un beau
  // rectangle ») : Aujourd'hui (le travail du jour) en grand carré à gauche, l'Agenda à côté, les deux
  // chiffres clés (dossiers ouverts, pièces arrivées) dessous, puis Avancement et Activité côte à côte.
  // 4 colonnes × 4 rangées sans un trou — et 2 × 8 sur téléphone (voir placementWidgets, testé).
  // Changer cette disposition = incrémenter VERSION_DISPOSITION_WIDGETS : chaque collaborateur y est
  // ramené une fois, puis garde ses réglages.
  var VERSION_DISPOSITION_WIDGETS = 2;
  var TAILLES_WIDGET = ['petit', 'moyen', 'grand'];
  var HAUTEURS_WIDGET = [1, 2, 3];
  // enTete : un widget ajouté après coup, placé en tête (et non à la fin) chez qui avait déjà sa disposition.
  var WIDGETS_DASHBOARD = [
    { id: 'assistant', titre: 'Demander à CLAIRE', tailles: TAILLES_WIDGET, defaut: 'grand', hauteur: 1, icone: 'sparkle', enTete: true, description: 'Une question ou un geste en une phrase : la réponse s’affiche sur la page « Demander à CLAIRE ».' },
    { id: 'aujourdhui', titre: 'Aujourd’hui', tailles: TAILLES_WIDGET, defaut: 'moyen', hauteur: 2, icone: 'sun', description: 'Ce qui est à faire aujourd’hui sur vos dossiers, et vos rappels.' },
    { id: 'agenda', titre: 'Agenda', tailles: TAILLES_WIDGET, defaut: 'moyen', hauteur: 1, icone: 'calendar', description: 'La semaine de l’office et les prochaines signatures.' },
    { id: 'portefeuille', titre: 'Dossiers ouverts', tailles: TAILLES_WIDGET, defaut: 'petit', hauteur: 1, icone: 'folder', description: 'Les dossiers en cours, par statut, et les signatures du mois.' },
    { id: 'pieces', titre: 'Dernières pièces', tailles: TAILLES_WIDGET, defaut: 'petit', hauteur: 1, icone: 'file-text', description: 'Les pièces arrivées sur le NAS ou rangées par Claire Scan.' },
    { id: 'avancement', titre: 'Avancement des dossiers', tailles: TAILLES_WIDGET, defaut: 'moyen', hauteur: 2, icone: 'list-check', description: 'Où en est chaque dossier : étapes, pièces, prochaine échéance.' },
    { id: 'activite', titre: 'Activité de l’étude', tailles: TAILLES_WIDGET, defaut: 'moyen', hauteur: 2, icone: 'users', description: 'Ce que font les collaborateurs et ce que CLAIRE relève, en direct.' },
    { id: 'statistiques', titre: 'Statistiques', tailles: TAILLES_WIDGET, defaut: 'grand', hauteur: 1, icone: 'bar-chart', description: 'Délais depuis l’avant-contrat (prêt, préemption, signature), avant-contrats signés par mois, et ventes, successions et donations de l’année d’après l’agenda.' }
  ];
  var NOMS_TAILLE_WIDGET = { petit: 'Étroit (1 colonne)', moyen: 'Moyen (2 colonnes)', grand: 'Large (toute la ligne)' };
  var NOMS_HAUTEUR_WIDGET = { 1: 'Basse (1 rangée)', 2: 'Moyenne (2 rangées)', 3: 'Haute (3 rangées)' };
  var CLE_WIDGETS_LOCAL = 'claire-widgets-v2:';
  let modeEditionWidgets = false;
  let dispositionWidgets = null;   // null = pas encore chargée : disposition par défaut

  // Pure : la disposition complète à partir d'une préférence enregistrée (éventuellement partielle,
  // ancienne ou abîmée). Ordre enregistré pour les widgets connus, largeur et hauteur ramenées à des
  // valeurs permises, widgets absents (nouveaux) ajoutés à la fin à leur taille par défaut. Une
  // préférence d'avant la hauteur réglable (pas de champ `hauteur`) : « grand » y voulait dire
  // 2 colonnes × 2 rangées, il devient moyen × 2 ; le reste garde une rangée.
  function dispositionWidgetsDepuis(preference) {
    const parId = new Map(WIDGETS_DASHBOARD.map(w => [w.id, w]));
    const out = [];
    const vus = new Set();
    (Array.isArray(preference) ? preference : []).forEach(p => {
      const def = p && parId.get(p.id);
      if (!def || vus.has(p.id)) return;
      vus.add(p.id);
      let taille = def.tailles.indexOf(p.taille) !== -1 ? p.taille : def.defaut;
      let hauteur = HAUTEURS_WIDGET.indexOf(p.hauteur) !== -1 ? p.hauteur : def.hauteur;
      if (!('hauteur' in p) && def.tailles.indexOf(p.taille) !== -1) {
        hauteur = p.taille === 'grand' ? 2 : 1;
        if (p.taille === 'grand') taille = 'moyen';
      }
      out.push({ id: p.id, taille, hauteur, masque: p.masque === true });
    });
    const enTete = [];
    WIDGETS_DASHBOARD.forEach(def => {
      if (vus.has(def.id)) return;
      const w = { id: def.id, taille: def.defaut, hauteur: def.hauteur, masque: false };
      if (def.enTete && out.length) enTete.push(w); else out.push(w);
    });
    return enTete.concat(out);
  }

  // Pure : `id` déplacé à la position `index` parmi les widgets (bornée), les autres dans le même ordre.
  function deplacerWidgetDans(dispo, id, index) {
    const liste = dispo.slice();
    const i = liste.findIndex(w => w.id === id);
    if (i === -1) return liste;
    const [w] = liste.splice(i, 1);
    const cible = Math.max(0, Math.min(liste.length, index));
    liste.splice(cible, 0, w);
    return liste;
  }

  // Pure : un pas vers l'avant ou l'arrière parmi les widgets VISIBLES (les masqués ne comptent pas).
  function decalerWidgetDans(dispo, id, pas) {
    const visibles = dispo.filter(w => !w.masque);
    const i = visibles.findIndex(w => w.id === id);
    const voisin = visibles[i + pas];
    if (i === -1 || !voisin) return dispo.slice();
    return deplacerWidgetDans(dispo, id, dispo.findIndex(w => w.id === voisin.id));
  }

  // Pure : la disposition réordonnée selon une liste d'identifiants (l'ordre du DOM après un
  // glisser-déposer) ; un identifiant inconnu est ignoré, un widget absent de la liste garde sa
  // place relative à la fin.
  function dispositionDansOrdre(dispo, ids) {
    const parId = new Map(dispo.map(w => [w.id, w]));
    const out = [];
    (ids || []).forEach(id => { if (parId.has(id)) { out.push(parId.get(id)); parId.delete(id); } });
    dispo.forEach(w => { if (parId.has(w.id)) out.push(w); });
    return out;
  }

  function dispositionWidgetsCourante() {
    if (!dispositionWidgets) {
      let locale = null;
      try { locale = JSON.parse(localStorage.getItem(CLE_WIDGETS_LOCAL + utilisateurPoste) || 'null'); } catch (e) { locale = null; }
      dispositionWidgets = dispositionWidgetsDepuis(locale);
    }
    return dispositionWidgets;
  }

  // Pure : la présentation du contenu selon la place — 'petit' (une seule case : le chiffre clé),
  // 'moyen' (une rangée : liste compacte), 'grand' (deux rangées ou plus : le détail).
  function varianteWidget(taille, hauteur) {
    if ((hauteur || 1) >= 2) return 'grand';
    return taille === 'petit' ? 'petit' : 'moyen';
  }

  // Présentation courante d'une carte ('petit' | 'moyen' | 'grand') : les fonctions de rendu en dépendent.
  function presentationWidget(id) {
    const w = dispositionWidgetsCourante().find(x => x.id === id);
    return w ? varianteWidget(w.taille, w.hauteur) : 'moyen';
  }

  function enregistrerDispositionWidgets(dispo) {
    dispositionWidgets = dispo;
    try { localStorage.setItem(CLE_WIDGETS_LOCAL + utilisateurPoste, JSON.stringify(dispo)); } catch (e) { /* cache facultatif */ }
    enregistrerPreferenceCollaborateur({ widgets: dispo, widgetsVersion: VERSION_DISPOSITION_WIDGETS });
    render();   // le contenu des cartes dépend de leur taille
  }

  // Appliquée par chargerPreferencesCollaborateur : la disposition enregistrée sur le serveur.
  function appliquerDispositionWidgets(preference) {
    dispositionWidgets = dispositionWidgetsDepuis(preference);
    try { localStorage.setItem(CLE_WIDGETS_LOCAL + utilisateurPoste, JSON.stringify(dispositionWidgets)); } catch (e) { /* cache facultatif */ }
    render();
  }

  function basculerEditionWidgets(forcer) {
    modeEditionWidgets = typeof forcer === 'boolean' ? forcer : !modeEditionWidgets;
    render();
  }

  function changerTailleWidget(id, taille) {
    enregistrerDispositionWidgets(dispositionWidgetsCourante().map(w => w.id === id ? Object.assign({}, w, { taille }) : w));
  }

  function changerHauteurWidget(id, hauteur) {
    enregistrerDispositionWidgets(dispositionWidgetsCourante().map(w => w.id === id ? Object.assign({}, w, { hauteur }) : w));
  }

  function masquerWidget(id, masque) {
    enregistrerDispositionWidgets(dispositionWidgetsCourante().map(w => w.id === id ? Object.assign({}, w, { masque }) : w));
    renderGalerieWidgets();
  }

  // ---- Liste des widgets (étude, 01/10 : « supprimer un widget et une liste de widgets à ajouter ou
  // supprimer ») : tous les widgets, affichés ou retirés, avec Ajouter / Retirer. Retirer ne perd que
  // la place sur le tableau de bord : le widget revient à sa taille d'avant quand on le rajoute. ----
  // Pure : les lignes de la liste, dans l'ordre du catalogue — affichés d'abord, puis retirés.
  // « Demander à CLAIRE » n'est proposé qu'à l'administrateur (étude 09/10).
  function lignesGalerieWidgets(dispo, utilisateur) {
    const parId = new Map((dispo || []).map(w => [w.id, w]));
    const lignes = WIDGETS_DASHBOARD.filter(def => !(def.id === 'assistant' && !estAdministrateur(utilisateur)))
      .map(def => ({ def, affiche: !(parId.get(def.id) || {}).masque }));
    return lignes.filter(l => l.affiche).concat(lignes.filter(l => !l.affiche));
  }

  function ouvrirGalerieWidgets() {
    const overlay = document.getElementById('widgets-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    renderGalerieWidgets();
  }

  function fermerGalerieWidgets() {
    const overlay = document.getElementById('widgets-overlay');
    if (overlay) overlay.style.display = 'none';
  }
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('widgets-overlay');
    if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') fermerGalerieWidgets();
  });

  function renderGalerieWidgets() {
    const overlay = document.getElementById('widgets-overlay');
    const liste = document.getElementById('widgets-galerie-liste');
    if (!overlay || !liste || overlay.style.display === 'none') return;
    const lignes = lignesGalerieWidgets(dispositionWidgetsCourante(), utilisateurPoste);
    const nbAffiches = lignes.filter(l => l.affiche).length;
    const titre = (texte, n) => `<div class="widgets-galerie-groupe">${texte} <span class="jour-onglet-nb">${n}</span></div>`;
    const ligne = ({ def, affiche }) => `
      <li class="widgets-galerie-ligne${affiche ? '' : ' retire'}">
        <span class="widgets-galerie-icone" aria-hidden="true">${icone(def.icone || 'layout')}</span>
        <span class="widgets-galerie-texte"><b>${escapeHtml(def.titre)}</b><span>${escapeHtml(def.description || '')}</span></span>
        ${affiche
          ? `<wa-button appearance="outlined" class="secondary widgets-galerie-retirer" onclick="masquerWidget('${escapeOnclickArg(def.id)}', true)" aria-label="Retirer ${escapeAttr(def.titre)} du tableau de bord">${icone('x')}Retirer</wa-button>`
          : `<wa-button appearance="outlined" type="button" class="bouton-ajout bouton-ajout-court" onclick="masquerWidget('${escapeOnclickArg(def.id)}', false)" aria-label="Ajouter ${escapeAttr(def.titre)} au tableau de bord"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>Ajouter</wa-button>`}
      </li>`;
    const affiches = lignes.filter(l => l.affiche), retires = lignes.filter(l => !l.affiche);
    liste.innerHTML = `${titre('Sur le tableau de bord', nbAffiches)}
      ${affiches.length ? `<ul class="widgets-galerie">${affiches.map(ligne).join('')}</ul>` : '<p class="jour-vide">Aucun widget affiché.</p>'}
      ${retires.length ? `${titre('À ajouter', retires.length)}<ul class="widgets-galerie">${retires.map(ligne).join('')}</ul>` : ''}`;
  }

  function decalerWidget(id, pas) {
    enregistrerDispositionWidgets(decalerWidgetDans(dispositionWidgetsCourante(), id, pas));
  }

  function reinitialiserWidgets() {
    enregistrerDispositionWidgets(dispositionWidgetsDepuis(null));
    renderGalerieWidgets();
  }

  // Coque commune des cartes : en-tête (titre, précision, contrôles) et corps qui remplit le reste
  // de la tuile. o = { titre, sous?, droite?, corps, classe?, attributs?, presentation } — titre,
  // sous, droite et corps sont du HTML déjà échappé ; attributs : attributs HTML supplémentaires de
  // la carte (« data-filtre="…" »), déjà échappés.
  function carteWidget(o) {
    return `<div class="w-carte w-${o.presentation || 'moyen'}${o.classe ? ' ' + o.classe : ''}"${o.attributs ? ' ' + o.attributs : ''}>
      <div class="w-tete">
        <div class="w-tete-texte"><div class="w-titre">${o.titre}</div>${o.sous ? `<div class="w-sous">${o.sous}</div>` : ''}</div>
        ${o.droite ? `<div class="w-tete-droite">${o.droite}</div>` : ''}
      </div>
      <div class="w-corps">${o.corps}</div>
    </div>`;
  }

  // Lien « Voir N de plus » d'une liste ajustée : caché tant que tout tient (voir ajusterWidgets).
  function plusWidget(onclick) {
    return `<button type="button" class="w-plus lien-discret" style="display:none" onclick="${onclick}"></button>`;
  }

  // Remplit chaque carte avec ce qui tient réellement dans la tuile, sans jamais couper une ligne.
  // Une liste ajustable porte data-ajuster="N" (N petit = prioritaire) : les listes sont remplies
  // dans cet ordre, ligne par ligne, tant que le corps ne déborde pas — la liste principale d'abord,
  // puis les listes d'appoint (rappels, à venir, prochaines signatures…) dans la place restante.
  // Une liste coupée affiche « Voir N de plus » ; une section d'appoint vide disparaît avec son
  // titre ; data-min garde un minimum de lignes (le corps défile alors, plutôt que de rien montrer).
  // Éléments d'une liste ajustable qui ne comptent pas comme des lignes (jamais repliés) — et, hors
  // le lien « Voir N de plus », ce qui justifie de garder une section même sans ligne.
  var SELECTEUR_CONTENU_FIXE_WIDGET = '.w-fixe, .rappel-perso-ajout, .rappel-perso-form';
  var SELECTEUR_FIXE_WIDGET = '.w-plus, ' + SELECTEUR_CONTENU_FIXE_WIDGET;
  function ajusterWidgets() {
    const grille = document.getElementById('widgets-dashboard');
    if (!grille) return;
    grille.querySelectorAll('.widget').forEach(w => {
      if (w.style.display === 'none') return;
      const corps = w.querySelector('.w-corps');
      if (!corps) return;
      corps.classList.remove('w-defile');
      const deborde = () => corps.scrollHeight > corps.clientHeight + 1;
      const items = (l) => Array.from(l.children).filter(c => !c.matches(SELECTEUR_FIXE_WIDGET));
      const plusDe = (l) => { const sec = l.closest('.w-section'); return l.querySelector(':scope > .w-plus') || (sec && sec.querySelector('.w-plus')); };
      const listes = Array.from(corps.querySelectorAll('[data-ajuster]'))
        .map((l, i) => ({ l, i, prio: Number(l.dataset.ajuster) || 0, sec: l.closest('.w-section') }))
        .sort((a, b) => a.prio - b.prio || a.i - b.i);
      // Tout replier, puis remplir.
      listes.forEach(x => {
        x.l.classList.remove('w-coupee');
        if (x.sec) x.sec.classList.remove('w-coupee');
        items(x.l).forEach(c => { c.style.display = 'none'; });
        const plus = plusDe(x.l);
        if (plus) plus.style.display = 'none';
        if (x.sec) x.sec.style.display = 'none';
      });
      listes.forEach(x => {
        const tous = items(x.l);
        // data-defiler (agenda du jour, étude 02/10 : « voir toute la journée ») : la liste n'est jamais
        // coupée — elle défile dans la place qui reste, ouverte sur le rendez-vous en cours ou à venir.
        if (x.l.hasAttribute('data-defiler')) {
          x.l.style.maxHeight = ''; x.l.style.overflowY = '';
          if (x.sec) x.sec.style.display = '';
          tous.forEach(c => { c.style.display = ''; });
          const plusListe = plusDe(x.l);
          if (plusListe) plusListe.style.display = 'none';
          if (deborde()) {
            const exces = corps.scrollHeight - corps.clientHeight;
            x.l.style.maxHeight = Math.max(48, x.l.clientHeight - exces) + 'px';
            x.l.style.overflowY = 'auto';
            const cible = x.l.querySelector('.ajd-en-cours, .ajd-a-venir');
            const premier = tous[0];
            if (cible && premier) x.l.scrollTop = cible.offsetTop - premier.offsetTop;
          }
          return;
        }
        const min = Number(x.l.dataset.min || 0);
        if (x.sec) {
          x.sec.style.display = '';
          // data-garder : une section en cours de saisie n'est jamais masquée (le corps défile).
          if (deborde() && !min && !x.l.hasAttribute('data-garder')) { x.sec.style.display = 'none'; return; }
        }
        let montres = 0;
        for (const c of tous) {
          c.style.display = '';
          if (deborde() && montres >= min) { c.style.display = 'none'; break; }
          montres++;
        }
        const caches = tous.length - montres;
        const plus = plusDe(x.l);
        if (caches > 0 && plus) {
          plus.style.display = '';
          plus.textContent = `Voir ${caches} de plus`;
          // Le lien prend une ligne : on rend la dernière si besoin.
          while (deborde() && montres > min) {
            tous[montres - 1].style.display = 'none';
            montres--;
            plus.textContent = `Voir ${tous.length - montres} de plus`;
          }
          // Plus de place pour le lien ET une ligne : une ligne d'appoint vaut mieux que le lien seul.
          if (!montres) {
            plus.style.display = 'none';
            for (const c of tous) {
              c.style.display = '';
              if (deborde()) { c.style.display = 'none'; break; }
              montres++;
            }
          }
        }
        // Liste coupée : ses lignes se répartissent la hauteur restante (pas de vide en bas).
        x.l.classList.toggle('w-coupee', montres < tous.length && montres > 0);
        if (x.sec) x.sec.classList.toggle('w-coupee', montres < tous.length && montres > 0);
        // Un intitulé de groupe (« Hier ») resté seul en fin de liste part aussi.
        const der = tous[montres - 1];
        if (der && montres > 1 && der.classList.contains('act-groupe')) der.style.display = 'none';
        // Section d'appoint sans aucune ligne ni contenu fixe : elle disparaît avec son titre.
        if (x.sec && !montres && !x.sec.querySelector(SELECTEUR_CONTENU_FIXE_WIDGET)) x.sec.style.display = 'none';
      });
      if (deborde()) corps.classList.add('w-defile');
    });
  }

  let ajustementWidgetsPrevu = false;
  function planifierAjustementWidgets() {
    if (ajustementWidgetsPrevu || typeof requestAnimationFrame !== 'function') return;
    ajustementWidgetsPrevu = true;
    requestAnimationFrame(() => { ajustementWidgetsPrevu = false; ajusterWidgets(); });
  }

  // Contrôles d'un widget en mode Personnaliser, posés PAR-DESSUS la carte (elle garde sa taille) :
  // pastille « − » (masquer) en haut à gauche, flèches sur les bords (clavier), et un petit panneau
  // « Largeur / Hauteur » en bas. Chaque bouton dessine ce qu'il donne : 1, 2 ou 4 colonnes pleines
  // sur 4 ; 1, 2 ou 3 rangées pleines sur 3.
  var CASES_TAILLE_WIDGET = { petit: 1, moyen: 2, grand: 4 };
  function barreEditionWidget(def, w, rang, total) {
    const cases = (n, sur, sens) => `<span class="widget-glyphe widget-glyphe-${sens}" aria-hidden="true">${Array.from({ length: sur }, (_, i) => `<i${i < n ? ' class="plein"' : ''}></i>`).join('')}</span>`;
    const largeurs = def.tailles.map(t => `<button type="button" class="widget-taille${w.taille === t ? ' actif' : ''}" aria-pressed="${w.taille === t}" onclick="changerTailleWidget('${escapeOnclickArg(def.id)}', '${t}')" title="Largeur : ${NOMS_TAILLE_WIDGET[t]}" aria-label="Largeur ${NOMS_TAILLE_WIDGET[t]}">${cases(CASES_TAILLE_WIDGET[t], 4, 'l')}</button>`).join('');
    const hauteurs = HAUTEURS_WIDGET.map(h => `<button type="button" class="widget-taille${w.hauteur === h ? ' actif' : ''}" aria-pressed="${w.hauteur === h}" onclick="changerHauteurWidget('${escapeOnclickArg(def.id)}', ${h})" title="Hauteur : ${NOMS_HAUTEUR_WIDGET[h]}" aria-label="Hauteur ${NOMS_HAUTEUR_WIDGET[h]}">${cases(h, 3, 'h')}</button>`).join('');
    return `<button type="button" class="widget-retirer" onclick="masquerWidget('${escapeOnclickArg(def.id)}', true)" title="Retirer du tableau de bord" aria-label="Retirer ${escapeAttr(def.titre)} du tableau de bord">${icone('x')}</button>
      <wa-button appearance="plain" size="s" type="button" class="bouton-icone widget-outil widget-fleche widget-fleche-avant" onclick="decalerWidget('${escapeOnclickArg(def.id)}', -1)" ${rang === 0 ? 'disabled' : ''} title="Avancer" aria-label="Avancer ${escapeAttr(def.titre)}">${icone('chevron-left')}</wa-button>
      <wa-button appearance="plain" size="s" type="button" class="bouton-icone widget-outil widget-fleche widget-fleche-apres" onclick="decalerWidget('${escapeOnclickArg(def.id)}', 1)" ${rang === total - 1 ? 'disabled' : ''} title="Reculer" aria-label="Reculer ${escapeAttr(def.titre)}">${icone('chevron-right')}</wa-button>
      <div class="widget-barre">
        <div class="widget-reglage" role="group" aria-label="Largeur du widget ${escapeAttr(def.titre)}"><span class="widget-reglage-lib">Largeur</span>${largeurs}</div>
        <div class="widget-reglage" role="group" aria-label="Hauteur du widget ${escapeAttr(def.titre)}"><span class="widget-reglage-lib">Hauteur</span>${hauteurs}</div>
      </div>`;
  }

  // Place les widgets (ordre, taille, visibilité) sans toucher à leur contenu : les fonctions de
  // rendu de chaque carte écrivent dans leurs propres conteneurs, déplacés tels quels.
  function renderWidgetsDashboard() {
    const grille = document.getElementById('widgets-dashboard');
    if (!grille) return;
    const dispo = dispositionWidgetsCourante();
    const defs = new Map(WIDGETS_DASHBOARD.map(w => [w.id, w]));
    const visibles = dispo.filter(w => !w.masque);
    grille.classList.toggle('edition', modeEditionWidgets);
    dispo.forEach(w => {
      const el = grille.querySelector(`.widget[data-widget="${w.id}"]`);
      if (!el) return;
      grille.appendChild(el);   // l'ordre du DOM est l'ordre d'affichage
      el.dataset.taille = w.taille;
      el.dataset.hauteur = String(w.hauteur || 1);
      // Sans contenu (le bloc intérieur est masqué par sa fonction de rendu) : pas de place prise,
      // sauf en personnalisation où il reste visible pour être rangé.
      const interieur = el.querySelector('.dash-bloc');
      const vide = !!interieur && interieur.style.display === 'none';
      const reserve = w.id === 'assistant' && !estAdministrateur(utilisateurPoste);   // « Demander à CLAIRE » : Bastien seulement
      el.style.display = w.masque || reserve || (vide && !modeEditionWidgets) ? 'none' : '';
      el.classList.toggle('widget-vide', vide);
      el.querySelectorAll(':scope > .widget-barre, :scope > .widget-retirer, :scope > .widget-fleche').forEach(x => x.remove());
      if (modeEditionWidgets && !w.masque) {
        el.insertAdjacentHTML('beforeend', barreEditionWidget(defs.get(w.id), w, visibles.indexOf(w), visibles.length));
      }
    });
    const masques = document.getElementById('widgets-masques');
    if (masques) {
      const liste = dispo.filter(w => w.masque);
      // Personnaliser, ou tableau de bord vidé : « Ajouter un widget » ouvre la liste des widgets.
      const montrer = modeEditionWidgets || !visibles.length;
      masques.innerHTML = montrer
        ? `<wa-button appearance="outlined" type="button" class="bouton-ajout bouton-ajout-court" onclick="ouvrirGalerieWidgets()"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>Ajouter un widget${liste.length ? ` (${liste.length})` : ''}</wa-button>
           ${modeEditionWidgets ? '<button type="button" class="lien-discret widgets-reinitialiser" onclick="reinitialiserWidgets()">Disposition d’origine</button>' : ''}`
        : '';
      masques.style.display = montrer ? '' : 'none';
    }
    planifierAjustementWidgets();
  }

  // ---- Glisser-déposer au pointeur (souris, doigt, stylet) ----
  // En mode Personnaliser, on attrape une carte n'importe où (hors boutons) : elle suit le pointeur,
  // sa place reste marquée en pointillé et les autres cartes s'écartent en glissant (animation
  // FLIP) ; au lâcher, l'ordre du DOM devient la disposition enregistrée. Hors de ce mode, un appui
  // long (0,45 s) sur le titre d'une carte ouvre le mode, comme sur iPhone.
  var DELAI_APPUI_LONG_WIDGET = 450;
  let glisseWidget = null;

  function animerDeplacementWidgets(grille, deplacer) {
    const avant = new Map();
    grille.querySelectorAll('.widget').forEach(el => { if (el.style.display !== 'none') avant.set(el, el.getBoundingClientRect()); });
    deplacer();
    avant.forEach((r, el) => {
      if (el.classList.contains('widget-place')) return;
      const n = el.getBoundingClientRect();
      const dx = r.left - n.left, dy = r.top - n.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.22s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = '';
      });
    });
  }

  function commencerGlisserWidget(el, x, y) {
    const r = el.getBoundingClientRect();
    const fantome = el.cloneNode(true);
    fantome.classList.add('widget-fantome');
    fantome.removeAttribute('data-widget');
    fantome.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    fantome.style.width = r.width + 'px';
    fantome.style.height = r.height + 'px';
    fantome.style.left = r.left + 'px';
    fantome.style.top = r.top + 'px';
    document.body.appendChild(fantome);
    el.classList.add('widget-place');
    glisseWidget = { el, fantome, dx: x - r.left, dy: y - r.top, verrou: 0, x, y };
    document.body.classList.add('widgets-glisse-en-cours');
  }

  function suivreGlisserWidget(x, y) {
    const g = glisseWidget;
    if (!g) return;
    g.x = x; g.y = y;
    g.fantome.style.left = (x - g.dx) + 'px';
    g.fantome.style.top = (y - g.dy) + 'px';
    // Défilement de la page quand la carte approche du haut ou du bas de la fenêtre.
    if (y < 70) window.scrollBy(0, -14);
    else if (y > window.innerHeight - 70) window.scrollBy(0, 14);
    if (Date.now() < g.verrou) return;
    const sous = document.elementFromPoint(x, y);
    const cible = sous && sous.closest ? sous.closest('#widgets-dashboard > .widget') : null;
    if (!cible || cible === g.el) return;
    const grille = g.el.parentNode;
    const ordre = Array.from(grille.children);
    const avant = ordre.indexOf(g.el) > ordre.indexOf(cible);
    animerDeplacementWidgets(grille, () => grille.insertBefore(g.el, avant ? cible : cible.nextSibling));
    g.verrou = Date.now() + 240;
  }

  function finirGlisserWidget(annuler) {
    const g = glisseWidget;
    if (!g) return;
    glisseWidget = null;
    document.body.classList.remove('widgets-glisse-en-cours');
    const r = g.el.getBoundingClientRect();
    g.fantome.style.transition = 'left 0.18s ease, top 0.18s ease, transform 0.18s ease';
    g.fantome.style.left = r.left + 'px';
    g.fantome.style.top = r.top + 'px';
    g.fantome.style.transform = 'none';
    setTimeout(() => {
      g.fantome.remove();
      g.el.classList.remove('widget-place');
      if (annuler) { renderWidgetsDashboard(); return; }
      const ids = Array.from(g.el.parentNode.querySelectorAll(':scope > .widget')).map(el => el.dataset.widget);
      const dispo = dispositionWidgetsCourante();
      const nouvelle = dispositionDansOrdre(dispo, ids);
      if (nouvelle.map(w => w.id).join() !== dispo.map(w => w.id).join()) enregistrerDispositionWidgets(nouvelle);
      else renderWidgetsDashboard();
    }, 190);
  }

  function initialiserGlisserWidgets() {
    const grille = document.getElementById('widgets-dashboard');
    if (!grille || grille.dataset.glisser) return;
    grille.dataset.glisser = '1';
    let attente = null;   // { el, x, y, id, minuteur }
    const annulerAttente = () => { if (attente && attente.minuteur) clearTimeout(attente.minuteur); attente = null; };
    grille.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || glisseWidget) return;
      const el = e.target.closest('#widgets-dashboard > .widget');
      if (!el) return;
      if (modeEditionWidgets) {
        if (e.target.closest('button, wa-button, a, input, select, textarea')) return;
        e.preventDefault();
        attente = { el, x: e.clientX, y: e.clientY, id: e.pointerId, pret: true };
        return;
      }
      // Appui long sur le titre : ouvre la personnalisation et garde la carte en main.
      if (!e.target.closest('.w-tete') || e.target.closest('button, wa-button, a, input, select')) return;
      attente = { el, x: e.clientX, y: e.clientY, id: e.pointerId, pret: false };
      attente.minuteur = setTimeout(() => {
        if (!attente) return;
        attente.pret = true;
        attente.minuteur = null;
        const id = attente.el.dataset.widget;
        basculerEditionWidgets(true);
        attente.el = grille.querySelector(`.widget[data-widget="${id}"]`) || attente.el;
      }, DELAI_APPUI_LONG_WIDGET);
    });
    window.addEventListener('pointermove', (e) => {
      if (glisseWidget) { e.preventDefault(); suivreGlisserWidget(e.clientX, e.clientY); return; }
      if (!attente || e.pointerId !== attente.id) return;
      const loin = Math.abs(e.clientX - attente.x) + Math.abs(e.clientY - attente.y) > 6;
      if (!loin) return;
      if (!attente.pret) { annulerAttente(); return; }   // le doigt défile : pas d'appui long
      const el = attente.el;
      annulerAttente();
      commencerGlisserWidget(el, e.clientX, e.clientY);
      suivreGlisserWidget(e.clientX, e.clientY);
    }, { passive: false });
    window.addEventListener('pointerup', () => { annulerAttente(); if (glisseWidget) finirGlisserWidget(false); });
    window.addEventListener('pointercancel', () => { annulerAttente(); if (glisseWidget) finirGlisserWidget(true); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && glisseWidget) finirGlisserWidget(true); });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => planifierAjustementWidgets()).observe(grille);
  }

  // Carte « Agenda » du tableau de bord (maquette fournie par l'étude) : une bande de la semaine,
  // un point sous chaque jour qui porte un rendez-vous de signature, puis la liste. Par défaut la
  // liste montre les rendez-vous des 15 prochains jours ; cliquer sur un jour la limite à ce jour.
  // L'heure et le lieu viennent de l'agenda de l'office (voir agendaWatch.js côté serveur) — une
  // date saisie à la main n'en a pas, la ligne le dit simplement en ne les affichant pas.
  // Le widget lit le stock de l'agenda de l'office : du lundi de la semaine passée à 6 mois.
  var SEMAINES_AGENDA_MAX = 8;
  var SEMAINES_AGENDA_MIN = -1;
  let agendaDecalageSemaine = 0;
  let agendaJourSelectionne = null;
  // Absences des collaborateurs lues dans l'agenda de l'office (voir absencesDepuisIcs côté serveur,
  // exposées par GET /api/agenda). Chargées au démarrage et à chaque ouverture du tableau de bord
  // (chargerAbsencesOffice) : l'agenda signale « Absent cette semaine : … » et marque les
  // rendez-vous d'un collaborateur absent ce jour-là.
  let absencesOffice = [];
  // Rendez-vous du jour de l'agenda de l'office ({ jour, lu, evenements }, même route), pour la
  // fenêtre du matin (voir renderAgendaDuJour).
  let agendaDuJourOffice = null;

  function decalerSemaineAgenda(pas) {
    agendaDecalageSemaine = Math.max(SEMAINES_AGENDA_MIN, Math.min(SEMAINES_AGENDA_MAX, agendaDecalageSemaine + pas));
    agendaJourSelectionne = null;
    render();
  }

  function selectionnerJourAgenda(iso) {
    agendaJourSelectionne = agendaJourSelectionne === iso ? null : iso;
    render();
  }

  // ---- Absences des collaborateurs sur l'agenda (pures, testables) ----
  // Une absence {collaborateur, debut, fin} couvre un jour ISO si debut <= jour <= fin.
  function absenceCouvreJour(absence, iso) {
    if (!absence || !absence.debut || !iso) return false;
    return iso >= absence.debut && iso <= (absence.fin || absence.debut);
  }

  // Les noms complets des collaborateurs absents au moins un jour de la semaine affichée (la bande
  // du tableau de bord) — c'est le « Absent cette semaine : … » demandé par l'étude.
  function collaborateursAbsentsSemaine(absences, joursSemaine) {
    const noms = [];
    const vus = new Set();
    for (const a of absences || []) {
      if (vus.has(a.collaborateur)) continue;
      if ((joursSemaine || []).some((j) => absenceCouvreJour(a, j.iso))) {
        vus.add(a.collaborateur);
        noms.push(a.collaborateur);
      }
    }
    return noms;
  }

  // Le responsable d'un dossier est-il absent le jour affiché ? Sert à signaler un rendez-vous de
  // signature qui tombe pendant l'absence du collaborateur qui le porte.
  function responsableAbsentLeJour(absences, responsable, iso) {
    if (!responsable) return false;
    return (absences || []).some((a) => a.collaborateur === responsable && absenceCouvreJour(a, iso));
  }

  // Recharge la liste des absences depuis le serveur (mise à jour par le tour de surveillance de
  // l'agenda, toutes les 2 min). Appelée au démarrage et à chaque ouverture du tableau de bord —
  // les absences changent rarement, pas besoin de la rafraîchir à chaque sondage.
  async function chargerAbsencesOffice() {
    if (!authToken) return;
    try {
      const reponse = await fetchAvecAuth('/api/agenda');
      const corps = await reponse.json();
      const avant = JSON.stringify(absencesOffice);
      absencesOffice = Array.isArray(corps.absences) ? corps.absences : [];
      const agendaAvant = JSON.stringify(agendaDuJourOffice);
      agendaDuJourOffice = corps.agendaDuJour || null;
      if (fenetreAujourdhuiOuverte && JSON.stringify(agendaDuJourOffice) !== agendaAvant) renderFenetreAujourdhui();
      if (ongletActuel === 'dashboard' && JSON.stringify(absencesOffice) !== avant) render();
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth. Absences laissées telles quelles.
    }
  }

  // Pure : les prochaines échéances des dossiers (hors signature, déjà listée à part) — dates butoir
  // de prêt et de vente préalable, envois, rendez-vous à fixer —, de la plus proche à la plus
  // lointaine. Sert d'appoint à l'Agenda quand il reste de la place.
  function prochainesEcheancesAgenda(dossiersActifs, aujourdhuiIso, limite) {
    const out = [];
    (dossiersActifs || []).forEach(d => {
      if (!d || d.archive) return;
      echeancesPlanning(d).forEach(e => {
        if (!e.iso || e.iso < aujourdhuiIso || e.type === 'rendezVousSignature' || e.type === 'signature') return;
        out.push({ dossier: d, type: e.type, label: e.label, iso: e.iso });
      });
    });
    return out.sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, limite || 20);
  }

  function lignesProchainesEcheances(liste, aujourdhui) {
    return liste.map(e => {
      const j = ecartJours(aujourdhui, e.iso);
      const quand = j === 0 ? "Aujourd'hui" : j === 1 ? 'Demain' : new Date(e.iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      return `<li><button type="button" class="w-ligne" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(e.dossier.id)}')" title="${escapeAttr(e.label + ' — ' + libelleDossierAffiche(e.dossier))}">
        <span class="w-ligne-date">${escapeHtml(quand)}</span>
        <span class="dot-label dl-${e.type}"><span class="dot"></span></span>
        <span class="w-ligne-texte"><b>${escapeHtml(e.label)}</b> · ${escapeHtml(libelleDossierAffiche(e.dossier))}</span></button></li>`;
    }).join('');
  }

  // Carte « Agenda » reliée à l'agenda partagé de l'office (étude, 01/10 : « lier le widget agenda avec
  // l'agenda CLAIRE / Sophie partagé ») : les rendez-vous du calendrier de Sophie lus par le serveur
  // (stock `agenda-office`, GET /api/agenda/evenements, le même que la page Agenda), plus les signatures
  // fixées dans CLAIRE qui n'y sont pas encore (en pointillé). Un rendez-vous s'ouvre dans la page
  // Agenda, à son jour, son détail affiché.
  //  - petit : le jour, ses rendez-vous, le prochain ;
  //  - moyen / grand : la bande de la semaine (un point par jour qui a un rendez-vous), les rendez-vous
  //    du jour choisi, puis les prochains rendez-vous et les prochaines échéances en appoint.
  var JOURS_WIDGET_AGENDA = 42;
  let agendaWidget = { evenements: [], debut: '', fin: '', lu: '', charge: false, enCours: false, t: 0 };

  // Pure : les jours ISO de `debut` (compris) à `debut + n - 1`.
  function joursDepuis(debut, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(addDays(debut, i));
    return out;
  }

  // Pure : les rendez-vous d'une journée triés comme dans Outlook — journées entières d'abord, puis par heure.
  function evenementsTriesJour(evenements, iso) {
    return evenementsJourAgenda(evenements, iso).slice().sort((a, b) => {
      const ja = a.journeeEntiere || !a.heure ? 0 : 1;
      const jb = b.journeeEntiere || !b.heure ? 0 : 1;
      return ja - jb || String(a.heure || '').localeCompare(String(b.heure || '')) || String(a.sujet || '').localeCompare(String(b.sujet || ''));
    });
  }

  // Pure : les prochains rendez-vous horaires après le jour `apresIso` (absences et dates butoir à part),
  // par date puis heure.
  function prochainsEvenementsAgenda(evenements, apresIso, limite) {
    return (evenements || []).filter(e => e && e.date > apresIso && !e.absence && !estDateButoirAgenda(e))
      .sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')))
      .slice(0, limite || 20);
  }

  async function chargerAgendaWidget(forcer) {
    if (!authToken || agendaWidget.enCours) return;
    const lundi = debutSemaine(addDays(isoAujourdhuiLocal(), 7 * agendaDecalageSemaine));
    const debut = addDays(lundi, 0);
    const fin = addDays(lundi, JOURS_WIDGET_AGENDA);
    if (!forcer && agendaWidget.charge && agendaWidget.debut === debut && Date.now() - agendaWidget.t < 120000) return;
    agendaWidget.enCours = true;
    try {
      const r = await fetchAvecAuth(`/api/agenda/evenements?debut=${debut}&fin=${fin}`);
      const corps = await r.json();
      if (r.ok) agendaWidget = { evenements: Array.isArray(corps.evenements) ? corps.evenements : [], debut, fin, lu: corps.lu || '', source: corps.source || null, charge: true, enCours: false, t: Date.now() };
    } catch (e) { /* le widget garde ce qu'il avait */ }
    agendaWidget.enCours = false;
    if (ongletActuel === 'dashboard') renderRendezVousDashboard(dossiersPerimetreDashboard());
  }

  // Un rendez-vous du widget : la page Agenda s'ouvre sur son jour, son détail affiché.
  function ouvrirEvenementDepuisWidgetAgenda(cle, date) {
    positionnerAgenda(date);
    agendaSelection = cle;
    definirOnglet('agenda');
  }

  function ouvrirAgendaDepuisWidget(date) {
    positionnerAgenda(date || isoAujourdhuiLocal());
    agendaSelection = null;
    definirOnglet('agenda');
  }

  function renderRendezVousDashboard(perimetreActifs) {
    const bloc = document.getElementById('agenda-dashboard');
    if (!bloc) return;
    const aujourdhui = isoAujourdhuiLocal();
    const presentation = presentationWidget('agenda');
    const lundi = debutSemaine(addDays(aujourdhui, 7 * agendaDecalageSemaine));
    if (!agendaWidget.charge || agendaWidget.debut !== lundi || Date.now() - agendaWidget.t > 120000) chargerAgendaWidget();
    const joursCharges = joursDepuis(agendaWidget.debut || lundi, JOURS_WIDGET_AGENDA + 1);
    const evenements = agendaWidget.evenements.concat(signaturesHorsAgenda(perimetreActifs, agendaWidget.evenements, joursCharges));
    const source = agendaWidget.source;
    const nonRelie = agendaWidget.charge && source && source.configuree === false;
    const lu = agendaWidget.lu ? new Date(agendaWidget.lu) : null;
    const etatLecture = nonRelie ? 'Agenda Outlook non relié (Réglages › Agenda et Outlook)'
      : lu && !isNaN(lu) ? `Agenda de l’office · lu à ${String(lu.getHours()).padStart(2, '0')} h ${String(lu.getMinutes()).padStart(2, '0')}` : 'Agenda de l’office';
    const versPage = `ouvrirAgendaDepuisWidget('${agendaJourSelectionne || aujourdhui}')`;
    const boutonPage = `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="${versPage}" title="Ouvrir l’agenda" aria-label="Ouvrir l’agenda">${icone('calendar')}</wa-button>`;

    if (presentation === 'petit') {
      const dt = new Date(aujourdhui + 'T00:00:00');
      const duJour = evenementsTriesJour(evenements, aujourdhui);
      const suivant = prochainsEvenementsAgenda(evenements, aujourdhui, 1)[0];
      const nomJour = dt.toLocaleDateString('fr-FR', { weekday: 'long' });
      bloc.innerHTML = carteWidget({
        presentation, classe: 'w-agenda-petit',
        titre: escapeHtml(nomJour.charAt(0).toUpperCase() + nomJour.slice(1)),
        sous: escapeHtml(dt.toLocaleDateString('fr-FR', { month: 'long' })),
        droite: `<button type="button" class="w-jour-num w-jour-lien" onclick="${versPage}" title="Ouvrir l’agenda">${dt.getDate()}</button>`,
        corps: `<ol class="ajd-liste ajd-compacte" data-ajuster="1" data-defiler>${duJour.length ? lignesEvenementsAgendaJour(duJour, true, true) : '<li class="w-message">Aucun rendez-vous aujourd’hui.</li>'}</ol>
          ${suivant ? `<div class="w-bas" data-ajuster="2"><button type="button" class="w-prochaine" onclick="ouvrirEvenementDepuisWidgetAgenda('${escapeOnclickArg(cleEvenementAgenda(suivant))}', '${suivant.date}')">
            <span class="w-prochaine-sous">Prochain · ${escapeHtml(new Date(suivant.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))}${suivant.heure ? ' · ' + escapeHtml(suivant.heure.replace(':', ' h ')) : ''}</span>
            <span class="w-prochaine-titre">${escapeHtml(suivant.sujet || '')}</span></button></div>` : ''}`
      });
      planifierAjustementWidgets();
      return;
    }

    const jourAffiche = agendaJourSelectionne || aujourdhui;
    const semaine = joursDepuis(lundi, 7).map(iso => ({
      iso, nombre: evenementsJourAgenda(evenements, iso).length, passe: iso < aujourdhui, aujourdhui: iso === aujourdhui
    }));
    const moisRef = new Date((agendaJourSelectionne || semaine[3].iso) + 'T00:00:00');
    const mois = moisRef.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const bande = semaine.map(j => {
      const dt = new Date(j.iso + 'T00:00:00');
      const nomJour = dt.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').slice(0, 3);
      const classes = ['agenda-jour'];
      if (j.passe) classes.push('passe');
      if (j.aujourdhui) classes.push('aujourdhui');
      if (j.iso === agendaJourSelectionne) classes.push('selectionne');
      const titre = `${dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${j.nombre ? j.nombre + ' rendez-vous' : 'aucun rendez-vous'}`;
      return `<button type="button" class="${classes.join(' ')}" onclick="selectionnerJourAgenda('${j.iso}')" aria-pressed="${j.iso === agendaJourSelectionne}" title="${escapeAttr(titre)}">
          <span class="agenda-jour-nom">${escapeHtml(nomJour)}</span>
          <span class="agenda-jour-num">${dt.getDate()}</span>
          <span class="agenda-jour-point${j.nombre ? ' present' : ''}" aria-hidden="true"></span>
        </button>`;
    }).join('');
    const duJour = evenementsTriesJour(evenements, jourAffiche);
    const titreListe = jourAffiche === aujourdhui ? "Aujourd'hui"
      : new Date(jourAffiche + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const absentsSemaine = collaborateursAbsentsSemaine(absencesOffice, semaine);
    const suivants = prochainsEvenementsAgenda(evenements, jourAffiche, 20);
    const echeances = prochainesEcheancesAgenda(perimetreActifs, aujourdhui, 20);
    const revenir = agendaJourSelectionne ? '<button type="button" class="lien-discret" onclick="selectionnerJourAgenda(null)">Revenir à aujourd’hui</button>' : '';
    const ligneSuivant = (e) => {
      const j = ecartJours(aujourdhui, e.date);
      const quand = j === 0 ? "Aujourd'hui" : j === 1 ? 'Demain' : new Date(e.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      const teinte = teinteEvenementAgenda(e, categoriesRdvReglees());
      return `<li><button type="button" class="w-ligne" onclick="ouvrirEvenementDepuisWidgetAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}', '${e.date}')">
        <span class="w-ligne-date">${escapeHtml(quand)}</span>
        <span class="w-agenda-pastille ajd-${teinte}${e.horsAgenda ? ' ajd-hors-agenda' : ''}" aria-hidden="true"></span>
        <span class="w-ligne-texte">${escapeHtml(e.sujet || '(sans titre)')}</span>
        <span class="w-ligne-meta">${escapeHtml(e.heure ? e.heure.replace(':', ' h ') : 'Journée')}</span></button></li>`;
    };

    bloc.innerHTML = carteWidget({
      presentation,
      titre: `<button type="button" class="w-titre-lien" onclick="${versPage}" title="Ouvrir l’agenda">Agenda</button>`,
      sous: `${escapeHtml(mois.charAt(0).toUpperCase() + mois.slice(1))} · <span class="${nonRelie ? 'w-note-alerte' : ''}">${escapeHtml(etatLecture)}</span>`,
      droite: `<div class="agenda-nav">
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="decalerSemaineAgenda(-1)" ${agendaDecalageSemaine <= SEMAINES_AGENDA_MIN ? 'disabled' : ''} aria-label="Semaine précédente">${icone('chevron-left')}</wa-button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="decalerSemaineAgenda(1)" ${agendaDecalageSemaine >= SEMAINES_AGENDA_MAX ? 'disabled' : ''} aria-label="Semaine suivante">${icone('chevron-right')}</wa-button>
          ${boutonPage}
        </div>`,
      corps: `<div class="agenda-bande w-fixe" role="group" aria-label="Jours de la semaine">${bande}</div>
      ${presentation === 'grand' && absentsSemaine.length ? `<div class="agenda-absences">${icone('alert-triangle')} Absent cette semaine : ${absentsSemaine.map(n => escapeHtml(prenomCollaborateur(n))).join(', ')}</div>` : ''}
      <div class="w-section">
        <div class="agenda-liste-titre">
          <span class="section-eyebrow">${escapeHtml(titreListe)}</span>
          ${duJour.length ? '' : `<span class="w-note">${agendaWidget.charge ? 'Aucun rendez-vous' : 'Lecture…'}</span>`}
          ${revenir}
        </div>
        ${duJour.length ? `<ol class="ajd-liste ajd-compacte" data-ajuster="1" data-defiler>${lignesEvenementsAgendaJour(duJour, jourAffiche === aujourdhui, true)}</ol>` : ''}
      </div>
      ${suivants.length ? `<div class="w-section">
        <div class="agenda-liste-titre"><span class="section-eyebrow">Prochains rendez-vous</span></div>
        <ul class="w-lignes" data-ajuster="2">${suivants.map(ligneSuivant).join('')}</ul>
      </div>` : ''}
      ${echeances.length ? `<div class="w-section">
        <div class="agenda-liste-titre"><span class="section-eyebrow">Prochaines échéances</span></div>
        <ul class="w-lignes" data-ajuster="3">${lignesProchainesEcheances(echeances, aujourdhui)}</ul>
      </div>` : ''}`
    });
    planifierAjustementWidgets();
  }

  // ---- Alertes importantes et « Mes rappels » (tableau de bord) ----
  // Maquette envoyée par l'étude : une carte « Alertes importantes » (en plus d'Actions urgentes,
  // choix de l'étude) qui ne garde que les points qui demandent une décision, avec une gravité
  // lisible d'un coup d'œil, puis « Mes rappels », la liste de choses à faire que chacun note pour
  // lui-même (enregistrée sur le serveur, voir server/src/routes/rappelsPerso.js).
  var ORDRE_GRAVITE_ALERTE = { critique: 0, vigilance: 1, info: 2 };

  // Pure et testable : les points qui demandent une décision, du plus grave au moins grave puis du
  // plus proche au plus lointain. Chaque règle correspond à un geste précis — relancer l'offre,
  // envoyer l'appel de fonds ou le projet, fixer le rendez-vous — jamais un simple constat.
  function alertesImportantes(dossiersActifs, aujourdhuiIso) {
    const alertes = [];
    const ajouter = (d, gravite, titre, detail, jours) => alertes.push({ dossier: d, gravite, titre, detail, jours });
    const court = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    for (const d of dossiersActifs || []) {
      if (!d || d.archive) continue;
      // Succession (étude 16/10 : « les successions ne sont pas des ventes ») : ni prêt, ni appel de fonds et projet, ni préemption —
      // ses propres étapes (alertesSuccession, client/74).
      if (estSuccession(d)) { alertesSuccession(d, aujourdhuiIso).forEach(a => ajouter(d, a.gravite, a.titre, a.detail, a.jours)); continue; }
      // Offre de prêt pas encore reçue à l'approche (ou au-delà) de la date butoir du prêt.
      if (!d.sansPret && d.pret && !echeanceValidee(d, 'pret')) {
        const j = ecartJours(aujourdhuiIso, d.pret);
        if (j !== null && j <= 15) {
          const constat = j < 0 ? 'Butoir du prêt dépassé sans offre'
            : d.offrePretStatut === 'manquante' ? 'Offre introuvable' : 'Offre non reçue';
          ajouter(d, j <= 7 ? 'critique' : 'vigilance', 'Relancer l’offre de prêt', `${constat} · butoir le ${court(d.pret)}`, j);
        }
      }
      // Rendez-vous de signature proche alors qu'un envoi manque encore.
      if (d.rendezVousSignature) {
        const j = ecartJours(aujourdhuiIso, d.rendezVousSignature);
        if (j !== null && j >= 0 && j <= 7) {
          const af = echeanceValidee(d, 'appelFonds');
          const pr = echeanceValidee(d, 'projetEnvoye');
          if (!af || !pr) {
            const titre = !af && !pr ? 'Envoyer l’appel de fonds et le projet' : !af ? 'Envoyer l’appel de fonds' : 'Envoyer le projet';
            const heure = plageHoraireRendezVous(d.rendezVousSignatureHeure, '');
            ajouter(d, j <= 2 ? 'critique' : 'vigilance', titre, `Signature le ${court(d.rendezVousSignature)}${heure ? ' à ' + heure : ''}`, j);
          }
        }
        // Signature fixée APRÈS la date butoir de l'avant-contrat : plus d'alerte de « report » à la
        // demande de l'étude. Fixer un rendez-vous postérieur au butoir est une décision assumée
        // (les parties ont convenu d'une date plus tardive) ; le butoir n'étant qu'indicatif, il n'y
        // a rien à « vérifier » ni à relancer — l'écart reste visible sur la fiche (voir renderLigneEcheance /
        // butoirRemplacePar), la synthèse n'a pas à le répéter.
      } else if (d.acte && ecartJours(aujourdhuiIso, d.acte) !== null && ecartJours(aujourdhuiIso, d.acte) <= 15) {
        // Date butoir proche, et aucun rendez-vous de signature fixé.
        const j = ecartJours(aujourdhuiIso, d.acte);
        const safer = saferLevee(d) ? '' : (echeanceSaferDossier(d) || 'attendue');
        if (preemptionLevee(d) && !safer) ajouter(d, j <= 5 ? 'critique' : 'vigilance', 'Fixer le rendez-vous', `Aucun rendez-vous · butoir le ${court(d.acte)}`, j);
        else if (preemptionLevee(d)) ajouter(d, j <= 5 ? 'critique' : 'vigilance', 'Réponse SAFER attendue', `${safer === 'attendue' ? 'Rendez-vous impossible avant sa réponse' : `Délai SAFER jusqu’au ${court(safer)}`} · butoir le ${court(d.acte)}`, j);
        else ajouter(d, j <= 5 ? 'critique' : 'vigilance', 'Obtenir la renonciation de préemption', `${echeanceDiaDossier(d) ? `Rendez-vous impossible sans elle · réponse de la commune au plus tard le ${court(echeanceDiaDossier(d))}` : 'Rendez-vous impossible sans elle'} · butoir le ${court(d.acte)}`, j);
      } else if (pretLeve(d) && !estSuccession(d)) {
        // Offre reçue (ou achat comptant) : placer le rendez-vous est l'étape suivante, avant
        // l'appel de fonds (demandé par l'étude). Le butoir, s'il existe, donne le délai.
        const j = d.acte ? ecartJours(aujourdhuiIso, d.acte) : null;
        const detail = d.sansPret ? 'Achat comptant' : 'Offre de prêt reçue';
        // À faire (vigilance) quand l'offre vient d'arriver ; simple suivi sur un achat comptant,
        // où rien ne s'est produit qui appelle un geste aujourd'hui.
        const safer = saferLevee(d) ? '' : (echeanceSaferDossier(d) || 'attendue');
        if (preemptionLevee(d) && !safer) ajouter(d, d.sansPret ? 'info' : 'vigilance', 'Fixer le rendez-vous', d.acte ? `${detail} · butoir le ${court(d.acte)}` : detail, j);
        else if (preemptionLevee(d)) ajouter(d, 'info', 'Réponse SAFER attendue', `${detail} · ${safer === 'attendue' ? 'rendez-vous à fixer ensuite' : `délai SAFER jusqu’au ${court(safer)}`}`, safer === 'attendue' ? j : ecartJours(aujourdhuiIso, safer));
        else if (echeanceDiaDossier(d)) ajouter(d, 'info', 'Renonciation de préemption attendue', `${detail} · réponse de la commune à la DIA au plus tard le ${court(echeanceDiaDossier(d))}`, ecartJours(aujourdhuiIso, echeanceDiaDossier(d)));
        else ajouter(d, 'info', 'Renonciation de préemption attendue', `${detail} · rendez-vous à fixer ensuite`, j);
      }
      // Vente préalable qui approche sans être confirmée.
      if (d.ventebien && !echeanceValidee(d, 'ventebien')) {
        const j = ecartJours(aujourdhuiIso, d.ventebien);
        if (j !== null && j <= 7) ajouter(d, j < 0 ? 'critique' : 'vigilance', 'Confirmer la vente préalable', `Prévue le ${court(d.ventebien)}`, j);
      }
      // Dossier complet sans rendez-vous : il n'attend plus que d'être fixé (déjà signalé plus haut
      // quand l'offre est reçue — ne pas l'ajouter deux fois).
      if (!d.rendezVousSignature && dossierEntierementComplet(d) && !pretLeve(d)) {
        ajouter(d, 'info', 'Fixer le rendez-vous', 'Dossier complet : offre et pièces reçues', null);
      }
    }
    return alertes.sort((a, b) => (ORDRE_GRAVITE_ALERTE[a.gravite] - ORDRE_GRAVITE_ALERTE[b.gravite])
      || ((a.jours === null ? 999 : a.jours) - (b.jours === null ? 999 : b.jours)));
  }

  function pointsEtatDossier(d) {
    const statut = statutDossier(d);
    // « Aucun document » ne vaut réclamation de pièces que si le dossier est relié et que des pièces
    // y ont réellement été cherchées : une offre introuvable seule est déjà « Relancer l'offre ».
    const piecesManquantes = d.dossierLie && d.roleNotaire !== 'participant'
      && checklistPieces(d.typeVente, d).some(p => (d.pieces || {})[p.cle] === 'manquante');
    if (statut === 'blocage' && piecesManquantes) return [{ dossier: d, gravite: 'vigilance', titre: 'Réclamer les pièces', detail: 'Aucune pièce trouvée sur le NAS', jours: null }];
    if (statut === 'arelier' && !d.dossierLie) return [{ dossier: d, gravite: 'info', titre: 'Relier le dossier du NAS', detail: 'Pièces pas encore vérifiées', jours: null }];
    return [];
  }

  // Pure et testable.
  function pointsATraiter(dossiersActifs, aujourdhuiIso) {
    const parDossier = new Map();
    const ajouter = (a) => {
      const l = parDossier.get(a.dossier.id) || [];
      if (!l.some(x => x.titre === a.titre)) l.push(a);
      parDossier.set(a.dossier.id, l);
    };
    for (const a of alertesImportantes(dossiersActifs, aujourdhuiIso)) ajouter(a);
    for (const d of dossiersActifs || []) {
      if (d && !d.archive) for (const a of pointsEtatDossier(d)) ajouter(a);
    }
    const cle = (a) => [ORDRE_GRAVITE_ALERTE[a.gravite], a.jours === null ? 999 : a.jours];
    const comparer = (a, b) => { const x = cle(a), y = cle(b); return (x[0] - y[0]) || (x[1] - y[1]); };
    const lignes = [];
    for (const liste of parDossier.values()) {
      liste.sort(comparer);
      lignes.push({ dossier: liste[0].dossier, principal: liste[0], autres: liste.slice(1), gravite: liste[0].gravite, jours: liste[0].jours });
    }
    return lignes.sort((a, b) => comparer(a.principal, b.principal));
  }

  // Pure : l'échéance d'un rappel, dite comme on la dirait.
  function libelleEcheanceRappel(iso, aujourdhuiIso) {
    if (!iso) return '';
    const j = ecartJours(aujourdhuiIso, iso);
    if (j === null) return '';
    // Un rappel non coché passe au lendemain et le dit (demandé par l'étude) : il reste en tête de
    // liste, marqué « non fait hier » plutôt qu'un compte de jours de retard.
    if (j === -1) return 'Non fait hier';
    if (j < 0) return `Non fait depuis ${-j} j`;
    if (j === 0) return "Aujourd'hui";
    if (j === 1) return 'Demain';
    const dt = new Date(iso + 'T00:00:00');
    if (j < 7) { const n = dt.toLocaleDateString('fr-FR', { weekday: 'long' }); return n.charAt(0).toUpperCase() + n.slice(1); }
    return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  // Pure : les rappels à afficher — à faire d'abord (par échéance, les sans-date à la fin), puis
  // ceux cochés AUJOURD'HUI, barrés, pour voir ce qui a été fait dans la journée.
  function rappelsAffiches(rappels, aujourdhuiIso) {
    const l = Array.isArray(rappels) ? rappels : [];
    // Les tâches demandées par un collègue passent en tête (étude 15/10), puis par échéance.
    const aFaire = l.filter(r => !r.fait).sort((a, b) => (b.demandePar ? 1 : 0) - (a.demandePar ? 1 : 0) || (a.echeance || '9999').localeCompare(b.echeance || '9999') || String(a.creeLe).localeCompare(String(b.creeLe)));
    const faits = l.filter(r => r.fait && String(r.faitLe || '').slice(0, 10) === aujourdhuiIso);
    return aFaire.concat(faits);
  }

  let rappelsPerso = [];
  let rappelsPersoCharges = false;
  let ajoutRappelOuvert = false;
  // Un seul formulaire à la fois (ajout OU modification d'un rappel) : les deux portent les mêmes id.
  let rappelEnEdition = null;

  async function chargerRappelsPerso() {
    if (!utilisateurPoste) { rappelsPerso = []; rappelsPersoCharges = true; return; }
    try {
      const reponse = await fetchAvecAuth('/api/rappels-perso?auteur=' + encodeURIComponent(utilisateurPoste));
      if (reponse.ok) rappelsPerso = (await reponse.json()).rappels || [];
    } catch (e) { console.warn('Rappels indisponibles :', e.message); }
    annoncerDemandesRecues(rappelsPerso, rappelsPersoCharges);
    rappelsPersoCharges = true;
    renderAlertesDashboard(dossiersPerimetreDashboard());
  }

  // Tâches demandées par un collègue (« Demander à CLAIRE ») : annoncées une fois à leur arrivée (pas au premier chargement).
  var demandesAnnoncees = new Set();
  function annoncerDemandesRecues(rappels, dejaCharges) {
    for (const r of rappels || []) {
      if (!r || !r.demandePar || r.fait || demandesAnnoncees.has(r.id)) continue;
      demandesAnnoncees.add(r.id);
      if (dejaCharges) afficherToast(`${prenomCollaborateur(r.demandePar)} vous demande : ${String(r.texte || '').replace(/\s*\(demandé par [^)]*\)$/, '')} — dans « Aujourd'hui ».`, 'OK', null);
    }
  }

  async function enregistrerRappelPerso(rappel) {
    try {
      const reponse = await fetchAvecAuth('/api/rappels-perso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rappel })
      });
      if (!reponse.ok) throw new Error((await reponse.json().catch(() => ({}))).erreur || `HTTP ${reponse.status}`);
    } catch (e) {
      afficherToast(`Rappel non enregistré : ${e.message}`, 'OK', null);
      chargerRappelsPerso();
    }
  }

  function dossiersPerimetreDashboard() {
    return dossiersDuPerimetre(dossiers, utilisateurPoste, vueGlobaleDashboard()).filter(d => !d.archive);
  }

  function ouvrirAjoutRappel(ouvrir) {
    ajoutRappelOuvert = !!ouvrir;
    if (ajoutRappelOuvert) rappelEnEdition = null;
    renderAlertesDashboard(dossiersPerimetreDashboard());
    if (ajoutRappelOuvert) amenerFormulaireRappel(false);
  }

  function ajouterRappelPerso() {
    const texte = (document.getElementById('rappel-perso-texte').value || '').trim();
    if (!texte || !utilisateurPoste) return;
    const rappel = {
      id: 'rp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      auteur: utilisateurPoste,
      texte: texte.slice(0, 200),
      echeance: document.getElementById('rappel-perso-date').value || '',
      dossierId: document.getElementById('rappel-perso-dossier').value || '',
      fait: false,
      faitLe: '',
      creeLe: new Date().toISOString()
    };
    rappelsPerso.push(rappel);
    ajoutRappelOuvert = false;
    renderAlertesDashboard(dossiersPerimetreDashboard());
    enregistrerRappelPerso(rappel);
  }

  // Modifier un rappel existant (demandé par l'étude) : texte, échéance et dossier, dans le même
  // formulaire que l'ajout, ouvert à la place de la ligne. Le serveur fusionne par id.
  function ouvrirEditionRappel(id) {
    rappelEnEdition = id || null;
    if (rappelEnEdition) ajoutRappelOuvert = false;
    renderAlertesDashboard(dossiersPerimetreDashboard());
    if (rappelEnEdition) amenerFormulaireRappel(true);
  }

  // Le formulaire d'un rappel, une fois la carte ajustée (ajusterWidgets passe à l'image suivante) :
  // ramené dans la partie visible de la carte, curseur dans le texte.
  function amenerFormulaireRappel(selectionner) {
    const placer = () => {
      const c = document.getElementById('rappel-perso-texte');
      if (!c) return;
      const form = c.closest('.rappel-perso-form');
      if (form && form.scrollIntoView) form.scrollIntoView({ block: 'nearest' });
      c.focus({ preventScroll: true });
      if (selectionner) c.select();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(placer)); else setTimeout(placer, 0);
  }

  function validerEditionRappel() {
    const r = rappelsPerso.find(x => x.id === rappelEnEdition);
    const texte = (document.getElementById('rappel-perso-texte').value || '').trim();
    if (!r || !texte) return;
    r.texte = texte.slice(0, 200);
    r.echeance = document.getElementById('rappel-perso-date').value || '';
    r.dossierId = document.getElementById('rappel-perso-dossier').value || '';
    rappelEnEdition = null;
    renderAlertesDashboard(dossiersPerimetreDashboard());
    enregistrerRappelPerso(r);
  }

  function basculerRappelPerso(id) {
    const r = rappelsPerso.find(x => x.id === id);
    if (!r) return;
    r.fait = !r.fait;
    r.faitLe = r.fait ? new Date().toISOString() : '';
    // Tâche demandée par un collaborateur via « Demander à CLAIRE » (13/10) : il est prévenu sur Teams quand elle est faite — une
    // fois : le repère est enregistré avec la tâche (relecture : décocher puis recocher renvoyait le message).
    if (r.fait) prevenirDemandeurTacheFaite(r);
    renderAlertesDashboard(dossiersPerimetreDashboard());
    enregistrerRappelPerso(r);
    if (r.fait && r.agendaItemId && !r.agendaSupprimeLe) retirerTacheDeLAgenda(r);
  }

  // Tâche relevée dans l'agenda de l'office (rendez-vous rouge « JV - … », étude 04/10, serveur tachesAgenda.js) :
  // cochée, son rendez-vous est retiré de l'agenda aussitôt (éléments supprimés d'Outlook). Un seul essai ; en échec,
  // la tâche reste cochée et le rendez-vous en place.
  async function retirerTacheDeLAgenda(r) {
    let message = '';
    try {
      const reponse = await fetchAvecAuth('/api/exchange/evenement/supprimer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: r.agendaItemId, changeKey: r.agendaChangeKey || '' })
      });
      const corps = await reponse.json().catch(() => ({}));
      if (corps.ok) {
        r.agendaSupprimeLe = new Date().toISOString();
        agendaEvenements = agendaEvenements.filter(x => x.itemId !== r.agendaItemId);
        enregistrerRappelPerso(r);
        renderAlertesDashboard(dossiersPerimetreDashboard());
        noterVerificationPoste('tache-agenda-retiree', { ok: true });
        return;
      }
      message = corps.message || '';
    } catch (e) { message = 'serveur injoignable'; }
    noterVerificationPoste('tache-agenda-retiree', { ok: false, message: 'Suppression refusée' });
    afficherToast(`Tâche cochée, mais le rendez-vous n’a pas été retiré de l’agenda${message ? ' : ' + message : ''}.`, 'OK', null);
  }

  async function supprimerRappelPerso(id) {
    rappelsPerso = rappelsPerso.filter(x => x.id !== id);
    renderAlertesDashboard(dossiersPerimetreDashboard());
    try { await fetchAvecAuth('/api/rappels-perso/' + encodeURIComponent(id), { method: 'DELETE' }); }
    catch (e) { afficherToast(`Rappel non supprimé : ${e.message}`, 'OK', null); chargerRappelsPerso(); }
  }

  // Un rappel qui parle d'écrire (« Envoyer un mail au syndic », « Répondre à Me X »…) propose un
  // email vierge, signature de l'office comprise (demandé par l'étude). Pure et testable. Une
  // adresse écrite dans le rappel devient le destinataire ; un dossier rattaché donne l'objet.
  var RE_RAPPEL_EMAIL = /(^|[^a-zà-ÿ])(e-?mails?|mails?|m[ée]ls?|courriels?|[ée]crire|[ée]cris|r[ée]pondre)(?![a-zà-ÿ])/i;
  function rappelParleEmail(texte) {
    const t = String(texte || '');
    return RE_RAPPEL_EMAIL.test(t) || EMAIL_RE.test(t);
  }

  async function ouvrirEmailRappelPerso(id) {
    const r = rappelsPerso.find(x => x.id === id);
    if (!r) return;
    const d = r.dossierId ? dossiers.find(x => x.id === r.dossierId) : null;
    const adresse = (String(r.texte).match(EMAIL_RE) || [''])[0];
    const res = await livrerEmailDossier({ destinataire: adresse, sujet: d ? libelleDossierAffiche(d) : '', corps: 'Bonjour,\n\n', dossierId: d ? d.id : '', geste: 'email' });
    if (!res.ok) { if (!res.annule) afficherToast(res.message || "L'email n'a pas pu être préparé.", 'OK', null); return; }
    annoncerEmailPret(res, true);
  }

  // `sansDuJour` (carte « Aujourd'hui ») : les rappels déjà dans la liste « À faire » (échus, non cochés, à venir datés,
  // ou cochés aujourd'hui) n'y sont pas répétés ; restent ceux sans échéance datée future… et l'ajout. 'ajout' (carte
  // « Aujourd'hui » depuis le 07/10) : seulement « Ajouter une tâche » et le formulaire d'un rappel en cours de modification.
  function renderMesRappels(perimetreActifs, sansDuJour) {
    const ajoutSeul = sansDuJour === 'ajout';
    if (!utilisateurPoste) {
      return `<div class="rappels-perso-vide">Pour noter vos rappels, <button type="button" class="lien-discret" onclick="ouvrirChoixPoste()">indiquez qui utilise ce poste</button>.</div>`;
    }
    const aujourdhui = isoAujourdhuiLocal();
    const dejaAffiches = sansDuJour ? (rd => new Set(rd.aFaire.concat(rd.faits, rd.aVenir).map(r => r.id)))(rappelsDuJour(rappelsPerso, aujourdhui)) : new Set();
    const liste = rappelsAffiches(rappelsPerso, aujourdhui).filter(r => (ajoutSeul ? false : !dejaAffiches.has(r.id)) || r.id === rappelEnEdition);
    const optionsDossiers = (selection) => perimetreActifs.slice().sort((a, b) => String(a.nom).localeCompare(String(b.nom)))
      .map(d => `<option value="${escapeAttr(d.id)}"${d.id === selection ? ' selected' : ''}>${escapeHtml(libelleDossierAffiche(d))}</option>`).join('');
    const formulaireRappel = (r) => {
      // Un rappel rattaché à un dossier sorti du périmètre (archivé, autre collaborateur) garde
      // son rattachement : l'option est ajoutée pour ne pas le perdre en enregistrant.
      const hors = r && r.dossierId && !perimetreActifs.some(d => d.id === r.dossierId)
        ? (d => d ? `<option value="${escapeAttr(d.id)}" selected>${escapeHtml(libelleDossierAffiche(d))}</option>` : '')(dossiers.find(x => x.id === r.dossierId)) : '';
      return `
      <form class="rappel-perso-form" onsubmit="event.preventDefault(); ${r ? 'validerEditionRappel()' : 'ajouterRappelPerso()'};">
        <input type="text" id="rappel-perso-texte" maxlength="200" placeholder="Ex. Relancer le syndic pour l'état daté" value="${r ? escapeAttr(r.texte) : ''}" required>
        <div class="rappel-perso-form-ligne">
          <input type="date" id="rappel-perso-date" aria-label="Échéance" value="${r ? escapeAttr(r.echeance || '') : ''}">
          <select id="rappel-perso-dossier" aria-label="Dossier"><option value="">Sans dossier</option>${hors}${optionsDossiers(r ? r.dossierId : '')}</select>
        </div>
        <div class="rappel-perso-form-ligne">
          <wa-button variant="brand" type="submit" class="primary">${r ? 'Enregistrer' : 'Ajouter'}</wa-button>
          <wa-button appearance="outlined" class="secondary" onclick="${r ? 'ouvrirEditionRappel(null)' : 'ouvrirAjoutRappel(false)'}">Annuler</wa-button>
        </div>
      </form>`;
    };
    const lignes = liste.map(r => {
      if (r.id === rappelEnEdition) return formulaireRappel(r);
      const d = r.dossierId ? dossiers.find(x => x.id === r.dossierId) : null;
      // Sans échéance, un rappel resté non fait depuis sa création le dit aussi (« Non fait hier »).
      const creation = !r.fait && !r.echeance ? dateRappelJour(r) : '';
      const dateJour = r.echeance || (creation && creation < aujourdhui ? creation : '');
      const quand = libelleEcheanceRappel(dateJour, aujourdhui);
      const enRetard = !r.fait && dateJour && dateJour < aujourdhui;
      const sous = [quand, d ? libelleDossierAffiche(d) : '', r.agendaItemId ? 'Agenda' : ''].filter(Boolean);
      return `
        <div class="rappel-perso${r.fait ? ' fait' : ''}">
          <button type="button" class="rappel-perso-case" role="checkbox" aria-checked="${r.fait}" onclick="basculerRappelPerso('${escapeOnclickArg(r.id)}')" aria-label="${r.fait ? 'Marquer à faire' : 'Marquer fait'} : ${escapeAttr(r.texte)}">${r.fait ? icone('check') : ''}</button>
          <div class="rappel-perso-texte">
            <span class="rappel-perso-titre">${escapeHtml(r.texte)}</span>
            ${sous.length ? `<span class="rappel-perso-sous${enRetard ? ' retard' : ''}">${sous.map((s, i) => i === 1 && d ? `<button type="button" class="lien-discret" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(d.id)}')">${escapeHtml(s)}</button>` : escapeHtml(s)).join(' · ')}</span>` : ''}
          </div>
          ${!r.fait && rappelParleEmail(r.texte) ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn rappel-perso-email" onclick="ouvrirEmailRappelPerso('${escapeOnclickArg(r.id)}')" title="Préparer un email vierge avec la signature de l'office" aria-label="Préparer un email">${icone('mail')}</wa-button>` : ''}
          ${r.agendaItemId ? '' : `<wa-button appearance="plain" size="s" type="button" class="bouton-icone rappel-perso-suppr rappel-perso-modif" onclick="ouvrirEditionRappel('${escapeOnclickArg(r.id)}')" aria-label="Modifier le rappel" title="Modifier">${icone('pencil')}</wa-button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone rappel-perso-suppr" onclick="supprimerRappelPerso('${escapeOnclickArg(r.id)}')" aria-label="Supprimer le rappel" title="Supprimer">${icone('x')}</wa-button>`}
        </div>`;
    }).join('');
    const formulaire = ajoutRappelOuvert ? formulaireRappel(null) : `<wa-button appearance="outlined" type="button" class="bouton-ajout rappel-perso-ajout" onclick="ouvrirAjoutRappel(true)"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>${ajoutSeul ? 'Ajouter une tâche' : 'Ajouter un rappel'}</wa-button>`;
    // Carte « Aujourd'hui » : pas de « Aucun rappel » sous la liste des tâches (étude 07/10 : « trop d'espace pour ajouter un
    // rappel ») — le bouton d'ajout suffit.
    const vide = !rappelsPersoCharges || sansDuJour ? '' : '<div class="rappels-perso-vide">Aucun rappel pour le moment.</div>';
    return `${lignes || vide}${formulaire}`;
  }
