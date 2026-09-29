'use strict';

// Images de la signature des emails préparés par CLAIRE (demandé par l'étude le 29/09 : « les png
// seront toujours les mêmes pour les emails envoyés par CLAIRE ») : la CARTE de l'office et la
// BANNIÈRE Visio, déposées une fois dans Réglages, gardées en base (table `parametres`) et reprises
// telles quelles dans chaque email (voir signatureHtmlOffice côté client). PNG ou JPEG seulement,
// 1,5 Mo au plus chacune.

const express = require('express');

const CLE = 'images-signature-email';
const EMPLACEMENTS = ['carte', 'visio'];
const TYPES = ['image/png', 'image/jpeg'];
const MAX_BASE64 = 2 * 1024 * 1024; // ≈ 1,5 Mo d'image

function assainirImage(brut) {
  const b = brut && typeof brut === 'object' ? brut : null;
  if (!b || TYPES.indexOf(b.type) === -1 || typeof b.base64 !== 'string') return null;
  const base64 = b.base64.replace(/\s+/g, '');
  if (!base64 || base64.length > MAX_BASE64 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) return null;
  const largeur = Math.round(Number(b.largeur));
  const hauteur = Math.round(Number(b.hauteur));
  if (!(largeur > 0 && largeur <= 4000 && hauteur > 0 && hauteur <= 4000)) return null;
  return { type: b.type, base64, largeur, hauteur, modifieLe: typeof b.modifieLe === 'string' ? b.modifieLe.slice(0, 40) : '' };
}

function assainirImages(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const out = {};
  for (const e of EMPLACEMENTS) {
    const img = assainirImage(b[e]);
    if (img) out[e] = img;
  }
  return out;
}

function creerRouteurSignatureImages(db) {
  const routeur = express.Router();
  const lire = () => {
    const ligne = db.prepare('SELECT valeur FROM parametres WHERE cle = ?').get(CLE);
    if (!ligne) return {};
    try { return assainirImages(JSON.parse(ligne.valeur)); } catch (e) { return {}; }
  };
  const ecrire = (images) => {
    const propre = assainirImages(images);
    db.prepare('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(CLE, JSON.stringify(propre));
    return propre;
  };

  routeur.get('/signature-images', (req, res) => { res.json(lire()); });

  routeur.put('/signature-images/:emplacement', (req, res) => {
    const e = req.params.emplacement;
    if (EMPLACEMENTS.indexOf(e) === -1) return res.status(404).json({ erreur: 'Emplacement inconnu.' });
    const img = assainirImage(Object.assign({}, req.body, { modifieLe: new Date().toISOString() }));
    if (!img) return res.status(400).json({ erreur: 'Image refusée : PNG ou JPEG de 1,5 Mo au plus.' });
    const images = lire();
    images[e] = img;
    res.json(ecrire(images));
  });

  routeur.delete('/signature-images/:emplacement', (req, res) => {
    const images = lire();
    delete images[req.params.emplacement];
    res.json(ecrire(images));
  });

  return routeur;
}

module.exports = { creerRouteurSignatureImages, assainirImage, assainirImages, EMPLACEMENTS };
