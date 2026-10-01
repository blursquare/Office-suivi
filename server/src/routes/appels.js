'use strict';

// Appels reçus (3CX, voir ../appels3cx.js).
//  - GET /appel (hors /api, sans session) : l'adresse que 3CX ouvre à la sonnerie. Elle note l'appel
//    et ne renvoie aucune donnée : une page qui se ferme (fenêtre CLAIRE du collaborateur ouverte et
//    visible) ou qui ouvre CLAIRE sur l'appel. Bornée à 60 appels par minute.
//  - GET /api/appels/nouveaux?poste=&depuis=&visible= : la fenêtre CLAIRE relève ses appels toutes les
//    3 s (même cachée) et signale si elle est visible.
//  - GET /api/appels?dossierId= : le journal (50 derniers, ou ceux d'un dossier).

const express = require('express');
const { creerEntreeAppel, pageSonnerie } = require('../appels3cx');
const { adressesLan } = require('../reseau');

var FENETRE_VUE_MS = 15000;

function creerEtatAppels() {
  return { fenetres: new Map(), sonneries: [] };
}

function creerRouteurSonnerie(parametresRepo, depot, etat) {
  const routeur = express.Router();
  routeur.get('/appel', (req, res) => {
    const maintenant = Date.now();
    etat.sonneries = etat.sonneries.filter(t => maintenant - t < 60000);
    if (etat.sonneries.length >= 60) { res.status(429).type('text/plain').send('Trop d’appels.'); return; }
    etat.sonneries.push(maintenant);
    const q = req.query || {};
    let entree;
    try {
      entree = creerEntreeAppel({ numero: q.numero, nom: q.nom, poste: q.poste }, {
        dossiers: depot.tousActifs(),
        carnet: parametresRepo.lireCarnetConfreres(),
        repertoire: parametresRepo.lireRepertoire()
      });
      parametresRepo.ecrireJournalAppels([entree].concat(parametresRepo.lireJournalAppels()));
    } catch (e) {
      // Jamais le numéro ni le nom dans le message.
      console.error('Appel 3CX non noté :', e && e.code ? e.code : 'erreur');
      res.status(500).type('text/plain').send('Appel non noté.');
      return;
    }
    const vue = etat.fenetres.get(entree.poste);
    const fenetreVisible = !!(entree.poste && vue && vue.visible && maintenant - vue.t < FENETRE_VUE_MS);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(pageSonnerie({ id: entree.id, fenetreVisible }));
  });
  return routeur;
}

function creerRouteurAppels(parametresRepo, etat) {
  const routeur = express.Router();
  routeur.get('/appels/nouveaux', (req, res) => {
    const poste = String(req.query.poste || '').slice(0, 80);
    const depuis = String(req.query.depuis || '');
    if (poste) etat.fenetres.set(poste, { t: Date.now(), visible: req.query.visible === '1' });
    // Heure prise AVANT la lecture : un appel noté entre les deux sera relevé la fois suivante
    // (la fenêtre écarte un appel déjà montré par son identifiant).
    const serverTime = new Date().toISOString();
    const journal = parametresRepo.lireJournalAppels();
    const appels = depuis ? journal.filter(a => a.t >= depuis && (!a.poste || a.poste === poste)).slice(0, 5) : [];
    res.json({ appels, serverTime });
  });
  // Adresses du serveur sur le réseau du bureau : la fenêtre CLAIRE du poste serveur est ouverte sur
  // http://localhost, adresse qui ne mène au serveur que depuis ce poste-là — l'adresse à coller dans
  // 3CX doit être celle du réseau.
  routeur.get('/appels/adresses-serveur', (req, res) => {
    res.json({ adresses: (etat.adressesLan || adressesLan)() });
  });
  routeur.get('/appels', (req, res) => {
    const journal = parametresRepo.lireJournalAppels();
    const dossierId = String(req.query.dossierId || '');
    const id = String(req.query.id || '');
    const liste = id ? journal.filter(a => a.id === id)
      : dossierId ? journal.filter(a => a.dossiers.some(x => x.id === dossierId)).slice(0, 50)
        : journal.slice(0, 50);
    res.json({ appels: liste });
  });
  return routeur;
}

module.exports = { creerRouteurSonnerie, creerRouteurAppels, creerEtatAppels, FENETRE_VUE_MS };
