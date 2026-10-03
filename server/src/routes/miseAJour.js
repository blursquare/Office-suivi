'use strict';

// Écran Réglages › Mise à jour de CLAIRE (voir miseAJour.js pour le déroulé et ses garde-fous).
// Monté derrière l'authentification. Installation sur un POST explicite sur /installer, ou
// automatiquement (étude 03/10 : « au démarrage et dès que c'est détecté ») par `demarrerAuto`, que
// seul index.js lance : vérification 30 s après le démarrage puis toutes les 10 minutes, installation
// dès qu'un build plus récent est publié — jamais sur une version illisible (« inconnu »), et un build
// qui a échoué n'est retenté qu'après 6 heures (ou au prochain démarrage).

const express = require('express');
const path = require('node:path');
const {
  DEPOT_GITHUB, NOM_EXE_ANCIEN, lireBuildInstalle, derniereVersionDisponible, comparerVersions,
  cheminsExecutable, telechargerExecutable, echangerExecutables
} = require('../miseAJour');
const { sauvegarderEtEnregistrer } = require('../sauvegarde');
const { noterVerification } = require('../verificationsTerrain');

// Build installé automatiquement, attendu au démarrage suivant (vérifications sur le terrain).
const CLE_MAJ_AUTO_ATTENDUE = 'maj-auto-attendue';

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

  // Démarrage qui suit une installation automatique : le build en marche est-il celui installé ?
  if (modeExe && parametresRepo.lireJsonBrut) {
    const attendu = parametresRepo.lireJsonBrut(CLE_MAJ_AUTO_ATTENDUE, null);
    if (attendu && Number.isInteger(attendu.build)) {
      const enMarche = (lireBuildInstalle(sea) || {}).build;
      noterVerification(parametresRepo, 'maj-auto', enMarche === attendu.build
        ? { detail: `build ${attendu.build}` }
        : { ok: false, message: `redémarré sur le build ${enMarche || 'inconnu'} au lieu du build ${attendu.build}` });
      parametresRepo.ecrireJsonBrut(CLE_MAJ_AUTO_ATTENDUE, null);
    }
  }

  function jeton() {
    return parametresRepo.lireReglagesMiseAJour().jetonGithub;
  }

  function etatPublic() {
    return {
      modeExe,
      depot: DEPOT_GITHUB,
      installe: lireBuildInstalle(sea),
      jetonEnregistre: !!jeton(),
      auto: parametresRepo.lireReglagesMiseAJour().auto,
      autoEtat: { ...etatAuto, echec: undefined },
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

  // Installe le dernier build publié (sauvegarde → téléchargement → contrôle → échange). Rend
  // { ok, build } ou lève une erreur `statut`. Le redémarrage reste à l'appelant.
  async function installerDerniere(disponibleConnu) {
    if (!modeExe) throw Object.assign(new Error("La mise à jour ne fonctionne que dans CLAIRE-serveur.exe (ce serveur tourne en mode développement)."), { statut: 409 });
    if (typeof options.redemarrer !== 'function') throw Object.assign(new Error('Redémarrage automatique indisponible sur ce serveur.'), { statut: 503 });
    if (installationEnCours) throw Object.assign(new Error('Une mise à jour est déjà en cours.'), { statut: 409 });
    installationEnCours = true;
    const chemins = cheminsExecutable(dossierExe);
    try {
      const disponible = disponibleConnu || await derniereVersionDisponible({ jeton: jeton(), fetchFn });
      const installe = lireBuildInstalle(sea);
      if (comparerVersions(installe, disponible) === 'a-jour') throw Object.assign(new Error('CLAIRE est déjà à jour.'), { statut: 409 });

      // Sauvegarde AVANT de toucher à quoi que ce soit : une nouvelle version peut faire évoluer
      // la base à son premier démarrage, et c'est la seule façon de revenir en arrière proprement.
      const sauvegarde = config && config.cheminDb && config.cheminDb !== ':memory:' ? await sauvegarder() : { ok: true };
      if (!sauvegarde || !sauvegarde.ok) {
        throw new Error(`Sauvegarde de la base impossible (${(sauvegarde && sauvegarde.erreur) || 'erreur inconnue'}) : mise à jour annulée, rien n'a été changé.`);
      }

      await telechargerExecutable({ asset: disponible.asset, jeton: jeton(), destination: chemins.nouveau, fetchFn, tailleMin: options.tailleMin });
      await echanger(chemins);
      console.log(`[CLAIRE] Mise à jour vers le build ${disponible.build} installée ; redémarrage. Ancienne version conservée : ${NOM_EXE_ANCIEN}`);
      return { ok: true, build: disponible.build, ancien: NOM_EXE_ANCIEN };
    } catch (e) {
      installationEnCours = false;
      throw e;
    }
  }

  routeur.post('/mise-a-jour/installer', async (req, res) => {
    try {
      const r = await installerDerniere();
      // Après l'envoi de la réponse : le navigateur doit savoir que tout s'est bien passé avant que
      // le serveur ne s'arrête. Écouteur posé AVANT res.json, qui peut terminer la réponse aussitôt.
      res.on('finish', () => setTimeout(() => options.redemarrer(), 300));
      res.json(r);
    } catch (e) {
      if (!e.statut) console.warn('[CLAIRE] Mise à jour impossible :', e.message);
      res.status(e.statut || 502).json({ erreur: e.message });
    }
  });

  routeur.put('/mise-a-jour/auto', (req, res) => {
    if (!req.body || typeof req.body.auto !== 'boolean') return res.status(400).json({ erreur: 'Choix attendu.' });
    parametresRepo.ecrireReglagesMiseAJour({ auto: req.body.auto });
    res.json(etatPublic());
  });

  // ---- Installation automatique ----
  const etatAuto = { dernierControle: null, resultat: null, echec: null };
  async function tourAuto() {
    if (!modeExe || installationEnCours || !parametresRepo.lireReglagesMiseAJour().auto || !jeton()) return null;
    etatAuto.dernierControle = new Date().toISOString();
    let disponible;
    try {
      disponible = await derniereVersionDisponible({ jeton: jeton(), fetchFn });
    } catch (e) {
      etatAuto.resultat = `Vérification impossible : ${e.message}`;
      return null;
    }
    // Seulement un build plus récent et lisible : jamais « inconnu » (on ne saurait pas s'arrêter).
    if (comparerVersions(lireBuildInstalle(sea), disponible) !== 'disponible') { etatAuto.resultat = 'À jour'; return null; }
    if (etatAuto.echec && etatAuto.echec.build === disponible.build && Date.now() - etatAuto.echec.le < 6 * 3600 * 1000) return null;
    try {
      const r = await installerDerniere(disponible);
      etatAuto.resultat = `Build ${r.build} installé automatiquement`;
      if (parametresRepo.ecrireJsonBrut) parametresRepo.ecrireJsonBrut(CLE_MAJ_AUTO_ATTENDUE, { build: r.build, le: new Date().toISOString() });
      setTimeout(() => options.redemarrer(), 300);
      return r;
    } catch (e) {
      etatAuto.echec = { build: disponible.build, le: Date.now() };
      etatAuto.resultat = `Installation automatique impossible : ${e.message}`;
      console.warn('[CLAIRE] Mise à jour automatique impossible :', e.message);
      return null;
    }
  }
  routeur.tourAuto = tourAuto;
  routeur.demarrerAuto = (intervalleMs = 10 * 60 * 1000, premierMs = 30 * 1000) => {
    setTimeout(() => { tourAuto().catch(() => {}); }, premierMs).unref();
    return setInterval(() => { tourAuto().catch(() => {}); }, intervalleMs).unref();
  };

  return routeur;
}

module.exports = { creerRouteurMiseAJour };
