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
const { listerPdfRecursif, listerSousDossiers, listerRecusRacine, resoudreCheminNas, rapprocherParNom, rapprochementParfait } = require('../nas');
const fsp = require('node:fs/promises');

// Toute lecture du NAS est asynchrone depuis qu'un balayage synchrone a été identifié comme la
// cause des gels du serveur (voir nas.js et CLAUDE.md) : pendant qu'une route attend le NAS, le
// serveur continue de répondre aux autres.
//
// Une route `async` qui REJETTE ne renvoie jamais rien : Express 4 ne rattrape pas une promesse
// rejetée, la requête resterait suspendue jusqu'au timeout du navigateur — un gel remplacé par un
// blocage définitif, soit pire que le problème traité ici. D'où cette enveloppe obligatoire.
const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[CLAIRE] Erreur sur une route NAS :', err && err.stack ? err.stack : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Lecture du NAS impossible depuis le serveur.' });
  });
};

// `fs.existsSync` sur un chemin réseau est lui aussi un aller-retour bloquant — remplacé partout.
async function existe(chemin) {
  try {
    await fsp.access(chemin);
    return true;
  } catch (_) {
    return false;
  }
}

function creerRouteurNas(config) {
  const routeur = express.Router();

  // Interrogée par l'interface pour savoir si la fonctionnalité est utilisable du tout, et afficher
  // un message actionnable sinon (racine non configurée / introuvable) plutôt qu'une liste vide
  // inexplicable.
  routeur.get('/nas/etat', routeAsync(async (req, res) => {
    const racine = config.nasRacine;
    if (!racine) {
      res.json({ configure: false, raison: "Aucun dossier NAS configuré : ajoutez \"nasRacine\" dans config.json (à côté de CLAIRE-serveur.exe), puis redémarrez le serveur." });
      return;
    }
    if (!(await existe(racine))) {
      res.json({ configure: false, racine, raison: `Le dossier configuré est introuvable depuis le serveur : ${racine}` });
      return;
    }
    res.json({ configure: true, racine });
  }));

  routeur.get('/nas/dossiers', routeAsync(async (req, res) => {
    const racine = config.nasRacine;
    if (!racine || !(await existe(racine))) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré ou accessible depuis le serveur.' });
      return;
    }
    const dossiers = await listerSousDossiers(racine);
    // Le rapprochement est proposé ici quand le client fournit un nom : le serveur a déjà la liste
    // sous la main, inutile de la renvoyer pour que le client refasse le même calcul.
    const propose = req.query.nom ? rapprocherParNom(String(req.query.nom), dossiers) : null;
    // `parfait` autorise le client à relier sans demander : tous les mots du nom du dossier se
    // retrouvent dans ce seul dossier NAS (voir rapprochementParfait).
    const parfait = req.query.nom ? rapprochementParfait(String(req.query.nom), dossiers) : null;
    res.json({ dossiers, propose, parfait });
  }));

  routeur.get('/nas/fichiers', routeAsync(async (req, res) => {
    const racine = config.nasRacine;
    if (!racine) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' });
      return;
    }
    const cible = await resoudreCheminNas(racine, req.query.dossier || '');
    if (!cible) {
      res.status(400).json({ erreur: 'Chemin hors du dossier NAS configuré.' });
      return;
    }
    if (!(await existe(cible))) {
      res.status(404).json({ erreur: 'Dossier introuvable sur le NAS.' });
      return;
    }
    // Les chemins renvoyés sont relatifs au SOUS-DOSSIER demandé ; le client les repréfixe pour
    // appeler /nas/fichier. Garder cette base explicite évite toute ambiguïté des deux côtés.
    const fichiers = await listerPdfRecursif(cible);
    res.json({ base: path.relative(path.resolve(racine), cible), fichiers });
  }));

  // Reçus comptables du jour, à la racine du dossier commun (voir listerRecusRacine). `depuis`
  // (AAAA-MM-JJ) borne la liste : inutile de relire un an de reçus pour un appel de fonds récent.
  routeur.get('/nas/recus', routeAsync(async (req, res) => {
    const racine = config.nasRacine;
    if (!racine || !(await existe(racine))) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré ou accessible depuis le serveur.' });
      return;
    }
    const depuis = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.depuis || '')) ? String(req.query.depuis) : null;
    res.json({ recus: await listerRecusRacine(racine, depuis) });
  }));

  routeur.get('/nas/fichier', routeAsync(async (req, res) => {
    const racine = config.nasRacine;
    if (!racine) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' });
      return;
    }
    const cible = await resoudreCheminNas(racine, req.query.chemin || '');
    if (!cible || !/\.pdf$/i.test(cible)) {
      // L'extension est vérifiée ici et pas seulement à la liste : cette route sert des octets
      // bruts, elle ne doit jamais pouvoir rendre autre chose qu'un PDF du NAS.
      res.status(400).json({ erreur: 'Chemin invalide (seuls les PDF du dossier NAS sont servis).' });
      return;
    }
    if (!(await existe(cible))) {
      res.status(404).json({ erreur: 'Fichier introuvable sur le NAS.' });
      return;
    }
    // Type MIME forcé : un fichier sans extension reconnue par l'OS faisait afficher le binaire du
    // PDF comme du texte dans l'ancienne version côté client (bug déjà corrigé une fois, voir
    // CLAUDE.md) — le serveur ne laisse pas ce doute s'installer.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(cible))}"`);
    fs.createReadStream(cible).pipe(res);
  }));

  return routeur;
}

// Lien direct vers une pièce, envoyé dans la notification Teams (voir ../liensPieces.js). Montée
// HORS du middleware d'authentification, volontairement : un clic dans Teams n'en porte aucune. La
// preuve est la signature du lien lui-même, vérifiée ici avant toute lecture du NAS ; au-delà, le
// chemin suit exactement les mêmes garde-fous que /api/nas/fichier (confinement, PDF seulement).
function creerRouteurLienPiece(config, parametresRepo) {
  const { lienValide } = require('../liensPieces');
  const routeur = express.Router();
  routeur.get('/piece', routeAsync(async (req, res) => {
    const racine = config.nasRacine;
    const params = { c: req.query.c, e: req.query.e, s: req.query.s };
    if (!lienValide(parametresRepo.lireSecretLiens(), params)) {
      res.status(403).type('text/plain; charset=utf-8')
        .send("Lien invalide ou expiré. Ouvrez la pièce depuis la fiche du dossier dans CLAIRE.");
      return;
    }
    const cible = racine ? await resoudreCheminNas(racine, params.c) : null;
    if (!cible || !/\.pdf$/i.test(cible) || !(await existe(cible))) {
      res.status(404).type('text/plain; charset=utf-8')
        .send("Ce fichier n'est plus à cet endroit sur le NAS (déplacé ou renommé). Ouvrez le dossier dans CLAIRE.");
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(cible))}"`);
    fs.createReadStream(cible).pipe(res);
  }));
  return routeur;
}

module.exports = { creerRouteurNas, creerRouteurLienPiece };
