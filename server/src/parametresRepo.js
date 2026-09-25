// Réglages de l'étude, persistés en base (table `parametres`, voir db.js) — pas dans config.json,
// qui reste réservé aux réglages d'infrastructure posés une fois par qui installe l'exécutable
// (mot de passe partagé, port, racine du NAS). Ici, c'est une donnée métier que l'étude doit
// pouvoir modifier elle-même depuis l'écran « Réglages » (voir routes/reglages.js, script.js),
// partagée entre tous les postes puisqu'elle vit dans la même base que les dossiers.
//
// Un seul blob JSON sous une clé unique plutôt qu'une colonne par champ : rien ici n'est filtré/
// trié par SQL ailleurs (contrairement aux colonnes promues de dossiersRepo.js), donc pas de
// raison de complexifier le schéma — même principe que le blob `data` des dossiers.
'use strict';

const CLE_REGLAGES = 'reglages';

// Compte rendu du DERNIER tour de la tâche de rappels (voir jobs/rappels.js). Stocké sous sa
// propre clé plutôt que dans le blob `reglages` : ce n'est pas un réglage saisi par l'étude mais
// un état produit par le serveur, et `assainirReglages()` (liste blanche stricte) le jetterait à
// chaque enregistrement du formulaire.
//
// Raison d'être : jusqu'ici `executerTacheRappels()` construisait soigneusement `resultat.erreurs`
// et PERSONNE ne lisait ce tableau — la tâche tourne toutes les 30 minutes dans un serveur lancé
// SANS FENÊTRE (Lancer-CLAIRE-en-arriere-plan.vbs), donc même un console.warn n'aurait été vu de
// personne. Un mot de passe d'application révoqué, et les rappels s'arrêtaient en silence : c'est
// précisément l'ABSENCE de message qui aurait dû alerter, et rien ne la signalait.
const CLE_DERNIER_TOUR = 'dernier-tour-rappels';

// Copies rangées par Gmail dans « Messages envoyés », en attente d'effacement (voir
// nettoyageGmail.js). Même raison que le compte rendu ci-dessus pour une clé à part : c'est un
// état produit par le serveur, pas un réglage.
const CLE_COPIES_GMAIL = 'copies-gmail-a-effacer';
const CLE_SECRET_LIENS = 'secret-liens-pieces';

// Noms de fichiers écartés à la main pour une pièce de la checklist (bouton « Réinitialiser » d'une
// pièce mal reconnue, voir script.js). Longtemps gardés dans le navigateur de chaque poste : deux
// postes pouvaient alors rendre deux verdicts différents pour la même pièce du même dossier, et
// l'exclusion restait invisible. En base, ils sont partagés et listés dans les Réglages.
const CLE_EXCLUSIONS_PIECES = 'exclusions-noms-pieces';
const MAX_NOMS_PAR_PIECE = 200;

// Corrections apprises (script.js, memoriserCorrection) : quand l'étude reclasse une date ou une
// obligation du vendeur à l'import d'un avant-contrat, la clause est retenue pour être reconnue au
// prochain acte de même trame. Longtemps gardées dans le navigateur de chaque poste : une
// correction faite par un collaborateur n'était jamais « apprise » pour les dossiers créés depuis
// un autre poste. En base, elles profitent à tout le bureau.
const CLE_CORRECTIONS_APPRISES = 'corrections-apprises';
const MAX_CORRECTIONS_APPRISES = 500;
const CATEGORIES_CORRECTION = ['date', 'engagement'];

function assainirCorrectionApprise(brut) {
  const b = brut && typeof brut === 'object' ? brut : null;
  if (!b || typeof b.id !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(b.id)) return null;
  if (!Array.isArray(b.tokens) || typeof b.classification !== 'string' || !b.classification.trim()) return null;
  const tokens = Array.from(new Set(b.tokens.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.slice(0, 60)))).slice(0, 200);
  if (tokens.length < 3) return null;
  return {
    id: b.id,
    tokens,
    contexteExemple: typeof b.contexteExemple === 'string' ? b.contexteExemple.slice(0, 200) : '',
    categorie: CATEGORIES_CORRECTION.indexOf(b.categorie) === -1 ? 'date' : b.categorie,
    classification: b.classification.trim().slice(0, 30),
    libelle: typeof b.libelle === 'string' && b.libelle.trim() ? b.libelle.trim().slice(0, 120) : null,
    nbConfirmations: Number.isFinite(b.nbConfirmations) && b.nbConfirmations >= 1 ? Math.floor(b.nbConfirmations) : 1,
    dateMaj: typeof b.dateMaj === 'string' ? b.dateMaj.slice(0, 40) : new Date().toISOString()
  };
}

// Au-delà du plafond, on garde les corrections les plus confirmées puis les plus récentes — même
// règle que côté navigateur.
function assainirCorrectionsApprises(brut) {
  if (!Array.isArray(brut)) return [];
  const parId = new Map();
  for (const c of brut) {
    const propre = assainirCorrectionApprise(c);
    if (propre) parId.set(propre.id, propre);
  }
  const liste = Array.from(parId.values());
  if (liste.length > MAX_CORRECTIONS_APPRISES) {
    liste.sort((a, b) => (b.nbConfirmations - a.nbConfirmations) || b.dateMaj.localeCompare(a.dateMaj));
    liste.length = MAX_CORRECTIONS_APPRISES;
  }
  return liste;
}

// Sauvegarde automatique de la base (voir sauvegarde.js) : le dossier de destination choisi dans
// les Réglages, et l'état des dernières tentatives. Deux clés à part du blob `reglages`, comme le
// compte rendu des rappels : l'état est produit par le serveur, pas saisi par l'étude.
const CLE_REGLAGE_SAUVEGARDE = 'sauvegarde';
const CLE_ETAT_SAUVEGARDE = 'etat-sauvegarde';

function assainirTentativeSauvegarde(t) {
  if (!t || typeof t !== 'object' || typeof t.at !== 'string') return null;
  const nombre = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    at: t.at.slice(0, 40),
    ok: !!t.ok,
    fichier: texteBorne(t.fichier, 200),
    dossier: texteBorne(t.dossier, 500),
    locale: !!t.locale,
    taille: nombre(t.taille),
    nbDossiers: nombre(t.nbDossiers),
    supprimes: Array.isArray(t.supprimes) ? t.supprimes.filter((n) => typeof n === 'string').slice(0, 50) : [],
    erreur: t.erreur ? texteBorne(String(t.erreur), 500) : null
  };
}

function assainirEtatSauvegarde(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  return {
    derniereReussie: typeof b.derniereReussie === 'string' ? b.derniereReussie.slice(0, 40) : null,
    derniereTentative: assainirTentativeSauvegarde(b.derniereTentative)
  };
}

function assainirExclusionsPieces(brut) {
  const propre = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return propre;
  for (const [cle, noms] of Object.entries(brut)) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(cle) || !Array.isArray(noms)) continue;
    const liste = Array.from(new Set(noms.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().slice(0, 300))));
    if (liste.length) propre[cle] = liste.slice(-MAX_NOMS_PAR_PIECE);
  }
  return propre;
}
const MAX_COPIES_EN_ATTENTE = 500;

function assainirCopiesEnAttente(brut) {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((c) => c && typeof c.messageId === 'string' && c.messageId.trim() && Number.isFinite(c.envoyeLe))
    .map((c) => ({
      messageId: c.messageId,
      envoyeLe: c.envoyeLe,
      essais: Number.isFinite(c.essais) && c.essais >= 0 ? Math.floor(c.essais) : 0
    }))
    .slice(-MAX_COPIES_EN_ATTENTE);
}

// Commentaires de l'étude sur les rapports de relecture d'actes (Outil 2 — voir
// routes/auditRetours.js et le « mode commentaires » de script.js). Stockés en BASE, pas dans le
// navigateur : ils sont partagés entre les postes, et surtout ils doivent survivre au changement
// de poste ou au vidage du cache — ce sont eux qui disent, relus plus tard, où les règles de
// l'outil se trompent. Plafonnés : au-delà, les plus anciens partent (ils ont déjà été exportés
// et analysés, ou ne le seront plus).
const CLE_RETOURS_AUDIT = 'audit-retours';
const MAX_RETOURS_AUDIT = 1000;
const VERDICTS_RETOUR_AUDIT = ['juste', 'faux_positif', 'mal_formule', 'gravite', 'manque'];
const GRAVITES_AUDIT = ['CRITIQUE', 'IMPORTANT', 'A_VERIFIER', 'INFORMATION'];

function texteBorne(valeur, max) {
  return typeof valeur === 'string' ? valeur.trim().slice(0, max) : '';
}

function assainirRetourAudit(brut) {
  const b = (brut && typeof brut === 'object') ? brut : null;
  if (!b || VERDICTS_RETOUR_AUDIT.indexOf(b.verdict) === -1) return null;
  const c = (b.constat && typeof b.constat === 'object') ? b.constat : null;
  const commentaire = texteBorne(b.commentaire, 2000);
  // Un « oubli » de l'audit n'a pas de constat derrière lui : sans texte il ne dit rien.
  if (b.verdict === 'manque' && !commentaire) return null;
  if (b.verdict !== 'manque' && !c) return null;
  return {
    id: texteBorne(b.id, 64) || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    date: texteBorne(b.date, 40) || new Date().toISOString(),
    verdict: b.verdict,
    portee: b.portee === 'dossier' ? 'dossier' : 'tous',
    commentaire,
    graviteSouhaitee: GRAVITES_AUDIT.indexOf(b.graviteSouhaitee) >= 0 ? b.graviteSouhaitee : null,
    dossierCle: texteBorne(b.dossierCle, 200),
    dossierNom: texteBorne(b.dossierNom, 200),
    document: texteBorne(b.document, 200),
    mode: b.mode === 'acte' ? 'acte' : 'compromis',
    typeBien: texteBorne(b.typeBien, 20),
    empreinte: texteBorne(b.empreinte, 600),
    constat: c ? {
      categorie: texteBorne(c.categorie, 40),
      gravite: GRAVITES_AUDIT.indexOf(c.gravite) >= 0 ? c.gravite : 'INFORMATION',
      titre: texteBorne(c.titre, 300),
      description: texteBorne(c.description, 1000),
      phrase: texteBorne(c.phrase, 600),
      page: Number.isFinite(c.page) ? c.page : null
    } : null
  };
}

function assainirRetoursAudit(brut) {
  if (!Array.isArray(brut)) return [];
  return brut.map(assainirRetourAudit).filter(Boolean).slice(-MAX_RETOURS_AUDIT);
}

const PORT_SMTP_PAR_DEFAUT = 25;

const REGLAGES_PAR_DEFAUT = Object.freeze({
  emailActif: false,
  // Boîte aux lettres qui DÉCLENCHE le flux Power Automate : tous les messages de CLAIRE lui sont
  // adressés, et c'est l'objet de chaque email qui désigne le vrai destinataire du message Teams
  // (voir envoiEmail.js pour la convention complète).
  emailPasserelle: '',
  smtpHote: '',
  smtpPort: PORT_SMTP_PAR_DEFAUT,
  smtpSecurise: false,
  smtpUtilisateur: '',
  smtpMotDePasse: '',
  smtpExpediteur: '',
  copieEmail: '',
  emailsResponsables: {}
});

function texteNettoye(valeur) {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

// Assainit un objet réglages quelconque (venant de la base ou d'une requête PUT) vers la forme
// attendue — jamais de valeur exotique propagée plus loin (un JSON malformé en base, par exemple,
// ne doit jamais faire planter le job de rappels qui lit ces réglages toutes les 30 minutes).
//
// `precedent` (les réglages déjà en base) sert au seul mot de passe SMTP : la route GET ne le
// renvoie jamais au navigateur (voir routes/reglages.js), le formulaire ne peut donc pas le
// réémettre à l'enregistrement — absent ou `null`, on garde celui déjà stocké ; chaîne vide
// explicite, on l'efface ; chaîne non vide, on le remplace.
function assainirReglages(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};

  const emails = (b.emailsResponsables && typeof b.emailsResponsables === 'object' && !Array.isArray(b.emailsResponsables))
    ? b.emailsResponsables : {};
  const emailsPropres = {};
  for (const [nom, email] of Object.entries(emails)) {
    if (typeof nom === 'string' && typeof email === 'string' && email.trim()) {
      emailsPropres[nom] = email.trim();
    }
  }

  const port = Number.parseInt(b.smtpPort, 10);

  // Reprise des anciennes clés Teams (teamsActif/teamsCopieEmail), deux générations en arrière :
  // ces deux réglages-là gardent exactement le même sens d'une architecture d'envoi à l'autre, et
  // les faire ressaisir serait une régression silencieuse. Le premier enregistrement depuis l'écran
  // Réglages persiste les clés actuelles et fait disparaître les anciennes, cet objet étant écrit
  // tel quel par ecrireReglages(). Rien à reprendre en revanche de `fluxEmailUrl`/`teamsWebhookUrl` :
  // le déclencheur HTTP n'existe plus du tout (voir envoiEmail.js).
  const motDePasse = (typeof b.smtpMotDePasse === 'string')
    ? b.smtpMotDePasse
    : texteNettoye(p.smtpMotDePasse);

  return {
    emailActif: b.emailActif === true || (b.emailActif === undefined && b.teamsActif === true),
    emailPasserelle: texteNettoye(b.emailPasserelle),
    smtpHote: texteNettoye(b.smtpHote),
    smtpPort: Number.isInteger(port) && port > 0 && port <= 65535 ? port : PORT_SMTP_PAR_DEFAUT,
    smtpSecurise: b.smtpSecurise === true,
    smtpUtilisateur: texteNettoye(b.smtpUtilisateur),
    smtpMotDePasse: motDePasse.trim(),
    smtpExpediteur: texteNettoye(b.smtpExpediteur),
    // Adresse recevant une copie de CHAQUE message envoyé, quel que soit le responsable
    // destinataire — demandé explicitement par l'étude, pour rester informée de tous les envois
    // sans dépendre du fait qu'elle soit elle-même responsable du dossier concerné. La clé
    // actuelle l'emporte dès qu'elle est présente, même vide : sans ça, vider cette adresse ne
    // tiendrait pas tant que l'ancienne clé Teams en porterait encore une.
    copieEmail: (typeof b.copieEmail === 'string') ? b.copieEmail.trim() : texteNettoye(b.teamsCopieEmail),
    emailsResponsables: emailsPropres
  };
}

// Même discipline que `assainirReglages` : rien d'exotique ne ressort d'ici, y compris si la
// valeur en base a été écrite par une version antérieure ou corrompue à la main. Les erreurs sont
// plafonnées — un tour qui échoue sur soixante dossiers n'a pas à faire grossir indéfiniment une
// ligne de base que personne ne lira au-delà des premières.
const MAX_ERREURS_CONSERVEES = 20;

function assainirDernierTour(brut) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const entier = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const erreurs = Array.isArray(b.erreurs)
    ? b.erreurs.filter((e) => typeof e === 'string' && e.trim()).slice(0, MAX_ERREURS_CONSERVEES)
    : [];
  const avertissements = Array.isArray(b.avertissements)
    ? b.avertissements.filter((e) => typeof e === 'string' && e.trim()).slice(0, MAX_ERREURS_CONSERVEES)
    : [];
  return {
    at: typeof b.at === 'string' ? b.at : '',
    rappelsDus: entier(b.rappelsDus),
    rappelsEnvoyes: entier(b.rappelsEnvoyes),
    erreurs,
    // Ce qui n'a PAS empêché les rappels de partir (la copie Gmail restée dans « Messages
    // envoyés ») : affiché à part, sans faire passer l'encart en alerte.
    avertissements,
    // 'automatique' (le minuteur de 30 min) ou 'manuel' (bouton « Lancer un tour maintenant ») :
    // sans ça, l'étude ne saurait pas si la ligne affichée vient de son propre clic ou du job.
    declenche: b.declenche === 'manuel' ? 'manuel' : 'automatique'
  };
}

// Réglages de la relecture d'actes par l'API Claude (Outil 2) — rangés sous leur PROPRE clé, à
// part des réglages d'envoi d'email : la liste blanche d'assainirReglages() ne les connaît pas, et
// deux écrans différents n'ont pas à s'écraser l'un l'autre.
//
// La clé API suit la même discipline que le mot de passe SMTP : elle ne ressort JAMAIS de la base
// (voir routes/relectureClaude.js), et `precedent` permet de la conserver quand le formulaire ne
// la renvoie pas — absente ou `null`, on garde celle en base ; chaîne vide explicite, on l'efface.
const CLE_REGLAGES_CLAUDE = 'relecture-claude';
// Modèles proposés à l'étude. Sonnet 5 par défaut : c'est celui retenu dans le prototype
// « Notariat IA » fourni par l'étude, et il coûte 2,5 fois moins qu'Opus 5 à l'usage.
const MODELES_CLAUDE = ['claude-sonnet-5', 'claude-opus-5'];
const MODELE_CLAUDE_PAR_DEFAUT = 'claude-sonnet-5';

function assainirReglagesClaude(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};
  const cle = (typeof b.cleApi === 'string') ? b.cleApi.trim() : texteNettoye(p.cleApi);
  return {
    cleApi: cle,
    modele: MODELES_CLAUDE.indexOf(b.modele) >= 0 ? b.modele
      : (MODELES_CLAUDE.indexOf(p.modele) >= 0 ? p.modele : MODELE_CLAUDE_PAR_DEFAUT)
  };
}

// Jeton GitHub de la mise à jour en un clic (voir miseAJour.js) : même discipline que la clé API
// Anthropic — jamais renvoyé par une route ; absent ou `null` dans la requête, on garde celui en
// base ; chaîne vide explicite, on l'efface.
const CLE_MISE_A_JOUR = 'mise-a-jour';

function assainirReglagesMiseAJour(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};
  const jeton = (typeof b.jetonGithub === 'string') ? b.jetonGithub.trim() : texteNettoye(p.jetonGithub);
  // Un jeton GitHub ne contient ni espace ni caractère de contrôle : tout le reste est un collage raté.
  return { jetonGithub: /^[A-Za-z0-9_]{20,255}$/.test(jeton) ? jeton : '' };
}

// Agenda de l'office (voir agendaOffice.js/agendaWatch.js) : une seule URL, publiée depuis Outlook
// (« Publier ce calendrier », sans authentification — même flux que l'artefact « brief du matin »
// de l'étude), rangée sous sa PROPRE clé plutôt que dans le blob `reglages` (envoi d'email) — deux
// écrans différents, deux réglages indépendants.
const CLE_REGLAGES_AGENDA = 'agenda-office';

function assainirReglagesAgenda(brut) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  // Une adresse copiée depuis Outlook commence parfois par webcal:// (protocole d'abonnement) :
  // c'est la même adresse en https, convertie ici pour être acceptée et lisible par fetch.
  const url = texteBorne(b.icsUrl, 2000).replace(/^webcals?:\/\//i, 'https://');
  // Contrôle de forme minimal (schéma http/https) : n'empêche pas d'enregistrer une URL fausse,
  // mais attrape un collage manifestement raté (un chemin de fichier, du texte au hasard) avant
  // que le tour de surveillance ne s'y casse les dents en silence.
  return { icsUrl: /^https?:\/\//i.test(url) ? url : '' };
}

// Compte rendu du DERNIER tour de lecture de l'agenda — même raison d'être que CLE_DERNIER_TOUR
// pour les rappels par email : un flux devenu injoignable (lien de publication révoqué, calendrier
// dépublié dans Outlook) arrêterait de mettre à jour les dossiers SANS RIEN LE SIGNALER si personne
// ne consultait ce compte rendu. Plafonné comme les autres listes de ce fichier.
const CLE_DERNIER_TOUR_AGENDA = 'dernier-tour-agenda';
const MAX_ENTREES_TOUR_AGENDA = 50;

function assainirEntreeDetectionAgenda(brut) {
  const b = (brut && typeof brut === 'object') ? brut : null;
  if (!b) return null;
  return {
    dossierId: texteBorne(b.dossierId, 80),
    dossierNom: texteBorne(b.dossierNom, 200),
    action: ['appelFonds', 'projetEnvoye', 'rendezVousSignature'].includes(b.action) ? b.action : '',
    dateIso: texteBorne(b.dateIso, 10),
    // Rendez-vous de signature : date déplacée (ancienne) ou date saisie à la main qui diffère de
    // l'agenda (dateFiche) — affichées dans le compte rendu des Réglages.
    ancienneDate: texteBorne(b.ancienneDate, 10),
    dateFiche: texteBorne(b.dateFiche, 10),
    reference: texteBorne(b.reference, 300),
    resume: texteBorne(b.resume, 300)
  };
}

function assainirDernierTourAgenda(brut) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const listeBornee = (v) => (Array.isArray(v) ? v.map(assainirEntreeDetectionAgenda).filter(Boolean).slice(0, MAX_ENTREES_TOUR_AGENDA) : []);
  return {
    at: texteBorne(b.at, 40),
    ok: !!b.ok,
    dossiersVerifies: Number.isFinite(b.dossiersVerifies) && b.dossiersVerifies >= 0 ? Math.floor(b.dossiersVerifies) : 0,
    misAJour: listeBornee(b.misAJour),
    dejaRenseignes: listeBornee(b.dejaRenseignes),
    sansCorrespondance: listeBornee(b.sansCorrespondance),
    erreur: b.erreur ? texteBorne(String(b.erreur), 1500) : null,
    lienPasseEnHttps: !!b.lienPasseEnHttps,
    declenche: b.declenche === 'manuel' ? 'manuel' : 'automatique'
  };
}

function creerRepoParametres(db) {
  const lireStmt = db.prepare('SELECT valeur FROM parametres WHERE cle = ?');
  const ecrireStmt = db.prepare(
    'INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur'
  );

  function lireReglages() {
    const ligne = lireStmt.get(CLE_REGLAGES);
    if (!ligne) return { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {} };
    try {
      return assainirReglages(JSON.parse(ligne.valeur));
    } catch (e) {
      return { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {} };
    }
  }

  function ecrireReglages(reglages) {
    const propre = assainirReglages(reglages, lireReglages());
    ecrireStmt.run(CLE_REGLAGES, JSON.stringify(propre));
    return propre;
  }

  // Absent = la tâche n'a encore jamais tourné depuis l'installation (ou l'envoi n'a jamais été
  // configuré : un tour qui sort avant d'avoir rien tenté n'écrit rien, voir executerTacheRappels).
  function lireDernierTour() {
    const ligne = lireStmt.get(CLE_DERNIER_TOUR);
    if (!ligne) return null;
    try {
      return assainirDernierTour(JSON.parse(ligne.valeur));
    } catch (e) {
      return null;
    }
  }

  function ecrireDernierTour(resultat) {
    const propre = assainirDernierTour(resultat);
    ecrireStmt.run(CLE_DERNIER_TOUR, JSON.stringify(propre));
    return propre;
  }

  function lireCopiesEnAttente() {
    const ligne = lireStmt.get(CLE_COPIES_GMAIL);
    if (!ligne) return [];
    try {
      return assainirCopiesEnAttente(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireCopiesEnAttente(liste) {
    const propre = assainirCopiesEnAttente(liste);
    ecrireStmt.run(CLE_COPIES_GMAIL, JSON.stringify(propre));
    return propre;
  }

  function lireRetoursAudit() {
    const ligne = lireStmt.get(CLE_RETOURS_AUDIT);
    if (!ligne) return [];
    try {
      return assainirRetoursAudit(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireRetoursAudit(liste) {
    const propre = assainirRetoursAudit(liste);
    ecrireStmt.run(CLE_RETOURS_AUDIT, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesClaude() {
    const ligne = lireStmt.get(CLE_REGLAGES_CLAUDE);
    if (!ligne) return assainirReglagesClaude({});
    try {
      return assainirReglagesClaude(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesClaude({});
    }
  }

  function ecrireReglagesClaude(reglages) {
    const propre = assainirReglagesClaude(reglages, lireReglagesClaude());
    ecrireStmt.run(CLE_REGLAGES_CLAUDE, JSON.stringify(propre));
    return propre;
  }

  // Secret des liens vers les pièces (voir liensPieces.js) : généré une seule fois, au premier
  // besoin, puis conservé en base — le changer rendrait invalides tous les liens déjà envoyés
  // dans Teams. Jamais exposé par une route.
  function lireSecretLiens() {
    const ligne = lireStmt.get(CLE_SECRET_LIENS);
    if (ligne && typeof ligne.valeur === 'string' && ligne.valeur.length >= 32) return ligne.valeur;
    const secret = require('node:crypto').randomBytes(32).toString('hex');
    ecrireStmt.run(CLE_SECRET_LIENS, secret);
    return secret;
  }

  function lireExclusionsPieces() {
    const ligne = lireStmt.get(CLE_EXCLUSIONS_PIECES);
    if (!ligne) return {};
    try {
      return assainirExclusionsPieces(JSON.parse(ligne.valeur));
    } catch (e) {
      return {};
    }
  }

  function ecrireExclusionsPieces(exclusions) {
    const propre = assainirExclusionsPieces(exclusions);
    ecrireStmt.run(CLE_EXCLUSIONS_PIECES, JSON.stringify(propre));
    return propre;
  }

  function lireCorrectionsApprises() {
    const ligne = lireStmt.get(CLE_CORRECTIONS_APPRISES);
    if (!ligne) return [];
    try {
      return assainirCorrectionsApprises(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireCorrectionsApprises(corrections) {
    const propre = assainirCorrectionsApprises(corrections);
    ecrireStmt.run(CLE_CORRECTIONS_APPRISES, JSON.stringify(propre));
    return propre;
  }

  function lireReglageSauvegarde() {
    const ligne = lireStmt.get(CLE_REGLAGE_SAUVEGARDE);
    try {
      const v = ligne ? JSON.parse(ligne.valeur) : {};
      return { dossier: texteBorne(v && v.dossier, 500) };
    } catch (e) {
      return { dossier: '' };
    }
  }

  function ecrireReglageSauvegarde(reglage) {
    const propre = { dossier: texteBorne(reglage && reglage.dossier, 500) };
    ecrireStmt.run(CLE_REGLAGE_SAUVEGARDE, JSON.stringify(propre));
    return propre;
  }

  function lireEtatSauvegarde() {
    const ligne = lireStmt.get(CLE_ETAT_SAUVEGARDE);
    try {
      return assainirEtatSauvegarde(ligne ? JSON.parse(ligne.valeur) : {});
    } catch (e) {
      return assainirEtatSauvegarde({});
    }
  }

  function ecrireEtatSauvegarde(etat) {
    const propre = assainirEtatSauvegarde(etat);
    ecrireStmt.run(CLE_ETAT_SAUVEGARDE, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesAgenda() {
    const ligne = lireStmt.get(CLE_REGLAGES_AGENDA);
    if (!ligne) return assainirReglagesAgenda({});
    try {
      return assainirReglagesAgenda(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesAgenda({});
    }
  }

  function ecrireReglagesAgenda(reglages) {
    const propre = assainirReglagesAgenda(reglages);
    ecrireStmt.run(CLE_REGLAGES_AGENDA, JSON.stringify(propre));
    return propre;
  }

  // Absent = jamais tenté depuis l'installation, ou l'URL n'a jamais été renseignée (voir
  // executerEtEnregistrerTourAgenda, qui écrit systématiquement — même sans URL — pour que
  // l'écran Réglages distingue « jamais essayé » de « essayé, mais rien à lire »).
  function lireDernierTourAgenda() {
    const ligne = lireStmt.get(CLE_DERNIER_TOUR_AGENDA);
    if (!ligne) return null;
    try {
      return assainirDernierTourAgenda(JSON.parse(ligne.valeur));
    } catch (e) {
      return null;
    }
  }

  function ecrireDernierTourAgenda(resultat) {
    const propre = assainirDernierTourAgenda(resultat);
    ecrireStmt.run(CLE_DERNIER_TOUR_AGENDA, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesMiseAJour() {
    const ligne = lireStmt.get(CLE_MISE_A_JOUR);
    if (!ligne) return assainirReglagesMiseAJour({});
    try {
      return assainirReglagesMiseAJour(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesMiseAJour({});
    }
  }

  function ecrireReglagesMiseAJour(reglages) {
    const propre = assainirReglagesMiseAJour(reglages, lireReglagesMiseAJour());
    ecrireStmt.run(CLE_MISE_A_JOUR, JSON.stringify(propre));
    return propre;
  }

  return {
    lireReglagesMiseAJour, ecrireReglagesMiseAJour,
    lireReglagesAgenda, ecrireReglagesAgenda, lireDernierTourAgenda, ecrireDernierTourAgenda,
    lireReglageSauvegarde, ecrireReglageSauvegarde, lireEtatSauvegarde, ecrireEtatSauvegarde,
    lireReglages, ecrireReglages, lireDernierTour, ecrireDernierTour,
    lireCopiesEnAttente, ecrireCopiesEnAttente, lireRetoursAudit, ecrireRetoursAudit,
    lireReglagesClaude, ecrireReglagesClaude, lireSecretLiens,
    lireExclusionsPieces, ecrireExclusionsPieces, lireCorrectionsApprises, ecrireCorrectionsApprises
  };
}

module.exports = {
  creerRepoParametres, assainirReglages, assainirEtatSauvegarde, assainirExclusionsPieces, assainirCorrectionApprise, assainirCorrectionsApprises, MAX_CORRECTIONS_APPRISES, assainirDernierTour, assainirCopiesEnAttente,
  assainirRetourAudit, assainirRetoursAudit, MAX_RETOURS_AUDIT,
  assainirReglagesClaude, assainirReglagesMiseAJour, MODELES_CLAUDE, MODELE_CLAUDE_PAR_DEFAUT,
  assainirReglagesAgenda, assainirDernierTourAgenda,
  REGLAGES_PAR_DEFAUT, PORT_SMTP_PAR_DEFAUT
};
