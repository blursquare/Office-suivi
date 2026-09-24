'use strict';

// Liens vers une pièce du NAS, insérés dans la notification « nouvelle pièce trouvée » envoyée au
// responsable (Teams, via l'email-passerelle — voir routes/notifications.js). Demandé par l'étude :
// ouvrir la pièce directement depuis le message, sans passer par CLAIRE pour la retrouver.
//
// Pourquoi un lien SIGNÉ plutôt que l'adresse de /api/nas/fichier : un clic dans Teams est une
// navigation ordinaire, sans en-tête d'authentification — la route protégée répondrait « non
// autorisé » (même piège déjà payé côté client, voir ouvrirFichierNas dans script.js). Le lien
// porte donc sa propre preuve : une signature HMAC du chemin et d'une date d'expiration, avec un
// secret propre au serveur (parametresRepo.lireSecretLiens). Il n'ouvre qu'UN fichier précis,
// pendant une durée limitée, et reste confiné à la racine du NAS comme toutes les routes NAS
// (resoudreCheminNas). Il n'est utilisable que sur le réseau du bureau : c'est l'adresse du
// serveur de l'étude.

const crypto = require('node:crypto');

const DUREE_VALIDITE_LIEN_JOURS = 90;
const JOUR_MS = 24 * 60 * 60 * 1000;

function signature(secret, chemin, expire) {
  return crypto.createHmac('sha256', secret).update(`${chemin}\n${expire}`).digest('base64url');
}

// Paramètres d'URL d'un lien valable DUREE_VALIDITE_LIEN_JOURS jours à partir de `maintenant`.
function parametresLien(secret, chemin, maintenant = Date.now()) {
  const expire = Math.floor(maintenant / JOUR_MS) + DUREE_VALIDITE_LIEN_JOURS; // en jours
  return { c: chemin, e: String(expire), s: signature(secret, chemin, expire) };
}

function urlLienPiece(base, secret, chemin, maintenant) {
  const p = parametresLien(secret, chemin, maintenant);
  const qs = new URLSearchParams(p).toString();
  return `${String(base).replace(/\/+$/, '')}/piece?${qs}`;
}

// Vrai si la signature correspond ET que le lien n'a pas expiré. Comparaison en temps constant.
function lienValide(secret, { c, e, s }, maintenant = Date.now()) {
  if (typeof c !== 'string' || !c || typeof e !== 'string' || typeof s !== 'string') return false;
  const expire = Number(e);
  if (!Number.isInteger(expire)) return false;
  if (Math.floor(maintenant / JOUR_MS) > expire) return false;
  const attendue = Buffer.from(signature(secret, c, expire));
  const recue = Buffer.from(s);
  return attendue.length === recue.length && crypto.timingSafeEqual(attendue, recue);
}

// Adresse du serveur à mettre dans le lien : celle par laquelle le poste qui a trouvé la pièce
// joint le serveur (en-tête Host), SAUF si c'est le poste serveur lui-même (localhost) — un lien
// en localhost n'ouvrirait rien chez un collègue. On prend alors la première adresse du réseau
// local.
function baseDepuisRequete(req, adressesLanFn) {
  const hote = String((req.get && req.get('host')) || '');
  const protocole = req.protocol || 'http';
  const [nomHote, port] = hote.split(':');
  if (!nomHote || /^(localhost|127\.|\[?::1\]?$)/i.test(nomHote)) {
    const lan = typeof adressesLanFn === 'function' ? adressesLanFn() : [];
    if (lan.length) return `${protocole}://${lan[0]}${port ? ':' + port : ''}`;
  }
  return `${protocole}://${hote}`;
}

module.exports = {
  DUREE_VALIDITE_LIEN_JOURS, parametresLien, urlLienPiece, lienValide, baseDepuisRequete
};
