'use strict';

// Pages d'Authentic envoyées par l'extension Firefox « CLAIRE pour Authentic » (extension-firefox/) :
//  - POST /api/authentic/capture : { titre, adresse, champs: [{ groupe, libelle, valeur }],
//    tableaux: [{ titre, entete: [titre de colonne, …], lignes: [[cellule, …], …] }], texte } → { id }
//  - GET  /api/authentic/capture/:id : la capture, pour la fenêtre CLAIRE qui l'affiche.
// Une capture contient des données de clients : gardée en MÉMOIRE seulement (30 min, 20 au plus),
// jamais en base, jamais journalisée, jamais reprise dans un message d'erreur. Le corps doit être en
// application/json : une page web d'un autre site ne peut pas en poster sans prévol CORS (auquel le
// serveur ne répond pas) ; l'extension, elle, a la permission de l'adresse de CLAIRE.

const express = require('express');
const crypto = require('node:crypto');

var DUREE_CAPTURE_MS = 30 * 60 * 1000;
var MAX_CAPTURES = 20;
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
  return {
    titre: chaine(c.titre, L.titre),
    adresse: chaine(c.adresse, L.adresse),
    champs,
    tableaux,
    texte: String(c.texte || '').slice(0, L.texte)
  };
}

function creerRouteurAuthentic(options) {
  const maintenant = (options && options.maintenant) || (() => Date.now());
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
  routeur.get('/authentic/capture/:id', (req, res) => {
    purger();
    const c = captures.get(String(req.params.id || ''));
    if (!c) { res.status(404).json({ error: 'Page introuvable ou expirée (30 min) : renvoyez-la depuis Authentic.' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.json(Object.assign({}, c, { recueLe: new Date(c.recueLe).toISOString() }));
  });
  return routeur;
}

module.exports = { creerRouteurAuthentic, normaliserCaptureAuthentic, DUREE_CAPTURE_MS, MAX_CAPTURES };
