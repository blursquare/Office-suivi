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

  return { lireReglages, ecrireReglages };
}

module.exports = { creerRepoParametres, assainirReglages, REGLAGES_PAR_DEFAUT, PORT_SMTP_PAR_DEFAUT };
