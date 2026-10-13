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
const { fichiersLesPlusRecents, listerPdfRecursif, listerSousDossiers, listerRecusNas, resoudreCheminRecu, resoudreCheminNas, rapprocherParNom, rapprochementParfait } = require('../nas');
const fsp = require('node:fs/promises');

// Envoie un fichier lu en flux ; une erreur de lecture (fichier verrouillé, dossier nommé « x.pdf », coupure SMB) répond 404 ou
// coupe la réponse — jamais une requête suspendue ni une exception non rattrapée (audit 13/10).
function envoyerFlux(res, cible) {
  const flux = fs.createReadStream(cible);
  flux.on('error', () => {
    if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.status(404).json({ erreur: 'Fichier illisible sur le NAS.' }); } else res.destroy();
  });
  flux.pipe(res);
}
const { faussesMinutes, trouverDossierFaussesMinutes, resoudreFichierFaussesMinutes } = require('../faussesMinutes');
const { copierDansDossierClient } = require('../scans');

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

function creerRouteurNas(config, depot) {
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

  // Document produit par « Demander à CLAIRE » (étude 13/10 : « lire les documents, les analyser et sortir des rendus… rangés sur
  // le NAS ») : un .docx rangé à la RACINE du dossier client sur un clic de l'utilisateur. Mêmes règles que les scans et les pièces
  // jointes (accord de l'étude du 30/09 et du 02/10) : dossier client confiné à la racine du NAS, COPIE sans jamais écraser
  // (« Nom (2).docx »), un seul type de fichier, taille bornée.
  routeur.post('/nas/deposer-document', routeAsync(async (req, res) => {
    const b = req.body || {};
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return; }
    const base64 = typeof b.contenu === 'string' ? b.contenu : '';
    if (!base64 || base64.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) { res.status(400).json({ erreur: 'Document vide ou trop lourd.' }); return; }
    const contenu = Buffer.from(base64, 'base64');
    // Un .docx est une archive ZIP : « PK » en tête, sinon ce n'est pas le document produit par CLAIRE.
    if (contenu.length < 4 || contenu[0] !== 0x50 || contenu[1] !== 0x4b) { res.status(400).json({ erreur: 'Ce n’est pas un document Word.' }); return; }
    // Le dossier du NAS est celui que la fiche de CLAIRE a relié, lu ici — jamais un chemin fourni par le poste (relecture 13/10).
    const d = depot && typeof b.dossierId === 'string' ? depot.trouverParId(b.dossierId) : null;
    if (!d || !d.nasDossier) { res.status(400).json({ erreur: 'Dossier inconnu ou non relié au NAS.' }); return; }
    // Noms réservés de Windows (« CON », « NUL »…) : jamais un nom de fichier tel quel.
    let nom = typeof b.nom === 'string' ? b.nom.slice(0, 120) : '';
    if (/^\s*(con|prn|aux|nul|com\d|lpt\d)\s*$/i.test(nom)) nom = 'Document ' + nom.trim();
    const r = await copierDansDossierClient({ nasRacine: config.nasRacine, dossierNas: String(d.nasDossier),
      rubriques: [], nomCible: nom || 'Document CLAIRE', extension: 'docx', contenu });
    if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
    res.json({ ok: true, chemin: r.chemin });
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
    // `recents=N` : seulement les N plus récemment modifiés, avec leur date (« Demander à CLAIRE », étude 12/10).
    // 300 au plus : « Demander à CLAIRE » liste tout le dossier client (étude 13/10).
    const recents = Math.min(300, Math.max(0, parseInt(String(req.query.recents || ''), 10) || 0));
    // Jamais sur tout le NAS (un `stat` par fichier) : un dossier client est exigé.
    if (recents && !String(req.query.dossier || '').trim()) { res.status(400).json({ erreur: 'Dossier client manquant.' }); return; }
    if (recents) { res.json({ base: path.relative(path.resolve(racine), cible), fichiers: await fichiersLesPlusRecents(cible, fichiers, recents) }); return; }
    res.json({ base: path.relative(path.resolve(racine), cible), fichiers });
  }));

  // Reçus comptables du jour : racine configurée, son « DOSSIER » et ceux des dossiers parents (voir
  // listerRecusNas). `depuis` (AAAA-MM-JJ) borne la liste : inutile de relire un an de reçus pour
  // un appel de fonds récent. `dossiers` dit où CLAIRE a cherché, affiché sur la fiche.
  routeur.get('/nas/recus', routeAsync(async (req, res) => {
    const racine = config.nasRacine;
    if (!racine || !(await existe(racine))) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré ou accessible depuis le serveur.' });
      return;
    }
    const depuis = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.depuis || '')) ? String(req.query.depuis) : null;
    res.json(await listerRecusNas(racine, depuis));
  }));

  routeur.get('/nas/fichier', routeAsync(async (req, res) => {
    const racine = config.nasRacine;
    if (!racine) {
      res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' });
      return;
    }
    // Un reçu comptable rangé hors de la racine configurée (« recus:<n>/<nom> », voir
    // listerRecusNas) : seul un PDF nommé « reçus » d'un des dossiers de reçus est servi.
    const demande = String(req.query.chemin || '');
    const cible = demande.startsWith('recus:')
      ? resoudreCheminRecu(racine, demande)
      : await resoudreCheminNas(racine, demande);
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
    envoyerFlux(res, cible);
  }));

  // Dossier « Fausses minutes » (étude, 03/10) : copies d'actes et attestations de vente à transmettre au client
  // dans les dossiers en participation. Liste (nom, taille, date) puis le PDF choisi, confiné à ce dossier.
  routeur.get('/nas/fausses-minutes', routeAsync(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await faussesMinutes(config));
  }));
  routeur.get('/nas/fausses-minutes/fichier', routeAsync(async (req, res) => {
    const dossier = await trouverDossierFaussesMinutes(config);
    const cible = dossier ? await resoudreFichierFaussesMinutes(dossier, req.query.chemin) : null;
    if (!cible) { res.status(400).json({ erreur: 'Chemin invalide (seuls les PDF du dossier des fausses minutes sont servis).' }); return; }
    if (!(await existe(cible))) { res.status(404).json({ erreur: 'Fichier introuvable dans les fausses minutes.' }); return; }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(cible))}"`);
    envoyerFlux(res, cible);
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
    envoyerFlux(res, cible);
  }));
  return routeur;
}

module.exports = { envoyerFlux, creerRouteurNas, creerRouteurLienPiece };
