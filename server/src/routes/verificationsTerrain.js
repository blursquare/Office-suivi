'use strict';

// Vérifications sur le terrain (voir ../verificationsTerrain.js), Réglages › Mise à jour et sauvegarde.
//  - GET  /api/verifications-terrain → { verifications } (catalogue + état, la plus récente mise à jour d'abord)
//  - POST /api/verifications-terrain/noter { id, ok, detail, message } : observation faite par une fenêtre
//    CLAIRE (seulement les points dont la source est « poste »)
//  - POST /api/verifications-terrain/confirmer { id, confirme } : point « manuel » confirmé ou signalé

const express = require('express');
const {
  VERIFICATIONS_TERRAIN, lireVerifications, listeVerifications, noterVerification, confirmerVerification
} = require('../verificationsTerrain');

function creerRouteurVerificationsTerrain(parametresRepo) {
  const routeur = express.Router();
  const liste = () => ({ verifications: listeVerifications(lireVerifications(parametresRepo)) });

  routeur.get('/verifications-terrain', (req, res) => res.json(liste()));

  routeur.post('/verifications-terrain/noter', (req, res) => {
    const b = req.body || {};
    const def = VERIFICATIONS_TERRAIN.find((v) => v.id === b.id);
    if (!def || def.source !== 'poste') { res.status(400).json({ erreur: 'Vérification inconnue.' }); return; }
    noterVerification(parametresRepo, def.id, { ok: b.ok !== false, detail: typeof b.detail === 'string' ? b.detail : '', message: typeof b.message === 'string' ? b.message : '' });
    res.json({ ok: true });
  });

  routeur.post('/verifications-terrain/confirmer', (req, res) => {
    const b = req.body || {};
    if (typeof b.confirme !== 'boolean') { res.status(400).json({ erreur: 'Choix attendu.' }); return; }
    const r = confirmerVerification(parametresRepo, String(b.id || ''), b.confirme);
    if (!r) { res.status(400).json({ erreur: 'Vérification inconnue ou automatique.' }); return; }
    res.json(liste());
  });

  return routeur;
}

module.exports = { creerRouteurVerificationsTerrain };
