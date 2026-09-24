'use strict';

// Sauvegarde de la base depuis l'écran Réglages (voir sauvegarde.js) : lire l'état, choisir le
// dossier de destination, lancer une sauvegarde tout de suite. Monté derrière l'authentification.

const express = require('express');
const {
  validerDossierSauvegarde, destinationSauvegarde, sauvegarderEtEnregistrer,
  joursDepuisDerniereSauvegarde, NB_SAUVEGARDES_CONSERVEES, JOURS_AVANT_ALERTE
} = require('../sauvegarde');

function creerRouteurSauvegarde(parametresRepo, db, config) {
  const routeur = express.Router();
  const cheminDb = config && config.cheminDb;

  function etatPublic() {
    const reglage = parametresRepo.lireReglageSauvegarde();
    const etat = parametresRepo.lireEtatSauvegarde();
    const actif = !!(cheminDb && cheminDb !== ':memory:');
    return {
      actif,
      dossier: reglage.dossier,
      destination: actif ? destinationSauvegarde(reglage.dossier, cheminDb) : null,
      conservees: NB_SAUVEGARDES_CONSERVEES,
      joursAvantAlerte: JOURS_AVANT_ALERTE,
      joursDepuisDerniere: joursDepuisDerniereSauvegarde(etat),
      derniereReussie: etat.derniereReussie,
      derniereTentative: etat.derniereTentative,
      cheminBase: actif ? cheminDb : null
    };
  }

  routeur.get('/sauvegarde', (req, res) => res.json(etatPublic()));

  routeur.put('/sauvegarde', (req, res) => {
    const v = validerDossierSauvegarde(req.body && req.body.dossier);
    if (!v.ok) return res.status(400).json({ erreur: v.erreur });
    parametresRepo.ecrireReglageSauvegarde({ dossier: v.dossier });
    res.json(etatPublic());
  });

  routeur.post('/sauvegarde/lancer', async (req, res) => {
    if (!cheminDb || cheminDb === ':memory:') return res.status(503).json({ erreur: 'Aucune base à sauvegarder.' });
    try {
      await sauvegarderEtEnregistrer(db, cheminDb, parametresRepo);
      res.json(etatPublic());
    } catch (e) {
      res.status(500).json({ erreur: e.message });
    }
  });

  return routeur;
}

module.exports = { creerRouteurSauvegarde };
