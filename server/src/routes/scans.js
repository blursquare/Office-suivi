'use strict';

// Routes du classeur des scans du copieur (voir ../scans.js pour le partage des rôles).
//   GET  /api/scans                → état (dossier Scan trouvé ?), réglages, scans à ranger, journal
//   GET  /api/scans/fichier?nom=   → octets d'un scan (PDF posé directement dans le dossier Scan)
//   PUT  /api/scans/reglages       → { actif, auto, depuis }
//   POST /api/scans/ranger         → { nom, dossierNas, rubriques[], nomCible, dossierId, dossier, type, auteur, auto }
//   POST /api/scans/ecarter        → { nom, auteur } : laisser ce scan dans Scan, ne plus le proposer
//   POST /api/scans/retablir       → { nom } : le reproposer

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { trouverDossierScans, listerScans, nomScanValide, rangerScan, ajouterAuJournal } = require('../scans');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[CLAIRE] Erreur sur une route des scans :', err && err.stack ? err.stack : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Accès au dossier Scan impossible depuis le serveur.' });
  });
};

function creerRouteurScans(config, parametresRepo) {
  const routeur = express.Router();
  // Deux fenêtres CLAIRE (ou un geste manuel pendant le rangement automatique) peuvent viser le
  // même scan : un seul rangement à la fois par nom.
  const enCours = new Set();

  routeur.get('/scans', routeAsync(async (req, res) => {
    const reglages = parametresRepo.lireReglagesScans();
    const journal = parametresRepo.lireJournalScans().slice(0, 50);
    if (!config.nasRacine) {
      res.json({ configure: false, raison: 'Aucun dossier NAS configuré (nasRacine).', reglages, scans: [], journal });
      return;
    }
    const dossier = await trouverDossierScans(config);
    if (!dossier) {
      res.json({ configure: false, raison: 'Aucun dossier « Scan » trouvé à côté des dossiers clients ni à la racine du NAS.', reglages, scans: [], journal });
      return;
    }
    const ecartes = new Set(parametresRepo.lireScansEcartes().map((e) => e.nom));
    const depuisMs = reglages.depuis ? Date.parse(reglages.depuis + 'T00:00:00') : NaN;
    const tous = reglages.actif ? await listerScans(dossier, depuisMs) : [];
    res.json({
      configure: true, dossier, reglages, journal,
      scans: tous.filter((s) => !ecartes.has(s.nom)),
      ecartes: tous.filter((s) => ecartes.has(s.nom))
    });
  }));

  routeur.get('/scans/fichier', routeAsync(async (req, res) => {
    const nom = String(req.query.nom || '');
    if (!nomScanValide(nom)) { res.status(400).json({ erreur: 'Nom de scan invalide.' }); return; }
    const dossier = await trouverDossierScans(config);
    if (!dossier) { res.status(503).json({ erreur: 'Dossier Scan introuvable.' }); return; }
    const cible = path.join(dossier, nom);
    try { await fs.promises.access(cible); } catch (_) { res.status(404).json({ erreur: 'Scan introuvable (déjà rangé ?).' }); return; }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nom)}"`);
    fs.createReadStream(cible).pipe(res);
  }));

  routeur.put('/scans/reglages', routeAsync(async (req, res) => {
    const avant = parametresRepo.lireReglagesScans();
    const b = req.body || {};
    const suivant = {
      actif: typeof b.actif === 'boolean' ? b.actif : avant.actif,
      auto: typeof b.auto === 'boolean' ? b.auto : avant.auto,
      depuis: typeof b.depuis === 'string' ? b.depuis : avant.depuis
    };
    // À la première activation, seuls les scans du jour et des suivants sont proposés : le
    // dossier Scan garde tout l'historique du copieur.
    if (suivant.actif && !suivant.depuis) suivant.depuis = new Date().toISOString().slice(0, 10);
    res.json({ reglages: parametresRepo.ecrireReglagesScans(suivant) });
  }));

  routeur.post('/scans/ranger', routeAsync(async (req, res) => {
    const b = req.body || {};
    const nom = String(b.nom || '');
    if (!parametresRepo.lireReglagesScans().actif) { res.status(409).json({ erreur: 'Le classement des scans n’est pas activé.' }); return; }
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return; }
    const dossierScans = await trouverDossierScans(config);
    if (!dossierScans) { res.status(503).json({ erreur: 'Dossier Scan introuvable.' }); return; }
    if (enCours.has(nom)) { res.status(409).json({ erreur: 'Ce scan est déjà en cours de rangement.' }); return; }
    enCours.add(nom);
    try {
      const r = await rangerScan({
        dossierScans, nasRacine: config.nasRacine, nom,
        dossierNas: typeof b.dossierNas === 'string' ? b.dossierNas : '',
        rubriques: Array.isArray(b.rubriques) ? b.rubriques.filter((x) => typeof x === 'string').slice(0, 5) : [],
        nomCible: typeof b.nomCible === 'string' ? b.nomCible : ''
      });
      if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
      const entree = {
        date: new Date().toISOString(), nom, chemin: r.chemin, rubrique: r.rubrique, original: r.original || '',
        dossierId: typeof b.dossierId === 'string' ? b.dossierId : '', dossier: typeof b.dossier === 'string' ? b.dossier : '',
        type: typeof b.type === 'string' ? b.type : '', auteur: typeof b.auteur === 'string' ? b.auteur : '', auto: b.auto === true
      };
      parametresRepo.ecrireJournalScans(ajouterAuJournal(parametresRepo.lireJournalScans(), entree));
      res.json(Object.assign({ ok: true }, r));
    } finally {
      enCours.delete(nom);
    }
  }));

  routeur.post('/scans/ecarter', routeAsync(async (req, res) => {
    const nom = String((req.body || {}).nom || '');
    if (!nomScanValide(nom)) { res.status(400).json({ erreur: 'Nom de scan invalide.' }); return; }
    const liste = parametresRepo.lireScansEcartes().filter((e) => e.nom !== nom);
    const auteur = typeof req.body.auteur === 'string' ? req.body.auteur : '';
    parametresRepo.ecrireScansEcartes([{ nom, date: new Date().toISOString(), auteur }, ...liste]);
    res.json({ ok: true });
  }));

  routeur.post('/scans/retablir', routeAsync(async (req, res) => {
    const nom = String((req.body || {}).nom || '');
    parametresRepo.ecrireScansEcartes(parametresRepo.lireScansEcartes().filter((e) => e.nom !== nom));
    res.json({ ok: true });
  }));

  return routeur;
}

module.exports = { creerRouteurScans };
