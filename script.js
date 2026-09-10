
  const STORAGE_KEY = 'dossiers';
  let dossiers = [];
  let detectedDates = []; // {iso, label, contexte, suggestion}
  let autresEnCours = []; // {id, label, iso, active}
  let dateCompromisDetectee = '';
  let dateCompromisEstimee = false;
  let dernierTexteTraite = '';
  let compteurAutre = 0;
  let echeanceActive = { pret: true, acte: true, ventebien: false };
  const EMAIL_RAPPEL_DEFAUT = 'office.gossart@notaires.fr';
  let pdfActuel = null;
  let pdfDernierePageUtile = 1;
  let frontieresPagesActuelles = null; // découpage du texte concaténé par page, pour retrouver la page d'une date
  let pageParType = { pret: null, acte: null, ventebien: null }; // page où chaque échéance a été repérée
  // Vrai quand la date pré-remplie a été choisie parmi plusieurs candidates de même catégorie sans
  // formulation de délai permettant de trancher (voir meilleureCandidateEcheance) — confiance
  // "incertain" plutôt que "auto" au moment d'enregistrer le dossier.
  let ambiguiteParType = { pret: false, acte: false, ventebien: false };
  // Vrai quand la date pré-remplie a été calculée à partir d'une formulation approximative
  // ("fin septembre 2026", "délai de 30 jours à compter de la signature", "J+30") plutôt que lue
  // telle quelle — confiance "estime" plutôt que "auto" (voir detecterDatesDepuisTexte).
  let approxParType = { pret: false, acte: false, ventebien: false };
  let analyseJuridiqueActuelle = { documents: [], engagements: [], conditions: [] };

  const MOIS = {
    'janvier':0,'février':1,'fevrier':1,'mars':2,'avril':3,'mai':4,'juin':5,
    'juillet':6,'août':7,'aout':7,'septembre':8,'octobre':9,'novembre':10,
    'décembre':11,'decembre':11
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function toISO(y, mIndex, d) {
    return `${y}-${pad(mIndex+1)}-${pad(d)}`;
  }

  function extraireDateDeFragment(str) {
    let m = str.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return toISO(y, mo - 1, d);
    }
    const moisNoms = Object.keys(MOIS).join('|');
    // (?:er)? : le 1er jour du mois s'écrit toujours en ordinal ("le 1er janvier"), jamais "le 1
    // janvier" — sans ce groupe, cette date très fréquente en tête de compromis n'était jamais
    // reconnue.
    const re2 = new RegExp(`(\\d{1,2})(?:er)?\\s+(${moisNoms})\\s+(\\d{4})`, 'i');
    m = str.match(re2);
    if (m) {
      const d = parseInt(m[1], 10);
      const moKey = m[2].toLowerCase();
      const y = parseInt(m[3], 10);
      if (MOIS.hasOwnProperty(moKey)) return toISO(y, MOIS[moKey], d);
    }
    return null;
  }

  // Détecte automatiquement la date de signature du compromis lui-même (qui peut être électronique,
  // avec une date par partie : on retient alors la plus récente), pour écarter ensuite tout ce qui
  // lui est antérieur (diagnostics, actes précédents…).
  function detecterDateCompromis(texte) {
    const patterns = [
      // [^,.\n] (et non [^,\n]) dans les groupes qui précèdent un "le" obligatoire : un nom de lieu
      // ou une clause courte ne contient jamais de point, alors qu'un [^,\n] permissif laisse le
      // moteur de regex backtracker À TRAVERS une phrase entière pour aller chercher un "le" plus
      // loin dans le texte (ex. « ... à compter de la signature. Le vendeur s'engage... ») — cas
      // réel rencontré : le motif "a signé" ci-dessous capturait alors "vendeur s'engage à produire
      // ce document" comme si c'était la date de signature, un bug bien pire que ne rien détecter.
      /fait\s+(?:à|a)\s+[^,.\n]{0,60},?\s*le\s+([^\n,.;]{6,40})/gi,
      /le\s+pr[ée]sent\s+(?:compromis|promesse)(?:\s+de\s+vente)?\s+(?:est\s+)?(?:sign[ée]|[ée]tabli|conclu)\s+(?:à\s+[^,.\n]{0,40},?\s*)?le\s+([^\n,.;]{6,40})/gi,
      /(?:compromis|promesse)\s+de\s+vente\s+en\s+date\s+du\s+([^\n,.;]{6,40})/gi,
      /sign[ée]\s+[ée]lectroniquement\s+le\s+([^\n,.;]{6,40})/gi,
      /date\s+de\s+signature(?:\s+[ée]lectronique)?\s*:?\s*([^\n,.;]{6,40})/gi,
      /derni[èe]re\s+signature\s+(?:le\s+)?([^\n,.;]{6,40})/gi,
      // Bloc de signature électronique par partie (Yousign/DocuSign) qui ne nomme ni "compromis" ni
      // "promesse" ni le mot "électroniquement" : "Mme X a signé à BLOIS le 22 juillet 2026",
      // répété une fois par signataire. Cas réel : sans ce motif, aucune des dates ci-dessus ne
      // matchait, et `dateCompromis` restait vide — désactivant le filtre "écarte tout ce qui est
      // antérieur à la signature" pour tout le reste de l'extraction (voir detecterDatesDepuisTexte).
      /\ba\s+sign[ée]\s+(?:[àa]\s+[^,.\n]{0,40}\s+)?le\s+([^\n,.;]{6,40})/gi
    ];
    const dates = [];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(texte)) !== null) {
        const iso = extraireDateDeFragment(m[1]);
        if (iso) dates.push(iso);
      }
    }
    if (dates.length === 0) return null;
    // Signature électronique = une date par partie : on retient la plus récente (dernière signature).
    dates.sort();
    return dates[dates.length - 1];
  }

  // Repère une éventuelle mention d'un achat sans recours à un prêt.
  // Attention : "paiement comptant" seul est un FAUX AMI — cette formule désigne presque toujours
  // le règlement du solde en une fois à la signature de l'acte, pas l'absence de prêt.
  // On ne se fie donc qu'à des marqueurs juridiques non ambigus (dont la renonciation Scrivener).
  const CASH_RE = /ne\s+recourt?\s+pas\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|sans\s+recours\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|sans\s+financement\s+bancaire|sans\s+condition\s+suspensive\s+d.obtention\s+de\s+pr[êe]t|renonce\s+(?:express[ée]ment\s+)?au\s+b[ée]n[ée]fice\s+(?:des\s+dispositions\s+)?de\s+l.article\s*l\.?\s*313|d[ée]clare\s+ne\s+pas\s+recourir\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|financement\s+(?:se\s+fera|r[ée]alis[ée])\s+(?:exclusivement\s+)?(?:sur|par)\s+(?:ses\s+)?fonds\s+propres/i;

  function detecterFinancementComptant(texte) {
    return CASH_RE.test(texte);
  }

  // Repère les noms de famille du VENDEUR et de l'ACQUÉREUR (un ou plusieurs de chaque côté) pour
  // préremplir le nom du dossier, au format "NOM1 / NOM2 & NOM3" (en majuscules).
  //
  // Méthode principale : dans un compromis, chaque personne est présentée sous la forme
  // "Monsieur/Madame Prénom(s) NOM né(e) le …" — on segmente le bloc de la partie par civilité
  // et on prend, pour chaque personne, le premier groupe MAJUSCULE juste avant "né"/"née"
  // (ce qui gère aussi les noms d'usage composés comme "COURTAS HUTTEAU" et ignore le nom de
  // jeune fille qui suit, ex. "DORLÉAC née PIAU née le …").
  // Repli : si aucune date de naissance n'est trouvée (autre modèle de document), on retombe sur
  // une recherche du nom en MAJUSCULES le plus proche de l'intitulé "Vendeur"/"Acquéreur".

  const MOTS_EXCLUS_NOM = new Set([
    'SCI','SARL','SAS','EURL','DPE','ERP','CDC','TVA','SRU','M','MME','MLLE',
    'LE','LA','LES','ET','DE','DU','DES','MONSIEUR','MADAME','MADEMOISELLE',
    'VENDEUR','VENDEURS','ACQUEREUR','ACQUEREURS','ACHETEUR','ACHETEURS',
    'PROMETTANT','PROMETTANTS','BENEFICIAIRE','BENEFICIAIRES','PROMESSE',
    'ENTRE','SOUSSIGNES','SOUSSIGNE','COMPROMIS','VENTE','PRESENT','PRESENTS','FAIT',
    'CONDITIONS','CONDITION','SUSPENSIVES','SUSPENSIVE','DESIGNATION','ARTICLE',
    'OBJET','PRIX','GARANTIE','CLAUSE','CLAUSES','DECLARATION','DECLARATIONS',
    'ANNEXE','ANNEXES','SIGNATURE','SIGNATURES','DIAGNOSTIC','DIAGNOSTICS',
    'NOTAIRE','ETUDE','BIEN','IMMEUBLE','DESIGNE','DENOMME','DENOMMEE','PARTIES',
    'PARTIE','PRESENTES','DEPOT','GARANTIE','PRET','ACTE','AUTHENTIQUE','UNILATERALE'
  ]);

  function normaliserMaj(s) {
    return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  }

  function estNomValide(candidat) {
    const mots = candidat.split(/[\s-]+/).map(normaliserMaj);
    return candidat.length >= 2 && !mots.some(m => MOTS_EXCLUS_NOM.has(m));
  }

  // Isole le bloc de texte décrivant une partie (ex. tout ce qui suit "Le vendeur" jusqu'à
  // "Ci-après dénommé…"), en cherchant l'intitulé seulement après un point de départ donné
  // (utile pour ne pas retrouver deux fois le même intitulé, ou empiéter sur l'autre partie).
  function extraireBlocPartie(texte, motRe, apresIndex) {
    const zone = texte.slice(apresIndex);
    const m = zone.match(motRe);
    if (!m) return null;
    const debut = m.index + m[0].length;
    const reste = zone.slice(debut);
    const finMatch = reste.match(/ci-apr[èe]s\s+d[ée]nomm/i);
    const longueur = finMatch ? finMatch.index : Math.min(reste.length, 1200);
    return { texte: reste.slice(0, longueur), finAbsolue: apresIndex + debut + longueur };
  }

  // Dans le bloc d'une partie, extrait le(s) nom(s) de famille via l'ancre "né(e) le".
  function extraireNomsParNaissance(bloc) {
    const civiliteRe = /Monsieur|Madame|Mademoiselle/gi;
    const positions = [];
    let m;
    while ((m = civiliteRe.exec(bloc)) !== null) positions.push(m.index);
    if (positions.length === 0) return [];
    positions.push(bloc.length);
    const noms = [];
    const nomAvantNaissanceRe = /\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[-\s][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)\s+n[ée]e?(?=\s)/;
    for (let i = 0; i < positions.length - 1; i++) {
      const segment = bloc.slice(positions[i], positions[i + 1]);
      const nm = segment.match(nomAvantNaissanceRe);
      if (nm && estNomValide(nm[1])) noms.push(nm[1]);
    }
    return [...new Set(noms)];
  }

  function trouverNomDansFenetre(fenetre, direction) {
    const nomRe = /\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[-\s][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)\b/g;
    let resultat = null;
    let nm;
    while ((nm = nomRe.exec(fenetre)) !== null) {
      if (!estNomValide(nm[1])) continue;
      resultat = { nom: nm[1], idx: nm.index };
      if (direction === 'first') break;
    }
    return resultat;
  }

  // Repère le style "…ci-après dénommé(e) « le Vendeur »" : un guillemet (et souvent l'article
  // le/la/l') juste avant le mot-clé signale que le nom est à chercher AVANT, pas après.
  function estStyleLabelEntreGuillemets(texte, index) {
    const avant = texte.slice(Math.max(0, index - 25), index);
    return /["«'’]\s*(?:le|la|l['’]|du|des)?\s*$/i.test(avant);
  }

  function extraireNomsRepli(texte, motRe) {
    const m = texte.match(motRe);
    if (!m) return [];
    const finMot = m.index + m[0].length;
    if (!estStyleLabelEntreGuillemets(texte, m.index)) {
      const fenetreApres = texte.slice(finMot, Math.min(texte.length, finMot + 300));
      const rApres = trouverNomDansFenetre(fenetreApres, 'first');
      if (rApres) return [rApres.nom];
    }
    const fenetreAvant = texte.slice(Math.max(0, m.index - 250), m.index);
    const rAvant = trouverNomDansFenetre(fenetreAvant, 'last');
    return rAvant ? [rAvant.nom] : [];
  }

  // Selon le type d'acte, le vendeur est désigné VENDEUR ou PROMETTANT, et l'acquéreur ACQUÉREUR,
  // ACHETEUR ou BÉNÉFICIAIRE (promesse unilatérale de vente réitérée par acte authentique).
  const RE_ROLE_VENDEUR = /vendeu?rs?|promettants?/i;
  const RE_ROLE_ACQUEREUR = /acqu[ée]reurs?|acheteurs?|b[ée]n[ée]ficiaires?/i;

  function detecterNomDossier(texte) {
    const blocVendeur = extraireBlocPartie(texte, RE_ROLE_VENDEUR, 0);
    let nomsVendeur = blocVendeur ? extraireNomsParNaissance(blocVendeur.texte) : [];
    const finVendeur = blocVendeur ? blocVendeur.finAbsolue : 0;

    const blocAcquereur = extraireBlocPartie(texte, RE_ROLE_ACQUEREUR, finVendeur);
    let nomsAcquereur = blocAcquereur ? extraireNomsParNaissance(blocAcquereur.texte) : [];

    // Repli si le modèle de document n'utilise pas "né(e) le" pour présenter les parties.
    if (nomsVendeur.length === 0) nomsVendeur = extraireNomsRepli(texte, RE_ROLE_VENDEUR);
    if (nomsAcquereur.length === 0) nomsAcquereur = extraireNomsRepli(texte, RE_ROLE_ACQUEREUR);

    const partieVendeur = nomsVendeur.join(' & ');
    const partieAcquereur = nomsAcquereur.join(' & ');
    if (partieVendeur && partieAcquereur) return `${partieVendeur} / ${partieAcquereur}`;
    return partieVendeur || partieAcquereur || null;
  }

  // Dates à écarter d'office : diagnostics, actes antérieurs, état civil, copropriété passée…
  // (dont les citations de loi, ex. « en vertu de la loi numéro 2022-270 du 28 février 2022 » —
  // une clause d'information sur l'assurance emprunteur, sans lien avec l'échéance du prêt lui-même
  // malgré le vocabulaire "prêteur"/"emprunteur" à proximité immédiate — cas réel rencontré).
  const EXCLUSION_RE = /diagnostic|dpe\b|amiante|plomb|termite|erp\b|carrez|m[ée]trage|\bn[ée]e?\s+le\b|suivant\s+acte|acte\s+(re[çc]u|d.acquisition|de\s+propri[ée]t[ée]|notari[ée]|initial)|pr[ée]c[ée]demment|[ée]tabli(e)?\s+le|dat[ée](e)?\s+du|dat[ée](e)?\s+de\s+validit[ée]|r[ée]alis[ée](e)?\s+le|dress[ée](e)?\s+le|d[ée]livr[ée](e)?\s+le|assembl[ée]e\s+g[ée]n[ée]rale|r[èe]glement\s+de\s+copropri[ée]t[ée]|contrat\s+de\s+mariage|acte\s+de\s+naissance|cadastr|co\s*m\s*m\s*ande\s+du|p[ée]riode\s+de\s+validit[ée]|num[ée]ro\s+de\s+police|r[ée]f[ée]rence\s+interne|r[ée]f\.\s*interne|attestation\s+de\s+qualification|identifiant\s+du\s+contrat|cl[ée]\s+de\s+hachage|mandat\s+(?:écrit|ecrit)|[ée]tat\s+des\s+risques|[ée]tat\s+parasitaire|assainissement|fosse\s+septique|entretien\s+et\s+vidange|vidange\s+du|contr[ôo]le\s+d[eu]|installation\s+(?:int[ée]rieure|[ée]lectrique|de\s+gaz|gaz)|catastrophe\s+(?:naturelle|technologique)|risques?\s+(?:naturels?|miniers?|technologiques?)|sinistres?\s+indemnis[ée]s?|potentiel\s+radon|mouvement\s+de\s+terrain|recul\s+du\s+trait\s+de\s+c[ôo]te|zone\s+(?:couverte|expos[ée]e)|loi\s+(?:n[°ºo]|num[ée]ro)\s*[\d\-]+/i;

  // Formulations qui indiquent une échéance à venir plutôt qu'une date déjà passée.
  const CUE_FUTUR_RE = /au\s+plus\s+tard|avant\s+le|jusqu.au|date\s+limite|d[ée]lai\s+(?:expirant|fix[ée])|sera\s+(sign[ée]e?|r[ée]alis[ée]e?|conclu(e)?)|pr[ée]vue?\s+(le|pour|au)|fix[ée]e?\s+(au|le)|au\s+plus\s+tôt/i;

  function suggererEcheance(contexte) {
    const c = contexte.toLowerCase();
    if (/vente(?:.{0,60})?d.un\s+(?:autre\s+)?bien|condition\s+suspensive\s+de\s+vente\s+(?:d.un\s+bien|immobili[èe]re)|avant-contrat(?:.{0,150})?(?:vente|bien\s+(?:lui\s+)?appartenant)/.test(c)) return 'ventebien';
    // Ces clauses sont de vraies échéances mais ne correspondent ni à un prêt, ni à un acte, ni à
    // une vente préalable : elles sont classées "Autre" plutôt qu'ignorées.
    if (/permis\s+de\s+construire|certificat\s+d.urbanisme|autorisation\s+d.urbanisme|condition\s+suspensive\s+d.urbanisme|servitude/.test(c)) return 'autre';
    if (/pr[êe]t|financement|emprunt|offre\s+de\s+pr[êe]t/.test(c)) return 'pret';
    if (/acte\s+authentique|r[ée]it[ée]ration|signature\s+de\s+l.acte/.test(c)) return 'acte';
    if (/acte\s+de\s+vente|notaire/.test(c) && CUE_FUTUR_RE.test(c)) return 'acte';
    return null;
  }

  // Quand plusieurs dates détectées partagent la même catégorie suggérée (ex. une vraie échéance
  // de prêt et une citation de loi qui mentionne aussi "prêteur"), on ne peut pas se contenter de
  // prendre la première par ordre chronologique : cas réel rencontré où cela remontait une date de
  // loi de 2022 avant la vraie échéance de 2026. Une clause qui porte une formulation de délai
  // ("au plus tard le", "avant le"...) fait presque toujours foi sur une simple mention en passant
  // — si elle est la seule du lot à en porter une, elle est retenue sans marquer d'ambiguïté.
  // Sinon (aucune, ou plusieurs), le premier candidat est gardé par défaut mais signalé "ambigu" :
  // c'est à l'utilisateur de vérifier, pas à l'outil de deviner en silence.
  function meilleureCandidateEcheance(detectedDates, type) {
    const candidats = detectedDates.filter(d => d.suggestion === type);
    if (candidats.length === 0) return { candidat: null, ambigu: false };
    if (candidats.length === 1) return { candidat: candidats[0], ambigu: false };
    const avecEcheance = candidats.filter(d => CUE_FUTUR_RE.test(d.contexte));
    if (avecEcheance.length === 1) return { candidat: avecEcheance[0], ambigu: false };
    return { candidat: candidats[0], ambigu: true };
  }

  // Propose un intitulé plus parlant qu'"Autre échéance" quand le contexte le permet.
  function libelleAutreSuggere(contexte) {
    const c = (contexte || '').toLowerCase();
    if (/permis\s+de\s+construire/.test(c)) return 'Obtention du permis de construire';
    if (/certificat\s+d.urbanisme/.test(c)) return "Certificat d'urbanisme";
    if (/autorisation\s+d.urbanisme|condition\s+suspensive\s+d.urbanisme/.test(c)) return "Autorisation d'urbanisme";
    if (/servitude/.test(c)) return 'Levée de servitude';
    return '';
  }

  // ---- analyse juridique : documents que le vendeur s'engage à fournir ----

  // Chaque entrée porte sa catégorie : un notaire distingue l'entretien courant à justifier
  // (ramonage, chaudière) des travaux à faire exécuter, et des justificatifs administratifs.
  const DOCUMENTS_VENDEUR_CONNUS = [
    // Entretien courant à justifier
    { motif: /ramonage|entretien\s+(?:de\s+la\s+)?chemin[ée]e|conduits?\s+de\s+fum[ée]e/i, label: 'Justificatif de ramonage', cat: 'entretien' },
    { motif: /entretien\s+(?:annuel\s+)?(?:de\s+la\s+)?chaudi[èe]re|contrat\s+d.entretien\s+(?:de\s+la\s+)?chaudi[èe]re/i, label: "Justificatif d'entretien de la chaudière", cat: 'entretien' },
    { motif: /entretien\s+(?:du\s+|de\s+la\s+)?(?:syst[èe]me\s+de\s+)?pompe\s+[àa]\s+chaleur|entretien\s+(?:de\s+la\s+)?pac\b/i, label: "Justificatif d'entretien de la pompe à chaleur", cat: 'entretien' },
    { motif: /entretien.{0,30}(?:climatisation|clim\b)/i, label: "Justificatif d'entretien de la climatisation", cat: 'entretien' },
    { motif: /vidange\s+(?:de\s+la\s+)?fosse|(?:entretien|vidange).{0,30}fosse\s+septique/i, label: 'Vidange de fosse septique', cat: 'entretien' },
    { motif: /entretien.{0,30}adoucisseur/i, label: "Entretien de l'adoucisseur d'eau", cat: 'entretien' },
    { motif: /d[ée]broussaill|[ée]lagage/i, label: 'Débroussaillage / élagage', cat: 'entretien' },

    // Travaux à réaliser
    { motif: /remettre\s+en\s+[ée]tat|remise\s+en\s+[ée]tat|r[ée]paration/i, label: 'Travaux de remise en état', cat: 'travaux' },
    { motif: /r[ée]gularisation.{0,60}travaux|travaux.{0,60}r[ée]gularis|mise\s+en\s+conformit[ée]/i, label: 'Régularisation / mise en conformité', cat: 'travaux' },
    { motif: /cuve\s+[àa]\s+(?:fioul|mazout|gaz)|citerne|d[ée]gazage|enl[èe]vement.{0,40}citerne/i, label: 'Enlèvement / neutralisation de cuve ou citerne', cat: 'travaux' },
    { motif: /d[ée]barras|encombrants/i, label: 'Débarras des encombrants', cat: 'travaux' },

    // Justificatifs et attestations
    { motif: /certificat\s+de\s+conformit[ée]|attestation\s+de\s+conformit[ée]|consuel/i, label: 'Attestation de conformité', cat: 'justificatif' },
    { motif: /garantie\s+d[ée]cennale/i, label: 'Justificatif de garantie décennale', cat: 'justificatif' },
    { motif: /dommage[- ]ouvrage/i, label: 'Assurance dommage-ouvrage', cat: 'justificatif' },
    { motif: /factures?\s+(?:des\s+|de\s+)?travaux|justificatifs?\s+(?:des\s+)?travaux/i, label: 'Factures des travaux réalisés', cat: 'justificatif' },
    { motif: /assainissement\s+non\s+collectif|contr[ôo]le\s+d.assainissement|spanc\b/i, label: "Contrôle d'assainissement", cat: 'justificatif' },
    { motif: /[ée]tat\s+parasitaire|m[ée]rule/i, label: 'État parasitaire / mérule', cat: 'justificatif' },
    { motif: /audit\s+[ée]nerg[ée]tique/i, label: 'Audit énergétique', cat: 'justificatif' },
    { motif: /s[ée]curit[ée]\s+(?:de\s+la\s+)?piscine|alarme\s+piscine|barri[èe]re\s+de\s+protection/i, label: 'Conformité sécurité piscine', cat: 'justificatif' },
    { motif: /r[ée]sili(?:er|ation).{0,40}contrat/i, label: 'Justificatif de résiliation de contrat', cat: 'justificatif' }
  ];

  // Les documents ne sont cherchés QUE dans les clauses d'engagement du vendeur et les conditions
  // suspensives : chercher dans tout le compromis remontait des faux positifs (un adoucisseur cité
  // dans la liste des immeubles par destination n'est pas une pièce à réclamer).
  function detecterDocumentsAFournir(clauses) {
    const trouves = [];
    const vus = new Set();
    const zonesPertinentes = clauses.map(c => (typeof c === 'string' ? c : c.phrase)).join('\n');
    DOCUMENTS_VENDEUR_CONNUS.forEach(doc => {
      if (doc.motif.test(zonesPertinentes) && !vus.has(doc.label)) {
        vus.add(doc.label);
        trouves.push({ label: doc.label, cat: doc.cat });
      }
    });
    return trouves;
  }

  // Extrait les phrases où le VENDEUR s'engage à remettre/produire/fournir un document,
  // pour donner accès aux clauses exactes du compromis (et pas seulement à l'étiquette générique).
  // Un engagement n'est retenu que s'il porte sur une PIÈCE à fournir ou des TRAVAUX à réaliser :
  // les clauses générales (maintenir le bien en l'état, s'interdire de consentir un bail…) sont
  // des obligations de comportement, sans document ni chantier à suivre — elles sont écartées.
  const OBJET_DOCUMENT_RE = /certificat|attestation|justificatif|justifer|justifier|diagnostic|facture|devis|[ée]tat\s+parasitaire|police\s+d.assurance|contr[ôo]le|audit|document/i;
  const OBJET_ENTRETIEN_RE = /entretien|ramonage|vidange|d[ée]broussaill|[ée]lagage|curage|nettoyage/i;
  const OBJET_TRAVAUX_RE = /travaux|r[ée]paration|remettre\s+en\s+[ée]tat|remise\s+en\s+[ée]tat|mise\s+en\s+conformit[ée]|r[ée]gularis|d[ée]barras|d[ée]gazage|d[ée]molition|raccordement|remplacement|d[ée]pollution|enl[èe]vement|lib[ée]rer\s+les\s+lieux|r[ée]silier/i;

  // Une énumération d'équipements vendus avec le bien (immeubles par destination) contient beaucoup
  // de mots-clés d'équipement sans être un engagement : on l'écarte explicitement.
  const LISTE_EQUIPEMENTS_RE = /immeuble\s+par\s+destination|laisser\s+dans\s+l.immeuble|sans\s+que\s+cette\s+liste\s+soit\s+limitative|biens\s+ci-apr[èe]s\s+d[ée]sign[ée]s/i;

  // Thèmes explicitement exclus de l'analyse : ils relèvent du suivi notarial classique et non
  // des pièces ou travaux à réclamer au vendeur dans le cadre de ce suivi.
  const EXCLUSION_ENGAGEMENT_RE = /urbanisme|permis\s+de\s+construire|d[ée]claration\s+pr[ée]alable|droit\s+de\s+pr[ée]emption|\bdia\b|bornage|servitude|cadastr|copropri[ée]t[ée]|syndic|assembl[ée]e\s+g[ée]n[ée]rale|[ée]tat\s+dat[ée]|fonds\s+de\s+travaux|charges\s+de\s+copropri[ée]t[ée]|taxe\s+fonci[èe]re|imp[ôo]t\s+foncier|quitus\s+fiscal|hypoth[ée]|mainlev[ée]e|certificat\s+de\s+radiation|privil[èe]ge\s+de\s+pr[êe]teur/i;

  // Clauses purement hypothétiques : « SI le bien VENAIT À se trouver en zone contaminée, le
  // vendeur s'engage à fournir un état parasitaire ». Rien n'est dû tant que l'hypothèse ne se
  // réalise pas — ce n'est pas une pièce à réclamer à l'ouverture du dossier, contrairement au
  // renouvellement d'un diagnostic ou d'un entretien, qui lui est ferme et daté.
  const CLAUSE_HYPOTHETIQUE_RE = /\bsi\s+(?:les?|la|des|le\s+bien|l[ea]s?\s+biens?)[^.]{0,120}?\b(?:venai(?:en)?t|se\s+r[ée]v[ée]lai(?:en)?t|[ée]tai(?:en)?t|devai(?:en)?t|s'av[ée]rai(?:en)?t)(?=\s)|\bdans\s+(?:le\s+cas|l.hypoth[èe]se)\s+o[ùu](?=\s)|\bau\s+cas\s+o[ùu](?=\s)|\bs'il\s+(?:venait|s'av[ée]rait|appara[îi]ssait)(?=\s)|\bviendrai(?:en)?t\s+[àa]\s+se\s+trouver|\bsi\s+d(?:es|e\s+telles?)\b[^.]{0,80}\bse\s+r[ée]v[ée]lai(?:en)?t(?=\s|,)|\b(?:appara[îi]traient|surviendrai(?:en)?t|se\s+r[ée]v[ée]lerai(?:en)?t)(?=\s|,)/i;

  // Occupation, jouissance et libération des lieux : elles relèvent des modalités de remise du
  // bien le jour de l'acte, pas des pièces ou travaux à obtenir en amont.
  const OCCUPATION_JOUISSANCE_RE = /occupation\s+du\s+bien|entr[ée]e\s+en\s+jouissance|jouissance\s+(?:du\s+bien|des\s+biens|r[ée]elle)|lib[ée]rer\s+les\s+lieux|lib[ée]ration\s+des\s+lieux|libres?\s+de\s+toute\s+occupation|[ée]tat\s+des\s+lieux|remise\s+des\s+cl[ée]s/i;

  // Un compromis structure ses clauses en sections ("Conditions suspensives", "Conditions
  // particulières") découpées en rubriques titrées (CITERNE DE GAZ :, COUVERTURE :…). Les lire
  // ainsi est bien plus fiable qu'une recherche de mots-clés au fil du texte, et garantit qu'aucune
  // rubrique n'est oubliée.
  function extraireSection(texte, titreRe, titreSuivantRe) {
    const debut = texte.search(titreRe);
    if (debut === -1) return '';
    const reste = texte.slice(debut);
    const fin = titreSuivantRe ? reste.slice(20).search(titreSuivantRe) : -1;
    return fin === -1 ? reste.slice(0, 12000) : reste.slice(0, fin + 20);
  }

  // Découpe une section en rubriques : un titre est une ligne courte en majuscules, souvent
  // terminée par « : ».
  function decouperEnRubriques(section) {
    const rubriques = [];
    const lignes = section.split('\n');
    let courante = null;
    const titreRe = /^\s*([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’\s,\-\/\d]{3,70})\s*:\s*$/;

    lignes.forEach(ligne => {
      const m = ligne.match(titreRe);
      if (m) {
        if (courante) rubriques.push(courante);
        courante = { titre: m[1].replace(/\s+/g, ' ').trim(), contenu: '' };
      } else if (courante) {
        courante.contenu += ' ' + ligne.trim();
      }
    });
    if (courante) rubriques.push(courante);

    return rubriques
      .map(r => ({ titre: r.titre, contenu: r.contenu.replace(/\s+/g, ' ').trim() }))
      .filter(r => r.contenu.length > 30);
  }

  function extraireConditionsParticulieres(texte) {
    const section = extraireSection(
      texte,
      /Conditions\s+particuli[èe]res/i,
      /\n\s*(?:Interdiction\s+pour\s+le\s+vendeur|Obligations\s+de\s+garde|Dispositions\s+(?:diverses|g[ée]n[ée]rales)|Signatures?|Annexes?)\b/i
    );
    if (!section) return [];
    return decouperEnRubriques(section).map(r => ({
      titre: r.titre,
      contenu: r.contenu.length > 400 ? r.contenu.slice(0, 400) + '…' : r.contenu,
      // Une rubrique est signalée comme « à suivre » si le vendeur y prend un engagement.
      engagementVendeur: /\ble\s+vendeur\s+s.(?:engage|oblige)|\ble\s+vendeur\s+(?:devra|remettra|produira|fournira|justifiera)/i.test(r.contenu)
    }));
  }

  function extraireConditionsSuspensives(texte) {
    const section = extraireSection(
      texte,
      /\nConditions\s+suspensives/i,
      /\n\s*Conditions\s+particuli[èe]res/i
    );
    const rubriques = section ? decouperEnRubriques(section) : [];

    // La condition de prêt a son propre titre de section dans la plupart des modèles.
    const cs = rubriques.map(r => ({
      titre: r.titre,
      contenu: r.contenu.length > 350 ? r.contenu.slice(0, 350) + '…' : r.contenu
    }));

    const pret = texte.match(/Condition\s+suspensive\s+de\s+l.obtention\s+d.un\s+pr[êe]t[^\n]{0,120}/i);
    if (pret && !cs.some(c => /pr[êe]t/i.test(c.titre))) {
      const dateButoir = texte.match(/DUR[ÉE]E\s+DE\s+VALIDIT[ÉE][^\n]{0,120}/i);
      cs.unshift({
        titre: "OBTENTION D'UN PRÊT IMMOBILIER",
        contenu: dateButoir ? dateButoir[0].replace(/\s+/g, ' ').trim() : pret[0].replace(/\s+/g, ' ').trim()
      });
    }
    return cs;
  }

  // Un compromis structure ses clauses par rubriques en majuscules (CITERNE DE GAZ :, COUVERTURE :…)
  // regroupées sous « Conditions particulières » / « Conditions suspensives ». On exploite cette
  // structure pour restituer les clauses telles que le notaire les lit, sans rien inventer.
  function extraireConditions(texte) {
    const resultats = [];
    const vus = new Set();

    const sections = [
      // Le titre doit être seul sur sa ligne : évite d'attraper « ...sous conditions suspensives »
      // du titre courant répété en pied de page.
      { titre: /\n\s*Conditions?\s+suspensives?\s*\n/i, type: 'suspensive' },
      { titre: /\n\s*Conditions?\s+particuli[èe]res?\s*\n/i, type: 'particuliere' }
    ];

    sections.forEach(({ titre, type }) => {
      const m = texte.match(titre);
      if (!m) return;
      const debut = m.index + m[0].length;
      // La section s'arrête au prochain grand titre de niveau équivalent.
      const reste = texte.slice(debut, debut + 12000);
      const finMatch = reste.match(/\n(?:Conditions?\s+particuli[èe]res?|Interdiction\s+pour\s+le\s+vendeur|Obligations?\s+de\s+garde|Date\s+et\s+signatures?|Dispositions?\s+g[ée]n[ée]rales?)\s*\n/i);
      const corps = finMatch ? reste.slice(0, finMatch.index) : reste;

      // Rubriques : ligne en MAJUSCULES, tolérant les mots de liaison en minuscules
      // (« CHAUFFAGE et PRODUCTION D'EAU CHAUDE : »).
      const reRubrique = /(?:^|\n)([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’\s\-,()°.\d]*(?:\s(?:et|de|du|des|d'|l'|la|le)\s[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’\s\-,()°.\d]*)*)\s*:\s*/g;
      const points = [];
      let r;
      while ((r = reRubrique.exec(corps)) !== null) {
        const t = r[1].trim().replace(/\s+/g, ' ');
        if (t.length < 4 || t.length > 70) continue;
        points.push({ titre: t, debut: r.index + r[0].length });
      }

      points.forEach((p, i) => {
        const fin = (i + 1 < points.length) ? points[i + 1].debut : corps.length;
        let contenu = corps.slice(p.debut, fin).replace(/\s+/g, ' ').trim();
        // Retire les pieds de page répétés par l'extraction PDF.
        contenu = contenu.replace(/Compromis de vente[^\n]{0,120}Page \d+ sur \d+/gi, '').trim();
        if (contenu.length < 20) return;
        const cle = p.titre.toLowerCase();
        if (vus.has(cle)) return;
        vus.add(cle);
        resultats.push({ titre: p.titre, contenu: contenu.slice(0, 600), type });
      });

      // Certaines conditions suspensives ont un titre de ligne sans « : » final
      // (« CERTIFICAT OU NOTE D'URBANISME », « DROIT DE PRÉEMPTION URBAIN (DPU) »).
      if (type === 'suspensive' && points.length === 0) {
        const reTitreSeul = /(?:^|\n)([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’\s\-()°\d]{6,70})\n/g;
        const titres = [];
        let t;
        while ((t = reTitreSeul.exec(corps)) !== null) {
          titres.push({ titre: t[1].trim().replace(/\s+/g, ' '), debut: t.index + t[0].length });
        }
        titres.forEach((p, i) => {
          const fin = (i + 1 < titres.length) ? titres[i + 1].debut : corps.length;
          let contenu = corps.slice(p.debut, fin).replace(/\s+/g, ' ').trim();
          contenu = contenu.replace(/Compromis de vente[^\n]{0,120}Page \d+ sur \d+/gi, '').trim();
          if (contenu.length < 40) return;
          const cle = p.titre.toLowerCase();
          if (vus.has(cle)) return;
          vus.add(cle);
          resultats.push({ titre: p.titre, contenu: contenu.slice(0, 600), type });
        });
      }
    });

    return resultats;
  }

  function extraireEngagementsVendeur(texte) {
    const engagements = [];
    const vus = new Set();
    // Uniquement les vrais engagements du vendeur (ce qu'il reste à faire ou à produire), et non
    // les diagnostics déjà fournis et annexés à l'acte, qui ne demandent plus aucune action.
    // Selon la nature de l'acte, le vendeur peut être désigné VENDEUR (compromis synallagmatique)
    // ou PROMETTANT (promesse unilatérale de vente, souvent réitérée par acte authentique) : les
    // deux rôles portent la même obligation de délivrance et sont traités de façon identique.
    const re = /\ble\s+(?:vendeur|promettant)\s+(?:s'engage(?:\s+à)?|s'oblige(?:\s+à)?|devra|remettra|produira|fournira|communiquera|justifiera|fera\s+son\s+affaire)\b/gi;
    let m;
    while ((m = re.exec(texte)) !== null) {
      let fin = m.index;
      let n = 0;
      while (fin < texte.length && n < 450) {
        if (texte[fin] === '.') { fin++; break; }
        fin++; n++;
      }
      let debut = m.index;
      n = 0;
      // Fenêtre arrière large : le conditionnel qui neutralise l'engagement se trouve souvent en
      // tête de phrase (« Si les biens venaient à se trouver…, le VENDEUR s'engage à… »), bien
      // avant la mention du vendeur. Trop court, on retiendrait à tort une clause hypothétique.
      while (debut > 0 && n < 300) {
        if (texte[debut - 1] === '.') break;
        debut--; n++;
      }
      const phrase = texte.slice(debut, fin).replace(/\s+/g, ' ').trim();
      if (phrase.length <= 25) continue;
      if (EXCLUSION_ENGAGEMENT_RE.test(phrase)) continue;
      if (LISTE_EQUIPEMENTS_RE.test(phrase)) continue;
      if (CLAUSE_HYPOTHETIQUE_RE.test(phrase)) continue;
      if (OCCUPATION_JOUISSANCE_RE.test(phrase)) continue;

      const estEntretien = OBJET_ENTRETIEN_RE.test(phrase);
      const estTravaux = OBJET_TRAVAUX_RE.test(phrase);
      const estDocument = OBJET_DOCUMENT_RE.test(phrase);
      if (!estEntretien && !estTravaux && !estDocument) continue;

      // L'entretien prime : « justifier du dernier ramonage » est un entretien à prouver, pas des
      // travaux à faire exécuter — la distinction compte pour savoir quoi réclamer au vendeur.
      let type = 'document';
      if (estEntretien) type = 'entretien';
      else if (estTravaux && !estDocument) type = 'travaux';
      else if (estTravaux) type = 'travaux';

      const cle = phrase.slice(0, 70);
      if (!vus.has(cle)) {
        vus.add(cle);
        engagements.push({ phrase, type });
      }
    }
    return engagements;
  }

  function renderCondition(c) {
    const libelle = c.type === 'suspensive' ? 'Suspensive' : 'Particulière';
    return `<div class="condition-ligne">
      <span class="condition-titre"><span class="condition-badge ${c.type}">${libelle}</span>${escapeHtml(c.titre)}</span>
      <span class="condition-contenu">${escapeHtml(c.contenu)}</span>
    </div>`;
  }

  // Accepte le nouveau format {label, cat} comme l'ancien (simple chaîne), pour que les dossiers
  // enregistrés avant cette évolution continuent de s'afficher.
  function renderDocBadge(doc) {
    const label = (typeof doc === 'string') ? doc : doc.label;
    const cat = (typeof doc === 'string') ? '' : (doc.cat || '');
    return `<span class="analyse-doc-badge${cat ? ' cat-' + cat : ''}">${escapeHtml(label)}</span>`;
  }

  // Accepte aussi bien le nouveau format {phrase, type} que l'ancien (simple chaîne), pour que
  // les dossiers enregistrés avant cette évolution continuent de s'afficher correctement.
  function renderEngagement(e) {
    const phrase = (typeof e === 'string') ? e : e.phrase;
    const type = (typeof e === 'string') ? null : e.type;
    const libelles = { entretien: 'Entretien', travaux: 'Travaux', document: 'Document' };
    const etiquette = type
      ? `<span class="engagement-type ${type}">${libelles[type] || 'Document'}</span>`
      : '';
    return `<div class="analyse-engagement-ligne">${etiquette}<span>${escapeHtml(phrase)}</span></div>`;
  }

  // 'apercu' | 'analyse' — l'onglet actif du panneau ancré à droite du formulaire (voir
  // definirVuePdfViewer). Remis à 'apercu' à chaque nouvel import (traiterFichierPdf) : l'aperçu du
  // nouveau document prime, l'utilisateur reclique sur l'onglet analyse s'il veut la consulter.
  let vuePdfViewerActuelle = 'apercu';
  let analyseJuridiqueDisponible = false;

  function definirVuePdfViewer(vue) {
    vuePdfViewerActuelle = vue;
    const tabApercu = document.getElementById('pdf-viewer-tab-apercu');
    const tabAnalyse = document.getElementById('pdf-viewer-tab-analyse');
    if (tabApercu) tabApercu.classList.toggle('actif', vue === 'apercu');
    if (tabAnalyse) tabAnalyse.classList.toggle('actif', vue === 'analyse');
    document.getElementById('pdf-pages-container').style.display = vue === 'apercu' ? 'flex' : 'none';
    document.getElementById('analyse-juridique').style.display = (vue === 'analyse' && analyseJuridiqueDisponible) ? 'block' : 'none';
  }

  function afficherAnalyseJuridique() {
    const listeDocs = document.getElementById('analyse-documents-liste');
    const note = document.getElementById('analyse-note');
    const { documents, engagements, conditions = [] } = analyseJuridiqueActuelle;

    analyseJuridiqueDisponible = documents.length > 0 || engagements.length > 0 || conditions.length > 0;
    document.getElementById('pdf-viewer-tabs').style.display = analyseJuridiqueDisponible ? 'flex' : 'none';
    if (!analyseJuridiqueDisponible) {
      definirVuePdfViewer(vuePdfViewerActuelle);
      return;
    }

    // Les conditions suspensives et particulières sont reprises telles qu'elles figurent au
    // compromis, rubrique par rubrique : c'est la lecture de référence du notaire.
    const sectionConditions = document.getElementById('analyse-section-conditions');
    sectionConditions.style.display = conditions.length > 0 ? 'block' : 'none';
    document.getElementById('analyse-nb-conditions').textContent = conditions.length || '';
    document.getElementById('analyse-conditions-liste').innerHTML = conditions.map(renderCondition).join('');

    // Les engagements sont affichés directement : ce sont les actions à suivre, elles ne doivent
    // pas être cachées derrière un clic.
    const sectionEngagements = document.getElementById('analyse-section-engagements');
    sectionEngagements.style.display = engagements.length > 0 ? 'block' : 'none';
    document.getElementById('analyse-nb-engagements').textContent = engagements.length || '';
    document.getElementById('analyse-engagements-liste').innerHTML = engagements
      .map(e => renderEngagement(e))
      .join('');

    document.getElementById('analyse-nb-documents').textContent = documents.length || '';
    listeDocs.innerHTML = documents.length > 0
      ? documents.map(doc => renderDocBadge(doc)).join('')
      : '<span class="analyse-vide">Aucun document type reconnu automatiquement.</span>';

    // La reconnaissance des documents s'appuie sur une liste de types courants : si le compromis
    // contient plus de clauses d'engagement que de documents identifiés, c'est le signe qu'une
    // pièce sort de cette liste. On le signale plutôt que de laisser croire à une liste exhaustive.
    if (engagements.length > documents.length) {
      note.style.display = 'block';
      note.textContent = documents.length === 0
        ? `⚠️ ${engagements.length} clause${engagements.length > 1 ? 's' : ''} d'engagement relevée${engagements.length > 1 ? 's' : ''}, mais aucun document type reconnu : lisez les clauses ci-dessus pour identifier les pièces attendues.`
        : `⚠️ Liste possiblement incomplète : ${engagements.length} clauses d'engagement relevées pour ${documents.length} document${documents.length > 1 ? 's' : ''} identifié${documents.length > 1 ? 's' : ''}. Relisez les clauses ci-dessus.`;
    } else {
      note.style.display = 'none';
    }
    definirVuePdfViewer(vuePdfViewerActuelle);
  }

  // Extrait la phrase contenant la date (bornée par un maximum de caractères) plutôt qu'une simple
  // fenêtre de N caractères, pour éviter qu'un mot-clé d'une phrase voisine ne s'y mélange.
  function extraireContexte(texte, index, longueur) {
    const MAX_AVANT = 260, MAX_APRES = 220;
    let debut = index;
    let n = 0;
    while (debut > 0 && n < MAX_AVANT) {
      const ch = texte[debut - 1];
      if (ch === '.') break;
      debut--; n++;
    }
    let fin = index + longueur;
    n = 0;
    while (fin < texte.length && n < MAX_APRES) {
      const ch = texte[fin];
      if (ch === '.') { fin++; break; }
      fin++; n++;
    }
    return texte.slice(debut, fin).replace(/\s+/g, ' ').trim();
  }

  function detecterDatesDepuisTexte(texte, dateCompromis) {
    const resultats = [];
    const seen = new Set();

    function ajouter(iso, label, index, longueur, approx) {
      if (seen.has(iso)) return;
      // Écarte toute date antérieure ou égale à la signature du compromis (diagnostics, actes précédents…).
      if (dateCompromis && iso <= dateCompromis) return;
      const contexte = extraireContexte(texte, index, longueur);
      if (EXCLUSION_RE.test(contexte.toLowerCase())) return;
      let suggestion = suggererEcheance(contexte);
      // Une correction déjà faite par un(e) collaborateur(rice) sur une clause très proche
      // l'emporte sur la suggestion par mots-clés (voir la section "apprentissage" plus bas).
      const apprise = trouverCorrectionApprise(contexte);
      if (apprise) suggestion = apprise.classification;
      seen.add(iso);
      resultats.push({
        iso, label, contexte, suggestion, active: !!suggestion, page: pageDepuisIndex(index),
        apprise: !!apprise, libelleAppris: apprise ? apprise.libelle : null,
        approx: !!approx
      });
    }

    const reNum = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
    let m;
    while ((m = reNum.exec(texte)) !== null) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        ajouter(toISO(y, mo - 1, d), m[0], m.index, m[0].length);
      }
    }

    const moisNoms = Object.keys(MOIS).join('|');
    // (?:er)? : voir le commentaire équivalent dans extraireDateDeFragment — "le 1er janvier"
    // sans ce groupe n'est jamais détecté.
    const reTexte = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${moisNoms})\\s+(\\d{4})\\b`, 'gi');
    while ((m = reTexte.exec(texte)) !== null) {
      const d = parseInt(m[1], 10);
      const moKey = m[2].toLowerCase();
      const y = parseInt(m[3], 10);
      if (MOIS.hasOwnProperty(moKey)) {
        ajouter(toISO(y, MOIS[moKey], d), m[0], m.index, m[0].length);
      }
    }

    // Date arrondie à la fin d'un mois ("avant fin septembre 2026", "d'ici fin septembre 2026") :
    // résolue au dernier jour civil de ce mois, marquée "approx" (badge "≈ estimée" côté chip/
    // confiance) plutôt que traitée comme une date lue telle quelle. L'année doit être écrite
    // explicitement dans le texte : sans elle, il faudrait deviner entre l'année du compromis et la
    // suivante selon le mois — exactement le genre de supposition qui a déjà produit une mauvaise
    // date silencieuse (voir l'historique des bugs corrigés dans CLAUDE.md). Pas trouvée → pas
    // ajoutée, l'utilisateur la saisit à la main comme pour tout ce que l'outil ne reconnaît pas.
    const reFinMois = new RegExp(`\\bfin\\s+(${moisNoms})\\s+(\\d{4})\\b`, 'gi');
    while ((m = reFinMois.exec(texte)) !== null) {
      const moKey = m[1].toLowerCase();
      const y = parseInt(m[2], 10);
      if (MOIS.hasOwnProperty(moKey)) {
        const dernierJour = new Date(y, MOIS[moKey] + 1, 0).getDate();
        ajouter(toISO(y, MOIS[moKey], dernierJour), m[0], m.index, m[0].length, true);
      }
    }

    // Délai relatif à la signature ("délai de 30 jours à compter de la signature", "J+30") :
    // seulement calculable si la date de signature du compromis a été trouvée (dateCompromis) — sans
    // ancre fiable, on ne devine pas à partir de quoi compter, on laisse l'utilisateur l'ajouter lui-même.
    if (dateCompromis) {
      const reDelai = /d[ée]lai\s+de\s+(\d{1,3})\s*jours?\s+(?:[àa]\s+compter|[àa]\s+partir)\s+de\s+(?:la\s+signature|ce\s+jour|l['’]acte|la\s+pr[ée]sente|le\s+pr[ée]sent\s+(?:compromis|acte)|la\s+promesse)/gi;
      while ((m = reDelai.exec(texte)) !== null) {
        ajouter(addDays(dateCompromis, parseInt(m[1], 10)), m[0], m.index, m[0].length, true);
      }
      const reJPlus = /\bJ\s*\+\s*(\d{1,3})\b/g;
      while ((m = reJPlus.exec(texte)) !== null) {
        ajouter(addDays(dateCompromis, parseInt(m[1], 10)), m[0], m.index, m[0].length, true);
      }
    }

    resultats.sort((a, b) => a.iso.localeCompare(b.iso));
    return resultats;
  }

  function majAffichageCompromis() {
    const info = document.getElementById('compromis-info');
    const texte = document.getElementById('compromis-info-text');
    info.style.display = 'flex';
    if (dateCompromisDetectee && !dateCompromisEstimee) {
      info.classList.remove('warn');
      texte.textContent = `Date de signature détectée : ${formatDateFr(dateCompromisDetectee)}`;
      document.getElementById('f-date-compromis').style.display = 'none';
    } else if (dateCompromisDetectee && dateCompromisEstimee) {
      info.classList.add('warn');
      texte.textContent = `Date de signature estimée : ${formatDateFr(dateCompromisDetectee)} — à vérifier.`;
      document.getElementById('f-date-compromis').style.display = 'none';
    } else {
      info.classList.add('warn');
      texte.textContent = "Date de signature non trouvée — indiquez-la :";
      document.getElementById('f-date-compromis').style.display = 'inline-block';
    }
  }

  function toggleCompromisEdit() {
    const input = document.getElementById('f-date-compromis');
    input.style.display = input.style.display === 'none' ? 'inline-block' : 'none';
    if (input.style.display === 'inline-block') input.value = dateCompromisDetectee || '';
  }

  function corrigerDateCompromis(valeur) {
    if (!valeur) return; // un champ vidé en cours de frappe ne doit rien réinitialiser
    dateCompromisDetectee = valeur;
    dateCompromisEstimee = false;
    // Met à jour uniquement le texte d'information, sans jamais recacher le champ : il se
    // recache via majAffichageCompromis() au prochain import de PDF, pas pendant une saisie
    // manuelle — sinon le champ disparaissait sous les doigts dès que la date devenait valide,
    // avant même que le collaborateur ait fini de la corriger.
    const info = document.getElementById('compromis-info');
    const texte = document.getElementById('compromis-info-text');
    info.classList.remove('warn');
    texte.textContent = `Date de signature détectée : ${formatDateFr(dateCompromisDetectee)}`;
    if (dernierTexteTraite) {
      detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
      renderChips();
    }
  }

  function toggleEcheance(type, actif) {
    echeanceActive[type] = actif;
    const bloc = document.getElementById('bloc-' + type);
    const input = document.getElementById('f-' + type);
    bloc.classList.toggle('inactive', !actif);
    input.disabled = !actif;
    if (!actif) input.value = '';
  }

  function definirEcheanceActive(type, actif) {
    const checkbox = document.getElementById('toggle-' + type);
    if (checkbox) checkbox.checked = actif;
    toggleEcheance(type, actif);
  }

  // Point d'entrée unique : le texte extrait du PDF passe par toutes les détections automatiques.
  function traiterTexte(texte) {
    dernierTexteTraite = texte;

    // Repart d'une base propre à chaque import : évite qu'un chiffre resté d'un essai précédent
    // ne fausse une saisie manuelle ultérieure (ex. « je tape une date et seul le 2 reste »).
    document.getElementById('f-pret').value = '';
    document.getElementById('f-acte').value = '';
    document.getElementById('f-ventebien').value = '';
    document.getElementById('f-date-compromis').value = '';

    dateCompromisEstimee = false;
    dateCompromisDetectee = detecterDateCompromis(texte) || '';
    majAffichageCompromis();

    detectedDates = detecterDatesDepuisTexte(texte, dateCompromisDetectee);
    renderChips();

    // Remplit directement les champs Prêt / Acte / Vente quand l'outil a une classification
    // fiable, au lieu de laisser la date en attente dans l'encart : sinon, l'échéance est bien
    // repérée mais reste invisible tant qu'on n'a pas cliqué sur son bouton de catégorie.
    ['pret', 'acte', 'ventebien'].forEach(type => {
      const { candidat, ambigu } = meilleureCandidateEcheance(detectedDates, type);
      if (candidat) {
        document.getElementById('f-' + type).value = candidat.iso;
        definirEcheanceActive(type, true);
        pageParType[type] = candidat.page;
        ambiguiteParType[type] = ambigu;
        approxParType[type] = !!candidat.approx;
      }
    });

    const cashNote = document.getElementById('cash-note');
    if (detecterFinancementComptant(texte)) {
      definirEcheanceActive('pret', false);
      cashNote.style.display = 'block';
      cashNote.textContent = "Achat sans prêt détecté : l'échéance « Obtention du prêt » a été désactivée.";
    } else {
      cashNote.style.display = 'none';
    }

    const champNom = document.getElementById('f-nom');
    if (!champNom.value.trim()) {
      const nomDetecte = detecterNomDossier(texte);
      if (nomDetecte) champNom.value = nomDetecte;
    }

    // Les documents sont déduits des seules clauses d'engagement du vendeur, et non de l'ensemble
    // du compromis : c'est ainsi qu'un notaire lit l'acte, et cela évite les faux positifs.
    const engagements = extraireEngagementsVendeur(texte);
    analyseJuridiqueActuelle = {
      documents: detecterDocumentsAFournir(engagements),
      engagements,
      conditions: extraireConditions(texte)
    };
    afficherAnalyseJuridique();

    return detectedDates.length;
  }

  function creerChip(item) {
    const btnClass = (type) => 'mini-btn' + (type ? ' suggested ' + type : '');
    const chip = document.createElement('div');
    const couleur = item.suggestion ? ' chip-' + item.suggestion : '';
    chip.className = 'chip' + couleur + (item.active ? '' : ' inactive');
    const boutonVoir = (pdfActuel && item.page)
      ? `<button type="button" class="voir-pdf-btn" onclick="voirDateDansPdf(${item.page}, '${item.label.replace(/'/g, "\\'")}')">👁 p.${item.page}</button>`
      : '';
    const badgeApprise = item.apprise
      ? `<span class="badge-apprise" title="Classé d'après une correction déjà faite sur une clause très proche — à vérifier comme toute suggestion automatique">🧠 appris</span>`
      : '';
    // Date calculée (fin de mois arrondie, délai relatif) plutôt que lue telle quelle dans le
    // texte — voir ajouter() dans detecterDatesDepuisTexte. Visible dès l'étape "Vérifier", avant
    // même l'enregistrement (où le même statut réapparaît via badge-confiance "estime").
    const badgeApprox = item.approx
      ? `<span class="badge-approx" title="Date calculée à partir d'une formulation approximative (fin de mois, délai relatif...) — à vérifier précisément">≈ estimée</span>`
      : '';
    chip.innerHTML = `
      <div class="chip-top">
        <label class="switch small">
          <input type="checkbox" ${item.active ? 'checked' : ''} onchange="toggleChipActive('${item.iso}', this.checked)">
          <span class="slider"></span>
        </label>
        <span class="date-text">${escapeHtml(item.label)}</span>
        ${badgeApprise}
        ${badgeApprox}
        ${boutonVoir}
      </div>
      <span class="ctx">${escapeHtml(item.contexte)}</span>
      <span class="assign-btns">
        <button type="button" class="${btnClass(item.suggestion === 'pret' ? 'pret' : null)}" onclick="assignerDate('${item.iso}','pret')">Prêt</button>
        <button type="button" class="${btnClass(item.suggestion === 'acte' ? 'acte' : null)}" onclick="assignerDate('${item.iso}','acte')">Acte</button>
        <button type="button" class="${btnClass(item.suggestion === 'ventebien' ? 'ventebien' : null)}" onclick="assignerDate('${item.iso}','ventebien')">Vente</button>
        <button type="button" class="${btnClass(item.suggestion === 'autre' ? 'autre' : null)}" onclick="ajouterAutre('${item.iso}')">Autre</button>
      </span>`;
    return chip;
  }

  function renderChips() {
    const box = document.getElementById('chips');
    box.innerHTML = '';
    if (detectedDates.length === 0) {
      box.innerHTML = '<span style="font-size:13px;color:var(--muted);">Aucune date reconnue pour l\u2019instant.</span>';
      return;
    }

    const identifiees = detectedDates.filter(d => d.suggestion);
    const nonIdentifiees = detectedDates.filter(d => !d.suggestion);

    if (identifiees.length > 0) {
      const titre = document.createElement('div');
      titre.className = 'chips-groupe-titre';
      titre.textContent = `Classées — Prêt / Acte / Vente / Autre (${identifiees.length})`;
      box.appendChild(titre);
      const groupe = document.createElement('div');
      groupe.className = 'chips-groupe';
      identifiees.forEach(item => groupe.appendChild(creerChip(item)));
      box.appendChild(groupe);
    }

    if (nonIdentifiees.length > 0) {
      const titre = document.createElement('div');
      titre.className = 'chips-groupe-titre';
      titre.textContent = `Non identifiées, désactivées par défaut (${nonIdentifiees.length})`;
      box.appendChild(titre);
      const groupe = document.createElement('div');
      groupe.className = 'chips-groupe';
      nonIdentifiees.forEach(item => groupe.appendChild(creerChip(item)));
      box.appendChild(groupe);
    }
  }

  function toggleChipActive(iso, actif) {
    const item = detectedDates.find(d => d.iso === iso);
    if (item) item.active = actif;
    renderChips();
  }

  function assignerDate(iso, type) {
    document.getElementById('f-' + type).value = iso;
    definirEcheanceActive(type, true);
    // Si l'outil s'était trompé (ou n'avait rien deviné), le clic vaut correction : le chip
    // change de catégorie et de couleur en conséquence, au lieu de garder l'ancienne suggestion.
    const item = detectedDates.find(d => d.iso === iso);
    if (item) {
      // Mémorisé seulement si le clic change réellement quelque chose : inutile de retenir un
      // clic qui ne fait que confirmer ce que l'outil avait déjà bien deviné.
      if (item.suggestion !== type) memoriserCorrection(item.contexte, type, null);
      item.suggestion = type;
      item.active = true;
      // Un clic explicite sur un chip lève l'ambiguïté : l'utilisateur vient de trancher lui-même.
      // Le caractère approximatif de la date, lui, reste (voir ajouter() dans detecterDatesDepuisTexte) :
      // choisir la catégorie ne rend pas une date calculée plus précise.
      if (type === 'pret' || type === 'acte' || type === 'ventebien') {
        pageParType[type] = item.page;
        ambiguiteParType[type] = false;
        approxParType[type] = !!item.approx;
      }
      renderChips();
    }
  }

  // Dernier recours si le texte et l'OCR échouent tous les deux : la date d'enregistrement du
  // fichier PDF (souvent mise à jour au moment de la signature électronique) donne une estimation
  // raisonnable — comme le ferait quelqu'un consultant les propriétés du fichier faute de mieux.
  async function dateDepuisMetadonnees(pdf) {
    try {
      const meta = await pdf.getMetadata();
      const brut = (meta.info && (meta.info.ModDate || meta.info.CreationDate)) || '';
      const m = brut.match(/D:(\d{4})(\d{2})(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    } catch (e) {
      console.error('Erreur lecture métadonnées PDF', e);
    }
    return null;
  }

  // Lit une page du PDF comme une image et tente d'y reconnaître du texte (OCR), pour les
  // signatures manuscrites ou intégrées en image que l'extraction de texte ne peut pas voir.
  // Le worker (voir creerWorkerOcr) est créé une seule fois par import de PDF et réutilisé pour
  // toutes les pages à analyser, plutôt que d'être recréé à chaque page — le recréer à chaque
  // appel rechargeait inutilement le modèle de langue à chaque page (API Tesseract.js v1).
  async function ocrPage(pdf, numeroPage, worker) {
    const DELAI_MAX_OCR = 30000; // 30 s : au-delà, on abandonne plutôt que de bloquer l'interface
    try {
      const page = await pdf.getPage(numeroPage);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!worker) return '';

      // La reconnaissance d'image peut ne jamais rendre la main (bibliothèque indisponible ou
      // bloquée) : sans garde-fou, l'attente est infinie et l'indicateur de progression tourne
      // sans fin. On borne donc l'opération dans le temps.
      const resultat = await Promise.race([
        worker.recognize(canvas),
        new Promise(resolve => setTimeout(() => resolve(null), DELAI_MAX_OCR))
      ]);
      return (resultat && resultat.data && resultat.data.text) ? resultat.data.text : '';
    } catch (e) {
      console.error('Erreur OCR', e);
      return '';
    }
  }

  // Crée le worker Tesseract une seule fois par import de PDF (voir traiterFichierPdf) : le modèle
  // de langue française n'est ainsi téléchargé/initialisé qu'une fois, même si plusieurs pages
  // doivent être passées à l'OCR pour retrouver la date de signature. Le tout premier chargement
  // du modèle peut être lent (téléchargement) : on lui laisse plus de temps qu'à une page unique.
  const DELAI_MAX_INIT_OCR = 45000;
  async function creerWorkerOcr() {
    if (!window.Tesseract) return null;
    try {
      return await Promise.race([
        Tesseract.createWorker('fra'),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('délai d’initialisation OCR dépassé')), DELAI_MAX_INIT_OCR))
      ]);
    } catch (e) {
      console.error('Initialisation OCR impossible', e);
      return null;
    }
  }

  // Un simple renvoi « Annexe n°1 » au fil d'une clause (ex. LD Notaires : « Un extrait de plan
  // cadastral est annexé. Annexe n°1 », en milieu de page, au milieu du corps de l'acte) ne marque
  // PAS le début des pages d'annexes elles-mêmes : beaucoup de trames listent ainsi, dans le corps
  // même de l'acte, les pièces qui accompagnent la vente — sans que ces pièces soient jointes au
  // même PDF (cas réel signalé : le corps allait jusqu'à la signature page 52, mais l'extraction
  // s'arrêtait dès la page 6 à cause d'un renvoi de ce type page 7 — la numérotation des annexes
  // remet même à 1 plusieurs fois dans le document, une par thème). Une page qui commence
  // réellement une pièce jointe (scan de plan, diagnostic…) porte cette mention en tout début de
  // page et contient très peu d'autre texte extractible — à l'inverse d'une clause de plusieurs
  // milliers de caractères qui la cite juste en passant.
  function estDebutPageAnnexe(texteBrut) {
    const m = texteBrut.match(/annexe\s*n[°ºo]?\s*1\b/i);
    if (!m) return false;
    return m.index < 120 || texteBrut.trim().length < 300;
  }

  // Isole le compromis lui-même (+ sa page de signatures) et s'arrête dès la première vraie page
  // d'annexe (voir estDebutPageAnnexe ci-dessus) : un dossier signé électroniquement peut compter
  // plusieurs centaines de pages de diagnostics et autres pièces jointes qui ne nous intéressent
  // ni pour la détection, ni pour l'aperçu.
  async function extraireTextesUtiles(pdf) {
    const textesParPage = [];
    let dernierePageNumerotee = null;
    const PLAFOND_SECURITE = 60;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const texteBrut = content.items.map(it => it.str).join(' ');
      textesParPage.push(texteBrut);
      // Le compromis fait rarement plus de 60 pages : on rapporte la progression à ce repère
      // plutôt qu'au total du dossier (qui peut compter des centaines de pages d'annexes).
      majProgression(Math.min(95, (i / Math.min(pdf.numPages, PLAFOND_SECURITE)) * 100));

      if (!dernierePageNumerotee) {
        const mPage = texteBrut.match(/page\s+(\d+)\s+sur\s+(\d+)/i);
        if (mPage && mPage[1] === mPage[2]) dernierePageNumerotee = i;
      }

      // Dès qu'une vraie page d'annexe commence, tout ce qui suit est écarté (diagnostics, plans…).
      if (estDebutPageAnnexe(texteBrut)) {
        return { textesParPage, dernierePageUtile: Math.max(1, i - 1) };
      }

      if (i >= PLAFOND_SECURITE * 2) break; // filet de sécurité pour un document sans annexe repérable
    }

    const dernierePageUtile = dernierePageNumerotee
      ? Math.min(dernierePageNumerotee + 3, textesParPage.length) // + quelques pages de certificat/signature
      : textesParPage.length;
    return { textesParPage, dernierePageUtile };
  }

  // ---- visualiseur PDF (aperçu du compromis à côté du formulaire, en défilement continu) ----

  // Calcule, pour chaque page, l'index de fin (exclusif) de son texte dans le texte concaténé —
  // permet ensuite de retrouver sur quelle page se trouve une date détectée.
  function calculerFrontieresPages(textesParPage, dernierePageUtile) {
    const frontieres = [];
    let cumul = 0;
    for (let i = 0; i < dernierePageUtile; i++) {
      cumul += textesParPage[i].length + 1; // +1 pour le séparateur '\n'
      frontieres.push(cumul);
    }
    return frontieres;
  }

  function pageDepuisIndex(index) {
    if (!frontieresPagesActuelles) return null;
    for (let i = 0; i < frontieresPagesActuelles.length; i++) {
      if (index < frontieresPagesActuelles[i]) return i + 1;
    }
    return frontieresPagesActuelles.length || null;
  }

  // Affiche toutes les pages utiles du compromis les unes sous les autres (défilement continu).
  async function chargerToutesLesPagesPdf() {
    if (!pdfActuel) return;
    const conteneur = document.getElementById('pdf-pages-container');
    conteneur.innerHTML = '';
    const largeurDispo = (conteneur.clientWidth || 360) - 20;

    for (let numero = 1; numero <= pdfDernierePageUtile; numero++) {
      const page = await pdfActuel.getPage(numero);
      const viewportBase = page.getViewport({ scale: 1 });
      const echelle = largeurDispo / viewportBase.width;
      const viewport = page.getViewport({ scale: echelle });

      const bloc = document.createElement('div');
      bloc.className = 'pdf-page-bloc';
      bloc.id = 'pdf-page-bloc-' + numero;

      const canvas = document.createElement('canvas');
      canvas.id = 'pdf-page-' + numero;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const legende = document.createElement('div');
      legende.className = 'pdf-page-numero';
      legende.textContent = `Page ${numero} / ${pdfDernierePageUtile}`;

      bloc.appendChild(canvas);
      bloc.appendChild(legende);
      conteneur.appendChild(bloc);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  }

  // Fait défiler l'aperçu jusqu'à la page indiquée et surligne brièvement le texte de la date
  // (ex. "5 novembre 2026") pour la retrouver immédiatement dans le document original.
  async function voirDateDansPdf(numeroPage, texteDate) {
    if (!pdfActuel || !numeroPage) return;
    const bloc = document.getElementById('pdf-page-bloc-' + numeroPage);
    const canvas = document.getElementById('pdf-page-' + numeroPage);
    if (!bloc || !canvas) return;
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      const page = await pdfActuel.getPage(numeroPage);
      const content = await page.getTextContent();
      const echelle = canvas.width / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: echelle });

      // Le dernier mot de la date (souvent l'année) est en général assez unique sur la page.
      const tokens = String(texteDate).trim().split(/\s+/).filter(Boolean);
      const cible = tokens[tokens.length - 1];
      const item = content.items.find(it => it.str && it.str.includes(cible));
      if (!item) return;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const hauteur = Math.hypot(tx[2], tx[3]) || 14;
      const largeur = (item.width || 0) * echelle;
      const x = tx[4];
      const yBase = tx[5];

      document.querySelectorAll('.pdf-highlight').forEach(h => h.remove());
      const surlignage = document.createElement('div');
      surlignage.className = 'pdf-highlight';
      surlignage.style.left = Math.max(0, x - 4) + 'px';
      surlignage.style.top = Math.max(0, yBase - hauteur - 2) + 'px';
      surlignage.style.width = (largeur + 8) + 'px';
      surlignage.style.height = (hauteur + 6) + 'px';
      bloc.appendChild(surlignage);
      setTimeout(() => surlignage.classList.add('fondu'), 3000);
      setTimeout(() => surlignage.remove(), 3700);
    } catch (e) {
      console.error('Surlignage impossible', e);
    }
  }

  async function gererUploadPdf(event) {
    const file = event.target.files[0];
    if (file) await traiterFichierPdf(file);
  }

  function gererSurvolDepot(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.add('survol');
  }

  function gererQuitteDepot(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.remove('survol');
  }

  async function gererDepotPdf(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.remove('survol');
    const fichiers = event.dataTransfer && event.dataTransfer.files;
    if (!fichiers || fichiers.length === 0) return;
    const file = fichiers[0];
    const status = document.getElementById('pdf-status');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      status.className = 'pdf-status err';
      status.textContent = `« ${file.name} » n'est pas un fichier PDF.`;
      return;
    }
    // Synchronise le champ de fichier natif, pour rester cohérent si le formulaire est réinitialisé.
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('f-pdf').files = dt.files;
    } catch (e) { /* DataTransfer non disponible sur certains navigateurs : sans conséquence */ }
    await traiterFichierPdf(file);
  }

  async function traiterFichierPdf(file) {
    const status = document.getElementById('pdf-status');

    if (!window.pdfjsLib) {
      status.className = 'pdf-status err';
      status.textContent = "Lecture PDF indisponible — réessayez dans un instant.";
      return;
    }

    status.className = 'pdf-status loading';
    status.textContent = `Lecture de « ${file.name} » en cours…`;
    majProgression(2);

    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: buffer,
        verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0)
      }).promise;
      const { textesParPage, dernierePageUtile } = await extraireTextesUtiles(pdf);
      const texteComplet = textesParPage.slice(0, dernierePageUtile).join('\n');
      frontieresPagesActuelles = calculerFrontieresPages(textesParPage, dernierePageUtile);
      pageParType = { pret: null, acte: null, ventebien: null };
      ambiguiteParType = { pret: false, acte: false, ventebien: false };
      approxParType = { pret: false, acte: false, ventebien: false };
      vuePdfViewerActuelle = 'apercu';
      traiterTexte(texteComplet);
      // Bascule automatiquement vers l'étape "Vérifier" : les dates/chips sont déjà là, plus besoin
      // de cliquer soi-même sur "Suivant" après un import qui vient de réussir.
      definirEtapeWizard(2);

      // Ouvre le panneau d'aperçu, à côté du formulaire, limité au compromis (annexes exclues).
      pdfActuel = pdf;
      pdfDernierePageUtile = dernierePageUtile;
      document.getElementById('pdf-viewer').style.display = 'flex';
      document.getElementById('pdf-viewer-title').textContent =
        `${file.name} — compromis (${dernierePageUtile} page${dernierePageUtile > 1 ? 's' : ''} sur ${pdf.numPages}, annexes non affichées)`;
      await chargerToutesLesPagesPdf();

      // Si la date de signature n'a pas été trouvée dans le texte, elle est peut-être manuscrite
      // ou intégrée en image (cas fréquent : bloc de signature électronique Yousign/DocuSign en
      // image, sur la page qui suit immédiatement la mention « Fait à … signé électroniquement »).
      if (!dateCompromisDetectee) {
        const idxSignature = textesParPage.findIndex(t => /sign[ée]\s+[ée]lectroniquement|date\s+et\s+signatures/i.test(t));
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
            status.className = 'pdf-status loading';
            status.textContent = `Date de signature non trouvée dans le texte — lecture de l'image page ${numeroPage} (15 à 30 s)…`;
            majProgression(null);
            const texteOcr = await ocrPage(pdf, numeroPage, workerOcr);
            const isoOcr = detecterDateCompromis(texteOcr);
            if (isoOcr) {
              dateCompromisDetectee = isoOcr;
              dateCompromisEstimee = false;
              majAffichageCompromis();
              detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
              renderChips();
              break;
            }
          }
        } finally {
          if (workerOcr) await workerOcr.terminate();
        }

        // Dernier recours : la date d'enregistrement du fichier (souvent mise à jour au moment de
        // la signature électronique) donne une estimation raisonnable, à vérifier par l'agence.
        if (!dateCompromisDetectee) {
          const isoMeta = await dateDepuisMetadonnees(pdf);
          if (isoMeta) {
            dateCompromisDetectee = isoMeta;
            dateCompromisEstimee = true;
            majAffichageCompromis();
            detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
            renderChips();
          }
        }
      }

      majProgression(-1);
      const nbFinal = detectedDates.length;
      let suffixe = '';
      if (!dateCompromisDetectee) suffixe = ' — date de signature à renseigner';
      else if (dateCompromisEstimee) suffixe = ' — date de signature à vérifier';
      status.className = 'pdf-status ok';
      status.textContent = `✓ ${dernierePageUtile} page${dernierePageUtile > 1 ? 's' : ''} lue${dernierePageUtile > 1 ? 's' : ''} (annexes ignorées) — ${nbFinal} échéance${nbFinal > 1 ? 's' : ''} détectée${nbFinal > 1 ? 's' : ''}${suffixe}.`;
    } catch (e) {
      console.error(e);
      status.className = 'pdf-status err';
      status.textContent = `Impossible de lire « ${file.name} » (fichier scanné ou protégé).`;
    } finally {
      // Garantit l'arrêt de l'indicateur quel que soit le chemin emprunté (succès, erreur, abandon).
      majProgression(-1);
    }
  }

  // ---- gestion des échéances "Autre" ----

  function ajouterAutre(iso) {
    compteurAutre++;
    let page = null;
    let labelSuggere = '';
    if (iso) {
      const item = detectedDates.find(d => d.iso === iso);
      if (item) {
        // Voir le commentaire équivalent dans assignerDate() : mémorisé seulement si le clic
        // change réellement la catégorie devinée.
        if (item.suggestion !== 'autre') memoriserCorrection(item.contexte, 'autre', libelleAutreSuggere(item.contexte) || null);
        item.suggestion = 'autre';
        item.active = true;
        page = item.page;
        labelSuggere = item.libelleAppris || libelleAutreSuggere(item.contexte);
      }
    }
    autresEnCours.push({ id: 'autre-' + compteurAutre, label: labelSuggere, iso: iso || '', active: true, page });
    renderAutres();
    renderChips();
  }

  function ajouterAutreVide() {
    ajouterAutre('');
  }

  function majAutreLabel(id, valeur) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.label = valeur;
  }

  function majAutreDate(id, valeur) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.iso = valeur;
  }

  function toggleAutreActive(id, actif) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.active = actif;
    renderAutres();
  }

  function supprimerAutre(id) {
    autresEnCours = autresEnCours.filter(a => a.id !== id);
    renderAutres();
  }

  function renderAutres() {
    const container = document.getElementById('autres-list');
    container.innerHTML = autresEnCours.map(item => `
      <div class="date-block autre${item.active ? '' : ' inactive'}">
        <div class="autre-row">
          <label class="switch">
            <input type="checkbox" ${item.active ? 'checked' : ''} onchange="toggleAutreActive('${item.id}', this.checked)">
            <span class="slider"></span>
          </label>
          <input type="text" placeholder="Nom de l'échéance (ex. Levée de la condition suspensive travaux)" value="${escapeHtml(item.label)}" oninput="majAutreLabel('${item.id}', this.value)">
          <input type="date" value="${item.iso}" onchange="majAutreDate('${item.id}', this.value)">
          <button type="button" class="icon-btn" onclick="supprimerAutre('${item.id}')">Retirer</button>
        </div>
      </div>
    `).join('');
  }

  function reinitialiserFormulaire() {
    masquerErreurFormulaire();
    document.getElementById('f-nom').value = '';
    document.getElementById('f-responsable').value = '';
    document.getElementById('f-email-acquereur').value = '';
    document.getElementById('f-email').value = EMAIL_RAPPEL_DEFAUT;
    document.getElementById('f-pret').value = '';
    document.getElementById('f-acte').value = '';
    document.getElementById('f-pdf').value = '';
    document.getElementById('pdf-status').textContent = '';
    document.getElementById('pdf-status').className = 'pdf-status';
    document.getElementById('compromis-info').style.display = 'none';
    document.getElementById('f-date-compromis').style.display = 'none';
    document.getElementById('cash-note').style.display = 'none';
    definirEcheanceActive('pret', true);
    definirEcheanceActive('acte', true);
    definirEcheanceActive('ventebien', false);
    dateCompromisDetectee = '';
    dateCompromisEstimee = false;
    dernierTexteTraite = '';
    detectedDates = [];
    autresEnCours = [];
    analyseJuridiqueActuelle = { documents: [], engagements: [], conditions: [] };
    analyseJuridiqueDisponible = false;
    document.getElementById('pdf-viewer-tabs').style.display = 'none';
    definirVuePdfViewer('apercu');
    // Referme entièrement le panneau d'aperçu : sans ça, le PDF du dossier qu'on vient d'enregistrer
    // restait affiché à côté d'un formulaire pourtant vide, prêt pour un nouvel import.
    document.getElementById('pdf-viewer').style.display = 'none';
    document.getElementById('pdf-viewer-title').textContent = 'Aperçu du compromis';
    document.getElementById('pdf-pages-container').innerHTML = '';
    pdfActuel = null;
    pdfDernierePageUtile = 1;
    frontieresPagesActuelles = null;
    reinitialiserRappelsParDefaut();
    renderChips();
    renderAutres();
    definirEtapeWizard(1);
  }

  // Les cases de rappel gardaient l'état du dossier précédent : on les remet explicitement sur
  // les valeurs par défaut (15 et 7 jours avant) à chaque nouveau dossier.
  const RAPPELS_PAR_DEFAUT = ['15', '7'];

  function reinitialiserRappelsParDefaut() {
    document.querySelectorAll('#reminder-days input[type="checkbox"]').forEach(box => {
      box.checked = RAPPELS_PAR_DEFAUT.includes(box.value);
    });
  }

  function getSelectedReminderDays() {
    const boxes = document.querySelectorAll('#reminder-days input[type="checkbox"]');
    const days = [];
    boxes.forEach(b => { if (b.checked) days.push(parseInt(b.value, 10)); });
    return days.sort((a, b) => b - a);
  }

  async function ajouterDossier() {
    const nom = document.getElementById('f-nom').value.trim();
    const email = document.getElementById('f-email').value.trim();
    const responsable = document.getElementById('f-responsable').value.trim();
    const emailAcquereur = document.getElementById('f-email-acquereur').value.trim();
    const pret = echeanceActive.pret ? document.getElementById('f-pret').value : '';
    const acte = echeanceActive.acte ? document.getElementById('f-acte').value : '';
    const ventebien = echeanceActive.ventebien ? document.getElementById('f-ventebien').value : '';
    const autres = autresEnCours
      .filter(a => a.active && a.iso)
      .map(a => ({ label: a.label.trim() || 'Autre échéance', date: a.iso, page: a.page || null }));

    if (!nom) { afficherErreurFormulaire('Indiquez un nom de dossier.'); return; }
    if (!pret && !acte && !ventebien && autres.length === 0) { afficherErreurFormulaire('Renseignez au moins une date butoir active.'); return; }
    masquerErreurFormulaire();

    // "auto" = date reprise d'un chip détecté dans le texte ; "manuel" = saisie/correction à la
    // main ; "incertain" = choisie automatiquement parmi plusieurs candidates de même catégorie
    // sans formulation de délai pour trancher (voir meilleureCandidateEcheance) — à vérifier avant
    // les autres dates "auto" ; "estime" = calculée à partir d'une formulation approximative
    // ("fin septembre", délai relatif...) plutôt que lue telle quelle dans le texte.
    function confianceType(valeur, type) {
      if (!valeur) return null;
      if (!pageParType[type]) return 'manuel';
      if (approxParType[type]) return 'estime';
      return ambiguiteParType[type] ? 'incertain' : 'auto';
    }
    const confiance = {
      pret: confianceType(pret, 'pret'),
      acte: confianceType(acte, 'acte'),
      ventebien: confianceType(ventebien, 'ventebien')
    };

    const dossier = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      nom, email, responsable, emailAcquereur,
      dossierLie: false,
      offrePretStatut: 'inconnu',
      accesAReconfirmer: false,
      derniereRelanceAuto: null,
      pret, acte, ventebien, autres,
      pretPage: pret ? pageParType.pret : null,
      actePage: acte ? pageParType.acte : null,
      ventebienPage: ventebien ? pageParType.ventebien : null,
      pdfNumPages: pdfDernierePageUtile,
      sansPret: !echeanceActive.pret,
      reminderDays: getSelectedReminderDays(),
      confiance,
      archive: false,
      analyseJuridique: {
        documents: analyseJuridiqueActuelle.documents.slice(),
        engagements: analyseJuridiqueActuelle.engagements.slice(),
        conditions: (analyseJuridiqueActuelle.conditions || []).slice()
      },
      historique: [{ date: new Date().toISOString(), texte: 'Dossier créé' }]
    };

    dossiers.push(dossier);
    await sauvegarder();
    reinitialiserFormulaire();
    document.getElementById('panel').open = false;
    definirOnglet('suivi');
  }

  // Modale de confirmation maison : window.confirm() est souvent bloqué dans un aperçu en
  // bac à sable (iframe), ce qui empêchait la suppression de fonctionner silencieusement.
  let actionConfirmee = null;

  function demanderConfirmation(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    actionConfirmee = onConfirm;
    document.getElementById('confirm-overlay').style.display = 'flex';
  }

  // Message de validation intégré à la page (remplace window.alert(), lui aussi souvent bloqué
  // dans un aperçu en bac à sable).
  function afficherErreurFormulaire(message) {
    const el = document.getElementById('form-error');
    el.textContent = message;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function masquerErreurFormulaire() {
    document.getElementById('form-error').style.display = 'none';
  }

  function annulerConfirmation() {
    actionConfirmee = null;
    document.getElementById('confirm-overlay').style.display = 'none';
  }

  document.getElementById('confirm-btn-ok').addEventListener('click', () => {
    const action = actionConfirmee;
    annulerConfirmation();
    if (action) action();
  });

  let dernierSupprime = null;
  let dernierSupprimeTimeout = null;

  function afficherToast(message, texteBouton, onUndo) {
    clearTimeout(dernierSupprimeTimeout);
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    const btn = document.getElementById('toast-undo-btn');
    btn.textContent = texteBouton;
    btn.onclick = () => {
      clearTimeout(dernierSupprimeTimeout);
      toast.style.display = 'none';
      if (onUndo) onUndo();
    };
    toast.style.display = 'flex';
    dernierSupprimeTimeout = setTimeout(() => { toast.style.display = 'none'; }, 6000);
  }

  async function supprimerDossier(id) {
    const d = dossiers.find(x => x.id === id);
    const nom = d ? d.nom : 'ce dossier';
    demanderConfirmation(`Supprimer « ${nom} » du registre ?`, async () => {
      const index = dossiers.findIndex(x => x.id === id);
      if (index === -1) return;
      dernierSupprime = dossiers[index];
      dossiers = dossiers.filter(x => x.id !== id);
      await sauvegarder();
      render();
      afficherToast(`Dossier « ${nom} » supprimé.`, 'Annuler', async () => {
        if (dernierSupprime) {
          dossiers.push(dernierSupprime);
          dernierSupprime = null;
          await sauvegarder();
          render();
        }
      });
    });
  }

  function joursRestants(iso) {
    if (!iso) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(iso + 'T00:00:00');
    const diffMs = target - today;
    return Math.round(diffMs / 86400000);
  }

  function formatDateFr(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function optionsCategorie(typeActuel) {
    const options = [
      ['pret', 'Obtention du prêt'],
      ['acte', "Signature de l'acte"],
      ['ventebien', 'Vente préalable']
    ];
    return options.map(([val, texte]) =>
      `<option value="${val}" ${val === typeActuel ? 'selected' : ''}>${texte}</option>`
    ).join('');
  }

  function renderTab(type, label, iso, dossierId, page, confiance, autreIndex) {
    // Les tabs Prêt / Acte / Vente d'un dossier enregistré sont recatégorisables au clic ;
    // les échéances "Autre" gardent leur libellé personnalisé (non concerné par ce sélecteur).
    const recategorisable = dossierId && autreIndex == null && (type === 'pret' || type === 'acte' || type === 'ventebien');
    const enTete = recategorisable
      ? `<select class="tab-select" onchange="changerCategorie('${dossierId}','${type}', this.value)">${optionsCategorie(type)}</select>`
      : `<div class="tab-name">${label}</div>`;

    // Retrouve la date dans l'aperçu PDF (uniquement si le PDF encore chargé est bien celui d'origine).
    const boutonVoir = (iso && page && pdfActuel)
      ? `<button type="button" class="voir-pdf-btn" onclick="voirDateDansPdf(${page}, '${iso.split('-')[0]}')">👁 Voir p.${page}</button>`
      : '';

    // Indique si la date vient du texte détecté automatiquement sans ambiguïté (fiable), a été
    // choisie parmi plusieurs candidates sans formulation de délai pour trancher (à vérifier en
    // priorité — voir meilleureCandidateEcheance), ou vient d'une saisie/correction manuelle.
    const LIBELLES_CONFIANCE = {
      auto: { titre: 'Repérée automatiquement dans le texte', texte: '📄 texte' },
      estime: { titre: 'Calculée à partir d’une formulation approximative ("fin septembre", délai relatif...) — à vérifier précisément', texte: '≈ estimée' },
      incertain: { titre: 'Choisie parmi plusieurs dates possibles dans le texte — à vérifier en priorité', texte: '⚠️ à vérifier' },
      manuel: { titre: 'Saisie ou corrigée manuellement', texte: '✍️ manuel' }
    };
    const badgeConfiance = (confiance && LIBELLES_CONFIANCE[confiance])
      ? `<span class="badge-confiance ${confiance}" title="${LIBELLES_CONFIANCE[confiance].titre}">${LIBELLES_CONFIANCE[confiance].texte}</span>`
      : '';

    // Une date d'un dossier déjà enregistré reste corrigeable après coup (erreur repérée plus
    // tard) : crayon → champ date natif → valider, même mécanisme que le nom du dossier. cleEdition
    // identifie la cible de validerEditionDate() : le type directement pour pret/acte/ventebien,
    // l'index dans d.autres pour une échéance personnalisée (pas d'id stable sur ces entrées).
    const editable = dossierId != null;
    const cleEdition = autreIndex != null ? 'autre-' + autreIndex : type;
    const idBase = `tabdate-${dossierId}-${cleEdition}`;
    const editionDate = editable ? `
        <span class="tab-date-edition" id="${idBase}-edit" hidden>
          <input type="date" class="tab-date-input" id="${idBase}-input" value="${iso || ''}">
          <button type="button" class="icon-valider" onclick="validerEditionDate('${dossierId}','${cleEdition}')" title="Valider" aria-label="Valider la date">✓</button>
        </span>` : '';
    const crayonDate = editable
      ? `<button type="button" class="icon-crayon" onclick="activerEditionDate('${dossierId}','${cleEdition}')" title="Corriger cette date" aria-label="Corriger cette date">✏️</button>`
      : '';

    if (!iso) {
      return `<div class="tab ${type}">
        ${enTete}
        <span class="tab-date-affichage" id="${idBase}-aff"><div class="tab-date">Non renseigné</div>${crayonDate}</span>
        ${editionDate}
      </div>`;
    }
    const jours = joursRestants(iso);
    let countdownClass = '';
    let countdownText = '';
    if (jours < 0) {
      countdownClass = 'passed';
      countdownText = 'Échéance dépassée';
    } else if (jours === 0) {
      countdownClass = 'urgent';
      countdownText = "Aujourd'hui";
    } else {
      countdownText = `J-${jours}`;
      if (jours <= 3) countdownClass = 'urgent';
    }
    return `<div class="tab ${type}">
      ${enTete}
      <span class="tab-date-affichage" id="${idBase}-aff"><div class="tab-date">${formatDateFr(iso)}${boutonVoir}</div>${crayonDate}</span>
      ${editionDate}
      <div class="tab-countdown ${countdownClass}">${countdownText}${badgeConfiance}</div>
    </div>`;
  }

  // Échange le contenu de deux échéances fixes d'un dossier (aucune perte de données : si la
  // catégorie cible avait déjà une date, elle prend la place de l'ancienne).
  const LIBELLES_CATEGORIE = { pret: 'Obtention du prêt', acte: "Signature de l'acte", ventebien: 'Vente préalable' };

  function ajouterHistorique(d, texte) {
    d.historique = d.historique || [];
    d.historique.push({ date: new Date().toISOString(), texte });
  }

  function changerCategorie(dossierId, ancienType, nouveauType) {
    if (ancienType === nouveauType) return;
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const temp = d[nouveauType] || '';
    d[nouveauType] = d[ancienType] || '';
    d[ancienType] = temp;

    d.confiance = d.confiance || {};
    const tempC = d.confiance[nouveauType] || null;
    d.confiance[nouveauType] = d.confiance[ancienType] || 'manuel';
    d.confiance[ancienType] = tempC;

    ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[ancienType]} » recatégorisée en « ${LIBELLES_CATEGORIE[nouveauType]} »`);
    sauvegarder();
    render();
  }

  function calculerProchaineEcheance(d) {
    const autresDates = (d.autres || []).map(a => a.date);
    const dates = [d.pret, d.acte, d.ventebien, ...autresDates].filter(Boolean).map(joursRestants);
    const upcoming = dates.filter(j => j >= 0);
    return upcoming.length ? Math.min(...upcoming) : (dates.length ? Math.min(...dates) : 999999);
  }

  function toggleHistorique(id) {
    const el = document.getElementById('historique-' + id);
    if (el) el.classList.toggle('ouvert');
  }

  function archiverDossier(id, archive) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    d.archive = archive;
    ajouterHistorique(d, archive ? 'Dossier archivé' : 'Dossier désarchivé');
    sauvegarder();
    render();
  }

  function renderDashboard(dossiersActifs) {
    const bloc = document.getElementById('dashboard');
    const liste = document.getElementById('dashboard-liste');
    const echeances = [];
    dossiersActifs.forEach(d => {
      const items = [
        { type: 'pret', label: 'Obtention du prêt', iso: d.pret },
        { type: 'acte', label: "Signature de l'acte", iso: d.acte },
        { type: 'ventebien', label: 'Vente préalable', iso: d.ventebien },
        ...(d.autres || []).map(a => ({ type: 'autre', label: a.label, iso: a.date }))
      ];
      items.forEach(it => {
        if (!it.iso) return;
        const jours = joursRestants(it.iso);
        if (jours >= 0 && jours <= 7) echeances.push({ ...it, jours, nomDossier: d.nom });
      });
    });
    echeances.sort((a, b) => a.jours - b.jours);

    if (echeances.length === 0) {
      bloc.style.display = 'none';
      return;
    }
    bloc.style.display = 'block';
    liste.innerHTML = echeances.map(e => `
      <div class="dashboard-ligne">
        <span class="dashboard-pastille ${e.type}"></span>
        <span class="dashboard-jours">${e.jours === 0 ? "Auj." : 'J-' + e.jours}</span>
        <span class="dashboard-texte"><b>${escapeHtml(e.label)}</b> — ${escapeHtml(e.nomDossier)} (${formatDateFr(e.iso)})</span>
      </div>
    `).join('');
  }

  // Bandeau de synthèse en tête de l'onglet "Suivi des dossiers" : donne un état global du
  // portefeuille (dossiers actifs, hors filtres/recherche de la liste) avant de la parcourir.
  function renderStatsSuivi(dossiersActifs) {
    const bloc = document.getElementById('stats-suivi');
    if (!bloc) return;

    const urgents = dossiersActifs.filter(d => {
      const prochaine = prochaineEcheanceDetail(d);
      return prochaine && prochaine.jours <= 7;
    }).length;
    const avecPret = dossiersActifs.filter(d => !d.sansPret);
    const manquantes = avecPret.filter(d => d.offrePretStatut === 'manquante').length;
    const aVerifier = avecPret.filter(d => (d.offrePretStatut || 'inconnu') === 'inconnu').length;

    const tuiles = [
      ['c-neutre', dossiersActifs.length, dossiersActifs.length > 1 ? 'dossiers actifs' : 'dossier actif'],
      ['c-urgent', urgents, 'échéances ≤ 7 jours'],
      ['c-pret', manquantes, 'offres de prêt introuvables'],
      ['c-neutre', aVerifier, 'offres à vérifier']
    ];
    bloc.innerHTML = tuiles.map(([cls, valeur, libelle]) =>
      `<div class="stat-tile"><div class="stat-num ${cls}">${valeur}</div><div class="stat-label">${libelle}</div></div>`
    ).join('');
  }

  // Bascule entre les deux espaces de travail : « Nouveau dossier » (formulaire + aperçu PDF) et
  // « Suivi des dossiers » (liste complète, en pleine largeur). Choix non persisté : l'app rouvre
  // toujours sur « Nouveau dossier », cohérent avec le panneau replié/déplié qui n'est pas non
  // plus mémorisé d'une session à l'autre.
  // Les 3 étapes du formulaire "Nouveau dossier" (Importer / Vérifier / Finaliser) sont de simples
  // panneaux affichés un par un — aucune étape n'est verrouillée tant que la précédente n'est pas
  // remplie : un dossier peut toujours être créé entièrement à la main, sans jamais importer de PDF,
  // exactement comme avant ce découpage en étapes. Seule la présentation change.
  let etapeWizardActuelle = 1;
  function definirEtapeWizard(n) {
    etapeWizardActuelle = n;
    for (let i = 1; i <= 3; i++) {
      document.getElementById('wizard-step-' + i).classList.toggle('actif', i === n);
      document.getElementById('wizard-step-btn-' + i).classList.toggle('actif', i === n);
    }
    const wrap = document.querySelector('.wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function definirOnglet(nom) {
    document.getElementById('onglet-nouveau').style.display = nom === 'nouveau' ? '' : 'none';
    document.getElementById('onglet-suivi').style.display = nom === 'suivi' ? '' : 'none';
    document.getElementById('tab-nouveau').setAttribute('aria-selected', String(nom === 'nouveau'));
    document.getElementById('tab-suivi').setAttribute('aria-selected', String(nom === 'suivi'));
    if (nom === 'suivi') render();
  }

  // État d'affichage de la liste (recherche, filtres, vue) : réinitialisé à chaque rechargement de
  // la page, comme le tri ou l'affichage des archives — pas besoin de le persister.
  let vueDossiers = 'cartes';
  function definirVue(v) {
    vueDossiers = v;
    document.getElementById('btn-vue-cartes').setAttribute('aria-pressed', String(v === 'cartes'));
    document.getElementById('btn-vue-tableau').setAttribute('aria-pressed', String(v === 'tableau'));
    render();
  }

  // Détermine, parmi les échéances d'un dossier, la plus proche à afficher en un coup d'œil dans
  // la vue tableau (celle déjà retenue pour le tri par calculerProchaineEcheance, mais avec son
  // type/libellé/date en plus, pas seulement le nombre de jours).
  function prochaineEcheanceDetail(d) {
    const items = [
      { type: 'pret', label: 'Obtention du prêt', iso: d.pret },
      { type: 'acte', label: "Signature de l'acte", iso: d.acte },
      { type: 'ventebien', label: 'Vente préalable', iso: d.ventebien },
      ...(d.autres || []).map(a => ({ type: 'autre', label: a.label, iso: a.date }))
    ].filter(it => it.iso);
    if (!items.length) return null;
    const avecJours = items.map(it => ({ ...it, jours: joursRestants(it.iso) }));
    const upcoming = avecJours.filter(it => it.jours >= 0);
    const pool = upcoming.length ? upcoming : avecJours;
    return pool.reduce((a, b) => (a.jours <= b.jours ? a : b));
  }

  // Score de priorité (plus haut = plus urgent à traiter), combinant trois signaux qu'une simple
  // date d'échéance ne capture pas : la proximité de l'échéance elle-même, l'absence d'offre de
  // prêt (bloquant pour la suite du dossier), et un accès local perdu (empêche toute vérification
  // automatique tant que personne ne clique pour le reconfirmer). Seuil SEUIL_PRIORITE_ELEVEE
  // au-delà duquel le badge "Prioritaire" s'affiche (voir renderLigneTableau/renderCarteCompacte).
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
    if (d.accesAReconfirmer) score += 40;
    return score;
  }

  // Statut de synthèse ("où en est ce dossier ?"), distinct du score de priorité qui sert au tri :
  // celui-ci répond d'un coup d'œil plutôt que de classer. Le plus sévère l'emporte quand plusieurs
  // signaux coexistent (ex. offre introuvable ET échéance dépassée reste "blocage", pas cumulé).
  const LIBELLES_STATUT = {
    pret: { emoji: '🟢', texte: 'Prêt', cls: 'statut-pret' },
    aconfirmer: { emoji: '🟡', texte: 'À confirmer', cls: 'statut-aconfirmer' },
    blocage: { emoji: '🔴', texte: 'Blocage', cls: 'statut-blocage' },
    archive: { emoji: '🔒', texte: 'Archivé', cls: 'statut-archive' }
  };
  function statutDossier(d) {
    if (d.archive) return 'archive';
    const prochaine = prochaineEcheanceDetail(d);
    const echeanceDepassee = !!(prochaine && prochaine.jours < 0);
    if ((!d.sansPret && d.offrePretStatut === 'manquante') || d.accesAReconfirmer || echeanceDepassee) {
      return 'blocage';
    }
    const confiance = d.confiance || {};
    // "estime" (date calculée à partir d'une formulation approximative) mérite la même vigilance
    // que "incertain" (choisie parmi plusieurs candidates) : dans les deux cas, la date affichée
    // n'est pas une simple lecture directe du texte.
    const incertain = ['pret', 'acte', 'ventebien'].some(t => confiance[t] === 'incertain' || confiance[t] === 'estime');
    // Même périmètre que la tuile "offres à vérifier" du bandeau de stats (renderStatsSuivi) :
    // un prêt actif dont l'offre n'a jamais été confirmée, qu'un dossier local soit relié ou non.
    const offreInconnue = !d.sansPret && (d.offrePretStatut || 'inconnu') === 'inconnu';
    if (incertain || offreInconnue) return 'aconfirmer';
    return 'pret';
  }

  function renderBadgeStatut(d) {
    const s = LIBELLES_STATUT[statutDossier(d)];
    return `<span class="badge-statut ${s.cls}" title="Statut du dossier : ${s.texte}">${s.emoji} ${s.texte}</span>`;
  }

  function render() {
    const list = document.getElementById('dossier-list');
    const count = document.getElementById('dossier-count');
    const voirArchives = document.getElementById('voir-archives').checked;
    const tri = document.getElementById('tri-dossiers').value;
    const recherche = (document.getElementById('recherche-dossiers').value || '').trim().toLowerCase();
    const filtreResponsable = document.getElementById('filtre-responsable').value;
    const filtreOffre = document.getElementById('filtre-offre').value;
    const filtreType = document.getElementById('filtre-type').value;

    const dossiersActifs = dossiers.filter(d => !d.archive);
    renderDashboard(dossiersActifs);
    renderStatsSuivi(dossiersActifs);

    const dossiersVisibles = voirArchives ? dossiers : dossiersActifs;

    if (dossiers.length === 0) {
      count.textContent = '';
      list.innerHTML = '<div class="empty-state">Aucun dossier suivi pour le moment. Ajoutez votre premier dossier ci-dessus.</div>';
      return;
    }
    if (dossiersVisibles.length === 0) {
      count.textContent = '';
      list.innerHTML = '<div class="empty-state">Aucun dossier actif — tous vos dossiers sont archivés. Cochez « Afficher les dossiers archivés » pour les revoir.</div>';
      return;
    }

    const dossiersAffiches = dossiersVisibles.filter(d => {
      if (recherche && !(d.nom + ' ' + (d.responsable || '')).toLowerCase().includes(recherche)) return false;
      if (filtreResponsable && d.responsable !== filtreResponsable) return false;
      if (filtreOffre) {
        if (d.sansPret) return false;
        if ((d.offrePretStatut || 'inconnu') !== filtreOffre) return false;
      }
      if (filtreType) {
        const prochaine = prochaineEcheanceDetail(d);
        if (!prochaine || prochaine.type !== filtreType) return false;
      }
      return true;
    });

    count.textContent = dossiersAffiches.length ? `${dossiersAffiches.length} dossier${dossiersAffiches.length > 1 ? 's' : ''}` : '';

    if (dossiersAffiches.length === 0) {
      list.innerHTML = '<div class="empty-state">Aucun dossier ne correspond à cette recherche ou ces filtres.</div>';
      return;
    }

    const tries = dossiersAffiches.slice().sort((a, b) => {
      if (tri === 'nom') return a.nom.localeCompare(b.nom, 'fr');
      if (tri === 'responsable') return (a.responsable || '').localeCompare(b.responsable || '', 'fr');
      if (tri === 'priorite') return calculerPriorite(b) - calculerPriorite(a);
      return calculerProchaineEcheance(a) - calculerProchaineEcheance(b);
    });

    if (vueDossiers === 'tableau') {
      const flechesTri = { nom: '', responsable: '', echeance: '' };
      flechesTri[tri] = ' <span class="tri-actif">▾</span>';
      list.innerHTML = `
        <div class="table-scroll">
          <table class="dossiers-table">
            <thead><tr>
              <th class="th-triable" onclick="definirTri('nom')">Dossier${flechesTri.nom}</th>
              <th class="th-triable" onclick="definirTri('responsable')">Responsable${flechesTri.responsable}</th>
              <th class="th-triable" onclick="definirTri('echeance')">Prochaine échéance${flechesTri.echeance}</th>
              <th>Offre de prêt</th>
            </tr></thead>
            <tbody>${tries.map(renderLigneTableau).join('')}</tbody>
          </table>
        </div>`;
    } else {
      list.innerHTML = `<div class="cartes-grid">${tries.map(renderCarteCompacte).join('')}</div>`;
    }
  }

  // Change le tri depuis un clic sur un en-tête de colonne : répercuté sur le menu "Trier par"
  // (source unique de vérité, pas de deuxième variable d'état à garder synchronisée).
  function definirTri(critere) {
    document.getElementById('tri-dossiers').value = critere;
    render();
  }

  // Dossiers actuellement dépliés (ligne de tableau ou carte compacte) : sans ce suivi, la
  // moindre action qui déclenche render() (renommer, corriger une date, revérifier l'offre...)
  // reconstruit toute la liste et referme silencieusement la carte qu'on est pourtant en train
  // de consulter — un même identifiant sert aux deux vues puisqu'une seule est affichée à la fois.
  let dossiersDeplies = new Set();

  function renderLigneTableau(d) {
    const prochaine = prochaineEcheanceDetail(d);
    const offre = !d.sansPret ? libelleOffre(d.offrePretStatut) : null;
    const prioritaire = calculerPriorite(d) >= SEUIL_PRIORITE_ELEVEE;
    const deplie = dossiersDeplies.has(d.id);
    return `
      <tr class="ligne-resume${d.archive ? ' est-archive' : ''}" onclick="toggleLigneDossier('${d.id}')">
        <td><div class="dossier-nom-tableau">${escapeHtml(d.nom)}${renderBadgeStatut(d)}${prioritaire ? '<span class="badge-prioritaire" title="Échéance proche, offre de prêt manquante et/ou accès local à reconfirmer">🔥 Prioritaire</span>' : ''}</div></td>
        <td class="dossier-responsable-tableau">${escapeHtml(d.responsable || '—')}</td>
        <td>
          ${prochaine
            ? `<span class="type-pill ${prochaine.type}"><span class="dot"></span>${escapeHtml(prochaine.label)}</span>
               <span class="echeance-jours ${prochaine.jours <= 3 ? 'urgent' : 'calme'}">${formatDateFr(prochaine.iso)} (${prochaine.jours < 0 ? 'dépassée' : prochaine.jours === 0 ? "aujourd'hui" : 'J-' + prochaine.jours})</span>`
            : '<span class="echeance-jours calme">—</span>'}
        </td>
        <td>
          ${d.sansPret ? '<span class="echeance-jours calme">Comptant — sans prêt</span>' : `<span class="badge-offre ${offre.cls}">${offre.texte}</span>`}
          ${(!d.sansPret && d.dossierLie) ? `<button type="button" class="action-rapide" onclick="event.stopPropagation(); verifierOffrePret('${d.id}', true)">Revérifier</button>` : ''}
        </td>
      </tr>
      <tr class="ligne-detail${deplie ? ' ouvert' : ''}" id="detail-${d.id}"><td colspan="4">${renderCarteDossier(d)}</td></tr>
    `;
  }

  function toggleLigneDossier(id) {
    const el = document.getElementById('detail-' + id);
    if (!el) return;
    const ouvert = el.classList.toggle('ouvert');
    if (ouvert) dossiersDeplies.add(id); else dossiersDeplies.delete(id);
  }

  // Vue "Cartes" compacte : un résumé par dossier (nom, responsable, échéance, offre) qui déplie
  // au clic la même carte complète que la vue tableau — ni logique ni markup d'action dupliqués.
  function renderCarteCompacte(d) {
    const prochaine = prochaineEcheanceDetail(d);
    const offre = !d.sansPret ? libelleOffre(d.offrePretStatut) : null;
    const prioritaire = calculerPriorite(d) >= SEUIL_PRIORITE_ELEVEE;
    const deplie = dossiersDeplies.has(d.id);
    return `
      <div class="mini-carte${d.archive ? ' est-archive' : ''}${deplie ? ' ouverte' : ''}" id="mini-${d.id}">
        <div class="mini-carte-resume" onclick="toggleCarteCompacte('${d.id}')">
          <div class="mini-carte-nom">${escapeHtml(d.nom)}${renderBadgeStatut(d)}${prioritaire ? '<span class="badge-prioritaire" title="Échéance proche, offre de prêt manquante et/ou accès local à reconfirmer">🔥 Prioritaire</span>' : ''}</div>
          <div class="mini-carte-responsable">${escapeHtml(d.responsable || '—')}</div>
          <div class="mini-carte-echeance">
            ${prochaine
              ? `<span class="type-pill ${prochaine.type}"><span class="dot"></span>${escapeHtml(prochaine.label)}</span>
                 <span class="echeance-jours ${prochaine.jours <= 3 ? 'urgent' : 'calme'}">${prochaine.jours < 0 ? 'dépassée' : prochaine.jours === 0 ? "aujourd'hui" : 'J-' + prochaine.jours}</span>`
              : '<span class="echeance-jours calme">Aucune échéance</span>'}
          </div>
          <div class="mini-carte-pied">
            ${d.sansPret ? '<span class="echeance-jours calme">Comptant — sans prêt</span>' : `<span class="badge-offre ${offre.cls}">${offre.texte}</span>`}
            ${(!d.sansPret && d.dossierLie) ? `<button type="button" class="action-rapide" onclick="event.stopPropagation(); verifierOffrePret('${d.id}', true)">Revérifier</button>` : ''}
          </div>
        </div>
        <div class="mini-carte-detail" id="detail-carte-${d.id}">${renderCarteDossier(d)}</div>
      </div>
    `;
  }

  function toggleCarteCompacte(id) {
    const el = document.getElementById('mini-' + id);
    if (!el) return;
    const ouverte = el.classList.toggle('ouverte');
    if (ouverte) dossiersDeplies.add(id); else dossiersDeplies.delete(id);
  }

  function renderCarteDossier(d) {
      const confiance = d.confiance || {};
      const historique = d.historique || [];
      const analyse = d.analyseJuridique || { documents: [], engagements: [], conditions: [] };
      const analyseConditions = analyse.conditions || [];
      return `
      <div class="dossier${d.archive ? ' est-archive' : ''}">
        <div class="dossier-head">
          <div>
            <div class="nom-dossier">
              <span class="nom-affichage" id="nom-affichage-${d.id}">
                <span class="nom-texte">${escapeHtml(d.nom)}</span>
                <button type="button" class="icon-crayon" onclick="activerEditionNom('${d.id}')" title="Modifier le nom" aria-label="Modifier le nom">✏️</button>
              </span>
              <span class="nom-edition" id="nom-edition-${d.id}" hidden>
                <input type="text" class="dossier-nom-input" id="nom-input-${d.id}" value="${escapeAttr(d.nom)}" aria-label="Nom du dossier" onkeydown="if(event.key==='Enter'){event.preventDefault();validerEditionNom('${d.id}');}else if(event.key==='Escape'){annulerEditionNom('${d.id}');}">
                <button type="button" class="icon-valider" onclick="validerEditionNom('${d.id}')" title="Valider" aria-label="Valider le nom">✓</button>
              </span>
            </div>
            ${renderBadgeStatut(d)}
            ${d.email ? `<div class="addr">${escapeHtml(d.email)}</div>` : ''}
            ${d.responsable ? `<div class="addr">Responsable : ${escapeHtml(d.responsable)}</div>` : ''}
            ${d.sansPret ? '<span class="badge-cash">💰 Achat comptant — sans prêt</span>' : ''}
            ${!d.sansPret ? `<div class="offre-pret-ligne">
              ${d.dossierLie ? `<span class="badge-offre ${libelleOffre(d.offrePretStatut).cls}">${libelleOffre(d.offrePretStatut).texte}</span>` : ''}
              ${DOSSIER_FS_SUPPORTE ? (d.dossierLie
                  ? `<button type="button" class="lien-dossier-local" onclick="verifierOffrePret('${d.id}', true)">Revérifier</button>
                     <button type="button" class="lien-dossier-local" onclick="changerDossierLocal('${d.id}')">Changer de dossier</button>`
                  : `<button type="button" class="lien-dossier-local" onclick="lierDossierLocal('${d.id}')">🔗 Lier un dossier local</button>`) : ''}
              ${d.accesAReconfirmer ? `<span class="reconfirmer-acces" onclick="reconfirmerAcces('${d.id}')">Cliquer pour reconfirmer l'accès</span>` : ''}
            </div>` : ''}
          </div>
          <div>
            <button class="icon-btn" onclick="archiverDossier('${d.id}', ${!d.archive})">${d.archive ? 'Désarchiver' : 'Archiver'}</button>
            <button class="icon-btn" onclick="supprimerDossier('${d.id}')">Supprimer</button>
          </div>
        </div>
        <div class="tabs">
          ${renderTab('pret', 'Obtention du prêt', d.pret, d.id, d.pretPage, confiance.pret)}
          ${renderTab('acte', 'Signature de l\u2019acte', d.acte, d.id, d.actePage, confiance.acte)}
          ${d.ventebien ? renderTab('ventebien', 'Vente préalable', d.ventebien, d.id, d.ventebienPage, confiance.ventebien) : ''}
          ${(d.autres || []).map((a, i) => renderTab('autre', escapeHtml(a.label), a.date, d.id, a.page, null, i)).join('')}
        </div>
        <div class="dossier-actions">
          <button onclick="telechargerICS('${d.id}')">Télécharger les rappels (.ics)</button>
          <button onclick="ouvrirEmailRappel('${d.id}')">Envoyer un rappel par email</button>
          <button onclick="imprimerFiche('${d.id}')">📄 Télécharger la fiche dossier</button>
        </div>
        ${(analyse.documents.length > 0 || analyse.engagements.length > 0 || analyseConditions.length > 0) ? `
          <details class="analyse-juridique analyse-repliable" style="margin-top:14px;">
            <summary class="analyse-titre">📋 Analyse juridique du compromis</summary>
            ${analyseConditions.length > 0 ? `
              <div class="analyse-section">
                <div class="analyse-sous-titre">Conditions suspensives et particulières <span class="analyse-compteur">${analyseConditions.length}</span></div>
                ${analyseConditions.map(renderCondition).join('')}
              </div>
            ` : ''}
            ${analyse.engagements.length > 0 ? `
              <div class="analyse-section">
                <div class="analyse-sous-titre">Engagements du vendeur <span class="analyse-compteur">${analyse.engagements.length}</span></div>
                ${analyse.engagements.map(e => renderEngagement(e)).join('')}
              </div>
            ` : ''}
            <div class="analyse-section">
              <div class="analyse-sous-titre">Documents et pièces identifiés <span class="analyse-compteur">${analyse.documents.length}</span></div>
              <div class="analyse-documents-liste">
                ${analyse.documents.length > 0
                  ? analyse.documents.map(doc => renderDocBadge(doc)).join('')
                  : '<span class="analyse-vide">Aucun document type reconnu automatiquement.</span>'}
              </div>
            </div>
          </details>
        ` : ''}
        ${historique.length > 0 ? `
          <button type="button" class="historique-toggle" onclick="toggleHistorique('${d.id}')">Historique (${historique.length})</button>
          <div class="historique-liste" id="historique-${d.id}">
            ${historique.slice().reverse().map(h => `<div class="historique-ligne"><span class="h-date">${new Date(h.date).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>${escapeHtml(h.texte)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // Échappement dédié aux attributs HTML (échappe aussi les guillemets, contrairement à
  // escapeHtml) : nécessaire pour un champ value="" rempli avec du texte modifiable par l'utilisateur.
  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renommerDossier(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nom = valeur.trim();
    // Toujours réafficher (via render()) même si le nom est vide ou inchangé, pour refermer
    // l'édition dans tous les cas — pas seulement quand une modification a réellement eu lieu.
    if (nom && nom !== d.nom) {
      ajouterHistorique(d, `Nom modifié : « ${d.nom} » → « ${nom} »`);
      d.nom = nom;
      sauvegarder();
    }
    render();
  }

  // Bascule le nom d'un dossier enregistré entre affichage simple (+ crayon) et édition
  // (champ texte + validation explicite), plutôt qu'un champ toujours modifiable au clic — évite
  // de déclencher une modification par erreur en cliquant simplement sur le nom.
  function activerEditionNom(id) {
    const aff = document.getElementById('nom-affichage-' + id);
    const edit = document.getElementById('nom-edition-' + id);
    if (!aff || !edit) return;
    aff.hidden = true;
    edit.hidden = false;
    const input = document.getElementById('nom-input-' + id);
    if (input) { input.focus(); input.select(); }
  }

  function annulerEditionNom(id) {
    const d = dossiers.find(x => x.id === id);
    const input = document.getElementById('nom-input-' + id);
    if (input && d) input.value = d.nom; // remet la valeur d'origine sans repasser par render()
    const aff = document.getElementById('nom-affichage-' + id);
    const edit = document.getElementById('nom-edition-' + id);
    if (aff) aff.hidden = false;
    if (edit) edit.hidden = true;
  }

  function validerEditionNom(id) {
    const input = document.getElementById('nom-input-' + id);
    renommerDossier(id, input ? input.value : '');
  }

  // Même principe pour corriger une date après coup (erreur repérée une fois le dossier
  // enregistré) : crayon → champ date natif → valider. cleEdition vaut le type (pret/acte/
  // ventebien) ou "autre-<index>" pour une échéance personnalisée — voir renderTab().
  function activerEditionDate(dossierId, cle) {
    const idBase = `tabdate-${dossierId}-${cle}`;
    const aff = document.getElementById(idBase + '-aff');
    const edit = document.getElementById(idBase + '-edit');
    if (!aff || !edit) return;
    aff.hidden = true;
    edit.hidden = false;
    const input = document.getElementById(idBase + '-input');
    if (input) input.focus();
  }

  function annulerEditionDate(dossierId, cle) {
    const idBase = `tabdate-${dossierId}-${cle}`;
    const aff = document.getElementById(idBase + '-aff');
    const edit = document.getElementById(idBase + '-edit');
    if (aff) aff.hidden = false;
    if (edit) edit.hidden = true;
  }

  function validerEditionDate(dossierId, cle) {
    const idBase = `tabdate-${dossierId}-${cle}`;
    const input = document.getElementById(idBase + '-input');
    if (!input) return;
    const nouvelleDate = input.value || '';
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;

    if (cle.indexOf('autre-') === 0) {
      const index = parseInt(cle.slice(6), 10);
      const item = (d.autres || [])[index];
      if (!item) return;
      if (nouvelleDate !== (item.date || '')) {
        ajouterHistorique(d, `Date « ${item.label} » modifiée : ${item.date ? formatDateFr(item.date) : 'non renseignée'} → ${nouvelleDate ? formatDateFr(nouvelleDate) : 'non renseignée'}`);
        item.date = nouvelleDate || null;
        sauvegarder();
      }
    } else if (nouvelleDate !== (d[cle] || '')) {
      ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[cle]} » modifiée : ${d[cle] ? formatDateFr(d[cle]) : 'non renseignée'} → ${nouvelleDate ? formatDateFr(nouvelleDate) : 'non renseignée'}`);
      d[cle] = nouvelleDate || '';
      d.confiance = d.confiance || {};
      d.confiance[cle] = 'manuel'; // corrigée à la main : à revérifier comme toute saisie manuelle
      sauvegarder();
    }
    render();
  }

  // ---- ICS export ----

  function icsDate(iso) {
    return iso.replace(/-/g, '');
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function buildEvent(uidBase, summary, iso, reminderDays) {
    if (!iso) return '';
    const dtstart = icsDate(iso);
    const dtend = icsDate(addDays(iso, 1));
    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const alarms = reminderDays.map(n => {
      const trigger = n === 0 ? 'PT0S' : `-P${n}D`;
      return `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Rappel — ${summary}\r\nTRIGGER:${trigger}\r\nEND:VALARM\r\n`;
    }).join('');
    return `BEGIN:VEVENT\r\nUID:${uidBase}@registre-echeances\r\nDTSTAMP:${dtstamp}\r\nDTSTART;VALUE=DATE:${dtstart}\r\nDTEND;VALUE=DATE:${dtend}\r\nSUMMARY:${summary}\r\n${alarms}END:VEVENT\r\n`;
  }

  // Le nom du dossier est au format "VENDEUR(S) / ACQUEREUR(S)" : on isole la partie acquéreur
  // pour la mettre en avant dans le titre du rendez-vous (repli sur le nom complet si le format
  // "VENDEUR / ACQUEREUR" n'a pas pu être établi, par ex. un seul nom détecté).
  function extraireNomAcquereur(nomDossier) {
    const parties = String(nomDossier || '').split(' / ');
    return parties.length > 1 ? parties[1].trim() : nomDossier;
  }

  function telechargerICS(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nomAcquereur = extraireNomAcquereur(d.nom);
    const suffixeTitre = ` — ${nomAcquereur} - Dossier ${d.nom}`;
    let body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Registre des echeances//FR\r\nCALSCALE:GREGORIAN\r\n';
    body += buildEvent(d.id + '-pret', `Obtention du prêt${suffixeTitre}`, d.pret, d.reminderDays);
    body += buildEvent(d.id + '-acte', `Signature de l'acte${suffixeTitre}`, d.acte, d.reminderDays);
    body += buildEvent(d.id + '-ventebien', `Vente préalable${suffixeTitre}`, d.ventebien, d.reminderDays);
    (d.autres || []).forEach((a, i) => {
      body += buildEvent(d.id + '-autre' + i, `${a.label}${suffixeTitre}`, a.date, d.reminderDays);
    });
    body += 'END:VCALENDAR\r\n';

    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = d.nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    a.download = `echeances-${safeName || 'dossier'}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function ouvrirEmailRappel(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const lignes = [];
    if (d.pret) lignes.push(`- Obtention du prêt : ${formatDateFr(d.pret)}`);
    if (d.acte) lignes.push(`- Signature de l'acte : ${formatDateFr(d.acte)}`);
    if (d.ventebien) lignes.push(`- Vente préalable : ${formatDateFr(d.ventebien)}`);
    (d.autres || []).forEach(a => lignes.push(`- ${a.label} : ${formatDateFr(a.date)}`));
    const subject = `Rappel — Échéances du dossier ${d.nom}`;
    const bodyText = `Bonjour,\n\nUn rappel concernant les échéances du dossier ${d.nom} :\n\n${lignes.join('\n')}\n\nMerci de vérifier l'avancement de ce dossier.`;
    const to = d.email || '';
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    window.location.href = url;
  }

  // ---- persistence ----

  // window.storage n'existe QUE dans l'aperçu Claude.ai : une fois le fichier ouvert directement
  // dans le navigateur (nécessaire pour l'accès au dossier local), cette API disparaît et toute
  // sauvegarde échouait silencieusement — d'où la perte des données à chaque fermeture. On se
  // rabat sur localStorage, disponible dans un vrai navigateur, y compris en fichier local.
  async function sauvegarderLocalUniquement() {
    const contenu = JSON.stringify(dossiers);
    try {
      if (window.storage) {
        await window.storage.set(STORAGE_KEY, contenu, false);
        return;
      }
    } catch (e) {
      console.warn('window.storage indisponible, repli sur localStorage.', e);
    }
    try {
      localStorage.setItem(STORAGE_KEY, contenu);
    } catch (e) {
      console.warn('Sauvegarde locale impossible : les données resteront en mémoire pour cette session.', e);
    }
  }

  async function sauvegarder() {
    await sauvegarderLocalUniquement();
    if (registrePartageLie) await ecrireRegistrePartage();
  }

  async function charger() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous plutôt que d'abandonner */ }

    if (brut === null) {
      try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* aucune donnée exploitable non plus ici */ }
    }

    // Un JSON valide mais mal formé (objet, chaîne…) casserait tout l'affichage : on ne retient
    // que ce qui ressemble réellement à une liste de dossiers.
    dossiers = Array.isArray(brut) ? brut.filter(d => d && typeof d === 'object' && d.id) : [];
    render();
  }

  // ---- apprentissage des corrections (dates) ----
  //
  // Quand un(e) collaborateur(rice) attribue à une date détectée une catégorie différente de
  // celle suggérée (ou classe une date que l'outil n'avait pas su classer du tout), on retient
  // la clause correspondante. Au prochain compromis, si une clause très proche (mêmes mots,
  // dates/montants neutralisés) réapparaît, la correction déjà faite est réappliquée
  // automatiquement à la suggestion — qui reste malgré tout à vérifier, comme toute suggestion
  // automatique (voir le pied de page) : ce n'est pas parce qu'une clause ressemble à une clause
  // déjà vue qu'elle joue exactement le même rôle dans ce compromis-ci.
  //
  // Comparaison approximative (pas d'égalité stricte) : deux occurrences de la même clause-type
  // diffèrent presque toujours par la date, le montant ou les noms qu'elles contiennent — d'où la
  // neutralisation de ces éléments avant de comparer, puis un recouvrement de mots (indice de
  // Jaccard) plutôt qu'une comparaison caractère à caractère.
  //
  // Stocké en local uniquement (même mécanisme que le registre des dossiers, voir charger() /
  // sauvegarder() ci-dessus) : rien n'est envoyé nulle part, et rien de plus que des fragments de
  // clauses déjà affichés à l'écran n'est conservé.
  const CLE_APPRENTISSAGE = 'corrections-echeances';
  const SEUIL_SIMILARITE_APPRENTISSAGE = 0.6; // au-delà, on considère qu'il s'agit de la même clause-type
  const MAX_CORRECTIONS_MEMORISEES = 500; // filet de sécurité : évite une croissance illimitée du stockage local
  let correctionsApprises = [];

  function normaliserTexteApprentissage(texte) {
    const moisNoms = Object.keys(MOIS).join('|');
    return String(texte)
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(new RegExp(`\\b\\d{1,2}(?:er)?\\s+(?:${moisNoms})\\s+\\d{4}\\b`, 'g'), ' §date§ ')
      .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b/g, ' §date§ ')
      .replace(/\d+/g, '§num§')
      .replace(/[^a-z§\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokeniserApprentissage(texteNormalise) {
    // Mots de 3 lettres ou plus seulement : les mots très courts (de, le, un…) sont trop communs
    // pour discriminer une clause-type d'une autre et gonfleraient artificiellement le score.
    return new Set(texteNormalise.split(' ').filter(t => t.length > 2));
  }

  function similariteJaccard(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const t of setA) { if (setB.has(t)) intersection++; }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  async function sauvegarderApprentissage() {
    const contenu = JSON.stringify(correctionsApprises);
    try {
      if (window.storage) { await window.storage.set(CLE_APPRENTISSAGE, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour l’apprentissage, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_APPRENTISSAGE, contenu); } catch (e) { console.warn('Sauvegarde de l’apprentissage impossible.', e); }
  }

  async function chargerApprentissage() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_APPRENTISSAGE, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_APPRENTISSAGE);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    correctionsApprises = Array.isArray(brut)
      ? brut.filter(c => c && typeof c === 'object' && Array.isArray(c.tokens) && typeof c.classification === 'string')
      : [];
  }

  // Retrouve, parmi les corrections déjà apprises, la plus proche du contexte donné — ou null si
  // aucune ne dépasse le seuil de similarité.
  function trouverCorrectionApprise(contexte) {
    if (correctionsApprises.length === 0) return null;
    const tokens = tokeniserApprentissage(normaliserTexteApprentissage(contexte));
    let meilleure = null;
    let meilleurScore = SEUIL_SIMILARITE_APPRENTISSAGE;
    for (const c of correctionsApprises) {
      const score = similariteJaccard(tokens, new Set(c.tokens));
      if (score >= meilleurScore) { meilleure = c; meilleurScore = score; }
    }
    return meilleure;
  }

  // Enregistre (ou renforce) la correction pour que la même clause-type soit reconnue à l'avenir.
  // classification : 'pret' | 'acte' | 'ventebien' | 'autre'. libelle : uniquement pour 'autre'.
  function memoriserCorrection(contexte, classification, libelle) {
    if (!contexte || contexte.length < 15) return; // trop court pour donner une empreinte fiable
    const tokens = [...tokeniserApprentissage(normaliserTexteApprentissage(contexte))];
    if (tokens.length < 3) return; // pas assez de matière pour comparer de façon fiable

    const existante = trouverCorrectionApprise(contexte);
    if (existante && existante.classification === classification) {
      existante.nbConfirmations = (existante.nbConfirmations || 1) + 1;
      existante.dateMaj = new Date().toISOString();
    } else {
      correctionsApprises.push({
        id: (crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
        tokens,
        contexteExemple: contexte.slice(0, 200),
        classification,
        libelle: libelle || null,
        nbConfirmations: 1,
        dateMaj: new Date().toISOString()
      });
      // Filet de sécurité : on garde les corrections les plus confirmées/récentes plutôt que de
      // laisser le stockage local croître sans fin au fil des années.
      if (correctionsApprises.length > MAX_CORRECTIONS_MEMORISEES) {
        correctionsApprises.sort((a, b) => (b.nbConfirmations - a.nbConfirmations) || b.dateMaj.localeCompare(a.dateMaj));
        correctionsApprises.length = MAX_CORRECTIONS_MEMORISEES;
      }
    }
    sauvegarderApprentissage();
  }

  // ---- export / import (sauvegarde JSON complète du registre) ----

  function exporterDonnees() {
    if (dossiers.length === 0) {
      afficherToast('Aucun dossier à exporter pour le moment.', 'OK', null);
      return;
    }
    const contenu = JSON.stringify(dossiers, null, 2);
    const blob = new Blob([contenu], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const aujourdhui = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `registre-echeances-${aujourdhui}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Normalise un dossier venu d'un fichier externe : garantit la présence et le type de chaque
  // champ attendu, pour qu'un JSON incomplet ou bricolé à la main ne casse pas l'affichage.
  function normaliserDossierImporte(d, nomFichier) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const nom = typeof d.nom === 'string' ? d.nom.trim() : '';
    if (!nom) return null;
    const dateValide = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '';
    const normalise = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      nom,
      email: typeof d.email === 'string' ? d.email : '',
      responsable: typeof d.responsable === 'string' ? d.responsable : '',
      emailAcquereur: typeof d.emailAcquereur === 'string' ? d.emailAcquereur : '',
      pret: dateValide(d.pret),
      acte: dateValide(d.acte),
      ventebien: dateValide(d.ventebien),
      autres: Array.isArray(d.autres)
        ? d.autres.filter(a => a && typeof a === 'object' && dateValide(a.date))
            .map(a => ({ label: typeof a.label === 'string' && a.label.trim() ? a.label : 'Autre échéance', date: a.date, page: Number.isInteger(a.page) ? a.page : null }))
        : [],
      pretPage: Number.isInteger(d.pretPage) ? d.pretPage : null,
      actePage: Number.isInteger(d.actePage) ? d.actePage : null,
      ventebienPage: Number.isInteger(d.ventebienPage) ? d.ventebienPage : null,
      sansPret: d.sansPret === true,
      archive: d.archive === true,
      reminderDays: Array.isArray(d.reminderDays) && d.reminderDays.every(Number.isInteger) ? d.reminderDays : [15, 7],
      confiance: (d.confiance && typeof d.confiance === 'object') ? d.confiance : {},
      analyseJuridique: {
        documents: Array.isArray(d.analyseJuridique && d.analyseJuridique.documents) ? d.analyseJuridique.documents.filter(x => typeof x === 'string') : [],
        engagements: Array.isArray(d.analyseJuridique && d.analyseJuridique.engagements) ? d.analyseJuridique.engagements : [],
        conditions: Array.isArray(d.analyseJuridique && d.analyseJuridique.conditions) ? d.analyseJuridique.conditions : []
      },
      historique: Array.isArray(d.historique) ? d.historique.filter(h => h && h.date && h.texte) : [],
      // Un dossier local relié sur un poste ne l'est jamais sur un autre : l'import repart de zéro
      // sur ce point, la personne devra relier le dossier depuis ce navigateur si besoin.
      dossierLie: false,
      offrePretStatut: 'inconnu',
      accesAReconfirmer: false,
      derniereRelanceAuto: null
    };
    ajouterHistorique(normalise, `Importé depuis « ${nomFichier} »`);
    return normalise;
  }

  function importerDonnees(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let brut;
      try {
        brut = JSON.parse(reader.result);
        if (!Array.isArray(brut)) throw new Error('format invalide');
      } catch (e) {
        afficherToast(`Le fichier « ${file.name} » n'est pas une sauvegarde valide.`, 'OK', null);
        event.target.value = '';
        return;
      }

      const importes = brut.map(d => normaliserDossierImporte(d, file.name)).filter(Boolean);
      const ignores = brut.length - importes.length;

      if (importes.length === 0) {
        afficherToast(`Aucun dossier exploitable dans « ${file.name} ».`, 'OK', null);
        event.target.value = '';
        return;
      }

      const messageIgnores = ignores > 0 ? ` (${ignores} entrée${ignores > 1 ? 's' : ''} illisible${ignores > 1 ? 's' : ''} ignorée${ignores > 1 ? 's' : ''})` : '';
      demanderConfirmation(`Importer ${importes.length} dossier${importes.length > 1 ? 's' : ''} depuis « ${file.name} »${messageIgnores} ? Ils seront ajoutés à votre registre actuel.`, async () => {
        dossiers = dossiers.concat(importes);
        await sauvegarder();
        render();
        afficherToast(`${importes.length} dossier${importes.length > 1 ? 's' : ''} importé${importes.length > 1 ? 's' : ''}.`, 'OK', null);
      });
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  // ---- fiche A4 imprimable (analyse du dossier + procédure d'appel de fonds de l'étude) ----

  // Reprise à l'identique de la procédure interne « APPELS ET RECEPTION DES FONDS ».
  // Chaque étape porte une amorce en gras/majuscules (l'action à retenir en un coup d'œil) suivie
  // du détail en texte normal — reprend la mise en forme demandée par l'étude sur la fiche imprimée.
  const PROCEDURE_FONDS = [
    { lead: "Envoi de l'appel des fonds", suite: " à l'acquéreur au plus tard 10 jours avant le rendez-vous de signature. Envoi au client par mail avec en copie le banquier et le courtier, et envoi par courrier." },
    { lead: 'Envoyer une confirmation de rendez-vous au vendeur', suite: " par mail (ou par téléphone s'il n'a pas d'adresse mail) : lui demander de se munir de son RIB et lui envoyer son décompte vendeur." },
    { lead: 'Réceptionner tous les justificatifs de la provenance des fonds', suite: " (offre de prêt, attestation de provenance selon modèle de l'Étude ou ordre de virement transmis par la banque) et les classer dans le dossier sur le commun." },
    { lead: "Enregistrer l'appel de fonds dans le dossier commun", suite: " pour qu'à la réception, la comptabilité puisse les rattacher au bon compte et vérifier la provenance." },
    { lead: "Vérifier auprès de l'agence immobilière le déblocage du séquestre.", suite: '' },
    { lead: 'Vérifier la réception de toutes les factures à régler', suite: ' par la comptabilité (agence, syndic/copropriété) et obtenir tous les RIB.' },
    { lead: "Envoyer le projet d'acte", suite: ' au plus tard 7 jours avant le rendez-vous au vendeur, à l\u2019acquéreur et à l\u2019agence.' },
    { lead: "Surveiller l'arrivée des fonds", suite: ' et, 48 h avant le rendez-vous, prévenir les clients s\u2019il en manque.' },
    { lead: 'Confirmer aux clients la bonne réception de leurs fonds', suite: ' et leur rappeler de se munir de leurs RIB et CNI pour le rendez-vous (acquéreurs et vendeurs).' }
  ];

  function imprimerFiche(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const analyse = d.analyseJuridique || { documents: [], engagements: [], conditions: [] };
    const docs = (analyse.documents || []).map(x => typeof x === 'string' ? x : x.label);
    const engs = (analyse.engagements || []).map(x => typeof x === 'string' ? x : x.phrase);

    // Mise en page à base de <table>, avec les couleurs en style *inline* sur chaque cellule :
    // Word (et le filtre HTML de LibreOffice) ignore CSS Grid/Flexbox et, plus surprenant,
    // n'applique pas toujours les couleurs de fond définies via une classe sur une cellule de
    // tableau — seul le style inline est honoré de façon fiable à l'ouverture d'un fichier .doc.
    const TEINTES = {
      pret:  { fond: '#FBEFD9', barre: '#B07A12' },
      acte:  { fond: '#E3EEF7', barre: '#2472B0' },
      vente: { fond: '#E1F4F2', barre: '#1CA39B' },
      autre: { fond: '#EEEEEE', barre: '#8A93A9' }
    };

    const cases = [
      d.pret ? { cls: 'pret', label: 'Obtention du prêt', date: d.pret } : null,
      d.acte ? { cls: 'acte', label: "Signature de l'acte", date: d.acte } : null,
      d.ventebien ? { cls: 'vente', label: 'Vente préalable', date: d.ventebien } : null,
      ...(d.autres || []).map(a => ({ cls: 'autre', label: a.label, date: a.date }))
    ].filter(Boolean);

    function ligneParPaquets(items, parLigne, rendu) {
      let html = '';
      for (let i = 0; i < items.length; i += parLigne) {
        const paquet = items.slice(i, i + parLigne);
        html += '<tr>' + paquet.map((it, j) => rendu(it, i + j)).join('') +
          (paquet.length < parLigne ? `<td style="border:none;background:none;" colspan="${parLigne - paquet.length}"></td>` : '') +
          '</tr>';
      }
      return html;
    }

    const echeancesHtml = cases.length
      ? `<table class="ech-table">${ligneParPaquets(cases, 4, c => {
          const t = TEINTES[c.cls];
          return `<td class="eb" style="background:${t.fond};border-left:1mm solid ${t.barre};">
            <div class="eb-l">${escapeHtml(c.label)}</div><div class="eb-d">${formatDateFr(c.date)}</div></td>`;
        })}</table>`
      : '<p class="vide">Aucune échéance enregistrée.</p>';

    const procHtml = `<table class="proc-table">${ligneParPaquets(PROCEDURE_FONDS, 2, (e, idx) =>
      `<td class="pc">
        <div class="pc-h"><span class="pc-num">${idx + 1}</span></div>
        <div class="pc-txt"><b>${escapeHtml(e.lead.toUpperCase())}</b>${escapeHtml(e.suite)}</div>
        <div class="pc-fait">☐ Fait le <u>&nbsp;</u></div>
      </td>`
    )}</table>`;

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Fiche dossier — ${escapeHtml(d.nom)}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 11mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.4pt; line-height: 1.22; color: #1a1a1a; margin: 0; }

  .head-table { width: 100%; border-collapse: collapse; border-bottom: 1.5pt solid #16233C; margin-bottom: 2.2mm; }
  .head-table td { padding: 0 0 1.5mm; border: none; vertical-align: bottom; }
  .head-table h1 { font-size: 14.5pt; margin: 0; color: #16233C; }
  .head-table .meta { font-size: 8pt; color: #555; text-align: right; white-space: nowrap; }
  .head-table .meta b { color: #16233C; }

  h2 { font-size: 12pt; margin: 0 0 1.3mm; color: #16233C; font-weight: 700; }
  .vide { color: #777; font-style: italic; margin: 0; }

  .ech-table { width: 100%; border-collapse: separate; border-spacing: 2mm; margin: 0 0 1.3mm -2mm; }
  .eb { width: 25%; border-radius: 2mm; padding: 1.5mm 3mm; vertical-align: top; }
  .eb-l { font-size: 7.3pt; color: #444; margin-bottom: 0.5mm; }
  .eb-d { font-size: 9.5pt; font-weight: 700; }

  .two-col { width: 100%; border-collapse: separate; border-spacing: 4mm 0; margin-bottom: 2.2mm; }
  .two-col td { width: 50%; vertical-align: top; padding: 1.8mm 3mm; border-radius: 2mm; }
  .two-col ul { margin: 0; padding-left: 3.8mm; }
  .two-col li { margin-bottom: 0.9mm; }

  .proc-title { margin: 0 0 2mm; }
  .proc-title .tag { font-size: 6.6pt; color: #777; font-style: italic; margin-left: 2mm; }
  .proc-table { width: 100%; border-collapse: separate; border-spacing: 3mm 1mm; margin-left: -3mm; }
  .pc { width: 50%; border: 0.6pt solid #ddd; border-radius: 2mm; padding: 1.3mm 2.8mm; background: #FAFAFA; vertical-align: top; }
  .pc-h { margin-bottom: 1mm; }
  .pc-num {
    display: inline-block; width: 5mm; height: 5mm; line-height: 5mm;
    border-radius: 50%; background: #16233C; color: #fff;
    font-size: 7.5pt; font-weight: 700; text-align: center;
  }
  .pc-txt { margin-bottom: 0.9mm; }
  .pc-fait { color: #666; font-size: 8pt; }
  .pc-fait u { text-decoration: none; border-bottom: 0.5pt solid #999; padding: 0 16mm; }

  .pied { margin-top: 1.2mm; padding-top: 0.6mm; border-top: 0.6pt solid #999; font-size: 6.6pt; color: #666; }
</style></head><body>

  <table class="head-table"><tr>
    <td><h1>${escapeHtml(d.nom)}</h1></td>
    <td class="meta">
      ${d.responsable ? 'Responsable : <b>' + escapeHtml(d.responsable) + '</b> · ' : ''}
      ${d.sansPret ? '<b>Achat comptant</b> · ' : ''}
      Édité le ${new Date().toLocaleDateString('fr-FR')}
    </td>
  </tr></table>

  <h2>1 · Échéances et points de vigilance</h2>
  ${echeancesHtml}

  <table class="two-col"><tr>
    <td style="background:#F0F7F4;border:0.6pt solid #BFE0D2;">
      <h2>Pièces à réclamer au vendeur</h2>
      ${docs.length ? `<ul>${docs.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="vide">Aucune pièce identifiée.</p>'}
    </td>
    <td style="background:#EEF3FA;border:0.6pt solid #C6D9EE;">
      <h2>Engagements du vendeur</h2>
      ${engs.length ? `<ul>${engs.map(x => `<li>${escapeHtml(x.length > 140 ? x.slice(0, 140) + '…' : x)}</li>`).join('')}</ul>` : '<p class="vide">Aucun engagement relevé.</p>'}
    </td>
  </tr></table>

  <div class="proc-title"><h2 style="display:inline">2 · Procédure — Appels et réception des fonds</h2><span class="tag">(à cocher au fil du dossier)</span></div>
  ${procHtml}

  <div class="pied">
    Les procédures écrites sont des règlements de l'entreprise. En cas de non-respect (non validé par le notaire), des sanctions disciplinaires peuvent être prononcées.
    · Dates issues d'une lecture automatique du compromis : à vérifier avant usage.
  </div>
</body></html>`;

    // window.open()/print() est souvent bloqué (fenêtre surgissante) dans un navigateur ou un
    // aperçu en bac à sable : on télécharge directement un fichier Word, ouvert et imprimé
    // ensuite par le collaborateur comme n'importe quel document.
    const entete = '\ufeff<html xmlns:o="urn:schemas-microsoft-com:office:office" '
      + 'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">';
    const docComplet = html.replace('<html lang="fr">', entete);

    const blob = new Blob([docComplet], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = d.nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    a.download = `fiche-${safeName || 'dossier'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- dossier local (offre de prêt) : File System Access API, Chrome/Edge uniquement ----
  //
  // Limites réelles de la plateforme, non contournables :
  // - Firefox et Safari ne proposent pas cette API : le bouton est simplement masqué ailleurs.
  // - Le navigateur peut redemander l'autorisation d'accès après un certain temps ou un
  //   redémarrage ; dans ce cas un bandeau « Reconfirmer l'accès » apparaît sur le dossier.
  // - Aucune page web ne peut cliquer "Envoyer" à la place de l'utilisateur : la relance est
  //   pré-rédigée et ouverte automatiquement dans la messagerie, l'envoi final reste manuel.
  // - La vérification ne tourne que pendant que cet onglet est ouvert, pas en tâche de fond.

  const DOSSIER_FS_SUPPORTE = typeof window.showDirectoryPicker === 'function';
  // "Offre de crédit (immobilier)" est une formulation bancaire tout aussi courante que "offre de
  // prêt" pour désigner le même document (signalé par l'étude : une offre réelle intitulée ainsi
  // n'était pas détectée) — à ne pas retirer sans revérifier ce cas.
  // var (pas const) : exposée globalement comme les fonctions du fichier, pour rester testable
  // depuis tests/helpers/load-app.js sans dupliquer le motif dans les tests.
  var OFFRE_PRET_RE = /offre\s+de\s+pr[êe]t|offre\s+pr[ée]alable\s+de\s+cr[ée]dit|offre\s+de\s+cr[ée]dit|offre\s+de\s+financement/i;
  let handlesEnMemoire = {}; // repli si IndexedDB est indisponible (contexte restreint)

  // Parcourt un dossier ET ses sous-dossiers à la recherche de fichiers PDF : les pièces d'un
  // dossier client sont presque toujours rangées dans des sous-dossiers ("Offres", "Pièces
  // reçues"…), jamais à la racine — s'arrêter au premier niveau (comme le faisait cette fonction
  // avant) manquait donc systématiquement l'offre de prêt dans ce cas, le cas le plus courant.
  const PROFONDEUR_MAX_RECHERCHE_PDF = 4;
  const MAX_FICHIERS_PARCOURUS = 300; // filet de sécurité sur un dossier réseau volumineux
  async function* fichiersPdfRecursifs(handleDossier, profondeur, compteur) {
    if (profondeur > PROFONDEUR_MAX_RECHERCHE_PDF) return;
    for await (const [nom, entree] of handleDossier.entries()) {
      if (compteur.n >= MAX_FICHIERS_PARCOURUS) return;
      if (entree.kind === 'file') {
        if (/\.pdf$/i.test(nom)) { compteur.n++; yield entree; }
      } else if (entree.kind === 'directory') {
        yield* fichiersPdfRecursifs(entree, profondeur + 1, compteur);
      }
    }
  }

  function ouvrirBaseHandles() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { resolve(null); return; }
      const req = indexedDB.open('suivi-echeances-handles', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // on se rabat sur la mémoire plutôt que de bloquer l'outil
    });
  }

  async function enregistrerHandle(id, handle) {
    handlesEnMemoire[id] = handle;
    try {
      const db = await ouvrirBaseHandles();
      if (!db) return;
      await new Promise((res, rej) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, id);
        tx.oncomplete = res;
        tx.onerror = rej;
      });
    } catch (e) { console.error('Enregistrement du dossier local impossible', e); }
  }

  async function recupererHandle(id) {
    try {
      const db = await ouvrirBaseHandles();
      if (db) {
        const handle = await new Promise((res) => {
          const tx = db.transaction('handles', 'readonly');
          const r = tx.objectStore('handles').get(id);
          r.onsuccess = () => res(r.result || null);
          r.onerror = () => res(null);
        });
        if (handle) return handle;
      }
    } catch (e) { /* repli sur la mémoire */ }
    return handlesEnMemoire[id] || null;
  }

  async function lierDossierLocal(id) {
    if (!DOSSIER_FS_SUPPORTE) {
      afficherToast("Cette fonctionnalité nécessite Chrome ou Edge (l'accès à un dossier local n'est pas proposé par ce navigateur).", 'OK', null);
      return;
    }
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const etaitDejaLie = d.dossierLie;
    try {
      const handle = await window.showDirectoryPicker();
      await enregistrerHandle(id, handle);
      d.dossierLie = true;
      // Choisir un nouveau dossier ecrase simplement le lien precedent (put() dans
      // enregistrerHandle) : utile si l'on s'etait trompe de dossier au premier lien.
      ajouterHistorique(d, etaitDejaLie
        ? 'Dossier local relié modifié (nouveau dossier choisi)'
        : 'Dossier local relié pour la vérification automatique de l\u2019offre de prêt');
      await sauvegarder();
      render();
      await verifierOffrePret(id, true);
    } catch (e) {
      if (!e) return;
      if (e.name === 'AbortError') return; // fenêtre de sélection fermée : rien à signaler
      if (e.name === 'SecurityError') {
        // Le navigateur refuse l'accès aux fichiers dans un iframe d'une autre origine — c'est le
        // cas de l'aperçu intégré à une page de discussion. Aucune parade côté code : il faut
        // ouvrir le fichier .html en dehors de cet aperçu (téléchargé puis ouvert directement).
        afficherToast("Chrome bloque le sélecteur de dossier dans cet aperçu intégré. Téléchargez le fichier et ouvrez-le directement dans votre navigateur pour utiliser cette fonctionnalité.", 'OK', null);
        return;
      }
      console.error(e);
      afficherToast("Impossible d'accéder au dossier sélectionné : " + e.message, 'OK', null);
    }
  }

  // Changer de dossier réutilise lierDossierLocal : celle-ci écrase déjà le handle précédent
  // (put() dans enregistrerHandle) et adapte son message d'historique selon d.dossierLie.
  async function changerDossierLocal(id) {
    await lierDossierLocal(id);
  }

  async function verifierOffrePret(id, viaClicUtilisateur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.dossierLie) return;
    const handle = await recupererHandle(id);
    if (!handle) {
      d.dossierLie = false; // le lien a été perdu (base vidée, autre navigateur…) : on l'indique
      render();
      return;
    }

    let permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted' && viaClicUtilisateur) {
      permission = await handle.requestPermission({ mode: 'read' });
    }
    if (permission !== 'granted') {
      d.accesAReconfirmer = true;
      render();
      return;
    }
    d.accesAReconfirmer = false;

    let trouve = false;
    let fichierTrouve = null;
    let nbAnalyses = 0;
    try {
      const compteur = { n: 0 };
      for await (const entree of fichiersPdfRecursifs(handle, 0, compteur)) {
        nbAnalyses++;
        try {
          const file = await entree.getFile();
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
          let texte = '';
          for (let p = 1; p <= Math.min(pdf.numPages, 15); p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            texte += content.items.map(it => it.str).join(' ') + '\n';
          }
          let correspond = OFFRE_PRET_RE.test(texte);
          // Un PDF scanné (offre reçue par fax, scan ou export image) ne contient aucun texte
          // extractible — on tente alors l'OCR sur sa première page plutôt que de conclure trop
          // vite à une absence d'offre (même logique que pour la date de signature du compromis,
          // voir traiterFichierPdf()).
          if (!correspond && texte.trim().length < 40) {
            const workerVerif = await creerWorkerOcr();
            if (workerVerif) {
              try {
                const texteOcr = await ocrPage(pdf, 1, workerVerif);
                correspond = OFFRE_PRET_RE.test(texteOcr);
              } finally {
                await workerVerif.terminate();
              }
            }
          }
          // Trace de diagnostic (jamais affichée à l'écran) : un extrait du texte lu par pdf.js
          // pour chaque PDF, utile en cas de désaccord entre "le mot y est bien" et "non détecté"
          // (ex. police embarquée mal encodée qui produit un texte extrait illisible malgré un
          // PDF visuellement normal et sélectionnable).
          console.log('[vérification offre de prêt]', entree.name, '→', correspond ? 'correspond' : 'ne correspond pas', '| extrait :', JSON.stringify(texte.trim().slice(0, 200)));
          if (correspond) { trouve = true; fichierTrouve = entree.name; break; }
        } catch (e) { console.error('Lecture impossible pour', entree.name, e); }
      }
    } catch (e) {
      console.error('Parcours du dossier local impossible', e);
      if (viaClicUtilisateur) afficherToast("Impossible de parcourir le dossier local relié : " + e.message, 'OK', null);
      render();
      return;
    }

    if (viaClicUtilisateur) {
      if (trouve) {
        afficherToast(`Offre de prêt trouvée (${fichierTrouve}).`, 'OK', null);
      } else if (nbAnalyses === 0) {
        afficherToast("Aucun PDF trouvé dans le dossier relié (ni ses sous-dossiers) — vérifiez que les pièces ont bien été enregistrées à cet endroit.", 'OK', null);
      } else {
        afficherToast(`${nbAnalyses} PDF analysé(s) dans le dossier : offre de prêt non reconnue dans leur contenu. Voir la console (F12) pour le détail de ce qui a été lu dans chaque fichier.`, 'OK', null);
      }
    }

    const etaitManquante = d.offrePretStatut === 'manquante';
    d.offrePretStatut = trouve ? 'recue' : 'manquante';
    await sauvegarder();
    render();

    if (trouve && etaitManquante) {
      ajouterHistorique(d, 'Offre de prêt retrouvée dans le dossier local');
      await sauvegarder();
    }

    if (!trouve) relancerSiOffreManquante(d);
  }

  // Ouvre automatiquement une relance pré-rédigée si l'échéance approche et qu'aucune offre n'a
  // été trouvée — au plus une fois par jour et par dossier, pour ne pas rouvrir un brouillon à
  // chaque vérification. L'envoi final reste un geste volontaire de l'utilisateur.
  function relancerSiOffreManquante(d) {
    if (!d.emailAcquereur || !d.pret) return;
    const jours = joursRestants(d.pret);
    if (jours === null || jours < 0 || jours > 15) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (d.derniereRelanceAuto === aujourdhui) return;

    d.derniereRelanceAuto = aujourdhui;
    ajouterHistorique(d, `Relance automatique ouverte (offre de prêt introuvable, échéance J-${jours})`);
    sauvegarder();

    const subject = `Relance — Offre de prêt attendue (dossier ${d.nom})`;
    const body = `Bonjour,\n\nSauf erreur de notre part, nous n'avons pas encore reçu votre offre de prêt pour le dossier ${d.nom}.\n\nL'échéance d'obtention du prêt est fixée au ${formatDateFr(d.pret)}. Merci de nous transmettre cette offre dès réception, ou de nous indiquer où en est votre demande de financement.\n\nCordialement.`;
    const url = `mailto:${encodeURIComponent(d.emailAcquereur)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    afficherToast(`Relance « offre de prêt » ouverte pour ${d.nom} — vérifiez puis envoyez.`, 'OK', null);
    window.location.href = url;
  }

  // Reconfirmation d'accès déclenchée par un clic (obligatoire : le navigateur refuse
  // d'accorder une permission de fichiers hors d'une interaction explicite de l'utilisateur).
  function reconfirmerAcces(id) {
    verifierOffrePret(id, true);
  }

  function libelleOffre(statut) {
    if (statut === 'recue') return { texte: '✓ Offre de prêt reçue', cls: 'recue' };
    if (statut === 'manquante') return { texte: '⚠ Offre de prêt introuvable', cls: 'manquante' };
    return { texte: 'Offre de prêt : à vérifier', cls: 'inconnu' };
  }

  // Revérifie les dossiers reliés à l'ouverture, sans exiger de clic (queryPermission seul, qui
  // n'affiche jamais de demande d'autorisation) : si l'accès est toujours accordé, tout se fait
  // silencieusement ; sinon un bandeau invite à cliquer pour le reconfirmer.
  async function revérifierDossiersLiesAuDemarrage() {
    for (const d of dossiers) {
      if (d.dossierLie) await verifierOffrePret(d.id, false);
    }
  }
  setInterval(() => { revérifierDossiersLiesAuDemarrage(); }, 5 * 60 * 1000);

  // ---- registre partagé (un même fichier JSON sur le lecteur réseau de l'étude) ----
  //
  // Même technologie et mêmes limites que le dossier local : Chrome/Edge uniquement, permission
  // à reconfirmer de temps en temps, aucune fusion intelligente en cas d'écriture simultanée à
  // la seconde près (la dernière sauvegarde l'emporte). Une fois relié, ce fichier devient la
  // source de vérité : il est relu périodiquement pour récupérer les mises à jour des collègues,
  // et réécrit à chaque modification locale.

  const CLE_HANDLE_PARTAGE = '__registre_partage__';
  const CLE_PARTAGE_LIE = STORAGE_KEY + '-partage-lie';
  const FICHIER_FS_SUPPORTE = typeof window.showSaveFilePicker === 'function';
  let registrePartageLie = false;
  let dernierContenuPartageEcrit = null; // null = "aucune référence encore connue dans cette session"

  function majStatutPartage() {
    const el = document.getElementById('statut-partage');
    const btn = document.getElementById('btn-registre-partage');
    if (!el || !btn) return;
    if (!FICHIER_FS_SUPPORTE) { el.style.display = 'none'; return; }
    if (registrePartageLie) {
      el.style.display = 'flex';
      el.className = 'statut-partage actif';
      el.textContent = 'Registre partagé actif';
      btn.textContent = '🔗 Registre partagé (relié)';
    } else {
      el.style.display = 'none';
      btn.textContent = '🔗 Registre partagé (réseau)';
    }
  }

  async function lierRegistrePartage() {
    if (!FICHIER_FS_SUPPORTE) {
      afficherToast("Cette fonctionnalité nécessite Chrome ou Edge, ouverts en dehors de tout aperçu intégré.", 'OK', null);
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'registre-echeances-partage.json',
        types: [{ description: 'Registre des échéances (JSON)', accept: { 'application/json': ['.json'] } }]
      });
      await enregistrerHandle(CLE_HANDLE_PARTAGE, handle);
      registrePartageLie = true;
      try { localStorage.setItem(CLE_PARTAGE_LIE, '1'); } catch (e) { /* sans conséquence */ }
      majStatutPartage();

      // Si le fichier choisi contient déjà des dossiers (créé par un collègue), on les récupère
      // plutôt que d'écraser directement avec le registre local, potentiellement vide.
      const recupere = await lireRegistrePartage(true);
      if (!recupere) await ecrireRegistrePartage();
      afficherToast('Registre partagé relié : les dossiers seront synchronisés via ce fichier.', 'OK', null);
    } catch (e) {
      if (!e || e.name === 'AbortError') return;
      if (e.name === 'SecurityError') {
        afficherToast("Chrome bloque le sélecteur de fichier dans cet aperçu intégré. Téléchargez le fichier et ouvrez-le directement dans votre navigateur.", 'OK', null);
        return;
      }
      console.error(e);
      afficherToast('Impossible de relier le registre partagé : ' + e.message, 'OK', null);
    }
  }

  async function obtenirHandlePartage(viaClicUtilisateur) {
    const handle = await recupererHandle(CLE_HANDLE_PARTAGE);
    if (!handle) return null;
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && viaClicUtilisateur) {
      permission = await handle.requestPermission({ mode: 'readwrite' });
    }
    return permission === 'granted' ? handle : null;
  }

  async function ecrireRegistrePartage() {
    if (!registrePartageLie) return;
    const handle = await obtenirHandlePartage(false);
    if (!handle) return; // permission perdue : la reconfirmation se fera au prochain clic manuel
    try {
      const contenu = JSON.stringify(dossiers, null, 2);
      if (contenu === dernierContenuPartageEcrit) return; // rien de neuf, on épargne une écriture
      const writable = await handle.createWritable();
      await writable.write(contenu);
      await writable.close();
      dernierContenuPartageEcrit = contenu;
    } catch (e) { console.error('Écriture du registre partagé impossible', e); }
  }

  // Relit le fichier partagé et l'adopte comme référence s'il diffère de la vue locale — c'est
  // ainsi que les mises à jour d'un collègue apparaissent sans action de votre part.
  async function lireRegistrePartage(viaClicUtilisateur) {
    const handle = await obtenirHandlePartage(viaClicUtilisateur);
    if (!handle) return false;
    try {
      const file = await handle.getFile();
      const texte = await file.text();
      if (!texte) return false;
      if (dernierContenuPartageEcrit !== null && texte === dernierContenuPartageEcrit) return false;
      const brut = JSON.parse(texte);
      if (!Array.isArray(brut) || brut.length === 0) return false;
      dossiers = brut.filter(d => d && typeof d === 'object' && d.id);
      dernierContenuPartageEcrit = texte;
      await sauvegarderLocalUniquement();
      render();
      return true;
    } catch (e) {
      if (e instanceof SyntaxError) return false; // fichier vide ou tout juste créé : rien à lire
      console.error('Lecture du registre partagé impossible', e);
      return false;
    }
  }

  async function tenterReconnexionPartage() {
    let lie = false;
    try { lie = localStorage.getItem(CLE_PARTAGE_LIE) === '1'; } catch (e) { /* pas de préférence connue */ }
    if (!lie || !FICHIER_FS_SUPPORTE) { majStatutPartage(); return; }
    registrePartageLie = true;
    majStatutPartage();
    await lireRegistrePartage(false); // sans clic : silencieux si la permission est encore valable
  }

  setInterval(() => { if (registrePartageLie) lireRegistrePartage(false); }, 2 * 60 * 1000);

  // ---- thème clair / sombre ----

  const CLE_THEME = 'theme';

  async function appliquerTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = (theme === 'dark') ? '☀️' : '🌙';
    try {
      if (window.storage) { await window.storage.set(CLE_THEME, theme, false); return; }
    } catch (e) { /* on tente le repli ci-dessous */ }
    try { localStorage.setItem(CLE_THEME, theme); } catch (e) { /* préférence non enregistrée : sans conséquence */ }
  }

  function basculerTheme() {
    const actuel = document.documentElement.getAttribute('data-theme');
    appliquerTheme(actuel === 'dark' ? 'light' : 'dark');
  }

  async function chargerTheme() {
    let theme = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_THEME, false);
        if (res && res.value) theme = res.value;
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (!theme) {
      try { theme = localStorage.getItem(CLE_THEME); } catch (e) { /* aucune préférence enregistrée */ }
    }
    if (!theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
    appliquerTheme(theme === 'dark' ? 'dark' : 'light');
  }

  // ---- barre de progression ----

  function majProgression(pourcent) {
    const barre = document.getElementById('pdf-progress');
    const fill = document.getElementById('pdf-progress-fill');
    if (!barre || !fill) return;
    if (pourcent === null) {                 // progression inconnue (OCR) : animation continue
      barre.classList.add('actif', 'indetermine');
      fill.style.width = '40%';
    } else if (pourcent < 0) {               // terminé
      barre.classList.remove('actif', 'indetermine');
      fill.style.width = '0%';
    } else {
      barre.classList.add('actif');
      barre.classList.remove('indetermine');
      fill.style.width = Math.min(100, Math.round(pourcent)) + '%';
    }
  }

  // ---- raccourcis clavier ----

  document.addEventListener('keydown', (e) => {
    // Échap ferme la boîte de confirmation ouverte.
    if (e.key === 'Escape') {
      const overlay = document.getElementById('confirm-overlay');
      if (overlay && overlay.style.display === 'flex') {
        e.preventDefault();
        annulerConfirmation();
      }
      return;
    }
    // Ctrl/Cmd + S enregistre le dossier en cours de saisie.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      const panneau = document.getElementById('panel');
      if (panneau && panneau.open) {
        e.preventDefault();
        ajouterDossier();
      }
    }
  });

  // ---- installation en application (PWA) ----
  //
  // Le service worker n'est là que pour satisfaire le critère d'installation de Chrome ; l'outil
  // fonctionne à l'identique avec ou sans lui. S'il ne s'enregistre pas (fichier ouvert dans un
  // contexte restreint, navigateur différent…), l'app reste utilisable normalement — seul le
  // bouton "Installer" ne s'affichera pas, sans autre conséquence.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('Service worker non enregistré (l\u2019outil reste utilisable normalement) :', e);
    });
  }

  let evenementInstallation = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evenementInstallation = e;
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'inline-block';
  });

  async function installerApplication() {
    if (!evenementInstallation) return;
    const btn = document.getElementById('install-btn');
    evenementInstallation.prompt();
    const { outcome } = await evenementInstallation.userChoice;
    evenementInstallation = null;
    if (btn) btn.style.display = 'none';
    if (outcome === 'accepted') afficherToast('Application installée — retrouvez-la depuis son icône, sans repasser par Chrome.', 'OK', null);
  }

  // Une fois installée, Chrome ne redéclenche plus l'événement : on masque le bouton pour de bon.
  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'none';
    evenementInstallation = null;
  });

  chargerTheme();
  chargerApprentissage();
  charger().then(() => { revérifierDossiersLiesAuDemarrage(); tenterReconnexionPartage(); });
  renderChips();
