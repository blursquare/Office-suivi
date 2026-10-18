  // ---- « Demander à CLAIRE » : les derniers documents reçus, et les ouvrir ----
  // Étude 12/10 : « permettre à Demander à CLAIRE d'accéder au dossier local et scan pour vérifier les dernières pièces ou scans
  // reçus et les ouvrir ». Trois sources, toutes déjà connues du poste : les pièces reconnues ou rangées (d.piecesTrouveesLe et le
  // fichier retenu sur le NAS), les scans du copieur (Claire Scan : à ranger, et rangés d'après le journal du serveur) et, pour un
  // dossier relié, les fichiers les plus récents de son dossier du NAS (GET /api/nas/fichiers?recents=N, reconnus ou non).
  // Ouvrir = un bouton dans la conversation : le navigateur n'ouvre un onglet que sur un clic (un scan à ranger s'ouvre dans
  // l'aperçu de Claire Scan, une pièce du NAS dans un onglet). Lecture seule : rien n'est écrit ni déplacé.

  var JOURS_DOCUMENTS_ASSISTANT = 14;
  var MAX_DOCUMENTS_ASSISTANT = 12;
  var MAX_FICHIERS_NAS_ASSISTANT = 10;
  var MAX_BOUTONS_DOCUMENTS_ASSISTANT = 6;
  // Documents rendus à l'agent : document_id → document (ouvrir_documents ne reçoit que ces identifiants, jamais un chemin).
  var documentsAgentConnus = {};

  // Chemin sur le NAS du fichier retenu pour une pièce reconnue ('' s'il n'est pas connu).
  function cheminFichierPieceAssistant(d, cle) {
    return fichierTrouve(d, cle === CLE_NOTIF_OFFRE_PRET ? NAS_CLE_OFFRE : NAS_CLE_PIECE(cle)) || '';
  }

  // Pure : les documents récents, du plus récent au plus ancien dans chaque groupe. `o` = { tous, perimetre, dossier, etat,
  // lectures, fichiersNas, maintenant }. Sans dossier : les pièces du périmètre et tous les scans ; avec : ceux de ce dossier.
  function documentsRecentsAssistant(o) {
    const maintenant = o.maintenant || Date.now();
    const d = o.dossier || null;
    const tous = o.tous || [];
    const parId = (id) => (id && tous.find(x => x && x.id === id)) || null;
    // Toutes les pièces de la période, puis la plus récente d'abord (relecture : couper avant le tri perdait des pièces récentes).
    const pieces = dernieresPiecesTrouvees(d ? [d] : (o.perimetre || []), maintenant, Infinity)
      .sort((a, b) => String(b.le || '').localeCompare(String(a.le || ''))).slice(0, MAX_DOCUMENTS_ASSISTANT)
      .map(e => ({ sorte: 'piece', libelle: libelleNotificationPiece(e.dossier, e.cle), dossier: e.dossier, le: e.le || '', nouvelle: !!e.nouvelle,
        personnalisee: pieceAjouteeAssistant(e.dossier, e.cle), chemin: (o.chemins && o.chemins(e.dossier, e.cle)) || '' }));
    const sc = scansPourCarte(o.etat, maintenant);
    const lectures = o.lectures || {};
    const aRanger = (sc.aRanger || []).map(s => {
      const l = lectures[cleScan(s)];
      const c = l && (l.choix || l.proposition);
      return { sorte: 'scan', libelle: (c && libelleTypeScan(c.type)) || 'Scan à identifier', dossier: parId(c && c.dossierId), le: s.date || '', nom: s.nom };
    // Un dossier nommé : ses scans, et ceux que ce poste n'a pas encore lus (pas de dossier proposé) — ils peuvent être les siens.
    }).filter(x => !d || !x.dossier || x.dossier.id === d.id).slice(0, MAX_DOCUMENTS_ASSISTANT);
    const ranges = (sc.ranges || []).map(j => ({ sorte: 'scan-range', libelle: libelleTypeScan(j.type) || 'Scan rangé', dossier: parId(j.dossierId),
      le: j.date || '', chemin: j.chemin ? String(j.chemin).replace(/\\/g, '/') : '', rubrique: j.rubrique || '', auto: !!j.auto }))
      .filter(x => !d || (x.dossier && x.dossier.id === d.id)).slice(0, MAX_DOCUMENTS_ASSISTANT);
    const fichiers = d && Array.isArray(o.fichiersNas) ? o.fichiersNas.slice(0, MAX_FICHIERS_NAS_ASSISTANT).map(f => ({
      sorte: 'fichier', libelle: String(f.nom || '').replace(/\.pdf$/i, ''), dossier: d, le: f.modifieLe || '', chemin: cheminNasComplet(d, f.chemin) })) : null;
    return { pieces, aRanger, ranges, fichiers };
  }

  // Vrai pour une pièce ajoutée à la main au dossier (libellé libre), faux pour une pièce de la checklist ou l'offre de prêt.
  function pieceAjouteeAssistant(d, cle) {
    if (cle === CLE_NOTIF_OFFRE_PRET) return false;
    try { const p = checklistPieces(d.typeVente, d).find(x => x.cle === cle); return !p || !!p.personnalisee; } catch (e) { return true; }
  }

  // Les fichiers les plus récents du dossier du NAS d'un dossier relié ; null sans lien ou si le NAS ne répond pas.
  async function fichiersRecentsNasAssistant(d) {
    if (!d || !d.nasDossier) return null;
    try {
      const r = await fetchAvecAuth('/api/nas/fichiers?recents=' + MAX_FICHIERS_NAS_ASSISTANT + '&dossier=' + encodeURIComponent(d.nasDossier));
      if (!r.ok) return null;
      return (await r.json()).fichiers || [];
    } catch (e) { return null; }
  }

  async function chargerDocumentsRecentsAssistant(d) {
    if (!etatScans.charge) { try { await chargerScans(true); } catch (e) { /* Claire Scan muet : les pièces suffisent */ } }
    return documentsRecentsAssistant({ tous: dossiers, perimetre: dossiersPerimetreDashboard(), dossier: d, etat: etatScans, lectures: lecturesScans,
      fichiersNas: d ? await fichiersRecentsNasAssistant(d) : null, chemins: cheminFichierPieceAssistant });
  }

  // Ouvre un document (dans le geste de l'utilisateur : clic sur un bouton).
  function ouvrirDocumentAssistant(doc) {
    if (!doc) return;
    if (doc.sorte === 'scan') { ouvrirApercuScan(doc.nom); return; }
    ouvrirFichierNas(doc.chemin);
  }

  function documentOuvrableAssistant(doc) { return !!(doc && (doc.sorte === 'scan' ? doc.nom : doc.chemin)); }

  // Pure : « 12 oct. » (ou « 12 oct. 9 h 31 » pour un scan).
  function quandDocumentAssistant(iso, avecHeure) {
    if (!iso) return '';
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const jour = t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return avecHeure ? `${jour} ${t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')}` : jour;
  }

  function boutonDocumentAssistant(doc) {
    const dossier = doc.dossier ? ' — ' + libelleDossierAffiche(doc.dossier) : '';
    return { libelle: `Ouvrir : ${doc.libelle}${dossier}`.slice(0, 80), action: () => ouvrirDocumentAssistant(doc) };
  }

  // Réponse de « Demander à CLAIRE » sans IA (intention derniers_documents).
  async function reponseDerniersDocumentsAssistant(d) {
    const r = await chargerDocumentsRecentsAssistant(d);
    const ligne = (doc, extra) => `<li><b>${escapeHtml(doc.libelle)}</b>${!d && doc.dossier ? ` — ${escapeHtml(libelleDossierAffiche(doc.dossier))}` : ''}${d && doc.sorte === 'scan' && !doc.dossier ? ' <span class="asst-note">dossier pas encore reconnu</span>' : ''}${extra || ''}${doc.le ? ` <span class="asst-note">${escapeHtml(quandDocumentAssistant(doc.le, doc.sorte !== 'piece'))}</span>` : ''}</li>`;
    const blocs = [];
    if (r.pieces.length) blocs.push(`<p>Pièces reçues ces ${JOURS_DOCUMENTS_ASSISTANT} derniers jours :</p><ul class="asst-liste">${r.pieces.map(x => ligne(x, x.nouvelle ? ' <span class="asst-note">nouvelle</span>' : '')).join('')}</ul>`);
    if (r.fichiers && r.fichiers.length) blocs.push(`<p>Derniers fichiers du dossier sur le NAS :</p><ul class="asst-liste">${r.fichiers.map(x => ligne(x)).join('')}</ul>`);
    if (r.aRanger.length) blocs.push(`<p>Scans à ranger dans Claire Scan :</p><ul class="asst-liste">${r.aRanger.map(x => ligne(x)).join('')}</ul>`);
    if (r.ranges.length) blocs.push(`<p>Scans rangés récemment :</p><ul class="asst-liste">${r.ranges.map(x => ligne(x)).join('')}</ul>`);
    const quoi = d ? `sur ${escapeHtml(libelleDossierAffiche(d))}` : 'sur vos dossiers';
    if (!blocs.length) {
      const nas = d && !d.nasDossier ? ' Ce dossier n’est pas relié au NAS.' : d && r.fichiers === null ? ' Le dossier du NAS n’a pas pu être lu.' : '';
      return { html: `<p>Aucun document reçu ces ${JOURS_DOCUMENTS_ASSISTANT} derniers jours ${quoi}, et aucun scan en attente.${escapeHtml(nas)}</p>`,
        boutons: [{ libelle: 'Claire Scan', action: () => definirOnglet('scans') }] };
    }
    // Les boutons « Ouvrir » : le plus récent de chaque groupe d'abord, puis les suivants.
    const groupes = [r.aRanger, r.pieces, r.fichiers || [], r.ranges].map(g => g.filter(documentOuvrableAssistant));
    const ouvrables = [];
    for (let i = 0; ouvrables.length < MAX_BOUTONS_DOCUMENTS_ASSISTANT && groupes.some(g => g[i]); i++) {
      groupes.forEach(g => { if (g[i] && ouvrables.length < MAX_BOUTONS_DOCUMENTS_ASSISTANT) ouvrables.push(g[i]); });
    }
    const boutons = ouvrables.map(boutonDocumentAssistant);
    boutons.push({ libelle: 'Claire Scan', action: () => definirOnglet('scans') });
    if (d) boutons.push({ libelle: 'Ouvrir la fiche', action: () => ouvrirDossierDepuisDashboard(d.id) });
    return { html: blocs.join(''), boutons };
  }

  // ---- Les deux outils de l'agent ----

  async function documentsRecentsAgent(dossierId) {
    const d = dossierId ? dossiers.find(x => x.id === dossierId) : null;
    if (dossierId && !d) return { erreur: 'aucun dossier avec cet id' };
    const r = await chargerDocumentsRecentsAssistant(d);
    let n = Object.keys(documentsAgentConnus).length;
    const vers = (doc, champs) => {
      let id;
      do { id = 'doc' + (++n); } while (documentsAgentConnus[id]);
      documentsAgentConnus[id] = doc;
      return { document_id: id, document: doc.libelle, recu_le: doc.le || '', ...(doc.dossier ? { dossier_id: doc.dossier.id, dossier: libelleDossierAffiche(doc.dossier) } : {}),
        ouvrable: documentOuvrableAssistant(doc), ...(champs || {}) };
    };
    return {
      periode: `${JOURS_DOCUMENTS_ASSISTANT} derniers jours`,
      claire_scan: etatScans.charge && etatScans.reglages && etatScans.reglages.actif ? 'actif' : 'non activé ou injoignable',
      // Un libellé de pièce ajoutée à la main peut commencer par un nom (« Lemoine attestation ») : il part précédé d'un mot
      // d'usage, pour que le masquage le voie hors de la tête de phrase.
      pieces_recues: r.pieces.map(x => vers(x, { nouvelle: x.nouvelle, ...(x.personnalisee ? { document: 'Pièce ajoutée : ' + x.libelle } : {}) })),
      scans_a_ranger: r.aRanger.map(x => vers(x, { dossier_propose: !!x.dossier })),
      scans_ranges: r.ranges.map(x => vers(x, { rubrique: rubriqueConnueAssistant(String(x.rubrique || '').split(/[\\/]/).pop()), range_seul: x.auto })),
      // Le NOM d'un fichier du NAS ne part jamais (il peut porter le nom d'un tiers en minuscules, que rien ne masquerait) :
      // seulement la pièce qu'il désigne si CLAIRE la reconnaît par son nom, et son sous-dossier.
      ...(d ? { fichiers_recents_du_dossier_nas: r.fichiers === null ? (d.nasDossier ? 'dossier du NAS illisible pour le moment' : 'dossier non relié au NAS')
        : r.fichiers.map(x => ({ ...vers(x), document: pieceFichierNasAssistant(d, x.libelle), sous_dossier: sousDossierFichierAssistant(d, x.chemin) })) } : {})
    };
  }

  // La pièce de la checklist qu'un nom de fichier désigne (même reconnaissance que le NAS), sinon « Document non reconnu ».
  function pieceFichierNasAssistant(d, nom) {
    try {
      const p = pieceDePieceJointe(nom, estSuccession(d) ? [] : checklistPieces(d.typeVente, d));
      if (p) return p.label;
      // L'avant-contrat n'est pas une pièce de la checklist (étude 13/10 : l'agent doit le trouver pour l'analyser).
      const n = normaliserNomPourMotif(nom);
      if (/\b(compromis|promesse)\b/i.test(n)) return /\b(projet|relecture)\b/i.test(n) ? 'Projet d’avant-contrat' : 'Avant-contrat (compromis ou promesse)';
      if (/\b(projet d acte|projet de vente|projet vente)\b/i.test(n)) return 'Projet d’acte';
      return 'Document non reconnu';
    } catch (e) { return 'Document non reconnu'; }
  }

  // Pure : une rubrique du dossier client ramenée à son nom d'usage (« 8 - COPRO et ETAT DATE » → « Copropriété ») ; un sous-dossier
  // au nom libre (« 3 - Dubreuil », un tiers) devient « autre sous-dossier » : il ne part jamais tel quel vers l'IA en ligne.
  var RUBRIQUES_CONNUES_ASSISTANT = [[/VENDEUR/, 'Vendeur'], [/ACQUEREUR/, 'Acquéreur'], [/TITRE/, 'Titre de propriété'], [/DIAGNOSTIC/, 'Diagnostics'],
    [/ENVIRONNEMENT/, 'Environnement'], [/HYPOTHECAIRE|FORMALITE/, 'Formalités hypothécaires'], [/TRAVAUX/, 'Travaux'], [/CONSTRUCTION/, 'Construction'],
    [/ETAT DATE/, 'État daté'], [/COPRO/, 'Copropriété'], [/^SRU$/, 'SRU'], [/^AAE$/, 'AAE'], [/PRET/, 'Prêt'], [/COMPTABILITE/, 'Comptabilité'], [/URBANISME/, 'Urbanisme']];
  function rubriqueConnueAssistant(nom) {
    const n = String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/^\s*\d+\s*[-–.)]?\s*/, '').replace(/[^A-Z0-9]+/g, ' ').trim();
    if (!n) return 'racine';
    const r = RUBRIQUES_CONNUES_ASSISTANT.find(([re]) => re.test(n));
    return r ? r[1] : 'autre sous-dossier';
  }

  // Pure : le premier sous-dossier d'un fichier dans le dossier client (« 2 - Vendeur » → « Vendeur »), « racine » à défaut.
  function sousDossierFichierAssistant(d, chemin) {
    const base = String((d && d.nasDossier) || '').replace(/\\/g, '/').replace(/\/+$/, '');
    let reste = String(chemin || '').replace(/\\/g, '/');
    if (base && reste.startsWith(base + '/')) reste = reste.slice(base.length + 1);
    const parties = reste.split('/');
    return parties.length > 1 ? rubriqueConnueAssistant(parties[0]) : 'racine';
  }

  function ouvrirDocumentsAgent(ids) {
    const docs = (Array.isArray(ids) ? ids : []).map(id => documentsAgentConnus[id]).filter(documentOuvrableAssistant).slice(0, MAX_BOUTONS_DOCUMENTS_ASSISTANT);
    if (!docs.length) return { erreur: 'aucun de ces documents n’est ouvrable : prends les document_id rendus par documents_recents (ouvrable: true)' };
    poserMessageAssistant('claire', `<p>${docs.length > 1 ? 'Les documents sont prêts à ouvrir' : 'Le document est prêt à ouvrir'} :</p>`, docs.map(boutonDocumentAssistant));
    return { fait: true, boutons_affiches: docs.length };
  }

  // Changer de conversation (ou de collaborateur) : les identifiants ne valent plus — la colonne de droite repart de zéro aussi
  // (seconde relecture 0.282.0 : « doc1 » d'une autre conversation ouvrait l'ancien PDF).
  function oublierDocumentsAgent() { documentsAgentConnus = {}; reinitialiserColonneAssistant(); }
