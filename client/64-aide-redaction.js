  // ---- Aide à la rédaction de l'acte (étude 12/10) ----
  // Outil « Aide à la rédaction » : le passage de l'acte où l'on se trouve (collé depuis Word, puis relevé seul par le relais
  // Word), la clause reconnue et, pour chaque blanc « --- » de la trame d'Authentic, la valeur du dossier à y mettre — tirée de la
  // fiche et des pièces du commun (rapport de diagnostic lu sur le NAS). Catalogue, lecteurs et lettres : commun/redaction.js.
  // Trame inconnue : l'IA désigne le champ de chaque blanc parmi la liste fermée (POST /api/assistant/correspondance-acte), sans
  // jamais recevoir une valeur du dossier. Rien n'est écrit dans la fiche ; dans Word, seulement le « --- » choisi, par « Insérer dans
  // Word » (relais du poste, 0.219.0), sinon chaque valeur se copie d'un clic.

  var aideActe = { dossierId: '', passage: '', ia: null, iaEnCours: false, iaErreur: '', lecture: {}, minuterie: null,
    word: { etat: null, n: -1, passage: '', paragraphe: '', minuterie: null, vus: {}, attente: {}, gen: 0, enCours: '' } };

  function initAideActe() {
    if (!aideActe.dossierId && dossierOuvert) aideActe.dossierId = dossierOuvert;
    renderAideActe();
    suivreWordAideActe();
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
    const pieces = (lecture && lecture.pieces) || {};
    const l = pieces.ddt && !pieces.ddt.erreur ? pieces.ddt : (lecture && lecture.ddt) || null;
    const cheminDdt = (pieces.ddt && pieces.ddt.chemin) || (lecture && lecture.chemin);
    if (l) {
      const src = (page) => ({ chemin: cheminDdt, page });
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
    // Les autres pièces lues : chacune ouvre sa source d'un clic ; une pièce à part (état des risques) passe avant le rapport.
    const lu = (cle) => (pieces[cle] && !pieces[cle].erreur ? pieces[cle] : null);
    const depuis = (p) => ({ chemin: p.chemin, page: 1 });
    const cu = lu('cu');
    if (cu) { poser('cu_numero', cu.numero, cu.libelle, depuis(cu)); poser('cu_date', dateActe(cu.date), cu.libelle, depuis(cu)); poser('cu_zone', cu.zone, cu.libelle, depuis(cu)); }
    const ren = lu('renonciation');
    if (ren) {
      poser('dia_numero', ren.numero, ren.libelle, depuis(ren));
      poser('dia_envoi_date', dateActe(ren.dateDia), ren.libelle, depuis(ren));
      poser('dia_presentation_date', dateActe(ren.receptionMairie), ren.libelle + ' · reçue en mairie', depuis(ren));
      poser('dia_renonciation_date', dateActe(ren.dateRenonciation), ren.libelle, depuis(ren));
    }
    const erp = lu('erp');
    if (erp) { poser('erp_date', dateActe(erp.date), erp.libelle, depuis(erp)); poser('erp_risques', erp.risques, erp.libelle, depuis(erp)); }
    const ass = lu('assainissement');
    if (ass) { poser('assainissement_date', dateActe(ass.date), ass.libelle, depuis(ass)); poser('assainissement_conclusion', ass.conclusion, ass.libelle, depuis(ass)); }
    const per = lu('peril');
    if (per) { poser('peril_date', dateActe(per.date), per.libelle, depuis(per)); poser('peril_conclusion', per.conclusion, per.libelle, depuis(per)); }
    return v;
  }

  // Pièces lues pour l'acte (étude 12/10 : « tu as tout sur le commun ») : clé de la checklist (ou motif du nom pour une pièce
  // hors checklist) → lecteur de commun/redaction.js. Scans sans texte : OCR des premières pages, comme Claire Scan.
  var PIECES_AIDE_ACTE = [
    { cle: 'ddt', piece: 'diagnosticsTechniques', libelle: 'Rapport de diagnostic', pages: 120, lire: (pages) => lireDossierDiagnostic(pages) },
    { cle: 'erp', piece: 'erp', libelle: 'État des risques', pages: 3, lire: (pages) => lireEtatRisques(pages.join(' ')) },
    { cle: 'cu', piece: 'certificatUrbanisme', libelle: 'Certificat d’urbanisme', pages: 3, lire: (pages) => lireCertificatUrbanisme(pages.join(' ')) },
    { cle: 'renonciation', piece: 'renonciationPreemption', libelle: 'Renonciation au droit de préemption', pages: 3, lire: (pages) => lireRenonciationPreemption(pages.join(' ')) },
    { cle: 'assainissement', piece: 'reponseAssainissement', libelle: 'Courrier d’assainissement', pages: 2, lire: (pages) => lireCourrierAssainissement(pages.join(' ')) },
    { cle: 'peril', nom: /p[ée]ril|insalubrit/i, libelle: 'Certificat de non-péril', pages: 2, lire: (pages) => lireCertificatPeril(pages.join(' ')) }
  ];

  // Le texte des premières pages d'un PDF du NAS ; une page sans texte (scan) passe par l'OCR.
  async function texteParPageAideActe(chemin, maxPages) {
    const pdf = await ouvrirPdfNas(chemin);
    const pages = [];
    let worker = null;
    try {
      for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
        let t = (await (await pdf.getPage(p)).getTextContent()).items.map(it => it.str).join(' ');
        if (t.trim().length < 40 && p <= 3) {
          if (worker === null) worker = (await creerWorkerOcr()) || false;
          if (worker) t = (await ocrPage(pdf, p, worker)) || t;
        }
        pages.push(t);
      }
    } finally {
      if (worker) { try { await worker.terminate(); } catch (e) { /* déjà arrêté */ } }
    }
    return pages;
  }

  async function lirePiecesAideActe() {
    const d = dossierAideActe();
    if (!d) return;
    if (!d.nasDossier) { aideActe.lecture[d.id] = { etat: 'Dossier non relié au NAS : seules les données de la fiche sont proposées.', pieces: {} }; renderAideActe(); return; }
    const lecture = { etat: 'Lecture des pièces du NAS…', pieces: {} };
    aideActe.lecture[d.id] = lecture;
    renderAideActe();
    let fichiersNas = null;
    for (const def of PIECES_AIDE_ACTE) {
      let chemin = def.piece ? cheminFichierPieceAssistant(d, def.piece) : '';
      if (!chemin && def.nom) {
        try { if (fichiersNas === null) fichiersNas = await listerFichiersNas(d); } catch (e) { fichiersNas = []; }
        const f = fichiersNas.find(x => def.nom.test(x.nom || ''));
        if (f) chemin = cheminNasComplet(d, f.chemin);
      }
      if (!chemin) continue;
      try {
        lecture.pieces[def.cle] = { chemin, libelle: def.libelle, ...def.lire(await texteParPageAideActe(chemin, def.pages)) };
      } catch (e) {
        lecture.pieces[def.cle] = { chemin, libelle: def.libelle, erreur: true };
      }
    }
    const lues = Object.values(lecture.pieces).filter(x => !x.erreur).map(x => x.libelle);
    const ratees = Object.values(lecture.pieces).filter(x => x.erreur).map(x => x.libelle);
    lecture.etat = (lues.length ? 'Lu sur le NAS : ' + lues.join(', ') + '.' : 'Aucune pièce lisible retrouvée sur le NAS.') + (ratees.length ? ' Illisible : ' + ratees.join(', ') + '.' : '');
    if (lecture.pieces.ddt && !lecture.pieces.ddt.erreur) noterVerificationPoste('aide-redaction-ddt', { ok: true });
    else if (lecture.pieces.ddt) noterVerificationPoste('aide-redaction-ddt', { ok: false, message: 'rapport illisible' });
    const autre = Object.keys(lecture.pieces).find(k => k !== 'ddt');
    if (autre) noterVerificationPoste('aide-redaction-pieces', lecture.pieces[autre].erreur ? { ok: false, message: 'pièce illisible' } : { ok: true });
    if (dossierAideActe() && dossierAideActe().id === d.id) renderAideActe();
  }

  // `depuisWord` : passage relevé par le relais — l'IA n'est jamais appelée seule pour chaque paragraphe où passe le curseur
  // (relecture 0.219.0 : coût, débit de la clé), seulement par le bouton « Demander à l'IA ».
  function passageAideActe(texte, depuisWord) {
    aideActe.passage = String(texte || '');
    aideActe.ia = null;
    aideActe.iaErreur = '';
    renderResultatAideActe();
    clearTimeout(aideActe.minuterie);
    if (!depuisWord) aideActe.minuterie = setTimeout(demanderIaAideActe, 900);
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
    // Un autre passage collé pendant l'appel : sa demande à l'IA est faite maintenant (relecture 0.218.0).
    if (passage !== aideActe.passage) demanderIaAideActe();
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

  function ligneValeurAideActe(cle, v, titre, indexBlanc) {
    const inserer = v && indexBlanc !== undefined && wordInsertionPossibleAideActe()
      ? `<wa-button variant="brand" size="s" type="button" onclick="insererWordAideActe(${Number(indexBlanc)})">Insérer dans Word</wa-button>` : '';
    return `<div class="red-ligne">
        <div class="red-ligne-tete"><span class="red-libelle">${escapeHtml(titre || libelleChampActe(cle))}</span>
          ${v ? `<span class="red-source">${escapeHtml(v.source)}${v.chemin ? ` · <button type="button" class="lien-action" onclick="ouvrirSourceAideActe('${escapeOnclickArg(cle)}')">voir${v.page ? ' p. ' + v.page : ''}</button>` : ''}</span>` : ''}</div>
        <div class="red-ligne-valeur">${v ? `<span class="red-valeur">${escapeHtml(v.valeur)}</span>
          ${inserer}<wa-button appearance="outlined" size="s" type="button" onclick="copierValeurAideActe('${escapeOnclickArg(cle)}')">${icone('copier')} Copier</wa-button>`
          : '<span class="red-vide">Pas trouvé : à compléter</span>'}</div>
      </div>`;
  }

  function renderResultatAideActe() {
    const zone = document.getElementById('red-resultat');
    if (!zone) return;
    const d = dossierAideActe();
    if (!aideActe.passage.trim()) { zone.innerHTML = '<p class="red-vide">Placez le curseur de Word dans le passage de l’acte (relais Word) ou collez-le ici : CLAIRE reconnaît la clause et propose la valeur de chaque « --- ».</p>'; return; }
    const r = blancsAideActe();
    const valeurs = valeursActeDossier(d, d && aideActe.lecture[d.id]);
    const demanderIa = !aideActe.iaEnCours && !aideActe.ia && r.trous.some(t => !t.champ)
      ? '<wa-button appearance="outlined" size="s" type="button" onclick="demanderIaAideActe()">Demander à l’IA</wa-button>' : '';
    const tete = `<div class="red-clause"><span class="section-eyebrow">Clause</span> <b>${escapeHtml(r.libelle || 'Non reconnue')}</b>
      ${aideActe.iaEnCours ? '<span class="red-note">L’IA cherche les champs…</span>' : aideActe.iaErreur ? `<span class="red-note">${escapeHtml(aideActe.iaErreur)}</span>` : ''}${demanderIa}</div>`;
    if (!r.trous.length) { zone.innerHTML = tete + '<p class="red-vide">Aucun blanc « --- » dans ce passage.</p>'; return; }
    zone.innerHTML = tete + r.trous.map((t, i) => {
      const titre = `Blanc ${i + 1}${t.champ ? ' · ' + libelleChampActe(t.champ) : ''}${t.parIa ? ' (désigné par l’IA)' : ''}`;
      // Champ choisi par l'IA : averti en clair, la valeur se vérifie avant d'être copiée (relecture 0.218.0).
      if (t.champ && t.parIa) return `<p class="red-alerte">Blanc ${i + 1} : champ choisi par l’IA, à vérifier.</p>` + ligneValeurAideActe(t.champ, valeurs[t.champ], titre, i);
      return t.champ ? ligneValeurAideActe(t.champ, valeurs[t.champ], titre, i)
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
    zone.innerHTML = `<div class="red-etat">${lecture.etat ? escapeHtml(lecture.etat) : ''}
        <wa-button appearance="plain" size="s" class="bouton-discret" type="button" onclick="lirePiecesAideActe()">${icone('rotate-ccw')} Relire les pièces</wa-button></div>`
      + groupes.map(g => {
        const champs = CHAMPS_ACTE.filter(c => c.groupe === g);
        const connus = champs.filter(c => valeurs[c.cle]);
        return `<section class="red-groupe"><h3 class="section-eyebrow">${escapeHtml(g)} <span class="red-compte">${connus.length}/${champs.length}</span></h3>
          ${champs.map(c => ligneValeurAideActe(c.cle, valeurs[c.cle])).join('')}</section>`;
      }).join('');
  }

  // ---- Relais Word (0.219.0, étude 12/10 : « il faut aussi que CLAIRE sache où je suis sans avoir à faire de copier-coller ») ----
  // Le relais du poste (server/src/relaisWord.js) envoie au serveur le paragraphe où se trouve le curseur de Word ; l'écran le
  // relit chaque seconde tant qu'il est affiché et le prend comme passage. « Insérer dans Word » demande au relais de remplacer
  // le n-ième « --- » de ce paragraphe (Ctrl+Z dans Word l'annule).

  // Depuis 0.221.1 (étude : « l'antivirus bloque le relais Word ») : un programme, CLAIRE-relais.exe, plus de script .vbs.
  var TEXTE_INSTALLATION_RELAIS = 'Ouvrez « CLAIRE-relais.exe » (le navigateur peut demander de le conserver). Windows peut afficher « Windows a protégé votre ordinateur » : « Informations complémentaires », puis « Exécuter quand même ». Un message confirme l’installation ; le relais démarre aussitôt, puis à chaque ouverture de session. L’antivirus doit l’autoriser (exclusion demandée à Fichorga).';

  function posteRelaisWordAideActe() {
    return utilisateurPoste ? clePosteAppels(utilisateurPoste) : '';
  }

  // Pure : le passage affiché pour un relevé du relais (intitulé au-dessus, puis le paragraphe).
  function passageDepuisWord(titre, paragraphe) {
    return (titre ? titre + '\n\n' : '') + String(paragraphe || '');
  }

  // Pure : le rang du blanc parmi tous les « --- » (trois tirets ou plus, ignorés compris) du paragraphe — ce que compte le relais.
  function occurrenceBlancWord(passage, paragraphe, indexBlanc) {
    const decalage = String(passage).length - String(paragraphe).length;
    if (decalage < 0 || String(passage).slice(decalage) !== String(paragraphe)) return -1;
    const re = /-{3,}/g;
    let m; let n = 0;
    while ((m = re.exec(paragraphe))) {
      if (m.index + decalage === indexBlanc) return n;
      n++;
    }
    return -1;
  }

  // Une insertion à la fois (la suivante attend le paragraphe relu : le premier « --- » remplacé change le paragraphe) ; un
  // paragraphe de 4 000 caractères ou plus est tronqué par le relais : copier la valeur.
  function wordInsertionPossibleAideActe() {
    const w = aideActe.word;
    return !!(w.etat && w.etat.actif && w.etat.word && w.paragraphe && w.paragraphe.length < 3990 && !w.enCours && aideActe.passage === w.passage);
  }

  async function suivreWordAideActe() {
    const w = aideActe.word;
    clearTimeout(w.minuterie);
    // Une seule relève à la fois : un retour sur l'écran pendant une requête n'en lance pas une seconde (relecture 0.219.0).
    const gen = ++w.gen;
    if (ongletActuel !== 'redaction') return;
    const poste = posteRelaisWordAideActe();
    if (poste) {
      try {
        const r = await fetchAvecAuth('/api/relais-word/etat?poste=' + encodeURIComponent(poste));
        if (gen !== w.gen) return;
        if (r.ok) appliquerEtatWordAideActe(await r.json());
      } catch (e) { /* serveur injoignable : relu à la seconde suivante */ }
      if (gen !== w.gen) return;
    } else if (w.etat !== null) { w.etat = null; renderWordAideActe(); }
    if (ongletActuel === 'redaction') w.minuterie = setTimeout(suivreWordAideActe, document.hidden ? 5000 : 1000);
  }

  function appliquerEtatWordAideActe(etat) {
    const w = aideActe.word;
    const avant = JSON.stringify(w.etat && { a: w.etat.actif, w: w.etat.word, i: w.etat.installe });
    w.etat = etat;
    let redessiner = avant !== JSON.stringify({ a: etat.actif, w: etat.word, i: etat.installe });
    const champ = document.getElementById('red-passage');
    // Une saisie en cours dans la zone du passage n'est jamais écrasée ; le paragraphe de Word est pris dès qu'elle cesse.
    if (etat.actif && etat.paragraphe && etat.n !== w.n && !(champ && document.activeElement === champ)) {
      w.n = etat.n;
      w.paragraphe = etat.paragraphe;
      w.passage = passageDepuisWord(etat.titre, etat.paragraphe);
      if (champ) champ.value = w.passage;
      passageAideActe(w.passage, true);
      redessiner = false;
    }
    for (const r of etat.resultats || []) {
      if (w.vus[r.id] || !w.attente[r.id]) continue;
      w.vus[r.id] = true;
      delete w.attente[r.id];
      if (w.enCours === r.id) { w.enCours = ''; redessiner = true; }
      afficherToast(r.ok ? 'Inséré dans Word (Ctrl+Z dans Word pour l’annuler).' : 'Word : ' + (r.message || 'insertion refusée.'), 'OK', null);
    }
    if (redessiner) renderResultatAideActe();
    renderWordAideActe();
  }

  async function insererWordAideActe(indexBlanc) {
    const w = aideActe.word;
    const d = dossierAideActe();
    const trou = blancsAideActe().trous[indexBlanc];
    const v = trou && trou.champ && valeursActeDossier(d, d && aideActe.lecture[d.id])[trou.champ];
    const occurrence = trou ? occurrenceBlancWord(aideActe.passage, w.paragraphe, trou.index) : -1;
    if (!v || occurrence < 0 || !wordInsertionPossibleAideActe()) { afficherToast('Insertion impossible : le passage ne vient plus de Word.', 'OK', null); return; }
    try {
      const r = await fetchAvecAuth('/api/relais-word/inserer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poste: posteRelaisWordAideActe(), valeur: v.valeur, occurrence, attendu: w.paragraphe }) });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corps.erreur || 'statut ' + r.status);
      w.attente[corps.id] = true;
      w.enCours = corps.id;
      renderResultatAideActe();
      // Sans réponse du relais (Word occupé, relais arrêté), le bouton revient au bout de 20 s.
      setTimeout(() => { if (w.enCours === corps.id) { w.enCours = ''; renderResultatAideActe(); } }, 20000);
    } catch (e) {
      afficherToast('Insertion impossible : ' + (e.message || 'serveur injoignable') + '.', 'OK', null);
    }
  }

  // Relais CLAIRE du poste (Word et appels 3CX) : le code d'installation de ce collaborateur (copié dans le presse-papiers, le
  // programme le lit à l'ouverture) puis le programme, le même pour tous les postes (12/10 au soir : exclusion de l'antivirus par
  // empreinte). `suite` = ce que le relais apporte, dit après l'installation.
  async function installerRelaisClaire(suite) {
    const poste = utilisateurPoste ? clePosteAppels(utilisateurPoste) : '';
    if (!poste) { afficherToast('Choisissez d’abord le collaborateur de ce poste.', 'OK', null); return; }
    try {
      const rc = await fetchAvecAuth('/api/relais-word/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poste }) });
      const corps = await rc.json().catch(() => ({}));
      if (!rc.ok || !corps.code) throw new Error(corps.erreur || 'statut ' + rc.status);
      const copie = copierTexteSilencieux(corps.code);
      const r = await fetchAvecAuth('/api/relais-word/programme');
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).erreur) || 'statut ' + r.status);
      const blob = await r.blob();
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = 'CLAIRE-relais.exe';
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
      // Le code toujours affiché (relecture 0.221.2) : si le presse-papiers a changé avant l'ouverture du programme, il le demande.
      afficherInfoAction('Relais téléchargé', TEXTE_INSTALLATION_RELAIS
        + (copie ? ' Le code d’installation de ce poste est copié : ouvrez le programme tout de suite, il le lit seul.' : '')
        + ' Si le programme demande le code, collez : ' + corps.code
        + (suite ? ' — ' + suite : ''));
    } catch (e) {
      afficherToast('Téléchargement du relais impossible : ' + (e.message || 'erreur') + '.', 'OK', null);
    }
  }

  // Word relié par une MACRO (étude 12/10 : « trouve un autre moyen pour le relais Word » — Panda met le programme en
  // quarantaine) : le module VBA de ce poste (server/src/macroWordRelais.js), à coller une fois dans un modèle à part, CLAIRE.dotm (dossier STARTUP de Word), jamais dans Normal.
  async function relierWordAideActe() {
    const poste = posteRelaisWordAideActe();
    if (!poste) { afficherToast('Choisissez d’abord le collaborateur de ce poste.', 'OK', null); return; }
    try {
      const r = await fetchAvecAuth('/api/relais-word/macro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poste }) });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok || !corps.macro) throw new Error(corps.erreur || 'statut ' + r.status);
      const zone = document.getElementById('red-macro-code');
      if (zone) zone.value = corps.macro;
      document.getElementById('red-macro-overlay').style.display = 'flex';
      if (copierTexteSilencieux(corps.macro)) afficherToast('Code de la macro copié : collez-le dans Word (étapes dans la fenêtre).', 'OK', null);
    } catch (e) {
      afficherToast('Macro Word indisponible : ' + (e.message || 'erreur') + '.', 'OK', null);
    }
  }

  function copierMacroAideActe() {
    const zone = document.getElementById('red-macro-code');
    if (!zone || !zone.value) return;
    zone.focus();
    zone.select();
    afficherToast(copierTexteSilencieux(zone.value) ? 'Code copié : collez-le dans Word.' : 'Copie impossible : sélectionnez le code (Ctrl+A) puis Ctrl+C.', 'OK', null);
  }

  function fermerMacroAideActe() {
    const o = document.getElementById('red-macro-overlay');
    if (o) o.style.display = 'none';
  }

  document.addEventListener('keydown', (e) => {
    const o = document.getElementById('red-macro-overlay');
    if (e.key === 'Escape' && o && o.style.display !== 'none') fermerMacroAideActe();
  });

  function renderWordAideActe() {
    const zone = document.getElementById('red-word');
    if (!zone) return;
    const e = aideActe.word.etat;
    const relier = (texte) => `<wa-button appearance="plain" size="s" class="bouton-discret" type="button" onclick="relierWordAideActe()">${texte}</wa-button>`;
    let html;
    if (!posteRelaisWordAideActe()) html = '<span class="red-note">Relais Word : choisissez le collaborateur de ce poste.</span>';
    else if (!e) html = '<span class="red-note">Relais Word…</span>';
    else if (!e.installe) html = `<span class="dot-label dl-neutre"><span class="dot"></span>Word non suivi</span> ${relier('Relier Word')}`;
    else if (!e.actif) html = `<span class="dot-label dl-urgent"><span class="dot"></span>Word ne répond pas</span> ${relier('Relier Word de nouveau')}${infoBulle('La macro démarre à l’ouverture de Word : fermez Word et rouvrez-le. Si rien ne change, reliez Word de nouveau et remplacez le code du module CLAIRE (Ctrl+A puis Ctrl+V) — le code change à chaque fois.')}`;
    else if (!e.word) html = '<span class="dot-label dl-pret"><span class="dot"></span>Word n’est pas ouvert (ou aucun document)</span>';
    else html = '<span class="dot-label dl-success"><span class="dot"></span>Suit le curseur de Word</span>' + infoBulle('Le paragraphe où se trouve le curseur de Word s’affiche seul, avec son intitulé. Cliquez dans un autre paragraphe de Word : CLAIRE suit.');
    if (zone.innerHTML !== html) zone.innerHTML = html;
  }
