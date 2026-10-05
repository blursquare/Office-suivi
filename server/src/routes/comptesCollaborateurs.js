'use strict';

// Comptes Exchange des collaborateurs (voir ../comptesCollaborateurs.js) : saisie dans Réglages › Collaborateurs. Le mot de passe
// n'est jamais renvoyé ; « tester » ne fait qu'une lecture (même requête que le test de la connexion Exchange), un seul essai.

const express = require('express');
const { testerConnexionExchange } = require('../exchange/ews');
const { URL_EWS_DEFAUT } = require('../parametresRepo');
const { NOMS_COLLABORATEURS, lireComptes, comptesPublics, ecrireCompte, retirerCompte, marquerRefus, leverRefus, identifiantDe } = require('../comptesCollaborateurs');
const { noterVerification } = require('../verificationsTerrain');

function creerRouteurComptesCollaborateurs(parametresRepo, injections = {}) {
  const routeur = express.Router();
  const nomValide = (req, res) => {
    const nom = String(req.params.nom || '');
    if (!NOMS_COLLABORATEURS.includes(nom)) { res.status(404).json({ erreur: 'Collaborateur inconnu.' }); return null; }
    return nom;
  };

  routeur.get('/comptes-collaborateurs', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(comptesPublics(lireComptes(parametresRepo)));
  });

  routeur.put('/comptes-collaborateurs/:nom', (req, res) => {
    const nom = nomValide(req, res);
    if (!nom) return;
    const r = ecrireCompte(parametresRepo, nom, req.body || {});
    if (r.erreur) { res.status(400).json({ erreur: r.erreur }); return; }
    res.json(r.compte || { identifiant: '', motDePasseEnregistre: false, refuseLe: null });
  });

  routeur.delete('/comptes-collaborateurs/:nom', (req, res) => {
    const nom = nomValide(req, res);
    if (!nom) return;
    retirerCompte(parametresRepo, nom);
    res.json({ identifiant: '', motDePasseEnregistre: false, refuseLe: null });
  });

  // Test avec le compte ENREGISTRÉ (jamais un mot de passe transitant dans la requête). Un refus d'identifiants retient le
  // compte ; une réussite le libère. On ne renvoie que ok + message.
  routeur.post('/comptes-collaborateurs/:nom/tester', async (req, res) => {
    const nom = nomValide(req, res);
    if (!nom) return;
    const c = lireComptes(parametresRepo)[nom];
    const reglagesExchange = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
    const rappels = parametresRepo.lireReglages ? parametresRepo.lireReglages() : {};
    const email = identifiantDe(c, (rappels.emailsResponsables || {})[nom]);
    if (!c || !c.motDePasse || !email) { res.status(400).json({ ok: false, message: 'Enregistrez d’abord l’identifiant et le mot de passe.' }); return; }
    const url = reglagesExchange.url || URL_EWS_DEFAUT;
    const r = await testerConnexionExchange({ url, email, motDePasse: c.motDePasse }, injections.exchange || {});
    if (r.ok) {
      leverRefus(parametresRepo, nom);
      noterVerification(parametresRepo, 'compte-collaborateur-connexion', {});
    } else if (r.raison === 'auth') {
      marquerRefus(parametresRepo, nom);
      noterVerification(parametresRepo, 'compte-collaborateur-connexion', { ok: false, message: 'identifiants refusés par Exchange' });
    }
    res.json({ ok: !!r.ok, message: r.message });
  });

  return routeur;
}

module.exports = { creerRouteurComptesCollaborateurs };
