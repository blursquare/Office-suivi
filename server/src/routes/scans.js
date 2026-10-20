'use strict';

// Routes du classeur des scans du copieur (voir ../scans.js pour le partage des rôles).
//   GET  /api/scans                → état (dossier Scan trouvé ?), réglages, scans à ranger, journal
//   GET  /api/scans/fichier?nom=   → octets d'un scan (PDF posé directement dans le dossier Scan)
//   PUT  /api/scans/reglages       → { actif, auto, depuis }
//   POST /api/scans/ranger         → { nom, dossierNas, rubriques[], nomCible, dossierId, dossier, type, auteur, auto }
//   POST /api/scans/ecarter        → { nom, auteur } : laisser ce scan dans Scan, ne plus le proposer
//   POST /api/scans/retablir       → { nom } : le reproposer
//   GET  /api/scans/memoire        → ce que Claire Scan a appris (types corrigés, identifiants) — étude 20/10
//   DELETE /api/scans/memoire      → tout oublier
//   GET  /api/scans/recherche?q=   → les scans rangés dont le texte contient ces mots (nom, dossier, rubrique, date, extrait)
//   POST /api/scans/annuler        → { id } : « Remettre dans Scan » un scan rangé
//   POST /api/scans/relais         → { fenetre } : cette fenêtre CLAIRE fait-elle le rangement
//                                    automatique ? (une seule à la fois, voir plus bas)

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { trouverDossierScans, listerScans, nomScanValide, rangerScan, annulerRangement, ajouterAuJournal, depuisMsScans } = require('../scans');
const { creerScansTextes } = require('../scansTextes');
const M = require('../../../commun/scans-memoire');
const { envoyerFlux } = require('./nas');

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

// Empreinte d'un fichier (doublons : un scan identique à un scan déjà rangé).
function hashFichier(chemin) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const flux = fs.createReadStream(chemin);
    flux.on('error', reject);
    flux.on('data', (d) => h.update(d));
    flux.on('end', () => resolve(h.digest('hex')));
  });
}

/** Pure : les chiffres du mois écoulé d'après le journal — rangés, rangés seuls, corrigés à la main, types les plus corrigés. */
function statistiquesScans(journal, maintenantMs) {
  const depuis = maintenantMs - 30 * 24 * 3600 * 1000;
  const recents = (journal || []).filter((e) => e && !e.annule && Date.parse(e.date) >= depuis);
  const corriges = recents.filter((e) => e.corrige);
  const parType = {};
  corriges.forEach((e) => { if (e.type) parType[e.type] = (parType[e.type] || 0) + 1; });
  return {
    jours: 30, ranges: recents.length, automatiques: recents.filter((e) => e.auto).length, corriges: corriges.length,
    typesCorriges: Object.entries(parType).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, n]) => ({ type, n }))
  };
}

function creerRouteurScans(config, parametresRepo, horloge = () => Date.now(), options = {}) {
  const routeur = express.Router();
  // Texte des scans rangés (FTS5) : un index indisponible ne gêne jamais le classeur.
  let textes = null;
  if (options && options.db) { try { textes = creerScansTextes(options.db); } catch (e) { console.error('[scans] index du texte indisponible :', e && e.message ? e.message : e); } }
  const hashes = new Map();   // nom|date|taille → empreinte (mémoire du serveur)
  let relais = { fenetre: null, locale: false, expire: 0 };
  // Deux fenêtres CLAIRE (ou un geste manuel pendant le rangement automatique) peuvent viser le
  // même scan : un seul rangement à la fois par nom.
  const enCours = new Set();

  routeur.get('/scans', routeAsync(async (req, res) => {
    const reglages = parametresRepo.lireReglagesScans();
    const journal = parametresRepo.lireJournalScans().slice(0, 50);
    const categories = parametresRepo.lireCategoriesScans();
    if (!config.nasRacine) {
      res.json({ configure: false, raison: 'Le serveur ne sait pas encore où sont les dossiers des clients sur le NAS : l’administrateur l’indique une fois dans la configuration du serveur, puis Claire Scan trouve seul le dossier « Scan » du copieur.', reglages, scans: [], journal, categories });
      return;
    }
    const dossier = await trouverDossierScans(config);
    if (!dossier) {
      res.json({ configure: false, raison: 'Dossier du copieur introuvable depuis le serveur : ni le partage « Scan » du NAS (\\\\serveur\\Scan), ni un dossier « Scan » à côté des dossiers clients. Renseignez "nasScans" dans config.json si son nom est différent.', reglages, scans: [], journal, categories });
      return;
    }
    const ecartes = new Set(parametresRepo.lireScansEcartes().map((e) => e.nom));
    const depuisMs = depuisMsScans(reglages.depuis);
    // Déjà rangé mais resté dans Scan (déplacement refusé) : plus jamais reproposé ni recopié (audit 12/10).
    const ranges = new Set(parametresRepo.lireJournalScans().filter((e) => !e.original && e.dateSource && !e.annule).map((e) => e.nom + '|' + e.dateSource));
    const tous = (reglages.actif ? await listerScans(dossier, depuisMs) : []).filter((s) => !ranges.has(s.nom + '|' + s.date));
    // Doublons (étude 20/10) : un scan dont l'empreinte est celle d'un scan déjà rangé (et pas annulé) le dit ; six empreintes au plus
    // par lecture, les autres au tour suivant.
    const integral = parametresRepo.lireJournalScans();
    const parHash = new Map();
    integral.filter((e) => e.hash && !e.annule).forEach((e) => { if (!parHash.has(e.hash)) parHash.set(e.hash, e); });
    let calcules = 0;
    for (const sc of tous) {
      if (!sc.stable) continue;
      const cle = `${sc.nom}|${sc.date}|${sc.taille}`;
      if (!hashes.has(cle) && calcules < 6) {
        calcules += 1;
        try { hashes.set(cle, await hashFichier(path.join(dossier, sc.nom))); } catch (_) { /* illisible un instant : au tour suivant */ }
        if (hashes.size > 2000) hashes.delete(hashes.keys().next().value);
      }
      const h = hashes.get(cle);
      const vu = h ? parHash.get(h) : null;
      if (vu) sc.doublon = { date: vu.date, dossier: vu.dossier, rubrique: vu.rubrique };
    }
    res.json({
      configure: true, dossier, reglages, journal, categories,
      stats: statistiquesScans(integral, horloge()), memoireRev: parametresRepo.lireMemoireScans().rev, textesIndexes: textes ? textes.nombre() : 0,
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
    envoyerFlux(res, cible);
  }));

  // Catégories de pièce ajoutées par l'étude (étude 20/10) : toute l'étude les partage.
  routeur.put('/scans/categories', routeAsync(async (req, res) => {
    const b = req.body || {};
    const avant = parametresRepo.lireCategoriesScans();
    const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const label = norm(b.label);
    if (!label) { res.status(400).json({ erreur: 'Donnez un nom à la catégorie.' }); return; }
    const id = typeof b.id === 'string' && avant.some((c) => c.id === b.id) ? b.id
      : 'c-' + (label.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'piece') + '-' + Date.now().toString(36).slice(-4);
    if (avant.some((c) => c.id !== id && norm(c.label) === label)) { res.status(400).json({ erreur: 'Une catégorie porte déjà ce nom.' }); return; }
    const motsBruts = Array.isArray(b.mots) ? b.mots : String(b.mots || '').split(/[,;\n]+/);
    const suivantes = avant.some((c) => c.id === id)
      ? avant.map((c) => (c.id === id ? { id, label: b.label, rubrique: b.rubrique, mots: motsBruts } : c))
      : avant.concat([{ id, label: b.label, rubrique: b.rubrique, mots: motsBruts }]);
    const categories = parametresRepo.ecrireCategoriesScans(suivantes);
    if (!categories.some((c) => c.id === id)) { res.status(400).json({ erreur: 'Catégorie invalide ou trop nombreuses.' }); return; }
    res.json({ id, categories });
  }));

  routeur.delete('/scans/categories/:id', routeAsync(async (req, res) => {
    const avant = parametresRepo.lireCategoriesScans();
    res.json({ categories: parametresRepo.ecrireCategoriesScans(avant.filter((c) => c.id !== req.params.id)) });
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
    const resteRange = parametresRepo.lireJournalScans().find((e) => e.nom === nom && !e.original && e.dateSource && !e.annule);
    if (resteRange) {
      const st = await fs.promises.stat(path.join(dossierScans, nom)).catch(() => null);
      if (st && new Date(st.mtimeMs).toISOString() === resteRange.dateSource) { res.status(409).json({ erreur: 'Ce scan est déjà rangé (l’original n’a pas pu quitter le dossier Scan).' }); return; }
    }
    enCours.add(nom);
    try {
      // Empreinte du fichier AVANT son déplacement (doublons) ; un fichier illisible n'empêche pas le rangement.
      let empreinte = '';
      if (nomScanValide(nom)) { try { empreinte = await hashFichier(path.join(dossierScans, nom)); } catch (_) { empreinte = ''; } }
      const r = await rangerScan({
        dossierScans, nasRacine: config.nasRacine, nom,
        dossierNas: typeof b.dossierNas === 'string' ? b.dossierNas : '',
        rubriques: Array.isArray(b.rubriques) ? b.rubriques.filter((x) => typeof x === 'string').slice(0, 5) : [],
        nomCible: typeof b.nomCible === 'string' ? b.nomCible : '',
        sousDossier: typeof b.sousDossier === 'string' && b.sousDossier ? b.sousDossier : ''
      });
      if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
      const entree = {
        date: new Date().toISOString(), nom, chemin: r.chemin, rubrique: r.rubrique, original: r.original || '',
        dossierId: typeof b.dossierId === 'string' ? b.dossierId : '', dossier: typeof b.dossier === 'string' ? b.dossier : '',
        type: typeof b.type === 'string' ? b.type : '', auteur: typeof b.auteur === 'string' ? b.auteur : '', auto: b.auto === true,
        score: Number.isFinite(b.score) ? b.score : null,
        dateSource: r.original ? '' : (r.dateSource || ''),
        id: crypto.randomUUID(), hash: empreinte, corrige: b.corrige === true && b.auto !== true, annule: ''
      };
      parametresRepo.ecrireJournalScans(ajouterAuJournal(parametresRepo.lireJournalScans(), entree));
      // Ce que l'étude vient de faire à la main s'apprend (types corrigés, identifiants du dossier) ; jamais un rangement automatique.
      if (b.auto !== true && b.apprentissage && typeof b.apprentissage === 'object') {
        try {
          const ap = b.apprentissage;
          const mem = parametresRepo.lireMemoireScans();
          const maintenantIso = new Date(horloge()).toISOString();
          const mots = (Array.isArray(ap.mots) ? ap.mots : []).filter((m) => typeof m === 'string' && /^[a-z]{4,40}$/.test(m)).slice(0, 40);
          const ids = (Array.isArray(ap.identifiants) ? ap.identifiants : []).filter((x) => typeof x === 'string' && /^[A-Z0-9]{8,34}$/.test(x)).slice(0, 12);
          const type = typeof ap.type === 'string' && ap.type.length <= 80 ? ap.type : '';
          if (type && mots.length >= 3) mem.types = M.fusionnerTypeMemoire(mem.types, mots, type, maintenantIso);
          if (ids.length && entree.dossierId) mem.identifiants = M.fusionnerIdentifiantsMemoire(mem.identifiants, ids, entree.dossierId, maintenantIso);
          mem.rev += 1;
          parametresRepo.ecrireMemoireScans(mem);
        } catch (e) { console.warn('[scans] mémoire non mise à jour :', e && e.message); }
      }
      // Le texte lu devient cherchable (nom de la copie, dossier, rubrique, texte des premières pages), sur ce serveur seulement.
      if (textes) {
        try {
          textes.indexer({ id: entree.id, nom: path.basename(String(r.chemin || nom)), dossierId: entree.dossierId, dossier: entree.dossier, rubrique: entree.rubrique, date: entree.date,
            texte: typeof b.texte === 'string' ? b.texte : '' });
        } catch (e) { console.warn('[scans] texte non indexé :', e && e.message); }
      }
      res.json(Object.assign({ ok: true, id: entree.id }, r));
    } finally {
      enCours.delete(nom);
    }
  }));

  // Ce que Claire Scan a appris (types corrigés, identifiants) : lu par le poste quand sa révision change.
  routeur.get('/scans/memoire', (req, res) => { res.json(parametresRepo.lireMemoireScans()); });
  routeur.delete('/scans/memoire', (req, res) => {
    const avant = parametresRepo.lireMemoireScans();
    res.json(parametresRepo.ecrireMemoireScans({ rev: avant.rev + 1, types: [], identifiants: [] }));
  });

  // Recherche dans le texte des scans rangés : jamais le texte entier, un extrait.
  routeur.get('/scans/recherche', routeAsync(async (req, res) => {
    if (!textes) { res.status(503).json({ erreur: 'Recherche dans les scans indisponible sur ce serveur.' }); return; }
    res.json({ resultats: textes.chercher(String(req.query.q || '').slice(0, 200), 20), indexes: textes.nombre() });
  }));

  // « Remettre dans Scan » : le scan rangé revient dans le dossier Scan (voir annulerRangement).
  routeur.post('/scans/annuler', routeAsync(async (req, res) => {
    const id = String((req.body || {}).id || '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) { res.status(400).json({ erreur: 'Rangement inconnu.' }); return; }
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return; }
    const dossierScans = await trouverDossierScans(config);
    if (!dossierScans) { res.status(503).json({ erreur: 'Dossier Scan introuvable.' }); return; }
    const journal = parametresRepo.lireJournalScans();
    const entree = journal.find((e) => e.id === id);
    if (!entree) { res.status(404).json({ erreur: 'Ce rangement n’est plus dans le journal.' }); return; }
    if (entree.annule) { res.status(409).json({ erreur: 'Ce rangement est déjà annulé.' }); return; }
    if (enCours.has(entree.nom)) { res.status(409).json({ erreur: 'Ce scan est en cours de traitement.' }); return; }
    enCours.add(entree.nom);
    try {
      const r = await annulerRangement({ dossierScans, nasRacine: config.nasRacine, entree });
      if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
      parametresRepo.ecrireJournalScans(journal.map((e) => (e.id === id ? Object.assign({}, e, { annule: new Date(horloge()).toISOString() }) : e)));
      if (textes) { try { textes.retirer(id); } catch (e) { /* l'index suit au prochain rangement */ } }
      res.json({ ok: true, remis: r.remis, copieRetiree: r.copieRetiree, entree: { dossierId: entree.dossierId, type: entree.type, chemin: entree.chemin, nom: entree.nom } });
    } finally {
      enCours.delete(entree.nom);
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

module.exports = { creerRouteurScans, accorderRelais, DUREE_RELAIS_MS, statistiquesScans };
