'use strict';

// Relais Word de l'« Aide à la rédaction » (étude 12/10, voir ../relaisWord.js).
//  - POST /api/relais-word/releve (HORS session, le jeton du poste en tient lieu) : le relais du poste envoie le paragraphe
//    de Word où se trouve le curseur et les résultats de ses insertions ; il reçoit les insertions demandées. Le texte reste
//    en mémoire du serveur (jamais en base, jamais journalisé).
//  - GET /api/relais-word/etat?poste= : relais actif, Word ouvert, paragraphe courant, résultats des insertions.
//  - POST /api/relais-word/inserer { poste, valeur, occurrence, attendu } : remplacer le n-ième « --- » du paragraphe.
//  - GET /api/relais-word/programme : CLAIRE-relais.exe, le même pour tous les postes ;
//  - POST /api/relais-word/code { poste } : le code d'installation de ce poste (nouveau jeton à chaque demande, seule son
//    empreinte est gardée — clé `relais-word`). Le code est la seule réponse qui porte un jeton : il ne repasse jamais par une route.

const express = require('express');
const { clePoste } = require('../appels3cx');
const { adresseClairePoste } = require('../installationPoste');
const {
  codeInstallationRelais, lireExecutableRelais, empreinteJeton, nouveauJeton, jetonValide,
  appliquerReleveWord, demanderInsertionWord, etatPosteWord, noterPastillePoste
} = require('../relaisWord');

var CLE_RELAIS_WORD = 'relais-word';

// { jetons, attente } : l'empreinte du jeton en service de chaque poste, et celle d'un code demandé pas encore installé.
function lireRegistre(parametresRepo) {
  const v = parametresRepo.lireJsonBrut(CLE_RELAIS_WORD, {}) || {};
  const objet = (x) => (x && typeof x === 'object' ? x : {});
  return { jetons: objet(v.jetons), attente: objet(v.attente) };
}

function lireJetons(parametresRepo) { return lireRegistre(parametresRepo).jetons; }

// Pure : l'empreinte d'un poste dans une table (« constructor » ou « toString » ne désignent jamais un poste).
function empreinteDans(table, poste) {
  return Object.prototype.hasOwnProperty.call(table, poste) && typeof table[poste] === 'string' ? table[poste] : '';
}

function empreintePoste(parametresRepo, poste) {
  return empreinteDans(lireJetons(parametresRepo), poste);
}

// Le jeton présenté est-il celui du poste ? Un code demandé (jeton « en attente ») devient le jeton du poste à sa première
// présentation — jusque-là le relais en marche garde le sien (relecture 0.221.2 : une demande de code abandonnée le coupait).
function jetonAccepte(parametresRepo, poste, jeton) {
  const reg = lireRegistre(parametresRepo);
  if (jetonValide(empreinteDans(reg.jetons, poste), jeton)) return true;
  if (!jetonValide(empreinteDans(reg.attente, poste), jeton)) return false;
  const attente = Object.assign({}, reg.attente);
  delete attente[poste];
  parametresRepo.ecrireJsonBrut(CLE_RELAIS_WORD, { jetons: Object.assign({}, reg.jetons, { [poste]: reg.attente[poste] }), attente });
  return true;
}

function creerRouteurRelaisWordPoste(parametresRepo, etat) {
  const routeur = express.Router();
  routeur.post('/relais-word/releve', (req, res) => {
    const corps = req.body || {};
    const poste = clePoste(corps.poste);
    if (!poste || !jetonAccepte(parametresRepo, poste, corps.jeton)) { res.status(403).json({ erreur: 'Relais inconnu.' }); return; }
    // Contrôle de l'installation (ou --verifier) : le jeton seul, rien de ce qui attend le relais en marche n'est touché.
    if (corps.verifier === true) { res.json({ ok: true }); return; }
    const { commandes, appels, renvoyer } = appliquerReleveWord(etat, poste, corps);
    const rep = { commandes };
    if (appels.length) rep.appels = appels;
    if (renvoyer) rep.renvoyer = true;
    res.json(rep);
  });
  return routeur;
}

function creerRouteurRelaisWord(parametresRepo, etat, options = {}) {
  const routeur = express.Router();
  routeur.get('/relais-word/etat', (req, res) => {
    const poste = clePoste(req.query.poste);
    if (!poste) { res.status(400).json({ erreur: 'Collaborateur attendu.' }); return; }
    // « Installé » : un jeton en service (programme ou macro) ; un code demandé mais jamais présenté ne compte pas.
    res.json(etatPosteWord(etat, poste, !!empreintePoste(parametresRepo, poste)));
  });
  // Pastille et notifications Windows du collaborateur de ce poste (client/122-notifications.js) : gardées en mémoire du serveur,
  // rendues au relais à son relevé suivant.
  routeur.post('/relais-word/pastille', (req, res) => {
    const corps = req.body || {};
    const poste = clePoste(corps.poste);
    if (!poste) { res.status(400).json({ erreur: 'Collaborateur attendu.' }); return; }
    res.json(noterPastillePoste(etat, poste, corps));
  });
  routeur.post('/relais-word/inserer', (req, res) => {
    const corps = req.body || {};
    const poste = clePoste(corps.poste);
    if (!poste) { res.status(400).json({ erreur: 'Collaborateur attendu.' }); return; }
    const r = demanderInsertionWord(etat, poste, corps);
    if (r.erreur) { res.status(409).json({ erreur: r.erreur }); return; }
    res.json(r);
  });
  // Le programme du relais, le même pour tous les postes (`lireExe` injectable pour les tests). « installateur » : ancien nom,
  // gardé pour une fenêtre pas encore rechargée.
  const programme = (req, res) => {
    const exe = (options.lireExe || lireExecutableRelais)();
    if (!exe) { res.status(503).json({ erreur: 'Le relais n’est pas dans cette version de CLAIRE.' }); return; }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="CLAIRE-relais.exe"');
    res.send(exe);
  };
  routeur.get('/relais-word/programme', programme);
  routeur.get('/relais-word/installateur', programme);
  // Un nouveau jeton EN ATTENTE pour ce poste : celui du relais en marche reste valable jusqu'à la première présentation du
  // nouveau. Rend { url, jeton, profil } ou une erreur déjà répondue (null).
  const nouveauJetonPoste = (req, res, suffixe) => {
    const poste = clePoste((req.body || {}).poste);
    if (!poste) { res.status(400).json({ erreur: 'Collaborateur attendu.' }); return null; }
    const url = adresseClairePoste(req.protocol, req.get('host'));
    if (!url) { res.status(400).json({ erreur: 'Adresse du serveur illisible.' }); return null; }
    const jeton = nouveauJeton();
    // Fenêtre CLAIRE du serveur lui-même : profil « ClaireServeur » (comme le relais d'appel 3CX).
    const local = /^https?:\/\/(localhost|127(\.\d+){3}|\[::1\])(:\d+)?\/$/i.test(url);
    const reg = lireRegistre(parametresRepo);
    parametresRepo.ecrireJsonBrut(CLE_RELAIS_WORD, { jetons: reg.jetons, attente: Object.assign({}, reg.attente, { [poste + (suffixe || '')]: empreinteJeton(jeton) }) });
    res.setHeader('Cache-Control', 'no-store');
    return { poste, url, jeton, profil: local ? 'ClaireServeur' : 'Claire' };
  };
  // Le code d'installation du programme pour le collaborateur de ce poste.
  routeur.post('/relais-word/code', (req, res) => {
    const cfg = nouveauJetonPoste(req, res);
    if (cfg) res.json({ code: codeInstallationRelais(cfg) });
  });
  return routeur;
}

module.exports = { creerRouteurRelaisWordPoste, creerRouteurRelaisWord, CLE_RELAIS_WORD };
