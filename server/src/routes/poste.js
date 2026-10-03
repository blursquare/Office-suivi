'use strict';

// Fichiers à installer sur un POSTE de l'étude (pas sur le serveur) : l'installateur de l'ouverture
// automatique des documents téléchargés (voir ../ouvertureAuto.js) et celui de CLAIRE en application
// (fenêtre à part, raccourcis du bureau et du menu Démarrer — voir ../installationPoste.js).

const express = require('express');
const { scriptInstallationOuvertureAuto } = require('../ouvertureAuto');
const { scriptInstallationAppPoste, adresseClairePoste } = require('../installationPoste');
const { noterVerification } = require('../verificationsTerrain');

// Icône Windows de CLAIRE (.ico multi-tailles construit avec l'exe, voir build-windows-exe.mjs) :
// présente seulement dans CLAIRE-serveur.exe.
function lireIconeSea() {
  try {
    const sea = require('node:sea');
    if (!sea.isSea()) return null;
    return Buffer.from(sea.getAsset('icone.ico'));
  } catch (_) { return null; }
}

function creerRouteurPoste() {
  const routeur = express.Router();
  routeur.get('/poste/installer-ouverture-automatique', (req, res) => {
    res.setHeader('Content-Type', 'text/vbscript; charset=windows-1252');
    res.setHeader('Content-Disposition', 'attachment; filename="Installer-ouverture-automatique-CLAIRE.vbs"');
    res.send(Buffer.from(scriptInstallationOuvertureAuto(), 'latin1'));
  });
  routeur.get('/poste/installer-application', (req, res) => {
    const url = adresseClairePoste(req.protocol, req.get('host'));
    if (!url) { res.status(400).json({ erreur: 'Adresse du serveur illisible.' }); return; }
    res.setHeader('Content-Type', 'text/vbscript; charset=windows-1252');
    res.setHeader('Content-Disposition', 'attachment; filename="Installer-CLAIRE-sur-ce-poste.vbs"');
    res.send(Buffer.from(scriptInstallationAppPoste(url), 'latin1'));
  });
  return routeur;
}

// Hors authentification : l'installateur la télécharge seul, sans session (une icône, rien d'autre).
function creerRouteurIconePoste(options = {}) {
  const routeur = express.Router();
  const lireIcone = options.lireIcone || lireIconeSea;
  routeur.get('/poste/icone.ico', (req, res) => {
    const ico = lireIcone();
    if (!ico) { res.status(404).end(); return; }
    // Seul l'installateur d'un poste (script .vbs) télécharge cette icône : il a donc tourné sous Windows.
    noterVerification(options.parametresRepo, 'installation-poste');
    res.setHeader('Content-Type', 'image/x-icon');
    res.send(ico);
  });
  return routeur;
}

module.exports = { creerRouteurPoste, creerRouteurIconePoste };
