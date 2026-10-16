// @ts-check
'use strict';
// Mémoire de CLAIRE (voir memoire.js) : parcours des quatre dossiers du NAS, lecture des PDF par le poste, recherche pour l'agent.
// Jamais un chemin reçu du réseau : un document se désigne par son identifiant en base, le fichier est retrouvé et confiné à son dossier.

const express = require('express');
const { creerMemoire, parcourirMemoire, trouverDossiersMemoire, cheminDocumentMemoire, RUBRIQUES_MEMOIRE, titreSectionRegles } = require('../memoire');
const { envoyerFlux } = require('./nas');
const { noterVerification } = require('../verificationsTerrain');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[memoire]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};
const INTERVALLE_AUTO_MS = 6 * 3600 * 1000;
const MAX_CARACTERES_DOCUMENT = 3 * 1024 * 1024;
const MAX_PAGES_DOCUMENT = 2000;

/** @param {any} config @param {any} db @param {any} parametresRepo @param {{ fsImpl?: any }} [injections] */
function creerRouteurMemoire(config, db, parametresRepo, injections = {}) {
  const routeur = express.Router();
  // Un index plein texte indisponible (FTS5 absent, base en lecture seule) ne doit jamais empêcher CLAIRE de démarrer (audit 15/10).
  /** @type {any} */
  let memoire = null;
  try { memoire = creerMemoire(db); } catch (e) { console.error('[memoire] index indisponible :', e && e.message ? e.message : e); }
  routeur.use('/memoire', (req, res, next) => { if (memoire) next(); else res.status(503).json({ erreur: 'Mémoire indisponible sur ce serveur.' }); });
  /** @type {any} */
  const etat = { enCours: false, debut: 0, fin: 0, dossiers: [], vus: 0, nouveaux: 0, changes: 0, retires: 0, luServeur: 0, erreurs: 0, erreur: '' };
  let minuteur = null;

  // Réglages (15/10) : le scan des fausses minutes est une option, éteinte tant que l'étude ne l'allume pas.
  const CLE_REGLAGES = 'memoire-reglages';
  const lireReglages = () => {
    const brut = parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_REGLAGES, {}) : {};
    return { fausseMinutes: !!(brut && brut.fausseMinutes === true) };
  };
  const appliquerReglages = () => { if (memoire) memoire.definirExclues(lireReglages().fausseMinutes ? [] : ['fausses-minutes']); };
  appliquerReglages();

  async function lancerParcours() {
    if (etat.enCours) return false;
    if (!memoire) return false;
    parcourirMemoire({ config, memoire, fsImpl: injections.fsImpl, etat, ignorer: lireReglages().fausseMinutes ? [] : ['fausses-minutes'] }).then(() => {
      noterVerification(parametresRepo, 'memoire-parcours', etat.erreur ? { ok: false, message: 'parcours en erreur' } : { detail: `${etat.vus} fichiers vus` });
    }).catch(() => { /* déjà journalisé par parcourirMemoire */ });
    return true;
  }

  routeur.get('/memoire/etat', routeAsync(async (req, res) => {
    const dossiers = await trouverDossiersMemoire(config, injections.fsImpl);
    const { lignes, passages } = memoire.etat();
    const rubriques = RUBRIQUES_MEMOIRE.map((r) => {
      const l = lignes.filter((x) => x.rubrique === r.cle);
      const n = (statut) => l.filter((x) => x.statut === statut).reduce((s, x) => s + x.n, 0);
      return { cle: r.cle, libelle: r.libelle, nom: r.nom, interne: !!r.interne, trouve: !!r.interne || dossiers.some((d) => d.cle === r.cle),
        fichiers: l.reduce((s, x) => s + x.n, 0), lus: n('lu'), aLire: n('a_lire'), vides: n('vide'), erreurs: n('erreur'), tropGros: n('trop_gros'),
        ocr: l.reduce((s, x) => s + x.ocr, 0) };
    });
    res.json({ reglages: lireReglages(), rubriques, passages, parcours: { enCours: etat.enCours, debut: etat.debut, fin: etat.fin, vus: etat.vus, nouveaux: etat.nouveaux, changes: etat.changes, retires: etat.retires, erreur: etat.erreur } });
  }));

  routeur.put('/memoire/reglages', routeAsync(async (req, res) => {
    parametresRepo.ecrireJsonBrut(CLE_REGLAGES, { fausseMinutes: !!(req.body && req.body.fausseMinutes === true) });
    appliquerReglages();
    res.json(lireReglages());
  }));

  routeur.post('/memoire/parcourir', routeAsync(async (req, res) => { res.json({ lance: await lancerParcours() }); }));

  routeur.post('/memoire/reessayer', routeAsync(async (req, res) => { res.json({ remis: memoire.reessayer() }); }));

  // Les PDF que le poste doit lire (id, rubrique, nom pour son affichage local, taille).
  routeur.get('/memoire/a-lire', routeAsync(async (req, res) => {
    const docs = memoire.aLire('pdf', Number(req.query.limite) || 10);
    res.json({ documents: docs.map((d) => ({ id: d.id, rubrique: d.rubrique, nom: d.nom, taille: d.taille })) });
  }));

  routeur.get('/memoire/document/:id/fichier', routeAsync(async (req, res) => {
    const doc = memoire.document(Number(req.params.id));
    if (!doc) { res.status(404).json({ erreur: 'Document inconnu.' }); return; }
    const dossiers = await trouverDossiersMemoire(config, injections.fsImpl);
    const d = dossiers.find((x) => x.cle === doc.rubrique);
    const cible = d ? await cheminDocumentMemoire(d.chemin, doc.chemin, injections.fsImpl) : null;
    if (!cible) { res.status(404).json({ erreur: 'Fichier introuvable sur le NAS.' }); return; }
    res.setHeader('Content-Type', 'application/pdf');
    envoyerFlux(res, cible);
  }));

  // Le texte lu par le poste : { pages: [{ n, texte }], ocr }.
  routeur.post('/memoire/document/:id/texte', routeAsync(async (req, res) => {
    const id = Number(req.params.id);
    const corps = req.body || {};
    if (!memoire.document(id)) { res.status(404).json({ erreur: 'Document inconnu.' }); return; }
    if (!Array.isArray(corps.pages) || corps.pages.length > MAX_PAGES_DOCUMENT) { res.status(400).json({ erreur: 'Pages invalides.' }); return; }
    let total = 0;
    const pages = [];
    for (const p of corps.pages) {
      if (!p || typeof p.texte !== 'string') continue;
      const texte = p.texte.slice(0, MAX_CARACTERES_DOCUMENT - total);
      total += texte.length;
      pages.push({ n: Number(p.n) || 0, texte });
      if (total >= MAX_CARACTERES_DOCUMENT) break;
    }
    res.json(memoire.enregistrerTexte(id, pages, { ocr: corps.ocr === true }));
  }));

  routeur.post('/memoire/document/:id/erreur', routeAsync(async (req, res) => {
    const id = Number(req.params.id);
    if (!memoire.document(id)) { res.status(404).json({ erreur: 'Document inconnu.' }); return; }
    memoire.marquerErreur(id, String((req.body && req.body.message) || 'illisible'));
    res.json({ ok: true });
  }));

  // Recherche : des passages (rubrique, page, extrait), jamais un nom de fichier. Masquage et envoi à l'IA : par l'agent.
  routeur.get('/memoire/chercher', routeAsync(async (req, res) => {
    const q = String(req.query.q || '').slice(0, 300);
    const rubrique = RUBRIQUES_MEMOIRE.some((r) => r.cle === req.query.rubrique) ? String(req.query.rubrique) : '';
    const r = memoire.chercher(q, { rubrique, limite: Number(req.query.limite) || 8 });
    const passages = [];
    for (const p of r.passages) {
      const sortie = { document: p.doc, rubrique: p.rubrique, libelle: (RUBRIQUES_MEMOIRE.find((x) => x.cle === p.rubrique) || { libelle: '' }).libelle, page: p.page, extrait: p.extrait };
      // Règles et décisions de l'étude : la section (titre de l'entrée d'historique, de la règle), pas une page.
      if (p.rubrique === 'regles-etude') {
        const doc = memoire.document(p.doc);
        Object.assign(sortie, { page: 0, section: doc ? await titreSectionRegles(doc.chemin, p.page, config) : '' });
      }
      passages.push(sortie);
    }
    res.json({ passages });
  }));

  // Le nom du document, pour le bouton « Ouvrir la source » du poste seulement (jamais envoyé à l'IA).
  routeur.get('/memoire/document/:id', routeAsync(async (req, res) => {
    const doc = memoire.document(Number(req.params.id));
    if (!doc) { res.status(404).json({ erreur: 'Document inconnu.' }); return; }
    res.json({ id: doc.id, rubrique: doc.rubrique, nom: doc.nom, ext: doc.ext });
  }));

  /** Tour automatique : 2 minutes après le démarrage puis toutes les 6 h. */
  routeur.demarrerAuto = () => {
    if (minuteur) return;
    const tour = () => { lancerParcours().catch(() => {}); };
    setTimeout(tour, 2 * 60 * 1000).unref();
    minuteur = setInterval(tour, INTERVALLE_AUTO_MS);
    minuteur.unref();
  };
  routeur.memoire = memoire;
  routeur.lancerParcours = lancerParcours;
  routeur.etatParcours = etat;
  return routeur;
}

module.exports = { creerRouteurMemoire };
