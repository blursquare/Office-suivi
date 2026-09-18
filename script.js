
  // Affichées dans l'écran "À propos" (voir ouvrirAPropos ci-dessous) — permet à l'étude de
  // vérifier en un coup d'œil qu'elle a bien la dernière copie retéléchargée depuis le dépôt avant
  // de resignaler un bug déjà corrigé : l'outil n'a pas de mise à jour automatique (pas de build,
  // pas de serveur — voir contrainte n°1 de CLAUDE.md), et plusieurs signalements de cette session
  // se sont révélés être une copie obsolète testée par erreur.
  // Format DATE + HEURE (pas seulement la date) : plusieurs versions peuvent se succéder dans la
  // même journée (plusieurs corrections l'une après l'autre) — une simple date ne permettrait pas
  // de les distinguer. À METTRE À JOUR MANUELLEMENT à chaque commit qui modifie le comportement de
  // l'outil, avec l'heure RÉELLE au moment du commit, **en heure de Paris** (celle de l'étude) —
  // demandé explicitement, l'environnement de développement tournant par défaut en UTC. Utiliser
  // `TZ='Europe/Paris' date '+%Y-%m-%d %H:%M'` en shell (jamais `date` seul, qui rendrait l'heure
  // UTC — décalée d'1h ou 2h selon l'heure d'été/hiver) — ne PAS deviner ni recopier l'heure d'un
  // commit précédent, et ne pas automatiser via un numéro de commit git : ces 3 fichiers sont
  // utilisés hors de tout dépôt une fois déposés chez l'étude, aucune information git n'est
  // disponible à l'exécution.
  const VERSION_APP = '2026-09-18 07:52';

  // Court historique des dernières versions (la plus récente en tête), affiché sous le numéro de
  // version dans l'écran "À propos" — le numéro seul dit "ce n'est pas la même version", cette
  // liste dit en plus CE QUI A CHANGÉ, ce qui permet à l'étude de vérifier qu'elle a bien reçu un
  // correctif précis sans avoir à me redemander. Garder au plus les ~8 entrées les plus récentes
  // (au-delà, l'historique complet reste dans CLAUDE.md) ; ajouter une entrée en tête à CHAQUE mise
  // à jour de VERSION_APP, jamais la remplacer seule sans laisser de trace du changement précédent.
  const HISTORIQUE_VERSIONS = [
    { version: '2026-09-18 07:52', resume: "Retouches d'affichage : champs de recherche du Suivi et du Tableau de bord aux mêmes coins arrondis, espace vide supprimé au-dessus de la croix de fermeture d'une fiche, et page « Nouveau dossier » corrigée sur téléphone — la zone d'import repasse au-dessus du descriptif, les deux blocs prennent toute la largeur, et les quatre étapes du wizard ne débordent plus de l'écran" },
    { version: '2026-09-18 01:52', resume: "L'IA locale relit l'acte en trois passes ciblées (parties et notaires / bien et prix / échéances) au lieu d'une seule : chaque valeur qu'elle propose est vérifiée en retrouvant sa citation dans le PDF, jamais retenue sur sa seule affirmation ; quand elle contredit la détection automatique, c'est cette dernière qui reste, l'écart étant signalé dans le panneau plutôt que tranché en silence ; un délai qu'elle rapporte est calculé par l'outil, jamais par elle" },
    { version: '2026-09-18 01:42', resume: "La fiche d'un dossier garde désormais la trace de ce que l'outil avait compris de l'acte à l'import (type d'acte, parties et leurs rôles, notaires, cadastre, statut de chaque donnée) : nouveau panneau « Ce que l'outil avait compris de l'acte », replié, sous l'analyse juridique — conservé aussi lors d'un export/import de sauvegarde" },
    { version: '2026-09-18 01:37', resume: "Nouveau panneau « Ce que l'outil a compris » à l'étape Vérifier : type d'acte, parties et leurs rôles, adresse et cadastre du bien, notaires (dont celui qui reçoit l'acte) et chaque date avec son statut (confirmé / à vérifier / non trouvé), sa provenance et sa page ; alertes de cohérence (prêt après l'acte, date écrite contredite par un délai, adresse incomplète…) rappelées avant d'enregistrer ; le rôle de l'étude est pré-rempli quand le document le dit clairement" },
    { version: '2026-09-18 01:21', resume: "Noms de dossier corrigés : le type d'acte (compromis / promesse de vente / promesse d'achat) est désormais déterminé avant d'attribuer les rôles — dans une promesse d'achat le promettant est l'ACQUÉREUR, les deux parties étaient jusqu'ici interverties ; « L'ACQUÉREUR » ne ramène plus le nom du vendeur ; plusieurs vendeurs et les SCI (avec leur représentant) sont conservés" },
    { version: '2026-09-18 00:41', resume: "Couleurs acte/vente préalable échangées (acte en vert, vente en bleu) ; l'IA locale du wizard recopie désormais les clauses mot pour mot ; ajout/édition d'une obligation du vendeur directement sur une fiche déjà enregistrée ; colonnes du Suivi réordonnées (offre de prêt avant prochaine échéance) ; badge Alpha redescendu sous le logo, remplacé en haut à droite par l'indicateur de connexion au serveur" },
    { version: '2026-09-15 14:25', resume: "Apprentissage : une pièce mal reconnue et réinitialisée n'est plus jamais reproposée pour cette pièce (sur aucun dossier) ; une clause ajoutée manuellement comme engagement du vendeur enrichit aussi la détection automatique des prochains imports" },
    { version: '2026-09-15 14:13', resume: "Champ de recherche dans l'aperçu PDF (comme Ctrl+F d'un lecteur PDF), navigation résultat suivant/précédent" },
    { version: '2026-09-15 14:02', resume: "Retours de test du matin : indicateur de connexion serveur (sidebar), achat comptant affiché clairement (plus de \"Non renseigné\"), ajout manuel d'un engagement du vendeur sans sélection PDF, catégorie \"Autres\" pour les engagements, indicateur pendant la recherche IA" },
    { version: '2026-09-14 20:26', resume: "Le wizard « Nouveau dossier » utilise aussi l'IA locale en arrière-plan : complète nom/adresse/prix/dates non trouvés par les regex et suggère des engagements du vendeur en plus, jamais en remplacement" },
    { version: '2026-09-14 20:11', resume: "Nouvel onglet « Analyse approfondie (IA) » : dépose l'acte + ses annexes séparées, relecture croisée par un modèle IA local (Ollama, aucune donnée envoyée en ligne) — voir server/README.md" },
    { version: '2026-09-14 19:27', resume: "Vrai correctif du bug apostrophe (Certificat d'urbanisme/d'alignement) : le précédent (&#39;) ne survivait pas au décodage HTML de l'attribut onclick, toujours cassé en pratique" }
  ];

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
  // Incrémenté à chaque nouvel import (traiterFichierPdf) et à chaque reset du formulaire
  // (reinitialiserFormulaire) — permet à lancerExtractionIa() de vérifier, une fois sa réponse
  // reçue, qu'elle porte encore sur l'import en cours plutôt que sur un import précédent déjà
  // enregistré ou abandonné (l'appel au LLM local peut prendre plusieurs dizaines de secondes).
  let generationImportActuel = 0;

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
    x: '<line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/>',
    'trend-up': '<path d="M2.5 12 6.8 7.7 9.3 10.2 13.5 6"/><path d="M9.5 6h4v4"/>',
    'trend-down': '<path d="M2.5 4 6.8 8.3 9.3 5.8 13.5 10"/><path d="M9.5 10h4v-4"/>',
    info: '<circle cx="8" cy="8" r="6.2"/><line x1="8" y1="7.2" x2="8" y2="11.3"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none"/>',
    'chevron-down': '<path d="M3.5 6 8 10.5 12.5 6"/>',
    'chevron-up': '<path d="M3.5 10 8 5.5 12.5 10"/>',
    'rotate-ccw': '<path d="M13.3 8A5.3 5.3 0 1 1 10.8 3.4"/><path d="M13.6 2.6v3.6h-3.6"/>'
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
    // Le guillemet ne doit pas être précédé d'une LETTRE : sans cette condition, l'apostrophe
    // d'élision de « L'ACQUÉREUR » (formulation des plus courantes) passait pour un guillemet
    // ouvrant, le style était pris pour une étiquette finale, et le nom était cherché EN ARRIÈRE —
    // ramenant le nom du vendeur présenté juste avant, au lieu de celui de l'acquéreur. Bug
    // préexistant, révélé par les textes de test des trois types d'acte.
    return /(^|[^A-Za-zÀ-ÿ])["«'’]\s*(?:le|la|l['’]|du|des)?\s*$/i.test(avant) ||
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
  // Ancré sur la qualité qui joue réellement le rôle d'ACQUÉREUR dans CE type d'acte : sur une
  // promesse d'achat, « bénéficiaire » désigne le vendeur — s'y ancrer aurait rempli le champ
  // « email de l'acquéreur » avec l'adresse du vendeur, et donc adressé les relances de prêt à la
  // mauvaise partie. Le paramètre est optionnel : sans lui, le type est détecté à la volée.
  function detecterEmailAcquereur(texte, typeActe) {
    const qualite = qualitePourRole(texte, typeActe || detecterTypeActe(texte).valeur, 'ACQUEREUR');
    const roleRe = new RegExp((qualite ? qualite.re : RE_ROLE_ACQUEREUR).source, 'gi');
    let m;
    while ((m = roleRe.exec(texte)) !== null) {
      // Recul borné à la phrase courante (s'arrête au point précédent, comme extraireContexte) :
      // sans ça, l'email du VENDEUR cité juste avant dans le document pouvait être capté à la
      // place de celui de l'ACQUEREUR sur un simple recul à distance fixe.
      // Seul un point SUIVI D'UNE ESPACE arrête le recul : un point collé appartient à l'adresse
      // email elle-même (« pierre.martin@… ») ou à une abréviation — s'y arrêter tronquait la
      // fenêtre en plein milieu de l'adresse recherchée, qui était alors manquée au profit de la
      // suivante, c'est-à-dire celle de l'autre partie.
      let debut = m.index;
      let n = 0;
      while (debut > 0 && n < 150) {
        if (texte[debut - 1] === '.' && (debut >= texte.length || /\s/.test(texte[debut]))) break;
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

  // Le nom de dossier reste au format « VENDEUR / ACQUÉREUR » (demandé par l'étude), mais les deux
  // côtés sont désormais déterminés par detecterParties() en tenant compte du type d'acte : sur une
  // promesse d'achat, le promettant est l'ACQUÉREUR, et c'est lui qui doit figurer à droite.
  function detecterNomDossier(texte) {
    const parties = detecterParties(texte, detecterTypeActe(texte).valeur);
    const partieVendeur = parties.filter(p => p.role === 'VENDEUR').map(p => p.nom).join(' & ');
    const partieAcquereur = parties.filter(p => p.role === 'ACQUEREUR').map(p => p.nom).join(' & ');
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

  // ==== EXTRACTION STRUCTURÉE : type d'acte et qualités des parties ====
  //
  // Point de départ de toute la refonte : le TYPE D'ACTE doit être déterminé AVANT d'attribuer les
  // rôles, parce que la même qualité ne désigne pas la même partie d'un acte à l'autre.
  //  - compromis de vente        : vendeur → VENDEUR,     acquéreur   → ACQUEREUR
  //  - promesse de vente         : promettant → VENDEUR,  bénéficiaire → ACQUEREUR
  //  - promesse d'ACHAT          : promettant → ACQUEREUR, bénéficiaire → VENDEUR  (inversion !)
  // Jusqu'ici RE_ROLE_VENDEUR listait « promettant » comme simple synonyme de « vendeur », sans
  // jamais regarder le type d'acte : une promesse d'achat ressortait donc avec vendeur et acquéreur
  // intervertis, silencieusement.

  var TYPES_ACTE = ['COMPROMIS_DE_VENTE', 'PROMESSE_DE_VENTE', 'PROMESSE_D_ACHAT', 'AUTRE', 'INCONNU'];

  // Chaque type d'acte donne la correspondance qualité → rôle. Les quatre qualités sont présentes
  // dans chaque table : un compromis peut employer le vocabulaire « promettant » (promesse
  // synallagmatique), et une promesse peut nommer les parties « vendeur »/« acquéreur » dans ses
  // clauses. INCONNU et AUTRE reprennent volontairement la convention historique de l'outil
  // (promettant → vendeur) : sans type d'acte établi, on ne change rien à ce qui marchait.
  var ROLES_PAR_TYPE_ACTE = {
    COMPROMIS_DE_VENTE: { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    PROMESSE_DE_VENTE:  { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    PROMESSE_D_ACHAT:   { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'ACQUEREUR', beneficiaire: 'VENDEUR' },
    AUTRE:              { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    INCONNU:            { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' }
  };

  function roleDepuisQualite(typeActe, qualite) {
    const table = ROLES_PAR_TYPE_ACTE[typeActe] || ROLES_PAR_TYPE_ACTE.INCONNU;
    return table[qualite] || null;
  }

  // Motifs de qualité, séparés (contrairement à RE_ROLE_VENDEUR/RE_ROLE_ACQUEREUR, qui fusionnaient
  // deux qualités distinctes dans un même motif et rendaient l'inversion impossible à exprimer).
  // « propriétaire » est volontairement ABSENT malgré la spec : le mot apparaît constamment dans la
  // désignation du bien et les clauses de jouissance d'un compromis ordinaire, il ferait remonter
  // des blocs de texte sans rapport avec la présentation des parties. À réintroduire seulement si
  // un acte réel montre qu'il est le seul mot employé pour désigner le vendeur.
  var RE_QUALITE_VENDEUR = /\bvendeurs?\b|\bparties?\s+venderesses?\b|\bc[ée]dants?\b/i;
  var RE_QUALITE_PROMETTANT = /\bpromettants?\b/i;
  var RE_QUALITE_ACQUEREUR = /\bacqu[ée]reurs?\b|\bacheteurs?\b|\bparties?\s+acqu[ée]reuses?\b|\bcessionnaires?\b/i;
  var RE_QUALITE_BENEFICIAIRE = /\bb[ée]n[ée]ficiaires?\b/i;

  var QUALITES_CONNUES = [
    { qualite: 'vendeur', re: RE_QUALITE_VENDEUR },
    { qualite: 'promettant', re: RE_QUALITE_PROMETTANT },
    { qualite: 'acquereur', re: RE_QUALITE_ACQUEREUR },
    { qualite: 'beneficiaire', re: RE_QUALITE_BENEFICIAIRE }
  ];

  // Zone d'analyse du type d'acte : titre + exposé, là où l'acte se nomme lui-même. Au-delà, les
  // clauses citent couramment les autres formes (« à défaut de réitération de la présente
  // promesse », « comme il est d'usage en matière de compromis »), ce qui brouillerait le comptage.
  var ZONE_TYPE_ACTE = 6000;

  var MOTIFS_TYPE_ACTE = [
    { type: 'PROMESSE_D_ACHAT', re: /promesse\s+(?:unilat[ée]rale\s+)?d['’\s]*achat|offre\s+d['’\s]*achat\s+irr[ée]vocable/gi },
    { type: 'PROMESSE_DE_VENTE', re: /promesse\s+(?:unilat[ée]rale\s+)?de\s+vente/gi },
    { type: 'COMPROMIS_DE_VENTE', re: /compromis(?:\s+de\s+vente)?|promesse\s+synallagmatique(?:\s+de\s+vente)?/gi }
  ];

  // Classification par le contexte global plutôt que par la présence d'un mot isolé (exigence
  // explicite de la spec) : on compte les occurrences de chaque forme dans la zone de titre et on
  // ne déclare CONFIRMED qu'une dominance nette. À égalité, ou sans aucune occurrence, le type
  // reste INCONNU — et les rôles retombent alors sur la convention historique, jamais sur une
  // inversion hasardeuse.
  function detecterTypeActe(texte) {
    const zone = String(texte || '').slice(0, ZONE_TYPE_ACTE);
    const mesures = MOTIFS_TYPE_ACTE.map(m => {
      const re = new RegExp(m.re.source, 'gi');
      let occurrences = 0;
      let premier = null;
      let trouve;
      while ((trouve = re.exec(zone)) !== null) {
        occurrences++;
        if (premier === null) premier = trouve;
      }
      return { type: m.type, occurrences, premier };
    });
    const classees = mesures.filter(m => m.occurrences > 0).sort((a, b) => b.occurrences - a.occurrences);
    if (classees.length === 0) return { valeur: 'INCONNU', statut: 'NOT_FOUND', source: null };
    const gagnant = classees[0];
    const suivant = classees[1];
    const source = gagnant.premier
      ? { extrait: extraireContexte(zone, gagnant.premier.index, gagnant.premier[0].length), index: gagnant.premier.index }
      : null;
    // Dominance nette : soit la seule forme citée, soit deux fois plus citée que la suivante.
    const net = !suivant || gagnant.occurrences >= suivant.occurrences * 2;
    return { valeur: gagnant.type, statut: net ? 'CONFIRMED' : 'NEEDS_REVIEW', source };
  }

  // Pour un rôle donné (VENDEUR/ACQUEREUR) et un type d'acte, retrouve la qualité effectivement
  // employée par le document et la position de sa première mention.
  function qualitePourRole(texte, typeActe, role) {
    const candidats = QUALITES_CONNUES
      .filter(q => roleDepuisQualite(typeActe, q.qualite) === role)
      .map(q => ({ ...q, index: String(texte || '').search(q.re) }))
      .filter(q => q.index !== -1)
      .sort((a, b) => a.index - b.index);
    return candidats[0] || null;
  }

  // Personne morale : la raison sociale suit la forme juridique, parfois entre guillemets. Premier
  // jet, comme l'ont été les motifs de pièces en leur temps — à resserrer sur de vrais actes.
  var RE_PERSONNE_MORALE = /\b(SCI|SCCV|SARL|SASU|SAS|EURL|SCP|SA|SC)\b[\s,]*(?:d[ée]nomm[ée]e?\s+)?["«'’]?\s*([A-ZÀ-Ü0-9][^,.\n«»"'’]{2,60}?)\s*["»'’]?\s*(?=,|\.|\n|$|\bau\s+capital\b|\bdont\s+le\s+si[èe]ge\b|\brepr[ée]sent)/;
  var RE_REPRESENTANT = /repr[ée]sent[ée]e?\s+par\s+(?:Monsieur|Madame|Mademoiselle|M\.|Mme)?\s*([A-ZÀ-Ü][^,.\n]{2,60}?)(?=,|\.|\n|$|\ben\s+qualit[ée]\b|\bagissant\b)/i;

  // Extrait les parties du document, chacune avec sa qualité TELLE QU'ÉCRITE dans l'acte et le rôle
  // qui en découle POUR CE TYPE D'ACTE. Gère plusieurs vendeurs et plusieurs acquéreurs (les noms
  // sont extraits un par un, voir extraireNomsParNaissance), ainsi qu'une personne morale avec son
  // représentant.
  function detecterParties(texte, typeActe) {
    const source = String(texte || '');
    if (!source) return [];
    const type = TYPES_ACTE.includes(typeActe) ? typeActe : 'INCONNU';
    const cotes = [
      qualitePourRole(source, type, 'VENDEUR'),
      qualitePourRole(source, type, 'ACQUEREUR')
    ].filter(Boolean);
    // Parcours dans l'ordre d'apparition : sur une promesse d'achat, la partie qui joue le rôle de
    // VENDEUR (le bénéficiaire) peut être présentée après l'autre.
    cotes.sort((a, b) => a.index - b.index);

    const parties = [];
    let curseur = 0;
    for (const cote of cotes) {
      const role = roleDepuisQualite(type, cote.qualite);
      const resultat = nomsEtFinPourRole(source, cote.re, curseur);
      let noms = resultat.noms;
      const bloc = source.slice(cote.index, Math.min(source.length, cote.index + 1200));

      // Personne morale : sa raison sociale remplace les noms de personnes physiques du bloc, qui
      // ne sont alors que ceux du représentant.
      const morale = bloc.match(RE_PERSONNE_MORALE);
      if (morale) {
        const mRepresentant = bloc.match(RE_REPRESENTANT);
        parties.push({
          nom: `${morale[1]} ${morale[2].trim()}`.replace(/\s+/g, ' ').trim(),
          qualiteActe: cote.qualite,
          role,
          qualitePersonne: 'morale',
          representant: mRepresentant ? mRepresentant[1].replace(/\s+/g, ' ').trim() : null,
          source: { extrait: extraireContexte(source, cote.index, cote.qualite.length), index: cote.index }
        });
        curseur = resultat.finAbsolue;
        continue;
      }

      if (noms.length === 0) noms = extraireNomsRepli(source, cote.re);
      for (const nom of noms) {
        parties.push({
          nom,
          qualiteActe: cote.qualite,
          role,
          qualitePersonne: 'physique',
          representant: null,
          source: { extrait: extraireContexte(source, cote.index, cote.qualite.length), index: cote.index }
        });
      }
      curseur = resultat.finAbsolue;
    }
    return parties;
  }

  // ==== EXTRACTION STRUCTURÉE : socle de calcul (dates) ====
  //
  // Refonte demandée par l'étude (voir CLAUDE.md) : une date d'échéance exprimée en délai doit
  // être calculée de façon DÉTERMINISTE, côté application — jamais par le modèle IA local, dont
  // l'arithmétique calendaire n'est pas fiable. Ces fonctions sont pures et testées
  // (tests/dates-metier.test.js) ; elles serviront ensuite à construireDatesMetier().

  // Ajoute n mois "de quantième à quantième" : le 31 janvier + 1 mois donne le 28 (ou 29) février,
  // pas le 3 mars — c'est la règle de computation usuelle d'un délai en mois (art. 641 CPC), et
  // c'est aussi ce qu'un notaire attend en lisant « dans les trois mois de la signature ».
  function ajouterMois(iso, n) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(n)) return null;
    const [annee, mois, jour] = iso.split('-').map(Number);
    const totalMois = annee * 12 + (mois - 1) + n;
    const anneeCible = Math.floor(totalMois / 12);
    const moisCible = ((totalMois % 12) + 12) % 12; // 0-11, correct aussi pour un n négatif
    // Jour 0 du mois suivant = dernier jour du mois visé (gère février et les années bissextiles).
    const dernierJour = new Date(Date.UTC(anneeCible, moisCible + 1, 0)).getUTCDate();
    return `${anneeCible}-${pad(moisCible + 1)}-${pad(Math.min(jour, dernierJour))}`;
  }

  // Calcule une date d'échéance à partir d'une date de départ et d'un délai {valeur, unite}.
  // Renvoie null si la base est inconnue — cas courant et VOULU : un délai dont le point de départ
  // n'est pas la signature ("à compter de la réalisation de la condition suspensive", "à compter
  // de la notification") ne doit pas être calculé au petit bonheur, il doit remonter en
  // NEEDS_REVIEW pour que l'étude tranche (voir la spec : ne jamais présenter comme certaine une
  // date dont la convention de computation n'est pas établie par le document).
  function calculerDateEcheance(baseIso, delai) {
    if (!baseIso || !delai) return null;
    const valeur = Number(delai.valeur);
    if (!Number.isFinite(valeur) || valeur <= 0) return null;
    if (delai.unite === 'mois') return ajouterMois(baseIso, valeur);
    if (delai.unite === 'jours') return addDays(baseIso, valeur);
    return null;
  }

  // ==== EXTRACTION STRUCTURÉE : dates métier ====
  //
  // Un compromis contient des dizaines de dates (naissance, diagnostics, titres antérieurs,
  // assemblées générales…). La spec l'énonce clairement : il est interdit de prendre « la première »
  // ou « la dernière » — chaque date doit être classée par sa FONCTION juridique, et l'outil doit
  // pouvoir dire d'où il tient celle qu'il retient.

  var TYPES_DATE = ['SIGNATURE_AVANT_CONTRAT', 'BUTOIR_PRET', 'BUTOIR_VENTE_PREALABLE', 'REITERATION_ACTE', 'AUTRE'];

  // Correspondance avec les trois champs d'échéance existants de la fiche : le vocabulaire interne
  // change, le modèle de données du dossier ne bouge pas.
  var CHAMP_PAR_TYPE_DATE = {
    BUTOIR_PRET: 'pret',
    REITERATION_ACTE: 'acte',
    BUTOIR_VENTE_PREALABLE: 'ventebien'
  };

  function uniteDelai(mot) {
    return /mois/i.test(String(mot || '')) ? 'mois' : 'jours';
  }

  // Les actes écrivent les durées courtes en toutes lettres au moins aussi souvent qu'en chiffres
  // (« dans les trois mois de la signature ») : ne reconnaître que les chiffres laissait ces
  // clauses totalement invisibles.
  var NOMBRES_EN_LETTRES = {
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40,
    cinquante: 50, soixante: 60, 'quatre-vingts': 80, 'quatre-vingt': 80, 'quatre-vingt-dix': 90, cent: 100
  };

  // Fragment réutilisé par tous les motifs de délai : un nombre en chiffres OU en lettres. Trié par
  // longueur décroissante pour que « quatre-vingt-dix » l'emporte sur « quatre ».
  var MOTIF_NOMBRE = '(\\d{1,3}|' + Object.keys(NOMBRES_EN_LETTRES).sort((a, b) => b.length - a.length).join('|') + ')';

  function valeurNombre(mot) {
    const brut = String(mot || '').trim().toLowerCase();
    if (/^\d+$/.test(brut)) return parseInt(brut, 10);
    return Object.prototype.hasOwnProperty.call(NOMBRES_EN_LETTRES, brut) ? NOMBRES_EN_LETTRES[brut] : NaN;
  }

  // Points de départ d'un délai rencontrés dans les actes. SEULE la signature a une base connue de
  // l'outil (la date du compromis) : un délai « à compter de la notification du refus » ou « de la
  // réalisation de la condition suspensive » dépend d'un événement dont la date n'est pas dans
  // l'acte — la spec interdit explicitement de supposer que tout délai part de la signature.
  var POINTS_DEPART_CONNUS = [
    { cle: 'signature', calculable: true, re: /la\s+signature|des\s+pr[ée]sentes|ce\s+jour|l['’]acte|la\s+pr[ée]sente|le\s+pr[ée]sent\s+(?:compromis|acte)|la\s+promesse/i },
    { cle: 'notification', calculable: false, re: /notification|r[ée]ception\s+(?:de\s+la\s+lettre|du\s+courrier|de\s+l['’]avis)/i },
    { cle: 'realisation_condition', calculable: false, re: /r[ée]alisation\s+de\s+(?:la|cette|ladite)\s+condition|lev[ée]e\s+de\s+(?:la|cette|ladite)\s+condition|obtention\s+(?:du\s+pr[êe]t|des\s+offres)/i },
    { cle: 'purge_preemption', calculable: false, re: /purge|droit\s+de\s+pr[ée]emption/i }
  ];

  function pointDepartDepuisAncre(ancre) {
    const texte = String(ancre || '');
    if (!texte.trim()) return null;
    const trouve = POINTS_DEPART_CONNUS.find(p => p.re.test(texte));
    return trouve ? trouve.cle : 'inconnu';
  }

  function pointDepartCalculable(cle) {
    const trouve = POINTS_DEPART_CONNUS.find(p => p.cle === cle);
    return !!(trouve && trouve.calculable);
  }

  // Repère TOUS les délais du texte, y compris ceux que detecterDatesDepuisTexte ne peut pas
  // convertir en date (point de départ autre que la signature). Ne calcule rien : c'est
  // construireDatesMetier qui décide, et NEEDS_REVIEW est un résultat légitime.
  // Le connecteur qui introduit le point de départ ne se limite pas à « à compter de » : « dans les
  // deux mois DE LA réalisation de la condition » est tout aussi courant.
  var MOTIF_ANCRE_DELAI = '(?:[àa]\\s+compter\\s+d[eu]|[àa]\\s+partir\\s+d[eu]|apr[èe]s|suivant|de\\s+la|de\\s+l[\'’]|du|des)';

  var RE_DELAI_GENERIQUE = new RegExp(
    '(?:d[ée]lai\\s+de\\s+|au\\s+plus\\s+tard\\s+(?:dans\\s+(?:les?\\s+|un\\s+d[ée]lai\\s+de\\s+)?)?|dans\\s+(?:les?\\s+|un\\s+d[ée]lai\\s+de\\s+))' +
    MOTIF_NOMBRE + '\\s*(jours?|mois)(?:\\s+' + MOTIF_ANCRE_DELAI + '\\s+([^.,;\\n]{0,80}))?',
    'gi'
  );

  function detecterDelais(texte) {
    const source = String(texte || '');
    const resultats = [];
    const re = new RegExp(RE_DELAI_GENERIQUE.source, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      const valeur = valeurNombre(m[1]);
      if (!Number.isFinite(valeur)) continue;
      const contexte = extraireContexte(source, m.index, m[0].length);
      // Même garde-fou que dans detecterDatesDepuisTexte : le délai de notification du refus au
      // notaire n'est pas la condition suspensive elle-même (voir l'historique du 60 j / 70 j).
      const avant = source.slice(Math.max(0, m.index - 200), m.index);
      const ancre = m[3] || '';
      const pointDepart = ancre ? pointDepartDepuisAncre(ancre) : 'signature';
      resultats.push({
        index: m.index,
        extrait: contexte,
        delai: { valeur, unite: uniteDelai(m[2]) },
        // Sans ancre explicite, la convention (déjà appliquée par reAuPlusTardDelai) est de compter
        // depuis la signature : « la présente convention est soumise à… au plus tard dans les 60
        // jours ». On le note pour pouvoir l'expliquer à l'étude plutôt que de le taire.
        pointDepart,
        pointDepartImplicite: !ancre,
        ancre: ancre.trim() || null,
        notification: /notifier|notification/i.test(avant),
        suggestion: suggererEcheance(contexte),
        page: pageDepuisIndex(m.index)
      });
    }
    return resultats;
  }

  function champDateVide(raison) {
    return { valeur: null, statut: 'NOT_FOUND', methode: null, origine: 'regex', source: null, candidats: [], calcul: null, raison: raison || '' };
  }

  // Construit un objet date métier par type, à partir des candidates déjà détectées et des délais
  // repérés. Règles issues de la spec :
  //  - une date écrite noir sur blanc (EXPLICIT) n'est JAMAIS remplacée par une date calculée ;
  //  - plusieurs candidates de même type sans formulation permettant de trancher → NEEDS_REVIEW,
  //    avec les deux sources conservées, plutôt qu'un choix arbitraire silencieux ;
  //  - un délai dont le point de départ n'est pas connu → NEEDS_REVIEW SANS valeur : on signale la
  //    clause et son délai, on ne fabrique pas une date depuis la signature « pour faire joli ».
  function construireDatesMetier(detectedDates, delais, dateCompromis) {
    const candidatesToutes = Array.isArray(detectedDates) ? detectedDates : [];
    const delaisTous = Array.isArray(delais) ? delais : [];
    const dates = {};

    dates.SIGNATURE_AVANT_CONTRAT = dateCompromis
      ? { valeur: dateCompromis, statut: 'CONFIRMED', methode: 'EXPLICIT', origine: 'regex', source: null, candidats: [], calcul: null, raison: 'Date de signature de l’avant-contrat détectée dans le document.' }
      : champDateVide('Aucune date de signature trouvée : les délais exprimés en jours ou en mois ne peuvent pas être calculés.');

    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      const champ = CHAMP_PAR_TYPE_DATE[typeDate];
      const toutesDuType = candidatesToutes.filter(d => d.suggestion === champ);
      // Une date écrite noir sur blanc l'emporte sur une date calculée depuis un délai : l'acte
      // énonce souvent les deux dans la même phrase (« au plus tard le 15 novembre 2026, soit un
      // délai de 60 jours à compter de la signature »), et les deux diffèrent d'un jour ou deux
      // selon la convention de computation. Sans cette priorité, la date calculée l'emportait —
      // exactement ce que la spec interdit.
      const explicites = toutesDuType.filter(d => !d.calcul);
      const candidats = explicites.length > 0 ? explicites : toutesDuType;

      if (candidats.length > 0) {
        const choix = meilleureCandidateEcheance(candidats, champ);
        const retenu = choix.candidat;
        const calculee = !!(retenu && retenu.calcul);
        // Quand une date écrite a été préférée à une date calculée, on garde cette dernière de
        // côté : si les deux divergent nettement, c'est que deux clauses de l'acte se contredisent
        // (voir controlerCoherence, DATE_EXPLICITE_VS_DELAI).
        const alternative = explicites.length > 0 ? toutesDuType.find(d => d.calcul) : null;
        dates[typeDate] = {
          valeur: retenu ? retenu.iso : null,
          statut: choix.ambigu ? 'NEEDS_REVIEW' : 'CONFIRMED',
          methode: calculee ? 'CALCULATED' : 'EXPLICIT',
          origine: 'regex',
          source: retenu ? { page: retenu.page || null, extrait: retenu.contexte || null, index: typeof retenu.index === 'number' ? retenu.index : null } : null,
          // Les concurrentes ne sont conservées QUE lorsqu'il faut trancher : sinon la fiche
          // afficherait des « candidats » là où il n'y a jamais eu d'hésitation.
          candidats: choix.ambigu
            ? candidats.map(c => ({ valeur: c.iso, origine: 'regex', source: { page: c.page || null, extrait: c.contexte || null } }))
            : [],
          calcul: calculee ? retenu.calcul : null,
          calculAlternatif: alternative ? alternative.iso : null,
          raison: choix.ambigu
            ? 'Plusieurs clauses donnent une date pour cette échéance, sans formulation permettant de trancher.'
            : (calculee ? 'Date calculée à partir d’un délai exprimé dans l’acte.' : 'Date lue directement dans l’acte.')
        };
        continue;
      }

      // Aucune date calendaire pour ce type : reste-t-il un délai qui s'y rapporte mais qu'on n'a
      // pas pu convertir ? C'est le cas visé par la spec (« point de départ différent »).
      const delaiOrphelin = delaisTous.find(d => d.suggestion === champ && !d.notification &&
        (!pointDepartCalculable(d.pointDepart) || !dateCompromis));
      if (delaiOrphelin) {
        const manqueBase = !dateCompromis && pointDepartCalculable(delaiOrphelin.pointDepart);
        dates[typeDate] = {
          valeur: null,
          statut: 'NEEDS_REVIEW',
          methode: 'CALCULATED',
          origine: 'regex',
          source: { page: delaiOrphelin.page || null, extrait: delaiOrphelin.extrait, index: delaiOrphelin.index },
          candidats: [],
          calcul: { delai: delaiOrphelin.delai, pointDepart: delaiOrphelin.pointDepart, baseDate: null },
          raison: manqueBase
            ? 'Délai trouvé, mais la date de signature de l’avant-contrat est inconnue : à calculer une fois celle-ci renseignée.'
            : 'Délai trouvé, mais son point de départ n’est pas une date figurant dans l’acte : à déterminer.'
        };
        continue;
      }

      dates[typeDate] = champDateVide('');
    }

    return dates;
  }

  // ==== EXTRACTION STRUCTURÉE : adresse ====
  //
  // L'ancien detecterAdresseBien() (voir ADRESSE_BIEN_RE plus haut) renvoie un fragment BRUT, non
  // découpé : impossible d'en tirer le département, qui devient pourtant une donnée pivot (règle
  // du notaire instrumentaire 41/45/37, voir REGLES_NOTAIRE_INSTRUMENTAIRE). parserAdresse()
  // découpe ce fragment en composants, dans un ordre quelconque : un acte écrit aussi bien
  // « 12 rue Victor Hugo, 41000 BLOIS » que « 41000 BLOIS, 12 rue Victor Hugo » ou
  // « Lieu-dit La Grande Maison, 41100 VENDÔME » (bien rural sans numéro ni voie).

  // Liste VOLONTAIREMENT ouverte (la spec insiste : ne pas figer une liste trop restrictive) :
  // `canonique` est la forme retenue à l'affichage, `motifs` les écritures rencontrées, y compris
  // les abréviations. L'ordre compte : les libellés les plus longs sont essayés en premier
  // (« route départementale » avant « route »), sinon le plus court gagnerait par préfixe.
  var TYPES_VOIE = [
    { canonique: 'route départementale', motifs: ['route départementale', 'route departementale', 'rd'] },
    { canonique: 'route nationale', motifs: ['route nationale', 'route nationale', 'rn'] },
    { canonique: 'rond-point', motifs: ['rond-point', 'rond point'] },
    { canonique: 'boulevard', motifs: ['boulevard', 'bd', 'bld', 'boul.'] },
    { canonique: 'avenue', motifs: ['avenue', 'av.', 'av'] },
    { canonique: 'impasse', motifs: ['impasse', 'imp.'] },
    { canonique: 'résidence', motifs: ['résidence', 'residence', 'rés.', 'res.'] },
    { canonique: 'esplanade', motifs: ['esplanade'] },
    { canonique: 'promenade', motifs: ['promenade'] },
    { canonique: 'traverse', motifs: ['traverse'] },
    { canonique: 'faubourg', motifs: ['faubourg', 'fbg'] },
    { canonique: 'passage', motifs: ['passage', 'pass.'] },
    { canonique: 'sentier', motifs: ['sentier', 'sente'] },
    { canonique: 'venelle', motifs: ['venelle'] },
    { canonique: 'domaine', motifs: ['domaine'] },
    { canonique: 'hameau', motifs: ['hameau', 'ham.'] },
    { canonique: 'montée', motifs: ['montée', 'montee'] },
    { canonique: 'square', motifs: ['square', 'sq.'] },
    { canonique: 'chemin', motifs: ['chemin', 'chem.', 'ch.'] },
    { canonique: 'allée', motifs: ['allée', 'allee', 'all.'] },
    { canonique: 'place', motifs: ['place', 'pl.'] },
    { canonique: 'route', motifs: ['route', 'rte'] },
    { canonique: 'cours', motifs: ['cours'] },
    { canonique: 'côte', motifs: ['côte', 'cote'] },
    { canonique: 'cité', motifs: ['cité', 'cite'] },
    { canonique: 'parc', motifs: ['parc'] },
    { canonique: 'quai', motifs: ['quai'] },
    { canonique: 'villa', motifs: ['villa'] },
    { canonique: 'voie', motifs: ['voie'] },
    { canonique: 'clos', motifs: ['clos'] },
    { canonique: 'rue', motifs: ['rue', 'r.'] }
  ];

  function echapperPourRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Alternation construite une fois depuis TYPES_VOIE, triée par longueur décroissante pour que
  // « route départementale » l'emporte sur « route ». Ancrée en début de fragment (^) : le type de
  // voie suit immédiatement le numéro, une fois celui-ci retiré.
  // La borne de fin est un `(?![lettre])` et non un `\b` : une abréviation se terminant par un
  // point (« imp. », « chem. ») ne peut PAS être suivie d'une limite de mot (le point est déjà un
  // caractère non-mot, et l'espace qui suit non plus) — avec `\b`, ces abréviations n'étaient
  // jamais reconnues. Le `(?![lettre])` garde par ailleurs l'effet recherché : « rue » ne doit pas
  // matcher à l'intérieur de « ruelle ».
  var RE_TYPE_VOIE = new RegExp(
    '^(' + TYPES_VOIE
      .flatMap(t => t.motifs)
      .sort((a, b) => b.length - a.length)
      .map(echapperPourRegex)
      .join('|') + ')(?![a-zA-ZÀ-ÿ])[\\s.]*',
    'i'
  );

  // Le point final fait PARTIE du motif déclaré (« imp. », « chem. ») : le retirer avant la
  // comparaison ferait échouer toute abréviation qui n'a pas aussi de variante sans point.
  function typeVoieCanonique(motif) {
    const m = String(motif).toLowerCase().trim();
    const trouve = TYPES_VOIE.find(t => t.motifs.some(x => x.toLowerCase() === m));
    return trouve ? trouve.canonique : null;
  }

  // Un lieu-dit n'est PAS une voie : il ne doit jamais être transformé artificiellement en nom de
  // rue (spec explicite, cas fréquent sur les biens ruraux du secteur de l'étude).
  var RE_LIEU_DIT = /\blieu[-\s]?dit\s+(.+)$/i;

  // Le département se déduit du code postal, jamais du seul nom de commune (plusieurs communes
  // portent des noms proches d'un département à l'autre — la spec insiste sur ce point).
  function departementDepuisCodePostal(cp) {
    const chiffres = String(cp || '').replace(/\s/g, '');
    if (!/^\d{5}$/.test(chiffres)) return null;
    // Corse : le 20 se répartit entre 2A (Corse-du-Sud) et 2B (Haute-Corse).
    if (chiffres.startsWith('20')) return parseInt(chiffres.slice(2), 10) <= 199 ? '2A' : '2B';
    // Outre-mer : département sur trois chiffres (971 Guadeloupe … 976 Mayotte).
    if (chiffres.startsWith('97') || chiffres.startsWith('98')) return chiffres.slice(0, 3);
    return chiffres.slice(0, 2);
  }

  // Numéro en tête de fragment : accepte les formes complexes que la spec demande de ne pas
  // tronquer — « 12 bis », « 12 ter », « 12 A », « 12-14 », « 12/14 ».
  var RE_NUMERO_DEBUT = /^(\d{1,4}\s*[-\/]\s*\d{1,4}|\d{1,4}(?:\s*(?:bis|ter|quater)\b|\s+[A-Za-z]\b)?)\s*,?\s*/i;
  // Numéro rejeté en fin de fragment : « rue Victor Hugo n°12 ».
  var RE_NUMERO_FIN = /\bn\s*[°ºo]\s*(\d{1,4}(?:\s*(?:bis|ter|quater))?)\s*$/i;

  function nettoyerBords(s) {
    return String(s || '').replace(/^[\s,;:.\-–—]+/, '').replace(/[\s,;:.\-–—]+$/, '').trim();
  }

  // Découpe un fragment d'adresse en composants. L'ordre des éléments est libre (code postal avant
  // ou après la voie), le numéro peut être absent, et l'adresse d'origine est TOUJOURS conservée
  // telle quelle dans `adresseComplete` — on ne perd jamais ce que dit le document.
  function parserAdresse(brut) {
    const original = String(brut || '').replace(/\s+/g, ' ').trim();
    const vide = {
      adresseComplete: original, numero: null, typeVoie: null, nomVoie: null, lieuDit: null,
      codePostal: null, commune: null, departement: null, statut: 'NOT_FOUND'
    };
    if (!original) return vide;

    const mCp = original.match(/\b(\d{5})\b/);
    if (!mCp) return { ...vide, statut: 'NEEDS_REVIEW' };
    const codePostal = mCp[1];
    const avant = original.slice(0, mCp.index);
    const apres = original.slice(mCp.index + codePostal.length);

    // La commune est le groupe de mots adjacent au code postal : d'abord après (cas le plus
    // courant, « 41000 BLOIS »), borné au premier séparateur pour ne pas avaler la suite
    // (« 41000 BLOIS, 12 rue Victor Hugo ») ; à défaut avant (« BLOIS 41000 »).
    // Un tiret n'est un séparateur que s'il est ENTOURÉ D'ESPACES (« VENDÔME – rue Victor Hugo ») :
    // un tiret collé appartient au nom de la commune, très fréquent en France
    // (Romorantin-Lanthenay, Saint-Jean-de-la-Ruelle…) — le couper produisait une commune tronquée.
    const RE_SEPARATEUR = /[,;]|\s[–—-]\s|\s\/\s/;
    let commune = null;
    let reste = '';
    const apresNettoye = nettoyerBords(apres);
    const coupeApres = apresNettoye.split(RE_SEPARATEUR)[0];
    const candidatApres = nettoyerBords(coupeApres);
    if (candidatApres && /[A-Za-zÀ-ÿ]/.test(candidatApres) && candidatApres.length <= 60) {
      commune = candidatApres;
      reste = nettoyerBords(avant) + ' ' + nettoyerBords(apresNettoye.slice(coupeApres.length));
    } else {
      const morceaux = nettoyerBords(avant).split(RE_SEPARATEUR);
      const dernier = nettoyerBords(morceaux[morceaux.length - 1]);
      if (dernier && /[A-Za-zÀ-ÿ]/.test(dernier) && dernier.length <= 60) {
        commune = dernier;
        morceaux.pop();
        reste = morceaux.join(' ');
      } else {
        reste = nettoyerBords(avant);
      }
      reste += ' ' + apresNettoye;
    }
    reste = nettoyerBords(reste.replace(/\s+/g, ' '));

    let numero = null;
    let typeVoie = null;
    let nomVoie = null;
    let lieuDit = null;

    const mLieuDit = reste.match(RE_LIEU_DIT);
    if (mLieuDit) {
      lieuDit = nettoyerBords(mLieuDit[1]);
    } else if (reste) {
      const mFin = reste.match(RE_NUMERO_FIN);
      if (mFin) {
        numero = mFin[1].replace(/\s+/g, ' ').trim();
        reste = nettoyerBords(reste.slice(0, mFin.index));
      }
      const mNum = reste.match(RE_NUMERO_DEBUT);
      if (mNum && numero === null) {
        numero = mNum[1].replace(/\s*([-\/])\s*/g, '$1').replace(/\s+/g, ' ').trim();
        reste = reste.slice(mNum[0].length);
      } else if (mNum) {
        reste = reste.slice(mNum[0].length);
      }
      const mType = reste.match(RE_TYPE_VOIE);
      if (mType) {
        typeVoie = typeVoieCanonique(mType[1]);
        reste = reste.slice(mType[0].length);
      }
      nomVoie = nettoyerBords(reste) || null;
    }

    const departement = departementDepuisCodePostal(codePostal);
    // CONFIRMED demande le minimum exploitable : où (commune + code postal) et quoi (une voie ou
    // un lieu-dit). Sans ça, l'adresse est affichée mais signalée à vérifier.
    const complet = !!(codePostal && commune && (nomVoie || lieuDit));
    return {
      adresseComplete: original,
      numero, typeVoie, nomVoie, lieuDit,
      codePostal, commune, departement,
      statut: complet ? 'CONFIRMED' : 'NEEDS_REVIEW'
    };
  }

  // ==== EXTRACTION STRUCTURÉE : notaires ====
  //
  // Entièrement nouveau : jusqu'ici, le rôle de l'étude sur un dossier (instrumentaire ou
  // participant) était saisi à la main, sans aucune aide du document. L'enchaînement voulu par la
  // spec est : personne → étude → adresse → département → qualité → rôle → règle métier.

  // Identité de l'étude, pour reconnaître SON propre office parmi les notaires cités et en déduire
  // son rôle. Les deux graphies rencontrées sont tolérées (GOSSART / GOSSARD). Liste volontairement
  // isolée ici : y ajouter un confrère associé ne demande de toucher à rien d'autre.
  var IDENTITE_ETUDE = { motifs: [/goss?ar[dt]/i] };

  // Règle métier géographique, centralisée en UN SEUL endroit (exigence explicite de la spec :
  // « ne pas coder cette règle de manière dispersée »). Pour un bien situé dans le 41, si le
  // notaire du vendeur est du 41, du 45 ou du 37, c'est lui qui reçoit l'acte. Ajouter un
  // département, ou une seconde règle pour un autre département de bien, se fait ici.
  var REGLES_NOTAIRE_INSTRUMENTAIRE = [
    { departementBien: '41', departementsNotaireVendeur: ['41', '45', '37'] }
  ];

  // « Maître X, notaire à Y » et ses variantes (notaire associé, notaire à la résidence de…).
  var RE_NOTAIRE = /Ma[îi]tre\s+([A-ZÀ-Ü][^,;\n()]{2,60}?)\s*,?\s*notaire\s*(?:associ[ée]e?)?\s*(?:[àa]\s+la\s+r[ée]sidence\s+d[eu]\s*|[àa]\s+|de\s+)([^,;.\n()]{2,60})/gi;

  // Mention explicite du notaire qui recevra l'acte : priorité absolue sur toute règle métier.
  var RE_ROLE_INSTRUMENTAIRE = /(?:recevra\s+l['’]acte|acte\s+(?:authentique\s+)?(?:sera\s+)?re[çc]u\s+par|r[ée]digera\s+l['’]acte|notaire\s+instrumentaire|en\s+l['’][ée]tude\s+de)/i;
  var RE_ROLE_PARTICIPANT = /(?:avec\s+(?:la\s+)?participation\s+de|en\s+participation|notaire\s+participant|en\s+concours\s+avec|assist[ée]e?\s+de)/i;

  // Rattachement d'un notaire à une partie : « notaire du vendeur », « conseil de l'acquéreur »…
  var RE_COTE_NOTAIRE = /(?:notaire|conseil|assistant?e?|repr[ée]sentant)\s+(?:d[eu]\s+|de\s+la\s+|de\s+l['’]|des\s+)?(vendeurs?|promettants?|acqu[ée]reurs?|acheteurs?|b[ée]n[ée]ficiaires?|parties?\s+venderesses?|parties?\s+acqu[ée]reuses?)/i;

  function qualiteDepuisMot(mot) {
    const m = String(mot || '').toLowerCase();
    if (RE_QUALITE_PROMETTANT.test(m)) return 'promettant';
    if (RE_QUALITE_BENEFICIAIRE.test(m)) return 'beneficiaire';
    if (RE_QUALITE_VENDEUR.test(m)) return 'vendeur';
    if (RE_QUALITE_ACQUEREUR.test(m)) return 'acquereur';
    return null;
  }

  // Repère les notaires cités, leur étude, leur adresse (donc leur département) et le côté auquel
  // ils se rattachent. Plusieurs notaires du même côté sont possibles : on ne suppose jamais qu'il
  // n'y en a qu'un.
  // Isole le fragment d'adresse d'un texte qui en contient plus que l'adresse : on découpe en
  // groupes séparés par des virgules, on garde celui qui porte le code postal, et le précédent s'il
  // ressemble à une voie. Sans ce découpage, parserAdresse prenait la suite de la phrase
  // (« …41000 BLOIS, notaire du vendeur ») et rangeait « notaire du vendeur » en commune.
  function extraireFragmentAdresse(texte) {
    const source = String(texte || '');
    if (!/\b\d{5}\b/.test(source)) return null;
    const groupes = source.split(/[,;\n]/);
    const iCp = groupes.findIndex(g => /\b\d{5}\b/.test(g));
    if (iCp === -1) return null;
    const precedent = iCp > 0 ? groupes[iCp - 1] : '';
    const garderPrecedent = /\d/.test(precedent) || RE_TYPE_VOIE.test(precedent.trim()) || RE_LIEU_DIT.test(precedent);
    return ((garderPrecedent ? precedent + ', ' : '') + groupes[iCp]).replace(/\s+/g, ' ').trim();
  }

  // Début de la phrase courante : le rattachement d'un notaire à une partie (« Le notaire du
  // vendeur, Maître X ») est toujours dans la MÊME phrase que sa mention.
  function debutPhrase(texte, index) {
    const avant = String(texte || '').slice(0, index);
    const coupure = Math.max(avant.lastIndexOf('.'), avant.lastIndexOf('\n'));
    return coupure === -1 ? 0 : coupure + 1;
  }

  function detecterNotaires(texte, typeActe) {
    const source = String(texte || '');
    if (!source) return [];
    const type = TYPES_ACTE.includes(typeActe) ? typeActe : 'INCONNU';

    // Premier passage : repérer toutes les mentions, pour pouvoir ensuite borner la fenêtre de
    // chaque notaire par son voisin. Sans cette borne, « notaire du vendeur » écrit à la fin de la
    // ligne précédente était attribué au notaire suivant, et une mention « qui recevra l'acte »
    // était comptée pour les deux à la fois.
    const mentions = [];
    const re = new RegExp(RE_NOTAIRE.source, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      mentions.push({ index: m.index, longueur: m[0].length, nom: m[1].replace(/\s+/g, ' ').trim(), ville: m[2].replace(/\s+/g, ' ').trim() });
    }

    const resultats = [];
    const vus = new Set();
    mentions.forEach((mention, i) => {
      const cle = mention.nom.toLowerCase();
      if (vus.has(cle)) return;
      vus.add(cle);

      const suivante = mentions[i + 1];
      const debut = debutPhrase(source, mention.index);
      const fin = Math.min(
        source.length,
        mention.index + mention.longueur + 400,
        suivante ? suivante.index : source.length
      );
      const fenetre = source.slice(debut, fin);

      const mCote = fenetre.match(RE_COTE_NOTAIRE);
      const qualite = mCote ? qualiteDepuisMot(mCote[1]) : null;
      const cote = qualite ? (roleDepuisQualite(type, qualite) === 'VENDEUR' ? 'vendeur' : 'acquereur') : 'inconnu';

      let roleExplicite = null;
      if (RE_ROLE_INSTRUMENTAIRE.test(fenetre)) roleExplicite = 'instrumentaire';
      else if (RE_ROLE_PARTICIPANT.test(fenetre)) roleExplicite = 'participant';

      // Le département vient du CODE POSTAL, jamais du seul nom de commune : deux communes de
      // départements différents peuvent porter des noms proches (point insisté par la spec).
      const fragment = extraireFragmentAdresse(fenetre);
      const adresse = fragment ? parserAdresse(fragment) : null;
      const adresseUtile = adresse && adresse.codePostal ? adresse : null;

      resultats.push({
        nom: mention.nom,
        office: mention.ville,
        adresse: adresseUtile,
        codePostal: adresseUtile ? adresseUtile.codePostal : null,
        commune: adresseUtile ? adresseUtile.commune : mention.ville,
        departement: adresseUtile ? adresseUtile.departement : null,
        cote,
        roleExplicite,
        source: { extrait: extraireContexte(source, mention.index, mention.longueur), index: mention.index, page: pageDepuisIndex(mention.index) }
      });
    });
    return resultats;
  }

  function appliquerRegleInstrumentaire(notaireVendeur, departementBien) {
    if (!notaireVendeur || !departementBien || !notaireVendeur.departement) return null;
    const regle = REGLES_NOTAIRE_INSTRUMENTAIRE.find(r => r.departementBien === String(departementBien));
    if (!regle) return null;
    return regle.departementsNotaireVendeur.includes(notaireVendeur.departement) ? regle : null;
  }

  // Détermine qui reçoit l'acte. Ordre de priorité imposé par la spec :
  //   1. mention explicite dans le document (« l'acte sera reçu par Maître X ») ;
  //   2. à défaut, la règle métier géographique (41 + notaire vendeur en 41/45/37) ;
  //   3. sinon, rien n'est tranché — NEEDS_REVIEW, jamais un choix arbitraire.
  function determinerNotaires(notaires, departementBien) {
    const liste = Array.isArray(notaires) ? notaires : [];
    const cotesVendeur = liste.filter(n => n.cote === 'vendeur');
    const cotesAcquereur = liste.filter(n => n.cote === 'acquereur');
    const explicites = liste.filter(n => n.roleExplicite === 'instrumentaire');

    const resultat = {
      liste,
      vendeur: cotesVendeur[0] || null,
      acquereur: cotesAcquereur[0] || null,
      instrumentaire: null,
      participant: null,
      statut: 'NOT_FOUND',
      raison: '',
      roleEtude: null
    };

    if (liste.length === 0) {
      resultat.raison = 'Aucun notaire identifié dans le document.';
      return resultat;
    }

    // Deux notaires désignés instrumentaires, ou deux notaires d'un même côté : on ne tranche pas.
    if (explicites.length > 1) {
      resultat.statut = 'NEEDS_REVIEW';
      resultat.raison = 'Plusieurs notaires sont présentés comme recevant l’acte : à vérifier dans le document.';
      return resultat;
    }

    if (explicites.length === 1) {
      resultat.instrumentaire = explicites[0];
      resultat.statut = 'CONFIRMED';
      resultat.raison = 'Le document désigne explicitement ce notaire pour recevoir l’acte.';
    } else {
      const regle = appliquerRegleInstrumentaire(resultat.vendeur, departementBien);
      if (regle) {
        resultat.instrumentaire = resultat.vendeur;
        resultat.statut = 'CONFIRMED';
        resultat.raison = `Bien situé dans le ${regle.departementBien} et notaire du vendeur dans le ${resultat.vendeur.departement} : c’est lui qui reçoit l’acte (règle de l’étude).`;
      } else {
        resultat.statut = 'NEEDS_REVIEW';
        resultat.raison = resultat.vendeur && resultat.vendeur.departement
          ? 'Aucune mention explicite et la règle géographique ne s’applique pas : notaire instrumentaire à confirmer.'
          : 'Aucune mention explicite, et le département du notaire du vendeur est inconnu : à confirmer.';
      }
    }

    if (resultat.instrumentaire) {
      const participantExplicite = liste.find(n => n.roleExplicite === 'participant' && n !== resultat.instrumentaire);
      resultat.participant = participantExplicite
        || liste.find(n => n !== resultat.instrumentaire && (n.cote === 'vendeur' || n.cote === 'acquereur'))
        || null;
      resultat.roleEtude = deduireRoleEtude(resultat);
    }

    return resultat;
  }

  function estEtude(notaire) {
    if (!notaire) return false;
    const texte = `${notaire.nom || ''} ${notaire.office || ''}`;
    return IDENTITE_ETUDE.motifs.some(re => re.test(texte));
  }

  // Le rôle de l'étude découle de sa place parmi les notaires identifiés : si c'est elle qui reçoit
  // l'acte, elle est instrumentaire ; si elle est citée sans recevoir l'acte, elle est participante.
  // null = l'étude n'est pas reconnue dans le document, et le sélecteur n'est pas touché.
  function deduireRoleEtude(resultat) {
    if (!resultat) return null;
    if (estEtude(resultat.instrumentaire)) return 'instrumentaire';
    if ((resultat.liste || []).some(estEtude)) return 'participant';
    return null;
  }

  // ==== EXTRACTION STRUCTURÉE : adresse du bien vendu ====
  //
  // Un compromis contient l'adresse du vendeur, celle de l'acquéreur, celle du notaire, parfois
  // celle d'un bien vendu par ailleurs… La spec est explicite : il ne faut SURTOUT PAS prendre la
  // première adresse trouvée, mais identifier celle qui correspond juridiquement au bien vendu.

  // Section « DÉSIGNATION » : c'est là que le bien est décrit. La chercher d'abord évite par
  // construction de confondre avec l'adresse personnelle d'une partie.
  var RE_SECTION_DESIGNATION = /D[ÉE]SIGNATION|IDENTIFICATION\s+DU\s+BIEN|BIEN\s+VENDU|OBJET\s+DE\s+LA\s+VENTE/i;
  var RE_SECTION_APRES_DESIGNATION = /PRIX|ORIGINE\s+DE\s+PROPRI[ÉE]T[ÉE]|CONDITIONS\s+SUSPENSIVES|PROPRI[ÉE]T[ÉE]\s+JOUISSANCE|CHARGES\s+ET\s+CONDITIONS/i;

  // Une adresse précédée de « demeurant » est celle d'une PARTIE, jamais celle du bien.
  var RE_ADRESSE_DE_PARTIE = /demeurant|domicili[ée]|r[ée]sidant/i;

  var RE_CADASTRE = /cadastr[ée]e?s?\s+(?:en\s+)?section\s+([A-Z]{1,3})\s*(?:n(?:um[ée]ro|[°ºo])?\s*)?(\d{1,4})/i;

  function detecterCadastre(texte) {
    const m = RE_CADASTRE.exec(String(texte || ''));
    return m ? { section: m[1].toUpperCase(), numero: m[2] } : null;
  }

  // Adresse du bien, découpée en composants. Cherche d'abord dans la section désignation, puis dans
  // tout le texte ; écarte toute capture introduite par « demeurant » (adresse d'une partie).
  function detecterAdresseBienStructuree(texte) {
    const source = String(texte || '');
    const section = extraireSection(source, RE_SECTION_DESIGNATION, RE_SECTION_APRES_DESIGNATION);
    const zones = section ? [section, source] : [source];

    for (const zone of zones) {
      const re = new RegExp(ADRESSE_BIEN_RE.source, 'gi');
      let m;
      while ((m = re.exec(zone)) !== null) {
        const avant = zone.slice(Math.max(0, m.index - 80), m.index);
        if (RE_ADRESSE_DE_PARTIE.test(avant)) continue;
        const fragment = extraireFragmentAdresse(m[1]) || m[1];
        const adresse = parserAdresse(fragment);
        if (adresse.codePostal) {
          const index = source.indexOf(m[0]);
          return {
            adresse,
            source: {
              extrait: extraireContexte(zone, m.index, m[0].length),
              index: index === -1 ? null : index,
              page: index === -1 ? null : pageDepuisIndex(index)
            }
          };
        }
      }
    }
    // Repli : la section désignation contient bien une adresse, mais sans la tournure « sis à ».
    if (section) {
      const fragment = extraireFragmentAdresse(section);
      if (fragment) {
        const adresse = parserAdresse(fragment);
        if (adresse.codePostal) {
          const index = source.indexOf(fragment.split(',')[0].trim());
          return {
            adresse,
            source: { extrait: fragment, index: index === -1 ? null : index, page: index === -1 ? null : pageDepuisIndex(index) }
          };
        }
      }
    }
    return { adresse: parserAdresse(''), source: null };
  }

  // ==== EXTRACTION STRUCTURÉE : objet unifié et contrôle de cohérence ====

  function champExtraction(valeur, options) {
    const o = options || {};
    return {
      valeur: valeur === undefined ? null : valeur,
      statut: o.statut || (valeur ? 'CONFIRMED' : 'NOT_FOUND'),
      methode: o.methode || null,
      origine: o.origine || 'regex',
      source: o.source || null,
      candidats: o.candidats || [],
      raison: o.raison || ''
    };
  }

  // Rassemble tout ce que les regex savent extraire en UN objet, avec pour chaque donnée son
  // statut, sa provenance et sa source dans le PDF. C'est ce même objet que la passe IA viendra
  // ensuite compléter (voir fusionnerExtractionIa) : les deux passes ne parlent qu'une langue.
  function construireExtractionRegex(texte, dateCompromis, detectedDatesFournies) {
    const source = String(texte || '');
    const typeActe = detecterTypeActe(source);
    const detectedDates = Array.isArray(detectedDatesFournies)
      ? detectedDatesFournies
      : detecterDatesDepuisTexte(source, dateCompromis);
    const bien = detecterAdresseBienStructuree(source);
    const notaires = determinerNotaires(detecterNotaires(source, typeActe.valeur), bien.adresse.departement);

    const extraction = {
      version: 1,
      typeActe,
      parties: detecterParties(source, typeActe.valeur),
      notaires,
      bien: { adresse: bien.adresse, source: bien.source, cadastre: detecterCadastre(source) },
      dates: construireDatesMetier(detectedDates, detecterDelais(source), dateCompromis),
      champs: {
        nom: champExtraction(detecterNomDossier(source)),
        prixVente: champExtraction(detecterPrixVente(source)),
        emailAcquereur: champExtraction(detecterEmailAcquereur(source, typeActe.valeur)),
        typeVente: champExtraction(detecterTypeVenteCopropriete(source) ? 'copropriete' : null)
      },
      alertes: [],
      iaLots: { parties: 'attente', bien: 'attente', dates: 'attente' }
    };
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Contrôle de cohérence : la spec demande de vérifier l'ensemble AVANT de créer le dossier, et de
  // signaler les contradictions plutôt que de les absorber en silence. Chaque alerte nomme les
  // champs concernés pour pouvoir être affichée en face d'eux.
  function controlerCoherence(extraction) {
    const alertes = [];
    if (!extraction) return alertes;
    const dates = extraction.dates || {};
    const valeur = (cle) => (dates[cle] && dates[cle].valeur) || null;
    const signature = valeur('SIGNATURE_AVANT_CONTRAT');
    const pret = valeur('BUTOIR_PRET');
    const acte = valeur('REITERATION_ACTE');
    const vente = valeur('BUTOIR_VENTE_PREALABLE');

    if (signature && acte && signature === acte) {
      alertes.push({
        code: 'SIGNATURE_EGALE_REITERATION', gravite: 'critique', champs: ['acte'],
        message: 'La date de réitération est identique à celle de la signature de l’avant-contrat : l’une des deux est probablement mal identifiée.'
      });
    }
    if (pret && acte && pret > acte) {
      alertes.push({
        code: 'PRET_APRES_ACTE', gravite: 'critique', champs: ['pret', 'acte'],
        message: 'L’échéance d’obtention du prêt tombe après la signature de l’acte : la condition suspensive ne pourrait pas jouer.'
      });
    }
    if (pret && vente && pret === vente) {
      alertes.push({
        code: 'PRET_EGALE_VENTE_PREALABLE', gravite: 'attention', champs: ['pret', 'ventebien'],
        message: 'La même date est retenue pour l’obtention du prêt et pour la vente préalable : à vérifier, les deux clauses sont distinctes.'
      });
    }

    // Date écrite ET délai dans l'acte, qui ne tombent pas au même endroit : l'écart d'un jour ou
    // deux vient de la convention de computation et n'a rien d'anormal ; au-delà, c'est une vraie
    // contradiction entre deux clauses du même acte.
    for (const [typeDate, champ] of Object.entries(CHAMP_PAR_TYPE_DATE)) {
      const objet = dates[typeDate];
      if (!objet || !objet.valeur || objet.methode !== 'EXPLICIT' || !objet.calculAlternatif) continue;
      const ecart = Math.abs((new Date(objet.valeur) - new Date(objet.calculAlternatif)) / 86400000);
      if (ecart > 5) {
        alertes.push({
          code: 'DATE_EXPLICITE_VS_DELAI', gravite: 'attention', champs: [champ],
          message: `La date écrite dans l’acte et le délai qu’il énonce ne concordent pas (${Math.round(ecart)} jours d’écart) : c’est la date écrite qui a été retenue.`
        });
      }
    }

    const adresse = extraction.bien && extraction.bien.adresse;
    if (!adresse || adresse.statut !== 'CONFIRMED') {
      alertes.push({
        code: 'ADRESSE_INCOMPLETE', gravite: 'attention', champs: ['adresseBien'],
        message: 'L’adresse du bien n’a pas pu être reconstituée complètement : à compléter à la main.'
      });
    }

    const notaires = extraction.notaires || {};
    if (notaires.instrumentaire && notaires.participant &&
        notaires.instrumentaire.nom === notaires.participant.nom) {
      alertes.push({
        code: 'NOTAIRES_IDENTIQUES', gravite: 'attention', champs: ['roleNotaire'],
        message: 'Le même notaire est identifié comme instrumentaire et comme participant : à vérifier.'
      });
    }
    if (notaires.statut === 'NEEDS_REVIEW') {
      alertes.push({
        code: 'NOTAIRE_INSTRUMENTAIRE_INCERTAIN', gravite: 'attention', champs: ['roleNotaire'],
        message: notaires.raison || 'Le notaire instrumentaire n’a pas pu être déterminé.'
      });
    }

    // Le vocabulaire des parties doit correspondre au type d'acte : un compromis qui nomme ses
    // parties « promettant »/« bénéficiaire » n'est pas anormal (promesse synallagmatique), mais un
    // type d'acte non tranché combiné à ce vocabulaire mérite un regard — c'est exactement la
    // situation où l'inversion vendeur/acquéreur passerait inaperçue.
    const parties = extraction.parties || [];
    const vocabulairePromesse = parties.some(p => p.qualiteActe === 'promettant' || p.qualiteActe === 'beneficiaire');
    if (vocabulairePromesse && extraction.typeActe && extraction.typeActe.valeur === 'INCONNU') {
      alertes.push({
        code: 'TYPE_ACTE_VS_QUALITES', gravite: 'critique', champs: ['nom'],
        message: 'L’acte nomme ses parties « promettant » et « bénéficiaire » sans que son type ait pu être établi : vérifiez que vendeur et acquéreur ne sont pas intervertis.'
      });
    }

    return alertes;
  }

  // ==== EXTRACTION STRUCTURÉE : enregistrement sur le dossier ====
  //
  // Ce qui est conservé SUR LE DOSSIER une fois celui-ci créé. Volontairement plus maigre que
  // `extractionActuelle` : les extraits cités et les candidats concurrents n'ont d'intérêt que
  // pendant l'import (pour vérifier une valeur PDF en main) — après coup, ce qui compte est
  // « d'où vient cette donnée, et était-elle sûre ? ». Les champs plats du dossier
  // (pret/acte/ventebien/adresseBien/prixVente/roleNotaire/confiance) continuent d'être alimentés
  // exactement comme avant : tout ce qui suit est ADDITIF, aucun affichage existant n'en dépend.
  function notairePersistable(n) {
    if (!n || !n.nom) return null;
    return {
      nom: n.nom,
      office: n.office || null,
      codePostal: n.codePostal || null,
      departement: n.departement || null,
      cote: n.cote || 'inconnu'
    };
  }

  function instantaneExtraction(extraction) {
    if (!extraction) return null;
    const notaires = extraction.notaires || {};
    const adresse = (extraction.bien && extraction.bien.adresse) || null;
    const etatChamp = (champ) => champ
      ? {
        statut: champ.statut || 'NOT_FOUND',
        methode: champ.methode || null,
        origine: champ.origine || 'regex',
        page: (champ.source && champ.source.page) || null
      }
      : null;

    const champs = {};
    for (const cle of Object.keys(extraction.champs || {})) {
      const etat = etatChamp(extraction.champs[cle]);
      if (etat) champs[cle] = etat;
    }
    // Les dates sont indexées sur le NOM DU CHAMP du dossier (pret/acte/ventebien) et non sur leur
    // type métier : c'est sous ce nom-là qu'on les retrouvera pour les afficher en face de la date
    // effectivement enregistrée.
    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      const etat = etatChamp((extraction.dates || {})[typeDate]);
      if (etat) champs[CHAMP_PAR_TYPE_DATE[typeDate]] = etat;
    }
    if (adresse) {
      champs.adresseBien = { statut: adresse.statut || 'NOT_FOUND', methode: null, origine: 'regex', page: (extraction.bien.source && extraction.bien.source.page) || null };
    }

    return {
      typeActe: { valeur: extraction.typeActe ? extraction.typeActe.valeur : 'INCONNU', statut: extraction.typeActe ? extraction.typeActe.statut : 'NOT_FOUND' },
      parties: (extraction.parties || []).map(p => ({
        nom: p.nom, qualiteActe: p.qualiteActe, role: p.role,
        qualitePersonne: p.qualitePersonne || 'physique',
        representant: p.representant || null
      })),
      notaires: {
        vendeur: notairePersistable(notaires.vendeur),
        acquereur: notairePersistable(notaires.acquereur),
        instrumentaire: notairePersistable(notaires.instrumentaire),
        participant: notairePersistable(notaires.participant),
        statut: notaires.statut || 'NOT_FOUND',
        raison: notaires.raison || '',
        roleEtude: notaires.roleEtude || null
      },
      bien: {
        adresse: adresse ? {
          adresseComplete: adresse.adresseComplete || '', numero: adresse.numero || null,
          typeVoie: adresse.typeVoie || null, nomVoie: adresse.nomVoie || null,
          lieuDit: adresse.lieuDit || null, codePostal: adresse.codePostal || null,
          commune: adresse.commune || null, departement: adresse.departement || null,
          statut: adresse.statut || 'NOT_FOUND'
        } : null,
        cadastre: (extraction.bien && extraction.bien.cadastre) || null
      },
      extraction: {
        version: extraction.version || 1,
        dateImport: new Date().toISOString(),
        champs,
        alertes: (extraction.alertes || []).map(a => ({ code: a.code, gravite: a.gravite, message: a.message }))
      }
    };
  }

  // Corrections apportées À LA MAIN entre ce que l'extraction proposait et ce qui est réellement
  // enregistré. Journalisées pour pouvoir, plus tard, mesurer où l'extraction se trompe le plus
  // souvent — JAMAIS pour réentraîner quoi que ce soit automatiquement (décision explicite de la
  // spec) : le modèle local reste figé, seules les regex sont corrigées à la main après analyse.
  function diffCorrectionsExtraction(extraction, valeursFinales) {
    if (!extraction || !valeursFinales) return [];
    const finales = valeursFinales;
    const typeActe = extraction.typeActe ? extraction.typeActe.valeur : 'INCONNU';
    const adresse = (extraction.bien && extraction.bien.adresse) || null;
    const dates = extraction.dates || {};
    const champs = extraction.champs || {};
    const proposees = {
      nom: (champs.nom && champs.nom.valeur) || null,
      prixVente: (champs.prixVente && champs.prixVente.valeur) || null,
      emailAcquereur: (champs.emailAcquereur && champs.emailAcquereur.valeur) || null,
      adresseBien: adresse ? (adresse.adresseComplete || null) : null,
      roleNotaire: (extraction.notaires && extraction.notaires.roleEtude) || null
    };
    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      proposees[CHAMP_PAR_TYPE_DATE[typeDate]] = (dates[typeDate] && dates[typeDate].valeur) || null;
    }

    const entrees = [];
    for (const champ of Object.keys(proposees)) {
      const extraite = proposees[champ];
      const finale = finales[champ] === undefined || finales[champ] === '' ? null : finales[champ];
      // Rien à apprendre d'un champ que l'extraction n'a pas trouvé ET que personne n'a rempli.
      if (extraite === null && finale === null) continue;
      if (String(extraite) === String(finale)) continue;
      const objetChamp = champs[champ] || dates[Object.keys(CHAMP_PAR_TYPE_DATE).find(t => CHAMP_PAR_TYPE_DATE[t] === champ)] || null;
      entrees.push({
        champ,
        valeurExtraite: extraite,
        valeurCorrigee: finale,
        origine: (objetChamp && objetChamp.origine) || 'regex',
        statutExtrait: (objetChamp && objetChamp.statut) || 'NOT_FOUND',
        typeActe,
        extrait: (objetChamp && objetChamp.source && objetChamp.source.extrait) ? String(objetChamp.source.extrait).slice(0, 200) : null,
        date: new Date().toISOString()
      });
    }
    return entrees;
  }

  // Assainissement à l'import d'une sauvegarde JSON : on conserve ces objets s'ils ont la bonne
  // forme, sinon on repart de rien plutôt que de propager une structure inattendue dans le rendu.
  function normaliserExtractionImportee(d) {
    const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
    const source = objet(d) || {};
    const typeActe = objet(source.typeActe);
    const notaires = objet(source.notaires);
    const bien = objet(source.bien);
    const extraction = objet(source.extraction);
    const adresse = bien ? objet(bien.adresse) : null;
    return {
      typeActe: typeActe && TYPES_ACTE.indexOf(typeActe.valeur) !== -1
        ? { valeur: typeActe.valeur, statut: typeof typeActe.statut === 'string' ? typeActe.statut : 'NOT_FOUND' }
        : null,
      parties: Array.isArray(source.parties)
        ? source.parties.filter(p => p && typeof p === 'object' && typeof p.nom === 'string' && (p.role === 'VENDEUR' || p.role === 'ACQUEREUR'))
            .map(p => ({
              nom: p.nom,
              qualiteActe: typeof p.qualiteActe === 'string' ? p.qualiteActe : '',
              role: p.role,
              qualitePersonne: p.qualitePersonne === 'morale' ? 'morale' : 'physique',
              representant: typeof p.representant === 'string' ? p.representant : null
            }))
        : [],
      notaires: notaires
        ? {
          vendeur: notairePersistable(objet(notaires.vendeur)),
          acquereur: notairePersistable(objet(notaires.acquereur)),
          instrumentaire: notairePersistable(objet(notaires.instrumentaire)),
          participant: notairePersistable(objet(notaires.participant)),
          statut: typeof notaires.statut === 'string' ? notaires.statut : 'NOT_FOUND',
          raison: typeof notaires.raison === 'string' ? notaires.raison : '',
          roleEtude: (notaires.roleEtude === 'instrumentaire' || notaires.roleEtude === 'participant') ? notaires.roleEtude : null
        }
        : null,
      bien: bien
        ? { adresse: adresse || null, cadastre: objet(bien.cadastre) }
        : null,
      extraction: extraction
        ? {
          version: Number.isInteger(extraction.version) ? extraction.version : 1,
          dateImport: typeof extraction.dateImport === 'string' ? extraction.dateImport : null,
          champs: objet(extraction.champs) || {},
          alertes: Array.isArray(extraction.alertes)
            ? extraction.alertes.filter(a => a && typeof a === 'object' && typeof a.message === 'string')
                .map(a => ({ code: String(a.code || ''), gravite: String(a.gravite || 'info'), message: a.message }))
            : []
        }
        : null
    };
  }

  // ==== EXTRACTION STRUCTURÉE : localisation d'un extrait dans le texte ====
  //
  // Pierre angulaire de la vérification des réponses du modèle IA local : plutôt que de faire
  // confiance à un score de "confidence" qu'un llama 8B produit sans calibration, on vérifie que
  // l'extrait qu'il cite existe LITTÉRALEMENT dans le texte du PDF. Trouvé → on en déduit la page
  // (pageDepuisIndex) et la donnée passe CONFIRMED ; introuvable → NEEDS_REVIEW, quel que soit
  // l'aplomb du modèle. Extraite ici (elle vivait imbriquée dans voirEngagementDansPdf) pour être
  // partagée, testable, et renforcée : accents et apostrophes typographiques sont désormais
  // neutralisés, le texte d'un PDF étant systématiquement bruité de ce côté.
  function normaliserAvecIndex(s) {
    let res = '';
    const idx = [];
    let dernierEspace = true;
    const source = String(s || '');
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (/\s/.test(c)) {
        if (!dernierEspace) { res += ' '; idx.push(i); dernierEspace = true; }
        continue;
      }
      let normalise = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (/['’‘´`]/.test(normalise)) normalise = "'";
      if (/[-–—]/.test(normalise)) normalise = '-';
      // Un caractère peut donner 0 (marque combinante isolée) ou plusieurs caractères : on pousse
      // un index par caractère PRODUIT, sinon la table de correspondance se décale.
      for (const ch of normalise) { res += ch; idx.push(i); }
      if (normalise.length > 0) dernierEspace = false;
    }
    return { texte: res, index: idx };
  }

  // Retrouve la position d'un extrait cité dans le texte d'origine, ou -1. Le préfixe testé est
  // réduit par paliers : un extrait peut différer légèrement de la mise en page réelle (césure,
  // espace insécable), sans pour autant être inventé.
  function localiserExtrait(texte, extrait) {
    if (!texte || !extrait) return -1;
    const source = normaliserAvecIndex(texte);
    const cible = normaliserAvecIndex(extrait).texte.trim();
    // Trop court pour constituer une preuve : « le 15 » se retrouverait partout.
    if (cible.length < 12) return -1;
    let longueur = Math.min(80, cible.length);
    const longueurMin = Math.max(12, Math.min(20, cible.length));
    let pos = -1;
    while (pos === -1 && longueur >= longueurMin) {
      pos = source.texte.indexOf(cible.slice(0, longueur));
      if (pos === -1) longueur -= 10;
    }
    return pos === -1 ? -1 : source.index[pos];
  }

  // ---- analyse juridique : documents que le vendeur s'engage à fournir ----

  // Chaque entrée porte sa catégorie : un notaire distingue l'entretien courant à justifier
  // (ramonage, chaudière) des travaux à faire exécuter, et des justificatifs administratifs.
  // `cleChecklist`, sur trois entrées seulement pour l'instant (demandé explicitement par
  // l'étude — chaudière, PAC, ramonage), relie cette détection à une pièce de
  // PIECES_ENGAGEMENTS_AUTO (voir plus bas, section "suivi des pièces du dossier") : un engagement
  // d'entretien REPÉRÉ DANS LE COMPROMIS ajoute automatiquement la pièce correspondante à la
  // checklist du dossier lors de sa création (voir ajouterDossier()), pour qu'elle soit ensuite
  // recherchée dans le dossier local relié comme n'importe quelle autre pièce. Les autres entrées
  // de ce tableau restent de simples informations affichées dans l'analyse juridique, sans lien
  // avec la checklist — à étendre à d'autres types si l'étude le redemande explicitement.
  const DOCUMENTS_VENDEUR_CONNUS = [
    // Entretien courant à justifier
    { motif: /ramonage|entretien\s+(?:de\s+la\s+)?chemin[ée]e|conduits?\s+de\s+fum[ée]e/i, label: 'Justificatif de ramonage', cat: 'entretien', cleChecklist: 'ramonage' },
    { motif: /entretien\s+(?:annuel\s+)?(?:de\s+la\s+)?chaudi[èe]re|contrat\s+d.entretien\s+(?:de\s+la\s+)?chaudi[èe]re/i, label: "Justificatif d'entretien de la chaudière", cat: 'entretien', cleChecklist: 'entretienChaudiere' },
    { motif: /entretien\s+(?:du\s+|de\s+la\s+)?(?:syst[èe]me\s+de\s+)?pompe\s+[àa]\s+chaleur|entretien\s+(?:de\s+la\s+)?pac\b/i, label: "Justificatif d'entretien de la pompe à chaleur", cat: 'entretien', cleChecklist: 'entretienPac' },
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
        trouves.push({ label: doc.label, cat: doc.cat, cleChecklist: doc.cleChecklist || null });
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
      let type = null;
      if (!estEntretien && !estTravaux && !estDocument) {
        // La phrase correspond bien à l'ancrage strict ("le vendeur/promettant s'engage...") mais
        // aucun des trois motifs d'objet ne la catégorise — jusqu'ici, systématiquement abandonnée
        // (continue), même quand un(e) collaborateur(rice) avait déjà catégorisé à la main une
        // clause très proche lors d'un import précédent (voir ajouterEngagementManuel()/
        // ajouterEngagementDepuisFormulaire() ci-dessus). Reste borné à ce périmètre déjà anchré :
        // ne s'applique jamais à une phrase qui n'aurait pas d'abord passé ce motif strict, donc ne
        // risque pas d'élargir la détection à des sentences arbitraires du document.
        const apprise = trouverCorrectionApprise(phrase, 'engagement');
        if (!apprise) continue;
        type = apprise.classification;
      } else {
        // L'entretien prime : « justifier du dernier ramonage » est un entretien à prouver, pas des
        // travaux à faire exécuter — la distinction compte pour savoir quoi réclamer au vendeur.
        type = 'document';
        if (estEntretien) type = 'entretien';
        else if (estTravaux) type = 'travaux';
      }

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
  // `dossierId` absent (pendant l'import, voir afficherAnalyseJuridique) → la croix retire l'entrée
  // de analyseJuridiqueActuelle.documents (supprimerDocumentManuel) ; `dossierId` fourni (fiche
  // d'un dossier déjà enregistré, voir renderCarteDossier) → elle retire l'entrée de
  // d.analyseJuridique.documents avec confirmation + historique (supprimerDocumentDossier).
  // Demandé par l'étude : jusqu'ici aucun document identifié n'était retirable, dans aucun des
  // deux contextes.
  function renderDocBadge(doc, index, dossierId) {
    const label = (typeof doc === 'string') ? doc : doc.label;
    const cat = (typeof doc === 'string') ? '' : (doc.cat || '');
    const appelSuppr = dossierId
      ? `supprimerDocumentDossier('${dossierId}', ${index})`
      : `supprimerDocumentManuel(${index})`;
    const boutonSuppr = `<button type="button" class="analyse-doc-suppr" onclick="${appelSuppr}" title="Retirer ce document de la liste" aria-label="Retirer ce document">${icone('x')}</button>`;
    return `<span class="analyse-doc-badge${cat ? ' cat-' + cat : ''}">${escapeHtml(label)}${boutonSuppr}</span>`;
  }

  // Accepte aussi bien le nouveau format {phrase, type} que l'ancien (simple chaîne), pour que
  // les dossiers enregistrés avant cette évolution continuent de s'afficher correctement.
  // Bouton de suppression désormais affiché pour TOUT engagement, plus seulement ceux ajoutés à la
  // main — demandé par l'étude (jusqu'ici, un engagement détecté automatiquement ne pouvait être
  // corrigé qu'en resserrant la regex, jamais retiré au cas par cas ; revu ici explicitement à sa
  // demande). `dossierId` absent (import, voir afficherAnalyseJuridique) → retire de
  // analyseJuridiqueActuelle.engagements (supprimerEngagementManuel, sans confirmation : pré-
  // enregistrement, reversible en réimportant) ; `dossierId` fourni (fiche enregistrée, voir
  // renderCarteDossier) → retire de d.analyseJuridique.engagements avec confirmation + historique
  // (supprimerEngagementDossier).
  function renderEngagement(e, index, dossierId) {
    const phrase = (typeof e === 'string') ? e : e.phrase;
    const type = (typeof e === 'string') ? null : e.type;
    const page = (typeof e === 'string') ? null : e.page;
    const manuel = typeof e === 'object' && e.manuel === true;
    const suggereParIa = typeof e === 'object' && e.source === 'ia';
    const libelles = { entretien: 'Entretien', travaux: 'Travaux', document: 'Document', autre: 'Autres' };

    // Édition d'un engagement ajouté via l'option de surlignage (ou tout autre engagement) :
    // demandé par l'étude pour corriger une clause sans devoir la supprimer puis la ressaisir en
    // entier. `dossierId` distingue le même contexte import/fiche que la suppression ci-dessous.
    const enEdition = engagementEnEdition
      && engagementEnEdition.dossierId === (dossierId || null)
      && engagementEnEdition.index === index;
    if (enEdition) {
      const appelValider = dossierId ? `validerEditionEngagement('${dossierId}', ${index})` : `validerEditionEngagement(null, ${index})`;
      const appelAnnuler = dossierId ? `annulerEditionEngagement('${dossierId}')` : `annulerEditionEngagement(null)`;
      const typeActuel = type || 'document';
      return `<div class="analyse-engagement-ligne analyse-engagement-edition">
        <select id="engagement-edition-type">
          ${Object.entries(libelles).map(([val, label]) => `<option value="${val}"${typeActuel === val ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
        <textarea id="engagement-edition-texte" rows="2">${escapeHtml(phrase)}</textarea>
        <button type="button" class="icon-valider" onclick="${appelValider}" title="Valider" aria-label="Valider la modification">✓</button>
        <button type="button" class="icon-btn" onclick="${appelAnnuler}">Annuler</button>
      </div>`;
    }

    const etiquette = type
      ? `<span class="engagement-type ${libelles[type] ? type : 'document'}">${libelles[type] || 'Document'}</span>`
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
    // Sélectionnée à la main dans l'aperçu PDF (voir gererSelectionPdf) plutôt que trouvée par
    // extraireEngagementsVendeur() : uniquement indicatif désormais (voir plus haut, la croix de
    // suppression s'affiche pour tous les engagements, pas seulement ceux-ci).
    // Même emplacement/style que le marqueur "Ajouté manuellement" (texte simple, pas d'icône) —
    // seul le texte change selon la provenance ; jamais les deux en même temps (source mutuellement
    // exclusive : soit sélectionné à la main dans le PDF, soit suggéré par l'IA, soit détecté par
    // regex sans marqueur du tout).
    const marqueurManuel = manuel
      ? '<span class="engagement-manuel">Ajouté manuellement</span>'
      : (suggereParIa ? '<span class="engagement-manuel" title="Extrait par le modèle IA local — à vérifier comme toute suggestion automatique">Suggéré par l\'IA</span>' : '');
    const appelSuppr = dossierId
      ? `supprimerEngagementDossier('${dossierId}', ${index})`
      : `supprimerEngagementManuel(${index})`;
    const boutonSupprimer = `<button type="button" class="engagement-suppr" onclick="${appelSuppr}" title="Retirer cet engagement" aria-label="Retirer cet engagement">${icone('x')}</button>`;
    const appelEditer = dossierId ? `activerEditionEngagement('${dossierId}', ${index})` : `activerEditionEngagement(null, ${index})`;
    const boutonEditer = `<button type="button" class="icon-crayon" onclick="${appelEditer}" title="Modifier cet engagement" aria-label="Modifier cet engagement">${icone('pencil')}</button>`;
    return `<div class="analyse-engagement-ligne">${etiquette}<span>${escapeHtml(phrase)}</span>${marqueurManuel}${boutonVoir}${boutonEditer}${boutonSupprimer}</div>`;
  }

  function activerEditionEngagement(dossierId, index) {
    engagementEnEdition = { dossierId: dossierId || null, index };
    if (dossierId) render(); else afficherAnalyseJuridique();
  }

  function annulerEditionEngagement(dossierId) {
    engagementEnEdition = null;
    if (dossierId) render(); else afficherAnalyseJuridique();
  }

  // Valide l'édition d'un engagement (voir activerEditionEngagement ci-dessus) : agit sur
  // analyseJuridiqueActuelle pendant l'import (dossierId absent) ou sur d.analyseJuridique pour un
  // dossier déjà enregistré, même distinction que supprimerEngagementManuel/supprimerEngagementDossier.
  // Alimente aussi l'apprentissage (memoriserCorrection, catégorie 'engagement') : une correction
  // d'engagement est un signal aussi utile qu'un ajout pour reconnaître une clause proche au
  // prochain import (voir CLAUDE.md, "Apprentissage sur les clauses ajoutées manuellement").
  function validerEditionEngagement(dossierId, index) {
    const texteEl = document.getElementById('engagement-edition-texte');
    const typeEl = document.getElementById('engagement-edition-type');
    const phrase = texteEl ? texteEl.value.trim() : '';
    const type = typeEl ? typeEl.value : 'document';
    if (!phrase) { if (texteEl) texteEl.focus(); return; }

    if (dossierId) {
      const d = dossiers.find(x => x.id === dossierId);
      const cible = d && d.analyseJuridique && d.analyseJuridique.engagements[index];
      if (!cible) { engagementEnEdition = null; render(); return; }
      cible.phrase = phrase;
      cible.type = type;
      ajouterHistorique(d, `Engagement du vendeur modifié : « ${phrase.slice(0, 80)}${phrase.length > 80 ? '…' : ''} »`);
      memoriserCorrection(phrase, type, null, 'engagement');
      engagementEnEdition = null;
      sauvegarder(d);
      render();
    } else {
      const cible = analyseJuridiqueActuelle.engagements[index];
      if (!cible) { engagementEnEdition = null; afficherAnalyseJuridique(); return; }
      cible.phrase = phrase;
      cible.type = type;
      memoriserCorrection(phrase, type, null, 'engagement');
      engagementEnEdition = null;
      afficherAnalyseJuridique();
    }
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
      .map((e, i) => renderEngagement(e, i))
      .join('');

    document.getElementById('analyse-nb-documents').textContent = documents.length || '';
    listeDocs.innerHTML = documents.length > 0
      ? documents.map((doc, i) => renderDocBadge(doc, i)).join('')
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

    function ajouter(iso, label, index, longueur, approx, calcul) {
      // Un délai dont le point de départ est inconnu ne produit aucune date : calculerDateEcheance
      // renvoie null plutôt que de compter depuis la signature par défaut.
      if (!iso) return;
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
        approx: !!approx,
        // Champ additif (aucun appelant existant ne le lit) : trace de quoi la date a été déduite
        // quand elle vient d'un délai, pour que l'objet date métier puisse afficher « calculée à
        // partir de la signature + 60 jours » plutôt qu'une date qui semble lue dans le texte.
        calcul: calcul || null,
        index
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
      // « jours » ou « mois » : un délai de réitération est très souvent exprimé en mois
      // (« dans les trois mois de la signature ») — jusqu'ici seuls les jours étaient reconnus,
      // et ces clauses passaient entièrement inaperçues. Le calcul passe par
      // calculerDateEcheance (voir le socle de calcul), de quantième à quantième pour les mois.
      const reDelai = new RegExp('d[ée]lai\\s+de\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)\\s+(?:[àa]\\s+compter|[àa]\\s+partir)\\s+de\\s+(?:la\\s+signature|ce\\s+jour|l[\'’]acte|la\\s+pr[ée]sente|le\\s+pr[ée]sent\\s+(?:compromis|acte)|la\\s+promesse)', 'gi');
      while ((m = reDelai.exec(texte)) !== null) {
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(calculerDateEcheance(dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
      const reJPlus = /\bJ\s*\+\s*(\d{1,3})\b/g;
      while ((m = reJPlus.exec(texte)) !== null) {
        const delai = { valeur: parseInt(m[1], 10), unite: 'jours' };
        ajouter(calculerDateEcheance(dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
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
      const reAuPlusTardDelai = new RegExp('au\\s+plus\\s+tard\\s+dans\\s+(?:les?|un\\s+d[ée]lai\\s+de)\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)', 'gi');
      while ((m = reAuPlusTardDelai.exec(texte)) !== null) {
        const avant = texte.slice(Math.max(0, m.index - 200), m.index);
        if (/notifier|notification/i.test(avant)) continue;
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(calculerDateEcheance(dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
      // "au plus tard 60 jours après la signature des présentes" : autre formulation réelle de la
      // même condition suspensive de prêt exprimée en délai (fournie par l'étude), avec cette
      // fois un point de départ explicite ("après <ancre>") plutôt qu'implicite comme
      // reAuPlusTardDelai ci-dessus. Mêmes ancres que reDelai, même garde-fou contre la clause
      // de notification (le refus/l'octroi communiqué au notaire porte souvent un second délai,
      // distinct de la condition elle-même — voir reAuPlusTardDelai).
      const reAuPlusTardApres = new RegExp('au\\s+plus\\s+tard\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)\\s+apr[èe]s\\s+(?:la\\s+signature|ce\\s+jour|l[\'’]acte|la\\s+pr[ée]sente|le\\s+pr[ée]sent\\s+(?:compromis|acte)|la\\s+promesse)', 'gi');
      while ((m = reAuPlusTardApres.exec(texte)) !== null) {
        const avant = texte.slice(Math.max(0, m.index - 200), m.index);
        if (/notifier|notification/i.test(avant)) continue;
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(calculerDateEcheance(dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
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
      // La date de signature est l'ancre de tous les délais : la corriger recalcule les échéances
      // calculées ET le panneau de révision, sinon celui-ci resterait sur l'ancienne ancre.
      recalculerExtractionRegex();
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

    // Couche d'extraction structurée : construite à partir de ce que les regex viennent de trouver,
    // elle complète les champs restés vides (rôle de l'étude notamment) et alimente le panneau de
    // révision. N'écrase jamais une saisie de l'utilisateur (voir appliquerValeurChamp).
    recalculerExtractionRegex();

    return detectedDates.length;
  }

  // ==== EXTRACTION STRUCTURÉE : application au formulaire et panneau de révision ====

  // Dernier résultat d'extraction (regex, puis complété par l'IA) et trace de ce que NOUS avons
  // écrit dans chaque champ : un champ dont la valeur ne correspond plus à ce qu'on y avait mis a
  // été modifié par l'utilisateur, et ne doit plus jamais être écrasé (y compris par une réponse
  // IA qui arrive plusieurs dizaines de secondes après l'import).
  let extractionActuelle = null;
  let valeursAppliquees = {};

  function appliquerValeurChamp(id, valeur) {
    const champ = document.getElementById(id);
    if (!champ || valeur === null || valeur === undefined || valeur === '') return false;
    const actuel = (champ.value || '').trim();
    const deriereValeur = valeursAppliquees[id] === undefined ? '' : String(valeursAppliquees[id]);
    if (actuel !== '' && actuel !== deriereValeur) return false; // saisie de l'utilisateur : intouchable
    champ.value = String(valeur);
    valeursAppliquees[id] = String(valeur);
    return true;
  }

  function appliquerExtractionAuFormulaire(extraction) {
    if (!extraction) return;
    const champs = extraction.champs || {};
    if (champs.nom) appliquerValeurChamp('f-nom', champs.nom.valeur);
    if (champs.prixVente) appliquerValeurChamp('f-prix-vente', champs.prixVente.valeur);
    if (champs.emailAcquereur) appliquerValeurChamp('f-email-acquereur', champs.emailAcquereur.valeur);
    const adresse = extraction.bien && extraction.bien.adresse;
    if (adresse && adresse.adresseComplete) appliquerValeurChamp('f-adresse-bien', adresse.adresseComplete);

    // Rôle de l'étude : pré-rempli UNIQUEMENT sur une déduction confirmée (mention explicite dans
    // l'acte, ou règle métier satisfaite sans contradiction). La raison est affichée dans le
    // panneau, et le sélecteur reste modifiable — mais on ne bascule jamais un dossier en
    // « participant » sur une simple supposition : ce rôle masque la checklist des pièces.
    const notaires = extraction.notaires || {};
    if (notaires.statut === 'CONFIRMED' && notaires.roleEtude) {
      const select = document.getElementById('f-role-notaire');
      if (select && (!valeursAppliquees['f-role-notaire'] || select.value === valeursAppliquees['f-role-notaire'])) {
        select.value = notaires.roleEtude;
        valeursAppliquees['f-role-notaire'] = notaires.roleEtude;
        majApercuPieces();
      }
    }
  }

  var LIBELLES_STATUT_EXTRACTION = {
    CONFIRMED: { texte: 'Confirmé', dl: 'dl-success' },
    NEEDS_REVIEW: { texte: 'À vérifier', dl: 'dl-alerte' },
    NOT_FOUND: { texte: 'Non trouvé', dl: 'dl-neutre' }
  };

  function renderLigneRevision(libelle, champ) {
    if (!champ) return '';
    const statut = LIBELLES_STATUT_EXTRACTION[champ.statut] || LIBELLES_STATUT_EXTRACTION.NOT_FOUND;
    const source = champ.source || null;
    // La page n'est cliquable que si le PDF est encore chargé en mémoire (import en cours) — même
    // principe que pour les engagements du vendeur.
    const page = source && source.page
      ? (pdfActuel
        ? `<button type="button" class="voir-pdf-btn" onclick="allerALaPageDuPdf(${source.page})">${icone('eye')} p.${source.page}</button>`
        : `<span class="chip-page">p.${source.page}</span>`)
      : '';
    // Un type d'acte s'affiche dans les mots de l'étude, pas sous sa clé interne
    // (LIBELLES_TYPE_ACTE est un `var`, hoisté : sa déclaration vit plus bas, avec le panneau
    // équivalent de la fiche dossier — un seul jeu de libellés pour les deux).
    const brut = champ.valeur;
    const valeur = brut === null || brut === undefined || brut === ''
      ? '<span class="revision-vide">—</span>'
      : escapeHtml(String(LIBELLES_TYPE_ACTE[brut] || brut));
    // « Calculée » plutôt que « lue dans l'acte » : au moment de vérifier, savoir qu'une date
    // résulte d'un délai compté depuis la signature change ce qu'on va contrôler.
    const methode = champ.methode === 'CALCULATED'
      ? '<span class="revision-raison">Calculée à partir d’un délai compté depuis la signature.</span>' : '';
    const extrait = source && source.extrait
      ? `<div class="revision-extrait">« ${escapeHtml(String(source.extrait).slice(0, 220))} »</div>` : '';
    const raison = champ.raison ? `<div class="revision-raison">${escapeHtml(champ.raison)}</div>` : '';
    const autres = (champ.candidats || []).length > 1
      ? `<div class="revision-raison">Autres valeurs trouvées : ${champ.candidats.map(c => escapeHtml(String(c.valeur))).join(', ')}</div>`
      : '';
    return `<div class="revision-ligne">
      <div class="revision-tete">
        <span class="revision-libelle">${escapeHtml(libelle)}</span>
        <span class="dot-label ${statut.dl}"><span class="dot"></span>${statut.texte}</span>
        ${page}
      </div>
      <div class="revision-valeur">${valeur}</div>
      ${methode}${raison}${autres}${extrait}
    </div>`;
  }

  function renderPanneauRevision(extraction) {
    const panneau = document.getElementById('panneau-revision');
    const rappel = document.getElementById('alertes-finalisation');
    if (!panneau) return;
    if (!extraction) {
      panneau.style.display = 'none';
      panneau.innerHTML = '';
      if (rappel) { rappel.style.display = 'none'; rappel.innerHTML = ''; }
      return;
    }

    const dates = extraction.dates || {};
    const notaires = extraction.notaires || {};
    const lignes = [
      renderLigneRevision('Type d’acte', extraction.typeActe),
      renderLigneRevision('Nom du dossier', extraction.champs && extraction.champs.nom),
      renderLigneRevision('Signature de l’avant-contrat', dates.SIGNATURE_AVANT_CONTRAT),
      renderLigneRevision('Obtention du prêt', dates.BUTOIR_PRET),
      renderLigneRevision('Réitération de l’acte', dates.REITERATION_ACTE),
      renderLigneRevision('Vente préalable', dates.BUTOIR_VENTE_PREALABLE),
      renderLigneRevision('Adresse du bien', {
        valeur: extraction.bien && extraction.bien.adresse ? extraction.bien.adresse.adresseComplete : null,
        statut: extraction.bien && extraction.bien.adresse ? extraction.bien.adresse.statut : 'NOT_FOUND',
        source: extraction.bien ? extraction.bien.source : null,
        raison: extraction.bien && extraction.bien.adresse && extraction.bien.adresse.departement
          ? `Département ${extraction.bien.adresse.departement}, déduit du code postal.` : ''
      }),
      renderLigneRevision('Prix de vente', extraction.champs && extraction.champs.prixVente),
      renderLigneRevision('Notaire instrumentaire', {
        valeur: notaires.instrumentaire ? `${notaires.instrumentaire.nom} (${notaires.instrumentaire.office || '—'})` : null,
        statut: notaires.statut || 'NOT_FOUND',
        source: notaires.instrumentaire ? notaires.instrumentaire.source : null,
        raison: notaires.raison || ''
      })
    ].filter(Boolean).join('');

    const parties = (extraction.parties || []).map(p =>
      `<li>${escapeHtml(p.nom)} — <strong>${p.role === 'VENDEUR' ? 'vendeur' : 'acquéreur'}</strong> (désigné « ${escapeHtml(p.qualiteActe)} » dans l’acte${p.qualitePersonne === 'morale' ? ', personne morale' : ''})${p.representant ? `, représenté par ${escapeHtml(p.representant)}` : ''}</li>`
    ).join('');

    const alertes = (extraction.alertes || []).map(a =>
      `<div class="revision-alerte ${a.gravite === 'critique' ? 'critique' : ''}">${icone('alert-triangle')}<span>${escapeHtml(a.message)}</span></div>`
    ).join('');

    panneau.innerHTML = `
      <div class="section-eyebrow">Ce que l’outil a compris</div>
      ${alertes}
      ${parties ? `<div class="revision-parties"><ul>${parties}</ul></div>` : ''}
      <div class="revision-grille">${lignes}</div>
      <p class="hint">Chaque donnée reste modifiable dans les champs du formulaire : ce panneau explique seulement d’où elle vient.</p>
    `;
    panneau.style.display = 'block';

    // Les alertes sont rappelées à l'étape "Finaliser", au moment d'enregistrer.
    if (rappel) {
      rappel.innerHTML = alertes;
      rappel.style.display = alertes ? 'block' : 'none';
    }
  }

  // Point d'entrée UNIQUE du recalcul : appelé après un import, après une correction de la date de
  // signature, et après un repli OCR/métadonnées — les trois endroits qui refont
  // detecterDatesDepuisTexte. En oublier un laisserait le panneau désynchronisé du formulaire.
  function recalculerExtractionRegex() {
    if (!dernierTexteTraite) { renderPanneauRevision(null); return; }
    extractionActuelle = construireExtractionRegex(dernierTexteTraite, dateCompromisDetectee, detectedDates);
    appliquerExtractionAuFormulaire(extractionActuelle);
    renderPanneauRevision(extractionActuelle);
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
    masquerBoutonAjoutEngagement();
    masquerFormAjoutEngagementManuel();
    reinitialiserRecherchePdf();
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

      const content = await page.getTextContent();
      construireCoucheTexte(content, viewport, bloc, canvas);
    }
  }

  // Couche de texte invisible mais sélectionnable posée par-dessus le canvas d'une page rendue —
  // permet à l'utilisateur de sélectionner une clause à la souris (comme dans un vrai lecteur PDF)
  // pour l'ajouter manuellement comme engagement du vendeur quand la détection automatique n'a rien
  // trouvé pour elle (voir gererSelectionPdf()/ajouterEngagementManuel() ci-dessous). Repose sur la
  // même transformation de position que voirDateDansPdf()/voirEngagementDansPdf() (déjà utilisée
  // pour positionner un surlignage ponctuel), appliquée ici à CHAQUE item de la page plutôt qu'à un
  // seul passage recherché après coup — une version simplifiée du TextLayerBuilder de pdf.js,
  // réécrite ici plutôt que d'en charger le module dédié (non inclus dans le seul pdf.min.js déjà
  // chargé). L'alignement horizontal (largeur réelle du glyphe vs largeur du <span>) n'a pas besoin
  // d'être pixel-parfait : seule la SÉLECTION doit correspondre au bon texte, le texte lui-même
  // reste transparent (voir .pdf-text-layer dans style.css) et n'est jamais affiché tel quel.
  function construireCoucheTexte(content, viewport, bloc, canvas) {
    const couche = document.createElement('div');
    couche.className = 'pdf-text-layer';
    couche.style.width = canvas.width + 'px';
    couche.style.height = canvas.height + 'px';
    bloc.appendChild(couche);

    content.items.forEach(item => {
      if (!item.str) return;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const angleRad = Math.atan2(tx[1], tx[0]);
      const hauteur = Math.hypot(tx[2], tx[3]) || 1;
      const largeurCible = (item.width || 0) * (viewport.scale || 1);

      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.left = tx[4] + 'px';
      span.style.top = (tx[5] - hauteur) + 'px';
      span.style.fontSize = hauteur + 'px';
      couche.appendChild(span);

      // Ajuste après coup la largeur rendue (police de repli du navigateur, pas celle du PDF) sur
      // la largeur réelle du glyphe dans le document — sans quoi la fin d'une sélection dériverait
      // de plus en plus loin de ce qui est visuellement affiché au fil d'une ligne.
      const largeurRendue = span.getBoundingClientRect().width;
      const transforme = angleRad ? `rotate(${angleRad}rad)` : '';
      if (largeurCible > 0 && largeurRendue > 0) {
        span.style.transform = `${transforme} scaleX(${largeurCible / largeurRendue})`.trim();
      } else if (transforme) {
        span.style.transform = transforme;
      }
    });
  }

  // Sélection de texte dans l'aperçu du compromis (voir construireCoucheTexte() ci-dessus) : dès
  // qu'une sélection non vide se trouve dans #pdf-pages-container, une petite barre flottante
  // propose de l'ajouter comme engagement du vendeur, catégorisé comme n'importe quel engagement
  // détecté automatiquement (entretien/travaux/document) — utile quand une clause réelle échappe
  // aux motifs de detecterEngagementsVendeur/EXCLUSION_ENGAGEMENT_RE, plutôt que de la ressaisir à
  // la main ailleurs sans aucune trace dans l'analyse juridique.
  let selectionEngagementEnCours = null;

  function gererSelectionPdf() {
    const toolbar = document.getElementById('pdf-selection-toolbar');
    if (!toolbar) return;
    const selection = window.getSelection();
    const texte = selection && !selection.isCollapsed ? selection.toString().trim() : '';
    const conteneur = document.getElementById('pdf-pages-container');
    const ancre = selection && selection.anchorNode;
    const ancreDansPdf = ancre && conteneur && conteneur.contains(ancre);

    if (!texte || !ancreDansPdf) {
      toolbar.style.display = 'none';
      selectionEngagementEnCours = null;
      return;
    }

    const noeudElement = ancre.nodeType === 1 ? ancre : ancre.parentElement;
    const blocPage = noeudElement ? noeudElement.closest('.pdf-page-bloc') : null;
    const page = blocPage ? parseInt(blocPage.id.replace('pdf-page-bloc-', ''), 10) || null : null;

    selectionEngagementEnCours = { phrase: texte.replace(/\s+/g, ' ').trim(), page };

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    toolbar.style.display = 'flex';
    toolbar.style.left = (rect.left + rect.width / 2) + 'px';
    toolbar.style.top = (rect.top - 8) + 'px';
  }

  function ajouterEngagementManuel(type) {
    if (!selectionEngagementEnCours) return;
    analyseJuridiqueActuelle.engagements.push({
      phrase: selectionEngagementEnCours.phrase,
      type,
      page: selectionEngagementEnCours.page,
      manuel: true
    });
    // Une clause sélectionnée à la main est, par définition, une clause que la détection
    // automatique (extraireEngagementsVendeur) a manquée ou n'a pas su catégoriser — on la mémorise
    // pour qu'une clause très proche soit reconnue directement au prochain import (voir
    // trouverCorrectionApprise/memoriserCorrection, catégorie 'engagement' : même mécanisme que
    // l'apprentissage déjà en place pour les dates, un espace de classification séparé).
    memoriserCorrection(selectionEngagementEnCours.phrase, type, null, 'engagement');
    afficherAnalyseJuridique();
    masquerBoutonAjoutEngagement();
    afficherToast('Engagement ajouté à l’analyse juridique.', 'OK', null);
  }

  // Pendant du bouton flottant ci-dessus, mais sans dépendre d'une sélection de texte dans le PDF :
  // demandé par l'étude pour saisir un engagement qui n'apparaît pas littéralement dans l'acte
  // (accord oral rapporté, engagement verbal du vendeur...) ou simplement quand aucun PDF n'est
  // chargé pour l'instant. Toujours accessible depuis l'étape "Analyse juridique" du wizard, jamais
  // masqué par l'état vide (voir index.html) — un dossier sans aucune détection automatique doit
  // pouvoir malgré tout recevoir un engagement saisi à la main.
  function afficherFormAjoutEngagementManuel() {
    const btn = document.getElementById('ajout-engagement-manuel-btn');
    const form = document.getElementById('ajout-engagement-manuel-form');
    if (btn) btn.style.display = 'none';
    if (form) form.style.display = 'flex';
    const texte = document.getElementById('nouvel-engagement-texte');
    if (texte) texte.focus();
  }

  function masquerFormAjoutEngagementManuel() {
    const btn = document.getElementById('ajout-engagement-manuel-btn');
    const form = document.getElementById('ajout-engagement-manuel-form');
    if (btn) btn.style.display = '';
    if (form) form.style.display = 'none';
    const texte = document.getElementById('nouvel-engagement-texte');
    if (texte) texte.value = '';
  }

  function ajouterEngagementDepuisFormulaire() {
    const texteEl = document.getElementById('nouvel-engagement-texte');
    const typeEl = document.getElementById('nouvel-engagement-type');
    const texte = texteEl ? texteEl.value.trim() : '';
    if (!texte) { if (texteEl) texteEl.focus(); return; }
    const type = typeEl ? typeEl.value : 'document';
    analyseJuridiqueActuelle.engagements.push({
      phrase: texte,
      type,
      page: null,
      manuel: true
    });
    // Même principe que ajouterEngagementManuel() ci-dessus (voir son commentaire) : une clause
    // saisie ici échappe forcément à la détection automatique (elle n'a pas de PDF anchré à
    // relire), la mémoriser reste sans risque pour tout futur import dont une clause proche
    // passerait, elle, par le motif d'ancrage d'extraireEngagementsVendeur().
    memoriserCorrection(texte, type, null, 'engagement');
    masquerFormAjoutEngagementManuel();
    afficherAnalyseJuridique();
    afficherToast('Engagement ajouté à l’analyse juridique.', 'OK', null);
  }

  function masquerBoutonAjoutEngagement() {
    const toolbar = document.getElementById('pdf-selection-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    selectionEngagementEnCours = null;
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  // Nom conservé malgré la généralisation (voir renderEngagement) : retire désormais N'IMPORTE
  // QUEL engagement pendant l'import, pas seulement ceux ajoutés à la main — sans confirmation
  // (état pré-enregistrement, reversible en réimportant le PDF).
  function supprimerEngagementManuel(index) {
    if (!analyseJuridiqueActuelle.engagements[index]) return;
    analyseJuridiqueActuelle.engagements.splice(index, 1);
    afficherAnalyseJuridique();
  }

  // Pendant l'import (voir renderDocBadge) : retire un document identifié de l'analyse en cours,
  // sans confirmation, même logique que supprimerEngagementManuel() ci-dessus.
  function supprimerDocumentManuel(index) {
    if (!analyseJuridiqueActuelle.documents[index]) return;
    analyseJuridiqueActuelle.documents.splice(index, 1);
    afficherAnalyseJuridique();
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

      // normaliserAvecIndex (définie au niveau racine, section « localisation d'un extrait »)
      // conserve, pour chaque caractère du résultat, l'index correspondant dans le texte d'origine
      // — la phrase mémorisée a déjà ses espaces multiples réduits à un seul au moment de
      // l'extraction (voir extraireEngagementsVendeur), pas forcément identique à la mise en page
      // réelle de la page ; casse, accents et apostrophes peuvent aussi différer.
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

  // Recherche de texte dans l'aperçu du compromis, sur le modèle d'un vrai lecteur PDF (Ctrl+F).
  // Réutilise directement la couche de texte déjà posée par construireCoucheTexte() pour la
  // sélection manuelle — plutôt que de rappeler pdf.js (getTextContent()) à chaque frappe, ce qui
  // ré-parserait tout le document à chaque caractère tapé : les <span> sont déjà en place, déjà
  // positionnés pixel pour pixel sur le rendu, il suffit de les parcourir et de leur ajouter une
  // classe de surlignage. Insensible aux accents/majuscules (normaliserPourRecherche(), déjà
  // utilisée pour la recherche de dossiers) — "pret" retrouve aussi bien "prêt" que "PRÊT".
  let resultatsRecherchePdf = [];
  let indexResultatRecherchePdf = -1;

  function rechercherDansPdf(valeur) {
    document.querySelectorAll('.pdf-search-marque').forEach(el => {
      el.classList.remove('pdf-search-marque', 'pdf-search-marque-active');
    });
    resultatsRecherchePdf = [];
    indexResultatRecherchePdf = -1;
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    const requeteNorm = normaliserPourRecherche(String(valeur || '').trim());
    if (!requeteNorm) {
      if (compteurEl) compteurEl.textContent = '';
      return;
    }

    document.querySelectorAll('#pdf-pages-container .pdf-page-bloc').forEach(bloc => {
      const couche = bloc.querySelector('.pdf-text-layer');
      if (!couche) return;
      const spans = Array.from(couche.children);
      // Texte normalisé concaténé de la page, un espace entre chaque item (comme
      // voirEngagementDansPdf()) — mémorise pour chaque caractère l'index du <span> d'origine,
      // -1 pour les espaces insérés entre deux items.
      let texte = '';
      const origines = [];
      spans.forEach((span, i) => {
        const norm = normaliserPourRecherche(span.textContent || '');
        for (const ch of norm) { texte += ch; origines.push(i); }
        texte += ' '; origines.push(-1);
      });

      let pos = texte.indexOf(requeteNorm);
      while (pos !== -1) {
        const spansConcernes = new Set();
        for (let i = pos; i < pos + requeteNorm.length && i < origines.length; i++) {
          if (origines[i] >= 0) spansConcernes.add(origines[i]);
        }
        if (spansConcernes.size > 0) {
          resultatsRecherchePdf.push({ spans: Array.from(spansConcernes).map(i => spans[i]) });
        }
        pos = texte.indexOf(requeteNorm, pos + 1);
      }
    });

    resultatsRecherchePdf.forEach(r => r.spans.forEach(s => s.classList.add('pdf-search-marque')));

    if (compteurEl) {
      compteurEl.textContent = resultatsRecherchePdf.length
        ? `1 / ${resultatsRecherchePdf.length}`
        : 'Aucun résultat';
    }
    if (resultatsRecherchePdf.length) allerResultatPdf(0);
  }

  function allerResultatPdf(index) {
    if (!resultatsRecherchePdf.length) return;
    if (index < 0) index = resultatsRecherchePdf.length - 1;
    if (index >= resultatsRecherchePdf.length) index = 0;
    document.querySelectorAll('.pdf-search-marque-active').forEach(el => {
      el.classList.remove('pdf-search-marque-active');
    });
    indexResultatRecherchePdf = index;
    const resultat = resultatsRecherchePdf[index];
    resultat.spans.forEach(s => s.classList.add('pdf-search-marque-active'));
    resultat.spans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    if (compteurEl) compteurEl.textContent = `${index + 1} / ${resultatsRecherchePdf.length}`;
  }

  function allerResultatPdfSuivant(direction) {
    if (!resultatsRecherchePdf.length) return;
    allerResultatPdf(indexResultatRecherchePdf + direction);
  }

  // Remet la recherche PDF à zéro (nouveau document chargé, ou formulaire réinitialisé) : sans ça,
  // le champ garderait le texte/les résultats d'une recherche menée sur le PDF PRÉCÉDENT, alors que
  // les <span> qu'elle référence viennent d'être détruits par chargerToutesLesPagesPdf().
  function reinitialiserRecherchePdf() {
    resultatsRecherchePdf = [];
    indexResultatRecherchePdf = -1;
    const input = document.getElementById('pdf-recherche-input');
    if (input) input.value = '';
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    if (compteurEl) compteurEl.textContent = '';
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
    afficherStatutEnrichissementIa(false); // efface un éventuel résidu d'un import précédent
    const monImport = ++generationImportActuel;

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
      // Lancée EN ARRIÈRE-PLAN (jamais attendue ici) : la détection par regex ci-dessus reste le
      // chemin principal, immédiat et déjà éprouvé — l'IA locale ne fait qu'enrichir ensuite ce
      // qu'elle n'a pas trouvé, silencieusement si Ollama n'est pas disponible. Ne doit jamais
      // retarder la suite de l'import (bascule d'étape, aperçu PDF...).
      lancerExtractionIa(texteComplet, monImport);
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
              recalculerExtractionRegex();
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
            recalculerExtractionRegex();
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

  // ---- Extraction assistée par IA locale (Ollama), en complément du wizard "Nouveau dossier" ----
  // Voir server/src/routes/extractionIa.js et CLAUDE.md. N'existe que sur `claude/serveur-intranet`
  // (a besoin d'un backend pour parler à Ollama) — appelée en ARRIÈRE-PLAN juste après
  // traiterTexte() (regex, inchangée, toujours le chemin principal et immédiat) pour ne compléter
  // QUE ce qu'elle n'a pas trouvé : jamais une valeur déjà détectée ou déjà saisie à la main n'est
  // écrasée, même principe que detecterAdresseBien()/detecterEmailAcquereur()/detecterMontantPret()
  // ailleurs dans ce fichier. Silencieuse si Ollama n'est pas installé/lancé sur le serveur — le
  // wizard reste utilisable exactement comme avant l'ajout de cette fonctionnalité dans ce cas,
  // jamais une condition bloquante pour créer un dossier.

  // Nettement plus permissif que SEUIL_SIMILARITE_APPRENTISSAGE (0.6, deux formulations quasi
  // identiques de LA MÊME clause) : ici on compare une phrase extraite telle quelle du texte à une
  // description reformulée par le modèle, sans aucune racinisation (tokeniserApprentissage compare
  // des mots entiers) — deux verbes de la même famille ("entretien"/"entretenir") comptent déjà
  // comme deux tokens différents, donc l'overlap réel reste modeste même pour la même clause.
  // Premier jet volontairement prudent : sous-détecter un doublon (une suggestion IA redondante
  // affichée en plus d'un engagement déjà repéré par regex) coûte un simple clic sur sa croix de
  // suppression, alors que sur-détecter risquerait de faire disparaître silencieusement un
  // engagement réellement distinct — à resserrer si l'usage réel montre trop de redites.
  const SEUIL_SIMILARITE_ENGAGEMENT_IA = 0.2;

  function engagementDejaConnu(description, engagementsExistants) {
    const tokensIa = tokeniserApprentissage(normaliserTexteApprentissage(description));
    return engagementsExistants.some(e => {
      const phrase = typeof e === 'string' ? e : e.phrase;
      const tokensExistant = tokeniserApprentissage(normaliserTexteApprentissage(phrase || ''));
      return similariteJaccard(tokensIa, tokensExistant) >= SEUIL_SIMILARITE_ENGAGEMENT_IA;
    });
  }

  // Affiche/masque l'état "Analyse par le modèle IA local en cours…" (étape "Vérifier" du wizard,
  // voir index.html) pendant l'appel à /api/extraction-ia — sans lui, rien n'indiquait qu'une
  // recherche était en cours pendant les quelques secondes à dizaines de secondes que peut prendre
  // Ollama, silencieux jusqu'au toast final. N'a jamais retardé l'import lui-même (voir l'appel
  // sans await plus bas) : seul l'affichage de CET état est synchrone avec la requête.
  function afficherStatutEnrichissementIa(visible) {
    const el = document.getElementById('ia-enrichissement-status');
    if (!el) return;
    if (visible) {
      const iconeEl = document.getElementById('icon-ia-enrichissement');
      if (iconeEl && !iconeEl.innerHTML) iconeEl.innerHTML = icone('spinner', null, true);
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  // ==== EXTRACTION STRUCTURÉE : fusion des lots IA ====
  //
  // Trois règles, les mêmes pour toute donnée, quel que soit le lot :
  //   - les regex n'ont RIEN trouvé → on prend la valeur du modèle, avec le statut que lui vaut la
  //     vérification de son extrait (`extraitTrouve`, calculé côté serveur : sa citation figure-t-elle
  //     littéralement dans le PDF ?) — CONFIRMED si oui, NEEDS_REVIEW sinon ;
  //   - les deux trouvent LA MÊME chose → CONFIRMED, origine 'regex+ia' : deux méthodes
  //     indépendantes qui convergent, c'est le meilleur signal disponible ;
  //   - les deux trouvent des choses DIFFÉRENTES → on garde la valeur des regex (déterministes,
  //     testées sur de vrais actes) mais le statut passe NEEDS_REVIEW et la valeur du modèle est
  //     conservée en candidat, visible dans le panneau. Jamais de choix silencieux entre les deux.
  //
  // Le modèle ne calcule jamais une date : il rapporte un délai et son point de départ, le calcul
  // est fait ici par calculerDateEcheance() — déterministe, testé (voir tests/dates-metier.test.js).
  function fusionnerExtractionIa(extraction, lot, resultat, texte, options) {
    if (!extraction || !resultat) return extraction;
    const o = options || {};
    const page = typeof o.page === 'function' ? o.page : () => null;

    // Source (extrait + page) d'un élément renvoyé par le serveur, et statut qu'elle lui vaut.
    const sourceIa = (element) => (element && element.extrait)
      ? { extrait: element.extrait, index: element.extraitIndex === undefined ? null : element.extraitIndex, page: element.extraitTrouve ? page(element.extraitIndex) : null }
      : null;
    const statutIa = (element) => (element && element.extraitTrouve) ? 'CONFIRMED' : 'NEEDS_REVIEW';

    // Applique les trois règles ci-dessus à un champ générique.
    const fusionnerChamp = (champ, valeurIa, element) => {
      const existant = champ || champExtraction(null, { statut: 'NOT_FOUND' });
      if (valeurIa === null || valeurIa === undefined || valeurIa === '') return existant;
      if (existant.valeur === null || existant.valeur === undefined || existant.valeur === '') {
        return champExtraction(valeurIa, { statut: statutIa(element), origine: 'ia', source: sourceIa(element) });
      }
      if (String(existant.valeur) === String(valeurIa)) {
        return Object.assign({}, existant, { statut: 'CONFIRMED', origine: 'regex+ia' });
      }
      return Object.assign({}, existant, {
        statut: 'NEEDS_REVIEW',
        origine: 'regex+ia',
        raison: 'Le modèle local lit une autre valeur à cet endroit : c’est celle des règles de détection qui est retenue.',
        candidats: (existant.candidats || []).concat([{ valeur: valeurIa, origine: 'ia', source: sourceIa(element) }])
      });
    };

    if (lot === 'parties') {
      if (resultat.typeActe && resultat.typeActe.valeur) {
        // Un type d'acte non tranché par les regex est le cas où l'inversion vendeur/acquéreur
        // d'une promesse d'achat passerait inaperçue : c'est exactement là que le modèle, qui lit
        // le document en contexte, apporte le plus.
        const actuel = extraction.typeActe || {};
        if (!actuel.valeur || actuel.valeur === 'INCONNU') {
          extraction.typeActe = { valeur: resultat.typeActe.valeur, statut: statutIa(resultat.typeActe), origine: 'ia', source: sourceIa(resultat.typeActe) };
        } else if (actuel.valeur === resultat.typeActe.valeur) {
          extraction.typeActe = Object.assign({}, actuel, { statut: 'CONFIRMED', origine: 'regex+ia' });
        } else {
          extraction.typeActe = Object.assign({}, actuel, {
            statut: 'NEEDS_REVIEW', origine: 'regex+ia',
            raison: `Le modèle local lit plutôt « ${resultat.typeActe.valeur} » : vérifiez que vendeur et acquéreur ne sont pas intervertis.`
          });
        }
      }

      if ((extraction.parties || []).length === 0 && Array.isArray(resultat.parties) && resultat.parties.length > 0) {
        extraction.parties = resultat.parties.map(p => ({
          nom: p.nom, qualiteActe: p.qualiteActe || '', role: p.role,
          qualitePersonne: p.qualitePersonne || 'physique', representant: p.representant || null,
          source: sourceIa(p)
        }));
        // Le nom du dossier est dérivé des parties : le recomposer ici plutôt que de laisser le
        // modèle proposer sa propre mise en forme, qui varierait d'un acte à l'autre.
        const vendeurs = extraction.parties.filter(p => p.role === 'VENDEUR').map(p => p.nom);
        const acquereurs = extraction.parties.filter(p => p.role === 'ACQUEREUR').map(p => p.nom);
        if (vendeurs.length > 0 && acquereurs.length > 0) {
          extraction.champs.nom = fusionnerChamp(extraction.champs.nom, `${vendeurs.join(' & ')} / ${acquereurs.join(' & ')}`, resultat.parties[0]);
        }
      }

      // Notaires : seulement si les regex n'en ont identifié aucun. La règle métier (41/45/37) est
      // ensuite rejouée telle quelle sur cette liste — jamais réimplémentée ici, elle n'est
      // déclarée qu'à un seul endroit (REGLES_NOTAIRE_INSTRUMENTAIRE).
      const notairesActuels = (extraction.notaires && extraction.notaires.liste) || [];
      if (notairesActuels.length === 0 && Array.isArray(resultat.notaires) && resultat.notaires.length > 0) {
        const liste = resultat.notaires.map(n => ({
          nom: n.nom, office: n.office || null, adresse: null,
          codePostal: null, commune: n.office || null, departement: null,
          cote: n.cote || 'inconnu', roleExplicite: n.roleExplicite || null,
          source: sourceIa(n)
        }));
        const departement = extraction.bien && extraction.bien.adresse ? extraction.bien.adresse.departement : null;
        extraction.notaires = determinerNotaires(liste, departement);
      }
    }

    if (lot === 'bien') {
      const adresseActuelle = (extraction.bien && extraction.bien.adresse) || null;
      if (resultat.adresse && (!adresseActuelle || adresseActuelle.statut !== 'CONFIRMED')) {
        const a = resultat.adresse;
        const morceaux = [a.numero, a.typeVoie, a.nomVoie, a.lieuDit, a.codePostal, a.commune].filter(Boolean);
        extraction.bien = extraction.bien || {};
        extraction.bien.adresse = {
          adresseComplete: morceaux.join(' '),
          numero: a.numero || null, typeVoie: a.typeVoie || null, nomVoie: a.nomVoie || null,
          lieuDit: a.lieuDit || null, codePostal: a.codePostal || null, commune: a.commune || null,
          departement: a.codePostal ? departementDepuisCodePostal(a.codePostal) : null,
          // Une adresse reste incomplète sans code postal ET commune, quel que soit l'aplomb du
          // modèle : c'est du code postal qu'on déduit le département, donc le notaire.
          statut: (a.codePostal && a.commune) ? statutIa(a) : 'NEEDS_REVIEW',
          origine: 'ia'
        };
        extraction.bien.source = sourceIa(a);
      }
      if (resultat.cadastre && !(extraction.bien && extraction.bien.cadastre)) {
        extraction.bien = extraction.bien || {};
        extraction.bien.cadastre = { section: resultat.cadastre.section, numero: resultat.cadastre.numero || null };
      }
      if (resultat.prixVente) {
        extraction.champs.prixVente = fusionnerChamp(extraction.champs.prixVente, resultat.prixVente.valeur, resultat.prixVente);
      }
      if (resultat.typeVente) {
        extraction.champs.typeVente = fusionnerChamp(extraction.champs.typeVente, resultat.typeVente.valeur, resultat.typeVente);
      }
    }

    if (lot === 'dates') {
      const signature = (extraction.dates && extraction.dates.SIGNATURE_AVANT_CONTRAT && extraction.dates.SIGNATURE_AVANT_CONTRAT.valeur) || null;
      for (const entree of (resultat.dates || [])) {
        if (!TYPES_DATE.includes(entree.type)) continue;
        const actuel = extraction.dates[entree.type];
        let valeur = entree.dateExplicite || null;
        let methode = valeur ? 'EXPLICIT' : null;
        if (!valeur && entree.delai) {
          // Le point de départ est rapporté par le modèle dans les mots de l'acte : on le
          // reconnaît avec la même table que les regex, et on ne calcule QUE depuis la signature —
          // les autres ancres (notification, purge, réalisation d'une condition) n'ont pas de date
          // connue à l'import, la date resterait une invention.
          const cle = pointDepartDepuisAncre(entree.delai.pointDepart || '');
          if (pointDepartCalculable(cle) && signature) {
            valeur = calculerDateEcheance(signature, entree.delai);
            methode = 'CALCULATED';
          }
        }
        if (!valeur) continue;
        const fusionne = fusionnerChamp(actuel, valeur, entree);
        // Une date lue telle quelle dans l'acte ne devient jamais « calculée » par l'effet de la
        // fusion : la méthode d'origine prime, c'est elle qui dit à l'étude d'où vient le chiffre.
        fusionne.methode = (actuel && actuel.methode) ? actuel.methode : methode;
        extraction.dates[entree.type] = fusionne;
      }
    }

    extraction.iaLots[lot] = 'ok';
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Lance les trois lots EN PARALLÈLE et fusionne chaque réponse dès son arrivée : le panneau se
  // remplit lot par lot plutôt que d'attendre le plus lent des trois. Chacun passe par le même
  // garde-fou de génération (l'utilisateur a pu importer un autre PDF ou enregistrer le dossier
  // entretemps) et par appliquerExtractionAuFormulaire, qui ne touche jamais un champ saisi à la
  // main. Silencieuse si Ollama n'est pas installé/lancé : le wizard reste utilisable exactement
  // comme sans cette passe, jamais une condition bloquante pour créer un dossier.
  var LOTS_EXTRACTION_IA = ['parties', 'bien', 'dates'];

  async function lancerExtractionIa(texte, monImport) {
    if (!extractionActuelle) return;
    afficherStatutEnrichissementIa(true);
    let lotsAboutis = 0;
    let engagementsAjoutes = 0;

    const traiterLot = async (lot) => {
      let reponse;
      try {
        reponse = await fetchAvecAuth('/api/extraction-ia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texte, lot })
        });
      } catch (e) {
        return; // session expirée (gérée par fetchAvecAuth) ou réseau — passe optionnelle
      }
      if (!reponse.ok) return; // Ollama indisponible : pas d'échec bruyant
      const corps = await reponse.json().catch(() => null);
      if (!corps || !corps.resultat) return;
      if (monImport !== generationImportActuel || !extractionActuelle) return;

      fusionnerExtractionIa(extractionActuelle, lot, corps.resultat, texte, { page: pageDepuisIndex });
      lotsAboutis++;

      if (lot === 'dates') {
        for (const suggestion of (corps.resultat.engagementsVendeur || [])) {
          if (engagementDejaConnu(suggestion.extrait, analyseJuridiqueActuelle.engagements)) continue;
          analyseJuridiqueActuelle.engagements.push({ phrase: suggestion.extrait, type: suggestion.type, page: null, source: 'ia' });
          engagementsAjoutes++;
        }
        if ((corps.resultat.engagementsVendeur || []).length > 0) {
          // Recalculés à partir de TOUS les engagements (regex + IA), comme dans traiterTexte() —
          // une seule fonction pure, jamais deux logiques selon la provenance de la liste.
          analyseJuridiqueActuelle.documents = detecterDocumentsAFournir(analyseJuridiqueActuelle.engagements);
          afficherAnalyseJuridique();
        }
      }

      appliquerExtractionAuFormulaire(extractionActuelle);
      renderPanneauRevision(extractionActuelle);
    };

    await Promise.all(LOTS_EXTRACTION_IA.map(lot => traiterLot(lot).catch(() => {
      if (extractionActuelle) extractionActuelle.iaLots[lot] = 'indisponible';
    })));

    // Un import suivant a déjà remis son propre statut (masqué au départ, voir traiterFichierPdf) :
    // le masquer ici écraserait l'état du nouvel import.
    if (monImport !== generationImportActuel) return;
    afficherStatutEnrichissementIa(false);
    for (const lot of LOTS_EXTRACTION_IA) {
      if (extractionActuelle && extractionActuelle.iaLots[lot] === 'attente') extractionActuelle.iaLots[lot] = 'indisponible';
    }
    if (lotsAboutis === 0) return;

    const morceaux = [`${lotsAboutis} lecture${lotsAboutis > 1 ? 's' : ''} du modèle local`];
    if (engagementsAjoutes > 0) morceaux.push(`${engagementsAjoutes} engagement${engagementsAjoutes > 1 ? 's' : ''} du vendeur en plus`);
    afficherToast(`IA locale : ${morceaux.join(', ')} — voir « Ce que l’outil a compris », tout reste à vérifier.`, 'OK', null);
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
    // Périme tout enrichissement IA encore en vol depuis l'import précédent (voir
    // lancerExtractionIa) : sans ça, sa réponse pourrait arriver après ce reset et remplir des
    // champs pourtant vidés pour un tout nouvel import.
    generationImportActuel++;
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
    // Oubli corrigé au passage : ce champ n'était vidé que par toggleEcheance('ventebien', false).
    // Sans ça, valeursAppliquees le croirait modifié à la main au prochain import.
    document.getElementById('f-ventebien').value = '';
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
    extractionActuelle = null;
    valeursAppliquees = {};
    renderPanneauRevision(null);
    afficherAnalyseJuridique();
    masquerBoutonAjoutEngagement();
    masquerFormAjoutEngagementManuel();
    afficherStatutEnrichissementIa(false);
    // Referme entièrement le panneau d'aperçu : sans ça, le PDF du dossier qu'on vient d'enregistrer
    // restait affiché à côté d'un formulaire pourtant vide, prêt pour un nouvel import.
    document.getElementById('pdf-viewer').style.display = 'none';
    document.getElementById('pdf-viewer-title').textContent = 'Aperçu du compromis';
    document.getElementById('pdf-pages-container').innerHTML = '';
    document.getElementById('nouveau-intro').style.display = 'flex';
    reinitialiserRecherchePdf();
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

    // Engagements d'entretien détectés dans le compromis (chaudière, PAC, ramonage — voir
    // cleChecklist sur DOCUMENTS_VENDEUR_CONNUS/PIECES_ENGAGEMENTS_AUTO) : ajoutés une fois pour
    // toutes à la checklist de CE dossier, calculé ici puisque l'analyse complète du compromis
    // (analyseJuridiqueActuelle) n'existe que pendant l'import — un dossier déjà enregistré et
    // rouvert n'a plus accès au texte du compromis pour refaire cette détection après coup.
    const piecesEngagementsDetectees = analyseJuridiqueActuelle.documents
      .map(doc => doc.cleChecklist)
      .filter(Boolean);

    // Ce que l'extraction structurée a compris de l'acte (type d'acte, parties et leurs rôles,
    // notaires, adresse/cadastre du bien, statut de chaque donnée) — conservé sur le dossier à
    // titre de trace consultable, en plus des champs plats inchangés. Rien de tout ceci n'est
    // recalculable après coup : le texte du compromis n'est jamais gardé (voir CLAUDE.md).
    const instantane = instantaneExtraction(extractionActuelle);

    const dossier = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      nom, email, responsable, emailAcquereur,
      adresseBien,
      prixVente: Number.isFinite(prixVente) && prixVente > 0 ? prixVente : null,
      montantPret: null,
      typeVente,
      roleNotaire,
      pieces: {},
      piecesEngagementsDetectees,
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
      typeActe: instantane ? instantane.typeActe : null,
      parties: instantane ? instantane.parties : [],
      notaires: instantane ? instantane.notaires : null,
      bien: instantane ? instantane.bien : null,
      extraction: instantane ? instantane.extraction : null,
      historique: [{ date: new Date().toISOString(), texte: 'Dossier créé' }]
    };

    // Ce que l'étude a corrigé à la main par rapport à ce que l'extraction proposait — journalisé
    // pour mesurer plus tard où elle se trompe, jamais pour réentraîner automatiquement quoi que
    // ce soit (voir journaliserCorrectionsExtraction).
    journaliserCorrectionsExtraction(diffCorrectionsExtraction(extractionActuelle, {
      nom, adresseBien, emailAcquereur, roleNotaire,
      prixVente: Number.isFinite(prixVente) && prixVente > 0 ? prixVente : null,
      pret, acte, ventebien
    }));

    const cree = await sauvegarderNouveauDossier(dossier);
    if (!cree) {
      afficherToast("Impossible d'enregistrer le dossier — vérifiez la connexion au serveur intranet.", 'OK', null);
      return;
    }
    dossiers.push(dossier);
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

  // Popup d'info post-action (voir telechargerICS()/ouvrirEmailRappel()) : confirme que l'action a
  // eu lieu et rappelle en une phrase à quoi sert le fichier/brouillon obtenu, à la place de
  // l'ancien texte fixe du footer (retiré, voir index.html) qui expliquait ça en permanence sans
  // rapport avec un geste précis de l'utilisateur.
  function afficherInfoAction(titre, message) {
    document.getElementById('info-action-titre').textContent = titre;
    document.getElementById('info-action-message').textContent = message;
    document.getElementById('info-action-overlay').style.display = 'flex';
  }

  function fermerInfoAction() {
    document.getElementById('info-action-overlay').style.display = 'none';
  }

  document.getElementById('confirm-btn-ok').addEventListener('click', () => {
    const action = actionConfirmee;
    annulerConfirmation();
    if (action) action();
  });

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
      // Suppression douce côté serveur (voir supprimerDossierServeur) : la ligne reste en base,
      // seulement marquée supprimée — "Annuler" la restaure sans avoir à la recréer de zéro.
      const supprime = await supprimerDossierServeur(id);
      if (!supprime) {
        afficherToast('Suppression impossible — vérifiez la connexion au serveur.', 'OK', null);
        return;
      }
      dossiers = dossiers.filter(x => x.id !== id);
      render();
      afficherToast(`Dossier « ${nom} » supprimé.`, 'Annuler', async () => {
        const restaure = await restaurerDossierServeur(id);
        if (restaure && d) {
          dossiers.push(d);
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

  function renderTab(type, label, iso, dossierId, page, confiance, autreIndex, offrePretRecue, offreBloc, sansPret) {
    // Les tabs Prêt / Acte / Vente d'un dossier enregistré sont recatégorisables au clic ;
    // les échéances "Autre" gardent leur libellé personnalisé (non concerné par ce sélecteur).
    // Redessiné sur retour de l'étude : le titre est maintenant un texte statique (coloré selon la
    // catégorie), avec juste une petite flèche à côté pour changer de catégorie — plutôt que le
    // titre entier comme <select> (ambigu : rien n'indiquait qu'il s'agissait d'un menu déroulant
    // avant d'y cliquer). Le <select> natif reste fonctionnellement identique (mêmes <option>, même
    // onchange) mais devient invisible (opacity:0), superposé pile sur la petite flèche
    // (.tab-select-icone-chevron, pointer-events:none) qui, elle, est purement décorative.
    const recategorisable = dossierId && autreIndex == null && (type === 'pret' || type === 'acte' || type === 'ventebien');
    const enTete = recategorisable
      ? `<div class="tab-titre-ligne">
          <div class="tab-name">${label}</div>
          <span class="tab-select-icone-wrap" title="Changer la catégorie de cette échéance">
            <select class="tab-select-icone" onchange="changerCategorie('${dossierId}','${type}', this.value)" aria-label="Changer la catégorie de cette échéance">${optionsCategorie(type)}</select>
            <span class="tab-select-icone-chevron">${icone('chevron-down')}</span>
          </span>
        </div>`
      : `<div class="tab-name">${label}</div>`;

    // Petite croix en haut à droite pour retirer une échéance : "autre" passe par
    // supprimerEcheanceAutre (retire l'entrée de d.autres) ; Prêt/Acte/Vente préalable, tant qu'une
    // date y est renseignée, passent par supprimerDateEcheance (vide juste la date — la tab
    // elle-même n'est jamais retirée du modèle, voir son historique). Avant ce bouton dédié, seul
    // le crayon (vider le champ date natif puis valider) permettait de l'effacer — peu visible,
    // demandé par l'étude sous forme d'un vrai bouton de suppression.
    const croixSuppression = (dossierId && autreIndex != null)
      ? `<button type="button" class="tab-suppr" onclick="supprimerEcheanceAutre('${dossierId}', ${autreIndex})" title="Supprimer cette échéance" aria-label="Supprimer cette échéance">${icone('x')}</button>`
      : (dossierId && autreIndex == null && iso && (type === 'pret' || type === 'acte' || type === 'ventebien'))
        ? `<button type="button" class="tab-suppr" onclick="supprimerDateEcheance('${dossierId}', '${type}')" title="Supprimer cette date" aria-label="Supprimer cette date">${icone('x')}</button>`
        : '';

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
      // "Achat comptant — sans prêt" plutôt que "Non renseigné" : ce dernier laissait croire à un
      // oubli sur un dossier où cette échéance ne s'applique tout simplement pas (sansPret vrai,
      // qu'il vienne de la création ou d'une suppression de date après coup — voir
      // supprimerDateEcheance). Le crayon reste affiché : si un prêt finit par exister malgré tout,
      // saisir une date ici doit rester possible (voir validerEditionDate, qui repasse alors
      // sansPret à false).
      const texteVide = (type === 'pret' && sansPret) ? 'Achat comptant — sans prêt' : 'Non renseigné';
      return `<div class="tab ${type}">
        ${croixSuppression}
        ${enTete}
        <span class="tab-date-affichage" id="${idBase}-aff"><div class="tab-date">${texteVide}</div>${crayonDate}${badgeConfiance}</span>
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
      ${croixSuppression}
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
    sauvegarder(d);
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
    const libelle = (v) => v === 'copropriete' ? 'copropriété' : v === 'terrain' ? 'terrain à bâtir' : 'maison';
    ajouterHistorique(d, `Type de vente modifié : ${libelle(d.typeVente)} → ${libelle(valeur)}`);
    // La checklist de pièces (checklistPieces) est recalculée à partir de d.typeVente à chaque
    // affichage : pas besoin de retoucher d.pieces ici. Les pièces déjà reconnues sous une clé
    // commune aux deux types (ex. titrePropriete) restent valables ; celles propres à l'ancien type
    // (ex. etatDate en quittant la copropriété) restent en mémoire mais ne s'affichent plus,
    // inoffensif si l'étude revient un jour au type précédent.
    d.typeVente = valeur;
    sauvegarder(d);
    render();
  }

  function changerRoleNotaire(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || d.roleNotaire === valeur) return;
    const libelle = (v) => v === 'participant' ? 'participant' : 'instrumentaire';
    ajouterHistorique(d, `Rôle de l'étude modifié : ${libelle(d.roleNotaire)} → ${libelle(valeur)}`);
    d.roleNotaire = valeur;
    sauvegarder(d);
    render();
  }

  // Même motif que changerTypeVente/changerRoleNotaire : un dossier peut changer de main en cours
  // de suivi (absence, réaffectation) sans repasser par la création.
  function changerResponsable(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || (d.responsable || '') === valeur) return;
    ajouterHistorique(d, `Responsable modifié : ${d.responsable || '— à définir —'} → ${valeur || '— à définir —'}`);
    d.responsable = valeur;
    sauvegarder(d);
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
    sauvegarder(d);
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
    sauvegarder(d);
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
    sauvegarder(d);
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

  // Évolution du nombre de dossiers actifs dans le temps, demandée par l'étude pour le Tableau de
  // bord ("comparer avec le mois précédent... suivi par rapport au mois précédent et à l'année
  // précédente"). Calculée RÉTROACTIVEMENT à partir de l'historique déjà stocké sur chaque dossier
  // (l'entrée "Dossier créé" ajoutée par ajouterDossier(), "Dossier archivé"/"Dossier désarchivé"
  // ajoutées par archiverDossier()) plutôt que via un nouveau mécanisme de relevé périodique à
  // mettre en place : ce dernier n'aurait donné aucune profondeur historique avant plusieurs mois
  // d'usage, alors que l'historique existant permet une réponse immédiate. Un dossier supprimé
  // (plutôt qu'archivé) n'a plus aucune trace, comme partout ailleurs dans l'outil — une suppression
  // reste définitive, y compris pour ce calcul rétroactif.
  function etaitDossierActifA(d, dateRef) {
    const historique = (d.historique || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const creation = historique.find(h => h.texte === 'Dossier créé');
    // Dossier pas encore créé à la date de référence : n'existait pas, donc pas "actif".
    if (creation && new Date(creation.date) > dateRef) return false;
    let archive = false;
    for (const h of historique) {
      if (new Date(h.date) > dateRef) break;
      if (h.texte === 'Dossier archivé') archive = true;
      else if (h.texte === 'Dossier désarchivé') archive = false;
    }
    return !archive;
  }

  function compterDossiersActifsA(listeDossiers, dateRef) {
    return listeDossiers.filter(d => etaitDossierActifA(d, dateRef)).length;
  }

  // `maintenant` (optionnel, par défaut la date du jour) permet de fixer une référence stable dans
  // les tests plutôt que de dépendre de `new Date()` au moment de l'exécution.
  function calculerEvolutionPortefeuille(listeDossiers, maintenant) {
    const ref = maintenant || new Date();
    const actuel = listeDossiers.filter(d => !d.archive).length;
    const ilYAUnMois = new Date(ref);
    ilYAUnMois.setMonth(ilYAUnMois.getMonth() - 1);
    const ilYAUnAn = new Date(ref);
    ilYAUnAn.setFullYear(ilYAUnAn.getFullYear() - 1);
    const moisDernier = compterDossiersActifsA(listeDossiers, ilYAUnMois);
    const anDernier = compterDossiersActifsA(listeDossiers, ilYAUnAn);
    return { actuel, moisDernier, ecartMois: actuel - moisDernier, anDernier, ecartAn: actuel - anDernier };
  }

  // Petite flèche + chiffre signé pour un écart, réutilisée pour les deux comparaisons (mois/an) —
  // un seul rendu pour ne pas décrire deux fois la même logique. Volontairement pas de couleur
  // "succès"/"alerte" sur la hausse/la baisse : un nombre de dossiers actifs qui augmente n'est pas
  // en soi une bonne ou une mauvaise nouvelle pour l'étude (plus de dossiers = plus de charge), donc
  // aucun jugement de valeur n'est encodé dans la couleur — même principe que partout ailleurs dans
  // l'outil ("aucune couleur inventée pour l'occasion").
  function formaterTendance(ecart) {
    if (ecart > 0) return { icone: icone('trend-up', 'kpi-tendance-icone'), texte: `+${ecart}` };
    if (ecart < 0) return { icone: icone('trend-down', 'kpi-tendance-icone'), texte: `${ecart}` };
    return { icone: '', texte: '=' };
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
      checklistPieces(d.typeVente, d).some(p => (d.pieces || {})[p.cle] !== 'recue')).length;
    return { actifs: dossiersActifs.length, urgents, urgents15, manquantes, aVerifier, piecesIncompletes };
  }

  // Bandeau de synthèse en tête de l'onglet "Suivi des dossiers" : donne un état global du
  // portefeuille (dossiers actifs, hors filtres/recherche de la liste) avant de la parcourir.
  function renderStatsSuivi(dossiersActifs) {
    const bloc = document.getElementById('stats-suivi');
    if (!bloc) return;

    const { actifs, urgents, manquantes, piecesIncompletes } = calculerStatsPortefeuille(dossiersActifs);
    const tuiles = [
      ['c-neutre', actifs, actifs > 1 ? 'dossiers actifs' : 'dossier actif'],
      ['c-urgent', urgents, 'échéances ≤ 7 jours'],
      ['c-pret', manquantes, 'offres de prêts en attente'],
      ['c-pret', piecesIncompletes, 'dossiers avec pièces manquantes']
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
    const { actifs, urgents, urgents15, manquantes, piecesIncompletes } = calculerStatsPortefeuille(dossiersActifs);
    // Tendance du nombre de dossiers actifs vs le mois précédent (voir calculerEvolutionPortefeuille)
    // affichée directement à côté du chiffre plutôt qu'en dessous — demandé par l'étude. Sur TOUS
    // les dossiers (dossiers, pas dossiersActifs) puisqu'un dossier archivé aujourd'hui a pu être
    // actif il y a un mois — l'exclure fausserait la comparaison. La comparaison à l'année
    // précédente reste calculée (evolution.ecartAn) mais volontairement pas affichée pour
    // l'instant, sur demande explicite de l'étude ("ne pas afficher l'option pour l'année pour le
    // moment") — à réactiver ici le jour où elle le redemande, sans retoucher le calcul.
    const evolution = calculerEvolutionPortefeuille(dossiers);
    const tMois = formaterTendance(evolution.ecartMois);
    const tendanceMois = `<span class="kpi-tendance" title="${evolution.actuel} aujourd'hui contre ${evolution.moisDernier} il y a un mois">${tMois.icone}${tMois.texte} vs mois dernier</span>`;
    const tuiles = [
      ['c-neutre', actifs, actifs > 1 ? 'dossiers actifs' : 'dossier actif', icone('folder', 'kpi-icone'), tendanceMois],
      ['c-urgent', urgents, 'échéances ≤ 7 jours', iconeCalendrierSeuil(7), ''],
      ['c-urgent', urgents15, 'échéances ≤ 15 jours', iconeCalendrierSeuil(15), ''],
      ['c-pret', manquantes, 'offres de prêts en attente', icone('alert-triangle', 'kpi-icone'), ''],
      ['c-pret', piecesIncompletes, 'dossiers avec pièces manquantes', icone('clipboard', 'kpi-icone'), '']
    ];
    bloc.innerHTML = tuiles.map(([cls, valeur, libelle, iconeHtml, tendance]) =>
      `<div class="kpi-tile"><div class="kpi-label">${iconeHtml}${libelle}</div><div class="kpi-num-ligne"><span class="kpi-num ${cls}">${valeur}</span>${tendance}</div></div>`
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

  // Recherche de dossier depuis le tableau de bord : contrairement au Suivi (recherche-dossiers,
  // qui filtre une liste de lignes déjà affichée), le tableau de bord ne montre jamais tous les
  // dossiers — un menu de résultats s'ouvre donc sous le champ dès qu'on tape, chaque résultat
  // menant directement au tiroir du dossier via le même chemin que "Actions urgentes".
  function renderRechercheDashboard(dossiersActifs) {
    const input = document.getElementById('recherche-dashboard');
    const bloc = document.getElementById('dash-recherche-resultats');
    if (!input || !bloc) return;
    const q = normaliserPourRecherche(input.value.trim());
    if (!q) {
      bloc.style.display = 'none';
      bloc.innerHTML = '';
      return;
    }
    const resultats = dossiersActifs
      .filter(d => normaliserPourRecherche(d.nom + ' ' + (d.responsable || '')).includes(q))
      .slice(0, 8);
    bloc.innerHTML = resultats.length === 0
      ? '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>'
      : resultats.map(d => `
        <button type="button" class="dash-recherche-ligne" onclick="ouvrirDossierDepuisDashboardRecherche('${d.id}')">
          ${renderBadgeStatut(d)}
          <span class="dash-recherche-nom">${escapeHtml(d.nom)}</span>
          <span class="dash-recherche-resp">${escapeHtml(d.responsable || '')}</span>
        </button>`).join('');
    bloc.style.display = 'block';
  }

  // Vide le champ avant d'ouvrir le tiroir : sans ça, le menu de résultats resterait affiché
  // (avec la même recherche) une fois revenu sur le Tableau de bord.
  function ouvrirDossierDepuisDashboardRecherche(id) {
    const input = document.getElementById('recherche-dashboard');
    if (input) input.value = '';
    ouvrirDossierDepuisDashboard(id);
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
    document.getElementById('onglet-analyse-ia').style.display = nom === 'analyse-ia' ? '' : 'none';
    document.getElementById('tab-dashboard').setAttribute('aria-selected', String(nom === 'dashboard'));
    document.getElementById('tab-nouveau').setAttribute('aria-selected', String(nom === 'nouveau'));
    document.getElementById('tab-suivi').setAttribute('aria-selected', String(nom === 'suivi'));
    document.getElementById('tab-calculateur').setAttribute('aria-selected', String(nom === 'calculateur'));
    document.getElementById('tab-analyse-ia').setAttribute('aria-selected', String(nom === 'analyse-ia'));
    document.getElementById('tab-dashboard').classList.toggle('actif', nom === 'dashboard');
    document.getElementById('tab-nouveau').classList.toggle('actif', nom === 'nouveau');
    document.getElementById('tab-suivi').classList.toggle('actif', nom === 'suivi');
    document.getElementById('tab-calculateur').classList.toggle('actif', nom === 'calculateur');
    document.getElementById('tab-analyse-ia').classList.toggle('actif', nom === 'analyse-ia');
    if (nom === 'suivi' || nom === 'dashboard') render();
    // Vérifiée à chaque ouverture (appel léger) plutôt qu'une fois pour toutes : Ollama a pu être
    // installé/démarré/arrêté sur le serveur depuis la dernière visite de cet onglet.
    if (nom === 'analyse-ia') verifierDisponibiliteAnalyseIa();
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
      checklistPieces(d.typeVente, d).forEach(p => items.push((d.pieces || {})[p.cle] || 'inconnu'));
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
  // reconfirmer. Ne concerne plus que les dossiers locaux depuis le passage au serveur intranet
  // (le registre lui-même n'a plus besoin de cette reconfirmation, voir CLAUDE.md).
  function messageAccesAReconfirmer(nbDossiers) {
    return `${icone('key')} L'accès à ${nbDossiers} dossier${nbDossiers > 1 ? 's' : ''} local${nbDossiers > 1 ? 'aux' : ''} relié${nbDossiers > 1 ? 's' : ''} doit être reconfirmé (redemandé par le navigateur à chaque redémarrage).`;
  }

  function renderAlerteAcces(dossiersActifs) {
    const bloc = document.getElementById('alerte-acces');
    if (!bloc) return;
    const nb = dossiersActifs.filter(d => d.accesAReconfirmer).length;
    if (nb === 0) { bloc.style.display = 'none'; return; }
    bloc.style.display = 'flex';
    bloc.innerHTML = `
      <span>${messageAccesAReconfirmer(nb)}</span>
      <button type="button" class="toolbar-btn" onclick="reconfirmerTousLesAcces()">Reconfirmer tous les accès</button>
    `;
  }

  // Un seul clic déclenche une demande de permission par dossier concerné, à la suite : Chrome
  // autorise plusieurs appels de ce type tant qu'ils restent proches du geste utilisateur
  // d'origine (contrairement à des API à usage unique comme requestFullscreen). Si l'activation
  // expire avant la fin (portefeuille très volumineux), les dossiers restants gardent leur
  // bouton individuel.
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
    render();

    for (const id of idsAccordes) {
      await verifierDossierLocal(id, false);
    }
    render();
  }

  // Popup de démarrage : appelée une fois que demarrerApplication() sait réellement si un accès a
  // été perdu — pas de popup "au hasard" si tout est encore valide.
  function afficherPopupAccesSiNecessaire() {
    const nb = dossiers.filter(d => !d.archive && d.accesAReconfirmer).length;
    if (nb === 0) return;
    const el = document.getElementById('popup-acces-message');
    const overlay = document.getElementById('popup-acces-overlay');
    if (!el || !overlay) return;
    el.innerHTML = messageAccesAReconfirmer(nb);
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

  // Écran "À propos" (voir VERSION_APP/HISTORIQUE_VERSIONS en tête de fichier) : peuple la version
  // et l'historique à chaque ouverture plutôt qu'une fois au chargement, au cas — improbable mais
  // sans coût à couvrir — où ces libellés seraient un jour recalculés dynamiquement plutôt que de
  // simples constantes figées.
  function ouvrirAPropos() {
    const valeur = document.getElementById('apropos-version-valeur');
    if (valeur) valeur.textContent = VERSION_APP;
    const liste = document.getElementById('apropos-historique-liste');
    if (liste) {
      liste.innerHTML = HISTORIQUE_VERSIONS.map(h =>
        `<li><span class="apropos-historique-date">${escapeHtml(h.version)}</span> — ${escapeHtml(h.resume)}</li>`
      ).join('');
    }
    const overlay = document.getElementById('apropos-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function fermerAPropos() {
    const overlay = document.getElementById('apropos-overlay');
    if (overlay) overlay.style.display = 'none';
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
    const recherche = normaliserPourRecherche(document.getElementById('recherche-dossiers').value.trim());
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
    renderRechercheDashboard(dossiersActifs);
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
      if (recherche && !normaliserPourRecherche(d.nom + ' ' + (d.responsable || '')).includes(recherche)) return false;
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
            <th>Offre de prêt</th>
            <th class="th-triable" onclick="definirTri('echeance')">Prochaine échéance${flechesTri.echeance}</th>
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
  // Formulaire d'ajout d'une échéance personnalisée (voir renderAjoutEcheance) : un seul dossier
  // est ouvert à la fois dans le tiroir, un simple booléen suffit donc — remis à false à chaque
  // ouverture/fermeture pour ne pas laisser le formulaire ouvert sur le dossier suivant consulté.
  let ajoutEcheanceOuvert = false;

  function renderLigneTableau(d) {
    const prochaine = prochaineEcheanceDetail(d);
    const offre = !d.sansPret ? statutOffreAffichage(d) : null;
    return `
      <tr class="ligne-resume${d.archive ? ' est-archive' : ''}${dossierOuvert === d.id ? ' ligne-active' : ''}" onclick="ouvrirDossierDrawer('${d.id}')">
        <td><div class="dossier-nom-tableau">${renderBadgeStatut(d)}${escapeHtml(d.nom)}</div></td>
        <td class="dossier-responsable-tableau">${escapeHtml(d.responsable || '—')}</td>
        <td>
          ${d.sansPret ? '<span class="echeance-jours calme">Comptant — sans prêt</span>' : `<span class="dot-label ${offre.dl}"><span class="dot"></span>${offre.texte}</span>`}
          ${(!d.sansPret && d.dossierLie) ? `<button type="button" class="action-rapide" onclick="event.stopPropagation(); verifierDossierLocalDepuisBouton('${d.id}', this)">Revérifier</button>` : ''}
        </td>
        <td>
          ${prochaine
            ? `<span class="dot-label dl-${prochaine.type}"><span class="dot"></span>${escapeHtml(prochaine.label)}</span>
               <span class="echeance-jours ${prochaine.jours <= 3 ? 'urgent' : 'calme'}">${formatDateFr(prochaine.iso)} (${prochaine.jours < 0 ? 'dépassée' : prochaine.jours === 0 ? "aujourd'hui" : 'J-' + prochaine.jours})</span>`
            : '<span class="echeance-jours calme">—</span>'}
        </td>
      </tr>
    `;
  }

  // Les deux passent par render() plutôt que par renderDrawer() seul : la liste doit se redessiner
  // pour poser (ou retirer) le liseré .ligne-active sur la ligne concernée, et render() rafraîchit
  // le tiroir au passage.
  function ouvrirDossierDrawer(id) {
    dossierOuvert = id;
    ajoutEcheanceOuvert = false;
    ajoutPieceOuvert = false;
    ajoutEngagementOuvert = false;
    engagementEnEdition = null;
    render();
  }

  function fermerDossierDrawer() {
    if (!dossierOuvert) return;
    dossierOuvert = null;
    ajoutEcheanceOuvert = false;
    ajoutPieceOuvert = false;
    ajoutEngagementOuvert = false;
    engagementEnEdition = null;
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

  // Formulaire d'ajout d'une pièce personnalisée à la checklist (voir renderAjoutPiece) : même
  // principe qu'ajoutEcheanceOuvert pour les échéances — un seul dossier ouvert à la fois dans le
  // tiroir, un simple booléen suffit, remis à false à chaque ouverture/fermeture.
  let ajoutPieceOuvert = false;

  // Formulaire d'ajout d'une obligation du vendeur sur une fiche déjà enregistrée (voir
  // renderAjoutEngagement) : même principe que ajoutEcheanceOuvert/ajoutPieceOuvert.
  let ajoutEngagementOuvert = false;

  // Édition d'un engagement du vendeur déjà présent (import OU fiche enregistrée) : un seul
  // engagement en édition à la fois (dossierId null = pendant l'import, sur
  // analyseJuridiqueActuelle ; dossierId fourni = fiche enregistrée, sur d.analyseJuridique) —
  // demandé par l'étude pour corriger une clause ajoutée via l'option de surlignage sans devoir la
  // supprimer puis la ressaisir entièrement.
  let engagementEnEdition = null;

  // Détail du dernier parcours du dossier local par dossier (voir verifierDossierLocal), pour un
  // panneau de diagnostic repliable sur la fiche (renderDiagnosticParcours) — demandé après une
  // série de bugs invisibles à l'œil (accents en Unicode NFD, ordre de parcours en profondeur...)
  // qui ont chacun nécessité une relecture complète du code pour être compris : un même panneau,
  // visible directement dans l'outil, permettrait à l'étude de voir elle-même QUELS fichiers ont
  // été lus et POURQUOI une pièce reste "manquante" (jamais rencontrée vs. rencontrée mais aucun
  // nom ne correspond), avant de solliciter un nouveau diagnostic. Volontairement **en mémoire
  // seulement** (pas dans localStorage) : c'est une aide ponctuelle sur le tout dernier parcours,
  // pas une donnée du dossier à conserver d'une session à l'autre — perdu au rechargement de la
  // page, comme `pdfActuel` pendant un import. Clé = id du dossier, valeur = objet diagnostic
  // construit par verifierDossierLocal().
  let dernierDiagnosticParcours = {};

  // Checklist de constitution du dossier (voir CLAUDE.md) : contrairement à l'analyse juridique
  // (déduite des clauses du compromis), c'est une liste fixe déterminée par le type de vente, pas
  // une extraction — un dossier peut très bien n'avoir aucune pièce reconnue sans que ce soit une
  // anomalie tant qu'il n'a pas été relié à un dossier local (statut "inconnu", pas "manquante").
  // Personnalisable pour CE dossier (voir checklistPieces) : une pièce standard non pertinente peut
  // être retirée, une pièce propre au dossier peut être ajoutée — demandé par l'étude plutôt que de
  // subir la liste standard telle quelle dans les cas particuliers.
  function renderPiecesDossier(d) {
    const checklist = checklistPieces(d.typeVente, d);
    const pieces = d.pieces || {};
    const nbRecues = checklist.filter(p => pieces[p.cle] === 'recue').length;
    const complet = checklist.length > 0 && nbRecues === checklist.length;
    const libelleType = d.typeVente === 'copropriete' ? 'copropriété' : d.typeVente === 'terrain' ? 'terrain à bâtir' : 'maison';
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
            const boutonSuppr = `<button type="button" class="piece-suppr" onclick="${p.personnalisee ? `supprimerPiecePersonnalisee('${d.id}', '${p.cle}')` : `retirerPieceStandard('${d.id}', '${p.cle}', '${escapeOnclickArg(p.label)}')`}" title="Retirer cette pièce de la checklist de ce dossier" aria-label="Retirer cette pièce">${icone('x')}</button>`;
            // Uniquement pour une pièce STANDARD reçue (motifNom) : permet de revenir en arrière
            // après une correspondance trouvée à tort ou un fichier renommé depuis — voir
            // reinitialiserStatutPieceStandard(). Une pièce personnalisée a déjà son propre cycle
            // de statut au clic sur l'icône, pas besoin de ce bouton supplémentaire pour elle.
            const boutonReinit = (!p.personnalisee && (pieces[p.cle] || 'inconnu') === 'recue')
              ? `<button type="button" class="piece-reinit" onclick="reinitialiserStatutPieceStandard('${d.id}', '${p.cle}', '${escapeOnclickArg(p.label)}')" title="Réinitialiser (fichier renommé, ou mauvaise correspondance)" aria-label="Réinitialiser le statut de cette pièce">${icone('rotate-ccw')}</button>`
              : '';
            let contenu;
            if (p.personnalisee) {
              // Aucun motifNom (nom libre saisi par l'étude, pas de détection fiable possible) :
              // le statut se corrige à la main, mais désormais via DEUX zones de clic distinctes
              // plutôt qu'une seule sur toute la puce (demandé par l'étude) — cliquer sur l'icône
              // change le statut (basculerStatutPiecePersonnalisee), cliquer sur le texte rouvre
              // le fichier trouvé (ouvrirPieceTrouvee) une fois la pièce reçue (une recherche
              // automatique a pu la trouver, voir ajouterPiecePersonnalisee/chercherFichierParNom,
              // ou "Revérifier les pièces" ensuite) ; tant qu'elle n'est pas reçue, il n'y a pas de
              // fichier à ouvrir, le texte reste un simple libellé non cliquable.
              const estRecue = s.cls === 'recue';
              const iconeBtn = `<button type="button" class="piece-icone-btn" title="Cliquer pour changer le statut" aria-label="Changer le statut de « ${escapeAttr(p.label)} »" onclick="basculerStatutPiecePersonnalisee('${d.id}', '${p.cle}')"><span class="piece-icone">${s.texte}</span></button>`;
              const texteRendu = estRecue
                ? `<button type="button" class="piece-texte-btn" title="Cliquer pour ouvrir le fichier trouvé" onclick="ouvrirPieceTrouvee('${d.id}', '${p.cle}')">${escapeHtml(p.label)}</button>`
                : `<span class="piece-texte">${escapeHtml(p.label)}</span>`;
              contenu = `<span class="piece-label">${iconeBtn}${texteRendu}</span>`;
            } else if (s.cls === 'recue') {
              // Cliquable pour rouvrir directement le fichier local où la pièce a été trouvée.
              contenu = `<button type="button" class="piece-label" title="Cliquer pour ouvrir le fichier trouvé" onclick="ouvrirPieceTrouvee('${d.id}', '${p.cle}')"><span class="piece-icone">${s.texte}</span>${escapeHtml(p.label)}</button>`;
            } else {
              // Pièce auto-détectée depuis un engagement du compromis (voir PIECES_ENGAGEMENTS_AUTO) :
              // infobulle dédiée tant qu'elle n'est pas reçue, pour que l'étude comprenne d'où elle
              // vient sans avoir à deviner — elle n'a rien ajouté elle-même à cette checklist.
              const titre = p.autoEngagement
                ? "Détectée automatiquement : le compromis mentionne cet engagement d'entretien du vendeur."
                : s.titre;
              contenu = `<span class="piece-label" title="${escapeAttr(titre)}"><span class="piece-icone">${s.texte}</span>${escapeHtml(p.label)}</span>`;
            }
            return `<span class="piece-item ${s.cls}">${contenu}${boutonReinit}${boutonSuppr}</span>`;
          }).join('')}
        </div>
        ${renderAjoutPiece(d)}
      </div>
    `;
  }

  function afficherFormAjoutPiece() {
    ajoutPieceOuvert = true;
    render();
  }

  function masquerFormAjoutPiece() {
    ajoutPieceOuvert = false;
    render();
  }

  function renderAjoutPiece(d) {
    if (!ajoutPieceOuvert) {
      return `<button type="button" class="action-rapide ajout-piece-btn" onclick="afficherFormAjoutPiece()">+ Ajouter une pièce</button>`;
    }
    return `
      <div class="ajout-piece-form">
        <input type="text" id="nouvelle-piece-label" placeholder="Nom de la pièce (ex. Attestation de surface loi Carrez)">
        <button type="button" class="icon-valider" onclick="ajouterPiecePersonnalisee('${d.id}')" title="Ajouter" aria-label="Ajouter la pièce">✓</button>
        <button type="button" class="icon-btn" onclick="masquerFormAjoutPiece()">Annuler</button>
      </div>
    `;
  }

  // Panneau de diagnostic du DERNIER parcours du dossier local (voir dernierDiagnosticParcours,
  // construit par verifierDossierLocal) — répond directement à une série de bugs invisibles à l'œil
  // (accents en Unicode NFD, ordre de parcours en profondeur, pièce personnalisée jamais
  // rerecherchée...) qui ont chacun nécessité une relecture complète du code pour être compris :
  // l'étude peut désormais voir elle-même quels fichiers ont été lus et pourquoi une pièce reste
  // "manquante" (jamais rencontrée vs. rencontrée mais aucun nom ne correspond), avant de solliciter
  // un nouveau diagnostic. Repliable et FERMÉ par défaut (voir .diagnostic-parcours dans style.css) :
  // c'est un outil de dépannage ponctuel, pas un suivi actif comme les pièces/l'analyse juridique.
  // N'affiche rien tant qu'aucun parcours n'a eu lieu depuis l'ouverture de la page (état en
  // mémoire uniquement, jamais persisté — voir dernierDiagnosticParcours).
  // Trace, en lecture seule, de ce que l'extraction avait compris de l'acte au moment de l'import
  // (voir instantaneExtraction). Volontairement REPLIÉ par défaut, contrairement à l'analyse
  // juridique ou aux pièces : ce n'est pas un suivi actif mais une explication à consulter quand
  // une donnée du dossier surprend — « d'où sort cette date ? est-ce que l'outil en était sûr ? ».
  // Rien n'y est modifiable : les corrections se font dans les champs de la fiche, comme avant.
  var LIBELLES_TYPE_ACTE = {
    COMPROMIS_DE_VENTE: 'Compromis de vente',
    PROMESSE_DE_VENTE: 'Promesse de vente',
    PROMESSE_D_ACHAT: 'Promesse d’achat',
    AUTRE: 'Autre acte',
    INCONNU: 'Type non déterminé'
  };

  function renderExtractionDossier(d) {
    const extraction = d.extraction;
    const typeActe = d.typeActe;
    const parties = Array.isArray(d.parties) ? d.parties : [];
    const notaires = d.notaires;
    if (!extraction && !typeActe && parties.length === 0 && !notaires) return '';

    const statutBadge = (statut) => {
      const s = LIBELLES_STATUT_EXTRACTION[statut] || LIBELLES_STATUT_EXTRACTION.NOT_FOUND;
      return `<span class="dot-label ${s.dl}"><span class="dot"></span>${s.texte}</span>`;
    };
    const blocs = [];

    if (typeActe) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Type d’acte</span>
        <span>${escapeHtml(LIBELLES_TYPE_ACTE[typeActe.valeur] || typeActe.valeur)}</span>${statutBadge(typeActe.statut)}</div>`);
    }
    if (parties.length > 0) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Parties</span>
        <span>${parties.map(p => `${escapeHtml(p.nom)} <em>(${p.role === 'VENDEUR' ? 'vendeur' : 'acquéreur'}${p.qualiteActe ? ', désigné « ' + escapeHtml(p.qualiteActe) + ' »' : ''})</em>`).join(' · ')}</span></div>`);
    }
    if (notaires && (notaires.instrumentaire || notaires.participant)) {
      const nom = (n) => n ? `${escapeHtml(n.nom)}${n.office ? ' (' + escapeHtml(n.office) + ')' : ''}` : '—';
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Notaires</span>
        <span>Reçoit l’acte : ${nom(notaires.instrumentaire)}${notaires.participant ? ` · Participant : ${nom(notaires.participant)}` : ''}</span>${statutBadge(notaires.statut)}</div>`);
    }
    const cadastre = d.bien && d.bien.cadastre;
    if (cadastre && cadastre.section) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Cadastre</span>
        <span>Section ${escapeHtml(cadastre.section)}${cadastre.numero ? ' n° ' + escapeHtml(cadastre.numero) : ''}</span></div>`);
    }

    const LIBELLES_CHAMP_EXTRACTION = {
      nom: 'Nom du dossier', prixVente: 'Prix de vente', emailAcquereur: 'Email de l’acquéreur',
      adresseBien: 'Adresse du bien', pret: 'Obtention du prêt', acte: 'Signature de l’acte',
      ventebien: 'Vente préalable', typeVente: 'Type de vente'
    };
    const champs = (extraction && extraction.champs) || {};
    const lignesChamps = Object.keys(champs)
      .filter(cle => LIBELLES_CHAMP_EXTRACTION[cle])
      .map(cle => `<div class="extraction-ligne"><span class="extraction-libelle">${LIBELLES_CHAMP_EXTRACTION[cle]}</span>
        <span>${champs[cle].methode === 'CALCULATED' ? 'Calculée depuis un délai' : 'Lue dans l’acte'}${champs[cle].page ? ` · p.${champs[cle].page}` : ''}</span>${statutBadge(champs[cle].statut)}</div>`)
      .join('');

    const alertes = ((extraction && extraction.alertes) || []).map(a =>
      `<div class="revision-alerte ${a.gravite === 'critique' ? 'critique' : ''}">${icone('alert-triangle')}<span>${escapeHtml(a.message)}</span></div>`
    ).join('');

    return `
      <details class="extraction-dossier">
        <summary><span class="section-eyebrow">Ce que l’outil avait compris de l’acte</span></summary>
        <div class="extraction-corps">
          ${alertes}
          ${blocs.join('')}
          ${lignesChamps}
          <p class="hint">Relevé au moment de l’import, à titre d’explication : les valeurs enregistrées restent celles des champs ci-dessus, modifiables à tout moment.</p>
        </div>
      </details>
    `;
  }

  function renderDiagnosticParcours(d) {
    const diag = dernierDiagnosticParcours[d.id];
    if (!diag) return '';
    const heure = new Date(diag.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diag.resume.erreur) {
      return `
        <details class="diagnostic-parcours">
          <summary><span class="section-eyebrow">Diagnostic du dernier parcours (${heure})</span></summary>
          <div class="diagnostic-corps"><p class="diagnostic-erreur">${escapeHtml(diag.resume.erreur)}</p></div>
        </details>
      `;
    }
    const r = diag.resume;
    const lignesResume = [];
    lignesResume.push(`${r.nbFichiersRencontres} fichier${r.nbFichiersRencontres > 1 ? 's' : ''} PDF rencontré${r.nbFichiersRencontres > 1 ? 's' : ''} (sous-dossiers compris), ${r.nbAnalyses} ouvert${r.nbAnalyses > 1 ? 's' : ''} pour lire son contenu.`);
    if (r.offre) {
      lignesResume.push(`Offre de prêt : ${r.offre.trouvee ? `reconnue (${escapeHtml(r.offre.fichier)})` : 'non reconnue par le nom de fichier — vérifiez que le fichier de l\'offre porte bien "offre de prêt" (ou une variante) dans son nom.'}`);
    }
    if (r.pieces) {
      lignesResume.push(`${r.pieces.trouvees}/${r.pieces.total} pièce(s) reconnue(s)${r.pieces.manquantes.length ? ' — manquante(s) : ' + r.pieces.manquantes.map(escapeHtml).join(', ') + '.' : '.'}`);
    }
    return `
      <details class="diagnostic-parcours">
        <summary><span class="section-eyebrow">Diagnostic du dernier parcours (${heure})</span></summary>
        <div class="diagnostic-corps">
          <ul class="diagnostic-resume">${lignesResume.map(l => `<li>${l}</li>`).join('')}</ul>
          ${diag.journal.length
            ? `<ul class="diagnostic-journal">${diag.journal.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
            : '<p class="diagnostic-vide">Aucune correspondance par nom, ni lecture de contenu, lors de ce parcours.</p>'}
        </div>
      </details>
    `;
  }

  // Ajoutée avec une clé unique générée ici (pas un index de tableau, contrairement à d.autres) :
  // une pièce personnalisée peut être retirée sans décaler le statut des autres, qui restent
  // repérées par leur propre clé stable plutôt que par leur position dans la liste.
  // Recherche un fichier PDF du dossier local déjà relié dont le nom contient le texte donné (sous-
  // chaîne, insensible à la casse, sur le nom normalisé — voir normaliserNomPourMotif) : utilisée au
  // moment d'ajouter une pièce personnalisée (voir ajouterPiecePersonnalisee), pour ne pas obliger
  // l'étude à ressaisir un motifNom qu'elle n'a de toute façon pas les moyens d'écrire elle-même —
  // le nom qu'elle tape pour la pièce sert directement de motif de recherche.
  async function chercherFichierParNom(handleDossier, texteRecherche) {
    const cible = texteRecherche.toLowerCase();
    const compteur = { n: 0 };
    for await (const entree of fichiersPdfRecursifs(handleDossier, 0, compteur)) {
      if (normaliserNomPourMotif(entree.name).toLowerCase().includes(cible)) return entree;
    }
    return null;
  }

  async function ajouterPiecePersonnalisee(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const input = document.getElementById('nouvelle-piece-label');
    const label = input ? input.value.trim() : '';
    if (!label) { if (input) input.focus(); return; }
    d.piecesPersonnalisees = d.piecesPersonnalisees || [];
    const cle = 'perso-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    d.piecesPersonnalisees.push({ cle, label });
    ajouterHistorique(d, `Pièce ajoutée à la checklist : « ${label} »`);
    ajoutPieceOuvert = false;
    sauvegarder(d);
    render();

    // Recherche automatique dans le dossier local déjà relié, s'il y en a un — silencieuse si
    // l'accès n'est pas déjà accordé (queryPermission seul, jamais requestPermission ici : ce
    // n'est pas le geste dédié à la reconfirmation d'accès, pas la peine d'en déclencher un
    // nouveau juste pour l'ajout d'une pièce). La pièce reste "à vérifier" dans ce cas, comme
    // n'importe quelle pièce de la checklist avant liaison/reconfirmation.
    if (DOSSIER_FS_SUPPORTE && d.dossierLie) {
      try {
        const handle = await recupererHandle(dossierId);
        if (handle && await handle.queryPermission({ mode: 'read' }) === 'granted') {
          const trouve = await chercherFichierParNom(handle, label);
          if (trouve) {
            d.pieces = d.pieces || {};
            d.pieces[cle] = 'recue';
            await enregistrerHandle(CLE_HANDLE_PIECE(dossierId, cle), trouve);
            sauvegarder(d);
            render();
            afficherToast(`Pièce « ${label} » trouvée : ${trouve.name}`, 'OK', null);
          }
        }
      } catch (e) {
        console.error('Recherche automatique de la pièce personnalisée impossible', e);
      }
    }
  }

  function supprimerPiecePersonnalisee(dossierId, cle) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.piecesPersonnalisees) return;
    const item = d.piecesPersonnalisees.find(p => p.cle === cle);
    if (!item) return;
    demanderConfirmation(`Retirer la pièce « ${item.label} » de la checklist de ce dossier ?`, () => {
      d.piecesPersonnalisees = d.piecesPersonnalisees.filter(p => p.cle !== cle);
      if (d.pieces) delete d.pieces[cle];
      ajouterHistorique(d, `Pièce retirée de la checklist : « ${item.label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Signalé par l'étude : une pièce standard reconnue automatiquement (motifNom) par erreur, ou
  // dont le fichier a ensuite été renommé (le vrai document ne correspond alors plus au nom
  // mémorisé), restait bloquée "reçue" indéfiniment — verifierDossierLocal() ne recherche que les
  // pièces PAS déjà "recue" (voir `aChercher`), donc "Revérifier" n'y touchait plus jamais. Remet
  // la pièce à "manquante" (repasse dans `aChercher` au prochain parcours) et efface le handle
  // mémorisé du fichier trouvé à tort (même mécanisme que lierDossierLocal() qui l'efface déjà à
  // chaque nouvelle liaison de dossier) — sans quoi le bouton "ouvrir le fichier trouvé"
  // continuerait de rouvrir l'ancien fichier le temps qu'une nouvelle correspondance soit trouvée.
  // Uniquement pour une pièce à motifNom (reconnue automatiquement) : une pièce personnalisée a
  // déjà son propre cycle de statut au clic (basculerStatutPiecePersonnalisee), pas besoin de ce
  // bouton pour elle.
  function reinitialiserStatutPieceStandard(dossierId, cle, label) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    demanderConfirmation(`Réinitialiser le statut de « ${label} » ? Elle repassera à "manquante" et sera recherchée à nouveau au prochain "Revérifier". Ce nom de fichier ne sera plus jamais proposé pour cette pièce, sur aucun dossier.`, async () => {
      d.pieces = d.pieces || {};
      d.pieces[cle] = 'manquante';
      // Apprentissage de l'erreur (voir exclureNomPourPiece ci-dessus) : avant d'effacer le handle,
      // on retrouve le nom du fichier mal reconnu pour ne plus jamais le reproposer pour CETTE
      // pièce, sur AUCUN dossier — portée choisie explicitement par l'étude, plus large qu'une
      // simple exclusion propre à ce seul dossier.
      const ancienHandle = await recupererHandle(CLE_HANDLE_PIECE(dossierId, cle));
      if (ancienHandle && ancienHandle.name) {
        exclureNomPourPiece(cle, normaliserNomPourMotif(ancienHandle.name));
      }
      await enregistrerHandle(CLE_HANDLE_PIECE(dossierId, cle), null);
      ajouterHistorique(d, `Pièce réinitialisée (correspondance retirée) : « ${label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Une pièce STANDARD ne peut pas être supprimée des listes PIECES_* (partagées par tous les
  // dossiers du même type de vente) : la "retirer" pour ce dossier précis l'ajoute simplement à
  // d.piecesRetirees, qui la masque de checklistPieces() pour ce seul dossier — voir son
  // historique dans CLAUDE.md.
  function retirerPieceStandard(dossierId, cle, label) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    demanderConfirmation(`Retirer la pièce « ${label} » de la checklist de ce dossier ?`, () => {
      d.piecesRetirees = d.piecesRetirees || [];
      if (!d.piecesRetirees.includes(cle)) d.piecesRetirees.push(cle);
      ajouterHistorique(d, `Pièce retirée de la checklist : « ${label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Retire un engagement du vendeur de l'analyse juridique d'un dossier DÉJÀ ENREGISTRÉ (voir
  // renderEngagement/renderCarteDossier) — demandé par l'étude : jusqu'ici seuls les engagements
  // ajoutés à la main pendant l'import étaient retirables (supprimerEngagementManuel), et
  // seulement pendant l'import. Confirmation + entrée d'historique, comme retirerPieceStandard()
  // ci-dessus : contrairement à un retrait pendant l'import (réversible en réimportant le PDF),
  // c'est ici une modification d'un dossier déjà sauvegardé.
  function supprimerEngagementDossier(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.analyseJuridique || !d.analyseJuridique.engagements[index]) return;
    const e = d.analyseJuridique.engagements[index];
    const phrase = typeof e === 'string' ? e : e.phrase;
    demanderConfirmation('Retirer cet engagement du vendeur de l’analyse juridique ?', () => {
      d.analyseJuridique.engagements.splice(index, 1);
      ajouterHistorique(d, `Engagement du vendeur retiré de l'analyse : « ${phrase.slice(0, 80)} »`);
      sauvegarder(d);
      render();
    });
  }

  // Pendant du précédent pour un document identifié (voir renderDocBadge) — nouvelle capacité,
  // rien n'était retirable de cette liste jusqu'ici, ni à l'import ni sur une fiche enregistrée.
  // Volontairement découplé de la checklist de pièces du dossier (d.piecesEngagementsDetectees) :
  // ce n'est qu'une liste d'affichage de l'analyse, pas la checklist elle-même, qui a déjà son
  // propre mécanisme de retrait (retirerPieceStandard()/croix sur .piece-item).
  function supprimerDocumentDossier(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.analyseJuridique || !d.analyseJuridique.documents[index]) return;
    const doc = d.analyseJuridique.documents[index];
    const label = typeof doc === 'string' ? doc : doc.label;
    demanderConfirmation(`Retirer « ${label} » de la liste des documents identifiés ?`, () => {
      d.analyseJuridique.documents.splice(index, 1);
      ajouterHistorique(d, `Document retiré de l'analyse juridique : « ${label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Cycle inconnu → manquante → reçue → inconnu, sans entrée d'historique (une simple case à
  // cocher répétée n'a pas besoin d'être journalisée, contrairement à un changement structurel du
  // dossier) — seul mécanisme de mise à jour possible pour une pièce personnalisée, qui n'a pas de
  // motifNom permettant une détection automatique dans le dossier local.
  function basculerStatutPiecePersonnalisee(dossierId, cle) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    d.pieces = d.pieces || {};
    const actuel = d.pieces[cle] || 'inconnu';
    d.pieces[cle] = actuel === 'inconnu' ? 'manquante' : actuel === 'manquante' ? 'recue' : 'inconnu';
    sauvegarder(d);
    render();
  }

  function renderCarteDossier(d) {
      const confiance = d.confiance || {};
      const historique = d.historique || [];
      const analyse = d.analyseJuridique || { documents: [], engagements: [], conditions: [] };
      const analyseConditions = analyse.conditions || [];
      // "Ouvrir le compromis" et "Changer de dossier"/"Lier un dossier local" reprennent tous les
      // deux le design de "+ Ajouter une pièce" (.action-rapide) — demandé par l'étude, cohérent
      // avec les autres actions rapides de la fiche (Revérifier...) plutôt que l'ancien style de
      // lien souligné (.lien-dossier-local, retiré). Voir ouvrirCompromisTrouve() : contrairement
      // à l'offre/aux pièces, ce document n'est cherché qu'à la demande, pas par
      // verifierDossierLocal() (le compromis n'est pas une pièce de la checklist).
      const boutonOuvrirCompromis = DOSSIER_FS_SUPPORTE
          ? `<button type="button" class="action-rapide" onclick="ouvrirCompromisTrouve('${d.id}', this)" title="Rechercher et ouvrir le PDF du compromis dans le dossier local relié">${icone('file-text')} Ouvrir le compromis</button>`
          : '';
      const boutonsDossierLocal = DOSSIER_FS_SUPPORTE ? (d.dossierLie
          ? `<button type="button" class="action-rapide" onclick="changerDossierLocal('${d.id}')">Changer de dossier</button>`
          // Même sans prêt (achat comptant), le dossier local reste nécessaire pour suivre
          // la checklist de pièces (urbanisme...) — voir renderPiecesDossier ci-dessous.
          : `<button type="button" class="action-rapide" onclick="lierDossierLocal('${d.id}')">${icone('link')} Lier un dossier local</button>`) : '';
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
          ${boutonsDossierLocal ? `<div class="dossier-lien-local-ligne">${boutonOuvrirCompromis}${boutonsDossierLocal}</div>` : ''}

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
                <option value="maison" ${d.typeVente === 'maison' || !d.typeVente ? 'selected' : ''}>Maison</option>
                <option value="copropriete" ${d.typeVente === 'copropriete' ? 'selected' : ''}>Copropriété</option>
                <option value="terrain" ${d.typeVente === 'terrain' ? 'selected' : ''}>Terrain à bâtir</option>
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
          ${renderTab('pret', 'Obtention du prêt', d.pret, d.id, d.pretPage, confiance.pret, null, d.offrePretStatut === 'recue', offreBloc, d.sansPret)}
          ${renderTab('acte', 'Signature de l\u2019acte', d.acte, d.id, d.actePage, confiance.acte)}
          ${d.ventebien ? renderTab('ventebien', 'Vente préalable', d.ventebien, d.id, d.ventebienPage, confiance.ventebien) : ''}
          ${(d.autres || []).map((a, i) => renderTab('autre', escapeHtml(a.label), a.date, d.id, a.page, null, i)).join('')}
        </div>
        ${renderAjoutEcheance(d)}
        ${d.roleNotaire !== 'participant' ? renderPiecesDossier(d) : ''}
        ${renderDiagnosticParcours(d)}
        ${renderAjoutEngagement(d)}
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
                ${analyse.engagements.map((e, i) => renderEngagement(e, i, d.id)).join('')}
              </div>
            ` : ''}
            <div class="analyse-section">
              <div class="analyse-sous-titre">Documents et pièces identifiés <span class="analyse-compteur">${analyse.documents.length}</span></div>
              <div class="analyse-documents-liste">
                ${analyse.documents.length > 0
                  ? analyse.documents.map((doc, i) => renderDocBadge(doc, i, d.id)).join('')
                  : '<span class="analyse-vide">Aucun document type reconnu automatiquement.</span>'}
              </div>
            </div>
          </details>
        ` : ''}
        ${renderExtractionDossier(d)}
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
  // escapeHtml) : pour un attribut HTML ORDINAIRE (title="...", value="...", aria-label="...") —
  // pas pour un argument JS à l'intérieur d'un gestionnaire onclick="...", voir escapeOnclickArg()
  // juste en dessous et l'historique du bug qui explique pourquoi les deux ne sont PAS
  // interchangeables malgré des symptômes très proches.
  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  // Échappement dédié à un argument JS interpolé DANS un attribut onclick="..." délimité par des
  // apostrophes (ex. onclick="fonction('id', 'cle', '${escapeOnclickArg(p.label)}')").
  // Bug corrigé, en deux temps : un premier correctif (voir l'historique git) avait fait
  // remplacer l'apostrophe par l'entité HTML &#39; dans escapeAttr() — apparemment correct à
  // toutes les vérifications faites à l'époque (relecture du code, rendu en bac à sable, deux
  // binaires .exe publiés inspectés, et même la réponse réseau de script.js relue dans le
  // navigateur) et pourtant TOUJOURS sans effet en conditions réelles sur "Certificat
  // d'urbanisme"/"Certificat d'alignement" (aucune popup de confirmation au clic sur la croix).
  // Cause réelle, jamais identifiée par ces vérifications parce qu'aucune d'elles ne rejouait le
  // parsing du navigateur : un attribut onclick="..." est décodé EN DEUX TEMPS — d'abord comme du
  // HTML (les entités comme &#39; sont résolues en leur caractère, ici ' à nouveau), PUIS le texte
  // ainsi décodé est exécuté comme du JS. &#39; redevient donc une apostrophe BRUTE avant même que
  // le moteur JS ne voie l'attribut — elle referme le même argument JS qu'avant ce premier
  // correctif, exactement le même bug, juste masqué à la lecture du code source (qui ne montre
  // que le texte AVANT ce second décodage HTML implicite). La seule échappement qui survit aux
  // DEUX passes est l'échappement JS lui-même (\' — un antislash n'a aucun sens spécial en HTML,
  // il traverse le premier décodage intact, et forme ensuite une séquence d'échappement JS valide
  // pour le second). `escapeAttr()` reste correcte telle quelle pour un attribut HTML ORDINAIRE
  // (title, value...) qui n'est jamais réinterprété comme du JS — seul ce cas précis (un argument
  // JS DANS un gestionnaire onclick) a besoin de cette échappement différente.
  function escapeOnclickArg(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
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
      sauvegarder(d);
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
        sauvegarder(d);
      }
    } else if (nouvelleDate !== (d[cle] || '')) {
      ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[cle]} » modifiée : ${d[cle] ? formatDateFr(d[cle]) : 'non renseignée'} → ${nouvelleDate ? formatDateFr(nouvelleDate) : 'non renseignée'}`);
      d[cle] = nouvelleDate || '';
      d.confiance = d.confiance || {};
      d.confiance[cle] = 'manuel'; // corrigée à la main : à revérifier comme toute saisie manuelle
      // Symétrique de supprimerDateEcheance (qui passe sansPret à true en vidant cette date) : si
      // une date de prêt est saisie sur un dossier jusque-là "sans prêt", le suivi de l'offre doit
      // reprendre — sans ce basculement, d.sansPret restait bloqué à true indéfiniment, malgré une
      // vraie date désormais renseignée (verifierDossierLocal()/la checklist continuaient d'ignorer
      // le prêt).
      if (cle === 'pret') d.sansPret = !nouvelleDate;
      sauvegarder(d);
    }
    render();
  }

  // Ajouter une échéance personnalisée APRÈS l'enregistrement du dossier (pas seulement à la
  // création, via autresEnCours/renderAutres) : demandé par l'étude, un délai/une obligation
  // repérée après coup (ex. à la lecture d'un avenant) doit pouvoir être ajoutée sans repasser par
  // le wizard. Un simple bouton "+ Ajouter une échéance" bascule vers un mini-formulaire inline
  // (même structure .date-block.autre/.autre-row que le formulaire de création, réutilisée telle
  // quelle plutôt que dupliquée) — voir renderAjoutEcheance(), appelé juste sous .tabs.
  function afficherFormAjoutEcheance() {
    ajoutEcheanceOuvert = true;
    render();
  }

  function masquerFormAjoutEcheance() {
    ajoutEcheanceOuvert = false;
    render();
  }

  function ajouterEcheanceApresCoup(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const labelInput = document.getElementById('nouvelle-echeance-label');
    const dateInput = document.getElementById('nouvelle-echeance-date');
    const label = (labelInput && labelInput.value.trim()) || 'Autre échéance';
    const iso = dateInput ? dateInput.value : '';
    if (!iso) { if (dateInput) dateInput.focus(); return; } // une échéance sans date n'a pas de sens ici
    d.autres = d.autres || [];
    d.autres.push({ label, date: iso, page: null });
    ajouterHistorique(d, `Échéance « ${label} » ajoutée (${formatDateFr(iso)})`);
    ajoutEcheanceOuvert = false;
    sauvegarder(d);
    render();
  }

  // Pendant du bouton "+ Ajouter une échéance" ci-dessus : ne concerne que les échéances
  // personnalisées (croix visible uniquement sur les tabs "autre", voir renderTab) — une entrée de
  // d.autres est réellement retirée du tableau. Obtention du prêt/Signature de l'acte/Vente
  // préalable ne sont jamais retirées du modèle (voir supprimerDateEcheance juste en dessous, qui
  // vide seulement leur date).
  function supprimerEcheanceAutre(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.autres || !d.autres[index]) return;
    const item = d.autres[index];
    demanderConfirmation(`Supprimer l'échéance « ${item.label || 'Autre échéance'} » ?`, () => {
      d.autres.splice(index, 1);
      ajouterHistorique(d, `Échéance « ${item.label || 'Autre échéance'} » supprimée`);
      sauvegarder(d);
      render();
    });
  }

  // Bouton de suppression dédié pour une date butoir fixe (pret/acte/ventebien), demandé par
  // l'étude en plus de la correction déjà possible via le crayon (qui permet aussi de vider le
  // champ date natif puis valider — mais rien n'indiquait que c'était possible, ni ne le
  // confirmait). Contrairement à supprimerEcheanceAutre, la tab elle-même n'est pas retirée du
  // modèle : seule sa date repart à vide (déjà le cas d'affichage pour "Non renseigné" sur un
  // dossier créé sans cette échéance active — voir renderTab).
  function supprimerDateEcheance(dossierId, type) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d[type]) return;
    demanderConfirmation(`Supprimer la date « ${LIBELLES_CATEGORIE[type]} » ?`, () => {
      d[type] = '';
      d.confiance = d.confiance || {};
      d.confiance[type] = null;
      // Supprimer la date de prêt équivaut à "sans prêt" (voir d.sansPret, déjà la seule source de
      // vérité utilisée partout ailleurs — checklist de pièces, badges, verifierDossierLocal...) :
      // sans ce basculement, une recherche locale de l'offre aurait continué pour une condition
      // qui n'est plus suivie sur ce dossier (verifierDossierLocal() teste déjà `!d.sansPret`).
      if (type === 'pret') d.sansPret = true;
      ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[type]} » supprimée`);
      sauvegarder(d);
      render();
    });
  }

  function renderAjoutEcheance(d) {
    if (!ajoutEcheanceOuvert) {
      return `<button type="button" class="action-rapide ajout-echeance-btn" onclick="afficherFormAjoutEcheance()">+ Ajouter une échéance</button>`;
    }
    return `
      <div class="date-block autre ajout-echeance-form">
        <div class="autre-row">
          <input type="text" id="nouvelle-echeance-label" placeholder="Nom de l'échéance (ex. Levée de la condition suspensive travaux)">
          <input type="date" id="nouvelle-echeance-date">
          <button type="button" class="icon-valider" onclick="ajouterEcheanceApresCoup('${d.id}')" title="Ajouter" aria-label="Ajouter l'échéance">✓</button>
          <button type="button" class="icon-btn" onclick="masquerFormAjoutEcheance()">Annuler</button>
        </div>
      </div>
    `;
  }

  // Ajouter une obligation du vendeur sur une fiche DÉJÀ ENREGISTRÉE, demandé par l'étude — jusqu'ici
  // seule la sélection de texte dans le PDF (pendant l'import) ou le bouton "+ Ajouter un engagement
  // du vendeur" du wizard permettaient d'en consigner une, jamais sur un dossier rouvert plus tard
  // (un accord oral rapporté après coup, ou une clause repérée en relisant l'acte a posteriori).
  // Même principe que renderAjoutEcheance/renderAjoutPiece : un bouton toujours visible qui bascule
  // vers un mini-formulaire inline, piloté par ajoutEngagementOuvert (un seul dossier ouvert à la
  // fois dans le tiroir, un simple booléen suffit).
  function afficherFormAjoutEngagementDossier() {
    ajoutEngagementOuvert = true;
    render();
  }

  function masquerFormAjoutEngagementDossier() {
    ajoutEngagementOuvert = false;
    render();
  }

  // Alimente aussi l'apprentissage (memoriserCorrection, catégorie 'engagement') : une obligation
  // ajoutée à la main sur une fiche déjà enregistrée est, comme une clause ajoutée pendant l'import,
  // un signal utile pour reconnaître une formulation proche au prochain compromis — même principe
  // déjà appliqué à ajouterEngagementManuel()/ajouterEngagementDepuisFormulaire() et à
  // validerEditionEngagement().
  function ajouterEngagementDossierApresCoup(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    // Ids distincts du formulaire équivalent du wizard (#nouvel-engagement-type/-texte, voir
    // index.html) : ce dernier reste en permanence dans le DOM (masqué par style.display, jamais
    // retiré) — deux éléments partageant le même id auraient fait retomber getElementById() sur le
    // MAUVAIS formulaire (celui du wizard, apparaissant en premier dans le document), pas sur celui
    // réellement affiché dans le tiroir.
    const typeEl = document.getElementById('nouvelle-obligation-dossier-type');
    const texteEl = document.getElementById('nouvelle-obligation-dossier-texte');
    const type = typeEl ? typeEl.value : 'document';
    const phrase = texteEl ? texteEl.value.trim() : '';
    if (!phrase) { if (texteEl) texteEl.focus(); return; }
    d.analyseJuridique = d.analyseJuridique || { documents: [], engagements: [], conditions: [] };
    d.analyseJuridique.engagements = d.analyseJuridique.engagements || [];
    d.analyseJuridique.engagements.push({ phrase, type, page: null, manuel: true });
    ajouterHistorique(d, `Obligation du vendeur ajoutée : « ${phrase.slice(0, 80)}${phrase.length > 80 ? '…' : ''} »`);
    memoriserCorrection(phrase, type, null, 'engagement');
    ajoutEngagementOuvert = false;
    sauvegarder(d);
    render();
  }

  function renderAjoutEngagement(d) {
    if (!ajoutEngagementOuvert) {
      return `<button type="button" class="action-rapide ajout-engagement-btn" onclick="afficherFormAjoutEngagementDossier()">+ Ajouter une obligation du vendeur</button>`;
    }
    return `
      <div class="date-block autre ajout-engagement-form">
        <div class="autre-row">
          <select id="nouvelle-obligation-dossier-type">
            <option value="entretien">Entretien</option>
            <option value="travaux">Travaux</option>
            <option value="document" selected>Document</option>
            <option value="autre">Autres</option>
          </select>
          <textarea id="nouvelle-obligation-dossier-texte" rows="2" placeholder="Clause exacte, ou description de l'obligation"></textarea>
          <button type="button" class="icon-valider" onclick="ajouterEngagementDossierApresCoup('${d.id}')" title="Ajouter" aria-label="Ajouter l'obligation">✓</button>
          <button type="button" class="icon-btn" onclick="masquerFormAjoutEngagementDossier()">Annuler</button>
        </div>
      </div>
    `;
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

  // Limité à la seule date d'obtention du prêt (demandé explicitement par l'étude) : les autres
  // échéances (acte, vente préalable, personnalisées) n'y figurent plus, contrairement à la
  // première version de cet export qui générait un événement par échéance active du dossier.
  function telechargerICS(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    // Plus rien à exporter pour ce dossier (sans prêt, ou date de prêt supprimée/jamais
    // renseignée) : un .ics vide (juste l'en-tête VCALENDAR, sans VEVENT) serait un échec
    // silencieux — voir la contrainte n°5 de CLAUDE.md sur les messages invisibles.
    if (!d.pret) {
      afficherToast("Aucune date d'obtention du prêt renseignée pour ce dossier : rien à exporter.", 'OK', null);
      return;
    }
    const nomAcquereur = extraireNomAcquereur(d.nom);
    const suffixeTitre = ` — ${nomAcquereur} - Dossier ${d.nom}`;
    let body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Registre des echeances//FR\r\nCALSCALE:GREGORIAN\r\n';
    body += buildEvent(d.id + '-pret', `Obtention du prêt${suffixeTitre}`, d.pret, d.reminderDays);
    body += 'END:VCALENDAR\r\n';

    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = d.nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    // Format demandé par l'étude : rappel_echeance_<nom du dossier>.ics.
    a.download = `rappel_echeance_${safeName || 'dossier'}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    afficherInfoAction(
      'Fichier .ics téléchargé',
      "À importer dans Outlook (ou votre agenda) : il crée un événement pour l'obtention du prêt, avec ses rappels."
    );
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
    afficherInfoAction(
      "Brouillon d'email ouvert",
      "L'envoi final reste un clic manuel dans votre messagerie : rien n'est envoyé automatiquement."
    );
  }

  // ---- persistence (serveur intranet) ----
  //
  // Remplace l'ancien mécanisme localStorage + registre partagé JSON (voir l'historique dans
  // CLAUDE.md) : le serveur (server/, branche claude/serveur-intranet) est désormais la SEULE
  // source de vérité, avec une authentification par mot de passe partagé unique. Plus de repli
  // local : sans serveur joignable, l'outil ne peut pas fonctionner (décision explicite, voir le
  // plan de ce chantier).

  const CLE_AUTH_TOKEN = 'claire-token';
  let authToken = null;
  // Curseur de synchro (epoch ms renvoyé par le serveur) : le polling ne redemande que ce qui a
  // changé depuis cette valeur, jamais une horloge cliente (voir GET /api/dossiers?since=).
  let curseurSynchro = 0;

  function chargerJetonStocke() {
    try { return localStorage.getItem(CLE_AUTH_TOKEN) || null; } catch (e) { return null; }
  }

  function stockerJeton(jeton) {
    authToken = jeton;
    try {
      if (jeton) localStorage.setItem(CLE_AUTH_TOKEN, jeton);
      else localStorage.removeItem(CLE_AUTH_TOKEN);
    } catch (e) { /* jeton reperdu au rechargement si le stockage échoue — sans autre conséquence */ }
  }

  // Point de passage unique pour tout appel à l'API du serveur : ajoute le jeton de session, et
  // réaffiche l'écran de connexion dès qu'une réponse 401 signale une session expirée/invalide
  // (mot de passe changé, jeton périmé après 12h — voir server/src/auth.js).
  async function fetchAvecAuth(url, options = {}) {
    const reponse = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), authorization: `Bearer ${authToken}` }
    });
    if (reponse.status === 401) {
      stockerJeton(null);
      arreterPolling();
      afficherEcranConnexion();
      throw new Error('Session expirée — reconnexion nécessaire.');
    }
    return reponse;
  }

  function afficherEcranConnexion(messageErreur) {
    const overlay = document.getElementById('connexion-overlay');
    const erreurEl = document.getElementById('connexion-erreur');
    if (erreurEl) {
      erreurEl.textContent = messageErreur || '';
      erreurEl.style.display = messageErreur ? 'block' : 'none';
    }
    if (overlay) overlay.style.display = 'flex';
    const input = document.getElementById('connexion-mot-de-passe');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 0); }
  }

  function fermerEcranConnexion() {
    const overlay = document.getElementById('connexion-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function tenterConnexion() {
    const input = document.getElementById('connexion-mot-de-passe');
    const motDePasse = input ? input.value : '';
    if (!motDePasse) return;
    const btn = document.getElementById('connexion-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }
    try {
      const reponse = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ motDePasse })
      });
      if (!reponse.ok) {
        afficherEcranConnexion('Mot de passe incorrect.');
        return;
      }
      const { jeton } = await reponse.json();
      stockerJeton(jeton);
      fermerEcranConnexion();
      await demarrerApplication();
    } catch (e) {
      console.error('Connexion au serveur impossible', e);
      afficherEcranConnexion("Serveur injoignable — vérifiez la connexion au réseau de l'étude.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
    }
  }

  // Premier chargement : `since=0` renvoie tous les dossiers actifs (voir server/src/routes/
  // dossiers.js) — jamais de tombstone à ce stade puisqu'on part d'un registre vide côté client.
  async function charger() {
    const reponse = await fetchAvecAuth('/api/dossiers?since=0');
    const { dossiers: recus, serverTime } = await reponse.json();
    dossiers = recus
      .filter(d => d && typeof d === 'object' && d.id && !d.deleted)
      .map(({ updatedAt, ...d }) => d); // updatedAt est une métadonnée serveur, pas un champ du modèle
    curseurSynchro = serverTime;
    render();
  }

  // Remplacement complet d'UN dossier déjà enregistré (PUT) — chaque site d'appel a déjà `d` en
  // portée juste après l'avoir modifié, voir les ~25 call sites qui suivent dans ce fichier.
  // N'échoue jamais bruyamment côté appelant (pas de throw) : ceux-ci font juste `sauvegarder(d);
  // render();` sans awaiter ni intercepter d'erreur, comme au temps du localStorage — une panne
  // réseau se retrouvera simplement rattrapée par le prochain PUT réussi (le brouillon en mémoire
  // reste correct, seule la synchro serveur retarde).
  async function sauvegarder(d) {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(d.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(d)
      });
      if (reponse.ok) {
        const sauvegarde = await reponse.json();
        curseurSynchro = Math.max(curseurSynchro, sauvegarde.updatedAt || 0);
      } else {
        console.error('Sauvegarde refusée par le serveur', reponse.status);
      }
    } catch (e) {
      console.error('Sauvegarde impossible (serveur injoignable ?)', e);
    }
  }

  // Création (POST) — seule différence avec sauvegarder() : le serveur doit savoir qu'il s'agit
  // d'un nouveau dossier, pas d'un remplacement. Renvoie true/false pour que l'appelant (
  // ajouterDossier(), importerDonnees()) sache s'il doit vraiment ajouter le dossier à `dossiers`
  // ou prévenir l'utilisateur d'un échec (id en double, serveur injoignable...).
  async function sauvegarderNouveauDossier(d) {
    try {
      const reponse = await fetchAvecAuth('/api/dossiers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(d)
      });
      if (reponse.ok) {
        const sauvegarde = await reponse.json();
        curseurSynchro = Math.max(curseurSynchro, sauvegarde.updatedAt || 0);
        return true;
      }
      console.error('Création refusée par le serveur', reponse.status);
      return false;
    } catch (e) {
      console.error('Création impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  async function supprimerDossierServeur(id) {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return reponse.ok;
    } catch (e) {
      console.error('Suppression impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  async function restaurerDossierServeur(id) {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(id)}/undelete`, { method: 'POST' });
      return reponse.ok;
    } catch (e) {
      console.error('Restauration impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  // ---- synchro par polling (voir le plan : WebSocket écarté, 3 utilisateurs sur un LAN ne
  // justifient pas la complexité d'une connexion persistante) ----

  const INTERVALLE_POLLING_MS = 7000;
  let intervallePolling = null;

  function demarrerPolling() {
    arreterPolling();
    intervallePolling = setInterval(sondagePeriodique, INTERVALLE_POLLING_MS);
  }

  function arreterPolling() {
    if (intervallePolling) { clearInterval(intervallePolling); intervallePolling = null; }
  }

  // Pas la peine de solliciter le serveur pendant qu'un onglet est masqué/minimisé — reprend
  // aussitôt (avec un sondage immédiat, pas d'attente du prochain tick) dès qu'il redevient visible.
  function gererVisibilitePolling() {
    if (document.hidden) {
      arreterPolling();
    } else if (authToken) {
      sondagePeriodique();
      demarrerPolling();
    }
  }
  document.addEventListener('visibilitychange', gererVisibilitePolling);

  function appliquerChangementsDistants(changements) {
    for (const item of changements) {
      const index = dossiers.findIndex(x => x.id === item.id);
      if (item.deleted) {
        if (index !== -1) dossiers.splice(index, 1);
        continue;
      }
      const { updatedAt, ...d } = item;
      if (index !== -1) dossiers[index] = d; else dossiers.push(d);
    }
  }

  // Reflète dans la sidebar si le dernier sondage a bien atteint le serveur — sans ça, un serveur
  // arrêté/injoignable (câble débranché, poste hébergeur éteint...) ne se voyait qu'indirectement,
  // en constatant qu'un dossier créé par un collègue n'apparaissait jamais. `statutServeurConnecte`
  // évite d'écrire dans le DOM à chaque sondage (toutes les 7s) quand rien n'a changé.
  let statutServeurConnecte = true;
  function majStatutServeur(connecte) {
    if (connecte === statutServeurConnecte) return;
    statutServeurConnecte = connecte;
    const badge = document.getElementById('statut-serveur-badge');
    if (!badge) return;
    badge.className = 'dot-label ' + (connecte ? 'dl-success' : 'dl-urgent');
    badge.innerHTML = '<span class="dot"></span>' + (connecte ? 'Connecté' : 'Hors ligne');
    badge.title = connecte
      ? ''
      : 'Le serveur ne répond plus — vérifiez qu\'il tourne toujours sur le poste hébergeur. Les modifications faites ici seront synchronisées dès que la connexion revient.';
  }

  async function sondagePeriodique() {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers?since=${curseurSynchro}`);
      if (!reponse.ok) { majStatutServeur(false); return; }
      const { dossiers: changements, serverTime } = await reponse.json();
      if (changements.length > 0) {
        appliquerChangementsDistants(changements);
        render();
      }
      curseurSynchro = serverTime;
      majStatutServeur(true);
    } catch (e) {
      // Une session expirée (401) est déjà gérée par fetchAvecAuth (jeton effacé, écran de
      // connexion réaffiché, polling arrêté) — pas la peine d'afficher "Hors ligne" par-dessus,
      // ce n'est pas un problème de connexion réseau. authToken redevient null dans ce cas
      // précis : ne signaler l'indisponibilité que si ce n'est PAS la cause de cet échec.
      if (authToken) majStatutServeur(false);
    }
  }

  // Séquence complète une fois authentifié : dossiers, puis les vérifications déjà existantes
  // (dossiers locaux liés, popup d'accès à reconfirmer), puis démarrage du polling.
  async function demarrerApplication() {
    await charger();
    await revérifierDossiersLiesAuDemarrage();
    afficherPopupAccesSiNecessaire();
    demarrerPolling();
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
  // aucune ne dépasse le seuil de similarité. `categorie` distingue les DEUX espaces de
  // classification qui partagent ce même mécanisme (voir memoriserCorrection ci-dessous) : 'date'
  // (type d'échéance pret/acte/ventebien/autre — usage d'origine) et 'engagement' (type
  // d'obligation du vendeur entretien/travaux/document/autre — généralisation demandée par
  // l'étude, voir CLAUDE.md "Apprentissage sur les clauses ajoutées manuellement"). Sans ce filtre,
  // une clause de délai de prêt et une clause d'engagement d'entretien pourraient se confondre par
  // pur hasard de vocabulaire commun et se substituer l'une à l'autre — deux espaces disjoints,
  // jamais comparés entre eux. Une entrée mémorisée AVANT cette distinction (pas de champ
  // `categorie`) est traitée comme 'date', son seul usage jusque-là.
  function trouverCorrectionApprise(contexte, categorie) {
    categorie = categorie || 'date';
    if (correctionsApprises.length === 0) return null;
    const tokens = tokeniserApprentissage(normaliserTexteApprentissage(contexte));
    let meilleure = null;
    let meilleurScore = SEUIL_SIMILARITE_APPRENTISSAGE;
    for (const c of correctionsApprises) {
      if ((c.categorie || 'date') !== categorie) continue;
      const score = similariteJaccard(tokens, new Set(c.tokens));
      if (score >= meilleurScore) { meilleure = c; meilleurScore = score; }
    }
    return meilleure;
  }

  // Enregistre (ou renforce) la correction pour que la même clause-type soit reconnue à l'avenir.
  // classification : selon `categorie` — 'pret'|'acte'|'ventebien'|'autre' pour 'date',
  // 'entretien'|'travaux'|'document'|'autre' pour 'engagement'. libelle : uniquement pour une date
  // classée 'autre' (le nom donné à l'échéance personnalisée).
  function memoriserCorrection(contexte, classification, libelle, categorie) {
    categorie = categorie || 'date';
    if (!contexte || contexte.length < 15) return; // trop court pour donner une empreinte fiable
    const tokens = [...tokeniserApprentissage(normaliserTexteApprentissage(contexte))];
    if (tokens.length < 3) return; // pas assez de matière pour comparer de façon fiable

    const existante = trouverCorrectionApprise(contexte, categorie);
    if (existante && existante.classification === classification) {
      existante.nbConfirmations = (existante.nbConfirmations || 1) + 1;
      existante.dateMaj = new Date().toISOString();
    } else {
      correctionsApprises.push({
        id: (crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
        tokens,
        contexteExemple: contexte.slice(0, 200),
        categorie,
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

  // Apprentissage d'un document mal rattaché à une pièce de la checklist (voir
  // reinitialiserStatutPieceStandard() ci-dessous) : un fichier reconnu à tort par son NOM
  // (`motifNom`) pour une pièce donnée ne doit plus jamais matcher CETTE pièce, sur AUCUN dossier
  // — demandé explicitement par l'étude ("permettre au système d'apprendre de son erreur"), qui a
  // choisi la portée la plus large (une règle apprise globale) plutôt qu'une simple exclusion
  // locale à ce seul dossier. Stocké séparément de `correctionsApprises` (mécanisme par similarité
  // de texte, pas adapté ici : un nom de fichier n'est pas une clause à comparer par Jaccard, c'est
  // une correspondance exacte qu'il faut simplement empêcher de se reproduire) — un objet
  // `{ [cle]: [nomNormalisé, ...] }`, même stockage `window.storage`/`localStorage` que le reste de
  // l'apprentissage.
  const CLE_EXCLUSIONS_MOTIF_NOM = 'exclusions-motif-nom';
  let exclusionsMotifNom = {};

  // Journal des corrections apportées à la main sur ce que l'extraction avait proposé (voir
  // diffCorrectionsExtraction). Sert UNIQUEMENT à mesurer, plus tard, où l'extraction se trompe le
  // plus souvent — il n'alimente aucun réentraînement automatique du modèle local, décision
  // explicite de la spec : une regex se corrige à la main après analyse, jamais par apprentissage
  // silencieux sur des dizaines de dossiers.
  const CLE_CORRECTIONS_EXTRACTION = 'corrections-extraction';
  const MAX_CORRECTIONS_EXTRACTION = 500;
  let journalCorrectionsExtraction = [];

  async function sauvegarderJournalCorrections() {
    const contenu = JSON.stringify(journalCorrectionsExtraction);
    try {
      if (window.storage) { await window.storage.set(CLE_CORRECTIONS_EXTRACTION, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour le journal des corrections, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_CORRECTIONS_EXTRACTION, contenu); } catch (e) { console.warn('Sauvegarde du journal des corrections impossible.', e); }
  }

  async function chargerJournalCorrections() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_CORRECTIONS_EXTRACTION, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_CORRECTIONS_EXTRACTION);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    journalCorrectionsExtraction = Array.isArray(brut)
      ? brut.filter(c => c && typeof c === 'object' && typeof c.champ === 'string')
      : [];
  }

  function journaliserCorrectionsExtraction(entrees) {
    if (!Array.isArray(entrees) || entrees.length === 0) return;
    journalCorrectionsExtraction.push(...entrees);
    // On garde les plus récentes : c'est l'état actuel de l'extraction qui intéresse, pas ses
    // erreurs d'il y a deux ans sur des regex depuis corrigées.
    if (journalCorrectionsExtraction.length > MAX_CORRECTIONS_EXTRACTION) {
      journalCorrectionsExtraction = journalCorrectionsExtraction.slice(-MAX_CORRECTIONS_EXTRACTION);
    }
    sauvegarderJournalCorrections();
  }

  async function sauvegarderExclusionsMotifNom() {
    const contenu = JSON.stringify(exclusionsMotifNom);
    try {
      if (window.storage) { await window.storage.set(CLE_EXCLUSIONS_MOTIF_NOM, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour les exclusions de pièces, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_EXCLUSIONS_MOTIF_NOM, contenu); } catch (e) { console.warn('Sauvegarde des exclusions de pièces impossible.', e); }
  }

  async function chargerExclusionsMotifNom() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_EXCLUSIONS_MOTIF_NOM, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_EXCLUSIONS_MOTIF_NOM);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    exclusionsMotifNom = (brut && typeof brut === 'object' && !Array.isArray(brut)) ? brut : {};
  }

  // Un nom de fichier déjà normalisé (voir normaliserNomPourMotif) est-il exclu pour cette pièce ?
  function estNomExcluPourPiece(cle, nomNormalise) {
    const liste = exclusionsMotifNom[cle];
    return Array.isArray(liste) && liste.includes(nomNormalise);
  }

  // Enregistre l'exclusion (idempotent : un même nom ne s'ajoute jamais deux fois pour la même
  // pièce) et persiste immédiatement.
  function exclureNomPourPiece(cle, nomNormalise) {
    if (!nomNormalise) return;
    if (!Array.isArray(exclusionsMotifNom[cle])) exclusionsMotifNom[cle] = [];
    if (!exclusionsMotifNom[cle].includes(nomNormalise)) exclusionsMotifNom[cle].push(nomNormalise);
    sauvegarderExclusionsMotifNom();
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
      typeVente: (d.typeVente === 'copropriete' || d.typeVente === 'terrain') ? d.typeVente : 'maison',
      roleNotaire: d.roleNotaire === 'participant' ? 'participant' : 'instrumentaire',
      // Choix de l'étude sur QUELLES pièces suivre pour ce dossier précis (pas dérivé d'un scan de
      // PDF local, contrairement à `pieces` juste en dessous, qui repart bien à {}) : conservés tels
      // quels à l'import, comme `autres` ci-dessus.
      piecesRetirees: Array.isArray(d.piecesRetirees) ? d.piecesRetirees.filter(c => typeof c === 'string') : [],
      piecesPersonnalisees: Array.isArray(d.piecesPersonnalisees)
        ? d.piecesPersonnalisees.filter(p => p && typeof p === 'object' && typeof p.cle === 'string' && typeof p.label === 'string')
            .map(p => ({ cle: p.cle, label: p.label }))
        : [],
      // Comme piecesRetirees/piecesPersonnalisees ci-dessus : un choix figé pour ce dossier, pas
      // dérivé d'un scan de PDF local, conservé tel quel à l'import. Filtré sur les clés CONNUES de
      // PIECES_ENGAGEMENTS_AUTO plutôt que sur un simple typeof string, au cas où une future
      // version retirerait une clé existante — une clé obsolète resterait sinon indéfiniment dans
      // le dossier importé sans jamais correspondre à une pièce réelle affichée.
      piecesEngagementsDetectees: Array.isArray(d.piecesEngagementsDetectees)
        ? d.piecesEngagementsDetectees.filter(c => PIECES_ENGAGEMENTS_AUTO.some(p => p.cle === c))
        : [],
      archive: d.archive === true,
      reminderDays: Array.isArray(d.reminderDays) && d.reminderDays.every(Number.isInteger) ? d.reminderDays : [15, 7],
      confiance: (d.confiance && typeof d.confiance === 'object') ? d.confiance : {},
      analyseJuridique: {
        documents: Array.isArray(d.analyseJuridique && d.analyseJuridique.documents) ? d.analyseJuridique.documents.filter(x => typeof x === 'string') : [],
        engagements: Array.isArray(d.analyseJuridique && d.analyseJuridique.engagements) ? d.analyseJuridique.engagements : [],
        conditions: Array.isArray(d.analyseJuridique && d.analyseJuridique.conditions) ? d.analyseJuridique.conditions : []
      },
      // Trace de ce que l'extraction avait compris de l'acte : conservée à l'import (c'est une
      // lecture du document lui-même, la même sur n'importe quel poste — contrairement à
      // offrePretStatut/pieces, dérivés d'un dossier LOCAL propre à la machine), mais assainie :
      // une sauvegarde produite par une version différente peut porter une structure inattendue.
      ...normaliserExtractionImportee(d),
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
        // Import en masse : chaque dossier est créé individuellement (POST) sur le serveur — pas
        // de route "bulk" en V1 (voir M3 pour l'import serveur dédié à la migration initiale,
        // distinct de ce bouton "Importer (JSON)" manuel). Un id déjà présent côté serveur (import
        // d'une sauvegarde déjà partiellement importée) est simplement compté comme refusé, sans
        // bloquer les autres.
        let reussis = 0;
        for (const d of importes) {
          const ok = await sauvegarderNouveauDossier(d);
          if (ok) { dossiers.push(d); reussis++; }
        }
        render();
        const echoues = importes.length - reussis;
        const messageEchoues = echoues > 0 ? ` (${echoues} refusé${echoues > 1 ? 's' : ''} par le serveur, id déjà présent ?)` : '';
        afficherToast(`${reussis} dossier${reussis > 1 ? 's' : ''} importé${reussis > 1 ? 's' : ''}${messageEchoues}.`, 'OK', null);
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
    // acte/vente : mêmes valeurs que --acte/--ventebien (style.css), échangées sur demande de
    // l'étude (acte en vert/teal, vente préalable en bleu) — voir le commentaire dans style.css.
    const TEINTES = {
      pret:  { fond: '#FBEFD9', barre: '#B07A12' },
      acte:  { fond: '#E1F4F2', barre: '#1CA39B' },
      vente: { fond: '#E3EEF7', barre: '#2472B0' },
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
  //
  // **Toutes les pièces sont désormais détectées UNIQUEMENT par le NOM DU FICHIER (`motifNom`),
  // plus du tout par son contenu (`motif`, retiré partout dans ces trois listes).** Décision
  // explicite de l'étude, après une série de faux positifs par contenu qui n'étaient pas tous
  // réductibles à une clause précise à exclure : `certificatUrbanisme`/`certificatAlignement`/
  // `certificatNumerotage`/`renonciationPreemption`/`titrePropriete` avaient déjà perdu leur
  // `motif` un par un (voir l'historique dans CLAUDE.md — ce sont des conditions juridiques que le
  // compromis décrit systématiquement en boilerplate, que la pièce existe ou non, sans qu'aucune
  // formulation-piège ponctuelle ne puisse suivre "chaque agence a des clauses différentes, il y
  // en a des centaines"). Le même risque existant en germe pour les pièces restantes
  // (ERP/diagnostics/taxe foncière/assainissement/pièces de copropriété), l'étude a demandé de
  // généraliser tout de suite plutôt que d'attendre un signalement pièce par pièce. Bénéfice
  // secondaire, pas la motivation initiale mais réel : `verifierDossierLocal()` n'a plus besoin
  // d'ouvrir/lire un PDF (ni d'y recourir à l'OCR) pour vérifier une pièce, seul son nom est
  // consulté — un fichier n'est ouvert que si l'offre de prêt reste à chercher, ce qui réduit
  // nettement le nombre de PDF réellement lus sur un dossier local volumineux.
  // Listes de noms de fichiers données par l'étude pour les 4 premières pièces concernées (voir
  // CLAUDE.md) : ERP → "ERP", "état des risques et pollution" ; assainissement → "rapport
  // assainissement", "courrier assainissement", "SPANC", "assainissement" ; taxe foncière → "TF",
  // "taxes foncières" (parfois suivi de l'année) ; titre de propriété → "Titre", "titre de
  // propriété", "titre vendeur". Chaque motifNom tolère les fautes de frappe/variantes les plus
  // plausibles (accent absent ou mal placé, double lettre oubliée) SANS pour autant devenir assez
  // large pour qu'un mot commun avec une AUTRE pièce la valide par erreur (ex. "certificat
  // d'urbanisme" qui mentionnerait l'alignement en passant ne doit pas valider "Certificat
  // d'alignement", d'où l'exigence de la phrase complète plutôt que le mot seul). Les motifNom des
  // pièces de copropriété (`etatDate`/`article20`/`ribCopro`) et des dernières pièces basculées
  // (`diagnosticsTechniques`/`erp`/`avisTaxeFonciere`/`reponseAssainissement`) reprennent tels
  // quels les anciens motifs de contenu, faute d'exemples réels de noms de fichiers pour l'instant
  // — à resserrer/élargir dès qu'un vrai dossier en fait remonter un.
  var PIECES_URBANISME = [
    // "réponse urbanisme"/"réponse d'urbanisme" (alias courant côté étude pour ce même document)
    // ajouté au motifNom, en plus de "certificat d'urbanisme"/"CU a)".
    { cle: 'certificatUrbanisme', label: "Certificat d'urbanisme", motifNom: /certificat\s+d?[’']?\s*urbanisme|\bCU\s*a\)|r[ée]ponse\s+(?:d[’']?\s*)?urbanisme/i },
    // Deuxième alternative ajoutée : l'alignement et le numérotage sont parfois réunis dans UN SEUL
    // document, nommé "Alignement et numérotage"/"Certificat d'alignement et numérotage" ou une
    // variante proche — sans le mot "certificat" devant "alignement" dans ce cas, ce que la
    // première alternative (déjà en place) n'accepte pas seule. Ne PAS se contenter d'un "alignement"
    // nu pour autant : ça réintroduirait le faux positif déjà corrigé une fois (un certificat
    // d'urbanisme qui mentionne "réponse alignement voirie" en passant, voir le test de
    // non-régression juste en dessous) — la seconde alternative n'accepte donc "alignement" SANS
    // "certificat" devant que s'il est à proximité immédiate (20 caractères) du mot "numérotage",
    // dans un ordre ou l'autre : c'est spécifiquement le document combiné qui est visé, pas
    // n'importe quel fichier mentionnant "alignement".
    { cle: 'certificatAlignement', label: "Certificat d'alignement", motifNom: /certificat\s+d?[’']?\s*alignement|alignement.{0,20}num[ée]\s?rotage|num[ée]\s?rotage.{0,20}alignement/i },
    // \s? après l'accent : un fichier réel de l'étude a été nommé "...nume_rotage..." (le mot
    // "numérotage" coupé en deux à l'endroit de l'accent, très probablement une frappe accidentelle
    // d'espace dans "numé rotage" avant conversion espace→underscore) — voir CLAUDE.md.
    { cle: 'certificatNumerotage', label: 'Certificat de numérotage', motifNom: /num[ée]\s?rotage/i },
    // ass?ainissement : tolère "asainissement" (un seul "s"), faute de frappe courante.
    { cle: 'reponseAssainissement', label: 'Courrier réponse assainissement', motifNom: /ass?ainissement|\bSPANC\b/i },
    // Pas de motif de contenu (voir le commentaire structurel ci-dessus) : "préemption" seul
    // apparaît quasi systématiquement dans le corps du compromis (clause sur les conséquences
    // d'un exercice du droit de préemption), sans rapport avec une vraie renonciation obtenue.
    // "DPU" (Droit de Préemption Urbain) ajouté : nom de fichier réel de l'étude ("Renonciation au
    // DPU"), sigle assez spécifique pour être accepté seul (même principe que TF/SPANC/ERP/CU —
    // voir CLAUDE.md — pas un mot susceptible d'apparaître incidemment ailleurs dans ce contexte).
    { cle: 'renonciationPreemption', label: 'Renonciation au droit de préemption', motifNom: /pr[ée]emption|\bDPU\b/i }
  ];
  var PIECES_AUTRES = [
    { cle: 'diagnosticsTechniques', label: 'Diagnostics techniques', motifNom: /diagnostics?|\bDDT\b/i },
    // "ERP" est ambigu dans le CORPS DU TEXTE (aussi "Établissement Recevant du Public"), mais pas
    // dans un NOM DE FICHIER d'un dossier de vente d'une maison, où "ERP.pdf" désigne sans
    // ambiguïté l'état des risques et pollutions (un ERP au sens accessibilité n'a pas sa place
    // dans ce type de vente) — motifNom peut donc se permettre le sigle seul.
    { cle: 'erp', label: 'ERP (état des risques et pollution)', motifNom: /\bERP\b|[ée]tat\s+des\s+risques(?:\s+et\s+pollutions?)?/i },
    // \bTF\b avant les chiffres d'une année éventuelle ("TF 2024.pdf") : pas besoin de motif
    // spécifique, \b ne consomme aucun caractère et laisse la suite du nom de fichier de côté.
    // \s? après l'accent de "foncière" : même précaution que "numérotage" ci-dessus.
    { cle: 'avisTaxeFonciere', label: 'Avis de taxe foncière', motifNom: /\bTF\b|taxes?\s+fonci[èe]\s?re/i },
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
    { cle: 'etatDate', label: 'État daté', motifNom: /[ée]tat\s+dat[ée]/i },
    { cle: 'article20', label: 'Article 20-II', motifNom: /article\s*20[\s.-]*(?:ii|2)\b/i },
    { cle: 'ribCopro', label: 'RIB de la copropriété', motifNom: /\bRIB\b[^\n]{0,50}(?:copropri[ée]t[ée]|syndic)|(?:copropri[ée]t[ée]|syndic)[^\n]{0,50}\bRIB\b/i }
  ];
  // Pour un terrain à bâtir : mêmes pièces "autres" qu'une maison (ERP, taxe foncière, titre de
  // propriété — voir PIECES_AUTRES ci-dessus), à une exception près demandée par l'étude : pas de
  // diagnostics techniques (DPE, plomb...), qui n'ont pas de sens sur un terrain nu, remplacés par
  // une étude de sol. Dérivée de PIECES_AUTRES par substitution plutôt que recopiée à la main : les
  // trois autres pièces restent automatiquement synchronisées si elles sont un jour retouchées
  // là-bas, pas besoin d'y penser une seconde fois ici.
  var PIECES_TERRAIN_AUTRES = PIECES_AUTRES.map(p => p.cle === 'diagnosticsTechniques'
    ? { cle: 'etudeSol', label: 'Étude de sol', motifNom: /[ée]tude\s+de\s+sol|\bG1\b|\bG2\b/i }
    : p);

  // Pièces ajoutées automatiquement à la checklist d'UN dossier précis quand le compromis mentionne
  // l'engagement d'entretien correspondant (voir `cleChecklist` sur DOCUMENTS_VENDEUR_CONNUS et
  // `d.piecesEngagementsDetectees`, alimenté une fois à la création du dossier dans
  // ajouterDossier()) — demandé explicitement par l'étude, limité à ces trois types pour l'instant
  // plutôt que généralisé à tout DOCUMENTS_VENDEUR_CONNUS (les autres restent de simples
  // informations dans l'analyse juridique, sans lien avec un document réel à réunir dans le
  // dossier). Même forme que les autres pièces standard (`cle`/`label`/`motifNom`) : réutilisent
  // sans aucun changement toute la mécanique déjà en place (recherche dans le dossier local par
  // `verifierDossierLocal()`, retrait via `retirerPieceStandard()`, préremplissage à "manquante"
  // au premier lien...) — ce ne sont PAS des pièces personnalisées (`personnalisee`), qui n'ont pas
  // de motifNom et ne sont retrouvées que par sous-chaîne de leur libellé.
  // `motifNom` volontairement plus permissif que le `motif` de contenu du compromis ci-dessus : un
  // fichier réel s'appelle plus souvent "Entretien chaudière.pdf"/"Facture ramonage.pdf" que
  // "Justificatif d'entretien de la chaudière.pdf" — même principe que les autres motifNom du
  // fichier (voir normaliserNomPourMotif juste plus bas pour la normalisation appliquée avant test).
  var PIECES_ENGAGEMENTS_AUTO = [
    { cle: 'ramonage', label: 'Ramonage (attestation ou facture)', motifNom: /ramonage/i },
    { cle: 'entretienChaudiere', label: 'Entretien de la chaudière', motifNom: /entretien.{0,20}chaudi[èe]re|chaudi[èe]re.{0,20}entretien|contrat.{0,20}chaudi[èe]re/i },
    { cle: 'entretienPac', label: 'Entretien de la pompe à chaleur (PAC)', motifNom: /entretien.{0,20}(?:pompe\s+[àa]\s+chaleur|\bpac\b)|(?:pompe\s+[àa]\s+chaleur|\bpac\b).{0,20}entretien/i }
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
  // Bug corrigé : un dossier zippé/synchronisé depuis un Mac (confirmé sur un vrai dossier envoyé
  // par l'étude, "NEW_DOSSIER.zip", dossier __MACOSX + .DS_Store) nomme ses fichiers en Unicode
  // NFD (décomposé) plutôt que NFC (composé) : "foncières" y est stocké comme "e" + un caractère
  // ACCENT GRAVE COMBINANT séparé (U+0300), pas le seul caractère "è" (U+00E8) que motifNom
  // attend. Invisible à l'œil (le nom s'affiche identique dans n'importe quel explorateur de
  // fichiers/éditeur/console.log) et donc indiscernable d'un motif mal écrit — exactement ce qui
  // a fait echouer TROIS revérifications successives de `avisTaxeFonciere.motifNom` sur des noms
  // de fichiers en apparence corrects ("Avis de Taxes foncières.pdf" ne matchait jamais, alors que
  // la regex elle-même était juste). `.normalize('NFC')` recompose chaque lettre accentuée en un
  // seul caractère avant tout test de motifNom — sans effet sur un nom déjà en NFC (cas normal
  // d'un fichier nommé sous Windows, l'environnement réel de l'étude), donc aucune régression
  // possible sur les dossiers déjà correctement détectés.
  function normaliserNomPourMotif(nom) {
    return nom.normalize('NFC').replace(/[_-]+/g, ' ');
  }

  // Pour les champs de recherche de dossier (Suivi, Tableau de bord) : accents et majuscules ne
  // doivent pas empêcher de retrouver un dossier ("depont" doit trouver "Dupont", "eleonore" doit
  // trouver "Éléonore") — demandé par l'étude. Sans rapport avec normaliserNomPourMotif() ci-dessus
  // (qui RECOMPOSE un accent décomposé pour un test de nom de fichier exact, sans jamais le
  // retirer) : ici on décompose au contraire chaque lettre accentuée (NFD) puis on retire les
  // diacritiques ainsi isolés, avant de comparer en minuscules.
  function normaliserPourRecherche(texte) {
    return (texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Ordre d'affichage = ordre des listes fournies par l'étude : urbanisme (commun aux trois types),
  // puis les pièces propres à la copropriété si applicable, puis le reste, puis les pièces
  // auto-détectées depuis un engagement du compromis (voir PIECES_ENGAGEMENTS_AUTO ci-dessus),
  // puis enfin les pièces personnalisées ajoutées à la main.
  // `d` (optionnel, absent avant l'enregistrement du dossier — voir majApercuPieces) permet de
  // personnaliser la checklist standard pour CE dossier précis, demandé par l'étude : `d.piecesRetirees`
  // (tableau de clés) masque des pièces standard OU auto-détectées non pertinentes pour ce dossier ;
  // `d.piecesPersonnalisees` (tableau de {cle, label}) ajoute des pièces propres à ce dossier, sans
  // toucher aux listes PIECES_* partagées par tous les autres dossiers du même type de vente ;
  // `d.piecesEngagementsDetectees` (tableau de clés de PIECES_ENGAGEMENTS_AUTO) active les pièces
  // détectées depuis un engagement du vendeur — calculé une seule fois à la création du dossier
  // (voir ajouterDossier()), jamais recalculé après coup (l'analyse juridique complète du compromis
  // n'existe plus une fois le dossier enregistré).
  function checklistPieces(typeVente, d) {
    const base = typeVente === 'copropriete'
      ? [...PIECES_URBANISME, ...PIECES_COPROPRIETE, ...PIECES_AUTRES]
      : typeVente === 'terrain'
        ? [...PIECES_URBANISME, ...PIECES_TERRAIN_AUTRES]
        : [...PIECES_URBANISME, ...PIECES_AUTRES];
    if (!d) return base;
    const retirees = new Set(d.piecesRetirees || []);
    const standard = base.filter(p => !retirees.has(p.cle));
    const engagementsDetectes = new Set(d.piecesEngagementsDetectees || []);
    const auto = PIECES_ENGAGEMENTS_AUTO.filter(p => engagementsDetectes.has(p.cle) && !retirees.has(p.cle))
      .map(p => ({ ...p, autoEngagement: true }));
    const perso = (d.piecesPersonnalisees || []).map(p => ({ cle: p.cle, label: p.label, personnalisee: true }));
    return [...standard, ...auto, ...perso];
  }
  // "Offre de crédit (immobilier)" est une formulation bancaire tout aussi courante que "offre de
  // prêt" pour désigner le même document — à ne pas retirer sans revérifier ce cas.
  // Bug corrigé : ce motif servait jusqu'ici à reconnaître l'offre de prêt dans le CONTENU du PDF
  // (verifierDossierLocal() ouvrait et lisait chaque fichier). Signalé par l'étude : trop d'erreurs
  // en usage réel (polices embarquées mal encodées produisant un texte extrait illisible, ou à
  // l'inverse un autre document mentionnant l'offre en passant sans être l'offre elle-même) — même
  // classe de problème déjà résolue pour la checklist de pièces en abandonnant la lecture de
  // contenu au profit du seul nom de fichier (voir CLAUDE.md, "TOUTES les pièces de la checklist
  // sont désormais détectées uniquement par le NOM DU FICHIER"). Ce motif sert donc désormais
  // exclusivement à tester le NOM DU FICHIER (normalisé — voir normaliserNomPourMotif), plus jamais
  // son contenu : \s+ devient \s* pour couvrir aussi un nom concaténé sans séparateur
  // ("OffreDePret.pdf" — la casse n'a pas d'importance, le motif est insensible à la casse), en plus
  // des noms espacés ("Offre de prêt.pdf") ou à séparateurs underscore/tiret (déjà normalisés en
  // espaces avant ce test). "Accord de prêt" ajouté, autre intitulé bancaire réel pour ce document.
  // "Contrat de crédit"/"contrat de prêt" ajoutés ensuite, sur demande de l'étude : certains
  // établissements nomment le document remis à l'emprunteur "contrat" plutôt que "offre", une fois
  // signé/accepté (couvre aussi "Contrat de crédit immobilier.pdf" grâce au \s* déjà en place).
  // var (pas const) : exposée globalement comme les fonctions du fichier, pour rester testable
  // depuis tests/helpers/load-app.js sans dupliquer le motif dans les tests.
  var OFFRE_PRET_RE = /offre\s*de\s*pr[êe]t|offre\s*pr[ée]alable\s*de\s*cr[ée]dit|offre\s*de\s*cr[ée]dit|offre\s*de\s*financement|accord\s*de\s*pr[êe]t|contrat\s*de\s*cr[ée]dit|contrat\s*de\s*pr[êe]t/i;
  let handlesEnMemoire = {}; // repli si IndexedDB est indisponible (contexte restreint)

  // Parcourt un dossier ET ses sous-dossiers à la recherche de fichiers PDF : les pièces d'un
  // dossier client sont presque toujours rangées dans des sous-dossiers ("Offres", "Pièces
  // reçues"…), jamais à la racine — s'arrêter au premier niveau (comme le faisait cette fonction
  // avant) manquait donc systématiquement l'offre de prêt dans ce cas, le cas le plus courant.
  const PROFONDEUR_MAX_RECHERCHE_PDF = 4;
  const MAX_FICHIERS_PARCOURUS = 3000; // filet de sécurité sur un dossier réseau volumineux
  // Bug corrigé : parcours en LARGEUR (file FIFO), plus en profondeur comme avant. L'arborescence
  // réelle de l'étude range un dossier client en rubriques numérotées à la racine ("0 -
  // COMPTABILITE - PRET", "1 - Vendeur", "3 - Titre de propriété"...). L'ancien parcours en
  // profondeur (yield* récursif) épuisait MAX_FICHIERS_PARCOURUS sur la TOUTE PREMIÈRE rubrique
  // rencontrée (et ses propres sous-dossiers) si elle contenait à elle seule beaucoup de PDF
  // (relevés bancaires, historique de prêt...) — les pièces des rubriques suivantes (titre,
  // diagnostics, environnement...) n'étaient alors jamais atteintes, quel que soit leur nom de
  // fichier : un vrai bug structurel, pas une regex de détection à corriger (signalé par l'étude
  // comme "toujours bugué" sur des pièces au nom pourtant correct, après plusieurs vérifications
  // de motifNom n'ayant rien trouvé d'anormal). Une file FIFO garantit que toutes les rubriques de
  // premier niveau sont explorées (leurs fichiers PDF directs) avant de descendre dans les
  // sous-dossiers d'une seule d'entre elles. Plafond relevé en même temps (300 → 3000) par
  // sécurité supplémentaire : il ne compte que des PDF, pour UN SEUL dossier client, pas tout le
  // lecteur réseau de l'étude.
  async function* fichiersPdfRecursifs(handleDossier, profondeur, compteur) {
    const file = [{ handle: handleDossier, profondeur }];
    while (file.length > 0) {
      const { handle, profondeur: p } = file.shift();
      if (p > PROFONDEUR_MAX_RECHERCHE_PDF) continue;
      for await (const [nom, entree] of handle.entries()) {
        if (compteur.n >= MAX_FICHIERS_PARCOURUS) return;
        if (entree.kind === 'file') {
          if (/\.pdf$/i.test(nom)) { compteur.n++; yield entree; }
        } else if (entree.kind === 'directory') {
          file.push({ handle: entree, profondeur: p + 1 });
        }
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
  // Même mécanisme pour le compromis lui-même (voir ouvrirCompromisTrouve()) : contrairement à
  // l'offre/aux pièces, ce handle n'est jamais rempli par verifierDossierLocal() (le compromis
  // n'est pas une pièce de la checklist) — seule ouvrirCompromisTrouve() le renseigne, à la
  // demande, la première fois qu'on clique sur "Ouvrir le compromis".
  const CLE_HANDLE_COMPROMIS = (id) => `${id}::compromis`;

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
      // Le handle du compromis, lui, pointait vers l'ANCIEN dossier local — jamais rescanné
      // automatiquement (voir ouvrirCompromisTrouve()) : sans ce retrait, "Ouvrir le compromis"
      // rouvrirait silencieusement un fichier du mauvais dossier après un changement de lien.
      await enregistrerHandle(CLE_HANDLE_COMPROMIS(id), null);
      if (d.roleNotaire !== 'participant') {
        d.pieces = {};
        checklistPieces(d.typeVente, d).forEach(p => { d.pieces[p.cle] = 'manquante'; });
      }
      // Choisir un nouveau dossier ecrase simplement le lien precedent (put() dans
      // enregistrerHandle) : utile si l'on s'etait trompe de dossier au premier lien.
      ajouterHistorique(d, etaitDejaLie
        ? 'Dossier local relié modifié (nouveau dossier choisi)'
        : 'Dossier local relié pour la vérification automatique de l\u2019offre de prêt');
      await sauvegarder(d);
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
      dernierDiagnosticParcours[id] = { horodatage: new Date().toISOString(), journal: [], resume: { erreur: 'Aucun dossier local relié (le lien a été perdu — base vidée, ou dossier ouvert depuis un autre navigateur).' } };
      render();
      return;
    }

    let permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted' && viaClicUtilisateur) {
      permission = await handle.requestPermission({ mode: 'read' });
    }
    if (permission !== 'granted') {
      d.accesAReconfirmer = true;
      dernierDiagnosticParcours[id] = { horodatage: new Date().toISOString(), journal: [], resume: { erreur: "Accès au dossier local non accordé — cliquez sur \"reconfirmer l'accès\" puis relancez la vérification." } };
      render();
      return;
    }
    d.accesAReconfirmer = false;

    const checklist = chercherPieces ? checklistPieces(d.typeVente, d) : [];
    d.pieces = d.pieces || {};
    // Pièces déjà trouvées lors d'une vérification précédente : inutile de les rechercher à
    // nouveau, seules celles encore manquantes/inconnues sont testées sur chaque PDF.
    const aChercher = new Set(checklist.filter(p => d.pieces[p.cle] !== 'recue').map(p => p.cle));
    const fichierParPiece = {};

    let offreTrouvee = false;
    let fichierOffre = null;
    let nbAnalyses = 0; // fichiers réellement ouverts/lus (contenu) — sert seulement au log interne
    let nbFichiersRencontres = 0; // tous les PDF croisés, ouverts ou non (voir le toast plus bas)
    // Journal du parcours (voir dernierDiagnosticParcours/renderDiagnosticParcours) : une ligne par
    // événement notable (correspondance trouvée, contenu lu, erreur de lecture) — pas une ligne par
    // fichier rencontré, ce qui rendrait le journal illisible sur un dossier de plusieurs centaines
    // de PDF sans rien ajouter (le compteur global couvre déjà "combien de fichiers au total").
    // Jamais d'extrait du texte du PDF ici (contrairement à la trace console existante, réservée à
    // la console) : uniquement des noms de fichiers, déjà visibles par l'étude dans son propre
    // explorateur de fichiers — pas de PII supplémentaire exposée à l'écran.
    const diagnosticJournal = [];

    try {
      const compteur = { n: 0 };
      for await (const entree of fichiersPdfRecursifs(handle, 0, compteur)) {
        if ((!chercherOffre || offreTrouvee) && aChercher.size === 0) break; // tout est déjà résolu
        nbFichiersRencontres++;

        // Nom du fichier testé pour l'offre de prêt ET pour les pièces (voir motifNom) — plus
        // aucune lecture de contenu PDF dans cette fonction (voir OFFRE_PRET_RE et son historique :
        // trop d'erreurs signalées par l'étude sur la reconnaissance de l'offre par son contenu,
        // même limite déjà rencontrée et déjà corrigée pour la checklist de pièces). Normalisé
        // (underscores/tirets → espaces, accents NFC — voir normaliserNomPourMotif) avant le test :
        // les motifs sont écrits avec \s* comme séparateur, un vrai nom de fichier de l'étude non.
        const nomNormalise = normaliserNomPourMotif(entree.name);

        if (chercherOffre && !offreTrouvee && OFFRE_PRET_RE.test(nomNormalise)) {
          offreTrouvee = true;
          fichierOffre = entree.name;
          diagnosticJournal.push(`${entree.name} → offre de prêt trouvée par nom de fichier`);
          // Conserve le handle du fichier trouvé (même mécanisme IndexedDB que le dossier local
          // lui-même) pour permettre de le rouvrir en un clic depuis la fiche, sans avoir à
          // reparcourir tout le dossier — voir ouvrirOffreTrouvee().
          await enregistrerHandle(CLE_HANDLE_OFFRE(id), entree);
          // Montant emprunté (pour l'apport, voir calculerApport) : une seule lecture, best-effort,
          // du SEUL fichier déjà identifié comme l'offre par son NOM — ce n'est plus "lire le PDF
          // pour reconnaître l'offre" (ce que l'étude a demandé d'arrêter), seulement en extraire un
          // chiffre annexe une fois le bon fichier déjà connu avec certitude. Un échec de
          // lecture/extraction laisse simplement d.montantPret tel quel (jamais écrasé par un
          // échec, comme ailleurs dans ce fichier), sans jamais remettre en cause offreTrouvee.
          if (!d.montantPret) {
            try {
              nbAnalyses++;
              const file = await entree.getFile();
              const buffer = await file.arrayBuffer();
              const pdf = await pdfjsLib.getDocument({ data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
              const texte = await lireTextePdfVerification(pdf);
              const montant = detecterMontantPret(texte);
              if (montant) d.montantPret = montant;
            } catch (e) {
              console.error('Lecture du montant du prêt impossible pour', entree.name, e);
            }
          }
        }

        for (const piece of checklist) {
          if (!aChercher.has(piece.cle)) continue;
          // Pièce personnalisée (voir checklistPieces/ajouterPiecePersonnalisee) : pas de motifNom
          // (nom libre saisi par l'étude, aucune regex à écrire). Bug corrigé : jusqu'ici, seule la
          // recherche ponctuelle faite à l'AJOUT de la pièce (chercherFichierParNom) pouvait la
          // trouver — "Revérifier" l'ignorait ensuite silencieusement (le garde-fou `piece.motifNom`
          // ci-dessous exclut par construction toute pièce sans motif). Signalé par l'étude : un
          // fichier ajouté au dossier local APRÈS la création de la pièce (ou après avoir changé de
          // dossier lié) restait "à vérifier" indéfiniment, même en reclique sur "Revérifier". Même
          // logique de correspondance que `chercherFichierParNom()` (sous-chaîne insensible à la
          // casse du libellé dans le nom normalisé), réutilisée ici pour rester cohérente.
          if (piece.personnalisee) {
            if (nomNormalise.toLowerCase().includes(piece.label.toLowerCase())) {
              fichierParPiece[piece.cle] = entree;
              aChercher.delete(piece.cle);
              diagnosticJournal.push(`${entree.name} → pièce trouvée par nom : « ${piece.label} »`);
            }
          } else if (piece.motifNom && piece.motifNom.test(nomNormalise) && !estNomExcluPourPiece(piece.cle, nomNormalise)) {
            fichierParPiece[piece.cle] = entree;
            aChercher.delete(piece.cle);
            diagnosticJournal.push(`${entree.name} → pièce trouvée par nom : « ${piece.label} »`);
          }
        }
      }
    } catch (e) {
      console.error('Parcours du dossier local impossible', e);
      if (viaClicUtilisateur) afficherToast("Impossible de parcourir le dossier local relié : " + e.message, 'OK', null);
      dernierDiagnosticParcours[id] = { horodatage: new Date().toISOString(), journal: diagnosticJournal, resume: { erreur: 'Erreur pendant le parcours du dossier local : ' + e.message } };
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

    // Résultat complet du parcours, pour le panneau de diagnostic (voir renderDiagnosticParcours) —
    // construit ici, une fois d.pieces à jour, plutôt que pendant la boucle : la liste des pièces
    // "encore manquantes" doit refléter l'état final, pas un instantané pris en cours de parcours.
    dernierDiagnosticParcours[id] = {
      horodatage: new Date().toISOString(),
      journal: diagnosticJournal,
      resume: {
        nbFichiersRencontres,
        nbAnalyses,
        offre: !chercherOffre ? null : { trouvee: offreTrouvee, fichier: fichierOffre },
        pieces: !chercherPieces ? null : {
          total: checklist.length,
          trouvees: nbPiecesTrouvees,
          manquantes: checklist.filter(p => d.pieces[p.cle] !== 'recue').map(p => p.label)
        }
      }
    };

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
      if (nbFichiersRencontres === 0) {
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

    await sauvegarder(d);
    render();

    if (chercherOffre && offreTrouvee && offreEtaitManquante) {
      ajouterHistorique(d, 'Offre de prêt retrouvée dans le dossier local');
      await sauvegarder(d);
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

  // "Ouvrir le compromis" : contrairement à l'offre/aux pièces, ce document n'est jamais recherché
  // par verifierDossierLocal() (ce n'est pas une pièce de la checklist) — son handle n'est donc
  // rempli qu'à la demande, ici, la première fois qu'on clique sur le bouton. Une fois trouvé, il
  // est mémorisé (CLE_HANDLE_COMPROMIS) comme les autres documents : un clic suivant l'ouvre
  // directement, sans reparcourir le dossier local. "promesse" est tenté en repli, faute de
  // "compromis" dans le nom du fichier — l'outil couvre aussi bien un compromis qu'une promesse
  // unilatérale de vente (voir RE_ROLE_VENDEUR/RE_ROLE_ACQUEREUR).
  async function ouvrirCompromisTrouve(dossierId, btn) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const cle = CLE_HANDLE_COMPROMIS(dossierId);
    const dejaTrouve = await recupererHandle(cle);
    if (dejaTrouve) { ouvrirFichierTrouve(cle); return; }
    if (!DOSSIER_FS_SUPPORTE || !d.dossierLie) {
      afficherToast('Reliez d’abord un dossier local pour retrouver le compromis.', 'OK', null);
      return;
    }
    const texteOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Recherche…`; }
    try {
      const handleDossier = await recupererHandle(dossierId);
      if (!handleDossier || await handleDossier.queryPermission({ mode: 'read' }) !== 'granted') {
        afficherToast('Accès au dossier local à reconfirmer avant de rechercher le compromis.', 'OK', null);
        return;
      }
      const trouve = (await chercherFichierParNom(handleDossier, 'compromis')) || (await chercherFichierParNom(handleDossier, 'promesse'));
      if (!trouve) {
        afficherToast('Aucun fichier contenant « compromis » ou « promesse » trouvé dans le dossier local.', 'OK', null);
        return;
      }
      await enregistrerHandle(cle, trouve);
      ouvrirFichierTrouve(cle);
    } catch (e) {
      console.error(e);
      afficherToast('Recherche du compromis impossible : ' + e.message, 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = texteOriginal; }
    }
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
    sauvegarder(d);

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
      checklistPieces(d.typeVente, d).every(p => (d.pieces || {})[p.cle] === 'recue');
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

  // Sélection de texte dans l'aperçu du compromis (voir construireCoucheTexte()/
  // gererSelectionPdf() plus haut) : la barre flottante se met à jour à chaque relâchement du
  // clic, qu'une sélection existe (la montrer au bon endroit) ou plus (la masquer).
  document.addEventListener('mouseup', gererSelectionPdf);

  document.addEventListener('keydown', (e) => {
    // Échap ferme la popup d'info post-action (.ics/email) si elle est ouverte, sinon l'écran
    // "À propos", sinon la boîte de confirmation, sinon la barre de sélection PDF, sinon le tiroir
    // de fiche dossier — dans cet ordre de superposition visuelle (la popup d'info s'ouvre par un
    // clic depuis le tiroir, donc au-dessus de lui ; "À propos" est un simple écran d'information,
    // jamais ouvert en même temps qu'un autre panneau, mais autant le garder en tête de liste par
    // cohérence).
    if (e.key === 'Escape') {
      const infoActionOverlay = document.getElementById('info-action-overlay');
      const aproposOverlay = document.getElementById('apropos-overlay');
      const overlay = document.getElementById('confirm-overlay');
      const barreSelection = document.getElementById('pdf-selection-toolbar');
      const formEngagementManuel = document.getElementById('ajout-engagement-manuel-form');
      if (infoActionOverlay && infoActionOverlay.style.display === 'flex') {
        e.preventDefault();
        fermerInfoAction();
      } else if (aproposOverlay && aproposOverlay.style.display === 'flex') {
        e.preventDefault();
        fermerAPropos();
      } else if (overlay && overlay.style.display === 'flex') {
        e.preventDefault();
        annulerConfirmation();
      } else if (barreSelection && barreSelection.style.display !== 'none') {
        e.preventDefault();
        masquerBoutonAjoutEngagement();
      } else if (formEngagementManuel && formEngagementManuel.style.display !== 'none') {
        e.preventDefault();
        masquerFormAjoutEngagementManuel();
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

  // ---- Analyse approfondie (IA) : import de l'acte + annexes séparées, relecture croisée par le
  // modèle local (Ollama, voir server/src/llm.js et CLAUDE.md) ----
  // Distinct du wizard "Nouveau dossier" : on ne crée pas de dossier de suivi ici, on compare des
  // documents entre eux. N'existe QUE sur `claude/serveur-intranet` (a besoin d'un backend pour
  // parler à Ollama, jamais appelé sans `fetchAvecAuth()`/l'écran de connexion, absents de `main`)
  // — contrairement au reste de ce fichier, cette section (et celle de l'extraction IA du wizard
  // "Nouveau dossier", voir lancerExtractionIa) n'est PAS portée sur `main`, qui n'a pas de
  // backend pour l'exécuter.
  // Chaque fichier déposé n'existe qu'en mémoire le temps de l'analyse — jamais enregistré, aucun
  // dossier créé. Seul le TEXTE déjà extrait dans le navigateur est envoyé au serveur, jamais le
  // PDF lui-même (voir lireTextePdfVerification, déjà utilisée pour vérifier un dossier local).
  let fichiersAnalyseIa = []; // { id, file, nom, type: 'acte'|'annexe', statut, texte, erreurTexte }
  let compteurFichierAnalyseIa = 0;
  let analyseIaEnCours = false;

  function gererSurvolDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.add('survol');
  }

  function gererQuitteDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.remove('survol');
  }

  function gererDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.remove('survol');
    const fichiers = event.dataTransfer && event.dataTransfer.files;
    if (fichiers && fichiers.length) ajouterFichiersAnalyseIa(fichiers);
  }

  // Devine "acte" pour le premier PDF dont le nom évoque un compromis/une promesse, "annexe" pour
  // tous les suivants — une simple valeur de départ pratique, toujours modifiable ensuite via le
  // <select> de chaque ligne (voir changerTypeFichierAnalyseIa) : ce n'est jamais figé.
  function deviserTypeAnalyseIa(nomFichier) {
    const dejaUnActe = fichiersAnalyseIa.some(f => f.type === 'acte');
    if (!dejaUnActe && /compromis|promesse/i.test(nomFichier)) return 'acte';
    return 'annexe';
  }

  function ajouterFichiersAnalyseIa(fileList) {
    const fichiers = Array.from(fileList).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (fichiers.length === 0) {
      afficherToast('Seuls les fichiers PDF sont acceptés.', 'OK', null);
      return;
    }
    const nouvelles = fichiers.map(file => ({
      id: `analyse-ia-${++compteurFichierAnalyseIa}`,
      file,
      nom: file.name,
      type: deviserTypeAnalyseIa(file.name),
      statut: 'lecture',
      texte: '',
      erreurTexte: ''
    }));
    fichiersAnalyseIa = fichiersAnalyseIa.concat(nouvelles);
    renderListeFichiersAnalyseIa();
    for (const entree of nouvelles) extraireTexteFichierAnalyseIa(entree.id);
  }

  // Réutilise lireTextePdfVerification() (déjà en place pour vérifier l'offre de prêt/les pièces
  // d'un dossier local relié) : texte extractible + repli OCR sur les 3 premières pages si le PDF
  // est un scan sans texte — même logique, appliquée ici à un fichier importé via <input> plutôt
  // qu'à un FileSystemFileHandle.
  async function extraireTexteFichierAnalyseIa(id) {
    const entree = fichiersAnalyseIa.find(f => f.id === id);
    if (!entree) return;
    if (!window.pdfjsLib) {
      entree.statut = 'erreur';
      entree.erreurTexte = 'Lecture PDF indisponible — réessayez dans un instant.';
      renderListeFichiersAnalyseIa();
      return;
    }
    try {
      const buffer = await entree.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
      const texte = await lireTextePdfVerification(pdf);
      if (texte.trim().length < 20) {
        entree.statut = 'erreur';
        entree.erreurTexte = 'Aucun texte exploitable trouvé (page vide, ou scan illisible même après OCR).';
      } else {
        entree.statut = 'ok';
        entree.texte = texte;
      }
    } catch (e) {
      entree.statut = 'erreur';
      entree.erreurTexte = 'Lecture du PDF impossible.';
      console.error('Analyse IA : échec de lecture de', entree.nom, e);
    }
    renderListeFichiersAnalyseIa();
  }

  function changerTypeFichierAnalyseIa(id, valeur) {
    const entree = fichiersAnalyseIa.find(f => f.id === id);
    if (entree) entree.type = valeur;
  }

  function retirerFichierAnalyseIa(id) {
    fichiersAnalyseIa = fichiersAnalyseIa.filter(f => f.id !== id);
    renderListeFichiersAnalyseIa();
  }

  // Pas de demanderConfirmation() ici, volontairement : rien n'est enregistré (voir en tête de
  // section), vider la liste ne perd qu'un import à refaire — un impact bien moindre qu'archiver/
  // supprimer un vrai dossier de suivi, qui garde ce garde-fou.
  function viderAnalyseIa() {
    fichiersAnalyseIa = [];
    const rapport = document.getElementById('analyse-ia-rapport');
    if (rapport) rapport.innerHTML = '<p class="hint">Aucune analyse lancée pour l\'instant.</p>';
    renderListeFichiersAnalyseIa();
  }

  function statutFichierAnalyseIa(entree) {
    if (entree.statut === 'lecture') return `<span class="dot-label dl-neutre">${icone('spinner', null, true)}Lecture…</span>`;
    if (entree.statut === 'erreur') return `<span class="dot-label dl-urgent" title="${escapeAttr(entree.erreurTexte)}">${icone('alert-triangle')}Erreur</span>`;
    return `<span class="dot-label dl-success">${icone('file-text')}Lu</span>`;
  }

  function renderListeFichiersAnalyseIa() {
    const conteneur = document.getElementById('analyse-ia-liste-fichiers');
    if (!conteneur) return;
    conteneur.innerHTML = fichiersAnalyseIa.map(f => `
      <div class="analyse-ia-fichier">
        ${icone('file-text')}
        <span class="analyse-ia-fichier-nom" title="${escapeAttr(f.nom)}">${escapeHtml(f.nom)}</span>
        <select onchange="changerTypeFichierAnalyseIa('${f.id}', this.value)" aria-label="Type de document">
          <option value="acte" ${f.type === 'acte' ? 'selected' : ''}>Acte principal</option>
          <option value="annexe" ${f.type === 'annexe' ? 'selected' : ''}>Annexe</option>
        </select>
        ${statutFichierAnalyseIa(f)}
        <button type="button" class="piece-suppr" onclick="retirerFichierAnalyseIa('${f.id}')" title="Retirer ce fichier" aria-label="Retirer ce fichier">${icone('x')}</button>
      </div>
    `).join('');

    const viderBtn = document.getElementById('analyse-ia-vider-btn');
    if (viderBtn) viderBtn.style.display = fichiersAnalyseIa.length ? '' : 'none';

    const lancerBtn = document.getElementById('analyse-ia-lancer-btn');
    if (lancerBtn && !analyseIaEnCours) {
      const pretsAAnalyser = fichiersAnalyseIa.some(f => f.statut === 'ok');
      const enCoursDeLecture = fichiersAnalyseIa.some(f => f.statut === 'lecture');
      lancerBtn.disabled = !pretsAAnalyser || enCoursDeLecture;
    }
  }

  // Interrogée à chaque ouverture de l'onglet (voir definirOnglet) : Ollama a pu être installé/
  // démarré/arrêté sur le serveur depuis la dernière visite. Affiche tout de suite un message
  // actionnable (modèle absent, Ollama non lancé...) plutôt que de laisser lancer une analyse de
  // plusieurs minutes pour découvrir l'échec à la fin — voir server/src/routes/analyseIa.js.
  async function verifierDisponibiliteAnalyseIa() {
    const zone = document.getElementById('analyse-ia-dispo');
    if (!zone) return;
    try {
      const reponse = await fetchAvecAuth('/api/analyse-ia/disponibilite');
      const statut = await reponse.json();
      zone.style.display = 'flex';
      if (statut.disponible) {
        zone.className = 'analyse-ia-dispo dispo-ok';
        zone.innerHTML = `${icone('sparkle')}Modèle local « ${escapeHtml(statut.modele)} » disponible.`;
      } else {
        zone.className = 'analyse-ia-dispo dispo-off';
        zone.innerHTML = `${icone('alert-triangle')}${escapeHtml(statut.raison || 'Modèle IA local indisponible.')}`;
      }
    } catch (e) {
      // Session expirée : fetchAvecAuth a déjà réaffiché l'écran de connexion, rien d'autre à faire.
    }
  }

  function libelleGraviteAnalyseIa(gravite) {
    if (gravite === 'critique') return { dl: 'dl-urgent', icone: 'alert-triangle', texte: 'Critique' };
    if (gravite === 'attention') return { dl: 'dl-pret', icone: 'alert-triangle', texte: 'À vérifier' };
    return { dl: 'dl-neutre', icone: 'info', texte: 'Info' };
  }

  function renderRapportAnalyseIa(resultat) {
    const zone = document.getElementById('analyse-ia-rapport');
    if (!zone) return;
    let html = '';
    if (resultat.tronque) {
      html += `<p class="hint">${icone('alert-triangle')} Un ou plusieurs documents étaient trop longs et n'ont été analysés que partiellement — les constats ci-dessous peuvent donc être incomplets.</p>`;
    }
    if (resultat.erreurAnalyse) {
      // Le modèle n'a pas renvoyé un JSON exploitable : ce n'est pas la même chose qu'une vraie
      // analyse "rien à signaler" — ne pas afficher les deux messages à la fois, ce serait
      // trompeur (laisserait croire que les documents ont bien été relus sans souci trouvé).
      html += `<p class="hint">${escapeHtml(resultat.erreurAnalyse)}</p>`;
    } else if (!resultat.constats || resultat.constats.length === 0) {
      html += '<p class="hint">Aucune incohérence relevée par le modèle sur les documents fournis — à vérifier malgré tout, voir la note ci-dessous.</p>';
    } else {
      html += resultat.constats.map(c => {
        const g = libelleGraviteAnalyseIa(c.gravite);
        const docs = (c.documents || []).map(d => escapeHtml(d)).join(', ');
        return `<div class="analyse-ia-constat">
          <div class="analyse-ia-constat-titre"><span class="dot-label ${g.dl}">${icone(g.icone)}${g.texte}</span>${escapeHtml(c.titre)}</div>
          ${c.description ? `<p class="analyse-ia-constat-desc">${escapeHtml(c.description)}</p>` : ''}
          ${docs ? `<div class="analyse-ia-constat-docs">Concerne : ${docs}</div>` : ''}
        </div>`;
      }).join('');
    }
    zone.innerHTML = html;
  }

  async function lancerAnalyseIa() {
    const documents = fichiersAnalyseIa
      .filter(f => f.statut === 'ok')
      .map(f => ({ nom: f.nom, type: f.type, texte: f.texte }));
    if (documents.length === 0) {
      afficherToast('Aucun document exploitable — importez au moins un PDF dont le texte a bien été lu.', 'OK', null);
      return;
    }
    analyseIaEnCours = true;
    const btn = document.getElementById('analyse-ia-lancer-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Analyse en cours…`; }
    const rapport = document.getElementById('analyse-ia-rapport');
    if (rapport) rapport.innerHTML = '<p class="hint">Analyse en cours — cela peut prendre une à plusieurs minutes selon la taille des documents et la puissance du serveur.</p>';

    try {
      const reponse = await fetchAvecAuth('/api/analyse-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents })
      });
      const corps = await reponse.json();
      if (!reponse.ok) {
        if (rapport) rapport.innerHTML = `<p class="hint">${escapeHtml(corps.erreur || "Échec de l'analyse.")}</p>`;
      } else {
        renderRapportAnalyseIa(corps);
      }
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth (écran de connexion réaffiché).
    } finally {
      analyseIaEnCours = false;
      renderListeFichiersAnalyseIa();
      if (btn) btn.innerHTML = "Lancer l'analyse";
    }
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
      'icon-nav-calculateur': 'banknote',
      'icon-apropos': 'info',
      'icon-calc-warning': 'alert-triangle',
      'icon-nav-analyse-ia': 'sparkle',
      'icon-analyse-ia-warning': 'alert-triangle',
      'icon-analyse-ia-dropzone': 'upload',
      'icon-pdf-recherche': 'search',
      'icon-pdf-recherche-prec': 'chevron-up',
      'icon-pdf-recherche-suiv': 'chevron-down'
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
  chargerExclusionsMotifNom();
  chargerJournalCorrections();
  // Mode serveur intranet (voir CLAUDE.md) : l'application entière est bloquée par l'écran de
  // connexion tant que le mot de passe partagé n'a pas été validé — un jeton déjà mémorisé
  // (localStorage, valable 12h côté serveur) permet de sauter cette étape au rechargement.
  // demarrerApplication() gère elle-même le cas d'un jeton devenu invalide (401 → fetchAvecAuth
  // réaffiche l'écran de connexion), pas la peine de le vérifier au préalable ici.
  authToken = chargerJetonStocke();
  if (authToken) {
    demarrerApplication().catch((e) => console.error('Démarrage impossible', e));
  } else {
    afficherEcranConnexion();
  }
  renderChips();
  // L'analyse juridique est une étape du wizard toujours visible (voir definirEtapeWizard) : sans
  // cet appel initial, ses sections restaient affichées vides (ni contenu ni message d'état) tant
  // qu'aucun PDF n'avait encore été importé dans la session.
  afficherAnalyseJuridique();
