  // ==== Données d'un dossier Authentic (« Nouveau dossier ») ====
  //
  // Format commun { intitule, personnes, immeubles, parties, documents, infosAuthentic, origine } :
  // construit depuis les pages relevées par l'extension (dossiersDepuisRelevesAuthentic). L'import
  // d'un export ZIP (DATA.xml notaires.fr + pièces + Word de l'acte, 30/09) a été retiré le 02/10 à la
  // demande de l'étude : la lecture d'Authentic le remplace.

  // Qualité d'une partie du flux → rôle CLAIRE. « Disposant »/« Bénéficiaire » sont les termes
  // d'Authentic pour une vente (le vendeur « dispose » du bien).
  var ROLES_PARTIE_AUTHENTIC = {
    disposant: 'VENDEUR', vendeur: 'VENDEUR', promettant: 'VENDEUR', cedant: 'VENDEUR',
    beneficiaire: 'ACQUEREUR', acquereur: 'ACQUEREUR', cessionnaire: 'ACQUEREUR'
  };
  var TYPES_PARTIE_SUCCESSION = ['defunt', 'heritier', 'legataire', 'conjointsurvivant', 'ayantdroit', 'donataire', 'donateur'];

  function motCleAuthentic(s) { return normaliserPourRecherche(String(s || '')).replace(/[^a-z]/g, ''); }

  // Vente, succession ou autre, d'après l'intitulé et les qualités des parties. Pure.
  function typeAffaireAuthentic(donnees) {
    const d = donnees || {};
    const intitule = normaliserPourRecherche([d.intitule, d.acte && d.acte.intitule].filter(Boolean).join(' '));
    const types = (d.parties || []).map(p => motCleAuthentic(p.type));
    if (/(^|[^a-z])succ|succession|notoriete|declaration de succession/.test(intitule) || types.some(t => TYPES_PARTIE_SUCCESSION.includes(t))) return 'succession';
    if (/(^|[^a-z])(vte|vente|compromis|promesse)([^a-z]|$)/.test(intitule) || types.some(t => ROLES_PARTIE_AUTHENTIC[t])) return 'vente';
    return 'autre';
  }

  // Parties de la vente : par les références des parties quand Authentic les remplit, sinon par
  // l'intitulé du dossier (« VTE VENDEUR / ACQUÉREUR », convention de l'étude). Une personne qui
  // n'y figure pas (ex-conjoint, représentant…) n'est pas une partie. Pure.
  function partiesExportAuthentic(donnees) {
    const d = donnees || {};
    const personnes = (d.personnes || []).filter(p => p.nom);
    // Succession : chaque personne ouverte dans Authentic est une partie ; sa qualité (défunt,
    // héritier…) n'est pas devinée.
    if (typeAffaireAuthentic(d) === 'succession') {
      return personnes.map(p => Object.assign({
        nom: [p.prenom, p.nom].filter(Boolean).join(' '), role: 'PARTIE', qualiteActe: '',
        qualitePersonne: 'physique', representant: null, origine: 'authentic',
        source: { extrait: 'Authentic', index: null, page: null },
        emails: (p.emails || []).slice(), telephones: (p.telephones || []).slice(), civilite: p.civilite, dateNaissance: p.dateNaissance, lieuNaissance: p.lieuNaissance
      }, p.nomUsage ? { nomUsage: p.nomUsage } : {}, p.situationMatrimoniale ? { situationMatrimoniale: p.situationMatrimoniale } : {}));
    }
    const roles = new Map();
    (d.parties || []).forEach(pa => {
      const role = ROLES_PARTIE_AUTHENTIC[motCleAuthentic(pa.type)];
      const p = pa.personneRef && personnes.find(x => x.id === pa.personneRef);
      if (role && p) roles.set(p, role);
    });
    // Sociétés (SCI, SARL…) nommées par l'intitulé : parties à part entière (étude 07/10 : substitution d'une SCI à l'acquéreur
    // personne physique) — Authentic n'en relève pas de fiche client lisible ; une personne dont le nom n'apparaît que dans le
    // nom de la société (le gérant de la « SCI DUBOIS ») n'est pas partie.
    const morales = [];
    if (!roles.size) {
      const m = /^\s*(?:vte|vente)\b\s*[-:]?\s*(.+?)\s*\/\s*(.+?)\s*$/i.exec(sansReferenceAuthentic(d.intitule || ''));
      if (m) {
        const mots = (s) => ' ' + normaliserPourRecherche(s).replace(/[^a-z0-9]+/g, ' ') + ' ';
        [[m[1], 'VENDEUR'], [m[2], 'ACQUEREUR']].forEach(([cote, role]) => societesCoteAuthentic(cote).forEach(nom => morales.push({ nom, role })));
        const sansSocietes = (cote) => societesCoteAuthentic(cote).reduce((t, n) => t.replace(n, ' '), cote);
        const cotes = [[mots(sansSocietes(m[1])), 'VENDEUR'], [mots(sansSocietes(m[2])), 'ACQUEREUR']];
        personnes.forEach(p => {
          const noms = [p.nom, p.nomUsage].filter(Boolean).map(n => normaliserPourRecherche(n).replace(/[^a-z0-9]+/g, ' ').trim());
          const cote = cotes.filter(([texte]) => noms.some(n => n && texte.includes(' ' + n + ' ')));
          if (cote.length === 1) roles.set(p, cote[0][1]);
          // Même nom des deux côtés (« VTE MARTIN Paul / MARTIN Léa ») : le prénom départage, sinon rien (jamais le nom seul).
          else if (cote.length === 2 && p.prenom) {
            const prenoms = normaliserPourRecherche(p.prenom).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(x => x.length >= 2);
            const parPrenom = cote.filter(([texte]) => prenoms.some(x => texte.includes(' ' + x + ' ')));
            if (parPrenom.length === 1) roles.set(p, parPrenom[0][1]);
          }
        });
      }
    }
    // Une personne mariée ou pacsée absente de l'intitulé (« VTE CHAHUNEAU / … », Mme sous son propre
    // nom) prend le côté de son conjoint déjà placé (étude, 02/10).
    personnes.filter(p => !roles.has(p) && p.situationMatrimoniale && p.situationMatrimoniale.conjoint).forEach(p => {
      const conj = motsIdentitePersonne(p.situationMatrimoniale.conjoint);
      const cotes = new Set([...roles.entries()].filter(([q]) => conj.length >= 2 && conj.every(m => motsIdentitePersonne([q.prenom, q.nom, q.nomUsage].filter(Boolean).join(' ')).includes(m))).map(([, r]) => r));
      if (cotes.size === 1) roles.set(p, [...cotes][0]);
    });
    const societes = morales.map(({ nom, role }) => ({
      nom, role, qualiteActe: role === 'VENDEUR' ? 'vendeur' : 'acquéreur', qualitePersonne: 'morale', representant: null, origine: 'authentic',
      source: { extrait: 'Export Authentic', index: null, page: null }, emails: [], telephones: []
    }));
    return personnes.filter(p => roles.has(p)).map(p => {
      const role = roles.get(p);
      return Object.assign({
        nom: [p.prenom, p.nom].filter(Boolean).join(' '),
        role, qualiteActe: role === 'VENDEUR' ? 'vendeur' : 'acquéreur',
        qualitePersonne: 'physique', representant: null, origine: 'authentic',
        source: { extrait: 'Export Authentic', index: null, page: null },
        emails: p.emails.slice(), telephones: (p.telephones || []).slice(), civilite: p.civilite, dateNaissance: p.dateNaissance, lieuNaissance: p.lieuNaissance
      }, p.nomUsage ? { nomUsage: p.nomUsage } : {}, p.situationMatrimoniale ? { situationMatrimoniale: p.situationMatrimoniale } : {});
    }).concat(societes);
  }

  // Pure : les sociétés citées par un côté de l'intitulé d'Authentic (« SCI DU MOULIN et Paul DUBOIS » → ['SCI DU MOULIN']).
  var RE_SOCIETE_AUTHENTIC = /^(?:SCI|SCCV|SARL|SARLU|SASU|SAS|EURL|SNC|SCEA|SCP|SCM|SA|SC|GFA|GAEC|EARL|SEM|SPL|SOCI[ÉE]T[ÉE]|STE|ASSOCIATION|COMMUNE|OPH)(?![A-Za-zÀ-ÿ])/i;
  function societesCoteAuthentic(cote) {
    return String(cote || '').split(/\s+(?:et|&)\s+|\s*[,;]\s*/i).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => RE_SOCIETE_AUTHENTIC.test(x));
  }

  // Le bien de la vente : l'immeuble référencé par le dossier, à défaut le premier. Pure.
  function bienExportAuthentic(donnees) {
    const d = donnees || {};
    const immeubles = d.immeubles || [];
    return immeubles.find(im => (d.biens || []).includes(im.id)) || immeubles[0] || null;
  }

  // Pure : les lots de copropriété de tous les biens du dossier Authentic, sans doublon de numéro, 40 au plus ; le total des
  // tantièmes du premier bien qui le donne.
  function lotsExportAuthentic(donnees) {
    const d = donnees || {};
    const ids = d.biens || [];
    const immeubles = (d.immeubles || []).filter(im => !ids.length || ids.includes(im.id));
    const lots = [];
    let tantiemesTotal = null;
    immeubles.forEach(im => {
      (im.lots || []).forEach(l => { if (l && l.numero && !lots.some(x => x.numero === l.numero)) lots.push(l); });
      if (tantiemesTotal === null && im.tantiemesTotal != null) tantiemesTotal = im.tantiemesTotal;
    });
    return { lots: lots.slice(0, 40), tantiemesTotal };
  }

  // Pure : les parcelles de tous les biens du dossier Authentic, sans doublon (section + numéro).
  function parcellesExportAuthentic(donnees) {
    const d = donnees || {};
    const ids = d.biens || [];
    const immeubles = (d.immeubles || []).filter(im => !ids.length || ids.includes(im.id));
    const vues = new Set();
    const out = [];
    immeubles.forEach(im => (im.parcelles || []).forEach(p => {
      const cle = cleParcelle(p.section, p.numero);
      if (!cle || vues.has(cle)) return;
      vues.add(cle);
      out.push(Object.assign({ section: String(p.section).toUpperCase(), numero: String(p.numero) },
        Object.fromEntries(['nature', 'surface', 'lieuDit'].filter(k => p[k]).map(k => [k, String(p[k]).slice(0, 60)]))));
    }));
    return out.slice(0, 40);
  }

  // Complète l'extraction (lue dans le texte de l'acte, ou vide) par les données structurées de
  // l'export, plus sûres que la lecture d'un texte : parties et état civil, adresse et type du bien,
  // email de l'acquéreur, nom du dossier ; notaires seulement si le texte n'a rien établi. Les
  // dates et le prix restent ceux du texte. Modifie et renvoie `extraction`. Pure (hors objets passés).
  // Pure : « a@x.fr; b@y.fr » — les adresses déjà là, puis les nouvelles (sans doublon, casse ignorée).
  function fusionnerEmailsTexte(texte, emails) {
    const tous = emailsDepuisTexte(texte || '');
    (emails || []).forEach(e => emailsDepuisTexte(e).forEach(x => { if (!tous.some(y => y.toLowerCase() === x.toLowerCase())) tous.push(x); }));
    return tous.join('; ');
  }

  // Pure : « 06 … / 02 … » — les numéros déjà là, puis les nouveaux (comparés sur leurs 9 derniers chiffres).
  function fusionnerTelephonesTexte(texte, telephones) {
    const cle = (t) => String(t || '').replace(/\D/g, '').slice(-9);
    const tous = String(texte || '').split('/').map(t => t.trim()).filter(Boolean);
    (telephones || []).forEach(t => { if (cle(t).length === 9 && !tous.some(x => cle(x) === cle(t))) tous.push(String(t).trim()); });
    return tous.join(' / ');
  }

  function completerExtractionDepuisAuthentic(extraction, donnees) {
    if (!extraction || !donnees) return extraction;
    const origine = { origine: 'authentic', source: { extrait: 'Export Authentic', index: null, page: null } };
    const parties = partiesExportAuthentic(donnees);
    if (parties.length) extraction.parties = parties;
    const bien = bienExportAuthentic(donnees);
    if (bien && bien.adresse) {
      extraction.bien = extraction.bien || {};
      extraction.bien.adresse = {
        adresseComplete: bien.adresse.texte, numero: bien.adresse.numero, typeVoie: bien.adresse.typeVoie,
        nomVoie: bien.adresse.nomVoie, lieuDit: bien.adresse.lieuDit, codePostal: bien.adresse.codePostal,
        commune: bien.adresse.commune, departement: bien.adresse.departement, statut: 'CONFIRMED', origine: 'authentic'
      };
      extraction.bien.source = origine.source;
    }
    // Parcelles de TOUS les biens de la vente relevés dans Authentic (étude 06/10 : une vente de plusieurs biens n'en gardait que le
    // premier), même sans adresse lue (elles étaient perdues quand ni Authentic ni le compromis ne donnaient l'adresse).
    const parcelles = parcellesExportAuthentic(donnees);
    if (parcelles.length) {
      extraction.bien = extraction.bien || {};
      extraction.bien.cadastre = Object.assign({}, extraction.bien.cadastre || {}, { section: parcelles[0].section, numero: parcelles[0].numero, parcelles });
    }
    extraction.champs = extraction.champs || {};
    const nom = String(donnees.intitule || '').replace(/^\s*(?:vte|vente|succession|succ)\b\.?\s*[-:]?\s*/i, '').trim();
    if (nom) extraction.champs.nom = champExtraction(nom, origine);
    // Emails et téléphones : ceux de TOUTES les parties du côté (Authentic d'abord, étude 06/10 au soir : « Authentic passe en
    // premier partout et remplace les champs si déjà rempli ») REMPLACENT ceux lus dans le compromis — quand Authentic en a.
    const valeur = (cle) => (extraction.champs[cle] && extraction.champs[cle].valeur) || '';
    const emailsCote = (role) => parties.filter(p => p.role === role).reduce((t, p) => t.concat(p.emails || []), []);
    const telsCote = (role) => parties.filter(p => p.role === role).reduce((t, p) => t.concat(p.telephones || []), []);
    [['emailAcquereur', 'ACQUEREUR'], ['emailVendeur', 'VENDEUR']].forEach(([cle, role]) => {
      const authentic = fusionnerEmailsTexte('', emailsCote(role));
      if (authentic && authentic !== valeur(cle)) extraction.champs[cle] = champExtraction(authentic, origine);
    });
    // Téléphones des parties (appels 3CX reconnus) : repris sur la fiche à la création, sans passer
    // par le formulaire (modifiables ensuite dans l'onglet Échanges).
    [['telephoneAcquereur', 'ACQUEREUR'], ['telephoneVendeur', 'VENDEUR']].forEach(([cle, role]) => {
      const authentic = fusionnerTelephonesTexte('', telsCote(role));
      if (authentic && authentic !== valeur(cle)) extraction.champs[cle] = champExtraction(authentic, origine);
    });
    if (bien && bien.type) extraction.champs.typeVente = champExtraction(bien.type, origine);
    // Lots d'une copropriété (tous les biens relevés, 06/10) : gardés sur la fiche.
    const lots = lotsExportAuthentic(donnees);
    if (lots.lots.length) {
      extraction.bien = extraction.bien || {};
      extraction.bien.lots = lots.lots;
      extraction.bien.tantiemesTotal = lots.tantiemesTotal;
    }
    // Prix « Capital » des informations financières d'Authentic : seulement si le texte n'en donne pas.
    const prixAuth = donnees.infosAuthentic && donnees.infosAuthentic.prix;
    // Authentic pré-remplit, le compromis complète ce qui manque (étude 05/10) : le prix d'Authentic passe donc avant celui lu.
    if (prixAuth) extraction.champs.prixVente = champExtraction(prixAuth, origine);
    // Notaires : jamais repris d'Authentic (étude 07/10) — seuls ceux du compromis, pris au répertoire.
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Pièces de la checklist présentes dans Authentic, reconnues par le nom de leur fichier ou leur
  // intitulé (même règle que sur le NAS : jamais par le contenu). Une pièce = une ligne, avec le
  // document qui la porte. Pure.
  // Pièces d'urbanisme (certificat d'urbanisme, alignement, numérotage, assainissement, renonciation
  // au droit de préemption) : jamais reprises d'Authentic pour une vente (étude, 02/10 : « ne pas
  // prendre en compte les pièces d'urbanisme sauf la SAFER ») — elles se cochent par le NAS ou à la main.
  function pieceUrbanismeIgnoreeAuthentic(cle, typeAffaire) {
    return typeAffaire !== 'succession' && PIECES_URBANISME.some(p => p.cle === cle);
  }

  function piecesExportAuthentic(donnees, checklist) {
    // Pages relevées : les pièces reçues dans Authentic (état civil, casier judiciaire, SAFER),
    // déjà reconnues à la lecture de la page — pièces du dossier à leur intitulé.
    if (donnees && donnees.origine === 'pages') {
      return (donnees.documents || []).filter(dc => dc.piece).map(dc => {
        const existante = (checklist || []).find(p => p.personnalisee && normaliserPourRecherche(p.label) === normaliserPourRecherche(dc.piece.label));
        return { cle: existante ? existante.cle : dc.piece.cle, label: existante ? existante.label : dc.piece.label, fichier: dc.intitule, nouvelle: !existante };
      });
    }
    const docs = ((donnees && donnees.documents) || []).concat((donnees && donnees.documentsPersonnes) || []);
    const typeAffaire = typeAffaireAuthentic(donnees || {});
    const trouvees = [];
    for (const piece of checklist || []) {
      if (!piece || !piece.cle || trouvees.some(t => t.cle === piece.cle)) continue;
      if (pieceUrbanismeIgnoreeAuthentic(piece.cle, typeAffaire)) continue;
      const doc = docs.find(dc => [dc.nomFichier, dc.intitule].filter(Boolean)
        .some(n => correspondancePieceNom(piece, normaliserNomPourMotif(/\.[a-z0-9]{2,4}$/i.test(n) ? n : n + '.pdf')) === 'exact'));
      if (doc) trouvees.push({ cle: piece.cle, label: piece.label, fichier: doc.nomFichier || doc.intitule });
    }
    return trouvees;
  }

  // Dossier Authentic en cours de reprise (null hors reprise) et pièces qu'il apporte.
  var exportAuthenticActuel = null;

  // Type de vente de l'immeuble exporté (maison, lot de copropriété, terrain) : plus sûr que la
  // lecture du texte, qui ne sait que basculer vers « copropriété ».
  function appliquerTypeVenteAuthentic(donnees) {
    const bien = bienExportAuthentic(donnees);
    const select = document.getElementById('f-type-vente');
    if (bien && bien.type && select && !choixManuelDossierWizard('f-type-vente')) { select.value = bien.type; noterOrigineDossierWizard('f-type-vente', 'authentic'); majApercuPieces(); }
    // Collaborateur en charge (parties prenantes d'Authentic) : responsable proposé.
    const collab = donnees && donnees.infosAuthentic && donnees.infosAuthentic.collaborateur;
    const resp = document.getElementById('f-responsable');
    if (collab && resp && !choixManuelDossierWizard('f-responsable') && [...resp.options].some(o => o.value === collab)) { resp.value = collab; noterOrigineDossierWizard('f-responsable', 'authentic'); }
    // Date de signature de l'avant-contrat relevée sur la page du dossier (étude, 02/10 : « si on complète,
    // les champs suivants doivent être pré-remplis ») : l'ancre des délais, si le compromis ne l'a pas
    // donnée (ou seulement estimée). Avant, elle n'arrivait sur la fiche qu'à l'enregistrement.
    const ac = donnees && donnees.infosAuthentic && donnees.infosAuthentic.avantContratLe;
    if (ac && (!dateCompromisDetectee || dateCompromisEstimee)) {
      corrigerDateCompromis(ac);
      const champ = document.getElementById('f-date-compromis');
      if (champ) champ.value = ac;
    }
  }

  // Compte rendu de l'import sous la zone de dépôt, et pièces reprises à l'étape Finaliser.
  function afficherImportAuthentic(donnees, sourceTexte) {
    const status = document.getElementById('pdf-status');
    const parties = partiesExportAuthentic(donnees);
    status.className = 'pdf-status ok';
    status.textContent = `${donnees.origine === 'pages' ? 'Pages Authentic' : 'Export Authentic'} « ${donnees.intitule} » ${donnees.origine === 'pages' ? 'reprises' : 'lu'} : ${parties.length} partie${parties.length > 1 ? 's' : ''}, ${donnees.documents.length} document${donnees.documents.length > 1 ? 's' : ''}`
      + (sourceTexte ? ` ; ${sourceTexte}` : ' ; aucun acte à lire : dates butoir à saisir.');
    majPiecesAuthentic();
  }

  // Liste « Pièces présentes dans Authentic » de l'étape Finaliser, recalculée quand le type de
  // vente change (la checklist en dépend).
  function majPiecesAuthentic() {
    const bloc = document.getElementById('pieces-authentic');
    if (!bloc) return;
    const role = document.getElementById('f-role-notaire');
    if (!exportAuthenticActuel || (role && role.value === 'participant')) { bloc.style.display = 'none'; bloc.innerHTML = ''; return; }
    const pieces = piecesExportAuthentic(exportAuthenticActuel, checklistPieces(document.getElementById('f-type-vente').value));
    bloc.style.display = '';
    // Une ligne (étude, 02/10 : « trop brouillon ») ; la liste des pièces passe dans la bulle « i ».
    if (!pieces.length) { bloc.style.display = 'none'; bloc.innerHTML = ''; return; }
    bloc.innerHTML = `<label class="checkbox-inline"><input type="checkbox" id="f-pieces-authentic" data-nombre="${pieces.length}" checked>
        Marquer reçue${pieces.length > 1 ? 's' : ''} ${pieces.length > 1 ? `les ${pieces.length} pièces présentes` : 'la pièce présente'} dans Authentic
        ${infoBulle(pieces.map(p => p.label).join(' · '))}</label>`;
  }

  // Oublie ce qu'un compromis précédent a posé dans « Nouveau dossier », sans quitter le mode ni le dossier visé (complément) ni le
  // dossier d'Authentic retenu par « Créer ». Le responsable choisi reste.
  function oublierCompromisPrecedent() {
    const garde = { modeImport, complementDossierId, choixComplement, complementFichierNas, authenticRetenuPourPdf, groupeAuthenticRetenu,
      responsable: (document.getElementById('f-responsable') || {}).value || '' };
    reinitialiserFormulaire();
    modeImport = garde.modeImport;
    complementDossierId = garde.complementDossierId;
    choixComplement = garde.complementDossierId ? garde.choixComplement : {};
    complementFichierNas = garde.complementFichierNas;
    authenticRetenuPourPdf = garde.authenticRetenuPourPdf;
    groupeAuthenticRetenu = garde.groupeAuthenticRetenu;
    const resp = document.getElementById('f-responsable');
    if (resp && garde.responsable) resp.value = garde.responsable;
    majEnteteComplement();
    renderChoixImport();
  }

  async function traiterFichierPdf(file) {
    const status = document.getElementById('pdf-status');

    if (!window.pdfjsLib) {
      status.className = 'pdf-status err';
      status.textContent = "Lecture PDF indisponible — réessayez dans un instant.";
      return;
    }

    // Un compromis REMPLACE un autre déjà lu (relecture 13/10 : le second dossier partait avec les emails, l'adresse, l'agence et
    // les notaires du premier — un champ que le nouveau compromis ne donne pas gardait l'ancienne valeur, masquée dans « Vérifier ») :
    // tout ce que l'ancien avait posé est oublié ; le mode, le dossier à compléter et le dossier d'Authentic retenu restent.
    if (dernierTexteTraite || extractionActuelle) oublierCompromisPrecedent();
    status.className = 'pdf-status loading';
    status.textContent = `Lecture de « ${file.name} » en cours…`;
    majProgression(2);
    compromisNomFichierImporte = file.name || '';
    // Un nouvel acte : les corrections et les relectures du précédent n'ont plus aucun sens.
    correctionsRevision = {};
    verificationsRevision = {};
    generationImportActuel++; // invalide les relances IA d’un import précédent
    // « Annuler », un autre compromis ou une reprise d'Authentic pendant la lecture (l'OCR d'un scan dure plus d'une minute) :
    // le texte de CE fichier n'est plus appliqué (relecture 13/10).
    const monImport = generationImportActuel;

    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false,
        data: buffer,
        verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0)
      }).promise;
      const { textesParPage, dernierePageUtile, pagesOcr, ocrPlafonne, ocrIndisponible } =
        await extraireTextesUtiles(pdf, {
          surPage(numero, total, mode) {
            if (mode === 'texte') {
              majProgression(Math.min(95, (numero / total) * 100));
              return;
            }
            // L'OCR ne donne aucune progression exploitable : barre indéterminée, et un message qui
            // dit CE QUI se passe. Sans lui, un compromis scanné de vingt-cinq pages donne une
            // minute et demie d'attente muette, qu'on prend pour un blocage.
            majProgression(null);
            status.className = 'pdf-status loading';
            status.textContent = mode === 'init'
              ? 'Document scanné : préparation de la reconnaissance de texte…'
              : `Document scanné : lecture de l’image, page ${numero} sur ${total} (quelques secondes par page)…`;
          }
        });
      if (monImport !== generationImportActuel) return;
      const texteComplet = textesParPage.slice(0, dernierePageUtile).join('\n');
      frontieresPagesActuelles = calculerFrontieresPages(textesParPage, dernierePageUtile);
      pageParType = { pret: null, acte: null, ventebien: null };
      ambiguiteParType = { pret: false, acte: false, ventebien: false };
      approxParType = { pret: false, acte: false, ventebien: false };
      traiterTexte(texteComplet);
      // Enrichissement par IA locale (Ollama) DÉSACTIVÉ pour la création d'un nouveau dossier, à la
      // demande de l'étude : la détection par regex ci-dessus reste seule à l'œuvre, chemin
      // immédiat et éprouvé. L'appel `lancerExtractionIa(texteComplet, monImport)` a été retiré ici
      // (la fonction et la route /api/extraction-ia restent en place, sans appelant, pour un
      // éventuel retour arrière ou un usage futur — voir aussi "Redemander à l'IA" retiré du
      // panneau de révision). Le modèle local ne sert plus qu'à l'Outil 2 (relecture d'actes).
      // Étude, 02/10 au soir : « upload de PDF + option de compléter avec Authentic, sinon on continue
      // sans ». L'import fait, on reste sur l'étape 1 : « Compléter depuis Authentic » (le dossier du
      // compromis en tête) ou « Continuer sans Authentic ». Avant, on passait seul à « Vérifier ».
      renderChoixImport();
      chargerRelevesAuthenticRecents();

      // Ouvre le panneau d'aperçu, à côté du formulaire, limité au compromis (annexes exclues).
      pdfActuel = pdf;
      pdfDernierePageUtile = dernierePageUtile;
      document.getElementById('nouveau-intro').style.display = 'none';
      document.getElementById('pdf-viewer').style.display = 'flex';
      document.getElementById('pdf-viewer-title').textContent =
        `${file.name} — compromis (${dernierePageUtile} page${dernierePageUtile > 1 ? 's' : ''} sur ${pdf.numPages}, annexes non affichées)`;
      await chargerToutesLesPagesPdf();
      if (monImport !== generationImportActuel) return;
      // Bug corrigé : traiterTexte() (donc afficherAnalyseJuridique()) tourne plus haut, avant que
      // pdfActuel soit renseigné — chaque bouton "👁 p.X" d'un engagement du vendeur (voir
      // renderEngagement) évaluait alors pdfActuel comme encore null et retombait sur le simple
      // numéro de page non cliquable, sans jamais se remettre à jour ensuite. Un second passage ici,
      // une fois pdfActuel connu, régénère l'analyse déjà calculée avec les bons boutons.
      afficherAnalyseJuridique();

      // Si la date de signature n'a pas été trouvée dans le texte, elle est peut-être manuscrite
      // ou intégrée en image (cas fréquent : bloc de signature électronique Yousign/DocuSign en
      // image, sur la page qui suit immédiatement la mention « Fait à … signé électroniquement »).
      if (!dateCompromisDetectee) {
        const idxSignature = textesParPage.findIndex(detecteSignatureActe);
        let pagesACiber = [];
        if (idxSignature !== -1) {
          const pageDepart = idxSignature + 1; // 1-based pour pdf.js
          pagesACiber = [pageDepart, pageDepart + 1, pageDepart + 2].filter(p => p <= dernierePageUtile);
        } else {
          pagesACiber = [dernierePageUtile];
        }

        const workerOcr = await creerWorkerOcr();
        try {
          for (const numeroPage of pagesACiber) {
            if (monImport !== generationImportActuel) break;
            status.className = 'pdf-status loading';
            status.textContent = `Date de signature non trouvée dans le texte — lecture de l'image page ${numeroPage} (15 à 30 s)…`;
            majProgression(null);
            const texteOcr = await ocrPage(pdf, numeroPage, workerOcr);
            if (monImport !== generationImportActuel) break;
            const isoOcr = detecterDateCompromis(texteOcr);
            if (isoOcr) {
              dateCompromisDetectee = isoOcr;
              dateCompromisEstimee = false;
              majAffichageCompromis();
              detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
              renderChips();
              recalculerExtractionRegex();
              break;
            }
          }
        } finally {
          if (workerOcr) await workerOcr.terminate();
        }

        // Dernier recours : la date d'enregistrement du fichier (souvent mise à jour au moment de
        // la signature électronique) donne une estimation raisonnable, à vérifier par l'agence.
        if (monImport !== generationImportActuel) return;
        if (!dateCompromisDetectee) {
          const isoMeta = await dateDepuisMetadonnees(pdf);
          if (isoMeta) {
            dateCompromisDetectee = isoMeta;
            dateCompromisEstimee = true;
            majAffichageCompromis();
            detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
            renderChips();
            recalculerExtractionRegex();
          }
        }
      }

      majProgression(-1);
      const nbFinal = detectedDates.length;
      let suffixe = '';
      if (pagesOcr) suffixe += ` — ${pagesOcr} page${pagesOcr > 1 ? 's' : ''} lue${pagesOcr > 1 ? 's' : ''} en reconnaissance d’image`;
      if (ocrPlafonne) suffixe += ` (limite de ${MAX_PAGES_OCR_IMPORT} pages atteinte : la suite n’a pas été lue)`;
      if (ocrIndisponible) suffixe += ' — reconnaissance d’image indisponible, le document scanné n’a pas pu être lu';
      if (!dateCompromisDetectee) suffixe += ' — date de signature à renseigner';
      else if (dateCompromisEstimee) suffixe = ' — date de signature à vérifier';
      status.className = 'pdf-status ok';
      status.textContent = `✓ ${dernierePageUtile} page${dernierePageUtile > 1 ? 's' : ''} lue${dernierePageUtile > 1 ? 's' : ''} (annexes ignorées) — ${nbFinal} échéance${nbFinal > 1 ? 's' : ''} détectée${nbFinal > 1 ? 's' : ''}${suffixe}.`;
    } catch (e) {
      console.error(e);
      if (monImport !== generationImportActuel) return;
      status.className = 'pdf-status err';
      status.textContent = `Impossible de lire « ${file.name} » (fichier scanné ou protégé).`;
    } finally {
      // Garantit l'arrêt de l'indicateur quel que soit le chemin emprunté (succès, erreur, abandon) — sauf si une autre lecture a
      // commencé entre-temps : son indicateur reste.
      if (monImport === generationImportActuel) majProgression(-1);
    }
  }

  // ---- Extraction assistée par IA locale (Ollama), en complément du wizard "Nouveau dossier" ----
  // Voir server/src/routes/extractionIa.js et CLAUDE.md. N'existe que sur `claude/serveur-intranet`
  // (a besoin d'un backend pour parler à Ollama) — appelée en ARRIÈRE-PLAN juste après
  // traiterTexte() (regex, inchangée, toujours le chemin principal et immédiat) pour ne compléter
  // QUE ce qu'elle n'a pas trouvé : jamais une valeur déjà détectée ou déjà saisie à la main n'est
  // écrasée, même principe que detecterAdresseBien()/detecterEmailAcquereur()/detecterMontantPret()
  // ailleurs dans ce fichier. Silencieuse si Ollama n'est pas installé/lancé sur le serveur — le
  // wizard reste utilisable exactement comme avant l'ajout de cette fonctionnalité dans ce cas,
  // jamais une condition bloquante pour créer un dossier.


  // ---- Compléter un dossier EXISTANT avec un dossier d'Authentic (étude 06/10 : « compléter avec les données Authentic
  // avant ou après création » — avant : « Compléter depuis Authentic » de Nouveau dossier ; après : ici). Même source que la
  // création (`dossiersDepuisRelevesAuthentic`, pages relevées dans les 24 h), même règle que le complément par le compromis :
  // la fiche gagne toujours, seuls les vides sont remplis — personnes d'un côté sans personne nommée (ou absentes du côté),
  // emails et téléphones ajoutés, adresse du bien, parcelles et lots, type de vente, prix « Capital », référence Authentic.
  // Pure (modifie le dossier passé) : rend les libellés de ce qui a été posé (vide = rien à compléter). ----
  // Pure : la personne d'Authentic (« Prénom NOM ») est déjà sur la fiche — même personne au sens de memePersonneParNom,
  // ou le nom de famille seul de la fiche (« FOURNIER ») contenu dans le nom venu d'Authentic (« Camille FOURNIER »).
  function memePartieComplement(p, v) {
    if (!p || !v) return false;
    // Prénom porté à part (« Ursula » + « DOYLE ») : comparé sur le nom complet, sinon « Ursula DOYLE » ne reconnaissait pas
    // « DOYLE » prénommée Ursula et l'acquéreur entrait deux fois (étude 08/10).
    const complet = (x) => [x.prenom, x.nom].map(t => String(t || '').trim()).filter(Boolean).join(' ');
    if (p.prenom || v.prenom) return memePartieComplement({ nom: complet(p), nomUsage: p.nomUsage }, { nom: complet(v) });
    // « Société civile immobilière DU MOULIN » (compromis) = « SCI DU MOULIN » (Authentic).
    const court = (x) => String(x || '').replace(/soci[ée]t[ée]\s+civile\s+immobili[èe]re/ig, 'SCI').replace(/soci[ée]t[ée]\s+[àa]\s+responsabilit[ée]\s+limit[ée]e/ig, 'SARL');
    if (court(p.nom) !== String(p.nom || '') || court(v.nom) !== String(v.nom || '')) return memePartieComplement({ nom: court(p.nom), nomUsage: p.nomUsage }, { nom: court(v.nom) });
    if (memePersonneParNom(p.nom, v.nom) || (p.nomUsage && memePersonneParNom(p.nomUsage, v.nom))) return true;
    const mots = (x) => normaliserPourRecherche(String(x || '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(m => m.length >= 3);
    const fiche = mots(p.nom);
    const venue = mots(v.nom);
    return fiche.length > 0 && fiche.every(m => venue.includes(m));
  }

  // `options` = { forcer, maintenant } : `forcer` (bouton « Compléter », geste explicite) reprend tout d'Authentic, même ce qu'il
  // avait déjà donné et changé depuis — sinon un changement d'Authentic sur une valeur déjà reprise est PROPOSÉ (client/52).
  function complementDossierDepuisAuthentic(d, donnees, liste, options) {
    if (!d || !donnees) return [];
    const o = options || {};
    const maintenant = o.maintenant || new Date().toISOString();
    const textes = [];
    const parties = partiesExportAuthentic(donnees);
    const nomme = (p) => p && String(p.nom || '').trim();
    d.parties = Array.isArray(d.parties) ? d.parties : [];
    // Côtés dont Authentic a changé les personnes (étude 07/10) : changement proposé, rien d'autre n'y est repris tant que l'étude
    // n'a pas décidé (« Mettre à jour » ou « Ignorer »).
    const enAttente = new Set();
    const surLaFiche = (role, v) => d.parties.some(p => p && String(p.role || '').toUpperCase() === role && memePartieComplement(p, v));
    for (const role of ['VENDEUR', 'ACQUEREUR']) {
      const venues = parties.filter(p => p.role === role && nomme(p));
      if (!venues.length) continue;
      const retires = personnesPartiesAuthentic(d, role, venues, donnees.intitule);
      if (retires.length) {
        const personnes = (donnees.personnes || []).filter(pers => venues.some(v => v.nom === [pers.prenom, pers.nom].filter(Boolean).join(' ')));
        proposerChangementPartiesAuthentic(d, role, retires, venues, personnes, donnees.intitule, maintenant);
        if (!o.forcer) { enAttente.add(role); continue; }
        textes.push(appliquerChangementPartiesAuthentic(d, d.authentic.majEnAttente['parties:' + role]));
        continue;
      }
      // Personnes déjà données par Authentic : une personne retenue absente de la fiche y a été retirée à la main — elle n'y
      // revient pas ; seule une personne NOUVELLE dans Authentic est ajoutée.
      const retenus = valeursAuthenticDossier(d)['parties:' + role];
      const dejaDonnee = (v) => Array.isArray(retenus) && retenus.some(n => memePersonneParNom(n, v.nom) || memePartieComplement({ nom: n }, v));
      memoriserValeurAuthentic(d, 'parties:' + role, venues.map(v => v.nom));
      const presentes = d.parties.filter(p => p && String(p.role || '').toUpperCase() === role && nomme(p));
      const ajoutees = venues.filter(v => !presentes.some(p => memePartieComplement(p, v)) && !dejaDonnee(v));
      if (!ajoutees.length) continue;
      // Les lignes vides du côté (« Prénom NOM » à saisir) laissent la place aux personnes d'Authentic.
      if (!presentes.length) d.parties = d.parties.filter(p => !(p && String(p.role || '').toUpperCase() === role && !nomme(p)));
      ajoutees.forEach(v => d.parties.push(Object.assign({}, v, { role })));
      textes.push(`${ajoutees.length} ${role === 'VENDEUR' ? 'vendeur' : 'acquéreur'}${ajoutees.length > 1 ? 's' : ''} (${ajoutees.map(v => v.nom).join(', ')})`);
    }
    // Identité de chaque personne d'Authentic — civilité comprise (étude 07/10 : « choisir la civilité à partir des données
    // d'Authentic ») — et sa situation matrimoniale sur la partie qui n'en a pas ; puis la situation du couple de chaque côté.
    (donnees.personnes || []).forEach(pers => {
      const complet = [pers.prenom, pers.nom].filter(Boolean).join(' ');
      const venue = parties.find(p => (p.role === 'VENDEUR' || p.role === 'ACQUEREUR') && p.nom === complet);
      // Seulement les personnes présentes sur la fiche (une personne écartée ou en attente de décision n'y entre pas par là).
      if (!venue || enAttente.has(venue.role) || !surLaFiche(venue.role, venue)) return;
      alignerIdentitePartieAuthentic(d, pers, venue.role, { maintenant, forcer: o.forcer }).forEach(t => textes.push(t));
      const p = d.parties.find(x => x && String(x.role || '').toUpperCase() === venue.role && memePartieComplement(x, venue));
      if (p && pers.situationMatrimoniale && !(p.situationMatrimoniale && p.situationMatrimoniale.situation)) p.situationMatrimoniale = Object.assign({}, pers.situationMatrimoniale);
    });
    appliquerSituationsAuthentic(d, { maintenant, forcer: o.forcer }).forEach(t => textes.push(t));
    // Emails et téléphones de chaque personne d'Authentic (Authentic d'abord : ils remplacent ceux de la fiche la première fois,
    // ensuite un changement est proposé).
    parties.filter(p => (p.role === 'VENDEUR' || p.role === 'ACQUEREUR') && nomme(p) && !enAttente.has(p.role) && surLaFiche(p.role, p)).forEach(p => {
      appliquerContactAuthentic(d, p.role, p.nom, { emails: p.emails, telephones: p.telephones }, { maintenant, forcer: o.forcer }).forEach(t => textes.push(t));
    });
    const bien = bienExportAuthentic(donnees);
    // Authentic fait foi (étude 06/10 : « on prend toujours de base les données d'Authentic ») : une adresse ou un prix différents
    // de ceux de la fiche les REMPLACENT la première fois, l'ancienne valeur restant dans l'historique ; ensuite la fiche ne bouge plus.
    if (bien && bien.adresse && bien.adresse.texte) {
      const nouvelle = normaliserAdresse(bien.adresse.texte);
      if (nouvelle) {
        const r = poserChampAuthentic(d, { cle: 'adresseBien', champ: 'adresseBien', libelle: 'Adresse du bien', valeur: nouvelle, maintenant, forcer: o.forcer, egal: (a, b) => normaliserAdresse(a) === normaliserAdresse(b) });
        if (r.etat === 'pose') textes.push(r.avant ? `adresse du bien (avant : ${r.avant})` : 'adresse du bien');
      }
    }
    if (bien && bien.type) {
      const avantType = d.typeVente;
      const texteType = appliquerTypeBienAuthentic(d, bien.type, { maintenant, forcer: o.forcer });
      if (texteType) textes.push(avantType ? `type de vente (avant : ${LIBELLES_TYPE_VENTE_AUTHENTIC[avantType] || avantType})` : 'type de vente');
      if (texteType && d.typeVente === 'terre' && ajouterPieceSaferTerre(d)) textes.push('pièce « Réponse SAFER »');
    }
    const parcelles = parcellesExportAuthentic(donnees);
    const lots = lotsExportAuthentic(donnees);
    if (parcelles.length || lots.lots.length) {
      const resultat = { modifie: false };
      const noter = () => {};
      appliquerBienAuthentic(d, { adresse: bien && bien.adresse ? bien.adresse : null, parcelles, lots: lots.lots, tantiemesTotal: lots.tantiemesTotal, bois: bien && (donnees.immeubles || []).length <= 1 ? bien.bois : null }, noter, resultat, { maintenant, forcer: o.forcer });
      if (resultat.modifie) textes.push(lots.lots.length ? 'parcelles et lots' : 'parcelles');
    }
    const prix = donnees.infosAuthentic && Number(donnees.infosAuthentic.prix);
    if (prix > 0) {
      const r = poserChampAuthentic(d, { cle: 'prixVente', champ: 'prixVente', libelle: 'Prix de vente', valeur: prix, maintenant, forcer: o.forcer, egal: (a, b) => Number(a) === Number(b), formater: v => Number(v) > 0 ? formaterPrix(v) : '' });
      if (r.etat === 'pose') textes.push(r.avant ? `prix (avant : ${r.avant})` : 'prix');
    }
    if (donnees.reference && retenirReferenceAuthentic(d, donnees.reference, liste || [])) textes.push('référence Authentic');
    return textes;
  }

  // Pure : le dossier d'Authentic qui correspond à la fiche parmi les groupes relevés — par la référence, sinon par les noms
  // de l'intitulé (chaque nom de famille du dossier retrouvé dans l'intitulé d'Authentic) ; -1 sinon.
  function indexGroupeAuthenticPourDossier(d, groupes) {
    const liste = groupes || [];
    if (!d) return -1;
    if (d.referenceAuthentic) {
      const i = liste.findIndex(g => g.reference && g.reference === d.referenceAuthentic);
      if (i >= 0) return i;
    }
    const noms = String(d.nom || '').split('/').map(x => normaliserPourRecherche(x).replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean)
      .map(x => x.split(' ').sort((a, b) => b.length - a.length)[0]).filter(n => n && n.length >= 3);
    if (!noms.length) return -1;
    // Un seul dossier d'Authentic doit porter ces noms (étude 07/10 : « ne plus rien deviner ») : deux dossiers ROY relevés
    // ne désignent ni l'un ni l'autre.
    const trouves = [];
    liste.forEach((g, i) => { const t = ' ' + normaliserPourRecherche(g.intitule || '').replace(/[^a-z0-9]+/g, ' ') + ' '; if (noms.every(n => t.includes(' ' + n + ' '))) trouves.push(i); });
    return trouves.length === 1 ? trouves[0] : -1;
  }

  // Pure : le dossier d'Authentic d'où compléter la fiche SANS CLIC (étude 06/10 : « on prend toujours de base les données
  // d'Authentic ») — plus strict que la présélection de la ligne « Authentic » : une fiche rattachée à une référence ne prend
  // que le dossier de cette référence ; sans référence, les noms, sauf si la référence du dossier trouvé est déjà celle
  // d'une autre fiche. null sinon.
  function groupeAuthenticPourComplementAuto(d, groupes, liste) {
    const tous = groupes || [];
    if (!d) return null;
    if (d.referenceAuthentic) return tous.find(g => g.reference && g.reference === d.referenceAuthentic) || null;
    const i = indexGroupeAuthenticPourDossier(d, tous);
    const g = i >= 0 ? tous[i] : null;
    if (!g) return null;
    if (g.reference && (liste || []).some(x => x && x !== d && !x.deleted && x.referenceAuthentic === g.reference)) return null;
    return g;
  }

  // Après tout relevé appliqué sur un dossier : ce qui manque encore sur la fiche est repris du dossier d'Authentic relevé
  // ces 24 h (page de gestion, fiches client, fiche bien — les pages arrivées AVANT la création comprises), sans rien
  // remplacer. → vrai si la fiche a changé.
  async function completerDossierDepuisRelevesRecents(d) {
    if (!d || d.archive || (typeof authToken !== 'undefined' && !authToken)) return false;
    try {
      const r = await fetchAvecAuth('/api/authentic/releves/recents');
      if (!r.ok) return false;
      const { releves } = await r.json();
      const groupes = dossiersDepuisRelevesAuthentic(releves || []);
      groupesAuthenticFiche = { quand: Date.now(), liste: groupes };
      const g = groupeAuthenticPourComplementAuto(d, groupes, dossiers);
      if (!g || !g.export) return false;
      const majAvant = instantaneMajsAuthentic(d);
      const empreinteAvant = empreinteRegistreAuthentic(d);
      const textes = complementDossierDepuisAuthentic(d, g.export, dossiers);
      const nouvelles = nouvellesMajsAuthentic(majAvant, d);
      if (!textes.length && !nouvelles.length && empreinteRegistreAuthentic(d) === empreinteAvant) return false;
      if (textes.length) ajouterHistorique(d, `Complété depuis Authentic (« ${g.intitule} ») : ${textes.join(', ')}`, { auto: true });
      nouvelles.forEach(m => ajouterHistorique(d, `Authentic a changé — ${m.libelle} : ${m.avant ? `${m.avant} → ` : ''}${m.apres} (mise à jour proposée)`, { auto: true }));
      await sauvegarder(d);
      render();
      notifierMajAuthentic(d, nouvelles);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Ligne « Authentic » de la fiche : les dossiers relevés récemment, celui qui correspond présélectionné, « Compléter ».
  let groupesAuthenticFiche = { quand: 0, liste: [] };
  var DUREE_CACHE_GROUPES_AUTHENTIC_FICHE_MS = 60 * 1000;

  async function chargerGroupesAuthenticFiche() {
    if (typeof authToken !== 'undefined' && !authToken) return;
    if (Date.now() - groupesAuthenticFiche.quand < DUREE_CACHE_GROUPES_AUTHENTIC_FICHE_MS) return;
    groupesAuthenticFiche.quand = Date.now();
    try {
      const r = await fetchAvecAuth('/api/authentic/releves/recents');
      if (!r.ok) return;
      const { releves } = await r.json();
      const liste = dossiersDepuisRelevesAuthentic(releves || []);
      const avant = groupesAuthenticFiche.liste.map(g => g.intitule).join('\n');
      groupesAuthenticFiche.liste = liste;
      if (liste.map(g => g.intitule).join('\n') !== avant) render();
    } catch (e) { /* hors ligne : la ligne n'apparaît pas */ }
  }

  function renderCompleterAuthenticFiche(d, ligne) {
    if (!d || d.archive) return '';
    const groupes = groupesAuthenticFiche.liste;
    if (!groupes.length) return '';
    const choisi = indexGroupeAuthenticPourDossier(d, groupes);
    const id = escapeOnclickArg(d.id);
    // Valeur = la clé du dossier d'Authentic (référence, sinon intitulé), jamais sa position : la liste est relue toutes les
    // minutes et peut changer d'ordre entre l'affichage et le clic (audit 12/10 : le dossier d'un autre client était repris).
    const options = groupes.map((g, i) => `<option value="${escapeAttr(cleGroupeAuthenticFiche(g))}"${i === choisi ? ' selected' : ''}>${escapeHtml(g.intitule)}${g.reference ? ` (${escapeHtml(g.reference)})` : ''} — ${escapeHtml(resumeGroupeAuthentic(g))}</option>`).join('');
    const html = `<span class="auth-completer"><select id="auth-comp-${escapeAttr(d.id)}" class="prop-champ auth-completer-choix" aria-label="Dossier d’Authentic à reprendre">${choisi < 0 ? '<option value="" selected>Choisir le dossier d’Authentic…</option>' : ''}${options}</select>
      <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="completerDossierDepuisAuthentic('${escapeOnclickArg(id)}')" title="Reprendre d’Authentic personnes, emails, téléphones, bien et prix : Authentic fait foi, l’ancienne valeur reste dans l’historique">${icone('download')} Compléter</wa-button></span>`;
    return ligne('download', 'Authentic', html, `auth-comp-${d.id}`, 'prop-pleine');
  }

  function cleGroupeAuthenticFiche(g) {
    return g && g.reference ? 'ref:' + g.reference : 'int:' + String((g && g.intitule) || '');
  }

  function completerDossierDepuisAuthentic(id) {
    const d = dossiers.find(x => x.id === id);
    const select = document.getElementById('auth-comp-' + id);
    const g = d && select && select.value !== '' ? groupesAuthenticFiche.liste.find(x => cleGroupeAuthenticFiche(x) === select.value) || null : null;
    if (!d || !g) { afficherToast('Choisissez le dossier d’Authentic à reprendre.', 'OK', null); return; }
    const textes = complementDossierDepuisAuthentic(d, g.export, dossiers, { forcer: true });
    if (!textes.length) { afficherToast(`Rien à compléter : la fiche a déjà ce qu’Authentic montre pour « ${g.intitule} ».`, 'OK', null); return; }
    ajouterHistorique(d, `Complété depuis Authentic (« ${g.intitule} ») : ${textes.join(', ')}`);
    sauvegarder(d);
    render();
    afficherToast(`${libelleDossierAffiche(d)} complété depuis Authentic : ${textes.join(', ')}.`, 'OK', null);
  }
