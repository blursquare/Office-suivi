// @ts-check
'use strict';
// Assistant « Demander à CLAIRE » (étude 06/10) : ce que CLAIRE sait faire, dit en une phrase par le collaborateur.
// Code COMMUN au poste (page de conversation, exécution des gestes) et au serveur (compréhension par l'IA locale, repli par
// mots-clés) — écrit une fois. Aucune IA ici : la liste FERMÉE des intentions, la lecture par mots-clés d'une demande, les
// dates, heures et montants écrits en français, et la reconnaissance d'un dossier cité par son nom ou celui d'une partie.
// L'IA locale (Ollama, serveur) ne fait que choisir une intention de cette liste et recopier ce que la phrase dit ; tout le
// reste — le dossier désigné, la date, le geste — est décidé par ce code, pour ne rien inventer.
/** @param {object} C — les autres fichiers de commun/ dont celui-ci dépend */
(function (C) {
  /**
   * Une intention : `cle` (JSON de l'IA), `libelle`, `description` (dite à l'IA et dans l'aide), `dossier` (la demande porte sur un
   * dossier), `parametres` (ceux que l'IA doit recopier), `exemples` (chips de la page, prompt), `motifs` (mots-clés du repli,
   * sur le texte sans accents en minuscules), `ecrit` (le geste écrit quelque chose : 'fiche', 'rappel', 'email', 'agenda').
   * @typedef {{ cle: string, libelle: string, description: string, dossier?: boolean, parametres?: string[], exemples: string[],
   *   motifs: RegExp[], ecrit?: string, poids?: number }} IntentionAssistant
   */
  /** @type {IntentionAssistant[]} */
  var INTENTIONS_ASSISTANT = [
    { cle: 'etat_dossier', libelle: 'Où en est un dossier', description: 'état général d’un dossier : statut, pièces attendues, prochaine échéance, rendez-vous, fonds',
      dossier: true, exemples: ['Où en est le dossier MARTIN ?'], motifs: [/\bou en est\b/, /\betat (du|de ce|de mon)? ?dossier\b/, /\b(point|resume|resumer|situation|statut|avancement)\b/, /\bou en sommes\b/] },
    { cle: 'pieces_manquantes', libelle: 'Pièces manquantes', description: 'les pièces encore attendues sur un dossier',
      dossier: true, exemples: ['Quelles pièces manquent pour DUPONT ?'], motifs: [/\bpieces?\b/, /\bmanqu/, /\bil (me |nous )?reste a recevoir\b/, /\bqu.?est.?ce qu.?on attend\b/, /\battend(u|ue|ues|us)?\b/] },
    { cle: 'echeances_dossier', libelle: 'Échéances d’un dossier', description: 'les échéances et dates butoir d’un dossier, la prochaine étape',
      dossier: true, exemples: ['Quelles sont les échéances de MARTIN ?'], motifs: [/\becheance/, /\bdate butoir\b/, /\bbutoir\b/, /\bprochaine etape\b/, /\bplanning\b/, /\bdelai/, /\bquand (est|doit|faut|signe)/] },
    { cle: 'coordonnees', libelle: 'Coordonnées d’une partie', description: 'téléphone, email, notaire ou agence d’une partie du dossier (vendeur, acquéreur, confrère)',
      dossier: true, parametres: ['partie'], exemples: ['Quel est le téléphone du vendeur dans MARTIN ?'], motifs: [/\btelephone\b/, /\btel\b/, /\bnumero (du|de la|de l)\b/, /\b(e-?mail|adresse mail|courriel)\b/, /\bqui est le notaire\b/, /\bnotaire (du|de l)/, /\bconfrere\b/, /\bcoordonnees\b/, /\bjoindre\b/, /\bcontact\b/] },
    { cle: 'fonds_dossier', libelle: 'Fonds du dossier', description: 'fonds reçus et montant encore attendu sur un dossier',
      dossier: true, exemples: ['Combien il manque sur les fonds de MARTIN ?'], motifs: [/\bfonds\b/, /\bvirement/, /\bargent\b/, /\bcombien (il )?(manque|reste)\b/] },
    { cle: 'taches_jour', libelle: 'Ce que j’ai à faire', description: 'la liste « À faire » du collaborateur : tâches du jour et rappels',
      exemples: ['Qu’est-ce que j’ai à faire aujourd’hui ?'], motifs: [/\ba faire\b/, /\bdois[- ]je faire\b/, /\bma journee\b/, /\bmes taches\b/, /\btaches? (du jour|d.aujourd)/, /\bquoi faire\b/, /\bprogramme\b/] },
    { cle: 'depuis_hier', libelle: 'Depuis hier', description: 'ce qui a changé depuis hier 18 h : documents reçus, emails, demandes des clients',
      exemples: ['Qu’est-ce qui a changé depuis hier ?'], motifs: [/\bdepuis hier\b/, /\bquoi de neuf\b/, /\bnouveaut/, /\bqu.?est.?ce qui (a|s.est) (change|passe)\b/, /\bdu nouveau\b/] },
    { cle: 'rappel_ajouter', libelle: 'Ajouter un rappel', description: 'poser un rappel personnel (texte, date facultative, dossier facultatif) — fait aussitôt, annulable',
      parametres: ['texte', 'date'], ecrit: 'rappel', exemples: ['Rappelle-moi vendredi d’appeler le syndic pour DUPONT'], motifs: [/\brappelle[- ]moi\b/, /\brappel\b/, /\bpense[- ]bete\b/, /\bnote (que|de)\b/, /\bn.oublie pas\b/, /\bfais[- ]moi penser\b/], poids: 2 },
    { cle: 'rappel_lister', libelle: 'Mes rappels', description: 'la liste des rappels personnels en cours',
      exemples: ['Mes rappels'], motifs: [/\bmes rappels\b/, /\bliste des rappels\b/] },
    { cle: 'email', libelle: 'Préparer un email', description: 'ouvrir la fenêtre d’email d’un dossier avec un modèle (prêt, RIB, provision, vente préalable, fonds, projet d’acte, confirmation du rendez-vous, relance des fonds, questionnaire, copie de l’acte) ou un texte libre — rien ne part sans « Envoyer »',
      dossier: true, parametres: ['modele', 'texte'], ecrit: 'email', exemples: ['Relance MARTIN pour son offre de prêt', 'Demande le RIB à DUPONT'], motifs: [/\b(e-?mail|mail|courriel|message)\b/, /\brelanc/, /\becri[st] a\b/, /\benvoi/, /\bdemande[rz]? (le|la|les|un|une|son|sa)\b/, /\brib\b/, /\bconfirm/, /\bquestionnaire\b/, /\bprojet d.acte\b/, /\bprovision\b/, /\bcopie de l.acte\b/, /\battestation/], poids: 1 },
    { cle: 'echeance_cocher', libelle: 'Cocher une échéance', description: 'noter une étape faite : appel de fonds envoyé, projet envoyé, offre de prêt reçue, vente préalable réalisée, signature faite',
      dossier: true, parametres: ['echeance'], ecrit: 'fiche', exemples: ['Marque le projet envoyé pour DUPONT'], motifs: [/\bmarque[rz]?\b/, /\bcoche[rz]?\b/, /\bnote[rz]? (envoye|recu|fait|realise)/, /\b(c.est|est) (envoye|parti|fait|recu|signe)\b/, /\ba ete (envoye|recu|signe)\b/, /\bon a recu\b/, /\bj.ai (envoye|recu)\b/, /\bvalide[rz]?\b/], poids: 1 },
    { cle: 'echeance_decocher', libelle: 'Décocher une échéance', description: 'annuler la coche d’une étape (envoi effacé, offre à nouveau attendue)',
      dossier: true, parametres: ['echeance'], ecrit: 'fiche', exemples: ['Décoche l’appel de fonds de MARTIN'], motifs: [/\bdecoche/, /\bannule[rz]? la coche\b/, /\bpas (encore )?(envoye|recu|fait)\b/, /\bfinalement pas\b/, /\bn.est pas (envoye|recu|fait)\b/], poids: 3 },
    { cle: 'date_fiche', libelle: 'Noter une date sur la fiche', description: 'écrire une date sur la fiche : obtention du prêt, vente préalable, date butoir, appel de fonds, projet envoyé',
      dossier: true, parametres: ['champ', 'date'], ecrit: 'fiche', exemples: ['Mets la date butoir du prêt de MARTIN au 15 novembre'], motifs: [/\b(mets|mettre|note[rz]?|change[rz]?|modifie[rz]?|decale[rz]?|repousse[rz]?|reporte[rz]?) la date\b/, /\bdate (butoir |du pret |de la vente prealable |de l.appel |du projet )?(au|le) \d/, /\bbutoir (au|le) \d/, /\bpret (au|le) \d/], poids: 2 },
    { cle: 'creneaux_signature', libelle: 'Créneaux de signature', description: 'proposer des dates de signature possibles pour un dossier (règles de l’office)',
      dossier: true, exemples: ['Trouve une date de signature pour MARTIN'], motifs: [/\bcreneau/, /\btrouve[rz]? (une |des )?dates?\b/, /\bquand (peut[- ]on|pourrait[- ]on|signer)\b/, /\bdisponibilit/, /\bdates? (possible|libre)/, /\bproposer? (une |des )?dates?\b/, /\bquelle date\b/] },
    { cle: 'rendez_vous_placer', libelle: 'Placer la signature', description: 'placer le rendez-vous de signature d’un dossier dans l’agenda de l’office, à une date et une heure (confirmé avant)',
      dossier: true, parametres: ['date', 'heure'], ecrit: 'agenda', exemples: ['Place la signature MARTIN le 14 novembre à 10 h'], motifs: [/\bplace[rz]?\b/, /\bfixe[rz]?\b/, /\bcale[rz]?\b/, /\bsignature (le|du|au) \d/, /\brendez[- ]vous de signature\b/, /\bprends? (le )?rendez/], poids: 2 },
    { cle: 'sondage_dates', libelle: 'Proposer des dates aux clients', description: 'lancer un sondage de dates de signature auprès des clients ou du confrère (comme un Doodle)',
      dossier: true, ecrit: 'email', exemples: ['Propose des dates de signature aux clients de MARTIN'], motifs: [/\bsondage\b/, /\bdoodle\b/, /\bpropose[rz]? (des|plusieurs) dates\b/, /\bdates? aux clients\b/, /\bdemande[rz]? (leurs? )?disponibilit/], poids: 3 },
    { cle: 'rendez_vous_creer', libelle: 'Nouveau rendez-vous', description: 'créer un rendez-vous ordinaire dans l’agenda de l’office (titre, date, heure) — formulaire à valider',
      parametres: ['titre', 'date', 'heure'], ecrit: 'agenda', exemples: ['Rendez-vous avec le syndic jeudi à 14 h'], motifs: [/\b(nouveau|un|ajoute[rz]?|cree[rz]?|mets?) (un )?(rendez[- ]vous|rdv)\b/, /\brendez[- ]vous avec\b/, /\brdv avec\b/, /\b(mets?|ajoute[rz]?|cree[rz]?|note[rz]?|pose[rz]?)\b.{0,40}\b(dans|a) l.agenda\b/, /\breunion\b/], poids: 1 },
    { cle: 'agenda_jour', libelle: 'Agenda d’un jour', description: 'les rendez-vous de l’agenda de l’office un jour donné (aujourd’hui par défaut)',
      parametres: ['date'], exemples: ['Qu’est-ce qu’il y a à l’agenda demain ?'], motifs: [/\bagenda\b/, /\bqu.?est.?ce qu.?il y a\b/, /\brendez[- ]vous (de |d.)?(aujourd|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|ce |cette |la semaine|du jour)/, /\bqui (vient|signe|passe)\b/, /\bsignatures? (de |d.)?(aujourd|demain|la semaine|cette semaine)/] },
    { cle: 'appel_fonds', libelle: 'Appel de fonds', description: 'ouvrir l’outil Appel de fonds sur un dossier, pièces du NAS lues',
      dossier: true, exemples: ['Fais l’appel de fonds de MARTIN'], motifs: [/\bappel de fonds\b/, /\bdecompte\b/], poids: 3 },
    { cle: 'quotites', libelle: 'Quotités d’acquisition', description: 'calculer les quotités d’acquisition entre acquéreurs (apports, prêts, parts) et ouvrir l’outil',
      parametres: ['nombres', 'montant'], exemples: ['Quotités 60/40 pour LEROY sur 250 000 €'], motifs: [/\bquotite/, /\brepartition entre (les )?acquereurs\b/, /\bparts? (de |d.)?(chaque|chacun|acquisition)/], poids: 3 },
    { cle: 'provision', libelle: 'Provision sur frais', description: 'estimer la provision sur frais d’acte (frais de notaire) pour un prix, un type de bien et un département',
      parametres: ['montant', 'typeBien', 'departement', 'primo'], exemples: ['Provision pour une maison à 250 000 € dans le 41'], motifs: [/\bprovision\b/, /\bfrais (d.acte|de notaire|d.achat|d.acquisition)\b/, /\bcombien de frais\b/, /\bdroits (de mutation|d.enregistrement)\b/, /\bemoluments\b/], poids: 3 },
    { cle: 'prorata', libelle: 'Prorata', description: 'répartir une somme (taxe foncière, charges, loyer) entre vendeur et acquéreur à la date de l’acte',
      parametres: ['montant', 'date', 'debut', 'fin'], exemples: ['Prorata de 1 200 € de taxe foncière pour un acte le 15 juin'], motifs: [/\bprorata\b/, /\brepartir\b/, /\btaxe fonciere\b/, /\bcharges? de copro/, /\bpart (du vendeur|de l.acquereur)\b/], poids: 3 },
    { cle: 'preemption', libelle: 'Droits de préemption', description: 'ouvrir l’outil des droits de préemption (DPU, SAFER, bois) sur un dossier',
      dossier: true, exemples: ['Préemption sur le dossier MARTIN'], motifs: [/\bpreempt/, /\bdpu\b/, /\bsafer\b/, /\bdia\b/, /\bpurge/], poids: 3 },
    { cle: 'ouvrir_dossier', libelle: 'Ouvrir une fiche', description: 'ouvrir la fiche d’un dossier',
      dossier: true, exemples: ['Ouvre le dossier MARTIN'], motifs: [/\bouvr/, /\bmontre[rz]?\b/, /\baffiche[rz]?\b/, /\bla fiche\b/, /\bva (sur|dans|au)\b/] },
    { cle: 'ouvrir_ecran', libelle: 'Ouvrir un écran', description: 'aller sur un écran de CLAIRE : tableau de bord, agenda, suivi, Claire Scan, outils, réglages, nouveau dossier, répertoire',
      parametres: ['ecran'], exemples: ['Ouvre l’agenda'], motifs: [/\b(ouvr|va (sur|dans|au|a)|affiche|montre)[a-z]* (le |la |les |l.)?(tableau de bord|agenda|suivi|claire scan|scans?|outils|reglages|parametres|nouveau dossier|repertoire|annuaire|relecture)\b/] },
    { cle: 'rechercher', libelle: 'Chercher un dossier', description: 'retrouver un dossier par un nom, une adresse ou un mot',
      parametres: ['texte'], exemples: ['Quel dossier est rue des Lices à Blois ?'], motifs: [/\bcherch/, /\btrouve[rz]? le dossier\b/, /\bquel dossier\b/, /\bqui (habite|vend|achete)\b/, /\bdossiers? (de|avec|a) \b/, /\bretrouve/] },
    { cle: 'archiver', libelle: 'Archiver un dossier', description: 'archiver un dossier (annulable)',
      dossier: true, ecrit: 'fiche', exemples: ['Archive le dossier MARTIN'], motifs: [/\barchiv/, /\bclotur/, /\bclasse[rz]? (le |ce )?dossier\b/], poids: 3 },
    { cle: 'responsable', libelle: 'Changer le responsable', description: 'attribuer un dossier à un collaborateur (Bastien, Julie, Jérémy)',
      dossier: true, parametres: ['collaborateur'], ecrit: 'fiche', exemples: ['Attribue le dossier MARTIN à Julie'], motifs: [/\bresponsable\b/, /\battribu/, /\bconfie[rz]?\b/, /\b(donne[rz]?|passe[rz]?) (le |ce )?dossier a\b/], poids: 2 },
    { cle: 'aide', libelle: 'Aide', description: 'ce que l’assistant sait faire',
      exemples: ['Que sais-tu faire ?'], motifs: [/\baide\b/, /\bhelp\b/, /\bque (sais|peux)[- ]tu\b/, /\bqu.?est.?ce que tu (sais|peux)\b/, /\bcomment (ca marche|tu marches|t.utiliser)\b/, /^(bonjour|salut|hello|merci)\b/], poids: 2 },
    { cle: 'inconnu', libelle: 'Je n’ai pas compris', description: 'demande hors de la liste, ou trop vague', exemples: [], motifs: [] }
  ];

  // Modèles d'email cités dans une phrase → clé de MODELES_EMAIL_RELANCE / emailDepuisModele.
  var MODELES_EMAIL_ASSISTANT = [
    { cle: 'pret', libelle: 'offre de prêt', re: /\b(offre de pret|offre de credit|pret|banque|financement|emprunt|credit)\b/ },
    { cle: 'rib', libelle: 'RIB et pièce d’identité', re: /\b(rib|coordonnees bancaires|piece d.identite)\b/ },
    { cle: 'provision', libelle: 'provision sur frais', re: /\bprovision\b/ },
    { cle: 'ventePrealable', libelle: 'vente préalable', re: /\bvente prealable\b/ },
    { cle: 'relanceFonds', libelle: 'relance des fonds', re: /\b(relance[rz]? (pour |sur )?les fonds|fonds pas (encore )?(recus|arrives)|relance fonds)\b/ },
    { cle: 'fonds', libelle: 'réception des fonds', re: /\b(reception des fonds|fonds (bien )?recus|confirm[a-z]* (la )?reception|fonds)\b/ },
    { cle: 'projet', libelle: 'projet d’acte', re: /\bprojet\b/ },
    { cle: 'confirmationRdv', libelle: 'confirmation du rendez-vous', re: /\b(confirm[a-z]* (le )?rendez|rendez[- ]vous|rdv)\b/ },
    { cle: 'questionnaire', libelle: 'questionnaire de satisfaction', re: /\b(questionnaire|satisfaction)\b/ },
    { cle: 'anniversaire', libelle: 'un an après la signature', re: /\b(anniversaire|un an apres)\b/ },
    { cle: 'copieActe', libelle: 'copie de l’acte', re: /\b(copie de l.acte|attestation de vente|attestations?)\b/ },
    { cle: 'accuseReception', libelle: 'accusé de réception', re: /\baccuse de reception\b/ }
  ];
  // Échéances que l'on coche/décoche par une phrase → type d'échéance de la fiche.
  var ECHEANCES_ASSISTANT = [
    { cle: 'appelFonds', libelle: 'appel de fonds envoyé', re: /\bappel de fonds\b/ },
    { cle: 'projetEnvoye', libelle: 'projet d’acte envoyé', re: /\bprojet\b/ },
    { cle: 'pret', libelle: 'offre de prêt reçue', re: /\b(offre|pret|credit|financement)\b/ },
    { cle: 'ventebien', libelle: 'vente préalable réalisée', re: /\bvente prealable\b/ },
    { cle: 'rendezVousSignature', libelle: 'signature faite', re: /\b(signature|signe|acte)\b/ }
  ];
  // Dates de la fiche que l'on écrit par une phrase.
  var CHAMPS_DATE_ASSISTANT = [
    { cle: 'appelFonds', libelle: 'envoi de l’appel de fonds', re: /\bappel de fonds\b/ },
    { cle: 'projetEnvoye', libelle: 'envoi du projet', re: /\bprojet\b/ },
    { cle: 'pret', libelle: 'obtention du prêt', re: /\b(pret|offre|credit|financement)\b/ },
    { cle: 'ventebien', libelle: 'vente préalable', re: /\bvente prealable\b/ },
    { cle: 'acte', libelle: 'date butoir', re: /\b(butoir|reiteration|acte)\b/ }
  ];
  var PARTIES_ASSISTANT = [
    { cle: 'vendeur', re: /\bvendeu(r|rs|se|ses)\b|\bpromettant/ },
    { cle: 'acquereur', re: /\bacqu[a-z]*|\bacheteu|\bbeneficiaire/ },
    { cle: 'confrere', re: /\b(confrere|consoeur|notaire)\b/ },
    { cle: 'agence', re: /\b(agence|agent immobilier|negociateur)\b/ }
  ];
  var ECRANS_ASSISTANT = [
    { cle: 'dashboard', libelle: 'Tableau de bord', re: /\btableau de bord\b|\baccueil\b/ },
    { cle: 'agenda', libelle: 'Agenda', re: /\bagenda\b|\bcalendrier\b/ },
    { cle: 'suivi', libelle: 'Suivi des dossiers', re: /\bsuivi\b/ },
    { cle: 'scans', libelle: 'Claire Scan', re: /\bscans?\b/ },
    { cle: 'outils', libelle: 'Outils', re: /\boutils\b/ },
    { cle: 'reglages', libelle: 'Réglages', re: /\breglages?\b|\bparametres\b/ },
    { cle: 'nouveau', libelle: 'Nouveau dossier', re: /\bnouveau dossier\b/ },
    { cle: 'confreres', libelle: 'Répertoire', re: /\brepertoire\b|\bannuaire\b/ },
    { cle: 'analyse-ia', libelle: 'Relecture d’actes', re: /\brelecture\b/ }
  ];
  var MOTS_VIDES_ASSISTANT = new Set(('le la les un une des du de et ou pour avec dans sur par que qui quoi est sont son sa ses mon ma mes ton ta tes ' +
    'ce cet cette ces aux au vers chez pas plus moins tout tous toute toutes dossier dossiers fiche vte succ vente succession ' +
    'quel quelle quels quelles quand comment combien bonjour merci stp svp moi nous vous ils elles lui leur leurs ' +
    'pret offre fonds email mail rib date rendez vous signature projet acte appel butoir vendeur acquereur notaire client clients ' +
    'ouvre ouvrir montre affiche place placer fixe marque coche note mets relance relancer envoie envoyer demande cherche trouve ' +
    'aujourd hui demain lundi mardi mercredi jeudi vendredi samedi dimanche heure heures janvier fevrier mars avril mai juin juillet ' +
    'aout septembre octobre novembre decembre jour jours semaine mois annee euros euro').split(' '));

  var MOIS_ASSISTANT = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  var MOIS_COURTS_ASSISTANT = ['janv', 'fev', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];
  var JOURS_ASSISTANT = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  /** Texte sans accents, en minuscules, apostrophes typographiques ramenées à `'`, espaces simples. */
  function normaliserDemande(texte) {
    return String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim();
  }

  /** @param {string} iso @param {number} n */
  function decalerJours(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Pure : la date écrite dans une phrase, en ISO — « demain », « vendredi », « vendredi prochain », « dans 3 jours »,
   * « le 14 novembre », « 14/11 », « 14/11/2026 », « 14 nov. ». '' si rien. `aujourdhui` = AAAA-MM-JJ.
   * @param {string} texte @param {string} aujourdhui
   */
  function dateDepuisTexte(texte, aujourdhui) {
    const t = normaliserDemande(texte);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(aujourdhui)) return '';
    let m = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/.exec(t);
    if (m) {
      const j = Number(m[1]), mo = Number(m[2]);
      let a = m[3] ? Number(m[3]) : Number(aujourdhui.slice(0, 4));
      if (m[3] && m[3].length === 2) a += 2000;
      const iso = `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
      if (dateValideAssistant(iso)) return !m[3] && iso < aujourdhui ? `${a + 1}${iso.slice(4)}` : iso;
    }
    m = /\b(1er|\d{1,2})(?:er)? (janv|fev|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*\.?(?: (\d{4}))?\b/.exec(t);
    if (m) {
      const j = m[1] === '1er' ? 1 : Number(m[1]);
      const mo = MOIS_COURTS_ASSISTANT.indexOf(m[2]) + 1;
      const a = m[3] ? Number(m[3]) : Number(aujourdhui.slice(0, 4));
      const iso = `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
      if (dateValideAssistant(iso)) return !m[3] && iso < aujourdhui ? `${a + 1}${iso.slice(4)}` : iso;
    }
    if (/\bapres[- ]demain\b/.test(t)) return decalerJours(aujourdhui, 2);
    if (/\bdemain\b/.test(t)) return decalerJours(aujourdhui, 1);
    if (/\baujourd'?hui\b/.test(t)) return aujourdhui;
    m = /\bdans (\d{1,2}) (jour|jours|semaine|semaines)\b/.exec(t);
    if (m) return decalerJours(aujourdhui, Number(m[1]) * (/semaine/.test(m[2]) ? 7 : 1));
    m = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)( prochain| prochaine)?\b/.exec(t);
    if (m) {
      const cible = JOURS_ASSISTANT.indexOf(m[1]);
      const auj = new Date(aujourdhui + 'T00:00:00Z').getUTCDay();
      let ecart = (cible - auj + 7) % 7;
      if (ecart === 0) ecart = 7;
      if (m[2] && ecart < 3) ecart += 7; // « vendredi prochain » dit un jeudi = pas demain
      return decalerJours(aujourdhui, ecart);
    }
    if (/\bla semaine prochaine\b/.test(t)) {
      const auj = new Date(aujourdhui + 'T00:00:00Z').getUTCDay();
      return decalerJours(aujourdhui, ((8 - auj) % 7) || 7);
    }
    return '';
  }

  function dateValideAssistant(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.toISOString().slice(0, 10) === iso;
  }

  /** Pure : l'heure écrite dans une phrase (« à 10 h », « 10h30 », « 10:30 », « 14 heures 15 »), « HH:MM » ou ''. */
  function heureDepuisTexte(texte) {
    const t = normaliserDemande(texte);
    const m = /\b(\d{1,2}) ?(?:h|:|heures?)(?: ?(\d{2}))?(?!\d)/.exec(t);
    if (!m) return '';
    const h = Number(m[1]);
    const mn = m[2] ? Number(m[2]) : 0;
    if (h > 23 || mn > 59) return '';
    return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
  }

  /**
   * Pure : les montants écrits dans une phrase, en euros (« 250 000 € », « 250.000,00 euros », « 1 200,50 », « 250k »).
   * Un nombre nu de 3 chiffres ou plus compte ; un pourcentage, un jour ou une heure, non.
   * @returns {number[]}
   */
  function montantsDepuisTexte(texte) {
    const t = normaliserDemande(texte).replace(/(\d) (?=\d{3}\b)/g, '$1');
    const montants = [];
    const re = /(\d+(?:[.\d]*\d)?(?:,\d{1,2})?)\s*(k\b|€|euros?\b)?/g;
    let m;
    while ((m = re.exec(t))) {
      const suite = t.slice(m.index + m[0].length, m.index + m[0].length + 8);
      const avant = t.slice(Math.max(0, m.index - 12), m.index);
      if (!m[2] && (/^\s*(%|h\b|:|\/|heures?|jours?|j\b|janv|fev|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)/.test(suite) || /(\ble|\bdu|\bau|\bdans|\/|:)\s*$/.test(avant))) continue;
      // Une année après un mois (« 14 novembre 2026 ») n'est pas un montant.
      if (!m[2] && /^(19|20)\d{2}$/.test(m[1]) && /(janv|fev|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*\.?\s*$/.test(avant)) continue;
      let brut = m[1].replace(/\.(?=\d{3})/g, '').replace(',', '.');
      let v = Number(brut);
      if (!Number.isFinite(v)) continue;
      if (m[2] === 'k') v *= 1000;
      if (!m[2] && v < 100) continue;
      montants.push(Math.round(v * 100) / 100);
    }
    return montants;
  }

  /** Pure : les parts écrites « 60/40 », « 60 % et 40 % », « 50-50 » → [60, 40] (somme 100), sinon []. */
  function partsDepuisTexte(texte) {
    const t = normaliserDemande(texte);
    let m = /\b(\d{1,3}) ?(?:\/|-|et) ?(\d{1,3})\b(?! ?(?:h|:|\d))/.exec(t);
    if (!m) m = /\b(\d{1,3}) ?%.{0,12}?\b(\d{1,3}) ?%/.exec(t);
    if (!m) return [];
    const a = Number(m[1]), b = Number(m[2]);
    return a + b === 100 ? [a, b] : [];
  }

  /** Mots utiles d'une phrase (≥ 3 lettres, hors mots vides) pour reconnaître un dossier. */
  function motsUtilesAssistant(texte) {
    return normaliserDemande(texte).replace(/[^a-z0-9' -]/g, ' ').split(/[\s']+/)
      .map(m => m.replace(/^-+|-+$/g, '')).filter(m => m.length >= 3 && !MOTS_VIDES_ASSISTANT.has(m) && !/^\d+$/.test(m));
  }

  /**
   * Pure : le dossier désigné par une phrase — par les mots de son nom (« MARTIN / DUPONT ») ou d'une de ses parties.
   * `dossiers` = [{ id, nom, parties?: [{ nom }], archive? }] ; les dossiers en cours passent avant les archivés.
   * Rend { dossier: id|'', candidats: [{ id, nom }] } — plusieurs candidats à égalité = à demander, jamais deviné.
   * @param {string} texte
   * @param {Array<{id:string, nom:string, parties?:Array<{nom?:string}>, archive?:boolean}>} dossiers
   */
  function reconnaitreDossier(texte, dossiers) {
    const mots = motsUtilesAssistant(texte);
    if (!mots.length) return { dossier: '', candidats: [] };
    const scores = [];
    (dossiers || []).forEach(d => {
      if (!d || !d.id) return;
      const nomsDossier = motsUtilesAssistant(d.nom || '');
      const nomsParties = (Array.isArray(d.parties) ? d.parties : []).flatMap(p => motsUtilesAssistant((p && p.nom) || ''));
      let score = 0;
      const vus = new Set();
      mots.forEach(m => {
        if (vus.has(m)) return;
        if (nomsDossier.some(n => n === m)) { score += 3; vus.add(m); }
        else if (nomsParties.some(n => n === m)) { score += 2; vus.add(m); }
        else if (m.length >= 5 && (nomsDossier.some(n => n.startsWith(m) || m.startsWith(n) && n.length >= 5))) { score += 1; vus.add(m); }
      });
      if (score) scores.push({ id: d.id, nom: d.nom || '', score: score + (d.archive ? -0.5 : 0) });
    });
    if (!scores.length) return { dossier: '', candidats: [] };
    scores.sort((a, b) => b.score - a.score || a.nom.localeCompare(b.nom));
    const meilleur = scores[0].score;
    const exaequo = scores.filter(s => s.score === meilleur);
    if (exaequo.length === 1) return { dossier: exaequo[0].id, candidats: exaequo.map(s => ({ id: s.id, nom: s.nom })) };
    return { dossier: '', candidats: exaequo.slice(0, 6).map(s => ({ id: s.id, nom: s.nom })) };
  }

  function premierQuiCorrespond(liste, t) {
    const x = liste.find(e => e.re.test(t));
    return x ? x.cle : '';
  }

  /** Le texte libre d'un rappel : la phrase sans « rappelle-moi », la date et le mot « pour le dossier … ». */
  function texteRappelDepuisPhrase(texte) {
    let t = String(texte || '').trim();
    t = t.replace(/^\s*(rappelle[- ]moi|rappel\s*:?|pense[- ]bête\s*:?|note (que|de)|n'oublie pas|fais[- ]moi penser)\s*(de|d'|à|a|que)?\s*/i, '');
    t = t.replace(/\b(après[- ]demain|demain|aujourd'hui|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)( prochain| prochaine)?\b/i, '')
      .replace(/\b(le )?\d{1,2}(er)? (janv|fév|fev|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)[a-zéû]*\.?( \d{4})?\b/i, '')
      .replace(/\b(le )?\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/, '')
      .replace(/\bdans \d{1,2} (jours?|semaines?)\b/i, '')
      .replace(/\s{2,}/g, ' ').replace(/^[\s,:;-]+|[\s,:;.-]+$/g, '').trim();
    // La date retirée laisse parfois « d'appeler… » ou « de prévenir… » en tête.
    t = t.replace(/^(de |d'|à |a |que |pour )/i, '').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  /**
   * Pure : lecture d'une demande par mots-clés, sans IA — le repli quand Ollama ne répond pas, et la voie rapide quand la
   * phrase est sans ambiguïté. Rend { intention, parametres, surete } : surete 'haute' (un seul groupe de mots-clés
   * reconnu, ou un geste explicite), 'basse' (plusieurs intentions possibles : à départager par l'IA), 'aucune'.
   * @param {string} texte @param {{ aujourdhui?: string }} [contexte]
   */
  function interpreterParMotsCles(texte, contexte) {
    const t = normaliserDemande(texte);
    const auj = (contexte && contexte.aujourdhui) || '';
    const touches = [];
    INTENTIONS_ASSISTANT.forEach(i => {
      const n = i.motifs.filter(re => re.test(t)).length;
      if (n) touches.push({ cle: i.cle, score: n + (i.poids || 0) });
    });
    const parametres = parametresDepuisTexte(t, texte, auj);
    // Des parts qui font 100 (« 60/40 ») sans autre mot : des quotités, pas une date.
    if (parametres.parts.length && !touches.some(x => x.cle === 'quotites')) touches.push({ cle: 'quotites', score: 1 });
    if (!touches.length) return { intention: 'inconnu', parametres, surete: 'aucune' };
    touches.sort((a, b) => b.score - a.score);
    let cle = touches[0].cle;
    // Quelques départages de bon sens avant l'IA : une date + une heure avec « signature » = placer ; un modèle d'email
    // reconnu avec « relance/envoie/demande » = email ; un mot « manque » sur les fonds = fonds.
    if (touches.some(x => x.cle === 'rendez_vous_placer') && parametres.date && parametres.heure && /\bsignature\b/.test(t)) cle = 'rendez_vous_placer';
    if (touches.some(x => x.cle === 'fonds_dossier') && /\bfonds\b/.test(t) && !/\b(appel de fonds|relanc|envoi|mail|confirm)/.test(t)) cle = 'fonds_dossier';
    if (touches.some(x => x.cle === 'appel_fonds') && /\bappel de fonds\b/.test(t) && !/\b(marque|coche|envoye|decoche|date|relanc|mail|email)\b/.test(t)) cle = 'appel_fonds';
    if (touches.some(x => x.cle === 'ouvrir_ecran') && parametres.ecran && !parametres.dossierTexte) cle = 'ouvrir_ecran';
    const second = touches[1];
    const surete = !second || touches[0].score >= second.score + 2 || cle !== touches[0].cle ? 'haute' : 'basse';
    return { intention: cle, parametres, surete };
  }

  /** Les paramètres qu'on lit dans la phrase elle-même, quelle que soit l'intention (code pur, jamais l'IA). */
  function parametresDepuisTexte(t, brut, aujourdhui) {
    const montants = montantsDepuisTexte(brut);
    const partie = premierQuiCorrespond(PARTIES_ASSISTANT, t);
    const mDept = /\b(?:dans le|du|departement|dept\.?) ?(\d{2,3})\b/.exec(t);
    return {
      date: aujourdhui ? dateDepuisTexte(brut, aujourdhui) : '',
      heure: heureDepuisTexte(brut),
      montant: montants.length ? montants[0] : null,
      montants,
      parts: partsDepuisTexte(brut),
      modele: premierQuiCorrespond(MODELES_EMAIL_ASSISTANT, t),
      echeance: premierQuiCorrespond(ECHEANCES_ASSISTANT, t),
      champ: premierQuiCorrespond(CHAMPS_DATE_ASSISTANT, t),
      partie,
      ecran: premierQuiCorrespond(ECRANS_ASSISTANT, t),
      typeBien: /\bcopro/.test(t) ? 'condo' : /\bterrain\b/.test(t) ? 'land' : /\b(maison|appartement|immeuble|bien)\b/.test(t) ? 'house' : '',
      departement: mDept ? mDept[1] : '',
      primo: /\bprimo/.test(t),
      collaborateur: /\bbastien\b/.test(t) ? 'Bastien ANGLUMENT' : /\bjulie\b/.test(t) ? 'Julie VASSELIN' : /\bjeremy\b/.test(t) ? 'Jérémy SAUJOT' : '',
      texte: texteRappelDepuisPhrase(brut),
      dossierTexte: ''
    };
  }

  /** Le contrôle d'une réponse de l'IA : intention dans la liste fermée, paramètres en chaînes. Rend une erreur ou null. */
  function validerReponseAssistant(objet) {
    if (!objet || typeof objet !== 'object') return "la réponse n'est pas un objet";
    if (typeof objet.intention !== 'string' || !INTENTIONS_ASSISTANT.some(i => i.cle === objet.intention)) {
      return `"intention" doit être une des clés suivantes : ${INTENTIONS_ASSISTANT.map(i => i.cle).join(', ')}`;
    }
    if (objet.parametres !== undefined && (objet.parametres === null || typeof objet.parametres !== 'object' || Array.isArray(objet.parametres))) return '"parametres" doit être un objet';
    return null;
  }

  /** L'intention par sa clé. */
  function intentionAssistant(cle) {
    return INTENTIONS_ASSISTANT.find(i => i.cle === cle) || null;
  }

  const exportes = {
    INTENTIONS_ASSISTANT, MODELES_EMAIL_ASSISTANT, ECHEANCES_ASSISTANT, CHAMPS_DATE_ASSISTANT, ECRANS_ASSISTANT, MOIS_ASSISTANT, JOURS_ASSISTANT,
    normaliserDemande, dateDepuisTexte, heureDepuisTexte, montantsDepuisTexte, partsDepuisTexte, reconnaitreDossier, motsUtilesAssistant,
    interpreterParMotsCles, parametresDepuisTexte, texteRappelDepuisPhrase, validerReponseAssistant, intentionAssistant
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  typeof module !== 'undefined' && module.exports ? {} : /** @type {any} */ (globalThis)
);
