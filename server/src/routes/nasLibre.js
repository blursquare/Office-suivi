'use strict';

// Lecture libre du NAS par l'agent (étude 21/10, palier 2) — voir ../nasLibre.js. Lecture seule, éteinte par défaut.
//   GET  /api/nas-libre/reglages            → { actif, racines, exclus }
//   PUT  /api/nas-libre/reglages            { actif, racines, exclus }
//   GET  /api/nas-libre/lister?sous=        → un niveau
//   GET  /api/nas-libre/chercher?texte=&sous=
//   GET  /api/nas-libre/texte?chemin=&debut= → texte d'un Word / texte / CSV
//   GET  /api/nas-libre/pdf?chemin=         → un PDF permis, lu par le poste (pdf.js, OCR) — passe par les mêmes réglages que le reste

const express = require('express');
const path = require('node:path');
const nl = require('../nasLibre');
const { resoudreCheminNas } = require('../nas');
const { envoyerFlux } = require('./nas');

function creerRouteurNasLibre(config, parametresRepo) {
  const routeur = express.Router();
  const routeAsync = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[CLAIRE] Erreur sur la lecture libre du NAS :', err && err.stack ? err.stack : err);
      if (!res.headersSent) res.status(500).json({ erreur: 'Le NAS n’a pas répondu depuis le serveur.' });
    });
  };
  // Les réglages, ou la réponse d'erreur déjà envoyée (éteint, ou pas de NAS).
  function ouvert(res) {
    const r = nl.lireNasLibre(parametresRepo);
    if (!r.actif) { res.status(403).json({ erreur: 'La lecture libre du NAS est éteinte (Réglages › IA et relecture d’actes).' }); return null; }
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return null; }
    return r;
  }
  const chaine = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  routeur.get('/nas-libre/reglages', (req, res) => { res.json(nl.lireNasLibre(parametresRepo)); });
  routeur.put('/nas-libre/reglages', (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if ((b.racines !== undefined && !Array.isArray(b.racines)) || (b.exclus !== undefined && !Array.isArray(b.exclus))) { res.status(400).json({ erreur: 'Listes attendues.' }); return; }
    const refusees = nl.racinesRefusees(b.racines);
    if (refusees.length) { res.status(400).json({ erreur: `Dossier refusé : « ${refusees.join(' », « ')} » (un chemin depuis la racine du NAS, sans « .. » ni dossier caché). Rien n’a été enregistré.` }); return; }
    const avant = nl.lireNasLibre(parametresRepo);
    res.json(nl.ecrireNasLibre(parametresRepo, { actif: b.actif === true, racines: b.racines === undefined ? avant.racines : b.racines, exclus: b.exclus === undefined ? avant.exclus : b.exclus }));
  });

  routeur.get('/nas-libre/lister', routeAsync(async (req, res) => {
    const r = ouvert(res); if (!r) return;
    const rep = await nl.listerNasLibre(config.nasRacine, chaine(req.query.sous, 1000), r);
    if (rep.erreur) { res.status(rep.statut).json({ erreur: rep.erreur }); return; }
    res.json(rep);
  }));

  routeur.get('/nas-libre/chercher', routeAsync(async (req, res) => {
    const r = ouvert(res); if (!r) return;
    const rep = await nl.chercherNasLibre(config.nasRacine, chaine(req.query.texte, 200), chaine(req.query.sous, 1000), r);
    if (rep.erreur) { res.status(rep.statut).json({ erreur: rep.erreur }); return; }
    res.json(rep);
  }));

  routeur.get('/nas-libre/texte', routeAsync(async (req, res) => {
    const r = ouvert(res); if (!r) return;
    const rep = await nl.lireTexteNasLibre(config.nasRacine, chaine(req.query.chemin, 1000), chaine(req.query.debut, 12), r);
    if (rep.erreur) { res.status(rep.statut).json({ erreur: rep.erreur }); return; }
    res.json(rep);
  }));

  routeur.get('/nas-libre/pdf', routeAsync(async (req, res) => {
    const r = ouvert(res); if (!r) return;
    const rel = nl.cheminRelatifPropre(chaine(req.query.chemin, 1000));
    if (!rel || !/\.pdf$/i.test(rel)) { res.status(400).json({ erreur: 'Chemin invalide (seuls les PDF sont servis).' }); return; }
    if (!nl.cheminPermis(rel, r)) { res.status(403).json({ erreur: 'Ce fichier n’est pas ouvert à CLAIRE (Réglages › IA).' }); return; }
    const cible = await resoudreCheminNas(config.nasRacine, rel);
    if (!cible) { res.status(404).json({ erreur: 'Fichier introuvable sur le NAS.' }); return; }
    if (!(await nl.cheminReelPermis(config.nasRacine, cible, r))) { res.status(403).json({ erreur: 'Ce fichier n’est pas ouvert à CLAIRE (Réglages › IA).' }); return; }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(cible))}"`);
    envoyerFlux(res, cible);
  }));

  return routeur;
}

module.exports = { creerRouteurNasLibre };
