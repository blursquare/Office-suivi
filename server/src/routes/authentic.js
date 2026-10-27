'use strict';

// Pages d'Authentic envoyées par l'extension Firefox « CLAIRE pour Authentic » (extension-firefox/) :
//  - POST /api/authentic/capture : { titre, adresse, champs: [{ groupe, libelle, valeur }],
//    tableaux: [{ titre, entete: [titre de colonne, …], lignes: [[cellule, …], …] }], texte } → { id }
//  - GET  /api/authentic/capture/:id : la capture, pour la fenêtre CLAIRE qui l'affiche.
//  - POST /api/authentic/releve : page relevée AUTOMATIQUEMENT à l'affichage dans Authentic (étude,
//    02/10). Mise en file : une seule fenêtre CLAIRE la prend (POST /api/authentic/releves/prendre)
//    et met la fiche du dossier à jour (pièces reçues) — ou l'attend (POST /api/authentic/releves/attendre :
//    requête gardée ouverte jusqu'à 25 s, rendue dès qu'une page arrive ; une fenêtre cachée, que le
//    navigateur ne réveille plus qu'une fois par minute, est ainsi servie tout de suite) ; elle reste aussi 60 min parmi les relevés
//    récents (GET /api/authentic/releves/recents, 24 h) pour créer un dossier depuis Authentic.
//
// Fiabilité (étude, 02/10 : « pourquoi parfois les données ne remontent pas ? ») :
//  - Une page revue est REMISE en file avec son contenu (avant : l'intitulé seul) : si la première
//    lecture n'avait trouvé aucun dossier (dossier créé depuis, rattaché à la main), la seconde passe.
//    L'application est sans effet quand rien n'a changé. Seul un doublon de moins de 15 s (cadres
//    de la page, deux envois) est écarté.
//  - Une page est servie d'abord à une fenêtre CLAIRE du MÊME poste (adresse réseau de l'extension =
//    adresse de la fenêtre ; le poste serveur, en local ou par son adresse réseau, compte pour un) :
//    avant, la fenêtre d'un collègue pouvait la prendre — message sur son écran, fiche client suivante
//    rangée sans le dossier ouvert. Sans fenêtre de ce poste vue depuis 90 s, n'importe laquelle la prend.
//  - Un journal en mémoire (24 h, 100 lignes) suit chaque page : reçue, prise par quel poste, et ce que
//    la fenêtre en a fait (POST /api/authentic/releves/resultats) — GET /api/authentic/journal, affiché
//    dans Réglages › Authentic. Une page restée 60 min sans fenêtre y est marquée « expirée ».
// Une capture contient des données de clients : gardée en MÉMOIRE seulement (30 min, 20 au plus),
// jamais en base, jamais journalisée, jamais reprise dans un message d'erreur. Le corps doit être en
// application/json : une page web d'un autre site ne peut pas en poster sans prévol CORS (auquel le
// serveur ne répond pas) ; l'extension, elle, a la permission de l'adresse de CLAIRE.

const express = require('express');
const crypto = require('node:crypto');
const { adressesLan } = require('../reseau');

var DUREE_CAPTURE_MS = 30 * 60 * 1000;
var MAX_CAPTURES = 20;
var DUREE_RELEVE_MS = 60 * 60 * 1000;
var MAX_RELEVES = 80;
// Pages gardées pour « Nouveau dossier » › Depuis Authentic et le journal (étude, 03/10 : « je navigue
// dans plein de dossiers la journée ») : la journée, pas l'heure (24 h depuis le 06/10 au soir : « garde en mémoire 24 h »). Mémoire seule, jamais en base, vidée
// par un redémarrage du serveur.
var DUREE_RECENTS_MS = 24 * 60 * 60 * 1000;
var MAX_RECENTS = 500;
var LIMITES_CAPTURE = { titre: 300, adresse: 500, champs: 800, libelle: 200, valeur: 2000, tableaux: 40, lignes: 300, cellules: 40, cellule: 500, texte: 200000 };

function chaine(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Pure : ne garde que la forme attendue, bornée.
function normaliserCaptureAuthentic(corps) {
  const c = corps && typeof corps === 'object' ? corps : {};
  const L = LIMITES_CAPTURE;
  const champs = (Array.isArray(c.champs) ? c.champs : []).slice(0, L.champs)
    .map(x => ({ groupe: chaine(x && x.groupe, L.libelle), libelle: chaine(x && x.libelle, L.libelle), valeur: chaine(x && x.valeur, L.valeur) }))
    .filter(x => x.libelle || x.valeur);
  const ligne = l => (Array.isArray(l) ? l : []).slice(0, L.cellules).map(v => chaine(v, L.cellule));
  const tableaux = (Array.isArray(c.tableaux) ? c.tableaux : []).slice(0, L.tableaux)
    .map(t => ({
      titre: chaine(t && t.titre, L.libelle),
      entete: ligne(t && t.entete),
      lignes: (t && Array.isArray(t.lignes) ? t.lignes : []).slice(0, L.lignes).map(ligne)
    }))
    .filter(t => t.entete.length || t.lignes.length);
  const onglets = (Array.isArray(c.onglets) ? c.onglets : []).slice(0, 60)
    .map(o => ({ titre: chaine(o && o.titre, L.libelle), actif: !!(o && o.actif === true) }))
    .filter(o => o.titre);
  return {
    titre: chaine(c.titre, L.titre),
    onglets,
    adresse: chaine(c.adresse, L.adresse),
    champs,
    tableaux,
    texte: String(c.texte || '').slice(0, L.texte)
  };
}

var DUREE_ATTENTE_RELEVES_MS = 25 * 1000;
var DUREE_FENETRE_VUE_MS = 90 * 1000;
var DUREE_DOUBLON_MS = 15 * 1000;
var DUREE_JOURNAL_MS = 24 * 60 * 60 * 1000;
var MAX_JOURNAL = 100;
// Page remise à une fenêtre qui n'en a jamais rendu compte (fenêtre fermée, rechargée ou mise à jour pendant l'attente — banc Authentic du
// 19/10 : la page restait « prise » et n'était jamais appliquée) : remise en file après ce délai, trois fois au plus.
var DUREE_REPRISE_RELEVE_MS = 90 * 1000;
var ESSAIS_RELEVE_MAX = 3;
var ETATS_RESULTAT = ['applique', 'sans-changement', 'sans-dossier', 'a-choisir', 'a-confirmer', 'a-creer', 'erreur', 'rattache'];
// Les résultats où la page a été rangée dans un dossier (gardée pour lui).
var ETATS_RANGES = ['applique', 'sans-changement', 'rattache'];

// Le poste d'une requête : son adresse réseau, « local » pour le poste serveur (en local ou par l'une
// de ses propres adresses — l'extension du poste serveur peut viser son adresse réseau).
function origineRequete(req, adresses) {
  const ip = String((req && req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
  if (!ip || ip === '127.0.0.1' || ip === '::1') return 'local';
  let propres = [];
  try { propres = adresses() || []; } catch (e) { /* adresses inconnues */ }
  return propres.includes(ip) ? 'local' : ip;
}

// Pure : nature d'une page relevée, pour le journal (sans rien de son contenu sinon l'intitulé).
function naturePageAuthentic(capture) {
  const libelles = ((capture && capture.champs) || []).map(ch => String(ch.libelle || ''));
  if (libelles.some(l => /ficheClientPhysique|tabView:identiteClient:/i.test(l))) return 'client'; // personne, ou société (20/10)
  if (libelles.some(l => /ficheImmeuble/i.test(l))) return 'bien';
  return 'dossier';
}

function creerRouteurAuthentic(options) {
  const maintenant = (options && options.maintenant) || (() => Date.now());
  // Magasin des pages gardées par dossier (pagesAuthentic.js) ; sans lui, rien n'est gardé au-delà des 24 h en mémoire.
  const pages = (options && options.pages) || null;
  const dureeAttente = (options && options.dureeAttenteMs) || DUREE_ATTENTE_RELEVES_MS;
  const adresses = (options && options.adressesLan) || adressesLan;
  const origineDe = (req) => (options && options.origine) ? options.origine(req) : origineRequete(req, adresses);
  const captures = new Map();
  const purger = () => {
    const t = maintenant();
    for (const [id, c] of captures) if (t - c.recueLe > DUREE_CAPTURE_MS) captures.delete(id);
    while (captures.size > MAX_CAPTURES) captures.delete(captures.keys().next().value);
  };
  const routeur = express.Router();
  routeur.post('/authentic/capture', (req, res) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'Corps JSON attendu.' }); return; }
    const capture = normaliserCaptureAuthentic(req.body);
    if (!capture.champs.length && !capture.tableaux.length && !capture.texte) {
      res.status(400).json({ error: 'Page vide : rien à envoyer.' });
      return;
    }
    const id = crypto.randomBytes(9).toString('base64url');
    captures.set(id, Object.assign({ recueLe: maintenant() }, capture));
    purger();
    res.json({ id });
  });
  // Relevés automatiques : file à traiter (une fenêtre la prend) et relevés récents (création).
  let aTraiter = [];
  let recents = [];
  // Fenêtres en attente d'un relevé (la plus ancienne servie la première : une seule prend la file).
  const attentes = [];
  // Pages remises à une fenêtre, sans compte rendu encore : id → { releve, t, essais }.
  const enCours = new Map();
  // Fenêtres CLAIRE vues, par poste : { vu, poste } (poste = collaborateur choisi sur la fenêtre).
  const fenetres = new Map();
  // Journal des pages reçues (mémoire seule).
  let journal = [];
  const noter = (releve, champs) => {
    const e = journal.find(x => x.id === releve.id);
    if (e) Object.assign(e, champs);
  };
  const posteDe = (origine) => (fenetres.get(origine) || {}).poste || '';
  const vueRecemment = (origine) => {
    if (attentes.some(a => a.origine === origine)) return true;
    const f = fenetres.get(origine);
    return !!f && maintenant() - f.vu <= DUREE_FENETRE_VUE_MS;
  };
  // Les relevés pour une fenêtre de ce poste : les siens, et ceux d'un poste sans fenêtre CLAIRE.
  const prendrePour = (origine, poste) => {
    const pris = [];
    const reste = [];
    for (const r of aTraiter) {
      if (r.origine === origine || !r.origine || !vueRecemment(r.origine)) pris.push(r); else reste.push(r);
    }
    aTraiter = reste;
    const t = new Date(maintenant()).toISOString();
    pris.forEach(r => {
      if (!r.capture) return;
      noter(r, { etat: 'pris', prisLe: t, prisPar: poste || '' });
      enCours.set(r.id, { releve: r, t: maintenant(), essais: (r.essais || 0) + 1 });
    });
    // `memePoste` : la page vient de l'extension de CE poste (même adresse réseau) — la fenêtre n'en déduit « où l'on est dans Authentic »
    // que dans ce cas ; une page d'un poste sans fenêtre CLAIRE est appliquée ici mais ne dit rien de la personne de ce poste.
    return pris.map(r => Object.assign({}, r, { memePoste: !!r.origine && r.origine === origine }));
  };
  const voir = (req) => {
    const origine = origineDe(req);
    const poste = String((req.body && req.body.poste) || '').slice(0, 80) || posteDe(origine);
    fenetres.set(origine, { vu: maintenant(), poste });
    return { origine, poste };
  };
  const servirAttente = () => {
    for (let i = 0; i < attentes.length && aTraiter.length;) {
      const a = attentes[i];
      const pris = prendrePour(a.origine, a.poste);
      if (!pris.length) { i++; continue; }
      attentes.splice(i, 1);
      clearTimeout(a.minuterie);
      a.repondre(pris);
    }
  };
  // Empreinte → dernière réception (doublons rapprochés seulement).
  const empreintes = new Map();
  const purgerReleves = () => {
    const t = maintenant();
    // Remise en file d'une page prise sans compte rendu (la fenêtre a disparu entre-temps).
    for (const [id, e] of enCours) {
      if (t - e.t < DUREE_REPRISE_RELEVE_MS) continue;
      enCours.delete(id);
      if (e.essais >= ESSAIS_RELEVE_MAX || t - Date.parse(e.releve.recueLe) > DUREE_RELEVE_MS) { noter(e.releve, { etat: 'expire' }); continue; }
      // Une version plus récente de la même page est arrivée depuis (relecture 19/10) : l'ancienne n'est jamais rejouée par-dessus.
      const cle = clePageServeurAuthentic(e.releve.capture);
      if (cle && recents.some(r => r.id !== e.releve.id && r.recueLe > e.releve.recueLe && clePageServeurAuthentic(r.capture) === cle)) { noter(e.releve, { etat: 'remplace' }); continue; }
      aTraiter.push(Object.assign({}, e.releve, { essais: e.essais }));
      // (`revu` d'origine gardé : une page jamais appliquée n'est pas « revue ».)
      noter(e.releve, { etat: 'en-file', reprise: e.essais });
    }
    const expires = aTraiter.filter(r => t - Date.parse(r.recueLe) > DUREE_RELEVE_MS);
    expires.forEach(r => noter(r, { etat: 'expire' }));
    recents = recents.filter(r => t - Date.parse(r.recueLe) <= DUREE_RECENTS_MS).slice(-MAX_RECENTS);
    aTraiter = aTraiter.filter(r => t - Date.parse(r.recueLe) <= DUREE_RELEVE_MS).slice(-MAX_RELEVES);
    journal = journal.filter(e => t - Date.parse(e.recueLe) <= DUREE_JOURNAL_MS).slice(-MAX_JOURNAL);
    for (const [k, v] of empreintes) if (t - v > DUREE_RELEVE_MS) empreintes.delete(k);
  };
  // Une page relevée (extension du poste, ou navigateur de CLAIRE sur le serveur — authenticClaire.js, origine « claire-serveur »).
  /** @param {any} brut @param {string} origine */
  const recevoirReleve = (brut, origine) => {
    const capture = normaliserCaptureAuthentic(brut);
    if (!capture.champs.length && !capture.tableaux.length) return { ok: true, ignore: true };
    // Seules les pages dont CLAIRE connaît la structure sont gardées (étude, 02/10 : « ne lire que les
    // pages dont tu as la structure, pour ne pas surcharger ») : page du dossier, fiche client, fiche bien.
    if (!pageAuthenticConnue(capture)) return { ok: true, ignore: true };
    // L'intitulé et l'onglet actif comptent (banc Authentic du 19/10) : deux dossiers aux tableaux identiques (vente toute neuve, succession
    // sans pièce), ouverts l'un après l'autre, n'étaient qu'une page — la seconde était écartée comme doublon.
    const empreinte = crypto.createHash('sha1').update(JSON.stringify([capture.champs, capture.tableaux, capture.onglets.filter(o => o.actif).map(o => o.titre), intitulePageAuthentic(capture)])).digest('hex');
    const t = maintenant();
    const deja = empreintes.has(empreinte);
    if (deja && t - empreintes.get(empreinte) < DUREE_DOUBLON_MS) return { ok: true, deja: true };
    empreintes.set(empreinte, t);
    const releve = { id: crypto.randomBytes(9).toString('base64url'), recueLe: new Date(t).toISOString(), origine, capture };
    // Page revue : relue (voir l'en-tête) ; le poste ne répète pas un message « rien de neuf ».
    if (deja) releve.revu = true;
    aTraiter.push(releve);
    // Parmi les récents, la page revue remplace sa version précédente.
    recents = recents.filter(r => r.empreinte !== empreinte);
    recents.push(Object.assign({ empreinte }, releve));
    journal.push({ id: releve.id, recueLe: releve.recueLe, origine, posteOrigine: posteDe(origine), nature: naturePageAuthentic(capture), intitule: intitulePageAuthentic(capture), revu: !!deja, etat: 'en-file' });
    purgerReleves();
    servirAttente();
    return { ok: true, id: releve.id };
  };
  routeur.post('/authentic/releve', (req, res) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'Corps JSON attendu.' }); return; }
    res.json(recevoirReleve(req.body, origineDe(req)));
  });
  const mettreEnFile = (element) => {
    aTraiter.push(element);
    purgerReleves();
    servirAttente();
  };
  // Changement de dossier dans Authentic (dossier d'un type que CLAIRE ne lit pas) : l'intitulé SEUL,
  // pour que le poste cesse de ranger les fiches suivantes dans le dossier précédent (étude, 02/10).
  routeur.post('/authentic/navigation', (req, res) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'Corps JSON attendu.' }); return; }
    const intitule = chaine(req.body && req.body.intitule, 200);
    // Précédé de la référence du dossier « A 2026 00247 » depuis l'extension 0.3.9 (étude, 03/10).
    if (!/^(?:[A-Z]\s+(?:19|20)\d{2}\s+\d{4,6}\s+)?\d{1,6}\s*-\s*\S/.test(intitule)) { res.status(400).json({ error: 'Intitulé de dossier attendu.' }); return; }
    mettreEnFile({ id: crypto.randomBytes(9).toString('base64url'), recueLe: new Date(maintenant()).toISOString(), origine: origineDe(req), navigation: intitule });
    res.json({ ok: true });
  });
  routeur.post('/authentic/releves/attendre', (req, res) => {
    purgerReleves();
    res.setHeader('Cache-Control', 'no-store');
    const { origine, poste } = voir(req);
    const deja = prendrePour(origine, poste);
    if (deja.length) { res.json({ releves: deja }); return; }
    const a = { origine, poste, repondre: (pris) => {
      // Connexion déjà fermée (fenêtre fermée ou rechargée) : la page revient en tête de file au lieu d'être perdue.
      if (res.writableEnded || res.destroyed || (req.socket && req.socket.destroyed)) {
        pris.forEach(r => enCours.delete(r.id));
        aTraiter = pris.filter(r => r.capture || r.navigation).concat(aTraiter);
        pris.forEach(r => { if (r.capture) noter(r, { etat: 'en-file' }); });
        return;
      }
      res.json({ releves: pris });
    } };
    a.minuterie = setTimeout(() => {
      const i = attentes.indexOf(a);
      if (i >= 0) attentes.splice(i, 1);
      a.repondre([]);
    }, dureeAttente);
    attentes.push(a);
    // Fenêtre fermée ou rechargée : son attente est retirée, le relevé ira à une autre.
    res.on('close', () => {
      const i = attentes.indexOf(a);
      if (i >= 0) { attentes.splice(i, 1); clearTimeout(a.minuterie); }
    });
  });
  routeur.post('/authentic/releves/prendre', (req, res) => {
    purgerReleves();
    const { origine, poste } = voir(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ releves: prendrePour(origine, poste) });
  });
  // Ce que la fenêtre a fait de chaque page : { resultats: [{ id, etat, dossierId, texte }] }.
  routeur.post('/authentic/releves/resultats', (req, res) => {
    const liste = Array.isArray(req.body && req.body.resultats) ? req.body.resultats.slice(0, 50) : [];
    for (const r of liste) {
      if (!r || !ETATS_RESULTAT.includes(r.etat)) continue;
      enCours.delete(String(r.id || ''));
      noter({ id: String(r.id || '') }, {
        etat: r.etat,
        dossierId: chaine(r.dossierId, 80),
        texte: chaine(r.texte, 300),
        traiteLe: new Date(maintenant()).toISOString()
      });
      // Page rangée dans un dossier : gardée pour lui dans la base du bureau (voir pagesAuthentic.js) — relue plus tard sur la fiche.
      const dossierId = chaine(r.dossierId, 80);
      if (pages && dossierId && ETATS_RANGES.includes(r.etat)) {
        const rel = recents.find(x => x.id === String(r.id || ''));
        if (rel && rel.capture) {
          try { pages.garder(dossierId, { capture: rel.capture, nature: naturePageAuthentic(rel.capture), intitule: intitulePageAuthentic(rel.capture), recueLe: rel.recueLe, cle: chaine(r.cle, 200) }); }
          catch (e) { console.error('[authentic] page non gardée :', e && e.message ? e.message : e); }
        }
      }
    }
    res.json({ ok: true });
  });
  // Ce qui a été reçu d'Authentic pour un dossier (sans le contenu) et les pages entières pour « Relire depuis Authentic ».
  routeur.get('/authentic/dossier/:id/pages', (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) { res.status(400).json({ error: 'Identifiant invalide.' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    if (!pages) { res.json({ pages: [] }); return; }
    res.json({ pages: req.query.contenu === '1' ? pages.pages(id) : pages.resume(id) });
  });
  // « Oublier ce qui vient d'Authentic » : les pages gardées partent aussi (sinon la relecture les remettrait).
  routeur.delete('/authentic/dossier/:id/pages', (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) { res.status(400).json({ error: 'Identifiant invalide.' }); return; }
    if (pages) pages.oublier(id);
    res.json({ ok: true });
  });
  routeur.get('/authentic/journal', (req, res) => {
    purgerReleves();
    res.setHeader('Cache-Control', 'no-store');
    const t = maintenant();
    const enMemoire = new Set(recents.map(r => r.id));
    res.json({
      entrees: journal.slice().reverse().map(e => Object.assign({}, e, { posteOrigine: e.posteOrigine || posteDe(e.origine), enMemoire: enMemoire.has(e.id) })),
      fenetres: Array.from(fenetres, ([origine, f]) => ({ origine, poste: f.poste, vuIlYa: t - f.vu, enAttente: attentes.some(a => a.origine === origine) }))
    });
  });
  routeur.get('/authentic/releves/recents', (req, res) => {
    purgerReleves();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ releves: recents.map(({ empreinte, ...r }) => r) });
  });
  // Une page encore en mémoire (24 h), pour la ranger à la main ou créer le dossier depuis le journal.
  routeur.get('/authentic/releves/:id', (req, res) => {
    purgerReleves();
    const r = recents.find(x => x.id === String(req.params.id || ''));
    if (!r) { res.status(404).json({ error: 'Page plus en mémoire (24 h) : rouvrez-la dans Authentic.' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    const { empreinte, ...releve } = r;
    res.json(releve);
  });
  routeur.get('/authentic/capture/:id', (req, res) => {
    purger();
    const c = captures.get(String(req.params.id || ''));
    if (!c) { res.status(404).json({ error: 'Page introuvable ou expirée (30 min) : renvoyez-la depuis Authentic.' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.json(Object.assign({}, c, { recueLe: new Date(c.recueLe).toISOString() }));
  });
  routeur.recevoirReleve = recevoirReleve;
  return routeur;
}

// Page du dossier (intitulé « N - Vente X/Y » ou « N - Succession X »), fiche client (personne physique), fiche bien — le
// même test que l'extension (auto.js) et que typePageAuthentic côté poste.
// « N - Succession NOM » aussi (étude, 02/10 : dossiers de succession créés depuis Authentic).
const RE_INTITULE_PAGE = /(?:^|[^\w])\d{1,6}\s*-\s*(?:(?:Vente|VTE)\s+[^\n\/]*\S\s*\/\s*\S|(?:Succession|SUCC)\.?\s+\S)/i;
// En-tête d'une page de dossier quelle que soit la formulation de l'intitulé (étude, 02/10 : « le nom n'est
// pas fixe ») : « N - … » suivi de Importer / Comparants / Immeubles.
const RE_INTITULE_GESTION_PAGE = /(?:^|[^\w])\d{1,6}\s*-\s*[A-Za-zÀ-ÿ][^\n]{0,150}?\S\s*(?:Importer|Comparants|Immeubles)(?![A-Za-zÀ-ÿ])/i;
// Intitulé tel que l'étude le voit, sans numéro (étude, 02/10 : « le dossier est identifié par VTE NOM
// VENDEURS / NOM ACQUÉREURS, le numéro est caché dans les données du dossier ») : en titre de l'onglet
// actif, ou en en-tête de la page du dossier.
const RE_ONGLET_DOSSIER = /^\s*(?:\d{1,6}\s*-\s*[A-Za-zÀ-ÿ]|(?:VTE|Vente)\.?\s+[^\n\/]*?\S\s*\/\s*\S)/i;
const RE_EN_TETE_VTE_PAGE = /(?:^|[^\w-])(?:VTE|Vente)\.?\s+[^\n\/]{0,100}?\S\s*\/\s*[^\n]{0,100}?\S\s*(?:Importer|Comparants|Immeubles)(?![A-Za-zÀ-ÿ])/i;

// Le texte sans les titres des onglets inactifs : un autre dossier ouvert ne désigne jamais la page.
function texteActifAuthentic(capture) {
  const c = capture || {};
  const inactifs = new Set((c.onglets || []).filter(o => !o.actif).map(o => o.titre));
  return String(c.texte || '').split('\n').filter(l => !inactifs.has(l.replace(/\s+/g, ' ').trim())).join('\n');
}

// Pure : ce qui désigne la même page d'Authentic (le même écran, peut-être modifié) — la nature et l'intitulé, plus le nom de la personne
// d'une fiche client ou l'adresse d'une fiche bien. '' si rien ne la désigne.
function clePageServeurAuthentic(capture) {
  if (!capture) return '';
  const nature = naturePageAuthentic(capture);
  // Seules les fiches client et bien se reconnaissent (relecture 19/10 : les pages « dossier » d'un même intitulé ne sont pas une seule page) ;
  // la personne de la fiche = le DERNIER nom relevé (le volet du conjoint vient en premier), un bien sans adresse (page « Lots ») : aucune clé.
  if (nature !== 'client' && nature !== 'bien') return '';
  const champ = (re) => { const l = (capture.champs || []).filter(c => re.test(String(c.libelle || ''))); return (l[l.length - 1] || {}).valeur || ''; };
  const detail = nature === 'client' ? [champ(/^nom de famille/i), champ(/^pr[ée]nom/i)].join(' ')
    : [champ(/^n° de voie/i), champ(/^nom de la voie/i), champ(/^cp - ville/i)].join(' ');
  if (!detail.trim()) return '';
  return [nature, intitulePageAuthentic(capture), detail].join('|').toLowerCase().replace(/\s+/g, ' ').trim();
}

// L'intitulé « N - … » de la page (onglet actif, puis en-tête du dossier, puis intitulé seul), ou ''.
function intitulePageAuthentic(capture) {
  const c = capture || {};
  const actif = (c.onglets || []).find(o => o.actif && RE_ONGLET_DOSSIER.test(o.titre));
  if (actif) return chaine(actif.titre, 200);
  const sources = (c.champs || []).map(ch => String(ch.libelle || '') + ' ' + String(ch.valeur || '')).concat(texteActifAuthentic(c).split('\n'));
  for (const re of [RE_INTITULE_GESTION_PAGE, RE_EN_TETE_VTE_PAGE, RE_INTITULE_PAGE]) {
    for (const s of sources) {
      const m = re.exec(s);
      if (m) return chaine(s.slice(m.index).replace(/^[^\dA-Za-zÀ-ÿ]*/, ''), 200);
    }
  }
  return '';
}

function pageAuthenticConnue(capture) {
  const c = capture || {};
  const libelles = (c.champs || []).map(ch => String(ch.libelle || '') + ' ' + String(ch.valeur || ''));
  if (libelles.some(l => /ficheClientPhysique|tabView:identiteClient:|ficheImmeuble/i.test(l))) return true;
  if ((c.onglets || []).some(o => o.actif && RE_ONGLET_DOSSIER.test(o.titre))) return true;
  const texte = texteActifAuthentic(c);
  const res = [RE_INTITULE_PAGE, RE_INTITULE_GESTION_PAGE, RE_EN_TETE_VTE_PAGE];
  return libelles.some(l => res.some(re => re.test(l))) || res.some(re => re.test(texte));
}

module.exports = { creerRouteurAuthentic, pageAuthenticConnue, normaliserCaptureAuthentic, origineRequete, naturePageAuthentic, DUREE_CAPTURE_MS, MAX_CAPTURES, DUREE_RELEVE_MS, DUREE_RECENTS_MS, DUREE_ATTENTE_RELEVES_MS, DUREE_FENETRE_VUE_MS, DUREE_DOUBLON_MS, DUREE_REPRISE_RELEVE_MS, ESSAIS_RELEVE_MAX };
