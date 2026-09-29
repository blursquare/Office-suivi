'use strict';

// Fichiers à installer sur un POSTE de l'étude (pas sur le serveur) : aujourd'hui, l'installateur de
// l'ouverture automatique des documents téléchargés (voir ../ouvertureAuto.js).

const express = require('express');
const { scriptInstallationOuvertureAuto } = require('../ouvertureAuto');

function creerRouteurPoste() {
  const routeur = express.Router();
  routeur.get('/poste/installer-ouverture-automatique', (req, res) => {
    res.setHeader('Content-Type', 'text/vbscript; charset=windows-1252');
    res.setHeader('Content-Disposition', 'attachment; filename="Installer-ouverture-automatique-CLAIRE.vbs"');
    res.send(Buffer.from(scriptInstallationOuvertureAuto(), 'latin1'));
  });
  return routeur;
}

module.exports = { creerRouteurPoste };
