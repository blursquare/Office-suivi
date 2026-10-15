'use strict';
// Plan aérien IGN des parcelles, avec numéros et pourcentage de zonage (étude 15/10, voir planAerien.js) : services ouverts de l'IGN,
// aucune IA. Le PDF reste en MÉMOIRE du serveur (2 h) ; il n'est écrit sur le NAS que sur clic, dans le dossier relié à la fiche.

const crypto = require('node:crypto');
const express = require('express');
const { planAerien } = require('../planAerien');
const { parcellesDepuisListe } = require('../historiqueParcelle');
const { copierDansDossierClient } = require('../scans');
const { noterVerification } = require('../verificationsTerrain');

const DUREE_MS = 2 * 3600 * 1000;
const MAX_EN_MEMOIRE = 12;

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[plan-aerien]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};

/** @param {any} config @param {any} parametresRepo @param {any} depot @param {any} [injections] */
function creerRouteurPlanAerien(config, parametresRepo, depot, injections = {}) {
  const routeur = express.Router();
  /** @type {Map<string, { pdf: Uint8Array, nom: string, cree: number, dossierId: string }>} */
  const plans = new Map();
  let enCours = 0;
  const purger = () => {
    for (const [id, p] of plans) if (Date.now() - p.cree > DUREE_MS) plans.delete(id);
    while (plans.size > MAX_EN_MEMOIRE) plans.delete(/** @type {string} */ (plans.keys().next().value));
  };

  routeur.post('/urbanisme/plan-aerien', routeAsync(async (req, res) => {
    const b = req.body || {};
    // Un tirage à la fois : chaque plan lit plusieurs services de l'IGN (jamais de rafale).
    if (enCours >= 2) { res.status(429).json({ erreur: 'Un plan aérien est déjà en cours : réessayer dans un instant.' }); return; }
    enCours++;
    try {
      const r = await planAerien({ insee: String(b.insee || ''), parcelles: parcellesDepuisListe(String(b.parcelles || '')), injections });
      if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
      purger();
      const id = crypto.randomUUID();
      plans.set(id, { pdf: r.pdf, nom: r.nom, cree: Date.now(), dossierId: typeof b.dossierId === 'string' ? b.dossierId : '' });
      noterVerification(parametresRepo, 'plan-aerien-ign', { detail: `${r.plans.length} plan(s), ${r.plans.reduce((s, p) => s + p.parcelles.length, 0)} parcelle(s)` });
      res.json({ id, commune: r.commune, nom: `${r.nom}.pdf`, taille: r.pdf.length, plans: r.plans });
    } catch (e) {
      noterVerification(parametresRepo, 'plan-aerien-ign', { ok: false, message: e && e.statut ? `IGN : réponse ${e.statut}` : e && e.name === 'TimeoutError' ? 'IGN : délai dépassé' : 'IGN injoignable' });
      res.status(502).json({ erreur: 'Services de l’IGN injoignables (photographie aérienne, cadastre ou urbanisme) : réessayer dans un moment.' });
    } finally { enCours--; }
  }));

  routeur.get('/urbanisme/plan-aerien/:id', (req, res) => {
    const p = plans.get(String(req.params.id));
    if (!p) { res.status(404).json({ erreur: 'Plan inconnu ou expiré : le relancer.' }); return; }
    res.set('Content-Type', 'application/pdf').set('X-Content-Type-Options', 'nosniff')
      .set('Content-Disposition', `${req.query.telecharger ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(p.nom + '.pdf')}`).send(Buffer.from(p.pdf));
  });

  // Ranger dans le dossier du NAS relié à la fiche (sur clic) : une COPIE à la racine du dossier client, « Nom (2).pdf » plutôt qu'écraser.
  routeur.post('/urbanisme/plan-aerien/:id/ranger', routeAsync(async (req, res) => {
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return; }
    const p = plans.get(String(req.params.id));
    if (!p) { res.status(404).json({ erreur: 'Plan inconnu ou expiré : le relancer.' }); return; }
    const b = req.body || {};
    const d = depot && typeof b.dossierId === 'string' ? depot.trouverParId(b.dossierId) : null;
    if (!d || !d.nasDossier) { res.status(400).json({ erreur: 'Dossier inconnu ou non relié au NAS.' }); return; }
    if (p.dossierId && p.dossierId !== d.id) { res.status(400).json({ erreur: 'Ce plan a été tiré pour un autre dossier.' }); return; }
    const r = await copierDansDossierClient({ nasRacine: config.nasRacine, dossierNas: String(d.nasDossier), rubriques: [], nomCible: p.nom, extension: 'pdf', contenu: Buffer.from(p.pdf) });
    if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
    res.json({ ok: true, chemin: r.chemin });
  }));

  return routeur;
}

module.exports = { creerRouteurPlanAerien };
