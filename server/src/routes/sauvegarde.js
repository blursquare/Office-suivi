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

// Pure : le serveur d'un chemin réseau Windows (« \\\\NAS\\Partage » → « nas »), '' pour un chemin local.
function hoteReseau(chemin) {
  const m = /^[\\/]{2}([^\\/]+)/.exec(String(chemin || '').trim());
  return m ? m[1].toLowerCase() : '';
}

// Audit 13/10 (Haut) : un dossier de sauvegarde sur le partage d'une AUTRE machine que celles du NAS configuré envoyait une copie
// de la base (secrets compris) n'importe où sur le réseau, et permettait d'y prendre une base à restaurer. Seuls un disque du
// serveur ou un partage du serveur du NAS (racine, scans, fausses minutes) sont acceptés.
// Le serveur du dossier déjà enregistré par l'étude reste accepté (un NAS monté en lettre de lecteur ne donne pas son nom).
function dossierSauvegardeAutorise(dossier, config, dejaEnregistre) {
  const hote = hoteReseau(dossier);
  if (!hote) return true;
  const c = config || {};
  return [c.nasRacine, c.nasScans, c.nasFaussesMinutes, dejaEnregistre].map(hoteReseau).filter(Boolean).includes(hote);
}

// Pure (base ouverte) : une base de CLAIRE porte au moins ses tables de dossiers et de paramètres (audit 13/10 : une base
// quelconque passait le contrôle d'intégrité et CLAIRE redémarrait vide).
function schemaClaire(chemin) {
  const { DatabaseSync } = require('node:sqlite');
  let base = null;
  try {
    base = new DatabaseSync(chemin, { readOnly: true });
    const tables = base.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
    return ['dossiers', 'parametres'].every((t) => tables.includes(t));
  } catch (_) { return false; } finally { try { if (base) base.close(); } catch (_) { /* fermée */ } }
}

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
    if (!dossierSauvegardeAutorise(v.dossier, config, parametresRepo.lireReglageSauvegarde().dossier)) return res.status(400).json({ erreur: 'Choisissez un dossier du serveur ou du NAS de l’étude (le partage d’une autre machine est refusé).' });
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
      if (!schemaClaire(provisoire)) { await fsp.rm(provisoire, { force: true }); return res.status(422).json({ erreur: 'Ce fichier n’est pas une sauvegarde de CLAIRE : choisissez-en une autre.' }); }
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

module.exports = { creerRouteurSauvegarde, dossierSauvegardeAutorise, hoteReseau, schemaClaire };
