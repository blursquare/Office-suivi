'use strict';
// Guichets uniques d'urbanisme (GNAU) : la fiche d'un dossier pour le CU et la DIA, lue par l'extension Chrome « CLAIRE — Assistant
// de saisie » (extension-chrome/, étude 16/10). Lecture seule : rien n'est écrit sur le dossier ; la fiche ne quitte le réseau du
// bureau que dans le guichet de la commune, saisie par l'extension dans la session du notaire, qui relit et valide lui-même.

const express = require('express');
const { ficheGnau, dossiersGnau } = require('../gnau');
const { noterVerification } = require('../verificationsTerrain');

const RE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const aujourdhuiParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/** @param {any} depot @param {any} parametresRepo */
function creerRouteurGnau(depot, parametresRepo) {
  const routeur = express.Router();

  routeur.get('/gnau/dossiers', (req, res) => {
    const q = String(req.query.q || '').slice(0, 80);
    res.json({ dossiers: dossiersGnau(depot.tousActifs(), q) });
  });

  routeur.get('/gnau/fiche/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant de dossier invalide.' }); return; }
    const d = depot.trouverParId(id);
    if (!d || d.deleted) { res.status(404).json({ erreur: 'Dossier introuvable.' }); return; }
    if (d.typeAffaire === 'succession') { res.status(400).json({ erreur: 'Une succession n’a ni CU ni DIA.' }); return; }
    const procedure = req.query.procedure === 'dia' ? 'dia' : 'cua';
    const fiche = ficheGnau(d, procedure, aujourdhuiParis());
    noterVerification(parametresRepo, 'gnau-fiche-extension', { detail: `fiche ${procedure} servie à l’extension` });
    res.json({ fiche });
  });

  return routeur;
}

module.exports = { creerRouteurGnau };
