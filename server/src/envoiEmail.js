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
// L'aiguillage vers les messages de CLAIRE (messagesClaire.js, étude 27/10 : « plus par Teams ») : posé au démarrage du serveur (index.js),
// absent dans les tests. Il rend un résultat (déposé chez CLAIRE, rien ne part) ou null (partir sur Teams comme avant).
let aiguillage = null;
/** @param {any} fn */
function definirAiguillageNotifications(fn) { aiguillage = typeof fn === 'function' ? fn : null; }

function envoiConfigure(reglages) {
  const r = reglages || {};
  // Avec l'aiguillage vers CLAIRE, il suffit que les rappels soient allumés : rien ne passe par le SMTP.
  return !!(r.emailActif && (aiguillage || (r.smtpHote && r.emailPasserelle)));
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
//
// `message` : le corps en texte brut (chaîne), ou `{ texte, html }` quand le message porte des
// liens à rendre cliquables sous un libellé (notification de pièces trouvées : le NOM de la pièce
// est le lien, voir routes/notifications.js). L'email part alors en deux versions — texte brut ET
// HTML —, le flux Power Automate reprenant le corps HTML dans Teams, qui l'affiche mis en forme.
// La version texte garde l'adresse en clair : c'est elle qu'un client de messagerie sans HTML, ou
// un flux qui lirait le corps en texte, présenterait.
// `options.sansAiguillage` : vraiment par la passerelle (« Envoyer un test » de Réglages › Rappels) ; `options.dejaDansCanal` : une mention,
// déjà comptée et notifiée par son canal — pas de second message de CLAIRE, Teams seulement pour qui l'a demandé (relecture 27/10).
async function envoyerEmail(reglages, destinataireEmail, message, creerTransportFn, options) {
  const o = options || {};
  if (aiguillage && !creerTransportFn && !o.sansAiguillage) {
    try { const r = aiguillage(reglages, destinataireEmail, message, o); if (r) return r; } catch (e) { /* jamais bloquant : Teams comme avant */ }
  }
  const r = reglages || {};
  const corps = typeof message === 'string' ? { texte: message, html: null } : (message || {});
  const texte = corps.texte || '';
  if (!r.smtpHote) return { ok: false, erreur: 'Aucun serveur SMTP configuré (voir Réglages).' };
  if (!r.emailPasserelle) return { ok: false, erreur: 'Aucune boîte-passerelle configurée (voir Réglages).' };
  if (!destinataireEmail) return { ok: false, erreur: 'Aucune adresse email configurée pour ce collaborateur.' };

  const creer = creerTransportFn || ((opts) => nodemailer.createTransport(opts));
  try {
    const transport = creer(optionsTransport(r));
    const info = await transport.sendMail({
      // L'expéditeur doit être une adresse que le serveur accepte. Avec un compte SMTP, Microsoft
      // 365 EXIGE que l'expéditeur soit le compte authentifié lui-même (sauf droit « Envoyer en
      // tant que ») : un autre nom se solde par un refus « 5.7.60 Client does not have permissions
      // to send as this sender », illisible pour qui n'attend pas ce détail. Le repli par défaut
      // est donc le compte, et seulement à défaut la boîte-passerelle (cas de l'envoi anonyme, où
      // il n'y a pas de compte). Le flux ne répond jamais à ces messages : aucun risque de boucle.
      from: `"CLAIRE" <${r.smtpExpediteur || r.smtpUtilisateur || r.emailPasserelle}>`,
      to: r.emailPasserelle,
      subject: destinataireEmail, // routage lu par le flux — voir la convention en tête de fichier
      text: texte,
      ...(corps.html ? { html: corps.html } : {})
    });
    // Le Message-ID sert à retrouver, et effacer, la copie que Gmail range dans « Messages
    // envoyés » (voir imapGmail.js) : c'est le seul critère qui ne peut désigner que CE message.
    return { ok: true, erreur: null, messageId: (info && info.messageId) || null };
  } catch (e) {
    return { ok: false, erreur: `Envoi SMTP impossible (${e.message}).` };
  }
}

// Deux adresses désignent-elles la même boîte ? Sert à ne pas envoyer la copie à l'étude quand
// elle est AUSSI le responsable du dossier : un double identique arriverait sinon dans le même
// chat Teams. La comparaison ignore la casse et les espaces (« Bastien.ANGLUMENT@… » et
// « bastien.anglument@… » sont la même boîte — une adresse email n'est pas sensible à la casse
// en pratique), et lit l'adresse entre chevrons d'une forme « Nom <adresse> ».
function adresseNormalisee(adresse) {
  const brut = String(adresse || '').trim();
  const chevrons = brut.match(/<([^>]+)>/);
  return (chevrons ? chevrons[1] : brut).trim().toLowerCase();
}

function memeAdresseEmail(a, b) {
  const na = adresseNormalisee(a);
  return na !== '' && na === adresseNormalisee(b);
}

module.exports = { envoyerEmail, envoiConfigure, optionsTransport, memeAdresseEmail, definirAiguillageNotifications };
