// @ts-check
'use strict';
// Pièces jointes gardées sur le serveur (étude 25/10, voir ../piecesJointes.js) : dépôt, lecture, suppression. Comme le reste de CLAIRE
// (sans mot de passe), le collaborateur est déclaré par le poste : seul celui qui a déposé un fichier (ou l'administrateur) le supprime.

const express = require('express');
const fs = require('node:fs');
const { collaborateurDe } = require('./canaux');

const ADMINISTRATEURS = ['Bastien ANGLUMENT', 'Sophie GOSSART'];

/** @param {any} v */
/** Une route async rattrape ses erreurs (règle du dépôt, comme routes/nas.js). @param {Function} fn */
const routeAsync = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { console.error('[pieces-jointes]', e && e.message); if (!res.headersSent) res.status(500).json({ erreur: 'Erreur du serveur.' }); });

/** @param {any} v */
const decoder = (v) => { try { return decodeURIComponent(String(v || '')); } catch (e) { return String(v || ''); } };

/** @param {any} stock */
function creerRouteurPiecesJointes(stock) {
  const routeur = express.Router();

  // Corps brut (le fichier lui-même), 25 Mo : nom et auteur dans les en-têtes (encodés).
  routeur.post('/pieces-jointes', express.raw({ type: () => true, limit: '26mb' }), routeAsync(async (req, res) => {
    const par = collaborateurDe(decoder(req.get('x-auteur')));
    if (!par) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const r = await stock.enregistrer(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), decoder(req.get('x-nom')), par);
    if (!r.ok) { res.status(400).json({ erreur: r.erreur }); return; }
    res.json({ ok: true, id: r.id, nom: r.meta.nom, sorte: r.meta.sorte, taille: r.meta.taille });
  }));

  routeur.get('/pieces-jointes/:id', (req, res) => {
    const m = stock.meta(req.params.id);
    if (!m) { res.status(404).json({ erreur: 'Pièce jointe introuvable (ou expirée).' }); return; }
    res.json({ id: req.params.id, nom: m.nom, sorte: m.sorte, taille: m.taille, le: m.le });
  });

  routeur.get('/pieces-jointes/:id/fichier', (req, res) => {
    const m = stock.meta(req.params.id);
    const chemin = stock.cheminFichier(req.params.id);
    if (!m || !chemin) { res.status(404).json({ erreur: 'Pièce jointe introuvable (ou expirée).' }); return; }
    res.setHeader('Content-Type', m.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Défense en profondeur : une image ouverte dans un onglet n'a ni script ni origine (audit 25/10). Pas pour un PDF : la
    // visionneuse du navigateur refuse de s'ouvrir dans un document en bac à sable.
    if (!/pdf/i.test(String(m.mime || ''))) res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(m.nom).replace(/['()]/g, escape)}`);
    const flux = fs.createReadStream(chemin);
    flux.on('error', () => { if (!res.headersSent) res.status(404).json({ erreur: 'Pièce jointe introuvable.' }); else res.destroy(); });
    flux.pipe(res);
  });

  routeur.delete('/pieces-jointes/:id', routeAsync(async (req, res) => {
    const par = collaborateurDe(req.query.auteur);
    const m = stock.meta(req.params.id);
    if (!par || !m) { res.status(404).json({ erreur: 'Demande incomplète.' }); return; }
    if (m.par !== par && !ADMINISTRATEURS.includes(par)) { res.status(403).json({ erreur: 'Ce fichier n’est pas le vôtre.' }); return; }
    await stock.supprimer(req.params.id);
    res.json({ ok: true });
  }));

  return routeur;
}

module.exports = { creerRouteurPiecesJointes };
