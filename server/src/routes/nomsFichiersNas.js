'use strict';

// Outil « Noms de fichiers du NAS » (voir ../nomsFichiersNas.js).
//  - POST /api/nas/noms-fichiers/parcourir : lance le parcours du dossier commun (un seul à la fois).
//  - GET  /api/nas/noms-fichiers : état du parcours ; les noms ([indexDossier, nom]) une fois prêt.
//  - GET  /api/formes-noms → { decisions }
//  - POST /api/formes-noms { cle, forme, decision: 'oui' | 'non' | null, exemple, fichiers, dossiers }

const express = require('express');
const fsp = require('node:fs/promises');
const {
  CLE_FORMES_NOMS, lireDecisionsFormes, appliquerDecisionForme, lancerParcoursNoms, etatPublicParcours, formeValide
} = require('../nomsFichiersNas');

function creerRouteurNomsFichiersNas(config, parametresRepo) {
  const routeur = express.Router();

  routeur.post('/nas/noms-fichiers/parcourir', async (req, res) => {
    const racine = config && config.nasRacine;
    let accessible = false;
    try { accessible = !!racine && (await fsp.stat(racine)).isDirectory(); } catch (_) { accessible = false; }
    if (!accessible) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré ou accessible depuis le serveur.' }); return; }
    res.json(await lancerParcoursNoms(racine, { parametresRepo }));
  });

  routeur.get('/nas/noms-fichiers', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(etatPublicParcours(true));
  });

  routeur.get('/formes-noms', (req, res) => res.json({ decisions: lireDecisionsFormes(parametresRepo) }));

  routeur.post('/formes-noms', (req, res) => {
    const b = req.body || {};
    const decision = b.decision === 'oui' || b.decision === 'non' ? b.decision : null;
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(String(b.cle || '')) || !formeValide(b.forme)) {
      res.status(400).json({ erreur: 'Pièce ou forme invalide.' });
      return;
    }
    const decisions = appliquerDecisionForme(lireDecisionsFormes(parametresRepo), {
      cle: b.cle, forme: b.forme, decision, exemple: b.exemple,
      fichiers: Number.isInteger(b.fichiers) ? b.fichiers : 0, dossiers: Number.isInteger(b.dossiers) ? b.dossiers : 0
    });
    parametresRepo.ecrireJsonBrut(CLE_FORMES_NOMS, decisions);
    res.json({ decisions });
  });

  return routeur;
}

module.exports = { creerRouteurNomsFichiersNas };
