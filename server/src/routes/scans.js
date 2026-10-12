'use strict';

// Routes du classeur des scans du copieur (voir ../scans.js pour le partage des rôles).
//   GET  /api/scans                → état (dossier Scan trouvé ?), réglages, scans à ranger, journal
//   GET  /api/scans/fichier?nom=   → octets d'un scan (PDF posé directement dans le dossier Scan)
//   PUT  /api/scans/reglages       → { actif, auto, depuis }
//   POST /api/scans/ranger         → { nom, dossierNas, rubriques[], nomCible, dossierId, dossier, type, auteur, auto }
//   POST /api/scans/ecarter        → { nom, auteur } : laisser ce scan dans Scan, ne plus le proposer
//   POST /api/scans/retablir       → { nom } : le reproposer
//   POST /api/scans/relais         → { fenetre } : cette fenêtre CLAIRE fait-elle le rangement
//                                    automatique ? (une seule à la fois, voir plus bas)

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { trouverDossierScans, listerScans, nomScanValide, rangerScan, ajouterAuJournal, depuisMsScans } = require('../scans');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[CLAIRE] Erreur sur une route des scans :', err && err.stack ? err.stack : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Accès au dossier Scan impossible depuis le serveur.' });
  });
};

// Le rangement automatique se fait dans une fenêtre CLAIRE (c'est elle qui lit et fait l'OCR) :
// UNE seule à la fois, pour ne pas lire deux fois le même scan. Le relais est accordé à la première
// fenêtre qui le demande et renouvelé à chaque tour ; sans nouvelle d'elle pendant DUREE_RELAIS_MS,
// il passe à une autre fenêtre ouverte. La fenêtre du poste serveur (requête locale) le reprend
// toujours : c'est celle qui reste ouverte toute la journée.
const DUREE_RELAIS_MS = 5 * 60 * 1000;
function estRequeteLocale(req) {
  const ip = String((req.socket && req.socket.remoteAddress) || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
function accorderRelais(relais, fenetre, locale, maintenant) {
  const libre = !relais.fenetre || maintenant > relais.expire;
  if (relais.fenetre === fenetre || libre || (locale && !relais.locale)) {
    return { fenetre, locale, expire: maintenant + DUREE_RELAIS_MS };
  }
  return relais;
}

function creerRouteurScans(config, parametresRepo, horloge = () => Date.now()) {
  const routeur = express.Router();
  let relais = { fenetre: null, locale: false, expire: 0 };
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
      res.json({ configure: false, raison: 'Dossier du copieur introuvable depuis le serveur : ni le partage « Scan » du NAS (\\\\serveur\\Scan), ni un dossier « Scan » à côté des dossiers clients. Renseignez "nasScans" dans config.json si son nom est différent.', reglages, scans: [], journal });
      return;
    }
    const ecartes = new Set(parametresRepo.lireScansEcartes().map((e) => e.nom));
    const depuisMs = depuisMsScans(reglages.depuis);
    // Déjà rangé mais resté dans Scan (déplacement refusé) : plus jamais reproposé ni recopié (audit 12/10).
    const ranges = new Set(parametresRepo.lireJournalScans().filter((e) => !e.original && e.dateSource).map((e) => e.nom + '|' + e.dateSource));
    const tous = (reglages.actif ? await listerScans(dossier, depuisMs) : []).filter((s) => !ranges.has(s.nom + '|' + s.date));
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
    // « Ne prendre que les nouveaux scans » (étude, 30/09) : à l'activation, l'heure exacte est
    // retenue, et seuls les scans arrivés après sont traités — ni l'historique du copieur, ni les
    // scans déjà posés plus tôt dans la journée.
    if (suivant.actif && !avant.actif && typeof b.depuis !== 'string') suivant.depuis = new Date().toISOString();
    if (suivant.actif && !suivant.depuis) suivant.depuis = new Date().toISOString();
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
    const resteRange = parametresRepo.lireJournalScans().find((e) => e.nom === nom && !e.original && e.dateSource);
    if (resteRange) {
      const st = await fs.promises.stat(path.join(dossierScans, nom)).catch(() => null);
      if (st && new Date(st.mtimeMs).toISOString() === resteRange.dateSource) { res.status(409).json({ erreur: 'Ce scan est déjà rangé (l’original n’a pas pu quitter le dossier Scan).' }); return; }
    }
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
        type: typeof b.type === 'string' ? b.type : '', auteur: typeof b.auteur === 'string' ? b.auteur : '', auto: b.auto === true,
        score: Number.isFinite(b.score) ? b.score : null,
        dateSource: r.original ? '' : (r.dateSource || '')
      };
      parametresRepo.ecrireJournalScans(ajouterAuJournal(parametresRepo.lireJournalScans(), entree));
      res.json(Object.assign({ ok: true }, r));
    } finally {
      enCours.delete(nom);
    }
  }));

  routeur.post('/scans/relais', (req, res) => {
    const fenetre = String((req.body || {}).fenetre || '');
    if (!/^[a-z0-9-]{8,64}$/i.test(fenetre)) { res.status(400).json({ erreur: 'Fenêtre invalide.' }); return; }
    const reglages = parametresRepo.lireReglagesScans();
    if (!reglages.actif || !reglages.auto) { res.json({ accorde: false }); return; }
    relais = accorderRelais(relais, fenetre, estRequeteLocale(req), horloge());
    res.json({ accorde: relais.fenetre === fenetre });
  });

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

module.exports = { creerRouteurScans, accorderRelais, DUREE_RELAIS_MS };
