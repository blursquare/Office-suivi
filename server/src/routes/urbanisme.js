'use strict';

// Zonage d'une parcelle pour l'outil « Droits de préemption » (voir urbanisme.js) : API Carto de l'IGN, données publiques.
// Seuls le code postal, ou le code INSEE + section + numéro, quittent le bureau.

const express = require('express');
const { communesDuCodePostal, zonageParcelle } = require('../urbanisme');
const { noterVerification } = require('../verificationsTerrain');

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

  return routeur;
}

module.exports = { creerRouteurUrbanisme };
