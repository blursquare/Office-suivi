'use strict';
// Où déposer la DIA (voir depotDia.js) : lecture de la base livrée + fiche de la mairie (annuaire du service public) et corrections de l'étude.

const express = require('express');
const { noterVerification } = require('../verificationsTerrain');
const { baseDepotDia, depotPourCommune, ficheMairie, lireCorrections, ecrireCorrection, assainirDepot } = require('../depotDia');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[depot-dia]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};
const INSEE = /^\d[0-9AB]\d{3}$/;

/** @param {any} parametresRepo @param {any} [injections] */
function creerRouteurDepotDia(parametresRepo, injections = {}) {
  const routeur = express.Router();

  routeur.get('/urbanisme/depot-dia', routeAsync(async (req, res) => {
    const insee = String(req.query.insee || '').toUpperCase();
    if (!INSEE.test(insee)) { res.status(400).json({ erreur: 'Code INSEE invalide.' }); return; }
    const r = depotPourCommune(baseDepotDia(), lireCorrections(parametresRepo), insee);
    // La fiche de la mairie : une panne de l'annuaire ne retire pas le reste.
    let mairie = null; let mairieLue = true;
    try { mairie = await ficheMairie(insee, injections); noterVerification(parametresRepo, 'depot-dia-mairie', { detail: mairie ? 'fiche lue' : 'mairie absente de l’annuaire' }); }
    catch (e) { mairieLue = false; noterVerification(parametresRepo, 'depot-dia-mairie', { ok: false, message: e && e.statut ? `annuaire : réponse ${e.statut}` : 'annuaire injoignable' }); }
    res.json(Object.assign({}, r, { mairie, mairieLue, baseDu: String(baseDepotDia().miseAJour || '') }));
  }));

  // L'étude corrige ce qu'elle constate : le dépôt de CETTE commune, par-dessus la base.
  routeur.put('/urbanisme/depot-dia/:insee', routeAsync(async (req, res) => {
    const insee = String(req.params.insee || '').toUpperCase();
    if (!INSEE.test(insee) || !baseDepotDia().communes[insee]) { res.status(404).json({ erreur: 'Commune inconnue de la base.' }); return; }
    // La correction garde ce que le formulaire ne montre pas (réservé aux notaires, périmètre) ; elle ne vient d'aucune page lue : pas de source.
    const courant = depotPourCommune(baseDepotDia(), lireCorrections(parametresRepo), insee).depot;
    const corps = req.body || {};
    const entree = assainirDepot(Object.assign({}, corps, {
      notairesSeulement: typeof corps.notairesSeulement === 'boolean' ? corps.notairesSeulement : courant.notairesSeulement,
      perimetre: typeof corps.perimetre === 'string' ? corps.perimetre : courant.perimetre,
      source: '', verifieLe: new Date().toISOString().slice(0, 10)
    }));
    if (entree.mode === 'guichet' && !entree.url) { res.status(400).json({ erreur: 'Adresse du guichet manquante ou invalide (https://…).' }); return; }
    if (entree.mode === 'courriel' && !entree.courriel) { res.status(400).json({ erreur: 'Adresse courriel manquante ou invalide.' }); return; }
    try { ecrireCorrection(parametresRepo, insee, entree, String((req.body && req.body.par) || '')); } catch (e) { res.status(e.statut || 500).json({ erreur: e.message }); return; }
    res.json({ ok: true });
  }));

  routeur.delete('/urbanisme/depot-dia/:insee', routeAsync(async (req, res) => {
    const insee = String(req.params.insee || '').toUpperCase();
    if (!INSEE.test(insee)) { res.status(400).json({ erreur: 'Code INSEE invalide.' }); return; }
    ecrireCorrection(parametresRepo, insee, null, '');
    res.json({ ok: true });
  }));

  return routeur;
}

module.exports = { creerRouteurDepotDia };
