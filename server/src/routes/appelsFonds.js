'use strict';

// Historique des courriers d'appel de fonds (voir ../appelsFonds.js). Pas de PUT global : chaque poste envoie le seul
// courrier qu'il vient de télécharger ou d'envoyer, fusionné par identifiant.

const express = require('express');
const {
  CLE_APPELS_FONDS, assainirAppelFonds, assainirAppelsFonds, fusionnerAppelFonds, resumeAppelFonds
} = require('../appelsFonds');

function creerRouteurAppelsFonds(parametresRepo) {
  const routeur = express.Router();
  const lire = () => assainirAppelsFonds(parametresRepo.lireJsonBrut(CLE_APPELS_FONDS, []));
  const ecrire = (liste) => parametresRepo.ecrireJsonBrut(CLE_APPELS_FONDS, assainirAppelsFonds(liste));

  routeur.get('/appels-fonds', (req, res) => {
    const dossier = typeof req.query.dossier === 'string' ? req.query.dossier : '';
    const appels = lire().filter((a) => !dossier || a.dossierId === dossier).map(resumeAppelFonds);
    res.json({ appels });
  });

  routeur.get('/appels-fonds/:id', (req, res) => {
    const appel = lire().find((a) => a.id === req.params.id);
    if (!appel) return res.status(404).json({ erreur: 'Appel de fonds introuvable.' });
    res.json({ appel });
  });

  routeur.post('/appels-fonds', (req, res) => {
    const appel = assainirAppelFonds(req.body && req.body.appel);
    if (!appel) return res.status(400).json({ erreur: 'Appel de fonds invalide.' });
    const tous = lire();
    const fusionne = fusionnerAppelFonds(tous.find((a) => a.id === appel.id), appel);
    ecrire([fusionne, ...tous.filter((a) => a.id !== appel.id)]);
    res.json({ appel: resumeAppelFonds(fusionne) });
  });

  routeur.delete('/appels-fonds/:id', (req, res) => {
    const tous = lire();
    const restants = tous.filter((a) => a.id !== req.params.id);
    if (restants.length === tous.length) return res.status(404).json({ erreur: 'Appel de fonds introuvable.' });
    ecrire(restants);
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = { creerRouteurAppelsFonds };
