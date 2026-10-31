// @ts-check
'use strict';
// GIF des discussions (voir ../gif.js) : recherche, image servie par le serveur, réglage de la clé (administrateur, jamais renvoyée).

const express = require('express');
const { collaborateurDe } = require('./canaux');
const { CLE, lireCle } = require('../gif');
const { noterVerification } = require('../verificationsTerrain');

const ADMINISTRATEURS = ['Bastien ANGLUMENT', 'Sophie GOSSART'];

/** @param {Function} fn */
const routeAsync = (fn) => (/** @type {any} */ req, /** @type {any} */ res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error('[gif]', e && e.message);
  if (!res.headersSent) res.status(e && e.status === 400 ? 400 : 502).json({ erreur: String((e && e.message) || 'erreur').slice(0, 120) });
});

/** @param {any} repo @param {any} gif */
function creerRouteurGif(repo, gif) {
  const routeur = express.Router();

  routeur.get('/gif/reglages', (req, res) => { res.json({ cleEnregistree: !!lireCle(repo) }); });

  routeur.put('/gif/reglages', (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (!ADMINISTRATEURS.includes(collaborateurDe(b.auteur))) { res.status(403).json({ erreur: 'Réservé à l’administrateur.' }); return; }
    if (typeof b.cle !== 'string') { res.json({ cleEnregistree: !!lireCle(repo) }); return; }
    const cle = b.cle.trim().slice(0, 200);
    repo.ecrireJsonBrut(CLE, cle ? { cle } : {});
    res.json({ cleEnregistree: !!cle });
  });

  routeur.get('/gif/recherche', routeAsync(async (req, res) => {
    let r;
    try { r = await gif.rechercher(typeof req.query.q === 'string' ? req.query.q : ''); }
    catch (e) { noterVerification(repo, 'gif-tenor', { ok: false, message: String((e && e.message) || 'erreur').slice(0, 80) }); throw e; }
    if (r.disponible) noterVerification(repo, 'gif-tenor', { detail: `${r.resultats.length} GIF` });
    res.json(r);
  }));

  routeur.get('/gif/image', routeAsync(async (req, res) => {
    const tampon = await gif.image(typeof req.query.url === 'string' ? req.query.url : '');
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(tampon);
  }));

  return routeur;
}

module.exports = { creerRouteurGif };
