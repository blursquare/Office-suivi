  // ---- Compte rendu de relecture d'actes (étude 06/10 : « plus succinct, une page recto verso A4 au maximum, un résumé
  // plus court au début, les choses à surveiller et les alertes plus compactes et visuelles, les éléments validés à la fin
  // sur un quart de page au plus, possibilité de le sortir pour impression A4 »). Le PLAN du compte rendu est une fonction
  // pure (planCompteRenduRelecture) : elle range tout ce que la relecture a produit — points de la grille, contrôles
  // CLAIRE, clauses contradictoires, autres points relevés — en trois listes (alertes, à surveiller, validé), borne le
  // résumé, raccourcit les commentaires et garde le détail des N premières lignes seulement ; le reste est cité par son
  // seul intitulé. Le même plan sert à l'écran (lignes compactes, pastilles de page cliquables, commentaires de l'étude) et
  // à l'impression (texte seul, gabarit A4 dans #relecture-cr-print, Ctrl+P ou bouton « Imprimer (A4) »). ----

  var LIMITES_COMPTE_RENDU_RELECTURE = {
    resumeCaracteres: 320,       // résumé en tête : deux phrases au plus, bornées
    commentaireCaracteres: 170,  // commentaire d'un point : une phrase, bornée
    lignesDetaillees: 30,        // alertes + à surveiller avec leur commentaire ; au-delà, l'intitulé seul
    validesCaracteres: 850       // bloc « Validé » : un quart de page A4 environ
  };

  // Pure : coupe un texte à la fin d'une phrase, sinon au dernier espace avant `max`, avec « … ».
  function texteCourtRelecture(texte, max) {
    const t = String(texte || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length <= max) return t;
    const fenetre = t.slice(0, max);
    const finPhrase = Math.max(fenetre.lastIndexOf('. '), fenetre.lastIndexOf('! '), fenetre.lastIndexOf('? '));
    if (finPhrase >= Math.floor(max * 0.25)) return fenetre.slice(0, finPhrase + 1);
    const espace = fenetre.lastIndexOf(' ');
    return (espace > 0 ? fenetre.slice(0, espace) : fenetre).replace(/[,;:(\s]+$/, '') + '…';
  }

  // Pure : la première phrase d'un commentaire (deux si la première est très courte, « Non. »), puis bornée.
  function commentaireCourtRelecture(texte, max) {
    const t = String(texte || '').replace(/\s+/g, ' ').trim();
    const phrases = t.match(/[^.!?]+[.!?]+(\s|$)/g);
    let court = t;
    if (phrases && phrases.length > 1) court = (phrases[0].trim().length < 12 ? phrases.slice(0, 2).join('') : phrases[0]).trim();
    return texteCourtRelecture(court, max || LIMITES_COMPTE_RENDU_RELECTURE.commentaireCaracteres);
  }

  // Pure : résumé court en tête — les deux premières phrases, bornées.
  function resumeCourtRelecture(synthese, max) {
    const t = String(synthese || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const phrases = t.match(/[^.!?]+[.!?]+(\s|$)/g);
    const deux = phrases && phrases.length ? phrases.slice(0, 2).join('').trim() : t;
    return texteCourtRelecture(deux, max || LIMITES_COMPTE_RENDU_RELECTURE.resumeCaracteres);
  }

  // Pure : les lignes d'un plan. `entree` :
  //   sections       [{ cle, titre, lignes: [{ id, intitule, niveau, commentaire, citations, base_legale, uid }] }]
  //                  (niveau déjà effectif : critique | surveiller | valide | na)
  //   claire         [{ uid, titre, description, gravite, page, document }]  — contrôles CLAIRE affichés
  //   contradictions [{ uid, titre, description, niveau, clauses: [{ page, document, verifie }] }]
  //   anomalies      [{ uid, titre, description, niveau, citations }]
  //   synthese       texte de l'IA
  // Rend { resume, alertes, surveiller, nonDetailles, valides: [{ theme, points }], validesReste, compte }.
  // Chaque élément : { genre: 'grille' | 'claire' | 'contradiction' | 'anomalie', theme, intitule, commentaire, citations,
  // niveau, uid, base_legale }.
  function planCompteRenduRelecture(entree, limites) {
    const L = Object.assign({}, LIMITES_COMPTE_RENDU_RELECTURE, limites || {});
    const e = entree || {};
    const alertes = [], surveiller = [], valides = [];
    const compte = { critique: 0, surveiller: 0, valide: 0, na: 0 };
    const ranger = (item) => {
      if (item.niveau === 'critique') alertes.push(item);
      else if (item.niveau === 'surveiller') surveiller.push(item);
      if (compte[item.niveau] !== undefined) compte[item.niveau]++;
    };
    const court = (t) => commentaireCourtRelecture(t, L.commentaireCaracteres);
    for (const s of (e.sections || [])) {
      const pointsValides = [];
      for (const l of (s.lignes || [])) {
        const item = { genre: 'grille', theme: s.titre, themeCle: s.cle, intitule: l.intitule, commentaire: court(l.commentaire),
          citations: l.citations || [], niveau: l.niveau, uid: l.uid || '', base_legale: l.base_legale || '', id: l.id };
        if (l.niveau === 'valide') pointsValides.push(l.intitule);
        ranger(item);
      }
      if (pointsValides.length) valides.push({ theme: s.titre, themeCle: s.cle, points: pointsValides });
    }
    for (const c of (e.claire || [])) {
      ranger({ genre: 'claire', theme: 'Contrôle CLAIRE', themeCle: 'claire', intitule: c.titre, commentaire: court(c.description),
        citations: c.page ? [{ page: c.page, document: c.document, verifie: true, extrait: c.phrase || '' }] : [], niveau: c.niveau, uid: c.uid || '' });
    }
    for (const c of (e.contradictions || [])) {
      ranger({ genre: 'contradiction', theme: 'Clauses contradictoires', themeCle: 'contradictions', intitule: c.titre, commentaire: court(c.description),
        citations: c.clauses || [], niveau: c.niveau, uid: c.uid || '' });
    }
    for (const c of (e.anomalies || [])) {
      ranger({ genre: 'anomalie', theme: 'Autre point relevé', themeCle: 'anomalies', intitule: c.titre, commentaire: court(c.description),
        citations: c.citations || [], niveau: c.niveau, uid: c.uid || '' });
    }
    // Le détail (commentaire) est gardé pour les N premières lignes ; au-delà, l'intitulé seul, en fin de liste.
    let nonDetailles = [];
    const budget = L.lignesDetaillees;
    if (alertes.length + surveiller.length > budget) {
      const garder = Math.max(0, budget - alertes.length);
      nonDetailles = surveiller.slice(garder);
      surveiller.length = garder;
      if (alertes.length > budget) { nonDetailles = alertes.slice(budget).concat(nonDetailles); alertes.length = budget; }
    }
    // « Validé » sur un quart de page : les thèmes dans l'ordre, les points jusqu'au budget de caractères.
    let reste = L.validesCaracteres;
    let validesReste = 0;
    const validesBornes = [];
    for (const v of valides) {
      if (reste <= 0) { validesReste += v.points.length; continue; }
      const gardes = [];
      for (const p of v.points) {
        if (reste - (p.length + 3) < 0 && gardes.length) { validesReste++; continue; }
        gardes.push(p);
        reste -= p.length + 3;
      }
      if (gardes.length) validesBornes.push({ theme: v.theme, themeCle: v.themeCle, points: gardes });
    }
    return { resume: resumeCourtRelecture(e.synthese, L.resumeCaracteres), alertes, surveiller, nonDetailles, valides: validesBornes, validesReste, compte };
  }

  // Libellé court d'une citation (« Projet · p.12 ») : le même pour une pastille cliquable et pour le papier.
  function libelleCitationRelecture(c) {
    const doc = documentsEnvoyesRelecture.find(d => d.numero === c.document);
    const f = doc ? (fichiersAnalyseIa.find(x => x.id === doc.fichierId) || (doc.nom ? doc : null)) : null;
    const court = f ? (f.type === 'principal' ? 'Projet' : f.type === 'reference_compromis' ? 'Avant-contrat' : libelleNaturePieceOutil2(f.nature)) : `Doc ${c.document || '?'}`;
    return { court, nomDoc: f ? f.nom : 'Document', texte: `${court}${c.page ? ` · p.${c.page}` : ''}` };
  }

  // Une ligne compacte : pastille du niveau (icône seule), thème, intitulé, commentaire court, pages, puis — à l'écran
  // seulement — l'avis de l'étude sur le point (mode commentaires).
  function ligneCompteRenduRelecture(item, impression) {
    const n = NIVEAUX_RELECTURE_OUTIL2[item.niveau] || NIVEAUX_RELECTURE_OUTIL2.surveiller;
    const constat = !impression && item.uid ? constatsAuditParUid[item.uid] : null;
    const pied = constat ? (modeCommentairesAudit ? renderCommentaireConstatAudit(constat) : renderRetourResumeAudit(constat)) : '';
    const citations = impression
      ? (item.citations || []).map(c => `<span class="cr-page${c.verifie === false ? ' cr-page-alerte' : ''}">${escapeHtml(libelleCitationRelecture(c).texte)}${c.verifie === false ? ' ?' : ''}</span>`).join(' ')
      : (item.citations || []).map(pastilleCitationRelecture).join('');
    return `<div class="cr-ligne niveau-${item.niveau}" data-theme="${escapeAttr(item.themeCle || '')}"${item.uid && !impression ? ` id="audit-constat-${escapeAttr(item.uid)}"` : ''}>
      <span class="dot-label ${n.dl} cr-niveau" title="${n.texte}">${icone(n.icone)}</span>
      <div class="cr-corps">
        <div class="cr-intitule"><span class="cr-theme">${escapeHtml(item.theme)}</span>${escapeHtml(item.intitule)}${item.base_legale ? `<span class="cr-base"> · ${escapeHtml(item.base_legale)}</span>` : ''}</div>
        ${item.commentaire ? `<p class="cr-commentaire">${escapeHtml(item.commentaire)}</p>` : ''}
        ${citations ? `<div class="cr-citations">${citations}</div>` : ''}
        ${pied}
      </div>
    </div>`;
  }

  // Les blocs du compte rendu (après l'en-tête de santé et les tuiles) : alertes, à surveiller, intitulés seuls, validé.
  function renderCompteRenduRelecture(plan, impression) {
    const bloc = (cle, titre, items, vide) => `<section class="cr-bloc cr-${cle}" id="relecture-section-${cle}">
        <h3 class="cr-titre"><span>${titre}</span><span class="cr-compte">${items.length}</span></h3>
        ${items.length ? items.map(i => ligneCompteRenduRelecture(i, impression)).join('') : `<p class="hint cr-vide">${vide}</p>`}
      </section>`;
    const nonDetailles = plan.nonDetailles.length ? `<section class="cr-bloc cr-non-detailles">
        <h3 class="cr-titre"><span>Également à surveiller</span><span class="cr-compte">${plan.nonDetailles.length}</span></h3>
        <p class="cr-liste-courte">${plan.nonDetailles.map(i => `<span class="cr-puce niveau-${i.niveau}">${escapeHtml(i.intitule)}</span>`).join(' · ')}</p>
      </section>` : '';
    const nbValides = plan.valides.reduce((s, v) => s + v.points.length, 0) + plan.validesReste;
    const valides = `<section class="cr-bloc cr-valides" id="relecture-section-valides">
        <h3 class="cr-titre"><span>Validé</span><span class="cr-compte">${nbValides}</span></h3>
        ${plan.valides.length ? plan.valides.map(v => `<p class="cr-valide-theme" data-theme="${escapeAttr(v.themeCle || '')}"><b>${escapeHtml(v.theme)}</b> : ${v.points.map(escapeHtml).join(' · ')}</p>`).join('') : '<p class="hint cr-vide">Aucun point validé.</p>'}
        ${plan.validesReste ? `<p class="hint cr-valide-reste">… et ${plan.validesReste} autre(s) point(s) validé(s)${impression ? '' : ', visibles dans le détail de chaque thème (tuiles ci-dessus)'}.</p>` : ''}
      </section>`;
    return `${bloc('alertes', 'Alertes', plan.alertes, 'Aucun point critique.')}
      ${bloc('surveiller', 'À surveiller', plan.surveiller, 'Rien à surveiller.')}
      ${nonDetailles}
      ${valides}`;
  }

  // Le plan du bilan courant, à partir de ce que renderTableauDeBordRelecture a calculé (sections effectives, constats
  // CLAIRE affichés, contradictions, anomalies). `sectionsEffectives` : [{ cle, titre, lignesEff: [{…, niveau}] }].
  function planBilanCourantRelecture(sectionsEffectives, constatsClaire, contradictions, anomalies, synthese) {
    const niveauConstat = (c) => (c.retour && c.retour.verdict === 'faux_positif') ? 'na' : niveauDepuisGraviteRelecture(c.gravite);
    return planCompteRenduRelecture({
      synthese,
      sections: sectionsEffectives.map(s => ({ cle: s.cle, titre: s.titre, lignes: s.lignesEff.map(l => ({
        id: l.id, intitule: l.intitule, niveau: l.niveau, commentaire: l.commentaire, citations: l.citations, base_legale: l.base_legale, uid: 'g-' + l.id })) })),
      claire: constatsClaire.map(c => ({ uid: c.uid || '', titre: c.titre, description: c.description || c.detail || '', niveau: niveauConstat(c), page: c.page, document: c.document, phrase: c.phrase })),
      contradictions: contradictions.map(c => ({ uid: c.uid, titre: c.titre, description: c.description, niveau: niveauConstat(c),
        clauses: [c.contradiction && c.contradiction.clause_a, c.contradiction && c.contradiction.clause_b].filter(Boolean) })),
      anomalies: anomalies.map(c => ({ uid: c.uid, titre: c.titre, description: c.description, niveau: niveauConstat(c), citations: (c.anomalie && c.anomalie.citations) || [] }))
    });
  }

  // ---- Impression A4 (recto verso au plus) ----------------------------------------------------
  // Le gabarit est écrit dans #relecture-cr-print (masqué à l'écran, seul imprimé — voir @media print) : en-tête (acte,
  // type de bien, date, verdict et compteurs), résumé court, alertes, à surveiller, intitulés seuls, validé, pied. Les
  // pastilles de page y sont du texte. Le bouton « Imprimer (A4) » du bilan et Ctrl+P donnent la même feuille.
  let dernierPlanRelecture = null;
  let enTeteCompteRenduRelecture = null;

  function htmlImpressionCompteRenduRelecture(plan, entete) {
    const n = NIVEAUX_RELECTURE_OUTIL2[entete.niveau] || NIVEAUX_RELECTURE_OUTIL2.valide;
    const v = VERDICTS_SANTE_RELECTURE[entete.niveau] || VERDICTS_SANTE_RELECTURE.valide;
    const c = entete.compte || {};
    return `<div class="cr-print-tete">
        <div>
          <h1>${escapeHtml(entete.titre)}</h1>
          <p class="cr-print-sous">${[entete.typeBien, entete.dossier, `Relecture du ${escapeHtml(entete.date)}`].filter(Boolean).map(x => escapeHtml(x)).join(' · ')}</p>
        </div>
        <div class="cr-print-verdict niveau-${entete.niveau}">
          <span class="dot-label ${n.dl}">${icone(n.icone)}${v.titre}</span>
          <span class="cr-print-compteurs"><b class="c-critique">${c.critique || 0}</b> critique(s) · <b class="c-surveiller">${c.surveiller || 0}</b> à surveiller · <b class="c-valide">${c.valide || 0}</b> validé(s)</span>
        </div>
      </div>
      ${plan.resume ? `<p class="cr-print-resume">${escapeHtml(plan.resume)}</p>` : ''}
      ${renderCompteRenduRelecture(plan, true)}
      <p class="cr-print-pied">Aide à la relecture établie par CLAIRE le ${escapeHtml(entete.date)} : chaque point est une proposition, citée page à l'appui, que le notaire vérifie et tranche. Les données identifiantes ont été masquées avant l'analyse.</p>`;
  }

  function imprimerCompteRenduRelecture() {
    const zone = document.getElementById('relecture-cr-print');
    if (!zone || !dernierPlanRelecture || !enTeteCompteRenduRelecture) {
      afficherToast('Aucun bilan de relecture à imprimer.', 'OK', null);
      return;
    }
    zone.innerHTML = htmlImpressionCompteRenduRelecture(dernierPlanRelecture, enTeteCompteRenduRelecture);
    window.print();
  }
