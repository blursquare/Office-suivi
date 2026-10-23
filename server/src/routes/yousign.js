// @ts-check
'use strict';
// Yousign (voir yousign.js) : réglages (clé secrète, interrupteurs, adresse), essai de connexion, appel d'un outil par l'agent.
// La clé n'est JAMAIS renvoyée (booléen « enregistrée »), gardée si le formulaire ne la réémet pas, effacée sur chaîne vide explicite.

const express = require('express');
const { CLE_YOUSIGN, URL_YOUSIGN_DEFAUT, urlYousignValide, classeOutilYousign, decouperNomYousign, creerClientYousign } = require('../yousign');
const { noterVerification } = require('../verificationsTerrain');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[yousign]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};

/** Réglages enregistrés. @param {any} parametresRepo */
function lireReglagesYousign(parametresRepo) {
  const b = (parametresRepo && parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_YOUSIGN, {}) : {}) || {};
  return { cle: typeof b.cle === 'string' ? b.cle : '', actif: b.actif !== false, ecriture: b.ecriture !== false,
    url: typeof b.url === 'string' && urlYousignValide(b.url) ? b.url : URL_YOUSIGN_DEFAUT };
}

/** Le client partagé par la route et l'agent. @param {any} parametresRepo @param {{ fetch?: Function }} [injections] */
function creerYousign(parametresRepo, injections = {}) {
  return creerClientYousign({ reglages: () => lireReglagesYousign(parametresRepo), fetch: injections.fetch });
}

/** @param {any} parametresRepo @param {ReturnType<typeof creerClientYousign>} client */
function creerRouteurYousign(parametresRepo, client) {
  const routeur = express.Router();
  const vue = () => { const r = lireReglagesYousign(parametresRepo); return { cleEnregistree: !!r.cle, actif: r.actif, ecriture: r.ecriture, url: r.url }; };

  routeur.get('/yousign/reglages', (req, res) => { res.json(vue()); });

  routeur.put('/yousign/reglages', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const r = lireReglagesYousign(parametresRepo);
    if (typeof corps.cle === 'string') {
      const c = corps.cle.trim();
      if (c && !/^[\x21-\x7e]{8,600}$/.test(c)) { res.status(400).json({ erreur: 'Clé invalide.' }); return; }
      r.cle = c;
    }
    if (typeof corps.url === 'string') {
      const u = corps.url.trim();
      if (u && !urlYousignValide(u)) { res.status(400).json({ erreur: 'Adresse refusée : api.yousign.app ou api-sandbox.yousign.app en https seulement.' }); return; }
      r.url = u || URL_YOUSIGN_DEFAUT;
    }
    if (typeof corps.actif === 'boolean') r.actif = corps.actif;
    if (typeof corps.ecriture === 'boolean') r.ecriture = corps.ecriture;
    parametresRepo.ecrireJsonBrut(CLE_YOUSIGN, r);
    client.oublier();
    res.json({ ok: true, ...vue() });
  });

  routeur.post('/yousign/tester', routeAsync(async (req, res) => {
    if (!lireReglagesYousign(parametresRepo).cle) { res.json({ ok: false, message: 'Aucune clé enregistrée.' }); return; }
    client.oublier();
    try {
      const outils = await client.outilsServeur();
      const ecriture = outils.filter((t) => classeOutilYousign(t.name) === 'ecriture').length;
      noterVerification(parametresRepo, 'yousign-connexion', { detail: `${outils.length} outils` });
      res.json({ ok: true, outils: outils.length, lecture: outils.length - ecriture, ecriture });
    } catch (e) {
      const message = String(e && e.message || e).slice(0, 160);
      noterVerification(parametresRepo, 'yousign-connexion', { ok: false, message });
      res.json({ ok: false, message });
    }
  }));

  // Un outil appelé par l'agent (exécuté par le poste, après la carte « Autoriser » pour tout outil qui écrit).
  routeur.post('/yousign/appel', routeAsync(async (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const r = lireReglagesYousign(parametresRepo);
    if (!r.cle || !r.actif) { res.json({ erreur: 'Yousign coupé dans les Réglages.' }); return; }
    const outil = typeof corps.outil === 'string' ? corps.outil.slice(0, 80) : '';
    const nom = decouperNomYousign(outil);
    if (!nom) { res.json({ erreur: 'Outil Yousign inconnu.' }); return; }
    const args = corps.arguments && typeof corps.arguments === 'object' && !Array.isArray(corps.arguments) ? corps.arguments : {};
    if (JSON.stringify(args).length > 8000) { res.json({ erreur: 'Arguments trop longs.' }); return; }
    try {
      const sortie = await client.appeler(outil, args);
      noterVerification(parametresRepo, sortie.ecriture ? 'yousign-ecriture' : 'yousign-lecture', sortie.erreur ? { ok: false, message: 'Yousign a refusé la demande' } : { detail: nom });
      res.json(sortie);
    } catch (e) {
      const message = String(e && e.message || e).slice(0, 200);
      if (/refusée|illisible/.test(message)) noterVerification(parametresRepo, classeOutilYousign(nom) === 'ecriture' ? 'yousign-ecriture' : 'yousign-lecture', { ok: false, message });
      res.json({ erreur: message });
    }
  }));

  return routeur;
}

module.exports = { creerRouteurYousign, creerYousign, lireReglagesYousign };
