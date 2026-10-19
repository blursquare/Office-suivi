  // ==== Noms de fichiers : reconnaissance tolérante (fautes de frappe, mots en plus, sigles) ====
  // Demandé par l'étude : un nom de fichier saisi à la main n'est presque jamais la forme exacte
  // qu'attend un motifNom — une lettre oubliée ou inversée (« Certficat d'urbanisme »), des mots de
  // référence autour du nom (« 2024-118 DUPONT - Renonciation DIA commune »), un sigle
  // (« CU a », « DIA »), une casse quelconque. Les motifNom restent le PREMIER test, inchangé ; ce
  // qui suit n'est qu'un second essai, sur des formes déclarées pièce par pièce (`formesNom`).
  //
  // Trois garde-fous, parce qu'une tolérance mal réglée ferait reconnaître un document pour un
  // autre (le coût qu'on paie le plus cher ici : les pièces d'une autre rubrique cochées reçues) :
  //  - un mot de moins de 5 lettres doit être EXACT (au pluriel près) : « CU », « DIA », « TF »,
  //    « pret » ne tolèrent aucune faute, un sigle d'une lettre de travers en devient un autre ;
  //  - la PREMIÈRE lettre n'est jamais tolérée (« vitre » ne vaut pas « titre ») ;
  //  - les mots d'une forme à plusieurs mots doivent être VOISINS dans le nom (au plus un mot
  //    étranger entre eux) : c'est ce qui garde « Certificat d'urbanisme - réponse alignement
  //    voirie » hors du certificat d'alignement, comme le faisait déjà le motifNom.
  var MOTS_VIDES_NOM_FICHIER = ['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'pdf', 'pour', 'sur', 'un', 'une'];

  function tokensNomFichier(nom) {
    return normaliserPourRecherche(String(nom || ''))
      .split(/[^a-z0-9]+/)
      .filter(t => t && !MOTS_VIDES_NOM_FICHIER.includes(t));
  }

  // Distance d'édition avec transposition (deux lettres inversées = une seule faute).
  function distanceEdition(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cout = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }

  function motsVoisinsNom(attendu, mot) {
    if (attendu === mot) return true;
    const sansPluriel = m => (m.length >= 4 ? m.replace(/[sx]$/, '') : m);
    if (sansPluriel(attendu) === sansPluriel(mot)) return true;
    if (attendu.length < 5 || attendu[0] !== mot[0]) return false;
    const tolerance = attendu.length >= 10 ? 2 : 1;
    if (Math.abs(attendu.length - mot.length) > tolerance) return false;
    return distanceEdition(attendu, mot) <= tolerance;
  }

  // Une forme (« certificat urbanisme ») correspond à un nom de fichier si chacun de ses mots
  // retrouve un mot voisin dans le nom, sans que deux mots ne se servent du même, et que
  // l'ensemble tienne dans une fenêtre d'au plus un mot étranger. Deux mots consécutifs du nom
  // peuvent aussi être recollés (« nume rotage » → « numerotage », un mot coupé par l'outil de
  // nommage au niveau de l'accent — voir motifNom), et une forme entière collée en un seul mot
  // (« EtatDate ») est reconnue aussi.
  function correspondFormeNom(forme, tokens) {
    const mots = tokensNomFichier(forme);
    if (!mots.length || !tokens.length) return false;
    const unites = [];
    tokens.forEach((t, i) => {
      unites.push({ texte: t, debut: i, fin: i });
      if (i + 1 < tokens.length) unites.push({ texte: t + tokens[i + 1], debut: i, fin: i + 1 });
    });
    if (mots.length > 1) {
      const colle = mots.join('');
      if (unites.some(u => motsVoisinsNom(colle, u.texte))) return true;
    }
    const candidats = mots.map(m => unites.filter(u => motsVoisinsNom(m, u.texte)));
    if (candidats.some(c => !c.length)) return false;
    const choisis = [];
    const essayer = k => {
      if (k === mots.length) {
        const debut = Math.min(...choisis.map(u => u.debut));
        const fin = Math.max(...choisis.map(u => u.fin));
        const unitesCollees = choisis.filter(u => u.fin > u.debut).length;
        return fin - debut + 1 <= mots.length + 1 + unitesCollees;
      }
      for (const u of candidats[k]) {
        if (choisis.some(c => u.debut <= c.fin && c.debut <= u.fin)) continue;
        choisis.push(u);
        if (essayer(k + 1)) return true;
        choisis.pop();
      }
      return false;
    };
    return essayer(0);
  }

  // 'exact' si le motifNom reconnaît le nom, 'approche' si seule une forme tolérante le fait,
  // null sinon. Une pièce personnalisée (sans motifNom) se retrouve par son libellé, en
  // sous-chaîne comme avant ou, à défaut, comme une forme tolérante.
  // Enveloppe : les formes de noms décidées dans l'outil « Noms de fichiers du NAS » (étude, 03/10)
  // passent avant les motifs — « non » écarte la forme pour cette pièce même si le motif la prend,
  // « oui » la fait reconnaître quand aucun motif ne la voit. Les pièces personnalisées n'en ont pas.
  function correspondancePieceNom(piece, nomNormalise) {
    if (!piece) return null;
    const apprise = piece.personnalisee ? null : decisionFormePourNom(piece.cle, nomNormalise);
    if (apprise === 'non') return null;
    const r = correspondancePieceNomMotifs(piece, nomNormalise);
    if (!r && apprise === 'oui') { noterVerificationPoste('formes-noms-reconnaissance'); return 'exact'; }
    return r;
  }

  var RE_DEMANDE_DIA_NOM = /d[ée]claration|intention|demande|envoi|envoy[ée]|notification|notifi[ée]/i;
  var RE_REPONSE_DIA_NOM = /renon|r[ée]ponse|retour|non[\s-]?pr[ée]emption|d[ée]cision|arr[êe]t[ée]/i;

  function correspondancePieceNomMotifs(piece, nomNormalise) {
    if (!piece) return null;
    if (piece.personnalisee) {
      if (String(nomNormalise).toLowerCase().includes(String(piece.label || '').toLowerCase())) return 'exact';
      return correspondFormeNom(piece.label, tokensNomFichier(nomNormalise)) ? 'approche' : null;
    }
    // « Titre de séjour » (pièce d'identité) n'est pas un titre de propriété (étude 02/10, pièces jointes
    // rangées seules).
    if (piece.cle === 'titrePropriete' && /titre\s*(?:de\s*)?s[ée]jour/i.test(nomNormalise)) return null;
    // Une DIA ENVOYÉE (déclaration, demande, notification, copie Claire Scan de la DIA) n'est pas la renonciation de la mairie
    // (audit 13/10 ; étude 07/10 : « on doit avoir le document de renonciation pour signer ») — sauf si le nom dit la réponse.
    if (piece.cle === 'renonciationPreemption' && RE_DEMANDE_DIA_NOM.test(nomNormalise) && !RE_REPONSE_DIA_NOM.test(nomNormalise)) return null;
    // « DIA » avec « SAFER » dans le nom : la DIA envoyée à la SAFER ou sa réponse, jamais la renonciation au droit de préemption urbain
    // (étude 19/10 : « s'il y a SAFER dans le nom, à ne pas prendre »).
    if (piece.cle === 'renonciationPreemption' && /(?:^|[^a-z])safer(?:[^a-z]|$)/i.test(nomNormalise)) return null;
    if (piece.motifNom && piece.motifNom.test(nomNormalise)) return 'exact';
    // « Pré-état daté » contient les mots « état daté » : la forme tolérante le prendrait.
    if (piece.cle === 'etatDate' && RE_PRE_ETAT_DATE.test(nomNormalise)) return null;
    const formes = FORMES_NOM_PIECES[piece.cle];
    if (!formes) return null;
    const tokens = tokensNomFichier(nomNormalise);
    return formes.some(f => correspondFormeNom(f, tokens)) ? 'approche' : null;
  }

  // Formes tolérantes par pièce. Des MOTS, sans accent ni article (ils sont retirés du nom de
  // fichier avant comparaison). Une forme d'un seul mot court (« cu », « dia ») est un sigle :
  // il doit figurer tel quel, comme mot entier, dans le nom. `article20`/`ribCopro` n'en ont pas :
  // leur motifNom est déjà une combinaison (« RIB » + « syndic ») qu'une forme libre affaiblirait.
  var FORMES_NOM_PIECES = {
    certificatUrbanisme: ['certificat urbanisme', 'cu', 'reponse urbanisme'],
    certificatAlignement: ['certificat alignement', 'arrete alignement', 'courriel alignement', 'alignement numerotage', 'numerotage alignement'],
    certificatNumerotage: ['numerotage'],
    reponseAssainissement: ['assainissement', 'spanc'],
    // « DIA » garde sa place (l'étude écrit « renonciation DIA », « DIA » seul existe sur le NAS) ; un nom qui dit la DEMANDE
    // est écarté plus haut (RE_DEMANDE_DIA_NOM, audit 13/10).
    renonciationPreemption: ['preemption', 'dpu', 'dia', 'renonciation dia', 'reponse dia', 'retour dia'],
    diagnosticsTechniques: ['diagnostic', 'diagnostique', 'ddt'],
    erp: ['erp', 'etat risques'],
    avisTaxeFonciere: ['tf', 'taxe fonciere'],
    titrePropriete: ['titre'],
    planCadastral: ['plan cadastral', 'extrait cadastral', 'plan cadastre', 'plan situation'],
    etatDate: ['etat date'],
    etudeSol: ['etude sol', 'etude geotechnique', 'g1', 'g2'],
    ramonage: ['ramonage'],
    entretienChaudiere: ['entretien chaudiere', 'contrat chaudiere'],
    entretienPac: ['entretien pac', 'entretien pompe chaleur'],
    entretienClim: ['climatisation', 'clim'],
    vidangeFosse: ['fosse', 'vidange'],
    entretienAdoucisseur: ['adoucisseur'],
    debroussaillage: ['debroussaillage', 'elagage'],
    travauxRemiseEtat: ['remise etat'],
    miseEnConformite: ['mise conformite'],
    miseEnConformiteElectricite: ['mise conformite electricite', 'mise conformite electrique'],
    miseEnConformiteAssainissement: ['mise conformite assainissement', 'mise conformite fosse'],
    miseEnConformiteGaz: ['mise conformite gaz'],
    regularisationUrbanisme: ['regularisation'],
    cuveCiterne: ['citerne', 'degazage'],
    debarras: ['debarras', 'encombrants'],
    attestationConformite: ['attestation conformite', 'certificat conformite', 'daact', 'non contestation'],
    consuel: ['consuel'],
    garantieDecennale: ['decennale'],
    dommageOuvrage: ['dommage ouvrage'],
    facturesTravaux: ['facture travaux'],
    etatParasitaire: ['parasitaire', 'merule', 'termites'],
    auditEnergetique: ['audit energetique'],
    securitePiscine: ['piscine'],
    resiliationContrat: ['resiliation']
  };

  // Noms de fichiers reconnus, pièce par pièce (étude 02/10 : « donne-moi toutes les variantes de nom
  // pour les fichiers à reconnaître ») : exemples lisibles de ce que motifNom et FORMES_NOM_PIECES
  // acceptent — majuscules, accents, tirets et « _ » indifférents, un mot de plus (nom du client, date)
  // ne gêne pas, une faute de frappe légère est tolérée sur les formes de plusieurs lettres. Chaque
  // exemple est vérifié par tests/noms-reconnus.test.js : la liste affichée ne peut pas mentir.
  // `pas` = noms volontairement NON reconnus pour cette pièce.
  var EXEMPLES_NOMS_PIECES = [
    { cle: 'certificatUrbanisme', noms: ["Certificat d'urbanisme", 'Certificat urbanisme', 'CU a)', 'CU', "Réponse d'urbanisme", 'Réponse urbanisme'] },
    { cle: 'certificatAlignement', noms: ["Certificat d'alignement", 'Arrêté d’alignement', 'Courriel alignement', 'Alignement et numérotage', 'Numérotage alignement'] },
    { cle: 'certificatNumerotage', noms: ['Certificat de numérotage', 'Numérotage', 'Numerotage'] },
    { cle: 'reponseAssainissement', noms: ['Assainissement', 'Réponse assainissement', 'Asainissement', 'SPANC', 'Contrôle SPANC'] },
    { cle: 'nonPeril', noms: ['Non péril non insalubrité', 'Péril', 'Réponse péril', 'Insalubrité', 'Arrêté de mise en sécurité'], pas: ['Attestation mise en sécurité piscine'] },
    { cle: 'renonciationPreemption', noms: ['Renonciation préemption', 'Préemption', 'DPU', 'DIA', 'Renonciation DIA', 'Réponse DIA'] },
    { cle: 'diagnosticsTechniques', noms: ['Diagnostics', 'Diagnostic', 'Diagnostique', 'DDT', 'Dossier de diagnostics techniques'] },
    { cle: 'erp', noms: ['ERP', 'État des risques', 'Etat des risques et pollutions'] },
    { cle: 'avisTaxeFonciere', noms: ['Taxe foncière', 'Taxes foncières 2025', 'TF', 'Avis TF'] },
    { cle: 'titrePropriete', noms: ['Titre de propriété', 'Titre', 'Titre vendeur'], pas: ['Titre de séjour'] },
    { cle: 'planCadastral', noms: ['Plan cadastral', 'Extrait cadastral', 'Extrait du plan cadastral', 'Plan cadastre', 'Plan de situation', 'Plan de situation BLOIS AL 694'], pas: ['Relevé de propriété', 'Matrice cadastrale'] },
    { cle: 'etatDate', noms: ['État daté', 'Etat date', 'ETAT-DATE'], pas: ['Pré-état daté', 'Pre etat date'] },
    { cle: 'article20', noms: ['Article 20-II', 'Article 20 II', 'Article 20.2', 'Article20-2'] },
    { cle: 'ribCopro', noms: ['RIB syndic', 'RIB copropriété', 'Syndic RIB', 'Copropriété RIB'] },
    { cle: 'etudeSol', noms: ['Étude de sol', 'Etude sol', 'Étude géotechnique', 'G1', 'G2'] },
    { cle: 'ramonage', noms: ['Ramonage', 'Facture ramonage', 'Attestation de ramonage'] },
    { cle: 'entretienChaudiere', noms: ['Entretien chaudière', 'Chaudière entretien', 'Contrat chaudière', 'Entretien de la chaudière'] },
    { cle: 'entretienPac', noms: ['Entretien PAC', 'Entretien pompe à chaleur', 'PAC entretien'] },
    { cle: 'entretienClim', noms: ['Climatisation', 'Entretien clim', 'Clim'] },
    { cle: 'vidangeFosse', noms: ['Vidange', 'Fosse septique', 'Vidange fosse'] },
    { cle: 'entretienAdoucisseur', noms: ['Adoucisseur', "Entretien adoucisseur d'eau"] },
    { cle: 'debroussaillage', noms: ['Débroussaillage', 'Debroussaillement', 'Élagage'] },
    { cle: 'travauxRemiseEtat', noms: ['Remise en état', 'Travaux remise en etat'] },
    { cle: 'miseEnConformite', noms: ['Mise en conformité'] },
    { cle: 'miseEnConformiteElectricite', noms: ['Mise en conformité électricité', 'Mise en conformite electrique'] },
    { cle: 'miseEnConformiteAssainissement', noms: ['Mise en conformité assainissement', 'Mise en conformité fosse'] },
    { cle: 'miseEnConformiteGaz', noms: ['Mise en conformité gaz'] },
    { cle: 'regularisationUrbanisme', noms: ['Régularisation', 'Régularisation travaux'] },
    { cle: 'cuveCiterne', noms: ['Citerne', 'Cuve fioul', 'Cuve à mazout', 'Dégazage'] },
    { cle: 'debarras', noms: ['Débarras', 'Encombrants'] },
    { cle: 'attestationConformite', noms: ['Attestation de conformité', 'Certificat de conformité', 'DAACT', 'Non-contestation conformité'] },
    { cle: 'consuel', noms: ['Consuel', 'Attestation Consuel'] },
    { cle: 'garantieDecennale', noms: ['Décennale', 'Attestation décennale', 'Garantie decennale'] },
    { cle: 'dommageOuvrage', noms: ['Dommage ouvrage', 'Dommages-ouvrage', 'Assurance dommage-ouvrage'] },
    { cle: 'facturesTravaux', noms: ['Factures travaux', 'Facture des travaux', 'Travaux factures'] },
    { cle: 'etatParasitaire', noms: ['État parasitaire', 'Mérule', 'Termites', 'Termite'] },
    { cle: 'auditEnergetique', noms: ['Audit énergétique', 'Audit energetique'] },
    { cle: 'securitePiscine', noms: ['Piscine', 'Sécurité piscine'] },
    { cle: 'resiliationContrat', noms: ['Résiliation', 'Résiliation contrat'] },
    { cle: 'offrePret', noms: ['Offre de prêt', 'OffreDePret', 'Offre de crédit', 'Offre préalable de crédit', 'Offre de contrat de prêt', 'Offre de financement', 'Accord de prêt', 'Contrat de prêt', 'Contrat de crédit immobilier'], pas: ['Décompte de remboursement éco prêt'] }
  ];

  // Pure : les lignes de la liste « Noms de fichiers reconnus » (libellé, noms, contre-exemples), dans
  // l'ordre des pièces, plus l'avant-contrat (choisirAvantContratNas).
  function lignesNomsReconnus() {
    const libelles = {};
    [...PIECES_URBANISME, PIECE_NON_PERIL, ...PIECES_COPROPRIETE, ...PIECES_AUTRES, ...PIECES_TERRAIN_AUTRES, ...PIECES_ENGAGEMENTS_AUTO].forEach(p => { if (!libelles[p.cle]) libelles[p.cle] = p.label; });
    libelles.offrePret = 'Offre de prêt';
    return [
      ...EXEMPLES_NOMS_PIECES.map(e => ({ label: libelles[e.cle] || e.cle, noms: e.noms, pas: e.pas || [] })),
      { label: 'Avant-contrat signé', noms: ['Compromis', 'Compromis signé', 'Promesse de vente', 'Promesse'], pas: [] }
    ];
  }
  function renderNomsReconnus() {
    const zone = document.getElementById('reglages-noms-reconnus');
    if (!zone) return;
    zone.innerHTML = `<ul class="noms-reconnus">${lignesNomsReconnus().map(l => `
      <li><span class="noms-reconnus-piece">${escapeHtml(l.label)}</span>
        <span class="noms-reconnus-noms">${l.noms.map(n => `<code>${escapeHtml(n)}</code>`).join(' ')}${l.pas.length ? `<span class="noms-reconnus-pas">jamais : ${l.pas.map(n => `<code>${escapeHtml(n)}</code>`).join(' ')}</span>` : ''}</span></li>`).join('')}</ul>`;
  }

  // Offre de prêt : même second essai que les pièces. Chaque forme exige le mot qui DIT de quel
  // document il s'agit (offre, contrat, accord) à côté de « prêt »/« crédit » : un « Décompte de
  // remboursement ÉCO PRÊT » (l'exemple donné par l'étude) contient « prêt » mais n'est pas une
  // offre, et ne doit pas en devenir une.
  var FORMES_NOM_OFFRE_PRET = ['offre pret', 'offre credit', 'offre financement', 'offre prealable credit', 'accord pret', 'contrat pret', 'contrat credit', 'offre contrat pret', 'offre contrat credit'];

  function nomDitOffrePret(nomNormalise) {
    const apprise = decisionFormePourNom('offrePret', nomNormalise);
    if (apprise === 'non') return false;
    const r = nomDitOffrePretMotifs(nomNormalise);
    if (!r && apprise === 'oui') { noterVerificationPoste('formes-noms-reconnaissance'); return true; }
    return r;
  }

  function nomDitOffrePretMotifs(nomNormalise) {
    if (OFFRE_PRET_RE.test(nomNormalise)) return true;
    const tokens = tokensNomFichier(nomNormalise);
    return FORMES_NOM_OFFRE_PRET.some(f => correspondFormeNom(f, tokens));
  }
