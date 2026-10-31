'use strict';

// Zonage d'une parcelle pour l'outil « Droits de préemption » (voir urbanisme.js) : API Carto de l'IGN, données publiques.
// Seuls le code postal, ou le code INSEE + section + numéro, quittent le bureau.

const express = require('express');
const { communesDuCodePostal, zonageParcelle } = require('../urbanisme');
const { vueParcelles, photoAerienne, autorisationsSitadel, raisonEchecSitadel } = require('../historiqueParcelle');
const { noterVerification } = require('../verificationsTerrain');
const carte = require('../carteUrbanisme');

function creerRouteurUrbanisme(parametresRepo, injections = {}) {
  const routeur = express.Router();
  const injoignable = (res, e) => res.status(502).json({
    erreur: `Géoportail de l'urbanisme injoignable (${e && e.statut ? 'réponse ' + e.statut : e && e.name === 'TimeoutError' ? 'délai dépassé' : 'réseau'}) : répondre à la main.`
  });

  routeur.get('/urbanisme/communes', async (req, res) => {
    try { res.json({ communes: await communesDuCodePostal(String(req.query.cp || ''), injections) }); }
    catch (e) { injoignable(res, e); }
  });

  routeur.get('/urbanisme/parcelle', async (req, res) => {
    try {
      const z = await zonageParcelle(String(req.query.insee || ''), String(req.query.section || ''), String(req.query.numero || ''), injections);
      if (z.erreur) return res.status(z.erreur.startsWith('Parcelle') ? 404 : 400).json(z);
      noterVerification(parametresRepo, 'zonage-parcelle-gpu', { detail: z.zones.length ? `zone ${z.zones[0].typezone}` : 'aucune zone' });
      res.json(z);
    } catch (e) {
      noterVerification(parametresRepo, 'zonage-parcelle-gpu', { ok: false, message: 'API Carto injoignable' });
      injoignable(res, e);
    }
  });

  // Photos aériennes de la parcelle dans le temps (IGN) et autorisations enregistrées dans Sitadel (étude 08/10, voir
  // historiqueParcelle.js) : seuls le code INSEE, les parcelles et l'emprise quittent le bureau.
  routeur.get('/urbanisme/vue', async (req, res) => {
    try {
      const v = await vueParcelles(String(req.query.insee || ''), String(req.query.parcelles || ''), injections);
      if (v.erreur) return res.status(404).json(v);
      res.json(v);
    } catch (e) { injoignable(res, e); }
  });

  routeur.get('/urbanisme/photo', async (req, res) => {
    try {
      const p = await photoAerienne(String(req.query.couche || ''), String(req.query.emprise || ''), injections);
      if (p.erreur) return res.status(400).json(p);
      noterVerification(parametresRepo, 'photos-aeriennes-ign', { detail: p.vide ? 'prise de vue absente' : 'image reçue' });
      if (p.vide) return res.status(204).end();
      res.set('Content-Type', p.type).set('Cache-Control', 'private, max-age=86400').send(Buffer.from(p.octets));
    } catch (e) {
      noterVerification(parametresRepo, 'photos-aeriennes-ign', { ok: false, message: 'Géoplateforme injoignable' });
      res.status(502).json({ erreur: 'Photos aériennes de l’IGN injoignables.' });
    }
  });

  routeur.get('/urbanisme/sitadel', async (req, res) => {
    try {
      const s = await autorisationsSitadel(String(req.query.insee || ''), String(req.query.parcelles || ''), injections);
      if (s.erreur) return res.status(400).json(s);
      noterVerification(parametresRepo, 'sitadel-parcelle', { detail: `${s.autorisations.length} autorisation(s)` });
      res.json(s);
    } catch (e) {
      noterVerification(parametresRepo, 'sitadel-parcelle', { ok: false, message: raisonEchecSitadel(e) });
      res.status(502).json({ erreur: 'Sitadel injoignable : chercher à la main sur le site du ministère.' });
    }
  });

  // Carte du Contrôle de l'urbanisme (étude 31/10, carteUrbanisme.js) : tuiles de l'IGN, point cliqué, zones du PLU, ventes DVF.
  // Ne partent que des coordonnées, un numéro de tuile, un code INSEE et une section.
  routeur.get('/urbanisme/tuile/:couche/:z/:x/:y', async (req, res) => {
    const t = await carte.tuileIgn(req.params.couche, Number(req.params.z), Number(req.params.x), Number(req.params.y), injections);
    if (!t) return res.status(404).end();
    if (!t.vide) noterVerification(parametresRepo, 'carte-urbanisme-tuiles', { detail: req.params.couche });
    res.set('Content-Type', t.type).set('Cache-Control', t.vide ? 'no-store' : 'private, max-age=604800').send(t.octets);
  });

  routeur.get('/urbanisme/point', async (req, res) => {
    try {
      const p = await carte.pointCarte(req.query.lon, req.query.lat, injections);
      if (p.erreur) return res.status(400).json(p);
      noterVerification(parametresRepo, 'carte-urbanisme-point', { detail: p.parcelle ? 'parcelle lue' : 'aucune parcelle' });
      res.json(p);
    } catch (e) { injoignable(res, e); }
  });

  routeur.get('/urbanisme/zones', async (req, res) => {
    try {
      const z = await carte.zonesCarte(req.query.emprise, injections);
      if (z.erreur) return res.status(400).json(z);
      res.json(z);
    } catch (e) { injoignable(res, e); }
  });

  routeur.get('/urbanisme/dvf', async (req, res) => {
    try {
      const v = await carte.ventesSection(req.query.insee, req.query.section, req.query.prefixe, injections);
      if (v.erreur) return res.status(400).json(v);
      noterVerification(parametresRepo, 'carte-urbanisme-dvf', { detail: `${v.ventes.length} vente(s)` });
      res.json(v);
    } catch (e) {
      noterVerification(parametresRepo, 'carte-urbanisme-dvf', { ok: false, message: 'DVF injoignable' });
      res.status(502).json({ erreur: 'Ventes DVF injoignables pour le moment.' });
    }
  });

  return routeur;
}

module.exports = { creerRouteurUrbanisme };
