'use strict';

// Écran Réglages › Mise à jour de CLAIRE (voir miseAJour.js pour le déroulé et ses garde-fous).
// Monté derrière l'authentification. Rien ne s'installe sans un POST explicite sur /installer.

const express = require('express');
const path = require('node:path');
const {
  DEPOT_GITHUB, NOM_EXE_ANCIEN, lireBuildInstalle, derniereVersionDisponible, comparerVersions,
  cheminsExecutable, telechargerExecutable, echangerExecutables
} = require('../miseAJour');
const { sauvegarderEtEnregistrer } = require('../sauvegarde');

function seaParDefaut() {
  try { return require('node:sea'); } catch (_) { return null; }
}

// `options` (tests seulement, sauf `redemarrer`) : sea, fetchFn, dossierExe, echanger, sauvegarder,
// tailleMin. `redemarrer` est fourni par index.js — c'est lui qui ferme le serveur et relance
// l'exécutable ; sans lui (tests, montage partiel), l'installation est refusée plutôt que de
// laisser un exécutable remplacé qui ne tournerait qu'au prochain démarrage manuel.
function creerRouteurMiseAJour(parametresRepo, db, config, options = {}) {
  const routeur = express.Router();
  const sea = options.sea !== undefined ? options.sea : seaParDefaut();
  const fetchFn = options.fetchFn || fetch;
  const modeExe = !!(sea && sea.isSea && sea.isSea());
  const dossierExe = options.dossierExe || path.dirname(process.execPath);
  const echanger = options.echanger || echangerExecutables;
  const sauvegarder = options.sauvegarder
    || (() => sauvegarderEtEnregistrer(db, config && config.cheminDb, parametresRepo));
  let installationEnCours = false;

  function jeton() {
    return parametresRepo.lireReglagesMiseAJour().jetonGithub;
  }

  function etatPublic() {
    return {
      modeExe,
      depot: DEPOT_GITHUB,
      installe: lireBuildInstalle(sea),
      jetonEnregistre: !!jeton(),
      installationEnCours
    };
  }

  routeur.get('/mise-a-jour', (req, res) => res.json(etatPublic()));

  routeur.put('/mise-a-jour/jeton', (req, res) => {
    const brut = req.body && req.body.jetonGithub;
    if (typeof brut !== 'string') return res.status(400).json({ erreur: 'Jeton manquant.' });
    const valeur = brut.trim();
    if (valeur && !/^[A-Za-z0-9_]{20,255}$/.test(valeur)) {
      return res.status(400).json({ erreur: "Ce n'est pas un jeton GitHub (il commence en général par « github_pat_ » et ne contient pas d'espace)." });
    }
    parametresRepo.ecrireReglagesMiseAJour({ jetonGithub: valeur });
    res.json(etatPublic());
  });

  routeur.post('/mise-a-jour/verifier', async (req, res) => {
    try {
      const disponible = await derniereVersionDisponible({ jeton: jeton(), fetchFn });
      const installe = lireBuildInstalle(sea);
      res.json({ ...etatPublic(), disponible: { build: disponible.build, tag: disponible.tag, publieLe: disponible.publieLe, commit: disponible.commit, taille: disponible.asset.taille }, etat: comparerVersions(installe, disponible) });
    } catch (e) {
      res.status(502).json({ ...etatPublic(), erreur: e.message });
    }
  });

  routeur.post('/mise-a-jour/installer', async (req, res) => {
    if (!modeExe) {
      return res.status(409).json({ erreur: "La mise à jour ne fonctionne que dans CLAIRE-serveur.exe (ce serveur tourne en mode développement)." });
    }
    if (typeof options.redemarrer !== 'function') {
      return res.status(503).json({ erreur: 'Redémarrage automatique indisponible sur ce serveur.' });
    }
    if (installationEnCours) return res.status(409).json({ erreur: 'Une mise à jour est déjà en cours.' });
    installationEnCours = true;
    const chemins = cheminsExecutable(dossierExe);
    try {
      const disponible = await derniereVersionDisponible({ jeton: jeton(), fetchFn });
      const installe = lireBuildInstalle(sea);
      if (comparerVersions(installe, disponible) === 'a-jour') {
        installationEnCours = false;
        return res.status(409).json({ erreur: 'CLAIRE est déjà à jour.' });
      }

      // Sauvegarde AVANT de toucher à quoi que ce soit : une nouvelle version peut faire évoluer
      // la base à son premier démarrage, et c'est la seule façon de revenir en arrière proprement.
      const sauvegarde = config && config.cheminDb && config.cheminDb !== ':memory:' ? await sauvegarder() : { ok: true };
      if (!sauvegarde || !sauvegarde.ok) {
        throw new Error(`Sauvegarde de la base impossible (${(sauvegarde && sauvegarde.erreur) || 'erreur inconnue'}) : mise à jour annulée, rien n'a été changé.`);
      }

      await telechargerExecutable({ asset: disponible.asset, jeton: jeton(), destination: chemins.nouveau, fetchFn, tailleMin: options.tailleMin });
      await echanger(chemins);
      console.log(`[CLAIRE] Mise à jour vers le build ${disponible.build} installée ; redémarrage. Ancienne version conservée : ${NOM_EXE_ANCIEN}`);
      // Après l'envoi de la réponse : le navigateur doit savoir que tout s'est bien passé avant que
      // le serveur ne s'arrête. Écouteur posé AVANT res.json, qui peut terminer la réponse aussitôt.
      res.on('finish', () => setTimeout(() => options.redemarrer(), 300));
      res.json({ ok: true, build: disponible.build, ancien: NOM_EXE_ANCIEN });
    } catch (e) {
      installationEnCours = false;
      console.warn('[CLAIRE] Mise à jour impossible :', e.message);
      res.status(502).json({ erreur: e.message });
    }
  });

  return routeur;
}

module.exports = { creerRouteurMiseAJour };
