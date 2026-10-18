// @ts-check
'use strict';
// OpenLegi (voir openlegi.js) : réglages (jeton secret, interrupteur), essai de connexion, appel d'un outil par l'agent.
// Le jeton n'est JAMAIS renvoyé (booléen « enregistré »), gardé si le formulaire ne le réémet pas, effacé sur chaîne vide explicite.

const express = require('express');
const { CLE_OPENLEGI, SOURCES_OPENLEGI, LIBELLES_SOURCES_OPENLEGI, creerClientOpenlegi } = require('../openlegi');
const { noterVerification } = require('../verificationsTerrain');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[openlegi]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};

/** Réglages enregistrés. @param {any} parametresRepo */
function lireReglagesOpenlegi(parametresRepo) {
  const b = (parametresRepo && parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_OPENLEGI, {}) : {}) || {};
  return { jeton: typeof b.jeton === 'string' ? b.jeton : '', actif: b.actif !== false };
}

/** Le client partagé par la route et l'agent. @param {any} parametresRepo @param {{ fetch?: Function }} [injections] */
function creerOpenlegi(parametresRepo, injections = {}) {
  return creerClientOpenlegi({ jeton: () => lireReglagesOpenlegi(parametresRepo).jeton, fetch: injections.fetch });
}

/** @param {any} parametresRepo @param {ReturnType<typeof creerClientOpenlegi>} client */
function creerRouteurOpenlegi(parametresRepo, client) {
  const routeur = express.Router();
  const vue = () => { const r = lireReglagesOpenlegi(parametresRepo); return { jetonEnregistre: !!r.jeton, actif: r.actif }; };

  routeur.get('/openlegi/reglages', (req, res) => { res.json(vue()); });

  routeur.put('/openlegi/reglages', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const r = lireReglagesOpenlegi(parametresRepo);
    if (typeof corps.jeton === 'string') {
      const j = corps.jeton.trim();
      if (j.length > 400 || /\s/.test(j)) { res.status(400).json({ erreur: 'Jeton invalide.' }); return; }
      r.jeton = j;
    }
    if (typeof corps.actif === 'boolean') r.actif = corps.actif;
    parametresRepo.ecrireJsonBrut(CLE_OPENLEGI, r);
    client.oublier();
    res.json({ ok: true, ...vue() });
  });

  routeur.post('/openlegi/tester', routeAsync(async (req, res) => {
    if (!lireReglagesOpenlegi(parametresRepo).jeton) { res.json({ ok: false, message: 'Aucun jeton enregistré.' }); return; }
    client.oublier();
    const sources = [];
    for (const s of SOURCES_OPENLEGI) {
      try { sources.push({ source: s, libelle: LIBELLES_SOURCES_OPENLEGI[s], outils: (await client.outilsSource(s)).length }); }
      catch (e) { sources.push({ source: s, libelle: LIBELLES_SOURCES_OPENLEGI[s], erreur: String(e && e.message || e).slice(0, 120) }); }
    }
    const ok = sources.some((x) => x.outils > 0);
    noterVerification(parametresRepo, 'openlegi-connexion', ok ? { detail: sources.map((x) => `${x.source} ${x.outils || 0}`).join(', ') }
      : { ok: false, message: (sources.find((x) => x.erreur) || {}).erreur || 'aucun outil' });
    res.json({ ok, sources });
  }));

  // Un outil appelé par l'agent (exécuté par le poste comme tous ses outils). Nom et arguments contrôlés par le client OpenLegi.
  routeur.post('/openlegi/appel', routeAsync(async (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const r = lireReglagesOpenlegi(parametresRepo);
    if (!r.jeton || !r.actif) { res.json({ erreur: 'Sources juridiques coupées dans les Réglages.' }); return; }
    const outil = typeof corps.outil === 'string' ? corps.outil.slice(0, 80) : '';
    const args = corps.arguments && typeof corps.arguments === 'object' && !Array.isArray(corps.arguments) ? corps.arguments : {};
    if (JSON.stringify(args).length > 4000) { res.json({ erreur: 'Arguments trop longs.' }); return; }
    try {
      const sortie = await client.appeler(outil, args);
      noterVerification(parametresRepo, 'openlegi-recherche', { detail: sortie.source });
      res.json(sortie);
    } catch (e) {
      const message = String(e && e.message || e).slice(0, 200);
      if (/refusé|illisible/.test(message)) noterVerification(parametresRepo, 'openlegi-recherche', { ok: false, message });
      res.json({ erreur: message });
    }
  }));

  return routeur;
}

module.exports = { creerRouteurOpenlegi, creerOpenlegi, lireReglagesOpenlegi };
