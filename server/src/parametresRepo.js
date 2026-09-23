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

  return {
    lireReglages, ecrireReglages, lireDernierTour, ecrireDernierTour,
    lireCopiesEnAttente, ecrireCopiesEnAttente, lireRetoursAudit, ecrireRetoursAudit
  };
}

module.exports = {
  creerRepoParametres, assainirReglages, assainirDernierTour, assainirCopiesEnAttente,
  assainirRetourAudit, assainirRetoursAudit, MAX_RETOURS_AUDIT,
  REGLAGES_PAR_DEFAUT, PORT_SMTP_PAR_DEFAUT
};
