'use strict';

// Sauvegarde de la base depuis l'écran Réglages (voir sauvegarde.js) : lire l'état, choisir le
// dossier de destination, lancer une sauvegarde tout de suite. Monté derrière l'authentification.

const express = require('express');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { cheminRestauration, controlerBase } = require('../restauration');
const {
  validerDossierSauvegarde, destinationSauvegarde, sauvegarderEtEnregistrer,
  joursDepuisDerniereSauvegarde, NB_SAUVEGARDES_CONSERVEES, JOURS_AVANT_ALERTE, RE_NOM_SAUVEGARDE, comparerNomsSauvegarde
} = require('../sauvegarde');

function creerRouteurSauvegarde(parametresRepo, db, config, miseAJour = {}) {
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

  // Sauvegardes disponibles dans le dossier de destination (les plus récentes d'abord).
  routeur.get('/sauvegarde/liste', async (req, res) => {
    if (!cheminDb || cheminDb === ':memory:') return res.json({ sauvegardes: [], dossier: null });
    const { dossier } = destinationSauvegarde(parametresRepo.lireReglageSauvegarde().dossier, cheminDb);
    try {
      const noms = (await fsp.readdir(dossier)).filter((n) => RE_NOM_SAUVEGARDE.test(n)).sort(comparerNomsSauvegarde).reverse();
      const sauvegardes = [];
      for (const nom of noms) {
        try { const st = await fsp.stat(path.join(dossier, nom)); sauvegardes.push({ nom, taille: st.size, modifieLe: st.mtime.toISOString() }); } catch (_) { /* disparue entre-temps */ }
      }
      res.json({ sauvegardes, dossier });
    } catch (e) {
      res.json({ sauvegardes: [], dossier, erreur: e.code === 'ENOENT' ? 'Aucune sauvegarde encore faite dans ce dossier.' : `Dossier illisible (${e.code || e.message}).` });
    }
  });

  // Restaurer (étude 06/10) : la sauvegarde choisie est copiée à côté de la base sous « claire-restauration.db », contrôlée,
  // puis CLAIRE redémarre ; au démarrage, elle prend la place de la base (l'ancienne est gardée avec son journal).
  routeur.post('/sauvegarde/restaurer', async (req, res) => {
    if (!cheminDb || cheminDb === ':memory:') return res.status(503).json({ erreur: 'Aucune base à restaurer.' });
    const nom = String((req.body && req.body.fichier) || '');
    if (!RE_NOM_SAUVEGARDE.test(nom)) return res.status(400).json({ erreur: 'Sauvegarde inconnue.' });
    const { dossier } = destinationSauvegarde(parametresRepo.lireReglageSauvegarde().dossier, cheminDb);
    const cible = cheminRestauration(cheminDb);
    const provisoire = `${cible}.partiel`;
    try {
      await fsp.copyFile(path.join(dossier, nom), provisoire);
      const controle = controlerBase(provisoire, true);
      if (controle !== 'ok') { await fsp.rm(provisoire, { force: true }); return res.status(422).json({ erreur: `Sauvegarde illisible (${controle}) : choisissez-en une autre.` }); }
      await fsp.rename(provisoire, cible);
    } catch (e) {
      await fsp.rm(provisoire, { force: true }).catch(() => {});
      return res.status(e.code === 'ENOENT' ? 404 : 500).json({ erreur: e.code === 'ENOENT' ? 'Sauvegarde introuvable.' : `Copie impossible (${e.code || e.message}).` });
    }
    // Redémarrage seul seulement pour l'exécutable (comme la mise à jour) ; ailleurs, CLAIRE est à relancer à la main.
    const redemarrage = typeof miseAJour.redemarrer === 'function' && !!(config && typeof config.estSea === 'function' && config.estSea());
    res.json({ ok: true, fichier: nom, redemarrage });
    // Après la réponse : le poste affiche « CLAIRE redémarre… » puis se recharge quand le serveur répond de nouveau.
    if (redemarrage) setTimeout(() => miseAJour.redemarrer(), 300);
  });

  return routeur;
}

module.exports = { creerRouteurSauvegarde };
