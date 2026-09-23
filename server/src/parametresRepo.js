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

  return { lireReglages, ecrireReglages, lireDernierTour, ecrireDernierTour };
}

module.exports = {
  creerRepoParametres, assainirReglages, assainirDernierTour,
  REGLAGES_PAR_DEFAUT, PORT_SMTP_PAR_DEFAUT
};
