'use strict';

// Envoi d'un message à un collaborateur, par EMAIL SMTP vers une boîte-passerelle unique, qui
// déclenche un flux Power Automate (déclencheur « Quand un nouvel e-mail arrive » → action Teams).
//
// Troisième architecture pour ce même besoin, et la seule encore en service — les deux premières
// sont mortes, ne pas les réintroduire sans que l'étude le redemande :
//   1. POST JSON vers un déclencheur HTTP Power Automate → message privé Teams ;
//   2. le même POST, l'action interne du flux passée à « Envoyer un e-mail (V2) » ;
//   3. (ici) CLAIRE ENVOIE l'email elle-même vers `emailPasserelle`, et c'est l'ARRIVÉE de cet
//      email qui déclenche le flux, lequel poste ensuite le message dans Teams.
// Le déclencheur HTTP et son schéma JSON n'existent plus : l'étude a construit et activé le flux
// sous cette troisième forme, il ne restait que le code d'envoi à aligner dessus.
//
// CONVENTION IMPOSÉE PAR LE FLUX, à ne pas changer d'un côté sans l'autre :
//   • destinataire de l'email  = `emailPasserelle` (toujours la même boîte, celle qui déclenche) ;
//   • OBJET de l'email         = l'adresse du VRAI destinataire, que le flux lit pour savoir à qui
//                                poster le message Teams — ce n'est donc plus un objet lisible ;
//   • CORPS de l'email         = le message, repris tel quel dans Teams.
// C'est ce détournement de l'objet qui a fait disparaître `sujetRappel()`/`sujetNotificationPieces()`
// (apparues la veille avec l'architecture n°2, mortes avec elle) : la place d'un objet lisible
// n'existe plus, et les corps de message étaient déjà autonomes — ils répétaient cet objet.
//
// SMTP direct (nodemailer, déjà dans package.json mais jamais câblé jusqu'ici) est désormais le
// seul transport possible : un job de fond qui tourne toutes les 30 minutes, sans personne devant
// l'écran, ne peut pas passer par un brouillon `mailto:`. La raison qui l'avait fait écarter
// jusque-là (des identifiants de messagerie à stocker) est traitée plutôt qu'ignorée : l'envoi
// direct Microsoft 365 n'en demande AUCUN (voir server/README.md), et s'il faut malgré tout en
// poser, ils ne ressortent jamais de la base (voir routes/reglages.js).

const nodemailer = require('nodemailer');

// Un job de rappels ne doit jamais rester bloqué sur un serveur SMTP injoignable : il repasse de
// toute façon dans trente minutes, et un rappel non marqué comme envoyé est simplement retenté.
const TIMEOUT_MS = 20 * 1000;

// Source de vérité unique pour « l'envoi est-il configuré ? », partagée par le job de rappels, la
// route de notification de pièces et la route de test — trois endroits qui doivent rester d'accord.
function envoiConfigure(reglages) {
  const r = reglages || {};
  return !!(r.emailActif && r.smtpHote && r.emailPasserelle);
}

function optionsTransport(reglages) {
  const options = {
    host: reglages.smtpHote,
    port: reglages.smtpPort || 25,
    // 465 = TLS implicite ; 25 et 587 négocient STARTTLS, que nodemailer utilise d'office dès que
    // le serveur l'annonce. L'étude peut forcer le cas TLS implicite depuis les Réglages.
    secure: !!reglages.smtpSecurise,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS
  };
  // Pas de compte renseigné = envoi anonyme, le cas de l'envoi direct Microsoft 365 (autorisé par
  // l'adresse IP du bureau, pas par un compte) — c'est le mode recommandé, sans rien à stocker.
  if (reglages.smtpUtilisateur) {
    options.auth = { user: reglages.smtpUtilisateur, pass: reglages.smtpMotDePasse || '' };
  }
  return options;
}

// `creerTransportFn` injectable pour les tests (voir server/test/envoi-email.test.js) : sans elle,
// tester cette fonction demanderait un vrai serveur SMTP.
async function envoyerEmail(reglages, destinataireEmail, texte, creerTransportFn) {
  const r = reglages || {};
  if (!r.smtpHote) return { ok: false, erreur: 'Aucun serveur SMTP configuré (voir Réglages).' };
  if (!r.emailPasserelle) return { ok: false, erreur: 'Aucune boîte-passerelle configurée (voir Réglages).' };
  if (!destinataireEmail) return { ok: false, erreur: 'Aucune adresse email configurée pour ce collaborateur.' };

  const creer = creerTransportFn || ((opts) => nodemailer.createTransport(opts));
  try {
    const transport = creer(optionsTransport(r));
    await transport.sendMail({
      // L'expéditeur doit être une adresse que le serveur accepte. Avec un compte SMTP, Microsoft
      // 365 EXIGE que l'expéditeur soit le compte authentifié lui-même (sauf droit « Envoyer en
      // tant que ») : un autre nom se solde par un refus « 5.7.60 Client does not have permissions
      // to send as this sender », illisible pour qui n'attend pas ce détail. Le repli par défaut
      // est donc le compte, et seulement à défaut la boîte-passerelle (cas de l'envoi anonyme, où
      // il n'y a pas de compte). Le flux ne répond jamais à ces messages : aucun risque de boucle.
      from: `"CLAIRE" <${r.smtpExpediteur || r.smtpUtilisateur || r.emailPasserelle}>`,
      to: r.emailPasserelle,
      subject: destinataireEmail, // routage lu par le flux — voir la convention en tête de fichier
      text: texte
    });
    return { ok: true, erreur: null };
  } catch (e) {
    return { ok: false, erreur: `Envoi SMTP impossible (${e.message}).` };
  }
}

module.exports = { envoyerEmail, envoiConfigure, optionsTransport };
