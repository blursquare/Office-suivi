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
   * @typedef {{ cle: string, libelle: string, description: string, dossier?: boolean, dossierFacultatif?: boolean, parametres?: string[], exemples: string[],
   *   motifs: RegExp[], ecrit?: string, poids?: number }} IntentionAssistant
   */
  /** @type {IntentionAssistant[]} */
  var INTENTIONS_ASSISTANT = [
    { cle: 'etat_dossier', libelle: 'Où en est un dossier', description: 'état général d’un dossier : statut, pièces attendues, prochaine échéance, rendez-vous, fonds',
      dossier: true, exemples: ['Où en est le dossier MARTIN ?', 'Fais-moi un point sur LEROY', 'Où on en est avec DUPONT ?', 'Situation du dossier MARTIN'], motifs: [/\bou en est\b/, /\betat (du|de ce|de mon)? ?dossier\b/, /\b(point|resume|resumer|situation|statut|avancement)\b/, /\bou en sommes\b/, /\bou on en est\b/, /\bun point (sur|avec)\b/] },
    { cle: 'pieces_manquantes', libelle: 'Pièces manquantes', description: 'les pièces encore attendues sur un dossier',
      dossier: true, exemples: ['Quelles pièces manquent pour DUPONT ?', 'Il manque quoi comme pièces pour DUPONT ?', 'Qu’est-ce qu’on attend encore pour MARTIN ?'], motifs: [/\bpieces?\b/, /\bmanqu/, /\bil (me |nous )?reste a recevoir\b/, /\bqu.?est.?ce qu.?on attend\b/, /\battend(u|ue|ues|us)?\b/] },
    { cle: 'echeances_dossier', libelle: 'Échéances d’un dossier', description: 'les échéances et dates butoir d’un dossier, la prochaine étape',
      dossier: true, exemples: ['Quelles sont les échéances de MARTIN ?', 'Quand est la date butoir du prêt de LEROY ?', 'Quelle est la prochaine étape pour MARTIN ?'], motifs: [/\becheance/, /\bdate butoir\b/, /\bbutoir\b/, /\bprochaine etape\b/, /\bplanning\b/, /\bdelai/, /\bquand (est|doit|faut|signe)/] },
    { cle: 'coordonnees', libelle: 'Coordonnées d’une partie', description: 'téléphone, email, notaire ou agence d’une partie du dossier (vendeur, acquéreur, confrère)',
      dossier: true, parametres: ['partie'], exemples: ['Quel est le téléphone du vendeur dans MARTIN ?', 'Donne-moi l’email de l’acquéreur de DUPONT', 'Comment joindre le notaire de MARTIN ?'], motifs: [/\btelephone\b/, /\btel\b/, /\bnumero (du|de la|de l)\b/, /\b(e-?mail|adresse mail|courriel)\b/, /\bqui est le notaire\b/, /\bnotaire (du|de l)/, /\bconfrere\b/, /\bcoordonnees\b/, /\bjoindre\b/, /\bcontact\b/] },
    { cle: 'fonds_dossier', libelle: 'Fonds du dossier', description: 'fonds reçus et montant encore attendu sur un dossier',
      dossier: true, exemples: ['Combien il manque sur les fonds de MARTIN ?', 'Les fonds de LEROY sont arrivés ?', 'A-t-on reçu le virement de MARTIN ?'], motifs: [/\bfonds\b/, /\bvirement/, /\bargent\b/, /\bcombien (il )?(manque|reste)\b/] },
    { cle: 'taches_jour', libelle: 'Ce que j’ai à faire', description: 'la liste « À faire » du collaborateur : tâches du jour et rappels',
      exemples: ['Qu’est-ce que j’ai à faire aujourd’hui ?', 'Quelles sont mes tâches du jour ?', 'Mon programme aujourd’hui'], motifs: [/\ba faire\b/, /\bdois[- ]je faire\b/, /\bje dois faire\b/, /\bj.ai (a|quoi) faire\b/, /\bqu.?est.?ce (que )?(je|j.ai)\b.{0,20}\bfaire\b/, /\bquoi de prevu\b/, /\bma journee\b/, /\bmes taches\b/, /\btaches? (du jour|d.aujourd)/, /\bquoi faire\b/, /\bprogramme\b/] },
    { cle: 'depuis_hier', libelle: 'Depuis hier', description: 'ce qui a changé depuis hier 18 h : documents reçus, emails, demandes des clients',
      exemples: ['Qu’est-ce qui a changé depuis hier ?', 'Quoi de neuf depuis hier ?', 'Y a-t-il du nouveau depuis hier 18 h ?'], motifs: [/\bdepuis hier\b/, /\bquoi de neuf\b/, /\bnouveaut/, /\bqu.?est.?ce qui (a|s.est) (change|passe)\b/, /\bdu nouveau\b/] },
    // Étude 12/10 : « accéder au dossier local et aux scans pour vérifier les dernières pièces ou scans reçus et les ouvrir ».
    // Dossier facultatif : nommé, la liste s'y limite (et montre aussi les derniers fichiers de son dossier du NAS) ; sinon tout.
    { cle: 'derniers_documents', libelle: 'Derniers documents reçus', description: 'les dernières pièces arrivées (NAS, rangées) et les derniers scans du copieur (à ranger ou rangés), d’un dossier ou de tous, avec un bouton pour les ouvrir',
      dossierFacultatif: true, exemples: ['Quels sont les derniers scans reçus ?', 'Montre-moi les dernières pièces de MARTIN', 'Quelles pièces sont arrivées pour DUPONT ?', 'Ouvre le dernier scan'],
      motifs: [/\bderni(er|ere)s? (pieces?|scans?|documents?|fichiers?)\b/, /\bscans? (recus?|arrives?|a ranger|ranges?|du copieur)\b/, /\b(pieces?|documents?|fichiers?) (sont |est )?(recue?s?|arrivee?s?)\b/, /\bqu.?est.?ce qu.?on a recu\b/, /\bdossier (local|du nas)\b/], poids: 3 },
    { cle: 'rappel_ajouter', libelle: 'Ajouter un rappel', description: 'poser un rappel personnel (texte, date facultative, dossier facultatif) — fait aussitôt, annulable',
      parametres: ['texte', 'date'], ecrit: 'rappel', exemples: ['Rappelle-moi vendredi d’appeler le syndic pour DUPONT', 'Pense-bête : appeler le notaire demain', 'Fais-moi penser à relancer LEROY lundi'], motifs: [/\brappelle[- ]moi\b/, /\brappel\b/, /\bpense[- ]bete\b/, /\bnote (que|de)\b/, /\bn.oublie pas\b/, /\bfais[- ]moi penser\b/], poids: 2 },
    { cle: 'rappel_lister', libelle: 'Mes rappels', description: 'la liste des rappels personnels en cours',
      exemples: ['Mes rappels'], motifs: [/\bmes rappels\b/, /\bliste des rappels\b/] },
    { cle: 'email', libelle: 'Préparer un email', description: 'ouvrir la fenêtre d’email d’un dossier avec un modèle (prêt, RIB, provision, vente préalable, fonds, projet d’acte, confirmation du rendez-vous, relance des fonds, questionnaire, copie de l’acte) ou un texte libre — rien ne part sans « Envoyer »',
      dossier: true, parametres: ['modele', 'texte'], ecrit: 'email', exemples: ['Relance MARTIN pour son offre de prêt', 'Demande le RIB à DUPONT', 'Écris un mail à MARTIN pour lui demander son RIB', 'Envoie la provision à DUPONT', 'Relance LEROY pour les fonds'], motifs: [/\b(e-?mail|mail|courriel|message)\b/, /\brelanc/, /\becri[st] a\b/, /\benvoi/, /\bdemande[rz]? (le|la|les|un|une|son|sa)\b/, /\brib\b/, /\bconfirm/, /\bquestionnaire\b/, /\bprojet d.acte\b/, /\bprovision\b/, /\bcopie de l.acte\b/, /\battestation/], poids: 1 },
    { cle: 'echeance_cocher', libelle: 'Cocher une échéance', description: 'noter une étape faite : appel de fonds envoyé, projet envoyé, offre de prêt reçue, vente préalable réalisée, signature faite',
      dossier: true, parametres: ['echeance'], ecrit: 'fiche', exemples: ['Marque le projet envoyé pour DUPONT', 'Le projet est parti pour LEROY', 'On a reçu l’offre de prêt de MARTIN', 'Appel de fonds envoyé pour DUPONT', 'Note dans l’agenda l’appel de fonds envoyé pour MARTIN'], motifs: [/\bmarque[rz]?\b/, /\bcoche[rz]?\b/, /\bnote[rz]? (envoye|recu|fait|realise)/, /\b(c.est|est) (envoye|parti|fait|recu|signe)\b/, /\ba ete (envoye|recu|signe)\b/, /\bon a recu\b/, /\bj.ai (envoye|recu)\b/, /\bvalide[rz]?\b/], poids: 1 },
    { cle: 'echeance_decocher', libelle: 'Décocher une échéance', description: 'annuler la coche d’une étape (envoi effacé, offre à nouveau attendue)',
      dossier: true, parametres: ['echeance'], ecrit: 'fiche', exemples: ['Décoche l’appel de fonds de MARTIN', 'Décoche le projet envoyé de DUPONT'], motifs: [/\bdecoche/, /\bannule[rz]? la coche\b/, /\bpas (encore )?(envoye|recu|fait)\b/, /\bfinalement pas\b/, /\bn.est pas (envoye|recu|fait)\b/], poids: 3 },
    { cle: 'date_fiche', libelle: 'Noter une date sur la fiche', description: 'écrire une date sur la fiche : obtention du prêt, vente préalable, date butoir, appel de fonds, projet envoyé',
      dossier: true, parametres: ['champ', 'date'], ecrit: 'fiche', exemples: ['Mets la date butoir du prêt de MARTIN au 15 novembre', 'Change la date du prêt de DUPONT au 20 novembre'], motifs: [/\b(mets|mettre|note[rz]?|change[rz]?|modifie[rz]?|decale[rz]?|repousse[rz]?|reporte[rz]?) la date\b/, /\bdate (butoir |du pret |de la vente prealable |de l.appel |du projet )?(au|le) \d/, /\bbutoir (au|le) \d/, /\bpret (au|le) \d/], poids: 2 },
    { cle: 'creneaux_signature', libelle: 'Créneaux de signature', description: 'proposer des dates de signature possibles pour un dossier (règles de l’office)',
      dossier: true, exemples: ['Trouve une date de signature pour MARTIN', 'Quelles dates de signature possibles pour DUPONT ?'], motifs: [/\bcreneau/, /\btrouve[rz]? (une |des )?dates?\b/, /\bquand (peut[- ]on|pourrait[- ]on|signer)\b/, /\bdisponibilit/, /\bdates? (possible|libre)/, /\bproposer? (une |des )?dates?\b/, /\bquelle date\b/] },
    { cle: 'rendez_vous_placer', libelle: 'Placer la signature', description: 'placer le rendez-vous de signature d’un dossier dans l’agenda de l’office, à une date et une heure (confirmé avant)',
      dossier: true, parametres: ['date', 'heure'], ecrit: 'agenda', exemples: ['Place la signature MARTIN le 14 novembre à 10 h', 'Fixe la signature de LEROY le 20 novembre à 14 h'], motifs: [/\bplace[rz]?\b/, /\bfixe[rz]?\b/, /\bcale[rz]?\b/, /\bsignature (le|du|au) \d/, /\brendez[- ]vous de signature\b/, /\bprends? (le )?rendez/], poids: 2 },
    // Étude 07/10 : « Demander à CLAIRE : possibilité de placer plusieurs options de rendez-vous » — choix : options seules, sans
    // email, carte de confirmation avant ; « Placer » sur l'une en fait la signature et retire les autres.
    { cle: 'options_rendez_vous', libelle: 'Poser des options', description: 'poser plusieurs rendez-vous provisoires (options) dans l’agenda de l’office pour un dossier, sans email aux parties (confirmé avant)',
      dossier: true, parametres: ['creneaux'], ecrit: 'agenda', exemples: ['Pose des options pour MARTIN mardi à 14 h et jeudi à 10 h', 'Mets 3 options de signature pour DUPONT', 'Bloque le 20 novembre à 10 h et le 21 à 15 h pour LEROY'],
      motifs: [/\boptions?\b/, /\bprovisoires?\b/, /\bbloque[rz]?\b/, /\bplusieurs (rendez[- ]vous|rdv|creneaux|dates)\b/, /\b(pose[rz]?|mets?) (\d+ )?(des |deux |trois )?creneaux\b/], poids: 3 },
    { cle: 'sondage_dates', libelle: 'Proposer des dates aux clients', description: 'lancer un sondage de dates de signature auprès des clients ou du confrère (comme un Doodle)',
      dossier: true, ecrit: 'email', exemples: ['Propose des dates de signature aux clients de MARTIN'], motifs: [/\bsondage\b/, /\bdoodle\b/, /\bpropose[rz]? (des|plusieurs) dates\b/, /\bdates? aux clients\b/, /\bdemande[rz]? (leurs? )?disponibilit/], poids: 3 },
    { cle: 'rendez_vous_creer', libelle: 'Nouveau rendez-vous', description: 'créer un rendez-vous ordinaire dans l’agenda de l’office (titre, date, heure) — formulaire à valider',
      parametres: ['titre', 'date', 'heure'], ecrit: 'agenda', exemples: ['Rendez-vous avec le syndic jeudi à 14 h'], motifs: [/\b(nouveau|un|ajoute[rz]?|cree[rz]?|mets?) (un )?(rendez[- ]vous|rdv)\b/, /\brendez[- ]vous avec\b/, /\brdv avec\b/, /\b(mets?|ajoute[rz]?|cree[rz]?|note[rz]?|pose[rz]?)\b.{0,40}\b(dans|a) l.agenda\b/, /\breunion\b/], poids: 1 },
    { cle: 'agenda_jour', libelle: 'Agenda d’un jour', description: 'les rendez-vous de l’agenda de l’office un jour donné (aujourd’hui par défaut)',
      parametres: ['date'], exemples: ['Qu’est-ce qu’il y a à l’agenda demain ?', 'Quels rendez-vous demain ?', 'Qui signe vendredi ?'], motifs: [/\bagenda\b/, /\bqu.?est.?ce qu.?il y a\b/, /\brendez[- ]vous (de |d.)?(aujourd|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|ce |cette |la semaine|du jour)/, /\bqui (vient|signe|passe)\b/, /\bsignatures? (de |d.)?(aujourd|demain|la semaine|cette semaine)/] },
    { cle: 'appel_fonds', libelle: 'Appel de fonds', description: 'ouvrir l’outil Appel de fonds sur un dossier, pièces du NAS lues',
      dossier: true, exemples: ['Fais l’appel de fonds de MARTIN', 'Prépare l’appel de fonds pour DUPONT'], motifs: [/\bappel de fonds\b/, /\bdecompte\b/], poids: 3 },
    { cle: 'quotites', libelle: 'Quotités d’acquisition', description: 'calculer les quotités d’acquisition entre acquéreurs (apports, prêts, parts) et ouvrir l’outil',
      parametres: ['nombres', 'montant'], exemples: ['Quotités 60/40 pour LEROY sur 250 000 €'], motifs: [/\bquotite/, /\brepartition entre (les )?acquereurs\b/, /\bparts? (de |d.)?(chaque|chacun|acquisition)/], poids: 3 },
    { cle: 'provision', libelle: 'Provision sur frais', description: 'estimer la provision sur frais d’acte (frais de notaire) pour un prix, un type de bien et un département',
      parametres: ['montant', 'typeBien', 'departement', 'primo'], exemples: ['Provision pour une maison à 250 000 € dans le 41'], motifs: [/\bprovision\b/, /\bfrais (d.acte|de notaire|d.achat|d.acquisition)\b/, /\bcombien de frais\b/, /\bdroits (de mutation|d.enregistrement)\b/, /\bemoluments\b/], poids: 3 },
    { cle: 'prorata', libelle: 'Prorata', description: 'répartir une somme (taxe foncière, charges, loyer) entre vendeur et acquéreur à la date de l’acte',
      parametres: ['montant', 'date', 'debut', 'fin'], exemples: ['Prorata de 1 200 € de taxe foncière pour un acte le 15 juin'], motifs: [/\bprorata\b/, /\brepartir\b/, /\btaxe fonciere\b/, /\bcharges? de copro/, /\bpart (du vendeur|de l.acquereur)\b/], poids: 3 },
    { cle: 'preemption', libelle: 'Contrôle de l’urbanisme', description: 'ouvrir l’outil Contrôle de l’urbanisme (droits de préemption DPU, SAFER, bois ; monuments historiques) sur un dossier',
      dossier: true, exemples: ['Préemption sur le dossier MARTIN', 'Contrôle de l’urbanisme de DUPONT'], motifs: [/\bpreempt/, /\bcontrole (de |d.)?(l.)?urbanisme\b/, /\bmonuments? historiques?\b/, /\bdpu\b/, /\bsafer\b/, /\bdia\b/, /\bpurge/], poids: 3 },
    { cle: 'ouvrir_dossier', libelle: 'Ouvrir une fiche', description: 'ouvrir la fiche d’un dossier',
      dossier: true, exemples: ['Ouvre le dossier MARTIN', 'Montre-moi la fiche de LEROY'], motifs: [/\bouvr/, /\bmontre[rz]?\b/, /\baffiche[rz]?\b/, /\bla fiche\b/, /\bva (sur|dans|au)\b/] },
    { cle: 'ouvrir_ecran', libelle: 'Ouvrir un écran', description: 'aller sur un écran de CLAIRE : tableau de bord, agenda, suivi, Claire Scan, outils, réglages, nouveau dossier, répertoire',
      parametres: ['ecran'], exemples: ['Ouvre l’agenda'], motifs: [/\b(ouvr|va (sur|dans|au|a)|affiche|montre)[a-z]* (le |la |les |l.)?(tableau de bord|agenda|suivi|claire scan|scans?|outils|reglages|parametres|nouveau dossier|repertoire|annuaire|relecture)\b/] },
    { cle: 'rechercher', libelle: 'Chercher un dossier', description: 'retrouver un dossier par un nom, une adresse ou un mot',
      parametres: ['texte'], exemples: ['Quel dossier est rue des Lices à Blois ?', 'Cherche le dossier rue Nationale'], motifs: [/\bcherch/, /\btrouve[rz]? le dossier\b/, /\bquel dossier\b/, /\bqui (habite|vend|achete)\b/, /\bdossiers? (de|avec|a) \b/, /\bretrouve/] },
    { cle: 'archiver', libelle: 'Archiver un dossier', description: 'archiver un dossier (annulable)',
      dossier: true, ecrit: 'fiche', exemples: ['Archive le dossier MARTIN', 'Classe le dossier MARTIN'], motifs: [/\barchiv/, /\bclotur/, /\bclasse[rz]? (le |ce )?dossier\b/], poids: 3 },
    { cle: 'responsable', libelle: 'Changer le responsable', description: 'attribuer un dossier à un collaborateur (Bastien, Julie, Jérémy)',
      dossier: true, parametres: ['collaborateur'], ecrit: 'fiche', exemples: ['Attribue le dossier MARTIN à Julie', 'Donne le dossier LEROY à Jérémy'], motifs: [/\bresponsable\b/, /\battribu/, /\bconfie[rz]?\b/, /\b(donne[rz]?|passe[rz]?) (le |ce )?dossier a\b/], poids: 2 },
    { cle: 'aide', libelle: 'Aide', description: 'ce que l’assistant sait faire',
      exemples: ['Que sais-tu faire ?'], motifs: [/\baide\b/, /\bhelp\b/, /\bque (sais|peux)[- ]tu\b/, /\bqu.?est.?ce que tu (sais|peux)\b/, /\bcomment (ca marche|tu marches|t.utiliser)\b/], poids: 2 },
    // Étude 11/10 : « des réponses plus humaines, comme avec un assistant / collaborateur avec qui j'échange tous les jours ».
    // `salutation` : bonjour, merci, au revoir… — répondu par le code, tout de suite, sans IA. `conversation` : un échange libre
    // sans donnée de dossier (explication, conseil, question générale) — la seule réponse écrite par l'IA, voir /api/assistant/converser.
    { cle: 'salutation', libelle: 'Bonjour, merci…', description: 'une formule de politesse : bonjour, merci, au revoir, comment ça va',
      exemples: ['Bonjour', 'Merci beaucoup', 'Bonsoir CLAIRE', 'Ça va ?', 'À bientôt'],
      motifs: [/^(bonjour|bonsoir|salut|hello|coucou)\b/, /^(merci|un grand merci|super merci|parfait merci|genial merci|bravo|top)\b/, /^(ca va|comment (vas|allez)[- ](tu|vous))( bien| aujourd.?hui)?\s*[?!.]*$/, /^(au revoir|a bientot|a demain|a plus tard|bonne (journee|soiree|continuation))\b/] },
    { cle: 'conversation', libelle: 'Échanger librement', description: 'discuter sans donnée de dossier : expliquer une notion, donner un avis ou un conseil général, répondre à une question sur le métier ou sur CLAIRE',
      exemples: ['Explique-moi la différence entre une promesse et un compromis', 'Que penses-tu de ma façon de classer les dossiers ?', 'J’ai besoin d’un conseil', 'Peux-tu m’expliquer comment tu fonctionnes ?'],
      motifs: [/\bexplique[- ]moi\b/, /\bpeux[- ]tu m.expliquer\b/, /\bque penses[- ]tu\b/, /\bqu.?en penses[- ]tu\b/, /\bun conseil\b/, /\bton avis\b/, /\bj.ai besoin d.aide pour reflechir\b/, /\bparlons\b/] },
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
    'aout septembre octobre novembre decembre jour jours semaine mois annee euros euro ' +
    'monsieur madame mademoiselle messieurs mesdames mme mlle option options pose poser bloque bloquer provisoire provisoires ' +
    'creneau creneaux plusieurs').split(' '));

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
   * Pure : les créneaux (date + heure) d'une phrase qui en cite plusieurs — « mardi à 14 h et jeudi à 10 h », « le 20 novembre à
   * 10 h et 15 h », « mardi et jeudi à 14 h », « le 20/11 à 10 h, le 21/11 à 15 h ». Coupée sur « et », « ou », « puis », la virgule
   * et le point-virgule : une heure seule reprend la dernière date dite, une date seule prend l'heure qui suit. Triés, sans doublon,
   * `max` au plus. @param {string} texte @param {string} aujourdhui @param {number} [max] @returns {{date: string, heure: string}[]}
   */
  function creneauxDepuisTexte(texte, aujourdhui, max) {
    const morceaux = normaliserDemande(texte).split(/\s*(?:,|;|\bet\b|\bou\b|\bpuis\b)\s*/);
    const creneaux = [];
    let derniereDate = '';
    let enAttente = [];
    for (const m of morceaux) {
      // « le 21 à 15 h » après « le 20 novembre » : le jour seul reprend le mois de la date précédente.
      let date = dateDepuisTexte(m, aujourdhui);
      const jourSeul = !date && derniereDate ? /\b(?:le )?(1er|\d{1,2})(?:er)?\b(?! ?(?:h\b|:|heures?))/.exec(m) : null;
      if (jourSeul) {
        const iso = `${derniereDate.slice(0, 8)}${String(jourSeul[1] === '1er' ? 1 : Number(jourSeul[1])).padStart(2, '0')}`;
        if (dateValideAssistant(iso)) date = iso;
      }
      const heure = heureDepuisTexte(m);
      if (date && !heure) { enAttente.push(date); derniereDate = date; continue; }
      if (!heure) continue;
      if (date) derniereDate = date;
      if (!date && !derniereDate) continue;
      enAttente.forEach(d => creneaux.push({ date: d, heure }));
      enAttente = [];
      creneaux.push({ date: date || derniereDate, heure });
    }
    const vus = new Set();
    return creneaux.filter(c => { const k = c.date + ' ' + c.heure; if (vus.has(k)) return false; vus.add(k); return true; })
      .sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure)).slice(0, max || 5);
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

  // Civilité écrite devant un nom (étude 07/10 : « prendre aussi la civilité du client, ex. Monsieur MARTIN ») : 'M' ou 'Mme' + le
  // mot du nom qui suit. Sert à départager deux dossiers où le même nom désigne un homme et une femme.
  /** @param {string} texte @returns {Array<{ civilite: string, mot: string }>} */
  function civilitesDansPhrase(texte) {
    const t = normaliserDemande(texte);
    const liste = [];
    const re = /(?:^|[^a-z])(monsieur|mr\.?|m\.|madame|mme\.?|mademoiselle|mlle\.?)\s*([a-z][a-z-]{2,})/g;
    let m;
    while ((m = re.exec(t))) liste.push({ civilite: /^m(onsieur|r|\.)/.test(m[1]) && !/^m(me|lle|ademoiselle)/.test(m[1]) ? 'M' : 'Mme', mot: m[2] });
    return liste;
  }

  /** La civilité d'une partie ramenée à 'M', 'Mme' ou '' (inconnue). @param {any} p */
  function civilitePartieAssistant(p) {
    const c = normaliserDemande((p && p.civilite) || '');
    if (/^(m|mr|monsieur)\.?$/.test(c)) return 'M';
    if (/^(mme|mlle|madame|mademoiselle)\.?$/.test(c)) return 'Mme';
    return '';
  }

  // Mots d'une adresse ou d'un intitulé qui ne désignent rien à eux seuls.
  var MOTS_ADRESSE_ASSISTANT = new Set(['rue', 'avenue', 'chemin', 'route', 'allee', 'impasse', 'boulevard', 'place', 'quai', 'cours',
    'lieu', 'dit', 'lieudit', 'lotissement', 'residence', 'hameau', 'saint', 'sainte', 'grande', 'grand', 'petite', 'petit', 'cedex',
    'maitre', 'office', 'notarial', 'notaires', 'associes', 'scp', 'selarl', 'agence', 'immobilier', 'immobiliere', 'immo']);

  /** Chiffres d'un texte, sans le reste (téléphone, référence). @param {string} t */
  const chiffresAssistant = (t) => String(t || '').replace(/\D/g, '');

  /**
   * Pure : le dossier désigné par une phrase — par toutes les données de sa fiche (étude 07/10 : « ajoute le prénom s'il y a des
   * homonymes, prends même toutes les données des fiches ») : nom du dossier (3), nom ou nom d'usage d'une partie (2), prénom (1),
   * civilité écrite devant un nom (±1), mots de l'adresse du bien, de l'agence, des notaires (1 chacun, 2 au plus, sauf les mots
   * présents sur une grande part des fiches — la ville de l'étude, notre office), référence Authentic (6), email ou téléphone d'une
   * partie (6). `dossiers` = [{ id, nom, archive?, parties?: [{ nom, prenom?, nomUsage?, civilite? }], autres?: string[],
   * reference?: string, contacts?: string[] }] ; les dossiers en cours passent avant les archivés.
   * Rend { dossier: id|'', candidats: [{ id, nom }] } — plusieurs candidats à égalité = à demander, jamais deviné.
   * @param {string} texte
   * @param {Array<{id:string, nom:string, archive?:boolean, parties?:Array<{nom?:string, prenom?:string, nomUsage?:string, civilite?:string}>,
   *   autres?:string[], reference?:string, contacts?:string[]}>} dossiers
   */
  function reconnaitreDossier(texte, dossiers) {
    const civilites = civilitesDansPhrase(texte);
    const mots = motsUtilesAssistant(texte);
    const brut = normaliserDemande(texte);
    const emails = brut.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
    const nombres = (String(texte || '').match(/\d[\d .]{3,}\d/g) || []).map(chiffresAssistant).filter(n => n.length >= 4);
    const chiffresPhrase = chiffresAssistant(texte);
    if (!mots.length && !emails.length && !nombres.length) return { dossier: '', candidats: [] };
    const liste = (dossiers || []).filter(d => d && d.id);
    // Mots « autres » trop répandus (présents sur plus d'un tiers des fiches, dès 4 fiches) : ignorés.
    const motsAutres = new Map(liste.map(d => [d.id, [...new Set((Array.isArray(d.autres) ? d.autres : []).flatMap(x => motsUtilesAssistant(x || '')))]
      .filter(m => !MOTS_ADRESSE_ASSISTANT.has(m))]));
    const frequence = new Map();
    motsAutres.forEach(ms => ms.forEach(m => frequence.set(m, (frequence.get(m) || 0) + 1)));
    const tropRepandu = (m) => liste.length >= 4 && (frequence.get(m) || 0) > liste.length / 3;
    const scores = [];
    liste.forEach(d => {
      const parties = Array.isArray(d.parties) ? d.parties : [];
      const nomsDossier = motsUtilesAssistant(d.nom || '');
      const nomsParties = parties.flatMap(p => motsUtilesAssistant(((p && p.nom) || '') + ' ' + ((p && p.nomUsage) || '')));
      const prenoms = parties.flatMap(p => motsUtilesAssistant((p && p.prenom) || ''));
      const autres = (motsAutres.get(d.id) || []).filter(m => !tropRepandu(m));
      let score = 0;
      let pointsAutres = 0;
      const vus = new Set();
      mots.forEach(m => {
        if (vus.has(m)) return;
        if (nomsDossier.some(n => n === m)) { score += 3; vus.add(m); }
        else if (nomsParties.some(n => n === m)) { score += 2; vus.add(m); }
        else if (prenoms.some(n => n === m)) { score += 1; vus.add(m); }
        else if (m.length >= 5 && (nomsDossier.some(n => n.startsWith(m) || m.startsWith(n) && n.length >= 5))) { score += 1; vus.add(m); }
        else if (pointsAutres < 2 && autres.includes(m)) { score += 1; pointsAutres++; vus.add(m); }
      });
      // Référence Authentic (« A 2026 00247 ») : tous ses chiffres dans la phrase, ou son dernier groupe (≥ 4 chiffres).
      const ref = chiffresAssistant(d.reference || '');
      const dernierGroupe = (String(d.reference || '').match(/\d{4,}(?!.*\d)/) || [''])[0];
      if ((ref.length >= 6 && chiffresPhrase.includes(ref)) || (dernierGroupe && nombres.includes(dernierGroupe))) score += 6;
      // Email ou téléphone d'une partie cité tel quel.
      const contacts = (Array.isArray(d.contacts) ? d.contacts : []).map(c => String(c || '').toLowerCase());
      if (emails.some(e => contacts.some(c => c.split(/[;,\s]+/).includes(e)))) score += 6;
      const tels = contacts.flatMap(c => (c.match(/(?:\+33|0)[\d .-]{8,}/g) || []).map(chiffresAssistant)).filter(n => n.length >= 9).map(n => n.slice(-9));
      if (nombres.some(n => n.length >= 9 && tels.includes(n.slice(-9)))) score += 6;
      // « Monsieur MARTIN » : la partie de ce nom et de cette civilité gagne un point ; de l'autre civilité, elle en perd un.
      if (score) civilites.forEach(c => parties.forEach(p => {
        const civ = civilitePartieAssistant(p);
        const sesMots = motsUtilesAssistant(((p && p.nom) || '') + ' ' + ((p && p.nomUsage) || '') + ' ' + ((p && p.prenom) || ''));
        if (!civ || !sesMots.includes(c.mot)) return;
        score += civ === c.civilite ? 1 : -1;
      }));
      if (score > 0) scores.push({ id: d.id, nom: d.nom || '', score: score + (d.archive ? -0.5 : 0) });
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

  // ---- Proximité avec la base d'exemples (étude 06/10 : « il faut que le LLM comprenne des prompts qui se rapprochent de la base
  // de prompts ») : une phrase qui ressemble à un exemple d'une intention est comprise comme cette intention, même sans le
  // mot-clé exact ; les exemples les plus proches servent aussi de modèles dans le prompt de l'IA. Aucune IA ici.
  var MOTS_VIDES_DEMANDE = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'a', 'au', 'aux', 'en', 'et', 'ou', 'que', 'qu',
    'qui', 'quoi', 'est', 'ce', 'cette', 'ces', 'il', 'elle', 'je', 'j', 'tu', 'on', 'me', 'moi', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'pour', 'sur',
    'dans', 'par', 's', 'y', 'ca', 'svp', 'stp', 'merci', 'peux', 'peut', 'sont', 'quel', 'quels', 'quelle', 'quelles', 'a', 'veux', 'voudrais', 'faut', 'dossier', 'client']);

  /** Les « mots à sens » d'une phrase, réduits à leur début (« manquent » ~ « manque »), noms propres et nombres écartés. @param {string} texte @param {boolean} [exemple] */
  function empreinteDemande(texte, exemple) {
    const brut = String(texte || '');
    const noms = new Set();
    if (exemple) (brut.match(/\b[A-ZÉÈÀÂÊÎÔÛÇ]{3,}\b/g) || []).forEach(m => noms.add(normaliserDemande(m)));
    const mots = normaliserDemande(brut).replace(/[^a-z0-9']+/g, ' ').split(/[\s']+/).filter(Boolean);
    const racines = new Set();
    mots.forEach(m => {
      if (noms.has(m) || /^\d/.test(m) || MOTS_VIDES_DEMANDE.has(m) || m.length < 2) return;
      racines.add(m.slice(0, 5));
    });
    return racines;
  }

  /**
   * Pure : les `n` exemples de la base les plus proches d'une phrase, du plus proche au moins proche. Le score tient surtout à la
   * part de l'exemple retrouvée dans la phrase (un nom de dossier en plus ne pénalise pas), un peu à la part de la phrase
   * expliquée par l'exemple. @param {string} texte @param {number} [n]
   * @returns {Array<{ cle: string, exemple: string, score: number }>}
   */
  function exemplesProches(texte, n) {
    const phrase = empreinteDemande(texte, false);
    if (!phrase.size) return [];
    const liste = [];
    // Une politesse ne se devine pas par ressemblance (« ça va aller pour la signature de MARTIN ? » n'est pas « Ça va ? ») : mots-clés seuls.
    INTENTIONS_ASSISTANT.filter(i => i.cle !== 'salutation').forEach(i => (i.exemples || []).forEach(ex => {
      const e = empreinteDemande(ex, true);
      if (!e.size) return;
      let commun = 0;
      e.forEach(r => { if (phrase.has(r)) commun++; });
      if (!commun) return;
      liste.push({ cle: i.cle, exemple: ex, score: 0.7 * (commun / e.size) + 0.3 * (commun / phrase.size) });
    }));
    liste.sort((a, b) => b.score - a.score);
    return liste.slice(0, n || 5);
  }

  /**
   * Pure : l'intention de la base dont un exemple ressemble assez à la phrase (score ≥ 0,6 et avance de 0,12 sur toute autre
   * intention), sinon ''. @param {string} texte
   */
  function intentionParExemples(texte) {
    const proches = exemplesProches(texte, 12);
    if (!proches.length || proches[0].score < 0.6) return '';
    const autre = proches.find(x => x.cle !== proches[0].cle);
    return !autre || proches[0].score - autre.score >= 0.12 ? proches[0].cle : '';
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
    // « Bonjour, où en est MARTIN ? » : la demande précise gagne sur la formule de politesse ou l'échange libre.
    if (touches.length > 1) {
      const precis = touches.filter(x => x.cle !== 'salutation' && x.cle !== 'conversation');
      if (precis.length) touches.splice(0, touches.length, ...precis);
    }
    const parametres = parametresDepuisTexte(t, texte, auj);
    // Des parts qui font 100 (« 60/40 ») sans autre mot : des quotités, pas une date.
    if (parametres.parts.length && !touches.some(x => x.cle === 'quotites')) touches.push({ cle: 'quotites', score: 1 });
    // Aucun mot-clé : une phrase proche d'un exemple de la base est comprise comme cette intention (surete 'moyenne' : les
    // gestes qui écrivent restent confirmés ou annulables côté poste).
    if (!touches.length) {
      const proche = intentionParExemples(texte);
      return proche ? { intention: proche, parametres, surete: 'haute', parExemple: true } : { intention: 'inconnu', parametres, surete: 'aucune' };
    }
    touches.sort((a, b) => b.score - a.score);
    let cle = touches[0].cle;
    // Quelques départages de bon sens avant l'IA : une date + une heure avec « signature » = placer ; un modèle d'email
    // reconnu avec « relance/envoie/demande » = email ; un mot « manque » sur les fonds = fonds.
    if (touches.some(x => x.cle === 'rendez_vous_placer') && parametres.date && parametres.heure && /\bsignature\b/.test(t)) cle = 'rendez_vous_placer';
    if (touches.some(x => x.cle === 'fonds_dossier') && /\bfonds\b/.test(t) && !/\b(appel de fonds|relanc|envoi|mail|confirm)/.test(t)) cle = 'fonds_dossier';
    if (touches.some(x => x.cle === 'appel_fonds') && /\bappel de fonds\b/.test(t) && !/\b(marque|coche|envoye|decoche|date|relanc|mail|email)\b/.test(t)) cle = 'appel_fonds';
    if (touches.some(x => x.cle === 'ouvrir_ecran') && parametres.ecran && !parametres.dossierTexte) cle = 'ouvrir_ecran';
    // « Appel de fonds envoyé pour MARTIN », « Note dans l'agenda le projet envoyé » (étude 07/10) : un envoi FAIT, à cocher — la
    // coche note aussi « Appel de fonds envoyé » dans le lieu du rendez-vous Outlook. Jamais quand la phrase demande de le faire.
    if (parametres.echeance && /^(appelFonds|projetEnvoye)$/.test(parametres.echeance) && /\b(envoyee?s?|partie?s?)\b/.test(t)
      && !/\b(fais|faire|prepare[rz]?|redige[rz]?|calcule[rz]?|decoche[rz]?|pas (encore )?envoye|relanc|mail|email)\b/.test(t)) {
      if (!touches.some(x => x.cle === 'echeance_cocher')) touches.push({ cle: 'echeance_cocher', score: 0 });
      cle = 'echeance_cocher';
    }
    const second = touches[1];
    let surete = !second || touches[0].score >= second.score + 2 || cle !== touches[0].cle ? 'haute' : 'basse';
    // Plusieurs intentions se disputent la phrase : l'exemple le plus proche tranche s'il est parmi elles.
    if (surete === 'basse') {
      const proche = intentionParExemples(texte);
      if (proche && touches.some(x => x.cle === proche)) { cle = proche; surete = 'haute'; }
    }
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
      creneaux: aujourdhui ? creneauxDepuisTexte(brut, aujourdhui) : [],
      // « 3 options », « trois créneaux » : le nombre demandé quand aucun créneau n'est écrit.
      nombre: (() => { const m = /\b(\d|deux|trois|quatre|cinq) (options?|creneaux|dates|rendez[- ]vous)\b/.exec(t); return m ? ({ deux: 2, trois: 3, quatre: 4, cinq: 5 }[m[1]] || Number(m[1])) : 0; })(),
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
    normaliserDemande, dateDepuisTexte, heureDepuisTexte, creneauxDepuisTexte, montantsDepuisTexte, partsDepuisTexte, reconnaitreDossier, motsUtilesAssistant,
    interpreterParMotsCles, civilitesDansPhrase, exemplesProches, intentionParExemples, parametresDepuisTexte, texteRappelDepuisPhrase, validerReponseAssistant, intentionAssistant
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  typeof module !== 'undefined' && module.exports ? {} : /** @type {any} */ (globalThis)
);
