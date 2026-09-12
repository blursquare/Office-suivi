
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

  // ---- icônes ----
  // Un seul jeu d'icônes, dessiné à la main, pour toute l'application — remplace les emoji semés
  // au fil des évolutions successives (🔥 🔒 ⚠️ 📄 ✉️ 🔗 💰 📍 🧠 👁 📋 🤝 ☰ ⏳...), qui n'ont ni la
  // même épaisseur de trait ni le même style entre eux et changent de dessin d'un système
  // d'exploitation à l'autre. Grille 16x16, trait 1.4, extrémités arrondies — même recette que
  // iconeCalendrierSeuil() (déjà en place, voir plus bas) pour ne pas juxtaposer deux langages
  // graphiques. Dimensionnées en 1em (voir .icone dans style.css) : une icône suit la taille de
  // police du texte/bouton qui la contient, sans réglage au cas par cas à chaque usage.
  const ICONES = {
    layout: '<rect x="1.5" y="2" width="13" height="12" rx="1.6"/><line x1="6" y1="2" x2="6" y2="14"/>',
    plus: '<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>',
    list: '<circle cx="2.3" cy="4" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="4" x2="14" y2="4"/><circle cx="2.3" cy="8" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="8" x2="14" y2="8"/><circle cx="2.3" cy="12" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="12" x2="14" y2="12"/>',
    menu: '<line x1="2.4" y1="4.5" x2="13.6" y2="4.5"/><line x1="2.4" y1="8" x2="13.6" y2="8"/><line x1="2.4" y1="11.5" x2="13.6" y2="11.5"/>',
    download: '<path d="M8 2v8"/><path d="M4.5 7 8 10.5 11.5 7"/><path d="M3 13.5h10"/>',
    sun: '<circle cx="8" cy="8" r="3"/><line x1="8" y1="1.2" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="14.8"/><line x1="1.2" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="14.8" y2="8"/><line x1="3.3" y1="3.3" x2="4.5" y2="4.5"/><line x1="11.5" y1="11.5" x2="12.7" y2="12.7"/><line x1="3.3" y1="12.7" x2="4.5" y2="11.5"/><line x1="11.5" y1="4.5" x2="12.7" y2="3.3"/>',
    moon: '<path d="M13.6 9.9A5.8 5.8 0 1 1 6.1 2.4a4.6 4.6 0 0 0 7.5 7.5Z" stroke-linejoin="round"/>',
    search: '<circle cx="7" cy="7" r="4.3"/><line x1="10.2" y1="10.2" x2="14" y2="14"/>',
    'alert-triangle': '<path d="M8 2.3 14.4 13.2a0.9 0.9 0 0 1-0.8 1.3H2.4a0.9 0.9 0 0 1-0.8-1.3L8 2.3Z" stroke-linejoin="round"/><line x1="8" y1="6" x2="8" y2="9.3"/><circle cx="8" cy="11.5" r="0.8" fill="currentColor" stroke="none"/>',
    'file-text': '<path d="M4 2h5.5L12 4.5V14H4Z" stroke-linejoin="round"/><path d="M9.5 2v2.5H12"/><line x1="6" y1="8" x2="10" y2="8"/><line x1="6" y1="10.5" x2="9" y2="10.5"/>',
    mail: '<rect x="1.4" y="3.5" width="13.2" height="9" rx="1.4"/><path d="M2 4.3 8 9l6-4.7"/>',
    calendar: '<rect x="1.5" y="2.8" width="13" height="11.2" rx="1.7"/><rect x="1.5" y="2.8" width="13" height="3" rx="1" fill="currentColor" opacity="0.22" stroke="none"/><line x1="4.6" y1="1.3" x2="4.6" y2="3.6"/><line x1="11.4" y1="1.3" x2="11.4" y2="3.6"/>',
    link: '<path d="M6.6 9.4 9.4 6.6"/><path d="M7 4.2 8.3 2.9a2.6 2.6 0 0 1 3.7 3.7L9.7 8"/><path d="M9 11.8 7.7 13.1a2.6 2.6 0 0 1-3.7-3.7L6.3 8"/>',
    eye: '<path d="M1.3 8S3.8 3.3 8 3.3 14.7 8 14.7 8 12.2 12.7 8 12.7 1.3 8 1.3 8Z" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.1"/>',
    folder: '<path d="M1.6 4.3a1 1 0 0 1 1-1h3.2l1.3 1.6h6.3a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.3Z" stroke-linejoin="round"/>',
    clipboard: '<rect x="3" y="2.8" width="10" height="11.7" rx="1.4"/><rect x="5.8" y="1.5" width="4.4" height="2.3" rx="0.8" fill="currentColor" stroke="none"/><line x1="5.5" y1="7.5" x2="10.5" y2="7.5"/><line x1="5.5" y1="10" x2="10.5" y2="10"/>',
    sparkle: '<path d="M8 1.8 9 6l4.2 1-4.2 1L8 12.2 7 8 2.8 7 7 6 8 1.8Z" stroke-linejoin="round"/>',
    lock: '<rect x="3.3" y="7.2" width="9.4" height="7" rx="1.4"/><path d="M5.3 7.2V5a2.7 2.7 0 0 1 5.4 0v2.2"/>',
    upload: '<path d="M8 10.3V2.3"/><path d="M4.6 5.7 8 2.3l3.4 3.4"/><path d="M2.4 13.5h11.2"/>',
    key: '<circle cx="5.2" cy="5.2" r="2.8"/><path d="M7.2 7.2 13.5 13.5"/><path d="M11 10 12.6 8.4"/>',
    spinner: '<path d="M14 8a6 6 0 1 1-2-4.5"/>',
    banknote: '<rect x="1.3" y="4.3" width="13.4" height="7.4" rx="1.4"/><circle cx="8" cy="8" r="1.9"/>',
    'map-pin': '<path d="M8 14.3S13 9.7 13 6.2A5 5 0 0 0 3 6.2C3 9.7 8 14.3 8 14.3Z" stroke-linejoin="round"/><circle cx="8" cy="6.2" r="1.7"/>',
    pencil: '<path d="M11.1 2.3a1.5 1.5 0 0 1 2.1 2.1L5.4 12.2l-2.9.7.7-2.9 7.9-7.7Z" stroke-linejoin="round"/>',
    x: '<line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/>'
  };
  // `cls` porte les classes de mise en page (taille via font-size hérité, marge...) ; `spin` anime
  // une rotation continue (voir @keyframes icone-spin) pour les icônes d'attente (ex. "spinner").
  function icone(nom, cls, spin) {
    const chemin = ICONES[nom];
    if (!chemin) return '';
    return `<svg class="icone${cls ? ' ' + cls : ''}${spin ? ' icone-spin' : ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${chemin}</svg>`;
  }

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
  // celle-ci retrouvée dans le dossier local relié — voir l'appel dans verifierDossierLocal(). Même
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

  // "à compter du/de <date>" introduit une date de PRISE D'EFFET (loyer, garantie, taux d'intérêt,
  // jouissance différée, prorata de taxe foncière...), pas une échéance à respecter — contrairement
  // à "au plus tard le"/"avant le" (CUE_FUTUR_RE), qui annoncent une vraie limite. Signalé par
  // l'étude avec un exemple réel ("à compter du 1er Janvier 2028.") : la clause se trouvait par
  // ailleurs dans le même paragraphe qu'une mention de l'acte authentique, ce qui suffisait à faire
  // classer cette date "acte" par suggererEcheance (voir sa ligne "acte authentique|réitération...",
  // qui ne regarde que la présence du mot dans tout le contexte, pas son lien réel avec la date).
  // Seule exception : si la clause parle explicitement de la RÉITÉRATION de l'acte de vente
  // lui-même (verbe "réitéré(e)" ou nom "réitération", voir \br[ée]it[ée]r au point d'appel),
  // "à compter du" peut alors désigner la date à laquelle l'acte sera effectivement réitéré —
  // cette date-là reste une vraie échéance, à ne pas écarter.
  const A_COMPTER_RE = /[àa]\s+compter\s+d[eu]\s*$/i;

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
    // Le clic pour sauter à la page ET surligner la phrase (voir voirEngagementDansPdf, même
    // esprit que voirDateDansPdf pour les dates — demandé par l'étude) n'est possible que si le
    // PDF d'origine est encore chargé en mémoire — jamais le cas sur un dossier déjà enregistré
    // rouvert plus tard (le PDF lui-même n'est pas conservé). Le numéro de page reste malgré tout
    // indiqué dans ce cas, à titre indicatif : c'est justement le cas d'usage le plus courant
    // (relire une clause quelques jours après l'import du compromis).
    const boutonVoir = !page ? '' : pdfActuel
      ? `<button type="button" class="voir-pdf-btn" onclick="voirEngagementDansPdf(${page}, '${codifierPourAttribut(phrase)}')">${icone('eye')} p.${page}</button>`
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
      // Le liseré ambre de .analyse-note (voir style.css) porte déjà l'avertissement : un préfixe
      // "⚠️" en plus ne faisait que répéter ce que la couleur dit déjà.
      note.textContent = documents.length === 0
        ? `${engagements.length} clause${engagements.length > 1 ? 's' : ''} d'engagement relevée${engagements.length > 1 ? 's' : ''}, mais aucun document type reconnu : lisez les clauses ci-dessus pour identifier les pièces attendues.`
        : `Liste possiblement incomplète : ${engagements.length} clauses d'engagement relevées pour ${documents.length} document${documents.length > 1 ? 's' : ''} identifié${documents.length > 1 ? 's' : ''}. Relisez les clauses ci-dessus.`;
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
      // Voir A_COMPTER_RE ci-dessus : une date immédiatement introduite par "à compter du/de" est
      // une prise d'effet, pas une échéance — sauf si la clause parle de la réitération de l'acte
      // de vente lui-même, seul cas où cette date-là EST la bonne échéance. \br[ée]it[ée]r couvre
      // aussi bien le verbe ("sera réitéré") que le nom ("réitération"), pas seulement ce dernier.
      if (A_COMPTER_RE.test(texte.slice(Math.max(0, index - 30), index)) && !/\br[ée]it[ée]r/i.test(contexte)) return;
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
      // "au plus tard 60 jours après la signature des présentes" : autre formulation réelle de la
      // même condition suspensive de prêt exprimée en délai (fournie par l'étude), avec cette
      // fois un point de départ explicite ("après <ancre>") plutôt qu'implicite comme
      // reAuPlusTardDelai ci-dessus. Mêmes ancres que reDelai, même garde-fou contre la clause
      // de notification (le refus/l'octroi communiqué au notaire porte souvent un second délai,
      // distinct de la condition elle-même — voir reAuPlusTardDelai).
      const reAuPlusTardApres = /au\s+plus\s+tard\s+(\d{1,3})\s*jours?\s+apr[èe]s\s+(?:la\s+signature|ce\s+jour|l['’]acte|la\s+pr[ée]sente|le\s+pr[ée]sent\s+(?:compromis|acte)|la\s+promesse)/gi;
      while ((m = reAuPlusTardApres.exec(texte)) !== null) {
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
      ? `<button type="button" class="voir-pdf-btn" onclick="voirDateDansPdf(${item.page}, '${item.label.replace(/'/g, "\\'")}')">${icone('eye')} p.${item.page}</button>`
      : '';
    const badgeApprise = item.apprise
      ? `<span class="dot-label dl-neutre" title="Classé d'après une correction déjà faite sur une clause très proche — à vérifier comme toute suggestion automatique">${icone('sparkle')}Appris</span>`
      : '';
    // Date calculée (fin de mois arrondie, délai relatif) plutôt que lue telle quelle dans le
    // texte — voir ajouter() dans detecterDatesDepuisTexte. Visible dès l'étape "Vérifier", avant
    // même l'enregistrement (où le même statut réapparaît via LIBELLES_CONFIANCE.estime, même
    // libellé "Estimée" — un seul vocabulaire pour la même réalité, import et dossier enregistré).
    const badgeApprox = item.approx
      ? `<span class="dot-label dl-pret" title="Date calculée à partir d'une formulation approximative (fin de mois, délai relatif...) — à vérifier précisément"><span class="dot"></span>Estimée</span>`
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

  // Encode/décode un texte libre (guillemets, apostrophes, accents...) pour le faire transiter
  // sans risque à travers un attribut onclick="...('...')" — un essai précédent interpolait la
  // phrase directement en échappant ses apostrophes à la main (voir CLAUDE.md, "renderEngagement()
  // cherchait à surligner..." ) : tronquer APRÈS avoir échappé pouvait couper un \' en deux et
  // produire un attribut malformé. Le texte transite ici en base64, jamais interpolé tel quel :
  // aucun caractère de la phrase ne peut casser l'attribut ou l'appel JS, quel qu'il soit.
  function codifierPourAttribut(texte) {
    return btoa(unescape(encodeURIComponent(texte)));
  }
  function decoderAttribut(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  // Surligne un ENGAGEMENT (obligation ou document à fournir par le vendeur) dans l'aperçu PDF,
  // sur le même principe que voirDateDansPdf() mais adapté à une phrase complète plutôt qu'un seul
  // mot ancré (l'année d'une date) : la phrase peut être répartie sur plusieurs "items" pdf.js (un
  // par ligne/segment de mise en page), il faut donc retrouver TOUS les items concernés, pas un
  // seul. Demandé par l'étude après une première tentative abandonnée (voir CLAUDE.md) qui
  // cherchait le "dernier mot" de la phrase, une ancre bien trop peu fiable sur du texte libre.
  async function voirEngagementDansPdf(numeroPage, phraseB64) {
    if (!pdfActuel || !numeroPage) return;
    const bloc = document.getElementById('pdf-page-bloc-' + numeroPage);
    const canvas = document.getElementById('pdf-page-' + numeroPage);
    if (!bloc || !canvas) return;
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      const phrase = decoderAttribut(phraseB64);
      const page = await pdfActuel.getPage(numeroPage);
      const content = await page.getTextContent();
      const echelle = canvas.width / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: echelle });

      // Texte concaténé de la page, en mémorisant pour chaque caractère l'item pdf.js d'origine
      // (-1 pour les espaces insérés entre deux items, non rattachés à un item précis) — nécessaire
      // pour retrouver ensuite QUELS items surligner une fois la position du passage repérée.
      let texte = '';
      const origines = [];
      content.items.forEach((item, i) => {
        for (const ch of item.str) { texte += ch; origines.push(i); }
        texte += ' '; origines.push(-1);
      });

      // Normalise en conservant, pour chaque caractère du résultat, l'index correspondant dans le
      // texte d'origine — la phrase mémorisée a déjà ses espaces multiples réduits à un seul au
      // moment de l'extraction (voir extraireEngagementsVendeur), pas forcément identique à la
      // mise en page réelle de la page ; la casse peut aussi différer.
      function normaliserAvecIndex(s) {
        let res = '';
        const idx = [];
        let dernierEspace = true;
        for (let i = 0; i < s.length; i++) {
          const c = s[i];
          if (/\s/.test(c)) {
            if (!dernierEspace) { res += ' '; idx.push(i); dernierEspace = true; }
          } else { res += c.toLowerCase(); idx.push(i); dernierEspace = false; }
        }
        return { texte: res, index: idx };
      }

      const { texte: texteNorm, index: indexOrigine } = normaliserAvecIndex(texte);
      const cibleNorm = normaliserAvecIndex(phrase).texte;
      // Un préfixe assez long pour être unique sur la page, réduit par paliers si le préfixe
      // complet ne matche pas telle quelle (la phrase peut légèrement différer de la mise en page
      // réelle, ex. un saut de ligne au milieu d'un mot) — jamais toute la phrase, qui peut
      // dépasser la fin de la page ou du texte réellement extrait.
      let longueur = Math.min(60, cibleNorm.length);
      let pos = -1;
      while (longueur >= 15 && pos === -1) {
        pos = texteNorm.indexOf(cibleNorm.slice(0, longueur));
        if (pos === -1) longueur -= 10;
      }
      if (pos === -1) return; // repérage impossible : le défilement vers la page reste fait

      // La borne de fin se cale sur la longueur de la PHRASE ENTIÈRE (cibleNorm.length), pas sur
      // le préfixe réduit ayant servi à l'ancrer (`longueur`) : sans ça, seuls les premiers items
      // couvrant ce préfixe seraient surlignés, coupant une phrase de plusieurs lignes en plein
      // milieu au lieu de la couvrir en entier.
      const debutOrig = indexOrigine[pos];
      const finOrig = indexOrigine[Math.min(pos + cibleNorm.length - 1, indexOrigine.length - 1)];
      const itemsConcernes = new Set();
      for (let i = debutOrig; i <= finOrig; i++) { if (origines[i] >= 0) itemsConcernes.add(origines[i]); }
      if (itemsConcernes.size === 0) return;

      document.querySelectorAll('.pdf-highlight').forEach(h => h.remove());
      itemsConcernes.forEach(i => {
        const item = content.items[i];
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const hauteur = Math.hypot(tx[2], tx[3]) || 14;
        const largeur = (item.width || 0) * echelle;
        const surlignage = document.createElement('div');
        surlignage.className = 'pdf-highlight';
        surlignage.style.left = Math.max(0, tx[4] - 4) + 'px';
        surlignage.style.top = Math.max(0, tx[5] - hauteur - 2) + 'px';
        surlignage.style.width = (largeur + 8) + 'px';
        surlignage.style.height = (hauteur + 6) + 'px';
        bloc.appendChild(surlignage);
      });
      setTimeout(() => document.querySelectorAll('.pdf-highlight').forEach(h => h.classList.add('fondu')), 3000);
      setTimeout(() => document.querySelectorAll('.pdf-highlight').forEach(h => h.remove()), 3700);
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
      document.getElementById('nouveau-intro').style.display = 'none';
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
    document.getElementById('nouveau-intro').style.display = 'flex';
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
      ? `<button type="button" class="voir-pdf-btn" onclick="voirDateDansPdf(${page}, '${iso.split('-')[0]}')">${icone('eye')} Voir p.${page}</button>`
      : '';

    // Indique si la date a été choisie parmi plusieurs candidates sans formulation de délai pour
    // trancher (à vérifier en priorité — voir meilleureCandidateEcheance), calculée à partir d'une
    // formulation approximative, ou vient d'une saisie/correction manuelle. Le cas par défaut
    // ("auto" : repérée sans ambiguïté) n'affiche volontairement RIEN — c'est la lecture directe
    // du texte, le cas normal ; lui donner le même traitement visuel que les trois exceptions
    // ci-dessous revenait à mettre un badge sur chaque date de chaque dossier, qui finissait par
    // n'attirer l'attention sur rien de particulier.
    // "manuel" (saisie/corrigée à la main) n'a plus d'entrée du tout, comme "auto" : le bouton
    // crayon juste à côté (icon-crayon) porte déjà cette information à lui seul — signalé par
    // l'étude comme redondant à côté du crayon dans le dossier ouvert.
    const LIBELLES_CONFIANCE = {
      estime: { titre: 'Calculée à partir d’une formulation approximative ("fin septembre", délai relatif...) — à vérifier précisément', texte: 'Estimée', dl: 'dl-pret' },
      incertain: { titre: 'Choisie parmi plusieurs dates possibles dans le texte — à vérifier en priorité', texte: 'À vérifier', dl: 'dl-alerte', icone: 'alert-triangle' }
    };
    const infoConfiance = confiance && LIBELLES_CONFIANCE[confiance];
    const badgeConfiance = infoConfiance
      ? `<span class="dot-label ${infoConfiance.dl}" title="${infoConfiance.titre}">${infoConfiance.icone ? icone(infoConfiance.icone) : '<span class="dot"></span>'}${infoConfiance.texte}</span>`
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
      ? `<button type="button" class="icon-crayon" onclick="activerEditionDate('${dossierId}','${cleEdition}')" title="Corriger cette date" aria-label="Corriger cette date">${icone('pencil')}</button>`
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
    // Une fois l'offre de prêt confirmée reçue, la date n'a plus lieu d'être signalée comme
    // "dépassée" (condition résolue, pas un retard) : le décompte le dit à la place. Il a été un
    // temps masqué entièrement dans ce cas, pour éviter de répéter ce que disait déjà offreBloc en
    // toutes lettres ("✓ Offre de prêt reçue") — l'étude a demandé de revenir en arrière, la carte
    // se retrouvait trop vide. Le doublon est réglé de l'autre côté : offreBloc est maintenant une
    // puce de couleur compacte, plus une phrase (voir renderCarteDossier).
    if (offrePretRecue) {
      countdownClass = 'recue';
      countdownText = '✓ Offre reçue';
    } else if (jours < 0) {
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
      <div class="tab-countdown ${countdownClass}">${countdownText}</div>
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
      `<div class="stat-tile"><div class="stat-label">${libelle}</div><div class="stat-num ${cls}">${valeur}</div></div>`
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
      ['c-neutre', actifs, actifs > 1 ? 'dossiers actifs' : 'dossier actif', icone('folder', 'kpi-icone')],
      ['c-urgent', urgents, 'échéances ≤ 7 jours', iconeCalendrierSeuil(7)],
      ['c-urgent', urgents15, 'échéances ≤ 15 jours', iconeCalendrierSeuil(15)],
      ['c-pret', manquantes, 'offres de prêt introuvables', icone('alert-triangle', 'kpi-icone')],
      ['c-neutre', aVerifier, 'offres à vérifier', icone('search', 'kpi-icone')],
      ['c-pret', piecesIncompletes, 'dossiers avec pièces manquantes', icone('clipboard', 'kpi-icone')]
    ];
    bloc.innerHTML = tuiles.map(([cls, valeur, libelle, iconeHtml]) =>
      `<div class="kpi-tile"><div class="kpi-label">${iconeHtml}${libelle}</div><div class="kpi-num ${cls}">${valeur}</div></div>`
    ).join('');
  }

  // "Actions urgentes" du tableau de bord : les dossiers qui méritent une attention immédiate, au
  // même sens que le score de calculerPriorite() (voir SEUIL_PRIORITE_ELEVEE) — un seul et même
  // critère d'urgence dans tout l'outil, pas une seconde définition inventée pour le tableau de
  // bord. Seule vue restante à s'appuyer sur ce score depuis le retrait du badge "🔥 Prioritaire"
  // de la ligne de tableau (refonte visuelle, voir CLAUDE.md) : le statut "Blocage" (rouge) et ce
  // bloc couvrent déjà ce que ce badge signalait seul.
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

  // Ouvre un dossier depuis le tableau de bord : bascule vers le Suivi et ouvre sa fiche dans le
  // tiroir latéral, exactement comme un clic sur sa ligne (même chemin, voir ouvrirDossierDrawer).
  function ouvrirDossierDepuisDashboard(id) {
    definirOnglet('suivi');
    ouvrirDossierDrawer(id);
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
    // Relancer l'acquéreur (email + relance automatique si l'offre tarde, voir
    // relancerSiOffreManquante) reste un geste du notaire instrumentaire, celui qui reçoit l'acte
    // et porte la relation avec lui — pas de l'étude en simple participation/concours, dont le
    // suivi se limite au prêt et aux engagements du vendeur. Demandé explicitement par l'étude.
    const champEmailAcquereur = document.getElementById('champ-email-acquereur');
    if (champEmailAcquereur) {
      const estParticipant = roleSelect && roleSelect.value === 'participant';
      champEmailAcquereur.style.display = estParticipant ? 'none' : '';
      if (estParticipant) document.getElementById('f-email-acquereur').value = '';
    }
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
    document.getElementById('onglet-calculateur').style.display = nom === 'calculateur' ? '' : 'none';
    document.getElementById('tab-dashboard').setAttribute('aria-selected', String(nom === 'dashboard'));
    document.getElementById('tab-nouveau').setAttribute('aria-selected', String(nom === 'nouveau'));
    document.getElementById('tab-suivi').setAttribute('aria-selected', String(nom === 'suivi'));
    document.getElementById('tab-calculateur').setAttribute('aria-selected', String(nom === 'calculateur'));
    document.getElementById('tab-dashboard').classList.toggle('actif', nom === 'dashboard');
    document.getElementById('tab-nouveau').classList.toggle('actif', nom === 'nouveau');
    document.getElementById('tab-suivi').classList.toggle('actif', nom === 'suivi');
    document.getElementById('tab-calculateur').classList.toggle('actif', nom === 'calculateur');
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
  // dl : modificateur de couleur du composant .dot-label commun (voir style.css) ; icone :
  // uniquement pour "archive", où un point de couleur dirait "actif" alors que le dossier ne
  // l'est plus — un cadenas marque sans ambiguïté un état "hors service", pas une couleur de plus.
  const LIBELLES_STATUT = {
    pret: { texte: 'Prêt', dl: 'dl-success' },
    arelier: { texte: 'À relier', dl: 'dl-neutre' },
    aconfirmer: { texte: 'Réception de pièces', dl: 'dl-pret' },
    blocage: { texte: 'Aucun document', dl: 'dl-urgent' },
    archive: { texte: 'Archivé', dl: 'dl-neutre', icone: 'lock' }
  };
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
  // principe déjà appliqué à l'offre de prêt "inconnue" ailleurs dans l'outil (voir
  // renderStatsSuivi). Un dossier sans rien à vérifier (achat comptant + rôle participant, qui ne
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
      checklistPieces(d.typeVente).forEach(p => items.push((d.pieces || {})[p.cle] || 'inconnu'));
    }
    if (items.length === 0 || items.every(s => s === 'recue')) return 'pret';

    const verifies = items.filter(s => s !== 'inconnu');
    if (verifies.length === 0) return 'arelier';
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
    return `${icone('key')} L'accès à ${morceaux.join(' et à ')} doit être reconfirmé (redemandé par le navigateur à chaque redémarrage).`;
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
      await verifierDossierLocal(id, false);
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
    el.innerHTML = messageAccesAReconfirmer(nb, partageAConfirmer);
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
    const marqueur = s.icone ? icone(s.icone) : '<span class="dot"></span>';
    return `<span class="dot-label ${s.dl}" title="Statut du dossier : ${s.texte}">${marqueur}${s.texte}</span>`;
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
    // Avant les retours anticipés sur liste vide ci-dessous : le tiroir doit se rafraîchir (ou se
    // refermer, si son dossier vient d'être supprimé) dans tous les cas, pas seulement quand la
    // liste a des lignes à afficher.
    renderDrawer();

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

  // Identifiant du dossier affiché dans le tiroir latéral, ou null si aucun. Un seul à la fois :
  // le tiroir est une fenêtre sur LE dossier consulté, pas une liste d'éléments dépliés (c'est
  // justement ce qui remplace l'ancien Set de lignes dépliées, dont chaque ouverture décalait
  // toute la suite du tableau). Conservé en mémoire pour que render() — déclenché par la moindre
  // action de la fiche : renommer, corriger une date, revérifier l'offre... — puisse reconstruire
  // le contenu du tiroir sans le refermer sous les doigts de l'utilisateur.
  let dossierOuvert = null;

  function renderLigneTableau(d) {
    const prochaine = prochaineEcheanceDetail(d);
    const offre = !d.sansPret ? statutOffreAffichage(d) : null;
    return `
      <tr class="ligne-resume${d.archive ? ' est-archive' : ''}${dossierOuvert === d.id ? ' ligne-active' : ''}" onclick="ouvrirDossierDrawer('${d.id}')">
        <td><div class="dossier-nom-tableau">${renderBadgeStatut(d)}${escapeHtml(d.nom)}</div></td>
        <td class="dossier-responsable-tableau">${escapeHtml(d.responsable || '—')}</td>
        <td>
          ${prochaine
            ? `<span class="dot-label dl-${prochaine.type}"><span class="dot"></span>${escapeHtml(prochaine.label)}</span>
               <span class="echeance-jours ${prochaine.jours <= 3 ? 'urgent' : 'calme'}">${formatDateFr(prochaine.iso)} (${prochaine.jours < 0 ? 'dépassée' : prochaine.jours === 0 ? "aujourd'hui" : 'J-' + prochaine.jours})</span>`
            : '<span class="echeance-jours calme">—</span>'}
        </td>
        <td>
          ${d.sansPret ? '<span class="echeance-jours calme">Comptant — sans prêt</span>' : `<span class="dot-label ${offre.dl}"><span class="dot"></span>${offre.texte}</span>`}
          ${(!d.sansPret && d.dossierLie) ? `<button type="button" class="action-rapide" onclick="event.stopPropagation(); verifierDossierLocalDepuisBouton('${d.id}', this)">Revérifier</button>` : ''}
        </td>
      </tr>
    `;
  }

  // Les deux passent par render() plutôt que par renderDrawer() seul : la liste doit se redessiner
  // pour poser (ou retirer) le liseré .ligne-active sur la ligne concernée, et render() rafraîchit
  // le tiroir au passage.
  function ouvrirDossierDrawer(id) {
    dossierOuvert = id;
    render();
  }

  function fermerDossierDrawer() {
    if (!dossierOuvert) return;
    dossierOuvert = null;
    render();
  }

  // Reconstruit le contenu du tiroir depuis l'état courant. Appelée par render() (pour que toute
  // action menée DANS la fiche — renommer, corriger une date, revérifier — se répercute sans
  // refermer le tiroir) autant que par l'ouverture/fermeture elles-mêmes. Un dossier supprimé ou
  // devenu invisible pendant qu'il était ouvert referme le tiroir plutôt que d'afficher un vide.
  function renderDrawer() {
    const overlay = document.getElementById('dossier-drawer-overlay');
    const contenu = document.getElementById('dossier-drawer-contenu');
    if (!overlay || !contenu) return;

    const d = dossierOuvert ? dossiers.find(x => x.id === dossierOuvert) : null;
    if (!d) {
      dossierOuvert = null;
      overlay.style.display = 'none';
      document.body.classList.remove('drawer-ouvert');
      contenu.innerHTML = '';
      return;
    }
    contenu.innerHTML = renderCarteDossier(d);
    overlay.style.display = 'flex';
    // Empêche la page derrière le tiroir de défiler en même temps que lui (sinon la molette
    // emporte la liste dès que le contenu du tiroir arrive en bout de course).
    document.body.classList.add('drawer-ouvert');
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
          <span class="section-eyebrow">Pièces du dossier (${libelleType})</span>
          <span class="pieces-compteur${complet ? ' complet' : ''}">${nbRecues}/${checklist.length}</span>
          ${(DOSSIER_FS_SUPPORTE && d.dossierLie) ? `<button type="button" class="action-rapide" onclick="verifierDossierLocalDepuisBouton('${d.id}', this)">Revérifier les pièces</button>` : ''}
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
          : `<button type="button" class="lien-dossier-local" onclick="lierDossierLocal('${d.id}')">${icone('link')} Lier un dossier local</button>`) : '';
      // Statut de l'offre sous la date de la carte "Obtention du prêt" (voir renderTab, paramètre
      // offreBloc). Une puce de couleur plutôt qu'une phrase : le décompte juste au-dessus dit déjà
      // "✓ Offre reçue" en toutes lettres, la puce ne fait que confirmer d'un coup d'œil sans
      // répéter — c'est ce doublon de phrases qui avait été signalé. Même texte/couleur que le
      // badge équivalent de la ligne de tableau (voir statutOffreAffichage) : les deux affichent le
      // même fait, ils le disent maintenant de la même façon.
      // Affiché même quand aucun dossier local n'est relié : c'est justement là qu'il faut proposer
      // de le relier, sans quoi la carte ne dit rien de l'offre et n'offre aucun moyen d'agir.
      const offreStatut = statutOffreAffichage(d);
      const offreBloc = !d.sansPret ? `
        <div class="tab-offre-pret">
          ${(d.dossierLie && d.offrePretStatut === 'recue')
              ? `<button type="button" class="dot-label ${offreStatut.dl}" title="Offre de prêt reçue — cliquer pour ouvrir le fichier trouvé" onclick="ouvrirOffreTrouvee('${d.id}')"><span class="dot"></span>Ouvrir le fichier</button>`
              : `<span class="dot-label ${offreStatut.dl}" title="${d.dossierLie ? escapeAttr(offreStatut.texte) : 'Aucun dossier local relié : l’offre n’a pas encore pu être cherchée'}"><span class="dot"></span>${offreStatut.texte}</span>`}
          ${DOSSIER_FS_SUPPORTE ? (d.dossierLie
              ? `<button type="button" class="lien-dossier-local" onclick="verifierDossierLocalDepuisBouton('${d.id}', this)">Revérifier</button>`
              : `<button type="button" class="lien-dossier-local" onclick="lierDossierLocal('${d.id}')">${icone('link')} Lier un dossier local</button>`) : ''}
        </div>` : '';
      return `
      <div class="dossier${d.archive ? ' est-archive' : ''}">
        <div class="dossier-head">
          <!-- Badge de statut + Archiver/Supprimer regroupés sur une même ligne, en tête de fiche
               (repris d'une maquette fournie par l'étude, recolorée avec nos propres tokens — pas
               la palette indigo/violette de la maquette). Auparavant le badge vivait dans le nom
               et Archiver/Supprimer sur le côté opposé de la fiche : rassemblés ici, plus rien à
               regarder à deux endroits différents pour savoir où en est le dossier et agir dessus. -->
          <div class="dossier-head-barre">
            ${renderBadgeStatut(d)}
            <button class="icon-btn" onclick="archiverDossier('${d.id}', ${!d.archive})">${d.archive ? 'Désarchiver' : 'Archiver'}</button>
            <button class="icon-btn" onclick="supprimerDossier('${d.id}')">Supprimer</button>
          </div>
          <div class="nom-dossier">
            <span class="nom-affichage" id="nom-affichage-${d.id}">
              <span class="nom-texte">${escapeHtml(d.nom)}</span>
              <button type="button" class="icon-crayon" onclick="activerEditionNom('${d.id}')" title="Modifier le nom" aria-label="Modifier le nom">${icone('pencil')}</button>
            </span>
            <span class="nom-edition" id="nom-edition-${d.id}" hidden>
              <input type="text" class="dossier-nom-input" id="nom-input-${d.id}" value="${escapeAttr(d.nom)}" aria-label="Nom du dossier" onkeydown="if(event.key==='Enter'){event.preventDefault();validerEditionNom('${d.id}');}else if(event.key==='Escape'){annulerEditionNom('${d.id}');}">
              <button type="button" class="icon-valider" onclick="validerEditionNom('${d.id}')" title="Valider" aria-label="Valider le nom">✓</button>
            </span>
          </div>
          <!-- Sur sa propre ligne, séparée de .nom-affichage : mélangée au nom (voir historique
               de ce fichier), sa position dépendait de la longueur du nom — tantôt collée à côté,
               tantôt repoussée à la ligne suivante selon l'espace restant. Signalé par l'étude
               ("se balade"). Ici, toujours au même endroit, quel que soit le nom du dossier. -->
          ${boutonsDossierLocal ? `<div class="dossier-lien-local-ligne">${boutonsDossierLocal}</div>` : ''}

          <div class="dossier-head-divider"></div>

          <!-- Adresse/prix : une ligne icône + champ chacun, plutôt que mêlés à la grille de
               classification en dessous — assez de place sur leur propre ligne pour qu'une icône
               seule (sans libellé texte) reste lisible, contrairement à la ligne de classification
               ci-dessous où plusieurs champs se partagent l'espace. -->
          <div class="dossier-adresse-prix">
            <div class="dossier-info-ligne">
              ${icone('map-pin')}
              <input type="text" class="input-inline champ-adresse-bien" value="${escapeAttr(d.adresseBien || '')}" placeholder="Adresse non détectée" aria-label="Adresse du bien" onblur="changerAdresseBien('${d.id}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
            </div>
            <div class="dossier-info-ligne">
              ${icone('banknote')}
              <input type="text" class="input-inline champ-prix-vente" value="${d.prixVente ? formaterPrix(d.prixVente) : ''}" placeholder="Prix non détecté" aria-label="Prix de vente" onblur="changerPrixVente('${d.id}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
            </div>
          </div>

          <div class="dossier-head-divider"></div>

          <!-- Type de vente / Rôle du notaire / Responsable : grille avec libellé au-dessus du
               champ (plutôt que libellé + <select> en ligne, ancien style .select-edit) — reprend
               la présentation de la maquette fournie, plus lisible qu'une ligne de libellés et de
               champs mélangés qui se repliait sur plusieurs lignes inégales dans la largeur du
               tiroir. -->
          <div class="dossier-classification-grid">
            <div class="classif-champ">
              <label for="tv-${d.id}">Type de vente</label>
              <select id="tv-${d.id}" class="select-classif" onchange="changerTypeVente('${d.id}', this.value)">
                <option value="maison" ${d.typeVente === 'copropriete' ? '' : 'selected'}>Maison</option>
                <option value="copropriete" ${d.typeVente === 'copropriete' ? 'selected' : ''}>Copropriété</option>
              </select>
            </div>
            <div class="classif-champ">
              <label for="rn-${d.id}">Rôle du notaire</label>
              <select id="rn-${d.id}" class="select-classif" onchange="changerRoleNotaire('${d.id}', this.value)">
                <option value="instrumentaire" ${d.roleNotaire === 'participant' ? '' : 'selected'}>Instrumentaire</option>
                <option value="participant" ${d.roleNotaire === 'participant' ? 'selected' : ''}>Participant</option>
              </select>
            </div>
            <div class="classif-champ">
              <label for="resp-${d.id}">Responsable</label>
              <select id="resp-${d.id}" class="select-classif" onchange="changerResponsable('${d.id}', this.value)">
                <option value="" ${d.responsable ? '' : 'selected'}>— À définir —</option>
                <option ${d.responsable === 'Bastien ANGLUMENT' ? 'selected' : ''}>Bastien ANGLUMENT</option>
                <option ${d.responsable === 'Julie VASSELIN' ? 'selected' : ''}>Julie VASSELIN</option>
                <option ${d.responsable === 'Jérémy SAUJOT' ? 'selected' : ''}>Jérémy SAUJOT</option>
              </select>
            </div>
          </div>

          ${d.sansPret ? `<span class="dot-label dl-pret badge-cash">${icone('banknote')}Achat comptant — sans prêt</span>` : ''}
          ${d.accesAReconfirmer ? `<div class="offre-pret-ligne"><span class="reconfirmer-acces" onclick="reconfirmerAcces('${d.id}')">Cliquer pour reconfirmer l'accès</span></div>` : ''}
          ${(!d.sansPret && d.offrePretStatut === 'recue' && calculerApport(d)) ? (() => {
            const apport = calculerApport(d);
            return `<div class="addr apport-ligne">
              <span class="apport-cercle apport-${apport.niveau}"></span>
              Apport estimé : <strong>${formaterPrix(apport.montant)}</strong> (${apport.pourcentage}% du prix de ${formaterPrix(d.prixVente)}, prêt de ${formaterPrix(d.montantPret)})
            </div>`;
          })() : ''}
        </div>
        <div class="dossier-body">
        <div class="tabs">
          ${renderTab('pret', 'Obtention du prêt', d.pret, d.id, d.pretPage, confiance.pret, null, d.offrePretStatut === 'recue', offreBloc)}
          ${renderTab('acte', 'Signature de l\u2019acte', d.acte, d.id, d.actePage, confiance.acte)}
          ${d.ventebien ? renderTab('ventebien', 'Vente préalable', d.ventebien, d.id, d.ventebienPage, confiance.ventebien) : ''}
          ${(d.autres || []).map((a, i) => renderTab('autre', escapeHtml(a.label), a.date, d.id, a.page, null, i)).join('')}
        </div>
        ${d.roleNotaire !== 'participant' ? renderPiecesDossier(d) : ''}
        ${(analyse.documents.length > 0 || analyse.engagements.length > 0 || analyseConditions.length > 0) ? `
          <details class="analyse-juridique analyse-repliable" style="margin-top:14px;" open>
            <summary class="analyse-titre">Analyse juridique du compromis</summary>
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
        <!-- Libellés volontairement courts (l'intitulé complet reste en infobulle) : l'étude veut
             ces trois actions sur une seule ligne, ce que "Télécharger les rappels (.ics)" et ses
             voisins ne permettaient pas dans la largeur du tiroir. -->
        <div class="dossier-actions">
          <button onclick="telechargerICS('${d.id}')" title="Télécharger les rappels (.ics)">${icone('calendar')} Rappels (.ics)</button>
          <button onclick="ouvrirEmailRappel('${d.id}')" title="Envoyer un rappel par email">${icone('mail')} Rappel email</button>
          <button onclick="imprimerFiche('${d.id}')" title="Télécharger la fiche dossier imprimable">${icone('file-text')} Imprimer</button>
        </div>
        ${historique.length > 0 ? `
          <button type="button" class="historique-toggle section-eyebrow" onclick="toggleHistorique('${d.id}')">Historique (${historique.length})</button>
          <div class="historique-liste" id="historique-${d.id}">
            ${historique.slice().reverse().map(h => `<div class="historique-ligne"><span class="h-date">${new Date(h.date).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>${escapeHtml(h.texte)}</div>`).join('')}
          </div>
        ` : ''}
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
  // motifNom (optionnel) : testé sur le NOM DU FICHIER PDF, avant même d'en lire le contenu — plus
  // fiable que `motif` (testé sur le texte extrait) pour ces pièces, dont l'intitulé de fichier
  // est conventionnellement explicite dans les dossiers de l'étude (ex. "CU a) réponse.pdf",
  // "Diagnostics.pdf", "Certificat d'alignement et numérotage.pdf"), contrairement à leur contenu
  // qui peut être un scan peu lisible ou une mise en page qui n'emploie pas l'intitulé complet.
  // Signalé par l'étude : la détection par contenu seul ne fonctionnait pas bien sur ces pièces.
  // Listes de noms de fichiers données par l'étude pour ces 4 pièces (voir CLAUDE.md) :
  // ERP → "ERP", "état des risques et pollution" ; assainissement → "rapport assainissement",
  // "courrier assainissement", "SPANC", "assainissement" ; taxe foncière → "TF", "taxes foncières"
  // (parfois suivi de l'année) ; titre de propriété → "Titre", "titre de propriété",
  // "titre vendeur". Chaque motifNom tolère les fautes de frappe/variantes les plus plausibles
  // (accent absent ou mal placé, double lettre oubliée) SANS pour autant devenir assez large pour
  // qu'un mot commun avec une AUTRE pièce la valide par erreur (ex. "certificat d'urbanisme" qui
  // mentionnerait l'alignement en passant ne doit pas valider "Certificat d'alignement", d'où
  // l'exigence de la phrase complète "certificat d'alignement" plutôt que le mot seul,
  // demandé explicitement par l'étude et généralisé ici à toutes les pièces).
  //
  // Bug corrigé, structurel cette fois (pas une clause précise à exclure) : signalé par l'étude
  // avec plusieurs clauses réelles de compromis DIFFÉRENTS (donc pas un cas isolé à patcher une
  // regex à la fois — "chaque agence a des clauses différentes, il y en a des centaines"). Un
  // compromis contient TOUJOURS, en boilerplate, des clauses de "condition suspensive" qui
  // DÉCRIVENT ces pièces (ce qu'un certificat d'urbanisme ne doit pas révéler, ce qui se passe en
  // cas d'exercice du droit de préemption, ce que les titres de propriété ne doivent pas révéler)
  // — que la pièce ait été réellement obtenue ou non. `motif` (recherche dans le contenu d'un PDF
  // quelconque du dossier local, y compris le compromis lui-même s'il y est enregistré) validait
  // donc ces pièces dès la lecture du compromis, sans qu'aucun document distinct n'existe. Aucune
  // formulation-piège ponctuelle ne peut résoudre ça : le problème n'est pas le libellé d'une
  // clause précise, c'est que CE TYPE de pièce (une condition juridique, pas un simple fait
  // constaté) est par nature toujours mentionné dans le compromis, quelle que soit l'étude.
  // Solution structurelle plutôt que du cas par cas : `certificatUrbanisme`, `certificatAlignement`,
  // `certificatNumerotage`, `renonciationPreemption` et `titrePropriete` n'ont plus de `motif`
  // (recherche dans le contenu) DU TOUT — seul `motifNom` (le nom du fichier lui-même) les
  // détecte désormais. Une vraie pièce administrative distincte a, dans la pratique de l'étude déjà
  // observée sur des noms de fichiers réels (voir CLAUDE.md), un nom explicite ("Certificat
  // d'urbanisme.pdf", "TF 2024.pdf", "Titre.pdf"...) — s'appuyer uniquement là-dessus est moins
  // sensible que d'essayer de deviner, clause par clause, ce qui relève d'une condition juridique
  // générique plutôt que d'un document réellement produit. ERP/diagnostics/taxe foncière/
  // assainissement gardent leur `motif` : l'étude les a explicitement jugés moins problématiques
  // ("pourquoi pas"), leur mention dans un compromis étant plus rarement une simple clause de
  // condition suspensive répétée partout.
  var PIECES_URBANISME = [
    // "réponse urbanisme"/"réponse d'urbanisme" (alias courant côté étude pour ce même document)
    // ajouté au motifNom, en plus de "certificat d'urbanisme"/"CU a)".
    { cle: 'certificatUrbanisme', label: "Certificat d'urbanisme", motifNom: /certificat\s+d?[’']?\s*urbanisme|\bCU\s*a\)|r[ée]ponse\s+(?:d[’']?\s*)?urbanisme/i },
    // "d'" rendu optionnel (comme certificatUrbanisme ci-dessus) : un vrai nom de fichier de
    // l'étude ("Certificat_alignement...") ne le porte pas forcément — voir CLAUDE.md.
    { cle: 'certificatAlignement', label: "Certificat d'alignement", motifNom: /certificat\s+d?[’']?\s*alignement/i },
    // \s? après l'accent : un fichier réel de l'étude a été nommé "...nume_rotage..." (le mot
    // "numérotage" coupé en deux à l'endroit de l'accent, très probablement une frappe accidentelle
    // d'espace dans "numé rotage" avant conversion espace→underscore) — voir CLAUDE.md.
    { cle: 'certificatNumerotage', label: 'Certificat de numérotage', motifNom: /num[ée]\s?rotage/i },
    // ass?ainissement : tolère "asainissement" (un seul "s"), faute de frappe courante.
    { cle: 'reponseAssainissement', label: 'Courrier réponse assainissement', motif: /assainissement/i, motifNom: /ass?ainissement|\bSPANC\b/i },
    // Pas de motif de contenu (voir le commentaire structurel ci-dessus) : "préemption" seul
    // apparaît quasi systématiquement dans le corps du compromis (clause sur les conséquences
    // d'un exercice du droit de préemption), sans rapport avec une vraie renonciation obtenue.
    { cle: 'renonciationPreemption', label: 'Renonciation au droit de préemption', motifNom: /pr[ée]emption/i }
  ];
  var PIECES_AUTRES = [
    { cle: 'diagnosticsTechniques', label: 'Diagnostics techniques', motif: /dossier\s+de\s+diagnostic\s+technique|diagnostics?\s+techniques?|\bDDT\b/i, motifNom: /diagnostics?|\bDDT\b/i },
    // "ERP" est ambigu dans le CORPS DU TEXTE (aussi "Établissement Recevant du Public" — d'où
    // `motif` qui s'appuie sur l'intitulé complet, jamais le sigle seul). Dans un NOM DE FICHIER
    // d'un dossier de vente d'une maison en revanche, "ERP.pdf" désigne sans ambiguïté l'état des
    // risques et pollutions (un ERP au sens accessibilité n'a pas sa place dans ce type de vente) —
    // motifNom peut donc se permettre le sigle seul, contrairement à motif.
    { cle: 'erp', label: 'ERP (état des risques et pollution)', motif: /[ée]tat\s+des\s+risques(?:\s+et\s+pollutions?|\s+naturels?)?|\bERNMT\b|\bESRIS\b/i, motifNom: /\bERP\b|[ée]tat\s+des\s+risques(?:\s+et\s+pollutions?)?/i },
    // \bTF\b avant les chiffres d'une année éventuelle ("TF 2024.pdf") : pas besoin de motif
    // spécifique, \b ne consomme aucun caractère et laisse la suite du nom de fichier de côté.
    // \s? après l'accent de "foncière" : même précaution que "numérotage" ci-dessus.
    { cle: 'avisTaxeFonciere', label: 'Avis de taxe foncière', motif: /(?:avis\s+de\s+)?taxe\s+fonci[èe]re/i, motifNom: /\bTF\b|taxes?\s+fonci[èe]\s?re/i },
    // Pas de motif de contenu (voir le commentaire structurel plus haut) : "les titres de
    // propriété ne devront révéler aucune charge..." est une clause de condition suspensive
    // quasi systématique du compromis, sans rapport avec la production réelle des titres.
    // "titre" seul valide déjà (fichier couramment nommé juste "Titre.pdf" dans les dossiers de
    // l'étude) ; le groupe optionnel ne fait qu'accepter EN PLUS "titre de propriété"/"titre
    // vendeur" sans les exiger. \s? après chaque accent de "propriété" : même précaution que
    // "numérotage"/"foncière" ci-dessus (deux positions ici, "propri[é]" et "t[é]").
    { cle: 'titrePropriete', label: 'Titre de propriété', motifNom: /titre(?:\s+de\s+propri[ée]\s?t[ée]\s?|\s+vendeur)?/i }
  ];
  var PIECES_COPROPRIETE = [
    { cle: 'etatDate', label: 'État daté', motif: /[ée]tat\s+dat[ée]/i },
    { cle: 'article20', label: 'Article 20-II', motif: /article\s*20[\s.-]*(?:ii|2)\b/i },
    { cle: 'ribCopro', label: 'RIB de la copropriété', motif: /\bRIB\b[^\n]{0,50}(?:copropri[ée]t[ée]|syndic)|(?:copropri[ée]t[ée]|syndic)[^\n]{0,50}\bRIB\b/i }
  ];

  // Bug corrigé : signalé par l'étude, un certificat d'urbanisme mentionne couramment dans son
  // PROPRE texte l'existence d'autres certificats ("Le certificat de numérotage est à demander à
  // l'Hôtel de Ville... Le certificat d'alignement est à demander à la même adresse...") sans être
  // lui-même l'un d'eux — ce texte suffisait pourtant à cocher ces deux pièces comme reçues à
  // partir du seul certificat d'urbanisme. La formulation exacte varie d'un document à l'autre
  // (l'étude l'a confirmé), d'où un motif générique de RENVOI plutôt qu'une phrase figée : la
  // présence de ce renvoi à proximité immédiate d'une occurrence de piece.motif empêche de
  // retenir CETTE occurrence précise (une autre occurrence plus loin dans le même texte, sans ce
  // renvoi à proximité, resterait valable).
  var RE_SIMPLE_RENVOI_PIECE = /(?:est|sont)\s+à\s+demander|(?:peut|peuvent|doit|doivent)\s+[êe]tre\s+demand[ée]s?|s['’]obtiennent?|se\s+demandent?|d[ée]livr[ée]s?\s+(?:par|sur\s+demande)|sur\s+demande\s+(?:à|aupr[èe]s)/i;

  // Fenêtre de 80 caractères avant/après l'occurrence (même ordre de grandeur que
  // extraireContexte() ailleurs dans le fichier) : assez large pour couvrir "Le certificat de
  // numérotage [...] est à demander à l'Hôtel de Ville" (le verbe de renvoi arrive après le nom du
  // document, pas juste à côté), sans déborder sur une clause sans rapport.
  function motifPieceTrouve(motif, texte) {
    const re = new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : motif.flags + 'g');
    let m;
    while ((m = re.exec(texte)) !== null) {
      const debut = Math.max(0, m.index - 80);
      const fin = Math.min(texte.length, m.index + m[0].length + 80);
      if (!RE_SIMPLE_RENVOI_PIECE.test(texte.slice(debut, fin))) return true;
      if (re.lastIndex === m.index) re.lastIndex++; // motif pouvant matcher une chaîne vide : évite une boucle infinie
    }
    return false;
  }

  // Les motifNom ci-dessus utilisent \s+ (espace) comme séparateur naturel du français, mais les
  // vrais noms de fichiers de l'étude remplacent couramment les espaces par des underscores/tirets
  // (ex. "Certificat_alignement_et_nume_rotage_DI_132.pdf") — sans cette normalisation, \s+ ne
  // matcherait jamais un tel nom. Testé UNIQUEMENT contre motifNom (le nom de fichier), jamais
  // contre motif (le contenu du PDF, un vrai texte qui n'a pas ce problème). Signalé par l'étude
  // sur un fichier réel qui ne remontait pas.
  function normaliserNomPourMotif(nom) {
    return nom.replace(/[_-]+/g, ' ');
  }

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
      // Remis à zéro à CHAQUE lien (pas seulement le premier) : changer de dossier lié doit
      // relancer une recherche complètement fraîche, sans conserver les statuts "reçue"/
      // "manquante" de l'ancien dossier — sans quoi une pièce marquée reçue dans l'ancien
      // dossier restait affichée comme telle après avoir choisi un nouveau dossier qui ne la
      // contient peut-être pas. "Aucun document" (rouge)/"inconnu" (prêt) reflètent ce point de
      // départ pessimiste, corrigés dès que le scan ci-dessous retrouve quelque chose. Sans
      // effet sur les pièces pour un rôle participant, qui ne suit pas cette checklist (voir
      // statutDossier).
      d.offrePretStatut = 'inconnu';
      d.montantPret = null;
      if (d.roleNotaire !== 'participant') {
        d.pieces = {};
        checklistPieces(d.typeVente).forEach(p => { d.pieces[p.cle] = 'manquante'; });
      }
      // Choisir un nouveau dossier ecrase simplement le lien precedent (put() dans
      // enregistrerHandle) : utile si l'on s'etait trompe de dossier au premier lien.
      ajouterHistorique(d, etaitDejaLie
        ? 'Dossier local relié modifié (nouveau dossier choisi)'
        : 'Dossier local relié pour la vérification automatique de l\u2019offre de prêt');
      await sauvegarder();
      render();
      await verifierDossierLocal(id, true);
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
  // (scan/image) : partagé par verifierDossierLocal(), qui n'a plus qu'à tester l'offre de prêt
  // et les pièces encore manquantes contre le texte renvoyé.
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
  // render() (appelé à la fin de verifierDossierLocal dans tous les cas) remplace de toute façon ce
  // bouton par un rendu à jour, donc pas besoin de remettre son texte d'origine ici si tout se
  // passe bien ; seul le cas où le bouton n'existe plus dans le DOM au moment du clic (rare) est à
  // ignorer sans casser l'appel.
  async function verifierDossierLocalDepuisBouton(id, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Recherche…`; }
    await verifierDossierLocal(id, true);
  }

  // Fusion de deux anciennes fonctions (verifierOffrePret()/verifierPiecesDossier()) en UN SEUL
  // parcours du dossier local relié, qui teste l'offre de prêt ET les pièces encore manquantes
  // pendant le même passage — signalé par l'étude : trouver l'offre de prêt tôt dans le parcours
  // (ex. premier fichier lu) arrêtait la recherche avant d'avoir eu la moindre chance de reconnaître
  // les pièces d'urbanisme se trouvant plus loin dans l'arborescence, alors que les deux documents
  // se trouvent dans le même dossier local relié. Le parcours ne s'arrête plus tôt que si tout ce
  // qu'on cherche (offre comprise) est déjà résolu, ou si le dossier est entièrement parcouru.
  async function verifierDossierLocal(id, viaClicUtilisateur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.dossierLie) return;
    // Achat comptant (sans prêt) : rien à chercher côté offre, seul le nom de la fonction reste
    // générique. Notaire participant/concourant : la checklist de pièces ne le concerne pas (voir
    // renderCarteDossier/statutDossier) — inutile de tester quoi que ce soit dessus.
    const chercherOffre = !d.sansPret;
    const chercherPieces = d.roleNotaire !== 'participant';
    if (!chercherOffre && !chercherPieces) return;

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

    const checklist = chercherPieces ? checklistPieces(d.typeVente) : [];
    d.pieces = d.pieces || {};
    // Pièces déjà trouvées lors d'une vérification précédente : inutile de les rechercher à
    // nouveau, seules celles encore manquantes/inconnues sont testées sur chaque PDF.
    const aChercher = new Set(checklist.filter(p => d.pieces[p.cle] !== 'recue').map(p => p.cle));
    const fichierParPiece = {};

    let offreTrouvee = false;
    let fichierOffre = null;
    let nbAnalyses = 0;

    try {
      const compteur = { n: 0 };
      for await (const entree of fichiersPdfRecursifs(handle, 0, compteur)) {
        if ((!chercherOffre || offreTrouvee) && aChercher.size === 0) break; // tout est déjà résolu

        // Nom du fichier testé en premier pour les pièces (voir motifNom) : plus fiable que le
        // contenu extrait pour les pièces dont l'intitulé de fichier est conventionnel dans les
        // dossiers de l'étude, et ça évite d'ouvrir/lire le PDF quand le nom seul suffit déjà.
        // Normalisé (underscores/tirets → espaces, voir normaliserNomPourMotif) avant le test :
        // les motifNom sont écrits avec \s+ comme séparateur, un vrai nom de fichier de l'étude non.
        const nomNormalise = normaliserNomPourMotif(entree.name);
        for (const piece of checklist) {
          if (aChercher.has(piece.cle) && piece.motifNom && piece.motifNom.test(nomNormalise)) {
            fichierParPiece[piece.cle] = entree;
            aChercher.delete(piece.cle);
          }
        }
        if ((!chercherOffre || offreTrouvee) && aChercher.size === 0) break;

        nbAnalyses++;
        try {
          const file = await entree.getFile();
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
          const texte = await lireTextePdfVerification(pdf);

          if (chercherOffre && !offreTrouvee) {
            const correspond = OFFRE_PRET_RE.test(texte);
            // Trace de diagnostic (jamais affichée à l'écran) : un extrait du texte lu par pdf.js
            // pour chaque PDF, utile en cas de désaccord entre "le mot y est bien" et "non détecté"
            // (ex. police embarquée mal encodée qui produit un texte extrait illisible malgré un
            // PDF visuellement normal et sélectionnable).
            console.log('[vérification offre de prêt]', entree.name, '→', correspond ? 'correspond' : 'ne correspond pas', '| extrait :', JSON.stringify(texte.trim().slice(0, 200)));
            if (correspond) {
              offreTrouvee = true;
              fichierOffre = entree.name;
              // Lu dans le même PDF, à ce même passage : inutile de rouvrir le fichier plus tard
              // pour ça. Ne remplace jamais une valeur déjà connue par un échec de détection.
              const montant = detecterMontantPret(texte);
              if (montant) d.montantPret = montant;
              // Conserve le handle du fichier trouvé (même mécanisme IndexedDB que le dossier local
              // lui-même) pour permettre de le rouvrir en un clic depuis la fiche, sans avoir à
              // reparcourir tout le dossier — voir ouvrirOffreTrouvee().
              await enregistrerHandle(CLE_HANDLE_OFFRE(id), entree);
            }
          }

          for (const piece of checklist) {
            if (!aChercher.has(piece.cle)) continue;
            // Certaines pièces (conditions juridiques quasi systématiquement décrites dans le
            // compromis lui-même — voir PIECES_URBANISME/PIECES_AUTRES) n'ont plus de `motif` du
            // tout, volontairement : seul motifNom (déjà testé plus haut) les détecte.
            if (piece.motif && motifPieceTrouve(piece.motif, texte)) {
              fichierParPiece[piece.cle] = entree;
              aChercher.delete(piece.cle);
            }
          }
        } catch (e) { console.error('Lecture impossible pour', entree.name, e); }
      }
    } catch (e) {
      console.error('Parcours du dossier local impossible', e);
      if (viaClicUtilisateur) afficherToast("Impossible de parcourir le dossier local relié : " + e.message, 'OK', null);
      render();
      return;
    }

    let nbPiecesTrouvees = 0;
    for (const piece of checklist) {
      if (fichierParPiece[piece.cle]) {
        d.pieces[piece.cle] = 'recue';
        nbPiecesTrouvees++;
        // Handle conservé pour rouvrir directement ce fichier depuis la fiche (voir
        // ouvrirPieceTrouvee()), sans reparcourir tout le dossier local.
        await enregistrerHandle(CLE_HANDLE_PIECE(id, piece.cle), fichierParPiece[piece.cle]);
      } else if (d.pieces[piece.cle] !== 'recue') {
        d.pieces[piece.cle] = 'manquante';
      } else {
        nbPiecesTrouvees++; // déjà reconnue lors d'une vérification précédente
      }
    }

    if (viaClicUtilisateur) {
      const messages = [];
      if (chercherOffre) {
        messages.push(offreTrouvee ? `Offre de prêt trouvée (${fichierOffre}).` : "Offre de prêt non reconnue.");
      }
      if (chercherPieces) {
        const manquantes = checklist.length - nbPiecesTrouvees;
        messages.push(manquantes === 0
          ? `Les ${checklist.length} pièces attendues ont été reconnues.`
          : `${nbPiecesTrouvees}/${checklist.length} pièces reconnues (${manquantes} manquante${manquantes > 1 ? 's' : ''}).`);
      }
      if (nbAnalyses === 0) {
        afficherToast("Aucun PDF trouvé dans le dossier relié (ni ses sous-dossiers) — vérifiez que les pièces ont bien été enregistrées à cet endroit.", 'OK', null);
      } else {
        afficherToast(messages.join(' '), 'OK', null);
      }
    }

    let offreEtaitManquante = false;
    let offreEtaitRecue = false;
    if (chercherOffre) {
      offreEtaitManquante = d.offrePretStatut === 'manquante';
      offreEtaitRecue = d.offrePretStatut === 'recue';
      d.offrePretStatut = offreTrouvee ? 'recue' : 'manquante';
    }

    await sauvegarder();
    render();

    if (chercherOffre && offreTrouvee && offreEtaitManquante) {
      ajouterHistorique(d, 'Offre de prêt retrouvée dans le dossier local');
      await sauvegarder();
    }

    // Une offre déjà confirmée reçue ne doit jamais redéclencher une relance automatique même si
    // une vérification ultérieure ne la retrouve plus (fichier déplacé/archivé/renommé une fois
    // traité) : ce n'est pas un signe que l'offre manque réellement, l'étude l'a déjà en main.
    // relancerSiOffreManquante() écarte déjà elle-même le rôle participant.
    if (chercherOffre && !offreTrouvee && !offreEtaitRecue) relancerSiOffreManquante(d);
  }

  // Rouvre directement le fichier PDF local où une pièce (ou l'offre de prêt) a été reconnue,
  // plutôt que de se contenter d'un badge "reçue" sans rien de plus derrière — demandé par
  // l'étude. Le handle du fichier a été conservé au moment de la détection (voir
  // verifierDossierLocal()) : pas besoin de reparcourir tout le dossier.
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
      // Bug corrigé : File.type peut arriver vide (ou incorrect) selon la façon dont l'OS/Chrome
      // associe l'extension .pdf — le navigateur affichait alors le contenu binaire brut du PDF
      // comme du texte ("%PDF-1.6 ... stream ...") au lieu de l'ouvrir dans son lecteur PDF
      // intégré. Ces fichiers sont toujours des PDF (seule extension retenue par
      // fichiersPdfRecursifs()) : on force le type MIME plutôt que de se fier à celui détecté.
      const blob = file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' });
      window.open(URL.createObjectURL(blob), '_blank');
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
    // Notaire participant/concourant : suivi volontairement limité au prêt et aux engagements du
    // vendeur (voir renderCarteDossier/verifierPiecesDossier, même garde-fou) — relancer
    // l'acquéreur reste un geste du notaire instrumentaire, celui qui reçoit l'acte et porte la
    // relation avec lui, pas de l'étude en simple concours. Demandé explicitement par l'étude.
    if (d.roleNotaire === 'participant') return;
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
    verifierDossierLocal(id, true);
  }

  // Statut de l'offre de prêt à afficher, dans le même vocabulaire court partout où il apparaît
  // (ligne de tableau, carte "Obtention du prêt" du tiroir) : avant cette fonction, chaque endroit
  // formulait le même fait à sa façon ("Offre de prêt : à vérifier" en phrase complète ici,
  // "Non vérifiée" en point + mot juste à côté) — une seule source, un seul texte. La distinction
  // "jamais relié" / "relié mais introuvable" (déjà utilisée dans le tiroir) s'applique désormais
  // aussi au tableau : un dossier jamais relié n'a pas plus "à vérifier" qu'un dossier relié où
  // l'offre reste introuvable, ce sont deux réalités différentes.
  function statutOffreAffichage(d) {
    if (!d.dossierLie) return { texte: 'Non vérifiée', dl: 'dl-neutre' };
    if (d.offrePretStatut === 'recue') return { texte: 'Reçue', dl: 'dl-success' };
    if (d.offrePretStatut === 'manquante') return { texte: 'Introuvable', dl: 'dl-pret' };
    return { texte: 'À vérifier', dl: 'dl-neutre' };
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
        await verifierDossierLocal(d.id, false);
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
      btn.innerHTML = `${icone('link')} Registre partagé (relié)`;
    } else {
      el.style.display = 'none';
      btn.innerHTML = `${icone('link')} Registre partagé (réseau)`;
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
      btn.innerHTML = `<span class="sidebar-link-icone" aria-hidden="true">${icone(theme === 'dark' ? 'sun' : 'moon')}</span>`;
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
    // Échap ferme la boîte de confirmation ouverte, sinon le tiroir de fiche dossier. Dans cet
    // ordre : la confirmation s'ouvre PAR-DESSUS le tiroir (supprimer/archiver depuis la fiche),
    // c'est donc elle qu'on attend de voir se fermer en premier.
    if (e.key === 'Escape') {
      const overlay = document.getElementById('confirm-overlay');
      if (overlay && overlay.style.display === 'flex') {
        e.preventDefault();
        annulerConfirmation();
      } else if (dossierOuvert) {
        e.preventDefault();
        fermerDossierDrawer();
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


  // ---- Calculateur de provision sur frais d'acte (onglet indépendant, pas lié à un dossier) ----
  // Demandé par l'étude pour estimer rapidement la provision à demander au client avant signature,
  // à partir du barème notarial 2026 et des taux départementaux de DMTO — indépendant du suivi des
  // échéances, accessible depuis son propre onglet de la sidebar (voir definirOnglet('calculateur')).
  // Barème/taux repris tels quels d'une maquette fournie par l'étude, pas recalculés : les données
  // fiscales/tarifaires ne sont pas du ressort de cet outil, seule la mise en forme change.
  const DEPARTEMENTS_FRAIS_ACTE = {'01':{name:'Ain',base:0.045,temp:0.05},'02':{name:'Aisne',base:0.045,temp:0.05},'03':{name:'Allier',base:0.045,temp:0.05},'04':{name:'Alpes-de-Haute-Provence',base:0.045,temp:0.05},'05':{name:'Hautes-Alpes',base:0.045,temp:0.045},'06':{name:'Alpes-Maritimes',base:0.045,temp:0.045},'07':{name:'Ardèche',base:0.045,temp:0.045},'08':{name:'Ardennes',base:0.045,temp:0.05},'09':{name:'Ariège',base:0.045,temp:0.05},'10':{name:'Aube',base:0.045,temp:0.05},'11':{name:'Aude',base:0.045,temp:0.05},'12':{name:'Aveyron',base:0.045,temp:0.05},'13':{name:'Bouches-du-Rhône',base:0.045,temp:0.05},'14':{name:'Calvados',base:0.045,temp:0.05},'15':{name:'Cantal',base:0.045,temp:0.05},'16':{name:'Charente',base:0.045,temp:0.045},'17':{name:'Charente-Maritime',base:0.045,temp:0.05},'18':{name:'Cher',base:0.045,temp:0.05},'19':{name:'Corrèze',base:0.045,temp:0.05},'20':{name:'Corse',base:0.045,temp:0.05},'21':{name:"Côte-d'Or",base:0.045,temp:0.05},'22':{name:"Côtes-d'Armor",base:0.045,temp:0.05},'23':{name:'Creuse',base:0.045,temp:0.05},'24':{name:'Dordogne',base:0.045,temp:0.05},'25':{name:'Doubs',base:0.045,temp:0.05},'26':{name:'Drôme',base:0.045,temp:0.045},'27':{name:'Eure',base:0.045,temp:0.05},'28':{name:'Eure-et-Loir',base:0.045,temp:0.05},'29':{name:'Finistère',base:0.045,temp:0.05},'30':{name:'Gard',base:0.045,temp:0.05},'31':{name:'Haute-Garonne',base:0.045,temp:0.05},'32':{name:'Gers',base:0.045,temp:0.05},'33':{name:'Gironde',base:0.045,temp:0.05},'34':{name:'Hérault',base:0.045,temp:0.05},'35':{name:'Ille-et-Vilaine',base:0.045,temp:0.05},'36':{name:'Indre',base:0.038,temp:0.038},'37':{name:'Indre-et-Loire',base:0.045,temp:0.05},'38':{name:'Isère',base:0.045,temp:0.05},'39':{name:'Jura',base:0.045,temp:0.05},'40':{name:'Landes',base:0.045,temp:0.05},'41':{name:'Loir-et-Cher',base:0.045,temp:0.05},'42':{name:'Loire',base:0.045,temp:0.05},'43':{name:'Haute-Loire',base:0.045,temp:0.05},'44':{name:'Loire-Atlantique',base:0.045,temp:0.05},'45':{name:'Loiret',base:0.045,temp:0.05},'46':{name:'Lot',base:0.045,temp:0.05},'47':{name:'Lot-et-Garonne',base:0.045,temp:0.05},'48':{name:'Lozère',base:0.045,temp:0.045},'49':{name:'Maine-et-Loire',base:0.045,temp:0.05},'50':{name:'Manche',base:0.045,temp:0.05},'51':{name:'Marne',base:0.045,temp:0.05},'52':{name:'Haute-Marne',base:0.045,temp:0.05},'53':{name:'Mayenne',base:0.045,temp:0.05},'54':{name:'Meurthe-et-Moselle',base:0.045,temp:0.05},'55':{name:'Meuse',base:0.045,temp:0.05},'56':{name:'Morbihan',base:0.045,temp:0.05},'57':{name:'Moselle',base:0.045,temp:0.05},'58':{name:'Nièvre',base:0.045,temp:0.05},'59':{name:'Nord',base:0.045,temp:0.05},'60':{name:'Oise',base:0.045,temp:0.045},'61':{name:'Orne',base:0.045,temp:0.05},'62':{name:'Pas-de-Calais',base:0.045,temp:0.05},'63':{name:'Puy-de-Dôme',base:0.045,temp:0.05},'64':{name:'Pyrénées-Atlantiques',base:0.045,temp:0.05},'65':{name:'Hautes-Pyrénées',base:0.038,temp:0.045},'66':{name:'Pyrénées-Orientales',base:0.045,temp:0.05},'67/68':{name:'Alsace',base:0.045,temp:0.05},'69A':{name:'Métropole de Lyon',base:0.045,temp:0.05},'69B':{name:'Rhône (hors Métropole de Lyon)',base:0.045,temp:0.05},'70':{name:'Haute-Saône',base:0.045,temp:0.05},'71':{name:'Saône-et-Loire',base:0.045,temp:0.05},'72':{name:'Sarthe',base:0.045,temp:0.05},'73':{name:'Savoie',base:0.045,temp:0.05},'74':{name:'Haute-Savoie',base:0.045,temp:0.05},'75':{name:'Paris',base:0.045,temp:0.05},'76':{name:'Seine-Maritime',base:0.045,temp:0.05},'77':{name:'Seine-et-Marne',base:0.045,temp:0.05},'78':{name:'Yvelines',base:0.045,temp:0.05},'79':{name:'Deux-Sèvres',base:0.045,temp:0.05},'80':{name:'Somme',base:0.045,temp:0.05},'81':{name:'Tarn',base:0.045,temp:0.05},'82':{name:'Tarn-et-Garonne',base:0.045,temp:0.05},'83':{name:'Var',base:0.045,temp:0.05},'84':{name:'Vaucluse',base:0.045,temp:0.05},'85':{name:'Vendée',base:0.045,temp:0.05},'86':{name:'Vienne',base:0.045,temp:0.05},'87':{name:'Haute-Vienne',base:0.045,temp:0.05},'88':{name:'Vosges',base:0.045,temp:0.05},'89':{name:'Yonne',base:0.045,temp:0.05},'90':{name:'Territoire-de-Belfort',base:0.045,temp:0.05},'91':{name:'Essonne',base:0.045,temp:0.05},'92':{name:'Hauts-de-Seine',base:0.045,temp:0.05},'93':{name:'Seine-Saint-Denis',base:0.045,temp:0.05},'94':{name:'Val-de-Marne',base:0.045,temp:0.05},'95':{name:"Val-d'Oise",base:0.045,temp:0.05},'971':{name:'Guadeloupe',base:0.045,temp:0.045},'972':{name:'Martinique',base:0.045,temp:0.05},'973':{name:'Guyane',base:0.045,temp:0.05},'974':{name:'La Réunion',base:0.045,temp:0.05},'976':{name:'Mayotte',base:0.038,temp:0.045}};
  // Pour chaque type de bien, un barème {palier de prix: [émoluments, trésor à 4,5 %]} — les mêmes
  // paliers que le tableau fourni par l'étude, interpolés linéairement entre deux paliers connus
  // (voir interpolerBaremeFraisActe). Trésor à un taux départemental différent de 4,5 % : voir
  // calculerFraisActe(), qui interpole entre la colonne à 4,5 % et une colonne à 5 % reconstituée.
  const BAREME_FRAIS_ACTE = {"house":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1050,840],"11250":[1130,900],"12000":[1200,960],"12750":[1280,1020],"13500":[1310,1060],"14250":[1320,1110],"15000":[1330,1160],"16500":[1360,1250],"18000":[1370,1340],"19500":[1390,1430],"21000":[1410,1530],"22500":[1420,1620],"24000":[1440,1710],"25500":[1450,1800],"27000":[1470,1890],"28500":[1490,1980],"30000":[1500,2080],"32000":[1520,2200],"34000":[1540,2320],"36000":[1570,2440],"38000":[1590,2570],"40000":[1610,2690],"42000":[1630,2810],"44000":[1650,2930],"46000":[1670,3060],"48000":[1690,3180],"50000":[1720,3300],"52000":[1740,3420],"54000":[1760,3550],"56000":[1780,3670],"58000":[1800,3790],"60000":[1820,3910],"62000":[1840,4030],"64000":[1850,4160],"66000":[1870,4280],"68000":[1890,4400],"70000":[1900,4520],"72000":[1920,4640],"74000":[1930,4760],"76000":[1950,4880],"78000":[1970,5000],"80000":[1980,5130],"83000":[2010,5310],"86000":[2030,5490],"89000":[2050,5670],"92000":[2080,5850],"95000":[2100,6040],"100000":[2140,6340],"105000":[2180,6640],"110000":[2220,6950],"115000":[2260,7250],"120000":[2300,7550],"125000":[2340,7860],"130000":[2380,8160],"135000":[2420,8460],"140000":[2460,8770],"150000":[2540,9370],"165000":[2660,10280],"180000":[2780,11190],"195000":[2900,12100],"210000":[3020,13010],"225000":[3140,13920],"240000":[3260,14830],"255000":[3380,15740],"270000":[3500,16650],"285000":[3620,17560],"300000":[3740,18470],"315000":[3860,19380],"330000":[3980,20290],"345000":[4100,21200],"360000":[4220,22110],"375000":[4340,23020],"390000":[4460,23930],"405000":[4580,24840],"420000":[4700,25750],"435000":[4820,26660],"450000":[4940,27570],"480000":[5180,29390],"510000":[5420,31210],"540000":[5660,33030],"570000":[5900,34850],"600000":[6140,36670],"630000":[6380,38490],"660000":[6620,40310],"690000":[6860,42130],"720000":[7100,43950],"750000":[7330,45770],"825000":[7930,50320],"900000":[8530,54870],"975000":[9130,59420],"1050000":[9730,63970],"1125000":[10330,68520],"1200000":[10930,73070],"1275000":[11530,77620],"1350000":[12130,82170],"1425000":[12730,86720],"1500000":[13330,91270],"1750000":[15320,106440],"2000000":[17320,121600]},"condo":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1050,840],"11250":[1130,900],"12000":[1200,960],"12750":[1280,1020],"13500":[1350,1070],"14250":[1430,1130],"15000":[1460,1180],"16500":[1480,1270],"18000":[1500,1370],"19500":[1520,1460],"21000":[1530,1550],"22500":[1550,1640],"24000":[1560,1730],"25500":[1580,1830],"27000":[1600,1920],"28500":[1610,2010],"30000":[1630,2100],"32000":[1650,2220],"34000":[1670,2350],"36000":[1690,2470],"38000":[1710,2590],"40000":[1730,2710],"42000":[1750,2840],"44000":[1780,2960],"46000":[1800,3080],"48000":[1820,3200],"50000":[1840,3330],"52000":[1860,3450],"54000":[1880,3570],"56000":[1900,3690],"58000":[1920,3810],"60000":[1950,3940],"62000":[1960,4060],"64000":[1980,4180],"66000":[1990,4300],"68000":[2010,4420],"70000":[2030,4540],"72000":[2040,4670],"74000":[2060,4790],"76000":[2070,4910],"78000":[2090,5030],"80000":[2110,5150],"83000":[2130,5330],"86000":[2150,5510],"89000":[2180,5700],"92000":[2200,5880],"95000":[2230,6060],"100000":[2270,6360],"105000":[2310,6670],"110000":[2350,6970],"115000":[2390,7270],"120000":[2430,7580],"125000":[2470,7880],"130000":[2510,8180],"135000":[2550,8490],"140000":[2590,8790],"150000":[2670,9400],"165000":[2790,10310],"180000":[2910,11220],"195000":[3020,12130],"210000":[3140,13040],"225000":[3260,13950],"240000":[3380,14860],"255000":[3500,15770],"270000":[3620,16680],"285000":[3740,17590],"300000":[3860,18500],"315000":[3980,19410],"330000":[4100,20320],"345000":[4220,21230],"360000":[4340,22140],"375000":[4460,23050],"390000":[4580,23960],"405000":[4700,24870],"420000":[4820,25780],"435000":[4940,26690],"450000":[5060,27600],"480000":[5300,29420],"510000":[5540,31240],"540000":[5780,33060],"570000":[6020,34880],"600000":[6260,36700],"630000":[6500,38520],"660000":[6740,40340],"690000":[6980,42160],"720000":[7220,43980],"750000":[7460,45800],"825000":[8060,50350],"900000":[8660,54900],"975000":[9260,59450],"1050000":[9860,64000],"1125000":[10460,68550],"1200000":[11050,73100],"1275000":[11650,77650],"1350000":[12250,82190],"1425000":[12850,86670],"1500000":[13450,91220],"1750000":[15090,106390],"2000000":[17090,121560]},"land":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1030,830],"11250":[1040,880],"12000":[1050,930],"12750":[1070,970],"13500":[1080,1020],"14250":[1090,1060],"15000":[1100,1110],"16500":[1130,1200],"18000":[1140,1300],"19500":[1160,1390],"21000":[1180,1480],"22500":[1190,1570],"24000":[1210,1660],"25500":[1220,1760],"27000":[1240,1850],"28500":[1260,1940],"30000":[1270,2030],"32000":[1290,2150],"34000":[1310,2280],"36000":[1340,2400],"38000":[1360,2520],"40000":[1380,2640],"42000":[1400,2760],"44000":[1420,2890],"46000":[1440,3010],"48000":[1460,3130],"50000":[1480,3250],"52000":[1510,3380],"54000":[1530,3500],"56000":[1550,3620],"58000":[1570,3740],"60000":[1590,3870],"62000":[1610,3990],"64000":[1620,4110],"66000":[1640,4230],"68000":[1660,4350],"70000":[1670,4470],"72000":[1690,4590],"74000":[1700,4720],"76000":[1720,4840],"78000":[1740,4960],"80000":[1750,5080],"83000":[1780,5260],"86000":[1800,5440],"89000":[1820,5630],"92000":[1850,5810],"95000":[1870,5990],"100000":[1910,6290],"105000":[1950,6600],"110000":[1990,6900],"115000":[2030,7200],"120000":[2070,7510],"125000":[2110,7810],"130000":[2150,8110],"135000":[2190,8420],"140000":[2230,8720],"150000":[2310,9330],"165000":[2430,10240],"180000":[2550,11150],"195000":[2670,12060],"240000":[3030,14790],"255000":[3150,15700],"270000":[3270,16610],"285000":[3390,17520],"300000":[3510,18430],"315000":[3630,19340],"330000":[3750,20250],"345000":[3870,21160],"360000":[3990,22070],"375000":[4110,22980],"390000":[4230,23890],"405000":[4350,24800],"420000":[4470,25710],"435000":[4590,26620],"450000":[4710,27530],"480000":[4950,29350],"510000":[5190,31170],"540000":[5430,32990],"570000":[5670,34810],"600000":[5910,36630],"630000":[6150,38450],"660000":[6390,40270],"690000":[6630,42090],"720000":[6860,43910],"750000":[7100,45730],"825000":[7700,50270],"900000":[8300,54820],"975000":[8900,59370],"1050000":[9500,63920],"1125000":[10100,68470],"1200000":[10700,73020],"1275000":[11300,77570],"1350000":[11900,82120],"1425000":[12500,86670],"1500000":[13100,91220],"1750000":[15090,106390],"2000000":[17090,121560]}};

  function interpolerBaremeFraisActe(table, prix) {
    const paliers = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (prix <= paliers[0]) return table[paliers[0]];
    if (prix >= paliers[paliers.length - 1]) return table[paliers[paliers.length - 1]];
    for (let i = 1; i < paliers.length; i++) {
      if (prix <= paliers[i]) {
        const bas = paliers[i - 1], haut = paliers[i];
        const t = (prix - bas) / (haut - bas);
        return table[bas] + (table[haut] - table[bas]) * t;
      }
    }
  }

  function formaterPourcentageFraisActe(x) {
    return (x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 5 }) + ' %';
  }

  // Recalculée à chaque changement de champ (voir les attributs oninput/onchange sur
  // #onglet-calculateur dans index.html) — aucune sauvegarde, purement une estimation à la volée.
  function calculerFraisActe() {
    const prixEl = document.getElementById('calc-price');
    const deptEl = document.getElementById('calc-dept');
    const typeEl = document.getElementById('calc-type');
    if (!prixEl || !deptEl || !typeEl || !deptEl.value) return;

    const prix = Math.max(1, Number(prixEl.value) || 1);
    const primoAccedant = document.querySelector('input[name="calc-first"]:checked').value === 'yes';
    const residencePrincipale = document.querySelector('input[name="calc-rp"]:checked').value === 'yes';
    const type = typeEl.value;
    const dept = DEPARTEMENTS_FRAIS_ACTE[deptEl.value];
    const bareme = BAREME_FRAIS_ACTE[type];

    // Hausse temporaire du taux départemental (loi de finances 2025, jusqu'à 5 %) non appliquée au
    // primo-accédant achetant sa résidence principale (art. L. 31-10-3 du CCH) — voir la note
    // affichée sous le résultat.
    const eligiblePrimoAccedant = primoAccedant && residencePrincipale;
    const tauxApplique = eligiblePrimoAccedant ? dept.base : dept.temp;

    const emoluments = interpolerBaremeFraisActe(Object.fromEntries(Object.entries(bareme).map(([k, v]) => [k, v[0]])), prix);
    const tresor45 = interpolerBaremeFraisActe(Object.fromEntries(Object.entries(bareme).map(([k, v]) => [k, v[1]])), prix);
    const tresor50 = tresor45 + prix * 0.0051185;
    const tresor = tresor45 + ((tauxApplique - 0.045) / 0.005) * (tresor50 - tresor45);
    const total = emoluments + 200 + tresor + 200;
    const dmto = tauxApplique + 0.012 + tauxApplique * 0.0237;

    const libelleType = type === 'house' ? 'Immeuble hors copropriété' : type === 'condo' ? 'Immeuble en copropriété' : 'Terrain à bâtir';
    document.getElementById('calc-tag').textContent = libelleType + ' · ' + (eligiblePrimoAccedant ? 'Primo-accédant éligible' : 'Régime sans exonération de la hausse');
    document.getElementById('calc-emol').textContent = formaterPrix(emoluments);
    document.getElementById('calc-tre').textContent = formaterPrix(tresor);
    document.getElementById('calc-total2').textContent = formaterPrix(total);
    document.getElementById('calc-total').textContent = formaterPrix(total);
    document.getElementById('calc-base-rate').textContent = formaterPourcentageFraisActe(dept.base);
    document.getElementById('calc-applied-rate').textContent = formaterPourcentageFraisActe(tauxApplique);
    document.getElementById('calc-dmt-rate').textContent = formaterPourcentageFraisActe(dmto);

    const economie = (dept.temp - dept.base) * prix * 1.0237;
    document.getElementById('calc-saving').textContent = (eligiblePrimoAccedant && dept.temp > dept.base)
      ? 'Économie liée à la non-application de la hausse départementale : environ ' + formaterPrix(economie) + '.'
      : '';
    document.getElementById('calc-regime').textContent = eligiblePrimoAccedant
      ? 'Primo-accédant : taux départemental de droit commun ' + formaterPourcentageFraisActe(dept.base) + ' ; la hausse temporaire de ' + formaterPourcentageFraisActe(dept.temp - dept.base) + ' n’est pas appliquée.'
      : 'Taux départemental appliqué : ' + formaterPourcentageFraisActe(dept.temp) + ' au 1er juin 2026.';
  }

  // Peuple le <select> des départements une seule fois au démarrage (le calculateur est toujours
  // dans le DOM, comme les autres onglets — voir definirOnglet) et calcule un premier résultat par
  // défaut, visible dès le premier passage sur l'onglet. Un simple drapeau plutôt qu'une lecture de
  // `deptEl.options` : le faux document des tests (tests/helpers/load-app.js) ne modélise pas les
  // `<select>`/`<option>` du DOM réel, `.options` y est `undefined`.
  let calculateurFraisActeInitialise = false;
  function initCalculateurFraisActe() {
    if (calculateurFraisActeInitialise) return;
    const deptEl = document.getElementById('calc-dept');
    if (!deptEl) return;
    for (const [code, d] of Object.entries(DEPARTEMENTS_FRAIS_ACTE)) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = code + ' — ' + d.name;
      if (code === '41') option.selected = true;
      deptEl.appendChild(option);
    }
    calculateurFraisActeInitialise = true;
    calculerFraisActe();
  }

  // Remplit les emplacements d'icônes du HTML statique (sidebar, burger mobile, dropzone) — le
  // reste de l'application est déjà rendu depuis script.js, ce point d'entrée unique évite de
  // dupliquer le dessin des icônes entre le HTML et ICONES.
  function initIconesStatiques() {
    const cibles = {
      'icon-burger': 'menu',
      'icon-nav-dashboard': 'layout',
      'icon-nav-nouveau': 'plus',
      'icon-nav-suivi': 'list',
      'icon-install': 'download',
      'icon-dropzone': 'upload',
      'icon-intro-dates': 'calendar',
      'icon-intro-doc': 'file-text',
      'icon-intro-pieces': 'folder',
      'icon-intro-mail': 'mail',
      'icon-intro-adresse': 'map-pin',
      'icon-nav-calculateur': 'banknote'
    };
    for (const [id, nom] of Object.entries(cibles)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = icone(nom);
    }
  }
  initIconesStatiques();
  initCalculateurFraisActe();

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
