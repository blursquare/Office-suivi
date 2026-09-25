// Authentification par mot de passe partagé unique (décision validée avec l'étude — pas de
// compte par collaborateur en V1). Un jeton opaque en mémoire, pas un JWT : inutile de signer/
// vérifier une structure pour un seul mot de passe partagé entre 3 personnes sur un LAN — un
// jeton aléatoire que le serveur reconnaît suffit, et évite une dépendance de plus.
'use strict';

const crypto = require('node:crypto');

// 12h : assez long pour ne pas redemander le mot de passe à chaque ouverture d'onglet dans la
// même journée, assez court pour qu'un jeton oublié dans un navigateur partagé ne traîne pas
// indéfiniment.
const DUREE_SESSION_MS = 12 * 60 * 60 * 1000;

// `desactivee` : accès sans mot de passe, demandé par l'étude (25/09) — le serveur n'est joignable
// que depuis le réseau du bureau. Toute requête passe, et /api/login délivre un jeton à n'importe
// quel mot de passe (y compris vide) pour que le client n'ait jamais à afficher l'écran de
// connexion. Réactivable par "authActive": true dans config.json (voir config.js).
function creerGestionnaireAuth(motDePasseAttendu, options) {
  const desactivee = !!(options && options.desactivee);
  const sessions = new Map(); // jeton -> expiration (epoch ms)

  function nettoyerSessionsExpirees() {
    const maintenant = Date.now();
    for (const [jeton, expiration] of sessions) {
      if (expiration <= maintenant) sessions.delete(jeton);
    }
  }

  function motDePasseValide(candidat) {
    if (desactivee) return true;
    if (typeof candidat !== 'string' || !motDePasseAttendu) return false;
    // Comparaison en temps constant : évite qu'une différence de timing révèle combien de
    // caractères du mot de passe sont déjà corrects. Les deux tampons doivent avoir la même
    // longueur pour timingSafeEqual — on bourre le plus court avant de comparer, sans jamais
    // court-circuiter sur une comparaison de longueur en clair.
    // Tampons de taille FIXE en octets : bourrer en caractères ne suffisait pas — un caractère
    // accentué prend deux octets, les tampons n'avaient plus la même longueur et timingSafeEqual
    // levait une exception (erreur 500, affichée « mot de passe incorrect »).
    const a = Buffer.alloc(512); a.write(candidat.slice(0, 256), 'utf8');
    const b = Buffer.alloc(512); b.write(motDePasseAttendu.slice(0, 256), 'utf8');
    return crypto.timingSafeEqual(a, b) && candidat === motDePasseAttendu;
  }

  function creerSession() {
    nettoyerSessionsExpirees();
    const jeton = crypto.randomBytes(32).toString('hex');
    sessions.set(jeton, Date.now() + DUREE_SESSION_MS);
    return jeton;
  }

  function sessionValide(jeton) {
    const expiration = sessions.get(jeton);
    return typeof expiration === 'number' && expiration > Date.now();
  }

  // Middleware Express : exige `Authorization: Bearer <jeton>` sur toute route protégée.
  function middlewareAuth(req, res, next) {
    if (desactivee) { next(); return; }
    const entete = req.get('authorization') || '';
    const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : null;
    if (!jeton || !sessionValide(jeton)) {
      res.status(401).json({ erreur: 'Authentification requise ou expirée.' });
      return;
    }
    next();
  }

  return { motDePasseValide, creerSession, sessionValide, middlewareAuth, desactivee };
}

module.exports = { creerGestionnaireAuth };
