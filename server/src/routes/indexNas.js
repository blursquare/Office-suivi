// @ts-check
'use strict';
// Index du NAS des dossiers en cours (voir indexNas.js) : parcours, PDF à lire par le poste, résumés par l'IA, recherche pour l'agent.
// Jamais un chemin reçu du réseau : un document se désigne par son identifiant en base. Aucun nom de fichier ne sort (seulement le sous-dossier).

const express = require('express');
const { cheminDocumentMemoire } = require('../memoire');
const { dossierClientAbsolu } = require('../explorateurNas');
const { envoyerFlux } = require('./nas');
const { parcourirDossiersEnCours, resumerDocuments, dossierDeRubrique, rubriqueDossier } = require('../indexNas');
const { creerIaRoutines } = require('../routines/ia');

const CLE_REGLAGES = 'index-nas-reglages';
const INTERVALLE_PARCOURS_MS = 30 * 60 * 1000;
const INTERVALLE_RESUMES_MS = 5 * 60 * 1000;

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[index-nas]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};

/** Pure : le premier sous-dossier d'un chemin relatif (« 3 - AAE »), '' à la racine. @param {string} chemin */
function sousDossierDe(chemin) { const p = String(chemin || '').split('/'); return p.length > 1 ? p[0] : ''; }

/** @param {any} config @param {any} depot @param {any} parametresRepo @param {any} memoire @param {{ fsImpl?: any, ia?: any }} [injections] */
function creerRouteurIndexNas(config, depot, parametresRepo, memoire, injections = {}) {
  const routeur = express.Router();
  /** @type {any} */
  const etat = { enCours: false, debut: 0, fin: 0, dossiers: 0, vus: 0, nouveaux: 0, changes: 0, retires: 0, luServeur: 0, erreurs: 0, erreur: '' };
  /** @type {any} */
  let dernierResume = { resumes: 0, echecs: 0, ignores: 0 };
  let resumeEnCours = false;
  const lireReglages = () => {
    const b = parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_REGLAGES, null) : null;
    return { actif: !(b && b.actif === false) };
  };
  routeur.use('/index-nas', (req, res, next) => { if (memoire) next(); else res.status(503).json({ erreur: 'Index indisponible sur ce serveur.' }); });

  async function lancerParcours() {
    if (etat.enCours || !memoire) return false;
    parcourirDossiersEnCours({ config, memoire, depot, fsImpl: injections.fsImpl, etat }).catch(() => { /* journalisé */ });
    return true;
  }
  async function tourResumes() {
    if (resumeEnCours || !memoire || !lireReglages().actif) return dernierResume;
    resumeEnCours = true;
    try { dernierResume = await resumerDocuments({ memoire, depot, ia: injections.ia || creerIaRoutines({ parametresRepo }), limite: 5 }); }
    catch (e) { console.error('[index-nas] résumés :', e && e.message ? e.message : e); }
    finally { resumeEnCours = false; }
    return dernierResume;
  }

  routeur.get('/index-nas/etat', routeAsync(async (req, res) => {
    const { lignes } = memoire.etat();
    const l = lignes.filter((x) => /^d:/.test(x.rubrique));
    const n = (statut) => l.filter((x) => x.statut === statut).reduce((s, x) => s + x.n, 0);
    res.json({ reglages: lireReglages(), fichiers: l.reduce((s, x) => s + x.n, 0), lus: n('lu'), aLire: n('a_lire') + n('en_cours'), vides: n('vide'), erreurs: n('erreur'), tropGros: n('trop_gros'),
      ocr: l.reduce((s, x) => s + x.ocr, 0), parcours: { ...etat }, resumes: dernierResume });
  }));
  routeur.put('/index-nas/reglages', routeAsync(async (req, res) => {
    parametresRepo.ecrireJsonBrut(CLE_REGLAGES, { actif: !(req.body && req.body.actif === false) });
    res.json(lireReglages());
  }));
  routeur.post('/index-nas/parcourir', routeAsync(async (req, res) => { res.json({ lance: await lancerParcours() }); }));
  routeur.post('/index-nas/resumer', routeAsync(async (req, res) => { res.json(await tourResumes()); }));

  // Les PDF que le poste doit lire : réservés à la fenêtre qui les prend (deux fenêtres ne lisent pas le même).
  routeur.get('/index-nas/a-lire', routeAsync(async (req, res) => {
    if (!lireReglages().actif) { res.json({ documents: [] }); return; }
    const docs = memoire.aLire('pdf', Number(req.query.limite) || 5, { dossiers: true });
    memoire.reserverPourPoste(docs);
    res.json({ documents: docs.map((d) => ({ id: d.id, rubrique: d.rubrique, nom: d.nom, taille: d.taille, dossier: true })) });
  }));

  routeur.get('/index-nas/document/:id/fichier', routeAsync(async (req, res) => {
    const doc = memoire.document(Number(req.params.id));
    const id = doc ? dossierDeRubrique(doc.rubrique) : '';
    const d = id && depot.trouverParId ? depot.trouverParId(id) : null;
    const abs = d && d.nasDossier ? await dossierClientAbsolu(config.nasRacine, d.nasDossier) : null;
    const cible = abs ? await cheminDocumentMemoire(abs, doc.chemin, injections.fsImpl) : null;
    if (!cible || doc.ext !== 'pdf') { res.status(404).json({ erreur: 'Fichier introuvable sur le NAS.' }); return; }
    res.setHeader('Content-Type', 'application/pdf');
    envoyerFlux(res, cible);
  }));

  // Recherche dans les documents d'UN dossier : passages avec le résumé du document (type, émetteur, date) ; sans recherche, l'inventaire.
  routeur.get('/index-nas/chercher', routeAsync(async (req, res) => {
    const dossierId = String(req.query.dossier || '');
    if (!dossierId || !depot.trouverParId || !depot.trouverParId(dossierId)) { res.status(404).json({ erreur: 'Dossier inconnu.' }); return; }
    const rubrique = rubriqueDossier(dossierId);
    const q = String(req.query.q || '').slice(0, 300).trim();
    const lu = memoire.etat().lignes.filter((x) => x.rubrique === rubrique);
    const suivi = { fichiers: lu.reduce((s, x) => s + x.n, 0), lus: lu.filter((x) => x.statut === 'lu').reduce((s, x) => s + x.n, 0) };
    if (!q) {
      const docs = memoire.documentsRubrique(rubrique, 80).map((d) => ({ sous_dossier: sousDossierDe(d.chemin), lu: d.statut === 'lu', type: d.type || '', emetteur: d.emetteur || '', date: d.date_doc || '', resume: d.resume || '' }));
      res.json({ inventaire: docs, ...suivi });
      return;
    }
    const r = memoire.chercher(q, { rubrique, limite: Number(req.query.limite) || 8 });
    const passages = r.passages.map((p) => {
      const doc = memoire.document(p.doc);
      const rs = memoire.resume(p.doc) || {};
      return { sous_dossier: doc ? sousDossierDe(doc.chemin) : '', page: p.page || undefined, type: rs.type || '', emetteur: rs.emetteur || '', date: rs.date_doc || '', resume: rs.resume || '', extrait: p.extrait };
    });
    res.json({ passages, ...suivi });
  }));

  routeur.demarrerAuto = () => {
    const parcours = () => { if (lireReglages().actif) lancerParcours().catch(() => {}); };
    setTimeout(parcours, 3 * 60 * 1000).unref();
    setInterval(parcours, INTERVALLE_PARCOURS_MS).unref();
    setInterval(() => { tourResumes().catch(() => {}); }, INTERVALLE_RESUMES_MS).unref();
  };
  routeur.lancerParcours = lancerParcours;
  routeur.tourResumes = tourResumes;
  return routeur;
}

module.exports = { creerRouteurIndexNas, sousDossierDe };
