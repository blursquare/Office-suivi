// @ts-check
'use strict';
// Signature du RIB par Yousign, brouillon préparé par l'agent Yousign (voir signatureRibAgent.js) : disponibilité et création du brouillon.
// Rien n'est envoyé aux destinataires ; le lien rendu mène au brouillon dans Yousign, que l'étude vérifie puis envoie.

const express = require('express');
const { noterVerification } = require('../verificationsTerrain');

/** Codes qui disent « l'agent n'est pas utilisable tel que réglé » : le poste repasse au bouton de repli. */
const CODES_CONFIGURATION = ['configuration', 'cle', 'introuvable'];

/** @param {any} parametresRepo @param {{ disponibilite: Function, creerBrouillon: Function, lireStatut: Function }} service */
function creerRouteurSignatureRib(parametresRepo, service) {
  const router = express.Router();

  router.get('/signature-rib/disponibilite', async (req, res) => {
    try {
      const d = await service.disponibilite();
      res.json({ disponible: !!d.disponible });
    } catch (e) {
      console.error('[signature-rib] disponibilité', e && e.message ? e.message : e);
      res.json({ disponible: false });
    }
  });

  router.post('/signature-rib/brouillon', express.json({ limit: '4kb' }), async (req, res) => {
    try {
      const r = await service.creerBrouillon(req.body);
      if (r.ok) noterVerification(parametresRepo, 'signature-rib-claude', { detail: 'brouillon créé par l’agent Yousign' });
      else if (r.code !== 'donnees' && r.code !== 'occupe') noterVerification(parametresRepo, 'signature-rib-claude', { ok: false, message: r.code });
      const statut = r.ok ? 200 : r.code === 'donnees' ? 400 : r.code === 'occupe' ? 409 : 502;
      res.status(statut).json(r.ok ? { ok: true, id: r.id, url: r.url } : { ok: false, code: r.code, raison: r.raison, configuration: CODES_CONFIGURATION.includes(r.code) });
    } catch (e) {
      console.error('[signature-rib]', e && e.message ? e.message : e);
      res.status(500).json({ ok: false, code: 'erreur', raison: 'Erreur interne.' });
    }
  });

  router.post('/signature-rib/statut', express.json({ limit: '1kb' }), async (req, res) => {
    try {
      const r = await service.lireStatut(req.body && req.body.id);
      const statut = r.ok ? 200 : r.code === 'donnees' ? 400 : r.code === 'occupe' ? 409 : 502;
      res.status(statut).json(r.ok ? { ok: true, statut: r.statut } : { ok: false, code: r.code, raison: r.raison });
    } catch (e) {
      console.error('[signature-rib] statut', e && e.message ? e.message : e);
      res.status(500).json({ ok: false, code: 'erreur', raison: 'Erreur interne.' });
    }
  });

  return router;
}

module.exports = { creerRouteurSignatureRib };
