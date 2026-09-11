
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

  // Marqueurs juridiques propres à une vente de lot en copropriété (statut de la loi du 10 juillet
  // 1965), plutôt qu'une simple mention isolée de "copropriété" qui pourrait apparaître pour
  // d'autres raisons (ex. un diagnostic mentionnant un immeuble voisin).
  // Bug corrigé : signalé par l'étude, une vraie vente de lot restait classée "maison" par défaut
  // — la formulation la plus courante ("soumis au régime de la copropriété", juste avant la mention
  // du lot sous le tableau parcellaire) n'était pas reconnue, seul "statut de la copropriété"
  // l'était. "régime de la copropriété" ajouté en conséquence.
  const COPROPRIETE_RE = /lot\s+(?:de\s+)?copropri[ée]t[ée]|r[èe]glement\s+de\s+copropri[ée]t[ée]|syndicat\s+des\s+copropri[ée]taires|[ée]tat\s+descriptif\s+de\s+division|(?:statut|r[ée]gime)\s+de\s+la\s+copropri[ée]t[ée]|loi\s+(?:n[°ºo]\s*)?65-557|loi\s+du\s+10\s+juillet\s+1965/i;

  // Bug corrigé : signalé par l'étude, une vraie maison individuelle (pas de division en lots)
  // ressortait classée "copropriété". La désignation d'une maison comporte très souvent une clause
  // qui écarte explicitement ce statut, précisément pour lever toute ambiguïté — ex. « Le bien
  // vendu n'est pas soumis au statut de la copropriété » — et cette négation contient elle-même le
  // motif recherché par COPROPRIETE_RE, qui se déclenchait donc à tort. À l'inverse, une vraie
  // copropriété décrit le bien par son numéro de lot ET sa quote-part de parties communes
  // (tantièmes/millièmes) — une maison n'a ni l'un ni l'autre. Vérifie donc, pour chaque occurrence
  // de COPROPRIETE_RE, qu'elle n'est pas précédée d'une formule de négation.
  const NEGATION_COPROPRIETE_RE = /(?:n['’]est|n['’]en\s+est|ne\s+sont)\s+pas\s+soumis|non\s+soumis|ne\s+rel[èe]ve(?:nt)?\s+pas|[àa]\s+l['’]exclusion\s+du\s+statut/i;

  function detecterTypeVenteCopropriete(texte) {
    const re = new RegExp(COPROPRIETE_RE.source, 'gi');
    let m;
    while ((m = re.exec(texte)) !== null) {
      const avant = texte.slice(Math.max(0, m.index - 60), m.index);
      if (!NEGATION_COPROPRIETE_RE.test(avant)) return true;
    }
    return false;
  }

  // Adresse du bien : ancrée sur un code postal français (5 chiffres, marqueur fiable et rare
  // ailleurs dans l'acte) précédé de "sis(e) à/au" ou "situé(e) à/au/dans la commune de" — les
  // tournures notariales courantes pour introduire la désignation du bien. Capture tout le
  // fragment jusqu'au code postal puis un peu après (ville), sans dépasser la phrase (borne au
  // point suivant, comme extraireContexte) : un premier jet, pas encore confronté à de vrais
  // compromis autres que ceux déjà vus pour les dates/engagements — à resserrer si un vrai dossier
  // fait remonter un faux positif ou une capture tronquée.
  const ADRESSE_BIEN_RE = /(?:sis|sise|situ[ée]e?)\s+(?:à|a|au|dans\s+la\s+commune\s+de|commune\s+de)\s+([^.\n]{3,120}?\d{5}[^.\n]{0,40})/i;

  function detecterAdresseBien(texte) {
    const m = ADRESSE_BIEN_RE.exec(texte);
    if (!m) return null;
    return m[1].replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '');
  }

  // Prix de vente : le montant en lettres est presque toujours suivi de sa forme chiffrée entre
  // parenthèses (usage notarial constant, ex. "CENT MILLE EUROS (100 000 €)") — bien plus fiable à
  // parser que le nombre écrit en toutes lettres. Cherche "prix" puis, dans les 120 caractères
  // suivants (hors point/retour à la ligne, pour rester dans la même clause), un montant entre
  // parenthèses suivi de €/euros.
  const PRIX_VENTE_RE = /prix[^(.\n]{0,120}\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|euros?)\s*\)/i;

  function detecterPrixVente(texte) {
    const m = PRIX_VENTE_RE.exec(texte);
    if (!m) return null;
    const partieEntiere = m[1].split(',')[0].replace(/[\s.]/g, '');
    const valeur = parseInt(partieEntiere, 10);
    // Un prix de vente immobilier réel ne descend jamais sous 1000 € : filtre les faux positifs
    // (un numéro d'article, une référence de loi capturée par erreur près du mot "prix").
    return Number.isFinite(valeur) && valeur >= 1000 ? valeur : null;
  }

  // Affichage français ("250 000 €", pas de décimales : un prix notarié est toujours un compte
  // rond en euros dans ce contexte). Intl.NumberFormat plutôt qu'un formatage manuel des milliers.
  const FORMAT_PRIX = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  function formaterPrix(valeur) {
    return FORMAT_PRIX.format(valeur);
  }

  // Montant emprunté, lu dans le texte de l'offre de prêt elle-même (pas le compromis) une fois
  // celle-ci retrouvée dans le dossier local relié — voir l'appel dans verifierOffrePret(). Même
  // heuristique que PRIX_VENTE_RE (le montant en lettres est répété en chiffres entre parenthèses,
  // usage constant des établissements prêteurs), ancrée sur le vocabulaire d'une offre de prêt
  // ("montant du prêt", "capital emprunté"...) plutôt que sur "prix", qui n'y apparaît jamais dans
  // ce sens.
  const MONTANT_PRET_RE = /(?:montant\s+(?:du\s+)?(?:pr[êe]t|financement|emprunt[ée]?)|capital\s+emprunt[ée]|somme\s+pr[êe]t[ée]e?)[^(.\n]{0,120}\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|euros?)\s*\)/i;

  function detecterMontantPret(texte) {
    const m = MONTANT_PRET_RE.exec(texte);
    if (!m) return null;
    const partieEntiere = m[1].split(',')[0].replace(/[\s.]/g, '');
    const valeur = parseInt(partieEntiere, 10);
    return Number.isFinite(valeur) && valeur >= 1000 ? valeur : null;
  }

  // Apport estimé une fois l'offre de prêt reçue : ce que le prêt ne couvre pas dans le prix total
  // (frais de notaire et autres coûts annexes non comptés — comparaison volontairement simple,
  // prix du bien contre montant emprunté). Purement informatif, aucune règle métier derrière.
  // Seuils arbitraires mais seules les couleurs déjà réservées ailleurs sont réutilisées : succès
  // (apport confortable), pret/amber (apport faible, à surveiller), urgent (prêt ≥ prix, aucun
  // apport ou financement des frais inclus).
  function calculerApport(d) {
    if (!d.prixVente || !d.montantPret) return null;
    const montant = d.prixVente - d.montantPret;
    const pourcentage = Math.round((montant / d.prixVente) * 100);
    const niveau = pourcentage < 0 ? 'urgent' : (pourcentage < 10 ? 'pret' : 'success');
    return { montant, pourcentage, niveau };
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

  // Repère le style "…ci-après dénommé(e) « le Vendeur »" — avec OU SANS guillemets, formulation
  // tout aussi fréquente ("ci-après dénommé le Vendeur" sans aucune ponctuation particulière) —
  // où le nom de la personne est à chercher AVANT le mot-clé de rôle, pas après : la personne est
  // présentée puis étiquetée, contrairement au style "en-tête" ("LE VENDEUR : M. X né le..."), où
  // le nom suit. Bug corrigé : seul le cas avec guillemets était reconnu, un « ci-après dénommé »
  // sans guillemets retombait à tort sur une recherche en avant.
  function estStyleLabelEntreGuillemets(texte, index) {
    const avant = texte.slice(Math.max(0, index - 60), index);
    return /["«'’]\s*(?:le|la|l['’]|du|des)?\s*$/i.test(avant) ||
      /ci-apr[èe]s\s+d[ée]nomm[ée]e?\s+(?:le|la|l['’])?\s*$/i.test(avant);
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

  // Cherche une adresse email au voisinage de chaque mention de l'acquéreur/bénéficiaire (utile
  // pour préremplir "Email de l'acquéreur", utilisé pour la relance automatique de l'offre de
  // prêt — voir relancerSiOffreManquante). Ancré sur le rôle plutôt qu'un simple "premier email du
  // document" : un compromis contient aussi l'email du vendeur, de l'agence ou du notaire, et rien
  // ne garantit que l'acquéreur soit cité en premier.
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
  function detecterEmailAcquereur(texte) {
    const roleRe = new RegExp(RE_ROLE_ACQUEREUR.source, 'gi');
    let m;
    while ((m = roleRe.exec(texte)) !== null) {
      // Recul borné à la phrase courante (s'arrête au point précédent, comme extraireContexte) :
      // sans ça, l'email du VENDEUR cité juste avant dans le document pouvait être capté à la
      // place de celui de l'ACQUEREUR sur un simple recul à distance fixe.
      let debut = m.index;
      let n = 0;
      while (debut > 0 && n < 150) {
        if (texte[debut - 1] === '.') break;
        debut--; n++;
      }
      const fenetre = texte.slice(debut, m.index + 300);
      const em = fenetre.match(EMAIL_RE);
      if (em) return em[0];
    }
    return null;
  }

  // Pour un rôle donné, trouve le nom de la personne ET le point où s'arrête sa présentation
  // (utile pour ne pas repartir dedans en cherchant l'autre partie). Deux styles rencontrés dans
  // les vrais compromis/promesses :
  //  - "en-tête" : "LE VENDEUR : M. X né le ..." — le nom suit le mot-clé, dans un bloc borné par
  //    le prochain "ci-après dénommé" (voir extraireBlocPartie).
  //  - "étiquette finale" : "M. X né le ..., ci-après dénommé LE PROMETTANT" — le nom est AVANT
  //    le mot-clé. Bug corrigé : en appliquant malgré tout la méthode "en-tête" à ce style, le
  //    bloc borné par le PROCHAIN "ci-après dénommé" empiétait sur la présentation de l'AUTRE
  //    partie (son propre "ci-après dénommé"), ce qui remontait son nom à la place du bon —
  //    reproduit sur une promesse réelle signalée par l'étude (le résultat sortait "NOM / NOM"
  //    avec deux fois le même nom, celui du bénéficiaire). Reconnaître ce style dès ce premier
  //    mot-clé (voir estStyleLabelEntreGuillemets) et chercher directement en arrière l'évite.
  function nomsEtFinPourRole(texte, motRe, apresIndex) {
    const zone = texte.slice(apresIndex);
    const m = zone.match(motRe);
    if (!m) return { noms: [], finAbsolue: apresIndex };
    const indexAbsolu = apresIndex + m.index;
    const finAbsolue = indexAbsolu + m[0].length;
    if (estStyleLabelEntreGuillemets(texte, indexAbsolu)) {
      const fenetreAvant = texte.slice(Math.max(0, indexAbsolu - 250), indexAbsolu);
      const r = trouverNomDansFenetre(fenetreAvant, 'last');
      return { noms: r ? [r.nom] : [], finAbsolue };
    }
    const bloc = extraireBlocPartie(texte, motRe, apresIndex);
    const noms = bloc ? extraireNomsParNaissance(bloc.texte) : [];
    return { noms, finAbsolue: bloc ? bloc.finAbsolue : finAbsolue };
  }

  function detecterNomDossier(texte) {
    const resVendeur = nomsEtFinPourRole(texte, RE_ROLE_VENDEUR, 0);
    let nomsVendeur = resVendeur.noms;

    const resAcquereur = nomsEtFinPourRole(texte, RE_ROLE_ACQUEREUR, resVendeur.finAbsolue);
    let nomsAcquereur = resAcquereur.noms;

    // Repli si aucun des deux styles ci-dessus n'a donné de résultat (autre mise en forme).
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
  // "demande de visite" ajoutée sur retour de l'étude : une clause standard sur l'organisation de
  // visites du bien avant la vente (accès du bien à l'acquéreur/aux diagnostiqueurs...) ne
  // constitue pas un engagement à réclamer après coup, contrairement à une clause de travaux/
  // documents/entretien — elle ne doit jamais ressortir dans les obligations du vendeur.
  const EXCLUSION_ENGAGEMENT_RE = /urbanisme|permis\s+de\s+construire|d[ée]claration\s+pr[ée]alable|droit\s+de\s+pr[ée]emption|\bdia\b|bornage|servitude|cadastr|copropri[ée]t[ée]|syndic|assembl[ée]e\s+g[ée]n[ée]rale|[ée]tat\s+dat[ée]|fonds\s+de\s+travaux|charges\s+de\s+copropri[ée]t[ée]|taxe\s+fonci[èe]re|imp[ôo]t\s+foncier|quitus\s+fiscal|hypoth[ée]|mainlev[ée]e|certificat\s+de\s+radiation|privil[èe]ge\s+de\s+pr[êe]teur|demande\s+de\s+visite/i;

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
        engagements.push({ phrase, type, page: pageDepuisIndex(m.index) });
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
    const page = (typeof e === 'string') ? null : e.page;
    const libelles = { entretien: 'Entretien', travaux: 'Travaux', document: 'Document' };
    const etiquette = type
      ? `<span class="engagement-type ${type}">${libelles[type] || 'Document'}</span>`
      : '';
    // Le clic pour sauter à la page (même mécanisme que creerChip/renderTab pour les dates) n'est
    // possible que si le PDF d'origine est encore chargé en mémoire — jamais le cas sur un dossier
    // déjà enregistré rouvert plus tard (le PDF lui-même n'est pas conservé). Le numéro de page
    // reste malgré tout indiqué dans ce cas, à titre indicatif : c'est justement le cas d'usage le
    // plus courant (relire une clause quelques jours après l'import du compromis).
    const boutonVoir = !page ? '' : pdfActuel
      ? `<button type="button" class="voir-pdf-btn" onclick="allerALaPageDuPdf(${page})">👁 p.${page}</button>`
      : `<span class="chip-page" title="Détecté page ${page} du compromis">p.${page}</span>`;
    return `<div class="analyse-engagement-ligne">${etiquette}<span>${escapeHtml(phrase)}</span>${boutonVoir}</div>`;
  }

  // L'analyse juridique est sa propre étape du wizard (étape 3, voir definirEtapeWizard) — plus un
  // onglet superposé à l'aperçu PDF : aucune étape n'étant verrouillée, elle reste accessible même
  // sans rien à montrer (message d'état vide ci-dessous), pas besoin de la cacher.
  function afficherAnalyseJuridique() {
    const listeDocs = document.getElementById('analyse-documents-liste');
    const note = document.getElementById('analyse-note');
    const vide = document.getElementById('analyse-vide-etat');
    const { documents, engagements, conditions = [] } = analyseJuridiqueActuelle;

    const analyseJuridiqueDisponible = documents.length > 0 || engagements.length > 0 || conditions.length > 0;
    if (vide) vide.style.display = analyseJuridiqueDisponible ? 'none' : 'block';
    if (!analyseJuridiqueDisponible) {
      document.getElementById('analyse-section-conditions').style.display = 'none';
      document.getElementById('analyse-section-engagements').style.display = 'none';
      const sectionDocuments = document.getElementById('analyse-section-documents');
      if (sectionDocuments) sectionDocuments.style.display = 'none';
      note.style.display = 'none';
      return;
    }
    const sectionDocumentsVisible = document.getElementById('analyse-section-documents');
    if (sectionDocumentsVisible) sectionDocumentsVisible.style.display = 'block';

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
      // "au plus tard dans les 60 jours" (ou "dans un délai de 60 jours") : formulation réelle
      // d'une condition suspensive d'obtention de prêt (voir CLAUDE.md — texte anonymisé fourni
      // par l'étude), sans date calendaire NI ancre explicite ("à compter de..." absent ici,
      // contrairement à reDelai ci-dessus). Compté à partir de la signature de la promesse elle-
      // même (« la présente convention… ») faute d'autre point de départ indiqué dans la clause —
      // même convention implicite que les ancres "la présente"/"ce jour" déjà acceptées par
      // reDelai.
      //
      // Bug corrigé : la même promesse porte presque toujours un second délai, avec la même
      // tournure, pour la notification du refus/de l'octroi au notaire (ex. "au plus tard dans les
      // 70 jours, les offres à lui faites ou le refus opposé aux demandes de prêt") — ce n'est PAS
      // la condition elle-même, seulement une formalité de communication qui la suit. Signalé par
      // l'étude : garder les deux (même en signalant une ambiguïté) polluait le champ avec un choix
      // à trancher alors que le bon candidat est déterministe ici — le délai de notification est
      // systématiquement associé à "notifier"/"notification" dans les ~200 caractères qui précèdent
      // (voir la clause réelle ci-dessus), on l'écarte donc totalement plutôt que de le détecter
      // pour ensuite le désambiguïser.
      const reAuPlusTardDelai = /au\s+plus\s+tard\s+dans\s+(?:les?|un\s+d[ée]lai\s+de)\s+(\d{1,3})\s*jours?/gi;
      while ((m = reAuPlusTardDelai.exec(texte)) !== null) {
        const avant = texte.slice(Math.max(0, m.index - 200), m.index);
        if (/notifier|notification/i.test(avant)) continue;
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
    if (type === 'pret') majVisibiliteRappels();
  }

  // Demandé par l'étude : sans condition d'obtention de prêt (achat comptant), la section rappels
  // ne concerne plus ce dossier — retirée de l'étape Finaliser plutôt que laissée visible mais
  // sans effet. `getSelectedReminderDays()` n'est de toute façon plus lue dans ce cas (voir
  // ajouterDossier), ce masquage évite seulement de laisser des cases à cocher trompeuses.
  function majVisibiliteRappels() {
    const fieldset = document.getElementById('rappel-fieldset');
    if (fieldset) fieldset.style.display = echeanceActive.pret ? '' : 'none';
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

    // Uniquement utile s'il y a une condition d'obtention de prêt à relancer (voir le champ
    // lui-même, "pour relance prêt") — inutile de préremplir sans ça.
    const champEmailAcquereur = document.getElementById('f-email-acquereur');
    if (echeanceActive.pret && !champEmailAcquereur.value.trim()) {
      const emailDetecte = detecterEmailAcquereur(texte);
      if (emailDetecte) champEmailAcquereur.value = emailDetecte;
    }

    // Ne bascule que dans un sens (maison → copropriété) : l'absence de ces marqueurs ne prouve
    // pas l'inverse (une vente de maison individuelle ne les mentionne simplement jamais), donc on
    // ne force jamais "maison" par défaut ici, on ne fait que corriger vers "copropriété" quand
    // c'en est manifestement une.
    if (detecterTypeVenteCopropriete(texte)) {
      document.getElementById('f-type-vente').value = 'copropriete';
    }
    majApercuPieces();

    const champAdresse = document.getElementById('f-adresse-bien');
    if (!champAdresse.value.trim()) {
      const adresseDetectee = detecterAdresseBien(texte);
      if (adresseDetectee) champAdresse.value = adresseDetectee;
    }
    const champPrix = document.getElementById('f-prix-vente');
    if (!champPrix.value.trim()) {
      const prixDetecte = detecterPrixVente(texte);
      if (prixDetecte) champPrix.value = String(prixDetecte);
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
  //
  // Décision explicite de l'étude : les dates butoir (prêt/acte/vente) ne doivent JAMAIS être
  // puisées dans les annexes, uniquement dans l'avant-contrat lui-même (compromis/promesse) — le
  // motif ci-dessus (limité à "annexe n°1", chiffre obligatoire) ratait deux cas réels fréquents :
  // une page "ANNEXES" sans numéro qui introduit la liste des pièces jointes, et une pièce jointe
  // qui n'a même pas de renvoi "annexe" et ne se reconnaît qu'à son propre titre de document
  // (diagnostic, plan cadastral...). Les deux gardent le même garde-fou position/longueur.
  const RE_DEBUT_ANNEXE = /\bannexes?\b(?:\s*n[°ºo]?\s*\d+)?|\bpi[èe]ces?\s+annexe(?:s|[ée]s)?\b/i;
  const RE_TITRE_PIECE_JOINTE = /^\s*(?:dossier\s+de\s+diagnostic\s+technique|diagnostic\s+de\s+performance\s+[ée]nerg[ée]tique|[ée]tat\s+des\s+risques(?:\s+et\s+pollutions)?|constat\s+de\s+risque\s+d.exposition\s+au\s+plomb|[ée]tat\s+relatif\s+[àa]\s+la\s+pr[ée]sence\s+de\s+termites|certificat\s+d.urbanisme|r[èe]glement\s+de\s+copropri[ée]t[ée]|extrait\s+(?:du\s+)?plan\s+cadastral|proc[èe]s-verbal\s+d.assembl[ée]e\s+g[ée]n[ée]rale|[ée]tat\s+dat[ée])/i;
  function estDebutPageAnnexe(texteBrut) {
    const m = texteBrut.match(RE_DEBUT_ANNEXE) || texteBrut.match(RE_TITRE_PIECE_JOINTE);
    if (!m) return false;
    return m.index < 120 || texteBrut.trim().length < 300;
  }

  // Bug corrigé, signalé deux fois par l'étude : ces deux motifs (annexe/titre de pièce jointe) ne
  // couvrent pas toutes les trames réelles — sans "Page X sur Y" (voir dernierePageNumerotee dans
  // extraireTextesUtiles) NI titre d'annexe reconnu, aucune coupure ne se déclenchait et le PDF
  // entier (annexes comprises, parfois des centaines de pages) était utilisé pour la détection de
  // dates. La signature de l'acte est un repère bien plus universel qu'un titre de document : quel
  // que soit le modèle, un compromis/promesse se termine TOUJOURS par un bloc de signatures avant
  // toute pièce jointe — jamais l'inverse. Repris et élargi à partir du motif déjà utilisé par
  // ailleurs (voir plus bas, repli OCR de la date de signature) pour rester cohérent.
  const RE_SIGNATURE_ACTE = /sign[ée]\s+[ée]lectroniquement|date\s+et\s+signatures?|dont\s+acte|en\s+foi\s+de\s+quoi|lu\s+et\s+approuv[ée]|bon\s+pour\s+accord|fait\s+et\s+sign[ée]|signature\s+des\s+parties|paraph[ée]\s+et\s+sign[ée]/i;
  function detecteSignatureActe(texteBrut) {
    return RE_SIGNATURE_ACTE.test(texteBrut);
  }

  // Combine les trois repères de fin d'acte trouvés en parcourant le PDF (voir
  // extraireTextesUtiles) — chacun peut manquer selon le modèle de document, mais dès qu'un seul
  // est trouvé, il vaut mieux couper trop tôt (au pire, revérifier une date à la main) que trop
  // tard (une date d'annexe glissée dans les échéances butoir, décision explicite de l'étude). Le
  // plus tôt des repères disponibles l'emporte donc systématiquement.
  function calculerDernierePageUtile(pageAnnexe, pageSignature, dernierePageNumerotee, totalPages) {
    const TAMPON_SIGNATURE = 2; // pages de certificat/signature complémentaires après le repère
    const TAMPON_NUMEROTEE = 3; // même tampon que l'ancien comportement, inchangé
    const candidats = [];
    if (pageAnnexe != null) candidats.push(Math.max(1, pageAnnexe - 1));
    if (pageSignature != null) candidats.push(Math.min(pageSignature + TAMPON_SIGNATURE, totalPages));
    if (dernierePageNumerotee != null) candidats.push(Math.min(dernierePageNumerotee + TAMPON_NUMEROTEE, totalPages));
    return candidats.length ? Math.min(...candidats) : totalPages;
  }

  // Isole le compromis lui-même (+ sa page de signatures) et s'arrête dès la première vraie page
  // d'annexe (voir estDebutPageAnnexe ci-dessus) : un dossier signé électroniquement peut compter
  // plusieurs centaines de pages de diagnostics et autres pièces jointes qui ne nous intéressent
  // ni pour la détection, ni pour l'aperçu.
  async function extraireTextesUtiles(pdf) {
    const textesParPage = [];
    let dernierePageNumerotee = null;
    let pageAnnexe = null;
    let pageSignature = null;
    const PLAFOND_SECURITE = 60;
    const TAMPON_SIGNATURE = 2; // doit rester cohérent avec calculerDernierePageUtile

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

      // Dès qu'une vraie page d'annexe commence, inutile de lire plus loin (diagnostics, plans…
      // potentiellement des centaines de pages) : c'est déjà le repère le plus tôt possible.
      if (estDebutPageAnnexe(texteBrut)) {
        pageAnnexe = i;
        break;
      }

      if (pageSignature === null && detecteSignatureActe(texteBrut)) pageSignature = i;

      // Une fois la signature de l'acte repérée, quelques pages de plus (certificat, dernière
      // signature électronique...) peuvent encore lui appartenir — au-delà, plus la peine de
      // continuer à lire un PDF qui peut compter des centaines de pages d'annexes après coup.
      if (pageSignature !== null && i >= pageSignature + TAMPON_SIGNATURE) break;

      if (i >= PLAFOND_SECURITE * 2) break; // filet de sécurité pour un document sans repère trouvé
    }

    const dernierePageUtile = calculerDernierePageUtile(pageAnnexe, pageSignature, dernierePageNumerotee, textesParPage.length);
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

  // Fait simplement défiler l'aperçu jusqu'à la page indiquée, sans tenter de surligner un passage
  // précis — utilisé pour les engagements du vendeur (renderEngagement), dont la phrase détectée
  // fait plusieurs dizaines/centaines de caractères de texte libre : contrairement à une date
  // (voir voirDateDansPdf ci-dessous, qui cherche le dernier "mot" du texte fourni, en général
  // l'année, un ancrage fiable), il n'y a pas de mot de fin fiable à chercher dans un extrait de
  // clause tronqué à 80 caractères — le tenter produisait une recherche qui échouait presque
  // toujours silencieusement, et risquait même de mal échapper la phrase dans l'attribut onclick.
  function allerALaPageDuPdf(numeroPage) {
    if (!pdfActuel || !numeroPage) return;
    const bloc = document.getElementById('pdf-page-bloc-' + numeroPage);
    if (!bloc) return;
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    document.getElementById('f-type-vente').value = 'maison';
    document.getElementById('f-role-notaire').value = 'instrumentaire';
    majApercuPieces();
    document.getElementById('f-email-acquereur').value = '';
    document.getElementById('f-email').value = EMAIL_RAPPEL_DEFAUT;
    document.getElementById('f-adresse-bien').value = '';
    document.getElementById('f-prix-vente').value = '';
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
    afficherAnalyseJuridique();
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
    const typeVente = document.getElementById('f-type-vente').value;
    const roleNotaire = document.getElementById('f-role-notaire').value;
    const responsable = document.getElementById('f-responsable').value.trim();
    const emailAcquereur = document.getElementById('f-email-acquereur').value.trim();
    const adresseBien = document.getElementById('f-adresse-bien').value.trim();
    const prixVenteBrut = document.getElementById('f-prix-vente').value.trim();
    const prixVente = prixVenteBrut ? parseInt(prixVenteBrut.replace(/[^\d]/g, ''), 10) : null;
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
      adresseBien,
      prixVente: Number.isFinite(prixVente) && prixVente > 0 ? prixVente : null,
      montantPret: null,
      typeVente,
      roleNotaire,
      pieces: {},
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
      // Pas de section rappels sans condition de prêt (voir majVisibiliteRappels) : aucun rappel
      // pour ce dossier, plutôt que de lire des cases à cocher restées invisibles/non pertinentes.
      reminderDays: echeanceActive.pret ? getSelectedReminderDays() : [],
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

  function renderTab(type, label, iso, dossierId, page, confiance, autreIndex, offrePretRecue, offreBloc) {
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
        <span class="tab-date-affichage" id="${idBase}-aff"><div class="tab-date">Non renseigné</div>${crayonDate}${badgeConfiance}</span>
        ${editionDate}
        ${offreBloc || ''}
      </div>`;
    }
    const jours = joursRestants(iso);
    let countdownClass = '';
    let countdownText = '';
    // Une fois l'offre de prêt confirmée reçue, la date de cette échéance n'a plus lieu d'être
    // signalée comme "dépassée" (condition résolue, pas un retard) — signalé par l'étude sur la
    // fiche dépliée d'un dossier avec offre reçue. Bug corrigé : le décompte affichait alors
    // "✓ Offre reçue" ET offreBloc affichait juste en dessous le même statut en toutes lettres
    // ("✓ Offre de prêt reçue") — doublon signalé par l'étude. Le décompte est masqué dans ce cas
    // (rien à ajouter à ce que dit déjà offreBloc), plutôt que de répéter l'information.
    const decompteMasque = offrePretRecue;
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
      <span class="tab-date-affichage" id="${idBase}-aff"><div class="tab-date">${formatDateFr(iso)}${boutonVoir}</div>${crayonDate}${badgeConfiance}</span>
      ${editionDate}
      ${decompteMasque ? '' : `<div class="tab-countdown ${countdownClass}">${countdownText}</div>`}
      ${offreBloc || ''}
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

  // Corrections après coup du type de vente et du rôle de l'étude — utile quand l'un des deux a
  // été mal renseigné à la création, ou change en cours de dossier (ex. l'étude devient
  // instrumentaire après avoir démarré en participant). Un simple <select> suffit ici (pas besoin
  // du mécanisme crayon+validation utilisé pour le nom/les dates) : ce sont des choix fermés à deux
  // valeurs, pas du texte libre où un clic accidentel risquerait de tout effacer.
  function changerTypeVente(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || d.typeVente === valeur) return;
    const libelle = (v) => v === 'copropriete' ? 'copropriété' : 'maison';
    ajouterHistorique(d, `Type de vente modifié : ${libelle(d.typeVente)} → ${libelle(valeur)}`);
    // La checklist de pièces (checklistPieces) est recalculée à partir de d.typeVente à chaque
    // affichage : pas besoin de retoucher d.pieces ici. Les pièces déjà reconnues sous une clé
    // commune aux deux types (ex. titrePropriete) restent valables ; celles propres à l'ancien type
    // (ex. etatDate en quittant la copropriété) restent en mémoire mais ne s'affichent plus,
    // inoffensif si l'étude revient un jour au type précédent.
    d.typeVente = valeur;
    sauvegarder();
    render();
  }

  function changerRoleNotaire(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || d.roleNotaire === valeur) return;
    const libelle = (v) => v === 'participant' ? 'participant' : 'instrumentaire';
    ajouterHistorique(d, `Rôle de l'étude modifié : ${libelle(d.roleNotaire)} → ${libelle(valeur)}`);
    d.roleNotaire = valeur;
    sauvegarder();
    render();
  }

  // Même motif que changerTypeVente/changerRoleNotaire : un dossier peut changer de main en cours
  // de suivi (absence, réaffectation) sans repasser par la création.
  function changerResponsable(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || (d.responsable || '') === valeur) return;
    ajouterHistorique(d, `Responsable modifié : ${d.responsable || '— à définir —'} → ${valeur || '— à définir —'}`);
    d.responsable = valeur;
    sauvegarder();
    render();
  }

  // Adresse et prix : détectés automatiquement à l'import (voir detecterAdresseBien/
  // detecterPrixVente, premier jet sur des regex pas encore éprouvées sur beaucoup de compromis
  // réels), donc corrigeables directement sur la fiche — mêmes principes que Responsable/Type de
  // vente ci-dessus, mais en champ texte libre plutôt qu'un choix fermé.
  function changerAdresseBien(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouvelle = valeur.trim();
    if (nouvelle === (d.adresseBien || '')) return;
    ajouterHistorique(d, `Adresse du bien modifiée`);
    d.adresseBien = nouvelle;
    sauvegarder();
    render();
  }

  function changerPrixVente(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const chiffres = valeur.replace(/[^\d]/g, '');
    const nouveau = chiffres ? parseInt(chiffres, 10) : null;
    const normalise = Number.isFinite(nouveau) && nouveau > 0 ? nouveau : null;
    if (normalise === (d.prixVente || null)) { render(); return; }
    ajouterHistorique(d, `Prix de vente modifié : ${d.prixVente ? formaterPrix(d.prixVente) : '—'} → ${normalise ? formaterPrix(normalise) : '—'}`);
    d.prixVente = normalise;
    sauvegarder();
    render();
  }

  function calculerProchaineEcheance(d) {
    const autresDates = (d.autres || []).map(a => a.date);
    // Une fois l'offre de prêt reçue, cette échéance est résolue : elle ne doit plus faire
    // considérer le dossier comme "urgent" ni ressortir en tête de tri à sa place (voir aussi
    // prochaineEcheanceDetail, même exclusion pour l'affichage).
    const datePret = d.offrePretStatut === 'recue' ? null : d.pret;
    const dates = [datePret, d.acte, d.ventebien, ...autresDates].filter(Boolean).map(joursRestants);
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

  // Chiffres de synthèse du portefeuille (dossiers actifs, hors filtres/recherche de la liste) —
  // calculés une seule fois, partagés par le bandeau de l'onglet "Suivi" (renderStatsSuivi) et les
  // tuiles KPI du "Tableau de bord" (renderKpisDashboard), pour ne jamais faire diverger ces deux
  // lectures d'un même portefeuille.
  function calculerStatsPortefeuille(dossiersActifs) {
    const dansNJours = (n) => dossiersActifs.filter(d => {
      const prochaine = prochaineEcheanceDetail(d);
      return prochaine && prochaine.jours <= n;
    }).length;
    const urgents = dansNJours(7);
    const urgents15 = dansNJours(15);
    const avecPret = dossiersActifs.filter(d => !d.sansPret);
    const manquantes = avecPret.filter(d => d.offrePretStatut === 'manquante').length;
    const aVerifier = avecPret.filter(d => (d.offrePretStatut || 'inconnu') === 'inconnu').length;
    // Même condition que statutDossier() : uniquement une fois relié, hors rôle participant.
    const piecesIncompletes = dossiersActifs.filter(d => d.dossierLie && d.roleNotaire !== 'participant' &&
      checklistPieces(d.typeVente).some(p => (d.pieces || {})[p.cle] !== 'recue')).length;
    return { actifs: dossiersActifs.length, urgents, urgents15, manquantes, aVerifier, piecesIncompletes };
  }

  // Bandeau de synthèse en tête de l'onglet "Suivi des dossiers" : donne un état global du
  // portefeuille (dossiers actifs, hors filtres/recherche de la liste) avant de la parcourir.
  function renderStatsSuivi(dossiersActifs) {
    const bloc = document.getElementById('stats-suivi');
    if (!bloc) return;

    const { actifs, urgents, manquantes, aVerifier } = calculerStatsPortefeuille(dossiersActifs);
    const tuiles = [
      ['c-neutre', actifs, actifs > 1 ? 'dossiers actifs' : 'dossier actif'],
      ['c-urgent', urgents, 'échéances ≤ 7 jours'],
      ['c-pret', manquantes, 'offres de prêt introuvables'],
      ['c-neutre', aVerifier, 'offres à vérifier']
    ];
    bloc.innerHTML = tuiles.map(([cls, valeur, libelle]) =>
      `<div class="stat-tile"><div class="stat-num ${cls}">${valeur}</div><div class="stat-label">${libelle}</div></div>`
    ).join('');
  }

  // Tuiles KPI du "Tableau de bord" : mêmes chiffres que renderStatsSuivi (calculerStatsPortefeuille),
  // avec une 5e tuile propre au tableau de bord (pièces manquantes) — l'aperçu d'ensemble le plus
  // synthétique de l'outil, avant même d'ouvrir un dossier.
  // Icône calendrier commune aux deux tuiles d'échéances (7j/15j) avec le seuil incrusté dedans,
  // plutôt que deux emojis différents (⏱️/📅) sans lien visuel entre les deux — demandé par
  // l'étude pour rendre évident que ce sont deux variantes de la même mesure. Un vrai SVG dessiné à
  // la main, pas l'emoji 📅 : ce dernier porte déjà son propre numéro de jour selon la plateforme
  // (souvent "17"), qui se superposait de façon illisible à celui qu'on voulait y afficher.
  function iconeCalendrierSeuil(jours) {
    return `<svg class="kpi-icone kpi-icone-calendrier" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="2.3" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <rect x="1" y="2.3" width="14" height="3.4" rx="1.1" fill="currentColor" opacity="0.28" stroke="none"/>
      <line x1="4.3" y1="1" x2="4.3" y2="3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="11.7" y1="1" x2="11.7" y2="3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <text x="8" y="12.3" text-anchor="middle" font-size="6.6" font-weight="800" fill="currentColor">${jours}</text>
    </svg>`;
  }

  function renderKpisDashboard(dossiersActifs) {
    const bloc = document.getElementById('kpis-dashboard');
    if (!bloc) return;
    const { actifs, urgents, urgents15, manquantes, aVerifier, piecesIncompletes } = calculerStatsPortefeuille(dossiersActifs);
    const tuiles = [
      ['c-neutre', actifs, actifs > 1 ? 'dossiers actifs' : 'dossier actif', '<span class="kpi-icone">📁</span>'],
      ['c-urgent', urgents, 'échéances ≤ 7 jours', iconeCalendrierSeuil(7)],
      ['c-urgent', urgents15, 'échéances ≤ 15 jours', iconeCalendrierSeuil(15)],
      ['c-pret', manquantes, 'offres de prêt introuvables', '<span class="kpi-icone">⚠️</span>'],
      ['c-neutre', aVerifier, 'offres à vérifier', '<span class="kpi-icone">🔎</span>'],
      ['c-pret', piecesIncompletes, 'dossiers avec pièces manquantes', '<span class="kpi-icone">📋</span>']
    ];
    bloc.innerHTML = tuiles.map(([cls, valeur, libelle, iconeHtml]) =>
      `<div class="kpi-tile">${iconeHtml}<div class="kpi-num ${cls}">${valeur}</div><div class="kpi-label">${libelle}</div></div>`
    ).join('');
  }

  // "Actions urgentes" du tableau de bord : les dossiers qui méritent une attention immédiate,
  // au même sens que le score de calculerPriorite() et le badge "🔥 Prioritaire" déjà utilisés sur
  // les résumés du Suivi — un seul et même critère d'urgence dans tout l'outil, pas une seconde
  // définition inventée pour le tableau de bord.
  function renderActionsUrgentes(dossiersActifs) {
    const bloc = document.getElementById('actions-urgentes');
    if (!bloc) return;
    const urgents = dossiersActifs
      .filter(d => statutDossier(d) === 'blocage' || calculerPriorite(d) >= SEUIL_PRIORITE_ELEVEE)
      .sort((a, b) => calculerPriorite(b) - calculerPriorite(a))
      .slice(0, 6);

    if (urgents.length === 0) {
      bloc.innerHTML = '<div class="actions-urgentes-vide">✓ Aucune action urgente pour le moment.</div>';
      return;
    }
    bloc.innerHTML = urgents.map(d => {
      const prochaine = prochaineEcheanceDetail(d);
      let raison;
      if (d.accesAReconfirmer) raison = "Accès au dossier local à reconfirmer";
      else if (!d.sansPret && d.offrePretStatut === 'manquante') raison = "Offre de prêt introuvable";
      else if (prochaine && prochaine.jours < 0) raison = "Échéance dépassée";
      else if (prochaine) raison = `${escapeHtml(prochaine.label)} — J-${prochaine.jours}`;
      else raison = "À vérifier";
      return `
        <button type="button" class="action-urgente-ligne" onclick="ouvrirDossierDepuisDashboard('${d.id}')">
          ${renderBadgeStatut(d)}
          <span class="action-urgente-nom">${escapeHtml(d.nom)}</span>
          <span class="action-urgente-raison">${raison}</span>
          <span class="action-urgente-fleche">→</span>
        </button>`;
    }).join('');
  }

  // Ouvre un dossier depuis le tableau de bord : bascule vers le Suivi et déplie directement la
  // ligne concernée (dossiersDeplies avant le render() suivant, même mécanisme que le dépliage
  // manuel d'une ligne — voir toggleLigneDossier).
  function ouvrirDossierDepuisDashboard(id) {
    dossiersDeplies.add(id);
    definirOnglet('suivi');
    const cible = document.getElementById('mini-' + id) || document.getElementById('detail-' + id);
    if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    for (let i = 1; i <= 4; i++) {
      document.getElementById('wizard-step-' + i).classList.toggle('actif', i === n);
      document.getElementById('wizard-step-btn-' + i).classList.toggle('actif', i === n);
    }
    if (n === 4) majApercuPieces();
    const wrap = document.querySelector('.wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Aperçu (lecture seule) de la checklist de pièces attendue pour le type de vente choisi à
  // l'étape "Finaliser" — avant même l'enregistrement du dossier, pour que le type de vente ne
  // soit pas un choix fait à l'aveugle. Les vraies pièces ne sont vérifiées qu'une fois le dossier
  // enregistré et relié à un dossier local (voir renderPiecesDossier/verifierPiecesDossier).
  function majApercuPieces() {
    const select = document.getElementById('f-type-vente');
    const roleSelect = document.getElementById('f-role-notaire');
    const bloc = document.getElementById('pieces-apercu');
    if (!select || !bloc) return;
    // Notaire participant/concourant : l'étude ne constitue pas le dossier complet, seuls le prêt
    // et les engagements du vendeur (analyse juridique) la concernent — la checklist de pièces ne
    // s'applique qu'au notaire instrumentaire, qui reçoit l'acte.
    if (roleSelect && roleSelect.value === 'participant') {
      bloc.innerHTML = `<div class="pieces-apercu-titre">Notaire participant : pas de checklist de pièces — seuls l'offre de prêt et les engagements du vendeur seront suivis.</div>`;
      return;
    }
    const checklist = checklistPieces(select.value);
    bloc.innerHTML = `
      <div class="pieces-apercu-titre">Pièces attendues pour ce type de vente (${checklist.length}) :</div>
      <div class="pieces-liste">
        ${checklist.map(p => `<span class="piece-item inconnu"><span class="piece-icone">?</span>${escapeHtml(p.label)}</span>`).join('')}
      </div>
    `;
  }

  // Sidebar repliée hors écran sous ~900px (voir style.css) : ce bouton/scrim la fait glisser à
  // l'écran sans changer sa structure ni dupliquer la navigation pour mobile.
  function toggleSidebarMobile(forcerOuvert) {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebar-scrim');
    const ouverte = typeof forcerOuvert === 'boolean' ? forcerOuvert : !sidebar.classList.contains('ouverte');
    sidebar.classList.toggle('ouverte', ouverte);
    scrim.classList.toggle('visible', ouverte);
  }

  function definirOnglet(nom) {
    // Sur mobile, choisir une section referme la sidebar repliable (voir toggleSidebarMobile).
    toggleSidebarMobile(false);
    document.getElementById('onglet-dashboard').style.display = nom === 'dashboard' ? '' : 'none';
    document.getElementById('onglet-nouveau').style.display = nom === 'nouveau' ? '' : 'none';
    document.getElementById('onglet-suivi').style.display = nom === 'suivi' ? '' : 'none';
    document.getElementById('tab-dashboard').setAttribute('aria-selected', String(nom === 'dashboard'));
    document.getElementById('tab-nouveau').setAttribute('aria-selected', String(nom === 'nouveau'));
    document.getElementById('tab-suivi').setAttribute('aria-selected', String(nom === 'suivi'));
    document.getElementById('tab-dashboard').classList.toggle('actif', nom === 'dashboard');
    document.getElementById('tab-nouveau').classList.toggle('actif', nom === 'nouveau');
    document.getElementById('tab-suivi').classList.toggle('actif', nom === 'suivi');
    if (nom === 'suivi' || nom === 'dashboard') render();
  }

  // Détermine, parmi les échéances d'un dossier, la plus proche à afficher en un coup d'œil dans
  // la vue tableau (celle déjà retenue pour le tri par calculerProchaineEcheance, mais avec son
  // type/libellé/date en plus, pas seulement le nombre de jours).
  function prochaineEcheanceDetail(d) {
    const items = [
      // Une offre déjà reçue clôt cette échéance : la garder ici referait apparaître "Obtention du
      // prêt" comme la prochaine chose à surveiller alors qu'il n'y a plus rien à y suivre — on
      // passe directement à la suivante (acte, vente préalable...), voir calculerProchaineEcheance.
      ...(d.offrePretStatut === 'recue' ? [] : [{ type: 'pret', label: 'Obtention du prêt', iso: d.pret }]),
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
    if (d.accesAReconfirmer) score += 40;
    return score;
  }

  // Statut de synthèse ("où en est ce dossier ?"), distinct du score de priorité qui sert au tri :
  // celui-ci répond d'un coup d'œil plutôt que de classer.
  const LIBELLES_STATUT = {
    pret: { emoji: '🟢', texte: 'Prêt', cls: 'statut-pret' },
    aconfirmer: { emoji: '🟡', texte: 'À confirmer', cls: 'statut-aconfirmer' },
    blocage: { emoji: '🔴', texte: 'Blocage', cls: 'statut-blocage' },
    archive: { emoji: '🔒', texte: 'Archivé', cls: 'statut-archive' }
  };
  // Logique donnée explicitement par l'étude, fondée uniquement sur les documents effectivement
  // retrouvés (offre de prêt + checklist de pièces), pas sur les échéances ni la confiance des
  // dates détectées (ces deux derniers signaux restent visibles ailleurs — bandeau "accès à
  // reconfirmer", badge "⚠️ à vérifier"/"≈ estimée" sur la date elle-même — la synthèse ne les
  // duplique plus) :
  //   🟢 vert    : toutes les pièces attendues sont trouvées — on peut signer.
  //   🟡 orange  : il en manque encore (offre, urbanisme...) — état intermédiaire.
  //   🔴 rouge   : aucun document n'a été trouvé.
  // Un dossier jamais relié à un dossier local (rien n'a pu être vérifié) n'est pas pénalisé pour
  // autant : on ne peut pas dire "rien trouvé" tant que rien n'a été cherché — même principe déjà
  // appliqué à l'offre de prêt "inconnue" ailleurs dans l'outil (voir renderStatsSuivi). Un dossier
  // sans rien à vérifier (achat comptant + rôle participant, qui ne suit pas la checklist de
  // pièces) est trivialement "prêt".
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
    // La checklist de pièces ne compte que si le dossier a déjà été relié à un dossier local au
    // moins une fois : sur un dossier jamais relié, aucune pièce n'a pu être recherchée — ce n'est
    // pas une absence, juste une vérification qui n'a pas encore eu lieu.
    if (d.dossierLie && d.roleNotaire !== 'participant') {
      checklistPieces(d.typeVente).forEach(p => items.push((d.pieces || {})[p.cle] || 'inconnu'));
    }
    if (items.length === 0 || items.every(s => s === 'recue')) return 'pret';

    const verifies = items.filter(s => s !== 'inconnu');
    if (verifies.length === 0) return 'aconfirmer';
    if (verifies.every(s => s === 'manquante')) return 'blocage';
    return 'aconfirmer';
  }

  // Chrome ne conserve l'autorisation d'accès à un dossier local que le temps de la session : elle
  // est systématiquement redemandée après un redémarrage du navigateur, dossier par dossier (voir
  // CLAUDE.md — limitation du navigateur, pas un bug applicatif). Sur un portefeuille d'une
  // soixantaine de dossiers actifs, cliquer sur chacun est fastidieux : ce bandeau permet de tous
  // les reconfirmer en un seul clic plutôt qu'un par dossier.
  // Message du bandeau (et de la popup de démarrage, voir plus bas) : décrit ce qu'il y a à
  // reconfirmer, dossiers locaux et/ou registre partagé, sans jamais désigner l'un si seul l'autre
  // est concerné.
  function messageAccesAReconfirmer(nbDossiers, partageAConfirmer) {
    const morceaux = [];
    if (nbDossiers > 0) morceaux.push(`${nbDossiers} dossier${nbDossiers > 1 ? 's' : ''} local${nbDossiers > 1 ? 'aux' : ''} relié${nbDossiers > 1 ? 's' : ''}`);
    if (partageAConfirmer) morceaux.push('le registre partagé');
    return `🔑 L'accès à ${morceaux.join(' et à ')} doit être reconfirmé (redemandé par le navigateur à chaque redémarrage).`;
  }

  function renderAlerteAcces(dossiersActifs) {
    const bloc = document.getElementById('alerte-acces');
    if (!bloc) return;
    const nb = dossiersActifs.filter(d => d.accesAReconfirmer).length;
    const partageAConfirmer = registrePartageLie && registrePartageAccesAReconfirmer;
    if (nb === 0 && !partageAConfirmer) { bloc.style.display = 'none'; return; }
    bloc.style.display = 'flex';
    bloc.innerHTML = `
      <span>${messageAccesAReconfirmer(nb, partageAConfirmer)}</span>
      <button type="button" class="toolbar-btn" onclick="reconfirmerTousLesAcces()">Reconfirmer tous les accès</button>
    `;
  }

  // Un seul clic déclenche une demande de permission par dossier concerné (et, le cas échéant, par
  // le registre partagé), à la suite : Chrome autorise plusieurs appels de ce type tant qu'ils
  // restent proches du geste utilisateur d'origine (contrairement à des API à usage unique comme
  // requestFullscreen). Si l'activation expire avant la fin (portefeuille très volumineux), les
  // dossiers restants gardent leur bouton individuel.
  //
  // Bug corrigé : signalé par l'étude, le clic redemandait malgré tout l'accès "dossier par
  // dossier" au lieu d'un seul geste pour tous. Cause réelle : la version précédente demandait la
  // permission d'UN dossier PUIS lisait aussitôt tous ses PDF (potentiellement plusieurs secondes,
  // OCR compris) avant de passer au dossier suivant — largement de quoi épuiser la fenêtre de
  // "user activation" du clic d'origine, qui expire en quelques secondes. Chrome refusait alors
  // silencieusement les requestPermission() suivants, chacun nécessitant un nouveau clic. Corrigé
  // en séparant strictement les deux phases : (1) demander toutes les permissions à la suite, sans
  // rien faire d'autre entre deux — cette phase seule reste assez rapide pour tenir dans la
  // fenêtre d'activation d'un portefeuille réaliste — puis (2) lire les PDF de ce qui a été
  // accordé, qui peut prendre tout le temps voulu une fois la permission acquise.
  async function reconfirmerTousLesAcces() {
    const dossiersAConfirmer = dossiers.filter(x => x.accesAReconfirmer);
    const idsAccordes = [];
    for (const d of dossiersAConfirmer) {
      const handle = await recupererHandle(d.id);
      if (!handle) { d.dossierLie = false; continue; }
      const permission = await handle.requestPermission({ mode: 'read' });
      if (permission === 'granted') {
        d.accesAReconfirmer = false;
        idsAccordes.push(d.id);
      }
    }
    const partageHandle = (registrePartageLie && registrePartageAccesAReconfirmer)
      ? await obtenirHandlePartage(true) : null;
    render();

    for (const id of idsAccordes) {
      await verifierOffrePret(id, false);
      await verifierPiecesDossier(id, false);
    }
    if (partageHandle) {
      await lireRegistrePartage(false);
      majStatutPartage();
    }
    render();
  }

  // Popup de démarrage : appelée une fois que charger()/revérifierDossiersLiesAuDemarrage()/
  // tenterReconnexionPartage() ont fini (voir tout en bas du fichier), donc une fois qu'on sait
  // réellement si un accès a été perdu — pas de popup "au hasard" si tout est encore valide.
  function afficherPopupAccesSiNecessaire() {
    const nb = dossiers.filter(d => !d.archive && d.accesAReconfirmer).length;
    const partageAConfirmer = registrePartageLie && registrePartageAccesAReconfirmer;
    if (nb === 0 && !partageAConfirmer) return;
    const el = document.getElementById('popup-acces-message');
    const overlay = document.getElementById('popup-acces-overlay');
    if (!el || !overlay) return;
    el.textContent = messageAccesAReconfirmer(nb, partageAConfirmer);
    overlay.style.display = 'flex';
  }

  function fermerPopupAcces() {
    const overlay = document.getElementById('popup-acces-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function reconfirmerDepuisPopup() {
    fermerPopupAcces();
    await reconfirmerTousLesAcces();
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
    const filtreRole = document.getElementById('filtre-role').value;

    const dossiersActifs = dossiers.filter(d => !d.archive);
    renderDashboard(dossiersActifs);
    renderStatsSuivi(dossiersActifs);
    renderAlerteAcces(dossiersActifs);
    renderKpisDashboard(dossiersActifs);
    renderActionsUrgentes(dossiersActifs);

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
      if (filtreRole && (d.roleNotaire || 'instrumentaire') !== filtreRole) return false;
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

    // Vue "Cartes" retirée sur demande de l'étude (préférence pour la vue tableau, plus dense sur
    // un portefeuille d'une soixantaine de dossiers) : le tableau est désormais la seule vue.
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
        <td><div class="dossier-nom-tableau">${renderBadgeStatut(d)}${escapeHtml(d.nom)}${prioritaire ? '<span class="badge-prioritaire" title="Prioritaire : échéance proche, offre de prêt manquante et/ou accès local à reconfirmer">🔥</span>' : ''}</div></td>
        <td class="dossier-responsable-tableau">${escapeHtml(d.responsable || '—')}</td>
        <td>
          ${prochaine
            ? `<span class="type-pill ${prochaine.type}"><span class="dot"></span>${escapeHtml(prochaine.label)}</span>
               <span class="echeance-jours ${prochaine.jours <= 3 ? 'urgent' : 'calme'}">${formatDateFr(prochaine.iso)} (${prochaine.jours < 0 ? 'dépassée' : prochaine.jours === 0 ? "aujourd'hui" : 'J-' + prochaine.jours})</span>`
            : '<span class="echeance-jours calme">—</span>'}
        </td>
        <td>
          ${d.sansPret ? '<span class="echeance-jours calme">Comptant — sans prêt</span>' : `<span class="badge-offre ${offre.cls}">${offre.texte}</span>`}
          ${(!d.sansPret && d.dossierLie) ? `<button type="button" class="action-rapide" onclick="event.stopPropagation(); verifierOffrePretDepuisBouton('${d.id}', this)">Revérifier</button>` : ''}
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

  function libellePiece(statut) {
    if (statut === 'recue') return { texte: '✓', cls: 'recue', titre: 'Pièce reçue' };
    if (statut === 'manquante') return { texte: '✕', cls: 'manquante', titre: 'Pièce manquante' };
    return { texte: '?', cls: 'inconnu', titre: "Pas encore vérifié — reliez un dossier local et cliquez sur \"Revérifier les pièces\"" };
  }

  // Checklist de constitution du dossier (voir CLAUDE.md) : contrairement à l'analyse juridique
  // (déduite des clauses du compromis), c'est une liste fixe déterminée par le type de vente, pas
  // une extraction — un dossier peut très bien n'avoir aucune pièce reconnue sans que ce soit une
  // anomalie tant qu'il n'a pas été relié à un dossier local (statut "inconnu", pas "manquante").
  function renderPiecesDossier(d) {
    const checklist = checklistPieces(d.typeVente);
    const pieces = d.pieces || {};
    const nbRecues = checklist.filter(p => pieces[p.cle] === 'recue').length;
    const complet = nbRecues === checklist.length;
    const libelleType = d.typeVente === 'copropriete' ? 'copropriété' : 'maison';
    return `
      <div class="pieces-dossier">
        <div class="pieces-dossier-titre">
          <span>📁 Pièces du dossier (${libelleType})</span>
          <span class="pieces-compteur${complet ? ' complet' : ''}">${nbRecues}/${checklist.length}</span>
          ${(DOSSIER_FS_SUPPORTE && d.dossierLie) ? `<button type="button" class="action-rapide" onclick="verifierPiecesDossierDepuisBouton('${d.id}', this)">Revérifier les pièces</button>` : ''}
        </div>
        <div class="pieces-liste">
          ${checklist.map(p => {
            const s = libellePiece(pieces[p.cle] || 'inconnu');
            // Une pièce reçue est cliquable pour rouvrir directement le fichier local où elle a
            // été trouvée (voir ouvrirPieceTrouvee) — les autres statuts (manquante/inconnu)
            // restent un simple badge, rien à ouvrir.
            return s.cls === 'recue'
              ? `<button type="button" class="piece-item ${s.cls}" title="Cliquer pour ouvrir le fichier trouvé" onclick="ouvrirPieceTrouvee('${d.id}', '${p.cle}')"><span class="piece-icone">${s.texte}</span>${escapeHtml(p.label)}</button>`
              : `<span class="piece-item ${s.cls}" title="${escapeAttr(s.titre)}"><span class="piece-icone">${s.texte}</span>${escapeHtml(p.label)}</span>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderCarteDossier(d) {
      const confiance = d.confiance || {};
      const historique = d.historique || [];
      const analyse = d.analyseJuridique || { documents: [], engagements: [], conditions: [] };
      const analyseConditions = analyse.conditions || [];
      const boutonsDossierLocal = DOSSIER_FS_SUPPORTE ? (d.dossierLie
          ? `<button type="button" class="lien-dossier-local" onclick="changerDossierLocal('${d.id}')">Changer de dossier</button>`
          // Même sans prêt (achat comptant), le dossier local reste nécessaire pour suivre
          // la checklist de pièces (urbanisme...) — voir renderPiecesDossier ci-dessous.
          : `<button type="button" class="lien-dossier-local" onclick="lierDossierLocal('${d.id}')">🔗 Lier un dossier local</button>`) : '';
      // Statut de l'offre + "Revérifier", affiché directement sous la date dans la carte "Obtention
      // du prêt" (voir renderTab, paramètre offreBloc) — demandé par l'étude, plutôt que sa position
      // précédente dans l'en-tête, éloignée de l'échéance qu'elle concerne.
      const offreBloc = (!d.sansPret && d.dossierLie) ? `
        <div class="tab-offre-pret">
          ${d.offrePretStatut === 'recue'
              ? `<button type="button" class="badge-offre ${libelleOffre(d.offrePretStatut).cls}" title="Cliquer pour ouvrir le fichier trouvé" onclick="ouvrirOffreTrouvee('${d.id}')">${libelleOffre(d.offrePretStatut).texte}</button>`
              : `<span class="badge-offre ${libelleOffre(d.offrePretStatut).cls}">${libelleOffre(d.offrePretStatut).texte}</span>`}
          <button type="button" class="lien-dossier-local" onclick="verifierOffrePretDepuisBouton('${d.id}', this)">Revérifier</button>
        </div>` : '';
      return `
      <div class="dossier${d.archive ? ' est-archive' : ''}">
        <div class="dossier-head">
          <div class="dossier-head-principale">
            <div class="nom-dossier">
              <span class="nom-affichage" id="nom-affichage-${d.id}">
                ${renderBadgeStatut(d)}
                <span class="nom-texte">${escapeHtml(d.nom)}</span>
                <button type="button" class="icon-crayon" onclick="activerEditionNom('${d.id}')" title="Modifier le nom" aria-label="Modifier le nom">✏️</button>
              </span>
              <span class="nom-edition" id="nom-edition-${d.id}" hidden>
                <input type="text" class="dossier-nom-input" id="nom-input-${d.id}" value="${escapeAttr(d.nom)}" aria-label="Nom du dossier" onkeydown="if(event.key==='Enter'){event.preventDefault();validerEditionNom('${d.id}');}else if(event.key==='Escape'){annulerEditionNom('${d.id}');}">
                <button type="button" class="icon-valider" onclick="validerEditionNom('${d.id}')" title="Valider" aria-label="Valider le nom">✓</button>
              </span>
              ${boutonsDossierLocal}
            </div>
            ${d.roleNotaire === 'participant' ? '<span class="badge-role" title="Notaire participant / concourant : suivi limité au prêt et aux engagements du vendeur">🤝 Participant</span>' : ''}
            <div class="addr dossier-classification">
              📍 <input type="text" class="input-inline champ-adresse-bien" value="${escapeAttr(d.adresseBien || '')}" placeholder="Adresse du bien non détectée" aria-label="Adresse du bien" onblur="changerAdresseBien('${d.id}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
              · 💶 <input type="text" class="input-inline champ-prix-vente" value="${d.prixVente ? formaterPrix(d.prixVente) : ''}" placeholder="Prix non détecté" aria-label="Prix de vente" onblur="changerPrixVente('${d.id}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
              ·
              Type de vente :
              <select class="select-edit" onchange="changerTypeVente('${d.id}', this.value)" aria-label="Type de vente">
                <option value="maison" ${d.typeVente === 'copropriete' ? '' : 'selected'}>Maison</option>
                <option value="copropriete" ${d.typeVente === 'copropriete' ? 'selected' : ''}>Copropriété</option>
              </select>
              · Rôle du notaire :
              <select class="select-edit" onchange="changerRoleNotaire('${d.id}', this.value)" aria-label="Rôle de l'étude sur ce dossier">
                <option value="instrumentaire" ${d.roleNotaire === 'participant' ? '' : 'selected'}>Instrumentaire</option>
                <option value="participant" ${d.roleNotaire === 'participant' ? 'selected' : ''}>Participant</option>
              </select>
              · Responsable :
              <select class="select-edit" onchange="changerResponsable('${d.id}', this.value)" aria-label="Responsable du dossier">
                <option value="" ${d.responsable ? '' : 'selected'}>— À définir —</option>
                <option ${d.responsable === 'Bastien ANGLUMENT' ? 'selected' : ''}>Bastien ANGLUMENT</option>
                <option ${d.responsable === 'Julie VASSELIN' ? 'selected' : ''}>Julie VASSELIN</option>
                <option ${d.responsable === 'Jérémy SAUJOT' ? 'selected' : ''}>Jérémy SAUJOT</option>
              </select>
            </div>
            ${d.sansPret ? '<span class="badge-cash">💰 Achat comptant — sans prêt</span>' : ''}
            ${d.accesAReconfirmer ? `<div class="offre-pret-ligne"><span class="reconfirmer-acces" onclick="reconfirmerAcces('${d.id}')">Cliquer pour reconfirmer l'accès</span></div>` : ''}
            ${(!d.sansPret && d.offrePretStatut === 'recue' && calculerApport(d)) ? (() => {
              const apport = calculerApport(d);
              return `<div class="addr apport-ligne">
                <span class="apport-cercle apport-${apport.niveau}"></span>
                Apport estimé : <strong>${formaterPrix(apport.montant)}</strong> (${apport.pourcentage}% du prix de ${formaterPrix(d.prixVente)}, prêt de ${formaterPrix(d.montantPret)})
              </div>`;
            })() : ''}
          </div>
          <div class="dossier-head-actions">
            <button class="icon-btn" onclick="archiverDossier('${d.id}', ${!d.archive})">${d.archive ? 'Désarchiver' : 'Archiver'}</button>
            <button class="icon-btn" onclick="supprimerDossier('${d.id}')">Supprimer</button>
          </div>
        </div>
        <div class="dossier-body">
        <div class="dossier-col-principale">
        <div class="tabs">
          ${renderTab('pret', 'Obtention du prêt', d.pret, d.id, d.pretPage, confiance.pret, null, d.offrePretStatut === 'recue', offreBloc)}
          ${renderTab('acte', 'Signature de l\u2019acte', d.acte, d.id, d.actePage, confiance.acte)}
          ${d.ventebien ? renderTab('ventebien', 'Vente préalable', d.ventebien, d.id, d.ventebienPage, confiance.ventebien) : ''}
          ${(d.autres || []).map((a, i) => renderTab('autre', escapeHtml(a.label), a.date, d.id, a.page, null, i)).join('')}
        </div>
        ${d.roleNotaire !== 'participant' ? renderPiecesDossier(d) : ''}
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
        </div>
        <div class="dossier-col-laterale">
        ${historique.length > 0 ? `
          <button type="button" class="historique-toggle" onclick="toggleHistorique('${d.id}')">Historique (${historique.length})</button>
          <div class="historique-liste" id="historique-${d.id}">
            ${historique.slice().reverse().map(h => `<div class="historique-ligne"><span class="h-date">${new Date(h.date).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>${escapeHtml(h.texte)}</div>`).join('')}
          </div>
        ` : ''}
        <div class="dossier-actions">
          <button onclick="telechargerICS('${d.id}')">Télécharger les rappels (.ics)</button>
          <button onclick="ouvrirEmailRappel('${d.id}')">Envoyer un rappel par email</button>
          <button onclick="imprimerFiche('${d.id}')">📄 Télécharger la fiche dossier</button>
        </div>
        </div>
      </div>
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
      adresseBien: typeof d.adresseBien === 'string' ? d.adresseBien : '',
      prixVente: Number.isFinite(d.prixVente) && d.prixVente > 0 ? d.prixVente : null,
      // Comme offrePretStatut : dérivé d'un PDF local, jamais importé tel quel d'une autre machine
      // sans revérification (voir le commentaire déjà existant sur offrePretStatut ci-dessous).
      montantPret: null,
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
      typeVente: d.typeVente === 'copropriete' ? 'copropriete' : 'maison',
      roleNotaire: d.roleNotaire === 'participant' ? 'participant' : 'instrumentaire',
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
      pieces: {},
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

  // ---- suivi des pièces du dossier (checklist de constitution, selon le type de vente) ----
  //
  // Listes fournies par l'étude (voir CLAUDE.md, "Checklist de constitution d'un dossier") — deux
  // types de vente sur trois pour l'instant (maison, copropriété ; pas encore "terrain nu", à
  // ajouter le jour où l'étude fournit sa liste). Les motifs de reconnaissance sont un premier jet
  // à partir du seul intitulé de chaque pièce (pas encore confronté à de vrais titres de documents,
  // contrairement à OFFRE_PRET_RE qui a déjà été affiné sur des cas réels) : à resserrer ou élargir
  // dès qu'un vrai dossier fait remonter un faux positif/négatif, comme pour toute regex du fichier.
  // var (pas const) : mêmes raisons que OFFRE_PRET_RE, pour rester testable depuis les tests.
  var PIECES_URBANISME = [
    { cle: 'certificatUrbanisme', label: "Certificat d'urbanisme", motif: /certificat\s+d[’']urbanisme/i },
    { cle: 'certificatAlignement', label: "Certificat d'alignement", motif: /certificat\s+d[’']alignement/i },
    { cle: 'certificatNumerotage', label: 'Certificat de numérotage', motif: /certificat\s+de\s+num[ée]rotage/i },
    { cle: 'reponseAssainissement', label: 'Courrier réponse assainissement', motif: /assainissement/i },
    { cle: 'renonciationPreemption', label: 'Renonciation au droit de préemption', motif: /pr[ée]emption/i }
  ];
  var PIECES_AUTRES = [
    { cle: 'diagnosticsTechniques', label: 'Diagnostics techniques', motif: /dossier\s+de\s+diagnostic\s+technique|diagnostics?\s+techniques?|\bDDT\b/i },
    // "ERP" est ambigu (aussi "Établissement Recevant du Public") : on s'appuie sur l'intitulé
    // complet et ses anciens noms plutôt que sur le sigle seul, trop sujet aux faux positifs.
    { cle: 'erp', label: 'ERP (état des risques et pollution)', motif: /[ée]tat\s+des\s+risques(?:\s+et\s+pollutions?|\s+naturels?)?|\bERNMT\b|\bESRIS\b/i },
    { cle: 'avisTaxeFonciere', label: 'Avis de taxe foncière', motif: /(?:avis\s+de\s+)?taxe\s+fonci[èe]re/i },
    { cle: 'titrePropriete', label: 'Titre de propriété', motif: /titre\s+de\s+propri[ée]t[ée]/i }
  ];
  var PIECES_COPROPRIETE = [
    { cle: 'etatDate', label: 'État daté', motif: /[ée]tat\s+dat[ée]/i },
    { cle: 'article20', label: 'Article 20-II', motif: /article\s*20[\s.-]*(?:ii|2)\b/i },
    { cle: 'ribCopro', label: 'RIB de la copropriété', motif: /\bRIB\b[^\n]{0,50}(?:copropri[ée]t[ée]|syndic)|(?:copropri[ée]t[ée]|syndic)[^\n]{0,50}\bRIB\b/i }
  ];

  // Ordre d'affichage = ordre des listes fournies par l'étude : urbanisme (commun aux deux types),
  // puis les pièces propres à la copropriété si applicable, puis le reste.
  function checklistPieces(typeVente) {
    return typeVente === 'copropriete'
      ? [...PIECES_URBANISME, ...PIECES_COPROPRIETE, ...PIECES_AUTRES]
      : [...PIECES_URBANISME, ...PIECES_AUTRES];
  }
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

  // Clés dérivées pour conserver, en plus du handle du dossier local lui-même, celui du fichier
  // PDF précis où l'offre de prêt (ou une pièce de la checklist) a été trouvée — même magasin
  // IndexedDB que les dossiers (enregistrerHandle/recupererHandle acceptent n'importe quelle
  // chaîne comme identifiant), pour rouvrir directement ce fichier d'un clic plutôt que de
  // reparcourir tout le dossier local. Voir ouvrirPieceTrouvee().
  const CLE_HANDLE_OFFRE = (id) => `${id}::offre`;
  const CLE_HANDLE_PIECE = (id, cle) => `${id}::piece::${cle}`;

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
      await verifierPiecesDossier(id, true);
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

  // Plafond appliqué à chaque PDF individuel lors du parcours d'un dossier local relié (offre de
  // prêt, pièces) : identique à celui déjà retenu pour le compromis lui-même (PLAFOND_SECURITE dans
  // extraireTextesUtiles) plutôt qu'un chiffre arbitraire à part. Les 15 pages retenues jusqu'ici
  // ne couvraient pas certains documents réels (ex. un DDT ou un dossier d'urbanisme scanné en un
  // seul PDF de plusieurs dizaines de pages) — signalé par l'étude, pièces bien présentes non
  // détectées.
  const PLAFOND_PAGES_VERIFICATION = 60;
  // Repli OCR sur plusieurs pages (pas seulement la première) quand un PDF scanné n'a aucun texte
  // extractible : un document scanné place parfois son intitulé après une page de garde. Même
  // principe que le repli déjà utilisé pour la date de signature du compromis (traiterFichierPdf),
  // borné pour ne pas ralentir le parcours de tout un dossier local.
  const PAGES_OCR_VERIFICATION = 3;

  // Texte utile d'un PDF du dossier local relié, avec repli OCR s'il n'a aucun texte extractible
  // (scan/image) : partagé par verifierOffrePret() et verifierPiecesDossier(), qui n'ont plus qu'à
  // tester leur(s) propre(s) motif(s) contre le texte renvoyé.
  async function lireTextePdfVerification(pdf) {
    let texte = '';
    for (let p = 1; p <= Math.min(pdf.numPages, PLAFOND_PAGES_VERIFICATION); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      texte += content.items.map(it => it.str).join(' ') + '\n';
    }
    if (texte.trim().length < 40) {
      const workerVerif = await creerWorkerOcr();
      if (workerVerif) {
        try {
          let texteOcr = '';
          for (let p = 1; p <= Math.min(pdf.numPages, PAGES_OCR_VERIFICATION); p++) {
            texteOcr += (await ocrPage(pdf, p, workerVerif)) + '\n';
          }
          texte = texteOcr;
        } finally {
          await workerVerif.terminate();
        }
      }
    }
    return texte;
  }

  // Retour visuel pendant le parcours du dossier local (peut prendre plusieurs secondes sur un
  // dossier volumineux/beaucoup de PDF/repli OCR) : sans ça, le bouton restait silencieux jusqu'au
  // résultat final, ce qui pouvait laisser croire à un clic sans effet — signalé par l'étude.
  // render() (appelé à la fin de verifierOffrePret/verifierPiecesDossier dans tous les cas)
  // remplace de toute façon ce bouton par un rendu à jour, donc pas besoin de remettre son texte
  // d'origine ici si tout se passe bien ; seul le cas où le bouton n'existe plus dans le DOM au
  // moment du clic (rare) est à ignorer sans casser l'appel.
  async function verifierOffrePretDepuisBouton(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Recherche…'; }
    await verifierOffrePret(id, true);
  }

  async function verifierPiecesDossierDepuisBouton(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Recherche en cours…'; }
    await verifierPiecesDossier(id, true);
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
          const texte = await lireTextePdfVerification(pdf);
          const correspond = OFFRE_PRET_RE.test(texte);
          // Trace de diagnostic (jamais affichée à l'écran) : un extrait du texte lu par pdf.js
          // pour chaque PDF, utile en cas de désaccord entre "le mot y est bien" et "non détecté"
          // (ex. police embarquée mal encodée qui produit un texte extrait illisible malgré un
          // PDF visuellement normal et sélectionnable).
          console.log('[vérification offre de prêt]', entree.name, '→', correspond ? 'correspond' : 'ne correspond pas', '| extrait :', JSON.stringify(texte.trim().slice(0, 200)));
          if (correspond) {
            trouve = true;
            fichierTrouve = entree.name;
            // Lu dans le même PDF, à ce même passage : inutile de rouvrir le fichier plus tard
            // pour ça. Ne remplace jamais une valeur déjà connue par un échec de détection.
            const montant = detecterMontantPret(texte);
            if (montant) d.montantPret = montant;
            // Conserve le handle du fichier trouvé (même mécanisme IndexedDB que le dossier local
            // lui-même) pour permettre de le rouvrir en un clic depuis la fiche, sans avoir à
            // reparcourir tout le dossier — voir ouvrirPieceTrouvee().
            await enregistrerHandle(CLE_HANDLE_OFFRE(id), entree);
            break;
          }
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
    const etaitRecue = d.offrePretStatut === 'recue';
    d.offrePretStatut = trouve ? 'recue' : 'manquante';
    await sauvegarder();
    render();

    if (trouve && etaitManquante) {
      ajouterHistorique(d, 'Offre de prêt retrouvée dans le dossier local');
      await sauvegarder();
    }

    // Une offre déjà confirmée reçue ne doit jamais redéclencher une relance automatique même si
    // une vérification ultérieure ne la retrouve plus (fichier déplacé/archivé/renommé une fois
    // traité) : ce n'est pas un signe que l'offre manque réellement, l'étude l'a déjà en main.
    if (!trouve && !etaitRecue) relancerSiOffreManquante(d);
  }

  // Même principe que verifierOffrePret(), mais teste TOUTES les pièces encore manquantes contre
  // chaque PDF plutôt que de s'arrêter au premier document reconnu (checklist multi-pièces, pas un
  // simple oui/non). PROFONDEUR_MAX_RECHERCHE_PDF / MAX_FICHIERS_PARCOURUS / fichiersPdfRecursifs
  // et le repli OCR sont réutilisés tels quels.
  async function verifierPiecesDossier(id, viaClicUtilisateur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.dossierLie) return;
    // Notaire participant/concourant : la checklist de pièces ne s'affiche pas (voir
    // renderCarteDossier) et ne concerne pas ce rôle — inutile de scanner le dossier local pour ça.
    if (d.roleNotaire === 'participant') return;
    const checklist = checklistPieces(d.typeVente);
    d.pieces = d.pieces || {};

    const handle = await recupererHandle(id);
    if (!handle) {
      d.dossierLie = false;
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

    // Pièces déjà trouvées lors d'une vérification précédente : inutile de les rechercher à
    // nouveau, seules celles encore manquantes/inconnues sont testées sur chaque PDF.
    const aChercher = new Set(checklist.filter(p => d.pieces[p.cle] !== 'recue').map(p => p.cle));
    const fichierParPiece = {};
    let nbAnalyses = 0;
    try {
      const compteur = { n: 0 };
      for await (const entree of fichiersPdfRecursifs(handle, 0, compteur)) {
        if (aChercher.size === 0) break; // tout est déjà trouvé, inutile de continuer à lire des PDF
        nbAnalyses++;
        try {
          const file = await entree.getFile();
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
          const texte = await lireTextePdfVerification(pdf);
          for (const piece of checklist) {
            if (!aChercher.has(piece.cle)) continue;
            if (piece.motif.test(texte)) {
              fichierParPiece[piece.cle] = entree;
              aChercher.delete(piece.cle);
            }
          }
        } catch (e) { console.error('Lecture impossible pour', entree.name, e); }
      }
    } catch (e) {
      console.error('Parcours du dossier local impossible (pièces)', e);
      if (viaClicUtilisateur) afficherToast("Impossible de parcourir le dossier local relié : " + e.message, 'OK', null);
      render();
      return;
    }

    let nbTrouvees = 0;
    for (const piece of checklist) {
      if (fichierParPiece[piece.cle]) {
        d.pieces[piece.cle] = 'recue';
        nbTrouvees++;
        // Handle conservé pour rouvrir directement ce fichier depuis la fiche (voir
        // ouvrirPieceTrouvee()), sans reparcourir tout le dossier local.
        await enregistrerHandle(CLE_HANDLE_PIECE(id, piece.cle), fichierParPiece[piece.cle]);
      } else if (d.pieces[piece.cle] !== 'recue') {
        d.pieces[piece.cle] = 'manquante';
      } else {
        nbTrouvees++; // déjà reconnue lors d'une vérification précédente
      }
    }

    if (viaClicUtilisateur) {
      const manquantes = checklist.length - nbTrouvees;
      if (manquantes === 0) {
        afficherToast(`Dossier complet : les ${checklist.length} pièces attendues ont été reconnues.`, 'OK', null);
      } else if (nbAnalyses === 0 && nbTrouvees === 0) {
        afficherToast("Aucun PDF trouvé dans le dossier relié (ni ses sous-dossiers) — vérifiez que les pièces ont bien été enregistrées à cet endroit.", 'OK', null);
      } else {
        afficherToast(`${nbTrouvees}/${checklist.length} pièces reconnues — ${manquantes} manquante${manquantes > 1 ? 's' : ''} (voir le détail sur la fiche du dossier).`, 'OK', null);
      }
    }

    await sauvegarder();
    render();
  }

  // Rouvre directement le fichier PDF local où une pièce (ou l'offre de prêt) a été reconnue,
  // plutôt que de se contenter d'un badge "reçue" sans rien de plus derrière — demandé par
  // l'étude. Le handle du fichier a été conservé au moment de la détection (voir
  // verifierOffrePret()/verifierPiecesDossier()) : pas besoin de reparcourir tout le dossier.
  // La permission déjà accordée sur le dossier couvre aussi ce fichier individuel.
  async function ouvrirFichierTrouve(cleHandle) {
    try {
      const handle = await recupererHandle(cleHandle);
      if (!handle) {
        afficherToast("Ce fichier n'a pas été mémorisé (détecté avant cette fonctionnalité) — cliquez sur \"Revérifier\" pour le retrouver.", 'OK', null);
        return;
      }
      const permission = await handle.queryPermission({ mode: 'read' }) === 'granted'
        ? 'granted'
        : await handle.requestPermission({ mode: 'read' });
      if (permission !== 'granted') {
        afficherToast("Accès refusé à ce fichier.", 'OK', null);
        return;
      }
      const file = await handle.getFile();
      window.open(URL.createObjectURL(file), '_blank');
    } catch (e) {
      console.error(e);
      afficherToast("Impossible d'ouvrir ce fichier (déplacé ou supprimé depuis sa détection ?) : " + e.message, 'OK', null);
    }
  }

  function ouvrirPieceTrouvee(id, cle) {
    ouvrirFichierTrouve(CLE_HANDLE_PIECE(id, cle));
  }

  function ouvrirOffreTrouvee(id) {
    ouvrirFichierTrouve(CLE_HANDLE_OFFRE(id));
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

  // Un dossier dont l'offre de prêt est déjà confirmée reçue ET toutes les pièces de la checklist
  // déjà reçues n'a plus rien à apprendre d'un nouveau parcours du dossier local — l'y soumettre
  // quand même à chaque démarrage/toutes les 5 minutes ne fait que ralentir l'outil pour rien sur
  // un portefeuille volumineux. Signalé par l'étude.
  function dossierEntierementComplet(d) {
    const offreOk = d.sansPret || d.offrePretStatut === 'recue';
    const piecesOk = d.roleNotaire === 'participant' ||
      checklistPieces(d.typeVente).every(p => (d.pieces || {})[p.cle] === 'recue');
    return offreOk && piecesOk;
  }

  // Revérifie les dossiers reliés à l'ouverture, sans exiger de clic (queryPermission seul, qui
  // n'affiche jamais de demande d'autorisation) : si l'accès est toujours accordé, tout se fait
  // silencieusement ; sinon un bandeau invite à cliquer pour le reconfirmer. Ne concerne que les
  // vérifications automatiques (démarrage, minuteur) — un clic explicite sur "Revérifier" doit
  // toujours fonctionner, même sur un dossier déjà complet (l'étude peut vouloir confirmer après
  // un doute, ou un document a pu être retiré du dossier local entre-temps).
  async function revérifierDossiersLiesAuDemarrage() {
    for (const d of dossiers) {
      if (d.dossierLie && !dossierEntierementComplet(d)) {
        await verifierOffrePret(d.id, false);
        await verifierPiecesDossier(d.id, false);
      }
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
  // Même limite que l'accès à un dossier local (voir accesAReconfirmer) : la permission au fichier
  // partagé n'est pas conservée d'une session à l'autre. Mis à jour à chaque vérification
  // (silencieuse ou via clic) dans obtenirHandlePartage(), pour que "Reconfirmer tous les accès"
  // et la popup de démarrage puissent aussi couvrir ce cas, pas seulement les dossiers locaux.
  let registrePartageAccesAReconfirmer = false;

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
    registrePartageAccesAReconfirmer = permission !== 'granted';
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
    // Icône seule (sans libellé "Mode sombre"/"Mode clair" à côté) — demandé par l'étude ; le
    // libellé accessible reste porté par aria-label/title, pas visible à l'écran.
    if (btn) {
      const theTitle = theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
      btn.setAttribute('aria-label', theTitle);
      btn.setAttribute('title', theTitle);
      btn.innerHTML = theme === 'dark'
        ? '<span class="sidebar-link-icone" aria-hidden="true">☀️</span>'
        : '<span class="sidebar-link-icone" aria-hidden="true">🌙</span>';
    }
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
  charger().then(async () => {
    await revérifierDossiersLiesAuDemarrage();
    await tenterReconnexionPartage();
    afficherPopupAccesSiNecessaire();
  });
  renderChips();
  // L'analyse juridique est une étape du wizard toujours visible (voir definirEtapeWizard) : sans
  // cet appel initial, ses sections restaient affichées vides (ni contenu ni message d'état) tant
  // qu'aucun PDF n'avait encore été importé dans la session.
  afficherAnalyseJuridique();
