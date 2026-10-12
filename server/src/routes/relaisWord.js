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
const { noterVerification } = require('../verificationsTerrain');
const {
  codeInstallationRelais, lireExecutableRelais, empreinteJeton, nouveauJeton, jetonValide,
  appliquerReleveWord, demanderInsertionWord, etatPosteWord
} = require('../relaisWord');

var CLE_RELAIS_WORD = 'relais-word';

function lireJetons(parametresRepo) {
  const v = parametresRepo.lireJsonBrut(CLE_RELAIS_WORD, {});
  return v && typeof v.jetons === 'object' && v.jetons ? v.jetons : {};
}

// L'empreinte retenue pour un poste (« constructor » ou « toString » ne désignent jamais un poste).
function empreintePoste(parametresRepo, poste) {
  const jetons = lireJetons(parametresRepo);
  return Object.prototype.hasOwnProperty.call(jetons, poste) && typeof jetons[poste] === 'string' ? jetons[poste] : '';
}

function creerRouteurRelaisWordPoste(parametresRepo, etat) {
  const routeur = express.Router();
  routeur.post('/relais-word/releve', (req, res) => {
    const corps = req.body || {};
    const poste = clePoste(corps.poste);
    if (!poste || !jetonValide(empreintePoste(parametresRepo, poste), corps.jeton)) { res.status(403).json({ erreur: 'Relais inconnu.' }); return; }
    const avant = (etat.postes.get(poste) || {}).n || 0;
    const { commandes, appels, renvoyer } = appliquerReleveWord(etat, poste, corps);
    const p = etat.postes.get(poste);
    if (p.n !== avant && p.paragraphe) noterVerification(parametresRepo, 'relais-word-suivi');
    for (const r of Array.isArray(corps.resultats) ? corps.resultats : []) {
      if (r && typeof r.id === 'string') noterVerification(parametresRepo, 'relais-word-insertion', r.ok === true ? { ok: true } : { ok: false, message: String(r.message || 'refus').slice(0, 80) });
    }
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
    res.json(etatPosteWord(etat, poste, !!empreintePoste(parametresRepo, poste)));
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
  // Le code d'installation du collaborateur de ce poste : nouveau jeton à chaque demande (seule son empreinte est gardée).
  routeur.post('/relais-word/code', (req, res) => {
    const poste = clePoste((req.body || {}).poste);
    if (!poste) { res.status(400).json({ erreur: 'Collaborateur attendu.' }); return; }
    const url = adresseClairePoste(req.protocol, req.get('host'));
    if (!url) { res.status(400).json({ erreur: 'Adresse du serveur illisible.' }); return; }
    const jeton = nouveauJeton();
    // Fenêtre CLAIRE du serveur lui-même : profil « ClaireServeur » (comme le relais d'appel 3CX).
    const local = /^https?:\/\/(localhost|127(\.\d+){3}|\[::1\])(:\d+)?\/$/i.test(url);
    const jetons = Object.assign({}, lireJetons(parametresRepo), { [poste]: empreinteJeton(jeton) });
    parametresRepo.ecrireJsonBrut(CLE_RELAIS_WORD, { jetons });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ code: codeInstallationRelais({ url, poste, jeton, profil: local ? 'ClaireServeur' : 'Claire' }) });
  });
  return routeur;
}

module.exports = { creerRouteurRelaisWordPoste, creerRouteurRelaisWord, CLE_RELAIS_WORD };
