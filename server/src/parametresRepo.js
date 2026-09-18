// Réglages de l'étude, persistés en base (table `parametres`, voir db.js) — pas dans config.json,
// qui reste réservé aux réglages d'infrastructure posés une fois par qui installe l'exécutable
// (mot de passe, port, racine du NAS). Ici, c'est une donnée métier que l'étude doit pouvoir
// modifier elle-même depuis l'écran « Réglages » (voir routes/reglages.js, script.js), partagée
// entre tous les postes puisqu'elle vit dans la même base que les dossiers.
//
// Un seul blob JSON sous une clé unique plutôt qu'une colonne par champ : rien ici n'est filtré/
// trié par SQL ailleurs (contrairement aux colonnes promues de dossiersRepo.js), donc pas de
// raison de complexifier le schéma — même principe que le blob `data` des dossiers.
'use strict';

const CLE_REGLAGES = 'reglages';

const REGLAGES_PAR_DEFAUT = Object.freeze({
  teamsWebhookUrl: '',
  teamsActif: false,
  teamsCopieEmail: '',
  emailsResponsables: {}
});

// Assainit un objet réglages quelconque (venant de la base ou d'une requête PUT) vers la forme
// attendue — jamais de valeur exotique propagée plus loin (un JSON malformé en base, par exemple,
// ne doit jamais faire planter le job de rappels qui lit ces réglages toutes les 30 minutes).
function assainirReglages(brut) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const emails = (b.emailsResponsables && typeof b.emailsResponsables === 'object' && !Array.isArray(b.emailsResponsables))
    ? b.emailsResponsables : {};
  const emailsPropres = {};
  for (const [nom, email] of Object.entries(emails)) {
    if (typeof nom === 'string' && typeof email === 'string' && email.trim()) {
      emailsPropres[nom] = email.trim();
    }
  }
  return {
    teamsWebhookUrl: typeof b.teamsWebhookUrl === 'string' ? b.teamsWebhookUrl.trim() : '',
    teamsActif: b.teamsActif === true,
    // Adresse Teams recevant une copie de CHAQUE rappel envoyé, quel que soit le responsable
    // destinataire — demandé explicitement par l'étude, pour rester informée de tous les envois
    // sans dépendre du fait qu'elle soit elle-même responsable du dossier concerné.
    teamsCopieEmail: typeof b.teamsCopieEmail === 'string' ? b.teamsCopieEmail.trim() : '',
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
    const propre = assainirReglages(reglages);
    ecrireStmt.run(CLE_REGLAGES, JSON.stringify(propre));
    return propre;
  }

  return { lireReglages, ecrireReglages };
}

module.exports = { creerRepoParametres, assainirReglages, REGLAGES_PAR_DEFAUT };
