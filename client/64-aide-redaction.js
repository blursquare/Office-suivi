  // ---- Aide à la rédaction de l'acte (étude 12/10) ----
  // Outil « Aide à la rédaction » : le passage de l'acte où l'on se trouve (collé depuis Word, puis relevé seul par le relais
  // Word), la clause reconnue et, pour chaque blanc « --- » de la trame d'Authentic, la valeur du dossier à y mettre — tirée de la
  // fiche et des pièces du commun (rapport de diagnostic lu sur le NAS). Catalogue, lecteurs et lettres : commun/redaction.js.
  // Trame inconnue : l'IA désigne le champ de chaque blanc parmi la liste fermée (POST /api/assistant/correspondance-acte), sans
  // jamais recevoir une valeur du dossier. Rien n'est écrit ni dans la fiche ni dans Word : chaque valeur se copie d'un clic.

  var aideActe = { dossierId: '', passage: '', ia: null, iaEnCours: false, iaErreur: '', lecture: {}, minuterie: null };

  function initAideActe() {
    if (!aideActe.dossierId && dossierOuvert) aideActe.dossierId = dossierOuvert;
    renderAideActe();
    const d = dossierAideActe();
    if (d && !aideActe.lecture[d.id]) lirePiecesAideActe();
  }

  function dossierAideActe() {
    return aideActe.dossierId ? dossiers.find(x => x && x.id === aideActe.dossierId) || null : null;
  }

  function choisirDossierAideActe(id) {
    aideActe.dossierId = id || '';
    renderAideActe();
    if (dossierAideActe() && !aideActe.lecture[id]) lirePiecesAideActe();
  }

  // Pure : commune et numéro dans la voie d'une adresse normalisée (« CELLETTES (41120), 2 Bis route de Seur »).
  function communeEtNumeroAdresse(adresse) {
    const a = String(adresse || '');
    const m = /^\s*([^,(]+?)\s*\(\d{5}\)\s*,\s*(\d+\s*(?:bis|ter|quater|[A-Z](?![a-z]))?)?/i.exec(a);
    return { commune: m ? m[1].trim() : '', numero: m && m[2] ? m[2].replace(/\s+/g, ' ').trim() : '' };
  }

  // Les valeurs de l'acte pour un dossier : { cle: { valeur, source, chemin?, page? } }. `lecture` = le rapport de diagnostic lu
  // (lireDossierDiagnostic) et son chemin sur le NAS. Une valeur inconnue est absente.
  function valeursActeDossier(d, lecture) {
    const v = {};
    if (!d) return v;
    const poser = (cle, valeur, source, extra) => { if (valeur !== undefined && valeur !== null && String(valeur).trim()) v[cle] = { valeur: String(valeur), source, ...(extra || {}) }; };
    const rdv = d.rendezVousSignature ? String(d.rendezVousSignature).slice(0, 10) : '';
    poser('date_signature', jourMoisEnLettres(rdv), 'Rendez-vous de signature');
    poser('date_signature_chiffres', dateActe(rdv), 'Rendez-vous de signature');
    const prix = Number(d.prixVente) || 0;
    const mobilier = Number(d.prixMobilier) || 0;
    if (prix) {
      poser('prix_lettres', montantEnLettresActe(prix), 'Fiche · prix');
      poser('prix_chiffres', formaterPrixCentimes(prix), 'Fiche · prix');
      poser('base_imposition', formaterPrixCentimes(prix - mobilier), mobilier ? 'Prix moins le mobilier' : 'Fiche · prix');
    }
    if (mobilier) poser('mobilier_chiffres', formaterPrixCentimes(mobilier), 'Fiche · mobilier');
    if (Number(d.montantPret)) poser('pret_montant', formaterPrixCentimes(Number(d.montantPret)), 'Fiche · prêt');
    poser('avant_contrat_date', dateActe(d.dateAvantContrat), 'Fiche · avant-contrat');
    const { commune, numero } = communeEtNumeroAdresse(d.adresseBien || (d.bien && d.bien.adresse));
    poser('commune', commune, 'Fiche · adresse du bien');
    poser('numero_voie', numero, 'Fiche · adresse du bien');
    const dia = d.authentic && d.authentic.demandes && d.authentic.demandes.renonciationPreemption;
    if (dia && dia.date) poser('dia_envoi_date', dateActe(dia.date), 'Authentic · DIA envoyée');
    const h = d.honoraires || {};
    const ttc = Number(h.montantTTC || h.montant) || 0;
    if (ttc && !h.direct) poser('honoraires_chiffres', formaterPrixCentimes(ttc), 'Fiche · honoraires d’agence');
    if (ttc && h.charge) poser('honoraires_debiteur', h.charge === 'ACQUEREUR' ? 'l’acquéreur' : 'le vendeur', 'Fiche · honoraires d’agence');
    poser('agence_nom', d.nomAgence, 'Fiche · agence');
    poser('email_vendeur', d.emailVendeur, 'Fiche · email du vendeur');
    poser('email_acquereur', d.emailAcquereur, 'Fiche · email de l’acquéreur');
    const l = lecture && lecture.ddt;
    if (l) {
      const src = (page) => ({ chemin: lecture.chemin, page });
      const nom = 'Rapport de diagnostic';
      poser('diag_societe', l.societe, nom, src(1));
      poser('diag_operateur', l.operateur, nom, src(1));
      poser('diag_certification', [l.certification, l.organisme].filter(Boolean).join(' — '), nom, src(1));
      const g = l.diagnostics || {};
      for (const [type, cleDate, cleConclusion] of [['amiante', 'amiante_date', 'amiante_conclusion'], ['plomb', 'plomb_date'], ['termites', 'termites_date'],
        ['gaz', 'gaz_date', 'gaz_conclusion'], ['electricite', 'electricite_date', 'electricite_conclusion'], ['dpe', 'dpe_date'], ['erp', 'erp_date']]) {
        const x = g[type];
        if (!x) continue;
        poser(cleDate, dateActe(x.date), nom, src(x.page));
        if (cleConclusion) poser(cleConclusion, x.conclusion, nom + ' · synthèse', src(1));
      }
      if (l.dpe) {
        poser('dpe_numero', l.dpe.numero, nom + ' · DPE', src(g.dpe ? g.dpe.page : 1));
        poser('dpe_classe_energie', l.dpe.classeEnergie, `Calculée : ${l.dpe.energie} kWh/m²/an — à vérifier sur le DPE`, src(g.dpe ? g.dpe.page : 1));
        poser('dpe_classe_ges', l.dpe.classeGes, `Calculée : ${l.dpe.ges} kg CO₂/m²/an — à vérifier sur le DPE`, src(g.dpe ? g.dpe.page : 1));
      }
    }
    return v;
  }

  // Le rapport de diagnostic du dossier, lu sur le NAS (fichier retenu pour la pièce « Diagnostics techniques »).
  async function lirePiecesAideActe() {
    const d = dossierAideActe();
    if (!d) return;
    const chemin = cheminFichierPieceAssistant(d, 'diagnosticsTechniques');
    if (!chemin) { aideActe.lecture[d.id] = { etat: d.nasDossier ? 'Aucun rapport de diagnostic retrouvé sur le NAS.' : 'Dossier non relié au NAS.' }; renderAideActe(); return; }
    aideActe.lecture[d.id] = { etat: 'Lecture du rapport de diagnostic…' };
    renderAideActe();
    try {
      const pdf = await ouvrirPdfNas(chemin);
      const pages = [];
      for (let p = 1; p <= Math.min(pdf.numPages, 80); p++) pages.push((await (await pdf.getPage(p)).getTextContent()).items.map(it => it.str).join(' '));
      aideActe.lecture[d.id] = { chemin, ddt: lireDossierDiagnostic(pages), etat: '' };
      noterVerificationPoste('aide-redaction-ddt', { ok: true });
    } catch (e) {
      aideActe.lecture[d.id] = { etat: 'Rapport de diagnostic illisible : ' + (e.message || 'erreur') };
      noterVerificationPoste('aide-redaction-ddt', { ok: false, message: 'rapport illisible' });
    }
    if (dossierAideActe() && dossierAideActe().id === d.id) renderAideActe();
  }

  function passageAideActe(texte) {
    aideActe.passage = String(texte || '');
    aideActe.ia = null;
    aideActe.iaErreur = '';
    renderResultatAideActe();
    clearTimeout(aideActe.minuterie);
    aideActe.minuterie = setTimeout(demanderIaAideActe, 900);
  }

  function nomsPartiesAideActe(d) {
    const parts = (d && d.parties) || [];
    const noms = (role) => parts.filter(p => p && p.role === role).flatMap(p => [p.nom, p.nomUsage]).filter(Boolean);
    return { vendeurs: noms('VENDEUR'), acquereurs: noms('ACQUEREUR') };
  }

  // Les blancs du passage et le champ de chacun : le catalogue, puis l'IA pour ceux qu'il ne sait pas désigner.
  function blancsAideActe() {
    const d = dossierAideActe();
    const r = champsDuPassage(aideActe.passage, nomsPartiesAideActe(d));
    if (aideActe.ia && aideActe.ia.passage === aideActe.passage) {
      r.trous.forEach((t, i) => { if (!t.champ && aideActe.ia.blancs[i]) { t.champ = aideActe.ia.blancs[i]; t.parIa = true; } });
    }
    return r;
  }

  // Trame inconnue (ou blanc que le catalogue ne désigne pas) : l'IA choisit le champ de chaque blanc. Seuls le passage (noms
  // masqués par le serveur) et la liste des champs partent ; une valeur du dossier, jamais.
  async function demanderIaAideActe() {
    const r = blancsAideActe();
    if (!r.trous.length || r.trous.every(t => t.champ) || aideActe.iaEnCours) return;
    const passage = aideActe.passage;
    aideActe.iaEnCours = true;
    renderResultatAideActe();
    try {
      const rep = await fetchAvecAuth('/api/assistant/correspondance-acte', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passage, dossiers: dossiersPourAssistant(dossiers.filter(x => x && !x.archive)) }) });
      const corps = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(corps.erreur || `le serveur a répondu ${rep.status}`);
      if (passage === aideActe.passage) aideActe.ia = { passage, blancs: Array.isArray(corps.blancs) ? corps.blancs : [] };
    } catch (e) {
      if (passage === aideActe.passage) aideActe.iaErreur = e.message || 'IA indisponible';
    }
    aideActe.iaEnCours = false;
    renderResultatAideActe();
  }

  function copierValeurAideActe(cle) {
    const d = dossierAideActe();
    const v = valeursActeDossier(d, d && aideActe.lecture[d.id])[cle];
    if (!v) return;
    afficherToast(copierTexteSilencieux(v.valeur) ? 'Copié : collez-le dans Word à la place de « --- ».' : 'Copie impossible : sélectionnez la valeur à la main.', 'OK', null);
  }

  function ouvrirSourceAideActe(cle) {
    const d = dossierAideActe();
    const v = valeursActeDossier(d, d && aideActe.lecture[d.id])[cle];
    if (v && v.chemin) ouvrirFichierNas(v.chemin);
  }

  function libelleChampActe(cle) {
    const c = CHAMPS_ACTE.find(x => x.cle === cle);
    return c ? c.libelle : '';
  }

  function ligneValeurAideActe(cle, v, titre) {
    return `<div class="red-ligne">
        <div class="red-ligne-tete"><span class="red-libelle">${escapeHtml(titre || libelleChampActe(cle))}</span>
          ${v ? `<span class="red-source">${escapeHtml(v.source)}${v.chemin ? ` · <button type="button" class="lien-action" onclick="ouvrirSourceAideActe('${escapeOnclickArg(cle)}')">voir${v.page ? ' p. ' + v.page : ''}</button>` : ''}</span>` : ''}</div>
        <div class="red-ligne-valeur">${v ? `<span class="red-valeur">${escapeHtml(v.valeur)}</span>
          <wa-button appearance="outlined" size="s" type="button" onclick="copierValeurAideActe('${escapeOnclickArg(cle)}')">${icone('copier')} Copier</wa-button>`
          : '<span class="red-vide">Pas trouvé : à compléter</span>'}</div>
      </div>`;
  }

  function renderResultatAideActe() {
    const zone = document.getElementById('red-resultat');
    if (!zone) return;
    const d = dossierAideActe();
    if (!aideActe.passage.trim()) { zone.innerHTML = '<p class="red-vide">Collez le passage de l’acte où vous êtes : CLAIRE reconnaît la clause et propose la valeur de chaque « --- ».</p>'; return; }
    const r = blancsAideActe();
    const valeurs = valeursActeDossier(d, d && aideActe.lecture[d.id]);
    const tete = `<div class="red-clause"><span class="section-eyebrow">Clause</span> <b>${escapeHtml(r.libelle || 'Non reconnue')}</b>
      ${aideActe.iaEnCours ? '<span class="red-note">L’IA cherche les champs…</span>' : aideActe.iaErreur ? `<span class="red-note">${escapeHtml(aideActe.iaErreur)}</span>` : ''}</div>`;
    if (!r.trous.length) { zone.innerHTML = tete + '<p class="red-vide">Aucun blanc « --- » dans ce passage.</p>'; return; }
    zone.innerHTML = tete + r.trous.map((t, i) => {
      const titre = `Blanc ${i + 1}${t.champ ? ' · ' + libelleChampActe(t.champ) : ''}${t.parIa ? ' (désigné par l’IA)' : ''}`;
      return t.champ ? ligneValeurAideActe(t.champ, valeurs[t.champ], titre)
        : `<div class="red-ligne"><div class="red-ligne-tete"><span class="red-libelle">${escapeHtml(titre)}</span></div><div class="red-ligne-valeur"><span class="red-vide">Champ non reconnu</span></div></div>`;
    }).join('');
  }

  function renderAideActe() {
    const page = document.getElementById('onglet-redaction');
    if (!page) return;
    const select = document.getElementById('red-dossier');
    if (select) {
      const liste = dossiers.filter(x => x && !x.archive && !estSuccession(x)).sort((a, b) => libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'));
      select.innerHTML = '<option value="">Choisir un dossier…</option>' + liste.map(x => `<option value="${escapeAttr(x.id)}"${x.id === aideActe.dossierId ? ' selected' : ''}>${escapeHtml(libelleDossierAffiche(x))}</option>`).join('');
    }
    const champ = document.getElementById('red-passage');
    if (champ && champ.value !== aideActe.passage && document.activeElement !== champ) champ.value = aideActe.passage;
    renderResultatAideActe();
    const zone = document.getElementById('red-donnees');
    if (!zone) return;
    const d = dossierAideActe();
    if (!d) { zone.innerHTML = '<p class="red-vide">Choisissez le dossier de l’acte.</p>'; return; }
    const lecture = aideActe.lecture[d.id] || {};
    const valeurs = valeursActeDossier(d, lecture);
    const groupes = [...new Set(CHAMPS_ACTE.map(c => c.groupe))];
    zone.innerHTML = `<div class="red-etat">${lecture.etat ? escapeHtml(lecture.etat) : lecture.ddt ? 'Rapport de diagnostic lu.' : ''}
        <wa-button appearance="plain" size="s" class="bouton-discret" type="button" onclick="lirePiecesAideActe()">${icone('rotate-ccw')} Relire les pièces</wa-button></div>`
      + groupes.map(g => {
        const champs = CHAMPS_ACTE.filter(c => c.groupe === g);
        const connus = champs.filter(c => valeurs[c.cle]);
        return `<section class="red-groupe"><h3 class="section-eyebrow">${escapeHtml(g)} <span class="red-compte">${connus.length}/${champs.length}</span></h3>
          ${champs.map(c => ligneValeurAideActe(c.cle, valeurs[c.cle])).join('')}</section>`;
      }).join('');
  }
