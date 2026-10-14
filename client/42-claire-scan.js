  // ==== CLASSEUR DES SCANS DU COPIEUR (30/09) ====
  // Tous les scans du copieur arrivent dans UN dossier « Scan » à la racine du NAS. CLAIRE les lit
  // (pdf.js, OCR tesseract.js pour un scan sans texte), reconnaît le dossier client et le type de
  // pièce, puis demande au serveur de ranger une COPIE dans la bonne rubrique du dossier client
  // (l'original part dans l'archive du dossier Scan, voir server/src/scans.js).
  //
  // Deux leçons déjà payées, appliquées ici :
  //  - le type de pièce se lit sur le HAUT DE LA PREMIÈRE PAGE seulement (comme le titre d'une offre
  //    de prêt) : un compromis ou un état daté cite toutes les autres pièces, compter des mots-clés
  //    sur tout le document les mélange (essai du script Python fourni : 5 états datés sur 5 pris
  //    pour un règlement de copropriété) ;
  //  - la copie porte un nom que la checklist de CLAIRE reconnaît (le libellé même de la pièce), pour
  //    que la pièce passe « reçue » au parcours suivant du NAS, sans rien à cocher.
  // Tout ce bloc jusqu'à « fin du socle pur des scans » est pur (testé dans tests/scans.test.js).

  // Texte comparable : minuscules, sans accents, apostrophes droites, espaces simples. Pure.
  function texteNormaliseScan(texte) {
    return String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
  }
  // Même texte réduit aux lettres et chiffres, bordé d'espaces : un mot entier se teste par
  // `includes(' mot ')`, sans les pièges de \b sur les lettres accentuées. Pure.
  function texteMotsScan(texte) {
    return ' ' + texteNormaliseScan(texte).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  }

  // Longueur du « haut de la première page » où se lit le type de pièce : assez pour passer
  // l'en-tête d'un courrier (« Objet : … ») ou le préambule d'un acte (« L'AN DEUX MILLE… Maître…
  // a reçu le présent acte… PROMESSE UNILATÉRALE DE VENTE »), pas assez pour atteindre le corps.
  var LONGUEUR_ENTETE_SCAN = 1500;

  // Types de pièces reconnus sur le haut de la première page, DANS L'ORDRE (le premier qui
  // correspond l'emporte : les plus spécifiques d'abord). `piece` = clé de la checklist quand la
  // copie doit la faire passer « reçue » (son libellé sert alors de nom de fichier) ; `rubriques`
  // = rubriques du dossier client essayées dans l'ordre (voir RUBRIQUES_SCANS côté serveur), la
  // racine du dossier à défaut ; `parPartie` = la rubrique dépend de la partie nommée (vendeur ou
  // acquéreur). Motifs écrits sur des en-têtes réels (voir tests/scans.test.js) ; « à confirmer
  // par l'étude » pour la rubrique de chaque type (arborescence reçue le 19/09, usage non précisé).
  var TYPES_SCAN = [
    { cle: 'preEtatDate', label: 'Pré-état daté', motif: /pre[- ]?etat date/, rubriques: ['preEtatDate', 'copro'] },
    { cle: 'etatDate', label: 'État daté', piece: 'etatDate', motif: /etat date|immeuble sis a .{0,300}coproprietaire cedant/, rubriques: ['etatDate', 'copro'] },
    { cle: 'article20', label: 'Article 20-II', piece: 'article20', motif: /certificat (de l'|prevu (a|par) l')?article 20|article 20[ -]*(ii|2) /, rubriques: ['etatDate', 'copro'] },
    // Nommé « Compromis signé » : c'est le mot que choisirAvantContratNas cherche dans le nom d'un
    // fichier du dossier quand l'avant-contrat n'a pas été importé par CLAIRE (« promesse » aussi).
    { cle: 'promesse', label: 'Promesse de vente signée', motif: /promesse (unilaterale |synallagmatique )?de vente|promesse d'achat/, refuse: /veuillez trouver ci[- ]joint|vous trouverez ci[- ]joint|je vous prie|nous vous prions|cher maitre|chere maitre|madame, monsieur|ci[- ]joint (le|la|l')/, rubriques: ['sru'] },
    { cle: 'avantContrat', label: 'Compromis signé', motif: /compromis de vente|vente .{0,80}sous conditions? suspensives?|entre les soussignes|information prealable .{0,200}avant[- ]contrat/, refuse: /veuillez trouver ci[- ]joint|vous trouverez ci[- ]joint|je vous prie|nous vous prions|cher maitre|chere maitre|madame, monsieur|ci[- ]joint (le|la|l')/, rubriques: ['sru'] },
    { cle: 'certificatUrbanisme', label: "Certificat d'urbanisme", piece: 'certificatUrbanisme', motif: /certificat d'urbanisme|note de renseignements d'urbanisme/, refuse: /veuillez (nous|me) (adresser|transmettre|faire parvenir)|nous vous (serions|saurions) gre|nous vous prions de bien vouloir|je vous prie de bien vouloir (me|nous) (adresser|transmettre|faire parvenir)|cerfa|(?<!votre )(?<!vu la )demande de (certificat|controle|raccordement)/, rubriques: ['aae'] },
    { cle: 'alignementNumerotage', label: "Certificat d'alignement et de numérotage", piece: 'certificatAlignement', piecesAussi: ['certificatNumerotage'], motif: /alignement.{0,80}numerotage|numerotage.{0,80}alignement/, rubriques: ['aae'] },
    { cle: 'certificatAlignement', label: "Certificat d'alignement", piece: 'certificatAlignement', motif: /alignement/, rubriques: ['aae'] },
    { cle: 'certificatNumerotage', label: 'Certificat de numérotage', piece: 'certificatNumerotage', motif: /numerotage/, rubriques: ['aae'] },
    // Une DIA envoyée, une notification à la SAFER ou une demande au SPANC ne sont pas des réponses (audit 12/10 : cochées
    // comme reçues) : la pièce n'est cochée que sur une réponse (renonciation, décision) ; sinon le type sans pièce qui suit.
    { cle: 'renonciationPreemption', label: 'Renonciation au droit de préemption', piece: 'renonciationPreemption', motif: /preemption|intention d'aliener/, exige: /renonc|ne pas (exercer|preempter|faire usage)|non[- ]?exercice|n'entend pas|ne preemptera|decide de ne pas|pas usage/, refuse: /veuillez (nous|me) (adresser|transmettre|faire parvenir)|nous vous (serions|saurions) gre|nous vous prions de bien vouloir|je vous prie de bien vouloir (me|nous) (adresser|transmettre|faire parvenir)|cerfa|(?<!votre )(?<!vu la )demande de (certificat|controle|raccordement)/, rubriques: ['aae'] },
    { cle: 'demandePreemption', label: "Déclaration d'intention d'aliéner (DIA) ou notification", motif: /preemption|intention d'aliener|safer/, rubriques: ['aae'] },
    { cle: 'reponseAssainissement', label: 'Courrier réponse assainissement', piece: 'reponseAssainissement', motif: /assainissement|spanc/, refuse: /veuillez (nous|me) (adresser|transmettre|faire parvenir)|nous vous (serions|saurions) gre|nous vous prions de bien vouloir|je vous prie de bien vouloir (me|nous) (adresser|transmettre|faire parvenir)|cerfa|(?<!votre )(?<!vu la )demande de (certificat|controle|raccordement)/, rubriques: ['aae'] },
    { cle: 'demandeAssainissement', label: 'Demande au service assainissement', motif: /assainissement|spanc/, rubriques: ['aae'] },
    { cle: 'erp', label: 'ERP (état des risques et pollution)', piece: 'erp', motif: /etat des risques/, rubriques: ['environnement', 'diagnostics', 'aae'] },
    { cle: 'diagnosticsTechniques', label: 'Diagnostics techniques', piece: 'diagnosticsTechniques', motif: /dossier de diagnostics? techniques?|diagnostic de performance energetique|constat de risque d'exposition au plomb|etat de l'installation interieure|presence de termites|reperage (des materiaux .{0,60})?amiante|rapport de (mission de )?(diagnostic|reperage)|attestation de (superficie|surface)|loi carrez/, rubriques: ['diagnostics', 'aae'] },
    { cle: 'etudeSol', label: 'Étude de sol', piece: 'etudeSol', motif: /etude (geotechnique|de sol)/, rubriques: ['construction', 'environnement', 'aae'] },
    { cle: 'offrePret', label: 'Offre de prêt', motif: /offre de (pret|credit)|offre prealable de credit|contrat de (pret|credit) immobilier/, rubriques: ['pret', 'comptabilite'] },
    { cle: 'decompte', label: 'Décompte', motif: /decompte (previsionnel|financier|definitif|acquereur|vendeur)/, rubriques: ['comptabilite'] },
    { cle: 'convocation', label: "Convocation au rendez-vous contenant l'appel de fonds", motif: /confirmer le rendez-vous|confirme le rendez-vous|convocation/, rubriques: [] },
    { cle: 'etatHypothecaire', label: 'État hypothécaire', motif: /etat hypothecaire|renseignements sommaires|etat (hors|sur) formalites?|demande de renseignements/, rubriques: ['hypotheque'] },
    { cle: 'avisTaxeFonciere', label: 'Avis de taxe foncière', piece: 'avisTaxeFonciere', motif: /avis_tf|montant de vos taxes foncieres|avis d'impots? locaux|avis d'(impot|imposition).{0,80}foncier|taxes? foncieres? \d{4}/, rubriques: ['comptabilite'] },
    { cle: 'appelCharges', label: 'Appel de charges', motif: /appel (trimestriel|de fonds|de charges|provisionnel|de provisions?)/, exige: /coproprietaire|syndic|lot/, rubriques: ['copro'] },
    { cle: 'pvAssemblee', label: "Procès-verbal d'assemblée générale", motif: /proces[- ]verbal .{0,60}assemblee generale/, rubriques: ['copro'] },
    { cle: 'reglementCopro', label: 'Règlement de copropriété', motif: /reglement de copropriete|etat descriptif de division/, rubriques: ['copro'] },
    { cle: 'ramonage', label: 'Ramonage (attestation ou facture)', piece: 'ramonage', motif: /ramonage/, rubriques: ['aae'] },
    { cle: 'entretienChaudiere', label: 'Entretien de la chaudière', piece: 'entretienChaudiere', motif: /entretien .{0,40}chaudiere|chaudiere .{0,40}entretien/, rubriques: ['aae'] },
    { cle: 'entretienPac', label: 'Entretien de la pompe à chaleur (PAC)', piece: 'entretienPac', motif: /pompe a chaleur/, rubriques: ['aae'] },
    { cle: 'vidangeFosse', label: 'Vidange de la fosse septique', piece: 'vidangeFosse', motif: /vidange|fosse (septique|toutes eaux)/, rubriques: ['aae'] },
    { cle: 'garantieDecennale', label: 'Garantie décennale', piece: 'garantieDecennale', motif: /decennale/, rubriques: ['travaux', 'aae'] },
    { cle: 'dommageOuvrage', label: 'Assurance dommage-ouvrage', piece: 'dommageOuvrage', motif: /dommages?[- ]ouvrage/, rubriques: ['travaux', 'aae'] },
    // L'extrait de plan du site cadastre.gouv.fr (DGFiP) porte en tête « EXTRAIT DU PLAN CADASTRAL » ou « PLAN DE SITUATION ».
    { cle: 'planCadastral', label: 'Plan cadastral', piece: 'planCadastral', motif: /extrait du plan cadastral|plan de situation/, rubriques: ['aae'] },
    { cle: 'titrePropriete', label: 'Titre de propriété', piece: 'titrePropriete', motif: /attestation (immobiliere|de propriete)|titre de propriete/, rubriques: ['titre'] },
    { cle: 'identite', label: "Pièce d'identité", motif: /carte nationale d'identite|passeport|titre de sejour|permis de conduire|identity card/, rubriques: [], parPartie: true },
    { cle: 'etatCivil', label: 'État civil', motif: /livret de famille|acte de (naissance|mariage|deces)|pacte civil de solidarite|contrat de mariage|jugement de divorce/, rubriques: [], parPartie: true },
    { cle: 'ribCopro', label: 'RIB de la copropriété', piece: 'ribCopro', motif: /releve d'identite bancaire|\biban\b/, exige: /syndic|copropriete/, rubriques: ['copro'] },
    { cle: 'rib', label: 'RIB', motif: /releve d'identite bancaire|\biban\b/, rubriques: [], parPartie: true },
    { cle: 'releveCompte', label: 'Relevé de compte client', motif: /releve de compte client/, rubriques: ['comptabilite'] },
    { cle: 'facture', label: 'Facture', motif: /\bfacture\b/, rubriques: ['travaux', 'aae'], faible: true }
  ];

  // Haut de la première page, normalisé. `texte` = texte de la page 1 (lignes jointes). Pure.
  function enTeteScan(textePage1) {
    return texteNormaliseScan(textePage1).slice(0, LONGUEUR_ENTETE_SCAN);
  }

  // Un acte notarié s'ouvre sur « L'AN DEUX MILLE… » : c'est un avant-contrat s'il le dit
  // (« PROMESSE UNILATÉRALE DE VENTE », « COMPROMIS »), sinon un acte de vente reçu, c'est-à-dire
  // le titre de propriété du vendeur. Son préambule nomme les parties et leur état civil (« contrat
  // de mariage », « acte de naissance ») : les autres types n'y sont donc pas cherchés.
  var RE_OUVERTURE_ACTE_SCAN = /^.{0,200}l'an (deux )?mil/;
  var RE_ACTE_DE_VENTE_SCAN = /\bvente\b|attestation (immobiliere|de propriete)/;

  // Type de pièce d'après le haut de la première page, ou null. Parmi les types qui y figurent,
  // celui mentionné LE PLUS HAUT l'emporte : c'est le titre ou l'objet ; ce qu'un courrier ou un
  // décompte cite plus bas (« prorata de taxe foncière », « la promesse de vente ») ne décide
  // rien. Un type `faible` (facture) ne compte que si aucun autre ne figure. Pure.
  function typePieceScan(enTete) {
    const t = String(enTete || '');
    if (!t) return null;
    if (RE_OUVERTURE_ACTE_SCAN.test(t)) {
      // Un acte notarié n'est jamais une lettre d'envoi : pas de `refuse` ici.
      const avant = TYPES_SCAN.find(ty => (ty.cle === 'promesse' || ty.cle === 'avantContrat') && ty.motif.test(t));
      if (avant) return avant;
      return RE_ACTE_DE_VENTE_SCAN.test(t) ? TYPES_SCAN.find(ty => ty.cle === 'titrePropriete') : null;
    }
    let meilleur = null;
    let position = Infinity;
    for (const faible of [false, true]) {
      for (const ty of TYPES_SCAN) {
        if (!!ty.faible !== faible || (ty.exige && !ty.exige.test(t)) || (ty.refuse && ty.refuse.test(t))) continue;
        const m = ty.motif.exec(t);
        if (m && m.index < position) { meilleur = ty; position = m.index; }
      }
      if (meilleur) return meilleur;
    }
    return null;
  }

  // Mots d'un nom de personne qui permettent de la reconnaître : trois lettres au moins, hors
  // civilités et particules. Pure.
  var MOTS_VIDES_NOM_SCAN = new Set(['monsieur', 'madame', 'mademoiselle', 'mme', 'mlle', 'epoux', 'epouse', 'veuve', 'nee', 'les', 'des', 'del', 'societe', 'sci', 'sarl', 'sas', 'selarl', 'civile', 'immobiliere', 'vendeur', 'vendeurs', 'acquereur', 'acquereurs']);
  function motsNomScan(nom) {
    return texteMotsScan(nom).trim().split(' ').filter(m => m.length >= 3 && !MOTS_VIDES_NOM_SCAN.has(m) && !/^\d+$/.test(m));
  }

  // Voie de l'adresse du bien, au format de CLAIRE (« BLOIS (41000), 12 rue des Lilas ») comme au
  // format postal (« 12 rue des Lilas 41000 BLOIS ») : « 12 rue des lilas ». Le script Python
  // fourni gardait ce qui précède le code postal, soit la commune seule sur le format de CLAIRE,
  // et ne reconnaissait donc jamais une adresse. Pure.
  function voieAdresseScan(adresse) {
    const a = String(adresse || '');
    if (!a.trim()) return '';
    let voie = /\(\d{5}\)\s*,\s*(.+)$/.exec(a) ? /\(\d{5}\)\s*,\s*(.+)$/.exec(a)[1] : a.split(/\b\d{5}\b/)[0];
    voie = texteMotsScan(voie).trim();
    // Sans numéro, une voie courte (« rue de la gare ») se retrouve dans trop de courriers : elle ne compte pas (audit 12/10).
    if (!/\d/.test(voie) && voie.length < 16) return '';
    return voie.length >= 8 && /[a-z]{3}/.test(voie) ? voie : '';
  }

  // Parcelles du dossier : [{ section: 'ab', numero: '123' }]. Pure.
  function parcellesScan(d) {
    const cad = d && d.bien && d.bien.cadastre;
    return (typeof clesParcelles === 'function' ? clesParcelles(cad) : []).map(c => {
      const [section, numero] = c.split(' ');
      return { section: String(section || '').toLowerCase(), numero: String(numero || '') };
    }).filter(p => /^[a-z]{1,2}$/.test(p.section) && /^\d{1,4}$/.test(p.numero));
  }

  // Personnes du dossier à chercher dans le scan : les parties (et leur nom d'usage), à défaut les
  // deux côtés du nom du dossier (« VENDEUR / ACQUÉREUR »). Pure.
  function personnesDossierScan(d) {
    const parties = Array.isArray(d && d.parties) ? d.parties : [];
    if (parties.length) {
      return parties.map(p => ({ mots: motsNomScan(p.nom), usage: p.nomUsage ? motsNomScan(p.nomUsage) : [], role: p.role, nom: p.nom }))
        .filter(p => p.mots.length);
    }
    return String((d && d.nom) || '').split(/[\/&]|\bet\b/i).map((morceau, i) => ({ mots: motsNomScan(morceau), usage: [], role: i === 0 ? 'VENDEUR' : 'ACQUEREUR', nom: morceau.trim() }))
      .filter(p => p.mots.length);
  }

  // Barème du score de dossier : celui du script Python fourni par l'étude (« j'aimais bien le
  // système de score », 30/09), moins le numéro de dossier que les dossiers clients n'ont pas.
  // Une personne compte si TOUS les mots de son nom figurent dans le scan (deux au plus) ; la voie
  // de l'adresse du bien au format de CLAIRE ; une parcelle (section et numéro rapprochés). Sûr à
  // partir du seuil ET avec une marge sur le deuxième dossier (deux dossiers d'une même famille ne
  // se départagent pas par un seul nom). Modifier ici change le rangement automatique.
  // Seuil abaissé de 6 à 4 par l'étude (30/09) : l'adresse du bien seule, ou une partie nommée avec
  // un autre indice, suffit ; une partie nommée seule (3) reste une suggestion à valider.
  // Affichée sur 6 (étude, 30/09 : « Score 7/4 » ne se lisait pas) : note plafonnée à `noteMax`,
  // seuil lu « 4/6 ». Les comparaisons (seuil, marge sur le suivant) gardent le score brut.
  var BAREME_SCORE_SCAN = { partie: 3, partiesMax: 2, adresse: 4, parcelle: 5, seuil: 4, marge: 1.3, noteMax: 6 };

  // Note affichée d'un score brut : « 6/6 » pour 7 points ou plus. Pure.
  function noteScoreScan(score) {
    const n = Math.max(0, Math.min(BAREME_SCORE_SCAN.noteMax, Number(score) || 0));
    return `${n}/${BAREME_SCORE_SCAN.noteMax}`;
  }

  // Score d'un dossier pour un scan, avec le détail des points (`raisons`, lisibles telles quelles
  // à l'écran : « 2 parties nommées +6 »). Pure.
  function scoreDossierScan(d, mots) {
    const b = BAREME_SCORE_SCAN;
    let score = 0;
    const raisons = [];
    const trouvees = [];
    for (const p of personnesDossierScan(d)) {
      const present = (liste) => liste.length && liste.every(m => mots.includes(' ' + m + ' '));
      // Nom d'usage (« épouse LEROY ») : le nom de naissance peut manquer sur la pièce ; le nom
      // d'usage ET un autre mot du nom (le prénom) suffisent alors.
      const parUsage = present(p.usage) && p.mots.some(m => !p.usage.includes(m) && mots.includes(' ' + m + ' '));
      if (present(p.mots) || parUsage) trouvees.push(p);
    }
    if (trouvees.length) {
      const n = Math.min(trouvees.length, b.partiesMax);
      score += b.partie * n;
      raisons.push(`${n > 1 ? n + ' parties nommées' : '1 partie nommée'} +${b.partie * n}`);
    }
    const voie = voieAdresseScan(d && d.adresseBien);
    if (voie && mots.includes(' ' + voie + ' ')) { score += b.adresse; raisons.push(`adresse du bien +${b.adresse}`); }
    // Section suivie du numéro (au plus « n° » entre les deux) ; une section d'une lettre (« a 12 » est partout) seulement
    // juste après « section », « cadastré » ou « parcelle » (audit 12/10 : un scan était rangé seul dans le mauvais dossier).
    for (const p of parcellesScan(d)) {
      const re = new RegExp(`\\s${p.section}\\s(?:n\\s|no\\s|numero\\s)?0*${p.numero}\\s`, 'g');
      let m;
      let trouve = false;
      while (!trouve && (m = re.exec(mots))) {
        trouve = p.section.replace(/^0/, '').length > 1 || /(?:section|cadastr\S*|parcelles?)\s(?:\S+\s){0,2}$/.test(mots.slice(Math.max(0, m.index - 60), m.index + 1));
        re.lastIndex = m.index + 1;
      }
      if (trouve) { score += b.parcelle; raisons.push(`parcelle ${p.section.toUpperCase()} ${p.numero} +${b.parcelle}`); break; }
    }
    // Une personne connue par son seul nom, porté aussi par une partie de l'autre côté (vendeur et acquéreur du même nom), ne dit
    // pas le côté de la pièce : il faut le nom ET le prénom (étude 07/10).
    const personnes = personnesDossierScan(d);
    const ambigue = (p) => p.mots.length < 2 && personnes.some(q => q.role !== p.role && q.mots.includes(p.mots[0]));
    const roles = [...new Set(trouvees.filter(p => !ambigue(p)).map(p => p.role))];
    return { score, raisons, role: roles.length === 1 ? roles[0] : null, personnes: trouvees.map(p => p.nom) };
  }

  // Le dossier d'un scan parmi `dossiers` (non archivés). `sur` seulement au-dessus du seuil ET
  // nettement devant le deuxième ; sinon le meilleur reste une suggestion à confirmer. Pure.
  function identifierDossierScan(texte, dossiersCandidats) {
    const b = BAREME_SCORE_SCAN;
    const mots = texteMotsScan(texte);
    const classes = (dossiersCandidats || []).filter(d => d && !d.archive)
      .map(d => Object.assign({ dossier: d }, scoreDossierScan(d, mots)))
      .filter(c => c.score > 0)
      .sort((a, b2) => b2.score - a.score);
    if (!classes.length) return { dossier: null, sur: false, score: 0, second: 0, raisons: [], role: null, candidats: [] };
    const [premier, second] = classes;
    const sur = premier.score >= b.seuil && (!second || premier.score >= second.score * b.marge);
    return { dossier: premier.dossier, sur, score: premier.score, second: second ? second.score : 0, raisons: premier.raisons, role: premier.role, personnes: premier.personnes,
      candidats: classes.slice(0, 5).map(c => ({ id: c.dossier.id, score: c.score })) };
  }

  // « Score 6/6 : 2 parties nommées +6, adresse du bien +4 », et ce qui manque quand ce n'est pas
  // sûr (seuil de 4/6 non atteint, ou deuxième dossier trop proche). Pure.
  function explicationScoreScan(p) {
    if (!p || !p.score) return `Aucun dossier reconnu (score 0/${BAREME_SCORE_SCAN.noteMax})`;
    const b = BAREME_SCORE_SCAN;
    const detail = `Score ${noteScoreScan(p.score)} : ${p.raisons.join(', ')}`;
    if (p.score < b.seuil) return `${detail} — sous le seuil de ${noteScoreScan(b.seuil)}`;
    if (p.second && p.score < p.second * b.marge) return `${detail} — un autre dossier est à ${noteScoreScan(p.second)}`;
    return detail;
  }

  // Nom de la copie rangée : le libellé du type (celui de la pièce de la checklist quand il y en
  // a une, que CLAIRE reconnaîtra donc par son nom), la personne pour une pièce d'identité ou
  // d'état civil, puis « - Claire Scan » (étude, 30/09 : ni date ni référence du scan).
  // « Nom (2).pdf » côté serveur si le nom existe déjà. Pure.
  var SUFFIXE_NOM_SCAN = 'Claire Scan';
  function nomCibleScan(type, options) {
    const o = options || {};
    if (!type) return SUFFIXE_NOM_SCAN;
    const personne = type.parPartie && o.personne ? ' - ' + String(o.personne).replace(/\s+/g, ' ').trim() : '';
    return `${type.label}${personne} - ${SUFFIXE_NOM_SCAN}`;
  }

  // Rubriques essayées pour ce type et ce dossier (la partie reconnue décide pour une pièce
  // d'identité, un état civil ou un RIB). Pure.
  function rubriquesScan(type, role) {
    if (!type) return [];
    if (type.parPartie) return role === 'VENDEUR' ? ['vendeur'] : role === 'ACQUEREUR' ? ['acquereur'] : [];
    return type.rubriques.slice();
  }

  // Libellé lisible d'une rubrique proposée (écran « Scans à ranger »). Pure.
  var LIBELLES_RUBRIQUES_SCAN = {
    vendeur: 'Vendeur', acquereur: 'Acquéreur', titre: 'Titre de propriété', diagnostics: 'Diagnostics', environnement: 'Environnement',
    hypotheque: 'Situation hypothécaire', travaux: 'Travaux', construction: 'Construction', sru: 'SRU', aae: 'AAE', copro: 'Copropriété',
    etatDate: 'COPRO › ETAT DATE', preEtatDate: 'COPRO › PRE ETAT DATE', comptabilite: 'Comptabilité', pret: 'Comptabilité › PRET'
  };
  function libelleRubriquesScan(rubriques) {
    return rubriques && rubriques.length ? (LIBELLES_RUBRIQUES_SCAN[rubriques[0]] || rubriques[0]) : 'racine du dossier';
  }

  // Proposition complète pour un scan : dossier, type, nom de la copie, rubriques, et si elle peut
  // être rangée sans intervention (dossier sûr, relié au NAS, et type reconnu). Pure.
  function propositionScan(lecture, dossiersCandidats, dateIso) {
    const texte = (lecture && lecture.texte) || '';
    const type = typePieceScan(enTeteScan((lecture && lecture.page1) || texte));
    const id = identifierDossierScan(texte, dossiersCandidats);
    const d = id.dossier;
    const personne = id.personnes && id.personnes.length === 1 ? id.personnes[0] : '';
    const rubriques = rubriquesScan(type, id.role);
    const relie = !!(d && d.nasDossier);
    return {
      dossierId: d ? d.id : null, dossierSur: id.sur, score: id.score, second: id.second, raisons: id.raisons, candidats: id.candidats,
      type: type ? type.cle : null, rubriques, nomCible: nomCibleScan(type, { date: dateIso, personne }),
      relie, automatique: !!(id.sur && type && relie)
    };
  }
  // --- fin du socle pur des scans ---------------------------------------------------------------

  // ---- Écran « Scans à ranger » et rangement automatique ------------------------------------
  // État en mémoire : la liste du serveur, et pour chaque scan (clé nom + date) sa lecture et la
  // proposition, que l'étude peut corriger avant de ranger. Rien n'est enregistré côté poste.
  // `charge` : faux tant que le serveur n'a pas répondu une première fois — les réglages ne sont alors
  // PAS connus (et non « désactivés ») : l'interrupteur reste grisé plutôt que d'afficher un état faux
  // (étude, 30/09 : « dès que je quitte CLAIRE je suis obligé de recocher »).
  var etatScans = { charge: false, configure: false, raison: '', dossier: '', reglages: { actif: false, auto: false, depuis: null }, scans: [], ecartes: [], journal: [] };
  var lecturesScans = {};           // cle → { statut: 'lecture'|'pret'|'erreur', lecture, proposition, choix }
  var scansEnRangement = new Set();
  // « Laisser dans Scan » en cours (étude, 01/10 : un indicateur dès le clic, pendant que ça mouline).
  var scansEnEcart = new Set();
  // Scans dont le rangement automatique a échoué : jamais retentés seuls (ils attendent un geste).
  var echecsAutoScans = new Set();
  // Aperçu des scans (étude, 01/10 : « mettre un aperçu des pièces scannées dans Claire Scan ») :
  // vignette de la page 1 faite pendant la lecture du scan (même PDF déjà chargé), cle → image
  // JPEG en data: URL, ou 'echec'.
  var apercusScans = {};
  var surveillanceScansLancee = false;
  var DELAI_SURVEILLANCE_SCANS = 2 * 60 * 1000;
  var PAGES_TEXTE_SCAN = 4;
  var PAGES_OCR_SCAN = 2;

  function cleScan(s) { return s.nom + '|' + s.date; }

  // Le rangement automatique se fait dans UNE fenêtre CLAIRE à la fois (c'est elle qui lit et fait
  // l'OCR) : le serveur accorde le relais à une fenêtre, la fenêtre du poste serveur en priorité, et
  // le passe à une autre si elle se tait (voir /api/scans/relais). Identifiant tiré au chargement.
  var fenetreScans = 'f-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  var relaisScansAccorde = false;
  async function demanderRelaisScans() {
    // Pas de remise à faux AVANT la réponse : une lecture en cours (OCR) testerait le relais pendant
    // l'attente et sauterait le rangement d'un scan pourtant sûr.
    if (!etatScans.reglages.actif || !etatScans.reglages.auto) { relaisScansAccorde = false; return; }
    try {
      const r = await fetchAvecAuth('/api/scans/relais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fenetre: fenetreScans }) });
      relaisScansAccorde = r.ok && !!(await r.json()).accorde;
    } catch (e) { relaisScansAccorde = false; }
  }

  function dossiersCandidatsScans() {
    return (dossiers || []).filter(d => d && !d.archive);
  }

  // `fond` : appel de la surveillance (voir demarrerSurveillanceScans) — la lecture des scans (OCR,
  // parfois plusieurs minutes) part sans être attendue, pour que la liste continue d'être relue.
  // Rend vrai quand le dossier du copieur est trouvé et lu.
  async function chargerScans(fond) {
    if (!authToken) return false;
    try {
      const r = await fetchAvecAuth('/api/scans');
      if (!r.ok) return false;
      etatScans = Object.assign(etatScans, await r.json(), { charge: true });
    } catch (e) { return false; }
    majBadgeScans();
    // Carte « Dernières pièces » du tableau de bord : scans à ranger et rangés à jour.
    if (ongletActuel === 'dashboard') {
      try { renderPiecesRecuesDashboard(dossiersDuPerimetre(dossiers, utilisateurPoste, vueGlobaleDashboard()).filter(d => !d.archive)); } catch (e) { /* carte absente */ }
    }
    // Réglages affichés dès la réponse, sans attendre la lecture des scans en attente (OCR : parfois
    // plusieurs minutes, pendant lesquelles l'écran montrait l'interrupteur décoché).
    renderReglagesScans();
    await demanderRelaisScans();
    const presents = new Set((etatScans.scans || []).map(cleScan));
    Object.keys(lecturesScans).forEach(k => { if (!presents.has(k)) delete lecturesScans[k]; });
    Object.keys(apercusScans).forEach(k => { if (!presents.has(k)) delete apercusScans[k]; });
    const visible = ongletActuel === 'scans';
    if (visible) renderScans();
    if (visible || rangementAutoScansActif()) {
      const lecture = lireScansEnAttente();
      if (fond === true) lecture.catch(e => console.error('Lecture des scans', e)); else await lecture;
    }
    return !!etatScans.configure;
  }

  // Scans qui attendent quelqu'un : tous ceux du dossier Scan, sauf ceux que cette fenêtre est en
  // train de ranger seule (rangement automatique, dossier et pièce sûrs, pas d'échec). Pure.
  function nombreScansEnAttente(etat, lectures, echecs, autoActif) {
    if (!etat || !etat.reglages || !etat.reglages.actif) return 0;
    return (etat.scans || []).filter(s => {
      const l = lectures && lectures[s.nom + '|' + s.date];
      const rangeSeul = autoActif && l && l.statut === 'pret' && l.proposition && l.proposition.automatique && !(echecs && echecs.has(s.nom + '|' + s.date));
      return !rangeSeul;
    }).length;
  }

  // Pastille « Scans à ranger » (étude, 30/09) : le nombre à côté du lien, un point sur l'icône
  // quand la barre est repliée et sur le bouton du menu en largeur téléphone (voir
  // majPastilleMenuMobile).
  function majBadgeScans() {
    const badge = document.getElementById('badge-scans');
    if (!badge) return;
    const n = nombreScansEnAttente(etatScans, lecturesScans, echecsAutoScans, rangementAutoScansActif());
    badge.textContent = n > 99 ? '99+' : String(n);
    // '' et non 'inline-flex' : la barre repliée masque le nombre par sa feuille de style.
    badge.style.display = n ? '' : 'none';
    badge.title = n ? `${n} scan${n > 1 ? 's' : ''} en attente de rangement` : '';
    const lien = document.getElementById('tab-scans');
    if (lien) lien.classList.toggle('a-notif', n > 0);
    majPastilleMenuMobile();
  }

  // Un point sur le bouton du menu (téléphone) dès qu'une pastille de la barre latérale est
  // allumée : sans lui, rien ne se voit tant que le menu est fermé.
  function majPastilleMenuMobile() {
    const burger = document.getElementById('sidebar-burger');
    if (!burger) return;
    burger.classList.toggle('a-notif', !!document.querySelector('.sidebar-link.a-notif, #tab-scans.a-notif'));
  }

  // Surveillance de fond, lancée au démarrage sans rien ouvrir (étude, 30/09 : « obligé d'aller dans
  // les réglages pour que le scan se relie au dossier Scan ») : toutes les 2 minutes une fois le
  // dossier du copieur trouvé ; tant qu'il ne l'est pas (partage réseau pas encore joignable au
  // démarrage du poste, serveur qui redémarre), nouvel essai toutes les 20 secondes.
  var DELAI_REESSAI_SCANS = 20 * 1000;
  function demarrerSurveillanceScans() {
    if (surveillanceScansLancee) return;
    surveillanceScansLancee = true;
    const tour = async () => {
      let relie = false;
      try { relie = await chargerScans(true); } catch (e) { relie = false; }
      setTimeout(tour, relie ? DELAI_SURVEILLANCE_SCANS : DELAI_REESSAI_SCANS);
    };
    tour();
  }

  // Lit un scan : texte de page 1 à part (le type s'y lit), texte des premières pages (le dossier),
  // OCR des deux premières pages si le PDF n'a pas de texte.
  async function lireScan(scan, surApercu) {
    if (typeof pdfjsLib === 'undefined') throw new Error('Lecteur PDF indisponible');
    const r = await fetchAvecAuth('/api/scans/fichier?nom=' + encodeURIComponent(scan.nom));
    if (!r.ok) throw new Error('Scan introuvable');
    const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await r.arrayBuffer() }).promise;
    if (surApercu) {
      try { surApercu(await imagePagePdf(pdf, 1, LARGEUR_VIGNETTE_SCAN, 0.72)); } catch (e) { surApercu(''); }
    }
    const pages = [];
    for (let p = 1; p <= Math.min(pdf.numPages, PAGES_TEXTE_SCAN); p++) {
      const page = await pdf.getPage(p);
      pages.push(lignesDepuisItemsPdf((await page.getTextContent()).items).join('\n'));
    }
    let viaOcr = false;
    if (pages.join('').trim().length < 40) {
      const worker = await creerWorkerOcr();
      if (!worker) throw new Error('OCR indisponible');
      try {
        pages.length = 0;
        for (let p = 1; p <= Math.min(pdf.numPages, PAGES_OCR_SCAN); p++) pages.push(await ocrPage(pdf, p, worker));
        viaOcr = true;
      } finally {
        await worker.terminate();
      }
    }
    return { page1: pages[0] || '', texte: pages.join('\n'), pages: pdf.numPages, viaOcr };
  }

  // Lit les scans pas encore lus, un par un (l'OCR est lourd), et range ceux qui sont sûrs quand
  // le rangement automatique est actif sur ce poste. Le réglage est relu à CHAQUE scan : activé
  // pendant une lecture, il vaut pour la suite sans attendre le tour suivant. Un appel reçu pendant
  // une lecture relance un passage à la fin plutôt que d'être perdu.
  var lectureScansEnCours = false;
  var relancerLectureScans = false;
  // Lecture d'un scan (texte, puis OCR des deux premières pages) : au-delà, elle est comptée en échec et « Actualiser » la relance.
  var DUREE_MAX_LECTURE_SCAN_MS = 3 * 60 * 1000;
  function avecDureeMaxScan(promesse, ms) {
    let minuterie = null;
    const delai = new Promise((_, rejeter) => { minuterie = setTimeout(() => rejeter(new Error('Lecture trop longue : « Actualiser » la relance.')), ms); });
    return Promise.race([promesse, delai]).finally(() => clearTimeout(minuterie));
  }

  // Pure : les lectures à refaire quand l'étude clique « Actualiser » — celles en échec (PDF illisible un instant, NAS lent, lecture
  // trop longue) ; une lecture réussie est gardée.
  function lecturesARelancerScans(lectures) {
    return Object.keys(lectures || {}).filter(k => lectures[k] && lectures[k].statut === 'erreur');
  }

  // Bouton « Actualiser » de Claire Scan (étude 07/10 : « le bouton Actualiser ne fonctionne pas ») : il relisait le dossier sans
  // rien montrer, et ne relançait jamais une lecture en échec. Désormais : le bouton tourne, les lectures en échec repartent, la liste
  // est relue tout de suite (les lectures continuent derrière) et le résultat est dit.
  async function actualiserScans(bouton) {
    if (bouton) bouton.loading = true;
    lecturesARelancerScans(lecturesScans).forEach(k => { delete lecturesScans[k]; delete apercusScans[k]; });
    let ok = false;
    try { ok = await chargerScans(true); } finally { if (bouton) bouton.loading = false; }
    // chargerScans rend faux quand le dossier du copieur est introuvable, ou quand le serveur n'a pas répondu (l'état d'avant reste).
    if (!ok) { afficherToast(etatScans.configure ? 'Serveur injoignable : le dossier « Scan » n’a pas pu être relu.' : (etatScans.raison || 'Dossier « Scan » introuvable.'), 'OK', null); return; }
    const n = (etatScans.scans || []).length;
    afficherToast(n ? `Dossier « Scan » relu : ${n} scan${n > 1 ? 's' : ''} à ranger.` : 'Dossier « Scan » relu : aucun scan en attente.', 'OK', null);
  }
  function rangementAutoScansActif() {
    return !!(etatScans.reglages.actif && etatScans.reglages.auto && relaisScansAccorde);
  }
  async function lireScansEnAttente() {
    if (lectureScansEnCours) { relancerLectureScans = true; return; }
    lectureScansEnCours = true;
    relancerLectureScans = false;
    try {
      for (const scan of (etatScans.scans || []).slice()) {
        if (!scan.stable) continue;
        const cle = cleScan(scan);
        if (!lecturesScans[cle]) {
          lecturesScans[cle] = { statut: 'lecture' };
          if (ongletActuel === 'scans') renderScans();
          try {
            const debutLecture = Date.now();
            // Borne de durée (étude 07/10 : « le bouton Actualiser ne fonctionne pas ») : une lecture qui ne rend jamais la main
            // (OCR bloqué) arrêtait toutes les suivantes, et « Actualiser » n'y pouvait rien.
            const lecture = await avecDureeMaxScan(lireScan(scan, (url) => {
              apercusScans[cle] = url || 'echec';
              if (ongletActuel === 'scans') renderScans();
            }), DUREE_MAX_LECTURE_SCAN_MS);
            const proposition = propositionScan(lecture, dossiersCandidatsScans(), scan.date);
            noterJournalTechnique({ categorie: 'scan-lu', dureeMs: Date.now() - debutLecture, ocr: !!lecture.viaOcr, reconnu: !!(proposition && proposition.type), sur: !!(proposition && proposition.automatique), type: (proposition && proposition.type) || '' });
            lecturesScans[cle] = { statut: 'pret', lecture: { viaOcr: lecture.viaOcr, pages: lecture.pages, texte: lecture.texte }, proposition, choix: choixDepuisProposition(proposition) };
          } catch (e) {
            lecturesScans[cle] = { statut: 'erreur', erreur: e.message || 'Lecture impossible', choix: choixDepuisProposition(null, scan.date) };
          }
          if (ongletActuel === 'scans') renderScans();
          majBadgeScans();
        }
        const l = lecturesScans[cle];
        if (rangementAutoScansActif() && l && l.statut === 'pret' && l.proposition.automatique && !echecsAutoScans.has(cle)) await rangerScanChoisi(scan.nom, true);
      }
    } finally {
      lectureScansEnCours = false;
    }
    if (relancerLectureScans) { relancerLectureScans = false; await lireScansEnAttente(); }
  }

  // Ce que l'étude valide : dossier, type, nom de la copie (les rubriques suivent le type).
  function choixDepuisProposition(p, date) {
    if (!p) return { dossierId: '', type: '', nomCible: nomCibleScan(null, { date }), rubriques: [] };
    return { dossierId: p.dossierId || '', type: p.type || '', nomCible: p.nomCible, rubriques: p.rubriques.slice() };
  }

  function scanParNom(nom) { return (etatScans.scans || []).find(s => s.nom === nom) || null; }

  function changerChoixScan(nom, champ, valeur) {
    const scan = scanParNom(nom);
    if (!scan) return;
    const l = lecturesScans[cleScan(scan)];
    if (!l || !l.choix) return;
    l.choix[champ] = valeur;
    if (champ === 'type' || champ === 'dossierId') {
      // Le type ou la personne changent le nom proposé et la rubrique ; un nom retouché à la main
      // est gardé tant que ni l'un ni l'autre ne bouge.
      const type = TYPES_SCAN.find(t => t.cle === l.choix.type) || null;
      const d = (dossiers || []).find(x => x.id === l.choix.dossierId);
      const id = d ? scoreDossierScan(d, texteMotsScan((l.lecture && l.lecture.texte) || '')) : null;
      l.choix.rubriques = rubriquesScan(type, id ? id.role : null);
      l.choix.nomCible = nomCibleScan(type, { date: scan.date, personne: id && id.personnes.length === 1 ? id.personnes[0] : '' });
    }
    renderScans();
  }

  async function rangerScanChoisi(nom, auto) {
    const scan = scanParNom(nom);
    if (!scan || scansEnRangement.has(nom)) return;
    const l = lecturesScans[cleScan(scan)];
    const choix = l && l.choix;
    const d = choix && (dossiers || []).find(x => x.id === choix.dossierId);
    if (!d || !d.nasDossier) { if (auto) echecsAutoScans.add(cleScan(scan)); }
    if (!d) { if (!auto) afficherToast('Choisissez le dossier client avant de ranger ce scan.', 'OK', null); return; }
    if (!d.nasDossier) { if (!auto) afficherToast('Ce dossier n’est pas relié à son dossier du NAS : reliez-le depuis sa fiche.', 'OK', null); return; }
    scansEnRangement.add(nom);
    if (!auto) renderScans(true);
    let range = false;
    try {
      const r = await fetchAvecAuth('/api/scans/ranger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, dossierNas: d.nasDossier, rubriques: choix.rubriques, nomCible: choix.nomCible,
          dossierId: d.id, dossier: libelleDossierAffiche(d), type: choix.type, auteur: auto ? 'CLAIRE' : (utilisateurPoste || ''), auto: !!auto,
          score: l && l.proposition && l.proposition.dossierId === d.id ? l.proposition.score : null })
      });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (auto) echecsAutoScans.add(cleScan(scan));
        else afficherToast(corps.erreur || 'Rangement impossible.', 'OK', null);
        return;
      }
      range = true;
      if (!auto) afficherToast(`Rangé dans ${libelleDossierAffiche(d)}${corps.rubrique ? ' › ' + corps.rubrique.replace(/[\\/]+/g, ' › ') : ''}.`, 'OK', null);
      // Pièce ajoutée/cochée et responsable prévenu tout de suite, sans attendre le parcours du NAS
      // (relancé ensuite pour le reste : il ne renotifie pas une pièce déjà « reçue »). Ni l'un ni
      // l'autre ne retient plus l'écran (étude, 01/10 : « c'est lors du clic que c'est long »).
      enregistrerPieceRangee(d, choix, corps, auto)
        .catch(e => console.warn('Pièce rangée non enregistrée :', e.message))
        .then(() => { if (typeof verifierDossierLocal === 'function') verifierDossierLocal(d.id, false).catch(() => {}); });
    } finally {
      finirGesteScan(nom, scansEnRangement, range ? 'range' : '');
    }
  }

  // Fin d'un geste sur un scan (ranger, laisser dans Scan) : la liste se met à jour TOUT DE SUITE
  // d'après la réponse du serveur — le scan rangé en sort, le scan laissé passe dans « laissés de
  // côté » — et la relecture du dossier du copieur se fait ensuite, en arrière-plan. Avant, le
  // bouton tournait jusqu'à la fin de cette relecture (étude, 01/10).
  function finirGesteScan(nom, enCours, resultat) {
    enCours.delete(nom);
    if (resultat) {
      const scan = scanParNom(nom);
      etatScans.scans = (etatScans.scans || []).filter(x => x.nom !== nom);
      if (resultat === 'ecarte' && scan) etatScans.ecartes = [scan].concat((etatScans.ecartes || []).filter(x => x.nom !== nom));
    }
    majBadgeScans();
    if (ongletActuel === 'scans') renderScans(true);
    chargerScans(true).catch(() => {});
  }

  // Types rangés qui ne sont pas des « pièces » du dossier : l'offre de prêt et l'avant-contrat ont
  // leurs propres règles (reconnus par leur nom au parcours du NAS, qui notifie l'offre lui-même).
  var TYPES_SCAN_HORS_PIECES = ['offrePret', 'avantContrat', 'promesse'];

  // Pièce du dossier que représente un scan qu'on vient de ranger (étude, 30/09 : « la rajouter à la
  // liste des pièces et la noter cochée ») : la pièce de la checklist de ce type si elle y figure,
  // sinon une pièce personnalisée du même libellé (reprise si elle existe déjà, créée sinon). Le
  // libellé est le nom de la copie sans « - Claire Scan ». null pour l'offre et l'avant-contrat.
  // Pure.
  function pieceDepuisScanRange(d, typeCle, nomCible, checklist, maintenantIso) {
    if (TYPES_SCAN_HORS_PIECES.includes(typeCle)) return null;
    const type = TYPES_SCAN.find(t => t.cle === typeCle) || null;
    const liste = checklist || [];
    if (type && type.piece) {
      const piece = liste.find(p => p.cle === type.piece);
      if (piece) return { cle: piece.cle, label: piece.label, nouvelle: false };
    }
    const suffixe = new RegExp('\\s*-?\\s*' + SUFFIXE_NOM_SCAN + '$', 'i');
    let label = String(nomCible || '').replace(/\.pdf$/i, '').replace(suffixe, '').trim();
    if (!label) label = type ? type.label : `Scan du ${formatDateFr(String(maintenantIso || '').slice(0, 10))}`;
    const cleLabel = normaliserPourRecherche(label);
    const existante = (d && d.piecesPersonnalisees || []).find(p => normaliserPourRecherche(p.label) === cleLabel)
      || liste.find(p => normaliserPourRecherche(p.label) === cleLabel);
    if (existante) return { cle: existante.cle, label: existante.label, nouvelle: false };
    return { cle: 'perso-scan-' + String(Date.parse(maintenantIso) || Date.now()).slice(-8) + Math.random().toString(36).slice(2, 5), label, nouvelle: true };
  }

  // Après un rangement (à la main ou automatique) : la pièce est ajoutée si besoin, cochée, son
  // fichier mémorisé, et le responsable prévenu (Teams, comme une pièce trouvée sur le NAS).
  async function enregistrerPieceRangee(d, choix, corps, auto) {
    const maintenant = new Date().toISOString();
    const piece = pieceDepuisScanRange(d, choix.type, choix.nomCible, checklistPieces(d.typeVente, d), maintenant);
    if (!piece) return;
    if (piece.nouvelle) {
      d.piecesPersonnalisees = d.piecesPersonnalisees || [];
      d.piecesPersonnalisees.push({ cle: piece.cle, label: piece.label });
    }
    d.pieces = d.pieces || {};
    d.pieces[piece.cle] = 'recue';
    if (corps && corps.chemin) memoriserFichierTrouve(d, NAS_CLE_PIECE(piece.cle), String(corps.chemin).replace(/\\/g, '/'));
    // Une pièce ajoutée pour ce scan n'a pas de motif de nom : sans ce drapeau, un parcours du NAS
    // qui ne la retrouverait pas la repasserait « manquante ».
    if (piece.nouvelle || !checklistPieces(d.typeVente).some(p => p.cle === piece.cle)) {
      d.piecesValideesManuellement = Array.from(new Set([...(d.piecesValideesManuellement || []), piece.cle]));
    }
    d.piecesTrouveesLe = Object.assign({}, d.piecesTrouveesLe, { [piece.cle]: maintenant });
    d.piecesNotifications = Array.from(new Set([...(d.piecesNotifications || []), piece.cle]));
    ajouterHistorique(d, `Scan rangé ${auto ? 'automatiquement' : 'à la main'} : « ${piece.label} »${piece.nouvelle ? ' ajoutée à la liste des pièces' : ''}, reçue`, { auto });
    await sauvegarder(d);
    render();
    notifierNouvellesPiecesTrouvees(d, [piece.cle]);
    notifierNavigateurPieces(d, [piece.cle]);
    signalerSiDossierDevenuComplet(d);
  }

  async function ecarterScan(nom) {
    if (scansEnEcart.has(nom) || scansEnRangement.has(nom)) return;
    scansEnEcart.add(nom);
    renderScans(true);
    let ecarte = false;
    try {
      const r = await fetchAvecAuth('/api/scans/ecarter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom, auteur: utilisateurPoste || '' }) });
      if (!r.ok) afficherToast('Le scan n’a pas pu être laissé de côté : réessayez.', 'OK', null);
      else ecarte = true;
    } catch (e) {
      afficherToast('Serveur injoignable — scan non déplacé.', 'OK', null);
    } finally {
      finirGesteScan(nom, scansEnEcart, ecarte ? 'ecarte' : '');
    }
  }

  async function retablirScan(nom) {
    await fetchAvecAuth('/api/scans/retablir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom }) });
    await chargerScans();
  }

  async function ouvrirScan(nom) {
    const fenetre = window.open('', '_blank');
    try {
      const r = await fetchAvecAuth('/api/scans/fichier?nom=' + encodeURIComponent(nom));
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      if (fenetre) fenetre.location.href = url; else window.open(url, '_blank');
    } catch (e) {
      if (fenetre) fenetre.close();
      afficherToast('Ce scan n’est plus dans le dossier Scan.', 'OK', null);
    }
  }

  async function enregistrerReglagesScans(modif) {
    const r = await fetchAvecAuth('/api/scans/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modif) });
    if (r.ok) etatScans.reglages = (await r.json()).reglages;
    renderReglagesScans();
    await chargerScans();
  }

  // Date locale (AAAA-MM-JJ) du point de départ des scans, pour le champ date des réglages.
  function dateLocaleDepuisScans(depuis) {
    if (!depuis) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(depuis)) return depuis;
    const d = new Date(depuis);
    return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function renderReglagesScans() {
    const zone = document.getElementById('reglages-scans');
    if (!zone) return;
    const r = etatScans.reglages || {};
    const inconnu = !etatScans.charge;
    const etat = inconnu ? 'Lecture des réglages sur le serveur…'
      : etatScans.configure
        ? `Dossier du copieur : <strong>${escapeHtml(etatScans.dossier)}</strong>`
        : `${icone('alert-triangle')} ${escapeHtml(etatScans.raison || 'Dossier « Scan » introuvable.')}`;
    zone.innerHTML = `
      <div class="reglages-liste">
        <label class="reglages-option" for="reglages-scans-actif">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Activer Claire Scan ${infoBulle('CLAIRE lit chaque scan posé dans le dossier « Scan », reconnaît le dossier client et la pièce, puis range une copie dans la rubrique du dossier. L’original est conservé dans « CLAIRE - scans rangés », à l’intérieur du dossier Scan.')}</span>
            <span class="hint">${etat}</span></span>
          <wa-switch class="switch reglages-switch" id="reglages-scans-actif"${r.actif ? ' checked' : ''}${inconnu ? ' disabled' : ''} onchange="enregistrerReglagesScans({ actif: this.checked })"></wa-switch>
        </label>
        <label class="reglages-option" for="reglages-scans-auto">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Ranger automatiquement les scans reconnus ${infoBulle(`Sans validation, dès que la pièce est identifiée et que le dossier atteint le score de ${noteScoreScan(BAREME_SCORE_SCAN.seuil)} avec une marge sur le suivant : partie nommée ${BAREME_SCORE_SCAN.partie} points (deux au plus), adresse du bien ${BAREME_SCORE_SCAN.adresse}, parcelle ${BAREME_SCORE_SCAN.parcelle}. Il suffit qu’une fenêtre CLAIRE soit ouverte au bureau (celle du poste serveur en priorité). Les autres scans attendent dans Claire Scan.`)}</span></span>
          <wa-switch class="switch reglages-switch" id="reglages-scans-auto"${r.auto ? ' checked' : ''}${r.actif && !inconnu ? '' : ' disabled'} onchange="enregistrerReglagesScans({ auto: this.checked })"></wa-switch>
        </label>
        <label class="reglages-option" for="reglages-scans-depuis">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Nouveaux scans à partir du ${infoBulle('Seuls les scans arrivés après ce moment sont traités (à l’activation : l’heure exacte). Les plus anciens restent dans le dossier Scan sans être touchés. Choisir une date plus ancienne pour reprendre des scans déjà présents.')}</span>
            ${r.depuis && r.depuis.length > 10 ? `<span class="hint">${escapeHtml(new Date(r.depuis).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>` : ''}</span>
          <input type="date" id="reglages-scans-depuis" value="${escapeAttr(dateLocaleDepuisScans(r.depuis))}"${r.actif && !inconnu ? '' : ' disabled'} onchange="enregistrerReglagesScans({ depuis: this.value })">
        </label>
      </div>`;
  }

  // Champ « Dossier » d'un scan (étude 07/10 : « dans le champ de recherche du dossier, de quoi taper le nom ») : on tape le nom,
  // la liste propose les dossiers — ceux reconnus dans le scan en tête, avec leur score. Pure : la valeur affichée de chaque dossier
  // (son libellé, numéroté s'il y en a deux du même nom) → son id.
  function valeursDossiersScan(candidats) {
    const valeurs = new Map();
    (candidats || []).forEach(d => {
      const base = libelleDossierAffiche(d);
      let v = base;
      for (let i = 2; valeurs.has(v); i++) v = `${base} (${i})`;
      valeurs.set(v, d.id);
    });
    return valeurs;
  }

  // Pure : le dossier désigné par ce qui est tapé — le libellé exact d'un dossier de la liste, sinon le seul dossier dont le nom
  // (ou celui d'une partie) contient tous les mots tapés. → { id, exact } | { ambigu: n } | { aucun: true } | null (rien tapé).
  function dossierScanDepuisSaisie(saisie, candidats) {
    const n = (x) => normaliserPourRecherche(String(x || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    const q = n(saisie);
    if (!q) return null;
    for (const [v, id] of valeursDossiersScan(candidats)) if (n(v) === q) return { id, exact: true };
    const mots = q.split(' ');
    const trouves = (candidats || []).filter(d => {
      const texte = ' ' + n([libelleDossierAffiche(d), d.nom, ...(Array.isArray(d.parties) ? d.parties.map(p => p && p.nom) : [])].join(' ')) + ' ';
      return mots.every(m => texte.includes(' ' + m));
    });
    if (trouves.length === 1) return { id: trouves[0].id, exact: false };
    return trouves.length ? { ambigu: trouves.length } : { aucun: true };
  }

  function champDossierScan(scan, index, choisi, proposition, bloque) {
    const candidats = dossiersCandidatsScans().slice().sort((a, b) => libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'));
    const valeurs = valeursDossiersScan(candidats);
    const valeurDe = new Map([...valeurs].map(([v, id]) => [id, v]));
    const scores = new Map(((proposition && proposition.candidats) || []).map(c => [c.id, c.score]));
    const ordre = candidats.filter(d => scores.has(d.id)).sort((a, b) => scores.get(b.id) - scores.get(a.id))
      .concat(candidats.filter(d => !scores.has(d.id)));
    const opt = d => {
      const infos = [scores.has(d.id) ? `reconnu dans le scan — score ${noteScoreScan(scores.get(d.id))}` : '', d.nasDossier ? '' : 'non relié au NAS'].filter(Boolean).join(' · ');
      return `<option value="${escapeAttr(valeurDe.get(d.id))}"${infos ? ` label="${escapeAttr(infos)}"` : ''}></option>`;
    };
    const liste = 'scan-dossiers-' + index;
    const nomArg = escapeOnclickArg(scan.nom);
    return `<input type="search" class="scan-dossier-saisie" list="${liste}" value="${escapeAttr(valeurDe.get(choisi) || '')}" placeholder="Taper le nom du dossier…" autocomplete="off" aria-label="Dossier du scan"
        oninput="saisieDossierScan('${nomArg}', this, false)" onchange="saisieDossierScan('${nomArg}', this, true)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"${bloque}>
      <datalist id="${liste}">${ordre.map(opt).join('')}</datalist>`;
  }

  // Ce qui est tapé dans le champ « Dossier » : un dossier choisi dans la liste est pris aussitôt ; à la validation (Entrée, sortie du
  // champ), le seul dossier qui correspond est pris, sinon un message dit pourquoi.
  // Redessiner retire le champ qui a le focus : le navigateur y déclenche alors « change », qui ne doit rien refaire.
  var saisieDossierScanEnCours = false;
  function saisieDossierScan(nom, champ, valider) {
    if (saisieDossierScanEnCours) return;
    saisieDossierScanEnCours = true;
    try { appliquerSaisieDossierScan(nom, champ, valider); } finally { saisieDossierScanEnCours = false; }
  }

  function appliquerSaisieDossierScan(nom, champ, valider) {
    const scan = scanParNom(nom);
    const l = scan && lecturesScans[cleScan(scan)];
    if (!l || !l.choix || !champ) return;
    const r = dossierScanDepuisSaisie(champ.value, dossiersCandidatsScans());
    if (!valider) {
      if (r && r.exact && r.id !== l.choix.dossierId) { changerChoixScan(nom, 'dossierId', r.id); renderScans(true); }
      return;
    }
    if (!r) { if (l.choix.dossierId) { changerChoixScan(nom, 'dossierId', ''); renderScans(true); } return; }
    if (r.id) { if (r.id !== l.choix.dossierId) changerChoixScan(nom, 'dossierId', r.id); renderScans(true); return; }
    afficherToast(r.ambigu ? `${r.ambigu} dossiers correspondent à « ${champ.value.trim()} » : choisissez-le dans la liste.` : `Aucun dossier ne correspond à « ${champ.value.trim()} ».`, 'OK', null);
  }

  function optionsTypesScan(choisi) {
    return `<option value=""${choisi ? '' : ' selected'}>Autre pièce</option>`
      + TYPES_SCAN.map(t => `<option value="${escapeAttr(t.cle)}"${t.cle === choisi ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
  }

  // ---- Aperçu d'un scan ----
  var LARGEUR_VIGNETTE_SCAN = 176;   // px de l'image : nette à 88 px affichés sur un écran ×2
  var MAX_PAGES_APERCU_SCAN = 30;

  // Une page du PDF en image JPEG (data: URL), à `largeur` pixels. Fond blanc (un scan sans fond
  // deviendrait noir en JPEG) ; intent 'print' : rendu même fenêtre réduite (voir ocrPage).
  async function imagePagePdf(pdf, numero, largeur, qualite) {
    const page = await pdf.getPage(numero);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: largeur / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
    return canvas.toDataURL('image/jpeg', qualite || 0.8);
  }

  function renderVignetteScan(scan) {
    const apercu = apercusScans[cleScan(scan)];
    const contenu = apercu && apercu !== 'echec'
      ? `<img src="${apercu}" alt="">`
      : `<span class="scan-vignette-vide">${scan.stable && !apercu ? icone('spinner', null, true) : icone('file-text')}</span>`;
    return `<button type="button" class="scan-vignette" onclick="ouvrirApercuScan('${escapeOnclickArg(scan.nom)}')" title="Voir le scan" aria-label="Voir le scan ${escapeAttr(scan.nom)}">${contenu}</button>`;
  }

  // Fenêtre d'aperçu : toutes les pages, dessinées une à une à la largeur de la fenêtre ; ce que
  // CLAIRE a reconnu en tête, pour vérifier avant de ranger.
  var apercuScanOuvert = null;   // { nom, jeton }
  async function ouvrirApercuScan(nom) {
    const scan = (etatScans.scans || []).find(x => x.nom === nom) || { nom, date: '' };
    let overlay = document.getElementById('scan-apercu-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'scan-apercu-overlay';
      overlay.className = 'scan-apercu-overlay';
      overlay.addEventListener('click', (e) => { if (clicSurFond(e)) fermerApercuScan(); });
      document.body.appendChild(overlay);
    }
    const jeton = {};
    apercuScanOuvert = { nom, jeton };
    const l = lecturesScans[cleScan(scan)];
    const c = l && l.choix;
    const d = c && c.dossierId ? dossiers.find(x => x.id === c.dossierId) : null;
    const type = c && c.type ? (TYPES_SCAN.find(t => t.cle === c.type) || {}).label : '';
    const reconnu = [type, d ? libelleDossierAffiche(d) : ''].filter(Boolean).join(' · ');
    const quand = scan.date ? new Date(scan.date).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    overlay.innerHTML = `<div class="scan-apercu" role="dialog" aria-modal="true" aria-labelledby="scan-apercu-titre">
        <header class="scan-apercu-tete">
          <div class="scan-apercu-titres">
            <h2 id="scan-apercu-titre">${escapeHtml(nom)}</h2>
            <div class="scan-apercu-meta"><span id="scan-apercu-pages">${escapeHtml(quand)}</span>${reconnu ? `<span>${escapeHtml(reconnu)}</span>` : ''}</div>
          </div>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="ouvrirScan('${escapeOnclickArg(nom)}')" aria-label="Ouvrir dans un onglet" title="Ouvrir dans un onglet (imprimer, télécharger)">${icone('maximize')}</wa-button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="fermerApercuScan()" aria-label="Fermer l’aperçu">${icone('x')}</wa-button>
        </header>
        <div class="scan-apercu-corps" id="scan-apercu-corps"><p class="hint scan-etat">${icone('spinner', null, true)} Chargement du scan…</p></div>
      </div>`;
    overlay.style.display = 'flex';
    const corps = document.getElementById('scan-apercu-corps');
    const actif = () => apercuScanOuvert && apercuScanOuvert.jeton === jeton;
    try {
      if (typeof pdfjsLib === 'undefined') throw new Error('Lecteur PDF indisponible : ouvrez le scan dans un onglet.');
      const r = await fetchAvecAuth('/api/scans/fichier?nom=' + encodeURIComponent(nom));
      if (!r.ok) throw new Error('Ce scan n’est plus dans le dossier Scan.');
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await r.arrayBuffer() }).promise;
      if (!actif()) return;
      const total = pdf.numPages;
      const pagesMeta = document.getElementById('scan-apercu-pages');
      if (pagesMeta) pagesMeta.textContent = [quand, `${total} page${total > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
      corps.innerHTML = '';
      const largeur = Math.min(1600, Math.round(Math.max(320, corps.clientWidth - 32) * (window.devicePixelRatio || 1)));
      for (let n = 1; n <= Math.min(total, MAX_PAGES_APERCU_SCAN); n++) {
        const url = await imagePagePdf(pdf, n, largeur, 0.85);
        if (!actif()) return;
        const fig = document.createElement('figure');
        fig.className = 'scan-apercu-page';
        fig.innerHTML = `<img src="${url}" alt="Page ${n}"><figcaption>Page ${n} / ${total}</figcaption>`;
        corps.appendChild(fig);
      }
      if (total > MAX_PAGES_APERCU_SCAN) {
        corps.insertAdjacentHTML('beforeend', `<p class="hint scan-etat">${total - MAX_PAGES_APERCU_SCAN} pages de plus : ouvrez le scan dans un onglet.</p>`);
      }
    } catch (e) {
      if (actif()) corps.innerHTML = `<p class="hint scan-etat">${icone('alert-triangle')} ${escapeHtml(e.message || 'Aperçu impossible.')}</p>`;
    }
  }

  function fermerApercuScan() {
    apercuScanOuvert = null;
    const overlay = document.getElementById('scan-apercu-overlay');
    if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && apercuScanOuvert) { e.stopPropagation(); fermerApercuScan(); } }, true);
  }

  function renderLigneScan(scan, index) {
    const l = lecturesScans[cleScan(scan)] || null;
    const nomArg = escapeOnclickArg(scan.nom);
    const quand = new Date(scan.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const tete = `<div class="scan-tete">
        <button type="button" class="scan-nom" onclick="ouvrirApercuScan('${nomArg}')" title="Voir le scan">${icone('file-text')}<span>${escapeHtml(scan.nom)}</span></button>
        <span class="scan-date">${escapeHtml(quand)}</span>
      </div>`;
    const vignette = renderVignetteScan(scan);
    if (!scan.stable || !l || l.statut === 'lecture') {
      return `<li class="scan-ligne">${vignette}<div class="scan-corps">${tete}<p class="hint scan-etat">${icone('spinner', null, true)} ${scan.stable ? 'Lecture du scan…' : 'Copie en cours depuis le copieur…'}</p></div></li>`;
    }
    const c = l.choix;
    const p = l.proposition;
    const enCours = scansEnRangement.has(scan.nom);
    const ecart = scansEnEcart.has(scan.nom);
    const occupe = enCours || ecart;
    let statut;
    if (l.statut === 'erreur') statut = `<span class="dot-label dl-urgent"><span class="dot"></span>${escapeHtml(l.erreur)}</span>`;
    else if (p.automatique) statut = `<span class="dot-label dl-success"><span class="dot"></span>Reconnu, rangement automatique</span>`;
    else if (p.dossierId && !p.dossierSur) statut = `<span class="dot-label dl-pret"><span class="dot"></span>Dossier à confirmer</span>`;
    else if (p.dossierId && !p.relie) statut = `<span class="dot-label dl-pret"><span class="dot"></span>Dossier non relié au NAS</span>`;
    else if (p.dossierId && !p.type) statut = `<span class="dot-label dl-pret"><span class="dot"></span>Pièce à préciser</span>`;
    else statut = `<span class="dot-label dl-neutre"><span class="dot"></span>Dossier non reconnu</span>`;
    if (l.statut !== 'erreur') statut += `<span class="scan-score">${escapeHtml(explicationScoreScan(p))}${l.lecture && l.lecture.viaOcr ? ' · texte lu par OCR' : ''}</span>`;
    const bloque = occupe ? ' disabled' : '';
    return `<li class="scan-ligne${occupe ? ' scan-occupe' : ''}"${occupe ? ' aria-busy="true"' : ''}>${vignette}<div class="scan-corps">${tete}
      <div class="scan-statut">${statut}</div>
      <div class="scan-champs">
        <label class="scan-champ"><span>Dossier</span>${champDossierScan(scan, index, c.dossierId, p, bloque)}</label>
        <label class="scan-champ"><span>Pièce</span><select onchange="changerChoixScan('${nomArg}', 'type', this.value)"${bloque}>${optionsTypesScan(c.type)}</select></label>
        <label class="scan-champ scan-champ-large"><span>Nom de la copie</span><input type="text" value="${escapeAttr(c.nomCible)}" oninput="changerChoixScan('${nomArg}', 'nomCible', this.value)" onchange="renderScans()"${bloque}></label>
      </div>
      <div class="scan-actions">
        <span class="hint">Rubrique : ${escapeHtml(libelleRubriquesScan(c.rubriques))}</span>
        <wa-button appearance="outlined" class="secondary scan-bouton" onclick="ecarterScan('${nomArg}')"${bloque}>${ecart ? `${icone('spinner', null, true)} Déplacement…` : 'Laisser dans Scan'}</wa-button>
        <wa-button variant="brand" class="primary scan-bouton" onclick="rangerScanChoisi('${nomArg}', false)"${occupe || !c.dossierId ? ' disabled' : ''}>${enCours ? `${icone('spinner', null, true)} Rangement…` : 'Ranger'}</wa-button>
      </div>
    </div></li>`;
  }

  function renderScans(force) {
    const zone = document.getElementById('scans-contenu');
    if (!zone) return;
    // Ne pas redessiner sous les doigts de quelqu'un qui tape le nom de la copie (sauf après un
    // clic sur Ranger ou Laisser dans Scan : l'indicateur doit apparaître tout de suite).
    if (force !== true && document.activeElement && zone.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const e = etatScans;
    if (!e.configure || !e.reglages.actif) {
      zone.innerHTML = `<div class="calc-card scans-vide">
        <p>${e.configure ? 'Claire Scan n’est pas activé.' : escapeHtml(e.raison || 'Dossier « Scan » introuvable.')}</p>
        ${e.configure ? `<wa-button variant="brand" class="primary" onclick="enregistrerReglagesScans({ actif: true })">Activer Claire Scan</wa-button>` : ''}
      </div>`;
      return;
    }
    const scans = e.scans || [];
    const liste = scans.length
      ? `<ul class="scans-liste">${scans.map(renderLigneScan).join('')}</ul>`
      : `<p class="hint scans-rien">Aucun scan en attente dans le dossier du copieur.</p>`;
    const journal = (e.journal || []).slice(0, 12);
    const journalHtml = journal.length ? `<div class="calc-card scans-journal">
        <div class="dash-section-titre">Derniers rangements</div>
        <ul>${journal.map(j => `<li><span class="scan-date">${escapeHtml(new Date(j.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>
          <span>${escapeHtml(j.nom)} → <strong>${escapeHtml(j.dossier ? libelleDossierParNom(j.dossier, j.dossierId) : '')}</strong>${j.rubrique ? ' › ' + escapeHtml(j.rubrique.replace(/[\\/]+/g, ' › ')) : ''}</span>
          <span class="hint">${j.auto ? 'automatique' : escapeHtml(j.auteur || '')}${j.score != null ? ' · score ' + noteScoreScan(j.score) : ''}</span></li>`).join('')}</ul>
      </div>` : '';
    const ecartes = (e.ecartes || []);
    const ecartesHtml = ecartes.length ? `<details class="scans-ecartes"><summary>Laissés dans Scan (${ecartes.length})</summary>
        <ul>${ecartes.map(s => `<li><span>${escapeHtml(s.nom)}</span><button type="button" class="lien-action" onclick="retablirScan('${escapeOnclickArg(s.nom)}')">Reproposer</button></li>`).join('')}</ul>
      </details>` : '';
    zone.innerHTML = `<div class="calc-card">${liste}${ecartesHtml}</div>${journalHtml}`;
  }

  function initScans() {
    renderScans();
    chargerScans();
  }

  // Remplit les emplacements d'icônes du HTML statique (sidebar, burger mobile, dropzone) — le
  // reste de l'application est déjà rendu depuis script.js, ce point d'entrée unique évite de
  // dupliquer le dessin des icônes entre le HTML et ICONES.
  function initIconesStatiques() {
    const cibles = {
      'icon-burger': 'menu',
      'icon-nav-dashboard': 'tableau-bord',
      'icon-nav-suivi': 'list',
      'icon-nav-assistant': 'sparkle',
      'icon-assistant-envoyer': 'send',
      'icon-assistant-joindre': 'paperclip',
      'icon-assistant-fils': 'list',
      'icon-recherche-suivi': 'search',
      'icon-nav-scans': 'bannette',
      'icon-nav-agenda': 'calendar',
      'icon-signaler': 'flag',
      'icon-install': 'download',
      'icon-dropzone': 'upload',
      'icon-intro-dates': 'calendar',
      'icon-intro-doc': 'file-text',
      'icon-intro-pieces': 'folder',
      'icon-intro-mail': 'mail',
      'icon-intro-adresse': 'map-pin',
      'icon-nav-calculateur': 'banknote',
      'icon-nav-prorata': 'part-disque',
      'icon-nav-appel-fonds': 'mail',
      'icon-nav-inventaire': 'scale',
      'icon-af-dropzone': 'upload',
      'icon-reglages-apropos': 'info',
      'icon-nav-quotites': 'users',
      'icon-nav-redaction': 'pencil',
      'icon-nav-preemption': 'shield',
      'icon-nav-confreres': 'book',
      'icon-calc-warning': 'alert-triangle',
      'icon-inv-warning': 'alert-triangle',
      'icon-nav-analyse-ia': 'eye',
      'icon-analyse-ia-warning': 'alert-triangle',
      'icon-analyse-ia-dropzone': 'upload',
      'icon-relecture-cadre': 'shield',
      'icon-pdf-recherche': 'search',
      'icon-pdf-recherche-prec': 'chevron-up',
      'icon-pdf-recherche-suiv': 'chevron-down',
      'icon-nav-reglages': 'settings',
      'icon-nav-outils-groupe': 'package'
    };
    for (const [id, nom] of Object.entries(cibles)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = icone(nom);
    }
  }
  initIconesStatiques();
  // État initial de la sidebar (réduite/épinglée/groupe Outils) — pose aussi l'icône du chevron
  // de repli, qu'initIconesStatiques() ne gère pas puisqu'elle change selon l'état.
  appliquerEtatSidebar();
  initSidebarRepliee();
  initCalculateurFraisActe();
  initSelectDepartementAppelFonds();

  chargerTheme();
  chargerAccent();
  chargerApprentissage();
  chargerJournalCorrections();
  chargerMemoireAudit();
  chargerRubriquesMasquees();
  // Mode serveur intranet (voir CLAUDE.md) : l'application entière est bloquée par l'écran de
  // connexion tant que le mot de passe partagé n'a pas été validé — un jeton déjà mémorisé
  // (localStorage, valable 12h côté serveur) permet de sauter cette étape au rechargement.
  // demarrerApplication() gère elle-même le cas d'un jeton devenu invalide (401 → fetchAvecAuth
  // réaffiche l'écran de connexion), pas la peine de le vérifier au préalable ici.
  // Accès sans mot de passe (demandé par l'étude, 25/09) : le serveur délivre un jeton à tout
  // poste du bureau (voir server/src/auth.js, option `desactivee`). Sans jeton mémorisé, on le
  // demande donc tout seul ; l'écran de connexion ne s'affiche que si le serveur exige encore un
  // mot de passe ("authActive": true dans config.json).
  // Lancé une fois TOUS les fichiers du poste exécutés (rapport du 12/10 : « renderWidgetAssistant / ficheACoteActive is not
  // defined ») : ce fichier n'est pas le dernier, et la réponse du serveur pouvait arriver pendant que le navigateur attendait
  // encore client/49, 52 ou 60 — le rendu appelait alors des fonctions pas encore définies.
  authToken = chargerJetonStocke();
  function lancerApplication() {
    if (authToken) {
      demarrerApplication().catch((e) => console.error('Démarrage impossible', e));
    } else {
      connexionAutomatique();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lancerApplication);
  else lancerApplication();
  renderChips();
  // L'analyse juridique est une étape du wizard toujours visible (voir definirEtapeWizard) : sans
  // cet appel initial, ses sections restaient affichées vides (ni contenu ni message d'état) tant
  // qu'aucun PDF n'avait encore été importé dans la session.
  afficherAnalyseJuridique();
