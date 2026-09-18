'use strict';

// Accès au NAS de l'étude, servi par le serveur à TOUS les postes du bureau — voir ../nas.js pour
// le pourquoi de ce changement (l'API File System Access du navigateur n'existe pas sur une
// adresse IP, donc pas pour les collaborateurs qui rejoignent l'outil autrement que depuis le
// poste serveur lui-même).
//
// Trois routes, toutes derrière le middleware d'authentification comme le reste de /api :
//   GET /api/nas/dossiers            → les sous-dossiers de premier niveau de la racine configurée
//   GET /api/nas/fichiers?dossier=   → les PDF d'un de ces sous-dossiers, sous-dossiers compris
//   GET /api/nas/fichier?chemin=     → les octets d'un PDF (le client garde pdf.js, rien n'est
//                                      analysé côté serveur — pas de dépendance PDF ici)
//
// Le client ne manipule que des chemins RELATIFS à la racine ; `resoudreCheminNas()` est le seul
// point qui les transforme en chemin réel, et refuse tout ce qui en sortirait.

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { listerPdfRecursif, listerSousDossiers, resoudreCheminNas, rapprocherParNom, rapprochementParfait } = require('../nas');

function creerRouteurNas(config) {
  const routeur = express.Router();

  // Interrogée par l'interface pour savoir si la fonctionnalité est utilisable du tout, et afficher
  // un message actionnable sinon (racine non configurée / introuvable) plutôt qu'une liste vide
  // inexplicable.
  routeur.get('/nas/etat', (req, res) => {
    const racine = config.nasRacine;
    if (!racine) {
      res.json({ configure: false, raison: "Aucun dossier NAS configuré : ajoutez \"nasRacine\" dans config.json (à côté de CLAIRE-serveur.exe), puis redémarrez le serveur." });
      return;
    }
    if (!fs.existsSync(racine)) {
      res.json({ configure: false, racine, raison: `Le dossier configuré est introuvable depuis le serveur : ${racine}` });
      return;
    }
    res.json({ configure: true, racine });
  });

  routeur.get('/nas/dossiers', (req, res) => {
    const racine = config.nasRacine;
    if (!racine || !fs.existsSync(racine)) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré ou accessible depuis le serveur.' });
      return;
    }
    const dossiers = listerSousDossiers(racine);
    // Le rapprochement est proposé ici quand le client fournit un nom : le serveur a déjà la liste
    // sous la main, inutile de la renvoyer pour que le client refasse le même calcul.
    const propose = req.query.nom ? rapprocherParNom(String(req.query.nom), dossiers) : null;
    // `parfait` autorise le client à relier sans demander : tous les mots du nom du dossier se
    // retrouvent dans ce seul dossier NAS (voir rapprochementParfait).
    const parfait = req.query.nom ? rapprochementParfait(String(req.query.nom), dossiers) : null;
    res.json({ dossiers, propose, parfait });
  });

  routeur.get('/nas/fichiers', (req, res) => {
    const racine = config.nasRacine;
    if (!racine) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' });
      return;
    }
    const cible = resoudreCheminNas(racine, req.query.dossier || '');
    if (!cible) {
      res.status(400).json({ erreur: 'Chemin hors du dossier NAS configuré.' });
      return;
    }
    if (!fs.existsSync(cible)) {
      res.status(404).json({ erreur: 'Dossier introuvable sur le NAS.' });
      return;
    }
    // Les chemins renvoyés sont relatifs au SOUS-DOSSIER demandé ; le client les repréfixe pour
    // appeler /nas/fichier. Garder cette base explicite évite toute ambiguïté des deux côtés.
    const fichiers = listerPdfRecursif(cible);
    res.json({ base: path.relative(path.resolve(racine), cible), fichiers });
  });

  routeur.get('/nas/fichier', (req, res) => {
    const racine = config.nasRacine;
    if (!racine) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' });
      return;
    }
    const cible = resoudreCheminNas(racine, req.query.chemin || '');
    if (!cible || !/\.pdf$/i.test(cible)) {
      // L'extension est vérifiée ici et pas seulement à la liste : cette route sert des octets
      // bruts, elle ne doit jamais pouvoir rendre autre chose qu'un PDF du NAS.
      res.status(400).json({ erreur: 'Chemin invalide (seuls les PDF du dossier NAS sont servis).' });
      return;
    }
    if (!fs.existsSync(cible)) {
      res.status(404).json({ erreur: 'Fichier introuvable sur le NAS.' });
      return;
    }
    // Type MIME forcé : un fichier sans extension reconnue par l'OS faisait afficher le binaire du
    // PDF comme du texte dans l'ancienne version côté client (bug déjà corrigé une fois, voir
    // CLAUDE.md) — le serveur ne laisse pas ce doute s'installer.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(cible))}"`);
    fs.createReadStream(cible).pipe(res);
  });

  return routeur;
}

module.exports = { creerRouteurNas };
