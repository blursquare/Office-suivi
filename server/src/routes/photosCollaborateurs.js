'use strict';

// Photos de profil des collaborateurs (étude 24/10) : déposées dans Réglages › Collaborateurs, elles remplacent les
// initiales partout où le collaborateur est montré ; sans photo, les initiales restent. Le poste réduit l'image (carré de
// 160 px, JPEG) avant l'envoi ; le serveur ne garde que ce format, 150 Ko au plus par photo, pour les seuls noms de la
// liste fermée des collaborateurs. Clé `photos-collaborateurs` : { nom: { base64, modifieLe } }.

const express = require('express');
const { NOMS_COLLABORATEURS } = require('../comptesCollaborateurs');

const CLE = 'photos-collaborateurs';
const MAX_BASE64 = 200 * 1024;

// Pure : { nom: { base64, modifieLe } } réduit aux collaborateurs connus et aux JPEG plausibles.
function assainirPhotos(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const out = {};
  for (const nom of NOMS_COLLABORATEURS) {
    const p = b[nom];
    if (!p || typeof p.base64 !== 'string') continue;
    const base64 = p.base64.replace(/\s+/g, '');
    if (!base64 || base64.length > MAX_BASE64 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) continue;
    if (!base64.startsWith('/9j/')) continue; // signature JPEG
    out[nom] = { base64, modifieLe: typeof p.modifieLe === 'string' ? p.modifieLe.slice(0, 40) : '' };
  }
  return out;
}

// Ce que le poste reçoit : { nom: 'data:image/jpeg;base64,…' }.
function photosPubliques(photos) {
  const out = {};
  for (const nom of Object.keys(photos)) out[nom] = 'data:image/jpeg;base64,' + photos[nom].base64;
  return out;
}

function creerRouteurPhotosCollaborateurs(parametresRepo) {
  const routeur = express.Router();
  const lire = () => assainirPhotos(parametresRepo.lireJsonBrut(CLE, {}));
  const ecrire = (photos) => parametresRepo.ecrireJsonBrut(CLE, assainirPhotos(photos));
  const nomValide = (req, res) => {
    const nom = String(req.params.nom || '');
    if (!NOMS_COLLABORATEURS.includes(nom)) { res.status(404).json({ erreur: 'Collaborateur inconnu.' }); return null; }
    return nom;
  };

  routeur.get('/photos-collaborateurs', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(photosPubliques(lire()));
  });

  routeur.put('/photos-collaborateurs/:nom', (req, res) => {
    const nom = nomValide(req, res);
    if (!nom) return;
    const base64 = String((req.body && req.body.base64) || '');
    const propre = assainirPhotos({ [nom]: { base64, modifieLe: new Date().toISOString() } });
    if (!propre[nom]) return res.status(400).json({ erreur: 'Photo refusée : JPEG de 150 Ko au plus.' });
    const photos = lire();
    photos[nom] = propre[nom];
    res.json(photosPubliques(ecrire(photos)));
  });

  routeur.delete('/photos-collaborateurs/:nom', (req, res) => {
    const nom = nomValide(req, res);
    if (!nom) return;
    const photos = lire();
    delete photos[nom];
    res.json(photosPubliques(ecrire(photos)));
  });

  return routeur;
}

module.exports = { creerRouteurPhotosCollaborateurs, assainirPhotos, photosPubliques };
