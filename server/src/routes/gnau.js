'use strict';
// Guichets uniques d'urbanisme (GNAU) : la fiche d'un dossier pour le CU et la DIA, lue par l'extension Chrome « CLAIRE — Assistant
// de saisie » (extension-chrome/, étude 16/10). Lecture seule : rien n'est écrit sur le dossier ; la fiche ne quitte le réseau du
// bureau que dans le guichet de la commune, saisie par l'extension dans la session du notaire, qui relit et valide lui-même.

const express = require('express');
const fsp = require('fs/promises');
const path = require('path');
const { ficheGnau, dossiersGnau, choisirPlanCadastral } = require('../gnau');
const { listerPdfRecursif, resoudreCheminNas, fichiersLesPlusRecents } = require('../nas');
const { noterVerification } = require('../verificationsTerrain');

const RE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const aujourdhuiParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

const TAILLE_MAX_PLAN = 15 * 1024 * 1024;

/** @param {any} depot @param {any} parametresRepo @param {any} [config] */
function creerRouteurGnau(depot, parametresRepo, config) {
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

  // Le plan cadastral du dossier client du NAS (étude 16/10 : « aller chercher le plan du cadastre dans le dossier sur le NAS pour
  // l'annexer »), joint par l'extension au champ de pièce du guichet. Lecture seule ; le dossier est celui que la fiche a relié, jamais
  // un chemin venu de l'extension ; PDF seulement, 15 Mo au plus. Nom envoyé : « Plan cadastral.pdf » (jamais le nom du fichier).
  routeur.get('/gnau/plan/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant de dossier invalide.' }); return; }
      const d = depot.trouverParId(id);
      if (!d || d.deleted) { res.status(404).json({ erreur: 'Dossier introuvable.' }); return; }
      const racine = config && config.nasRacine;
      if (!racine || !d.nasDossier) { res.status(404).json({ erreur: 'Dossier non relié au NAS : joignez le plan vous-même.' }); return; }
      const absolu = await resoudreCheminNas(racine, String(d.nasDossier));
      if (!absolu) { res.status(404).json({ erreur: 'Dossier du NAS introuvable.' }); return; }
      const fichiers = await listerPdfRecursif(absolu);
      const recents = await fichiersLesPlusRecents(absolu, fichiers.filter((f) => choisirPlanCadastral([f]).length), 20);
      const choix = choisirPlanCadastral(recents)[0];
      if (!choix) { res.status(404).json({ erreur: 'Aucun plan cadastral dans le dossier du NAS (nom « plan cadastral », « plan de situation », « extrait cadastral »…).' }); return; }
      const cible = await resoudreCheminNas(absolu, choix.chemin);
      if (!cible || !/\.pdf$/i.test(cible)) { res.status(404).json({ erreur: 'Plan illisible.' }); return; }
      const st = await fsp.stat(cible);
      if (st.size > TAILLE_MAX_PLAN) { res.status(413).json({ erreur: 'Plan cadastral trop lourd (plus de 15 Mo) : joignez-le vous-même.' }); return; }
      const contenu = await fsp.readFile(cible);
      noterVerification(parametresRepo, 'gnau-plan-cadastral', { detail: 'plan du NAS servi à l’extension' });
      res.set('Content-Type', 'application/pdf');
      res.set('X-Claire-Nom', encodeURIComponent('Plan cadastral.pdf'));
      res.set('X-Claire-Source', encodeURIComponent(path.basename(path.dirname(cible)) === path.basename(absolu) ? 'racine du dossier' : 'sous-dossier ' + path.basename(path.dirname(cible))));
      res.send(contenu);
    } catch (e) {
      console.error('[gnau] plan cadastral :', e && e.code ? e.code : 'erreur');
      res.status(500).json({ erreur: 'Lecture du plan impossible.' });
    }
  });

  return routeur;
}

module.exports = { creerRouteurGnau };
