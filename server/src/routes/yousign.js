// @ts-check
'use strict';
// Yousign (voir yousign.js) : réglages (clé secrète, interrupteurs, adresse), essai de connexion, appel d'un outil par l'agent.
// La clé n'est JAMAIS renvoyée (booléen « enregistrée »), gardée si le formulaire ne la réémet pas, effacée sur chaîne vide explicite.

const express = require('express');
const { CLE_YOUSIGN, URL_YOUSIGN_DEFAUT, urlYousignValide, classeOutilYousign, decouperNomYousign, creerClientYousign } = require('../yousign');
const { creerOauthYousign, CLE_YOUSIGN_OAUTH, origineRetour } = require('../yousignOauth');
const { noterVerification } = require('../verificationsTerrain');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[yousign]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};

/** La connexion par identifiant et mot de passe (OAuth) : jetons gardés sur le serveur, jamais renvoyés. @param {any} parametresRepo */
function creerConnexionYousign(parametresRepo, injections = {}) {
  return creerOauthYousign({
    lire: () => (parametresRepo && parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_YOUSIGN_OAUTH, {}) : {}) || {},
    ecrire: (v) => parametresRepo.ecrireJsonBrut(CLE_YOUSIGN_OAUTH, v),
    fetch: injections.fetch,
    clientId: () => lireReglagesYousign(parametresRepo).clientId
  });
}

/** Réglages enregistrés (`connecte` : une clé OU une connexion par identifiant et mot de passe). @param {any} parametresRepo */
function lireReglagesYousign(parametresRepo) {
  const b = (parametresRepo && parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_YOUSIGN, {}) : {}) || {};
  const o = (parametresRepo && parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_YOUSIGN_OAUTH, {}) : {}) || {};
  const cle = typeof b.cle === 'string' ? b.cle : '';
  const oauth = !!(o && o.access);
  return { cle, oauth, connecte: !!cle || oauth, clientId: typeof b.clientId === 'string' ? b.clientId : '', actif: b.actif !== false, ecriture: b.ecriture !== false,
    url: typeof b.url === 'string' && urlYousignValide(b.url) ? b.url : URL_YOUSIGN_DEFAUT };
}

/** Le client partagé par la route et l'agent. @param {any} parametresRepo @param {{ fetch?: Function, fetchOauth?: Function }} [injections] */
function creerYousign(parametresRepo, injections = {}) {
  const connexion = creerConnexionYousign(parametresRepo, { fetch: injections.fetchOauth || injections.fetch });
  const client = creerClientYousign({ reglages: () => lireReglagesYousign(parametresRepo), fetch: injections.fetch, jeton: () => connexion.jeton() });
  return Object.assign(client, { connexion });
}

/** @param {any} parametresRepo @param {ReturnType<typeof creerClientYousign>} client */
function creerRouteurYousign(parametresRepo, client) {
  const connexion = /** @type {any} */ (client).connexion;
  const routeur = express.Router();
  const vue = () => { const r = lireReglagesYousign(parametresRepo); return { cleEnregistree: !!r.cle, clientId: r.clientId, connecte: r.oauth, actif: r.actif, ecriture: r.ecriture, url: r.url }; };

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
    if (typeof corps.clientId === 'string') {
      const c = corps.clientId.trim();
      if (c && !/^[A-Za-z0-9._~-]{4,200}$/.test(c)) { res.status(400).json({ erreur: 'Identifiant d’application invalide.' }); return; }
      r.clientId = c;
    }
    if (typeof corps.actif === 'boolean') r.actif = corps.actif;
    if (typeof corps.ecriture === 'boolean') r.ecriture = corps.ecriture;
    parametresRepo.ecrireJsonBrut(CLE_YOUSIGN, r);
    client.oublier();
    res.json({ ok: true, ...vue() });
  });

  routeur.post('/yousign/tester', routeAsync(async (req, res) => {
    if (!lireReglagesYousign(parametresRepo).connecte) { res.json({ ok: false, message: 'Pas connecté : « Se connecter à Yousign » ou enregistrez une clé.' }); return; }
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
    if (!r.connecte || !r.actif) { res.json({ erreur: 'Yousign coupé dans les Réglages.' }); return; }
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


  // Connexion par identifiant et mot de passe : CLAIRE envoie sur la page de connexion de Yousign et reçoit un code à son adresse de retour.
  routeur.post('/yousign/oauth/demarrer', routeAsync(async (req, res) => {
    try {
      const r = lireReglagesYousign(parametresRepo);
      const { origine, local } = origineRetour(req.protocol, req.get('host') || '');
      const url = await connexion.demarrer(r.url, origine);
      res.json({ ok: true, url, manuel: !local && !/^https:/.test(origine) });
    } catch (e) {
      const message = String(e && e.message || e).slice(0, 220);
      noterVerification(parametresRepo, 'yousign-connexion', { ok: false, message });
      res.json({ ok: false, message });
    }
  }));

  routeur.get('/yousign/oauth/retour', routeAsync(async (req, res) => {
    const page = (titre, texte) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }); res.status(200).type('html').send(`<!doctype html><meta charset="utf-8"><title>CLAIRE</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:64px auto;padding:0 16px"><h2>${titre}</h2><p>${texte}</p>`); };
    const q = req.query || {};
    if (typeof q.error === 'string') { page('Connexion refusée', 'Yousign n’a pas autorisé CLAIRE. Vous pouvez fermer cet onglet et recommencer depuis les Réglages.'); return; }
    try {
      await connexion.terminer(String(q.code || '').slice(0, 2000), String(q.state || '').slice(0, 200));
      client.oublier();
      noterVerification(parametresRepo, 'yousign-connexion', { detail: 'connexion par identifiant et mot de passe' });
      page('CLAIRE est connectée à Yousign', 'Vous pouvez fermer cet onglet et revenir dans CLAIRE (Réglages › Tester la connexion).');
    } catch (e) {
      const message = String(e && e.message || e).slice(0, 200);
      if (!(e && e.stateInconnu)) noterVerification(parametresRepo, 'yousign-connexion', { ok: false, message });
      page('Connexion impossible', message.replace(/[<>&]/g, ''));
    }
  }));

  // Retour collé à la main : l'adresse de la page où Yousign a renvoyé le navigateur (« http://localhost:…/api/yousign/oauth/retour?code=…&state=… »),
  // quand ce navigateur n'est pas celui du serveur. Seuls `code` et `state` en sont lus ; le `state` à usage unique la protège.
  routeur.post('/yousign/oauth/terminer', routeAsync(async (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    let q;
    try { q = new URL(String(corps.adresse || '').trim()).searchParams; } catch (e) { res.json({ ok: false, message: 'Adresse illisible : collez l’adresse entière de la page.' }); return; }
    if (q.get('error')) { res.json({ ok: false, message: 'Yousign n’a pas autorisé CLAIRE.' }); return; }
    try {
      await connexion.terminer(String(q.get('code') || '').slice(0, 2000), String(q.get('state') || '').slice(0, 200));
      client.oublier();
      noterVerification(parametresRepo, 'yousign-connexion', { detail: 'connexion par identifiant et mot de passe' });
      res.json({ ok: true, ...vue() });
    } catch (e) {
      const message = String(e && e.message || e).slice(0, 200);
      noterVerification(parametresRepo, 'yousign-connexion', { ok: false, message });
      res.json({ ok: false, message });
    }
  }));

  routeur.post('/yousign/oauth/deconnecter', (req, res) => { connexion.deconnecter(); client.oublier(); res.json({ ok: true, ...vue() }); });

  return routeur;
}

module.exports = { creerRouteurYousign, creerYousign, lireReglagesYousign };
