'use strict';

// Explorateur du dossier client (étude 20/10) — voir ../explorateurNas.js pour les règles. Le dossier est TOUJOURS celui que la fiche a
// relié, lu ici par son identifiant ; le poste ne fournit que des chemins relatifs à ce dossier.
//   GET  /api/nas/explorer?dossierId=&sous=             → un niveau (sous-dossiers, fichiers) + l'arborescence des dossiers
//   GET  /api/nas/explorer/fichier?dossierId=&chemin=   → le fichier (PDF et images dans l'onglet, le reste en téléchargement)
//   POST /api/nas/explorer/renommer { dossierId, chemin, nom }
//   POST /api/nas/explorer/deplacer { dossierId, chemin, vers }

const express = require('express');
const fs = require('node:fs');
const exp = require('../explorateurNas');

function creerRouteurExplorateurNas(config, depot, parametresRepo) {
  const routeur = express.Router();
  const routeAsync = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[CLAIRE] Erreur sur l’explorateur du NAS :', err && err.stack ? err.stack : err);
      if (!res.headersSent) res.status(500).json({ erreur: 'Le NAS n’a pas répondu depuis le serveur.' });
    });
  };

  // Le dossier client absolu de la fiche demandée, ou la réponse d'erreur déjà envoyée.
  async function base(req, res, source) {
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return null; }
    const id = String((source && source.dossierId) || '');
    const d = depot && id ? depot.trouverParId(id) : null;
    if (!d || !d.nasDossier) { res.status(400).json({ erreur: 'Dossier inconnu ou non relié au NAS.' }); return null; }
    const abs = await exp.dossierClientAbsolu(config.nasRacine, d.nasDossier);
    if (!abs) { res.status(404).json({ erreur: 'Dossier du client introuvable sur le NAS.' }); return null; }
    return { abs, dossier: d };
  }

  function journaliser(b, geste, dossier, de, vers) {
    if (!parametresRepo || !parametresRepo.ecrireJournalGestesNas) return;
    try {
      const auteur = typeof b.auteur === 'string' ? b.auteur.slice(0, 80) : '';
      parametresRepo.ecrireJournalGestesNas([{ date: new Date().toISOString(), auteur, geste, dossierId: dossier.id, de, vers }]
        .concat(parametresRepo.lireJournalGestesNas()));
    } catch (e) { console.warn('[CLAIRE] Journal des gestes du NAS non écrit :', e && e.message); }
  }

  routeur.get('/nas/explorer', routeAsync(async (req, res) => {
    const c = await base(req, res, req.query);
    if (!c) return;
    const niveau = await exp.listerNiveau(c.abs, req.query.sous || '');
    if (niveau.erreur) { res.status(niveau.statut).json({ erreur: niveau.erreur }); return; }
    res.json(Object.assign(niveau, { arbre: await exp.arborescence(c.abs) }));
  }));

  routeur.get('/nas/explorer/fichier', routeAsync(async (req, res) => {
    const c = await base(req, res, req.query);
    if (!c) return;
    const f = await exp.fichierAServir(c.abs, req.query.chemin || '');
    if (f.erreur) { res.status(f.statut).json({ erreur: f.erreur }); return; }
    res.setHeader('Content-Type', f.type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Défense en profondeur : une image ouverte dans un onglet n'a ni script ni origine (audit 25/10). Pas pour un PDF : la
    // visionneuse du navigateur refuse de s'ouvrir dans un document en bac à sable.
    if (!/pdf/i.test(String(f.type || ''))) res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Content-Disposition', `${f.affichable ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.nom)}`);
    const flux = fs.createReadStream(f.abs);
    flux.on('error', () => { if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.status(404).json({ erreur: 'Fichier illisible sur le NAS.' }); } else res.destroy(); });
    // Un client qui abandonne ne laisse pas le fichier ouvert (audit 21/10, B5).
    res.on('close', () => flux.destroy());
    flux.pipe(res);
  }));

  routeur.post('/nas/explorer/renommer', routeAsync(async (req, res) => {
    const b = req.body || {};
    const c = await base(req, res, b);
    if (!c) return;
    const r = await exp.renommerFichier(c.abs, b.chemin || '', b.nom);
    if (r.erreur) { res.status(r.statut).json({ erreur: r.erreur }); return; }
    if (!r.inchange) journaliser(b, 'renomme', c.dossier, r.ancienChemin, r.chemin);
    res.json(r);
  }));

  routeur.post('/nas/explorer/deplacer', routeAsync(async (req, res) => {
    const b = req.body || {};
    const c = await base(req, res, b);
    if (!c) return;
    const r = await exp.deplacerFichier(c.abs, b.chemin || '', b.vers || '');
    if (r.erreur) { res.status(r.statut).json({ erreur: r.erreur }); return; }
    journaliser(b, 'deplace', c.dossier, r.ancienChemin, r.chemin);
    res.json(r);
  }));

  return routeur;
}

module.exports = { creerRouteurExplorateurNas };
