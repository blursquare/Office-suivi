'use strict';
// Sites consultés par CLAIRE (étude 14/10, voir navigateur/taches.js) : plan de situation sur cadastre.gouv.fr (sans IA), état du
// navigateur du serveur, tâches suivies en direct, documents rangés sur le NAS au clic. (Géofoncier par un agent Claude : retiré le
// 14/10 au soir par l'étude, « ça utilise des tokens ».)

const express = require('express');
const { creerGestionnaireTaches } = require('../navigateur/taches');
const { trouverNavigateur } = require('../navigateur/chrome');
const { parcelleCadastre } = require('../urbanisme');
const { parcellesDepuisListe, anneauxGeometrie } = require('../historiqueParcelle');
const { copierDansDossierClient } = require('../scans');
const { noterVerification } = require('../verificationsTerrain');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[navigation]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};

/**
 * @param {any} config @param {any} parametresRepo @param {any} depot
 * @param {{ gestionnaire?: any, injections?: any }} [o]
 */
function creerRouteurNavigation(config, parametresRepo, depot, o = {}) {
  const routeur = express.Router();
  // Fin d'une tâche : le point « vérifié au bureau » se coche (ou note l'échec) — une fois, sans rien de personnel.
  const surFin = (t) => {
    const point = 'plan-cadastre-surligne';
    if (t.etat === 'fini') noterVerification(parametresRepo, point, { detail: `${((t.resultat && t.resultat.plans) || []).length} plan(s)` });
    // Sans la commune ni les parcelles (entre parenthèses dans les messages du parcours) : rien de personnel au rapport technique.
    else if (t.etat === 'erreur') noterVerification(parametresRepo, point, { ok: false, message: String(t.erreur || '').replace(/\([^)]*\)/g, '').slice(0, 120) });
  };
  const gestion = o.gestionnaire || creerGestionnaireTaches({ parametresRepo, cheminDb: config.cheminDb, injections: o.injections, surFin });
  const injections = o.injections || {};

  /** Contours des parcelles (API Carto de l'IGN), trous compris, et nom de la commune. Une panne de l'IGN lève (502), une parcelle
   * inconnue est comptée manquante. @param {string} insee @param {string} texte */
  async function parcellesAvecContours(insee, texte) {
    const liste = parcellesDepuisListe(texte);
    const out = [];
    let commune = '';
    for (const p of liste) {
      const f = await parcelleCadastre(insee, p.section, p.numero, injections);
      if (!f) continue;
      commune = commune || String((f.properties && f.properties.nom_com) || '');
      const g = f.geometry || {};
      const polygones = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      out.push({ section: p.section, numero: p.numero, anneaux: anneauxGeometrie(g),
        trous: polygones.flatMap((poly) => (Array.isArray(poly) ? poly.slice(1) : [])).filter(Array.isArray) });
    }
    return { commune, parcelles: out, demandees: liste.length };
  }

  // Trop de consultations en attente : 429 (file bornée, audit 0.229.0).
  const lancerOu429 = (res, lancer) => {
    try { return lancer(); } catch (e) {
      if (e && e.statut === 429) { res.status(429).json({ erreur: e.message }); return ''; }
      throw e;
    }
  };

  routeur.get('/navigation/reglages', routeAsync(async (req, res) => {
    // Emplacements habituels seulement (ou CLAIRE_NAVIGATEUR posé sur le serveur) : jamais un chemin reçu par le réseau (audit 0.229.0).
    const chemin = await trouverNavigateur();
    res.json({ navigateurTrouve: !!chemin, navigateurNom: /msedge/i.test(chemin) ? 'Microsoft Edge' : chemin ? 'Google Chrome' : '' });
  }));

  routeur.post('/navigation/plan-cadastre', routeAsync(async (req, res) => {
    const b = req.body || {};
    const insee = String(b.insee || '').toUpperCase();
    if (!/^\d[0-9AB]\d{3}$/.test(insee)) { res.status(400).json({ erreur: 'Code INSEE de la commune manquant ou invalide.' }); return; }
    if (parcellesDepuisListe(String(b.parcelles || '')).length > 12) { res.status(400).json({ erreur: '12 parcelles au plus par demande.' }); return; }
    let lues;
    try { lues = await parcellesAvecContours(insee, String(b.parcelles || '')); }
    catch (_) { res.status(502).json({ erreur: 'Cadastre de l’IGN injoignable (contours des parcelles) : réessayer dans un moment.' }); return; }
    const { commune, parcelles, demandees } = lues;
    if (!demandees) { res.status(400).json({ erreur: 'Aucune parcelle (section et numéro).' }); return; }
    if (parcelles.length < demandees) { res.status(404).json({ erreur: `${demandees - parcelles.length} parcelle(s) introuvable(s) au cadastre de cette commune.` }); return; }
    const id = lancerOu429(res, () => gestion.lancerPlanCadastre({ commune, insee, codePostal: /^\d{5}$/.test(String(b.codePostal || '')) ? String(b.codePostal) : '', parcelles, echelle: Number(b.echelle) || 0, dossierId: typeof b.dossierId === 'string' ? b.dossierId : '' }));
    if (id) res.json({ id });
  }));

  routeur.get('/navigation/taches/:id', (req, res) => {
    const t = gestion.tache(req.params.id);
    if (!t) { res.status(404).json({ erreur: 'Consultation inconnue ou expirée.' }); return; }
    res.json(t);
  });

  routeur.get('/navigation/taches/:id/capture', (req, res) => {
    const c = gestion.capture(req.params.id);
    if (!c) { res.status(404).end(); return; }
    res.set('Content-Type', 'image/jpeg').set('Cache-Control', 'no-store').send(c);
  });

  routeur.get('/navigation/taches/:id/documents/:doc', (req, res) => {
    const d = gestion.document(req.params.id, req.params.doc);
    if (!d) { res.status(404).json({ erreur: 'Document inconnu ou expiré.' }); return; }
    const nom = encodeURIComponent(d.nom);
    res.set('Content-Type', d.type).set('X-Content-Type-Options', 'nosniff').set('Content-Disposition', `${req.query.telecharger ? 'attachment' : 'inline'}; filename*=UTF-8''${nom}`).send(d.octets);
  });

  // Ranger un document dans le dossier du NAS relié à la fiche (sur clic, comme les documents de « Demander à CLAIRE ») : une COPIE à la
  // racine du dossier client, jamais par-dessus un fichier existant (« Nom (2).pdf »).
  routeur.post('/navigation/taches/:id/documents/:doc/ranger', routeAsync(async (req, res) => {
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return; }
    const doc = gestion.document(req.params.id, req.params.doc);
    if (!doc || !/pdf/i.test(doc.type)) { res.status(404).json({ erreur: 'Document inconnu ou expiré.' }); return; }
    const b = req.body || {};
    const d = depot && typeof b.dossierId === 'string' ? depot.trouverParId(b.dossierId) : null;
    if (!d || !d.nasDossier) { res.status(400).json({ erreur: 'Dossier inconnu ou non relié au NAS.' }); return; }
    // Le document d'une consultation faite pour un dossier ne se range que dans CE dossier (relecture 0.229.0).
    const t = gestion.tache(req.params.id);
    const pour = t && t.resultat && t.resultat.dossierId;
    if (pour && pour !== d.id) { res.status(400).json({ erreur: 'Ce document a été tiré pour un autre dossier.' }); return; }
    const r = await copierDansDossierClient({ nasRacine: config.nasRacine, dossierNas: String(d.nasDossier), rubriques: [], nomCible: doc.nom.replace(/\.pdf$/i, ''), extension: 'pdf', contenu: doc.octets });
    if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
    res.json({ ok: true, chemin: r.chemin });
  }));

  routeur.post('/navigation/taches/:id/annuler', (req, res) => {
    res.json({ ok: gestion.annuler(req.params.id) });
  });

  return routeur;
}

module.exports = { creerRouteurNavigation };
