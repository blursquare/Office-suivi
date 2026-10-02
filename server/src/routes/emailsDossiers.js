'use strict';
// Emails des dossiers (voir src/emailsDossiers.js) : lecture par dossier, état des boîtes lues, lecture
// à la demande, emails préparés par un poste (confirmés par les « Éléments envoyés »), pièces jointes
// ouvertes ou rangées dans le dossier client du NAS.

const express = require('express');
const crypto = require('node:crypto');
const {
  lireEtat, ecrireEtat, assainirPrepare, executerTourEmailsDossiers, lirePieceJointe, boitesEnvoyes
} = require('../emailsDossiers');
const { copierDansDossierClient, extensionPieceJointe } = require('../scans');

function routeAsync(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function creerRouteurEmailsDossiers(parametresRepo, depot, options = {}) {
  const routeur = express.Router();
  const config = options.config || {};
  const injections = options.injections || {};
  const enCours = new Set();
  let tourEnCours = null;

  // Emails d'un dossier (le plus récent d'abord) et ses emails préparés.
  routeur.get('/emails-dossiers', (req, res) => {
    const id = String(req.query.dossierId || '');
    if (!id) { res.status(400).json({ erreur: 'Dossier manquant.' }); return; }
    const etat = lireEtat(parametresRepo);
    res.json({
      emails: etat.emails.filter((e) => e.dossierId === id).sort((a, b) => b.date.localeCompare(a.date)).map(({ itemId, ...e }) => e),
      prepares: etat.prepares.filter((p) => p.dossierId === id).sort((a, b) => b.prepareLe.localeCompare(a.prepareLe)),
      etat: { dernierTour: etat.etat.dernierTour, actif: etat.reglages.actif, envoyes: etat.etat.envoyes }
    });
  });

  // Pièces jointes reçues pas encore rangées (ni écartées, ni en échec) : la fenêtre CLAIRE les reconnaît
  // par leur nom et range celles des dossiers reliés au NAS.
  routeur.get('/emails-dossiers/pieces-jointes', (req, res) => {
    const etat = lireEtat(parametresRepo);
    const liste = [];
    for (const e of etat.emails) {
      if (e.sens !== 'recu') continue;
      for (const p of e.pj) if (!p.rangee && !p.ignoree && !p.echec) liste.push({ emailId: e.id, dossierId: e.dossierId, pjId: p.id, nom: p.nom, date: e.date });
    }
    res.json({ piecesJointes: liste.slice(-200) });
  });

  routeur.get('/emails-dossiers/etat', (req, res) => {
    const etat = lireEtat(parametresRepo);
    const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
    const rappels = parametresRepo.lireReglages ? parametresRepo.lireReglages() : {};
    const boites = boitesEnvoyes(reglages, rappels).map((b) => ({ ...b, ...(etat.etat.envoyes[b.adresse] || { statut: 'jamais' }) }));
    res.json({ reglages: etat.reglages, dernierTour: etat.etat.dernierTour, erreur: etat.etat.erreur, recus: etat.etat.recus, envoyes: boites,
      nombre: { recus: etat.emails.filter((e) => e.sens === 'recu').length, envoyes: etat.emails.filter((e) => e.sens === 'envoye').length } });
  });

  routeur.post('/emails-dossiers/reglages', (req, res) => {
    const etat = lireEtat(parametresRepo);
    etat.reglages.actif = !(req.body && req.body.actif === false);
    res.json({ reglages: ecrireEtat(parametresRepo, etat).reglages });
  });

  routeur.post('/emails-dossiers/lire', routeAsync(async (req, res) => {
    if (!tourEnCours) {
      tourEnCours = executerTourEmailsDossiers(depot, parametresRepo, { ...injections, config }, true).finally(() => { tourEnCours = null; });
    }
    res.json(await tourEnCours);
  }));

  // Un email préparé par un poste (.eml ou brouillon) : confirmé dès qu'il apparaît dans les envois.
  routeur.post('/emails-prepares', (req, res) => {
    const b = req.body || {};
    const prepare = assainirPrepare({ ...b, id: crypto.randomUUID(), prepareLe: new Date().toISOString(), envoyeLe: null, emailId: null });
    if (!prepare || !prepare.objet) { res.status(400).json({ erreur: 'Email préparé incomplet.' }); return; }
    const etat = lireEtat(parametresRepo);
    etat.prepares.push(prepare);
    ecrireEtat(parametresRepo, etat);
    res.status(201).json({ prepare });
  });

  // Ouvrir une pièce jointe (relue dans Exchange, jamais gardée par le serveur).
  routeur.get('/emails-dossiers/pj', routeAsync(async (req, res) => {
    const r = await lirePieceJointe(parametresRepo, String(req.query.emailId || ''), String(req.query.pjId || ''), injections);
    if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
    res.setHeader('Content-Type', r.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(r.nom)}`);
    res.send(r.contenu);
  }));

  // Ranger une pièce jointe dans le dossier client (une seule fois ; un échec n'est jamais retenté seul).
  routeur.post('/emails-dossiers/pj/ranger', routeAsync(async (req, res) => {
    const b = req.body || {};
    const emailId = String(b.emailId || ''), pjId = String(b.pjId || '');
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return; }
    const cle = emailId + '|' + pjId;
    if (enCours.has(cle)) { res.status(409).json({ erreur: 'Rangement déjà en cours.' }); return; }
    enCours.add(cle);
    try {
      const avant = lireEtat(parametresRepo);
      const e0 = avant.emails.find((e) => e.id === emailId);
      const p0 = e0 && e0.pj.find((p) => p.id === pjId);
      if (!p0) { res.status(404).json({ erreur: 'Pièce jointe inconnue.' }); return; }
      if (p0.rangee) { res.json({ ok: true, deja: true, chemin: p0.rangee.chemin }); return; }
      const extension = extensionPieceJointe(p0.nom);
      if (!extension) { res.status(400).json({ erreur: 'Type de fichier non rangé.' }); return; }
      const lu = await lirePieceJointe(parametresRepo, emailId, pjId, injections);
      let r = lu.erreur ? lu : await copierDansDossierClient({
        nasRacine: config.nasRacine, dossierNas: typeof b.dossierNas === 'string' ? b.dossierNas : '',
        rubriques: Array.isArray(b.rubriques) ? b.rubriques.filter((x) => typeof x === 'string').slice(0, 5) : [],
        nomCible: typeof b.nomCible === 'string' && b.nomCible.trim() ? b.nomCible : p0.nom, extension, contenu: lu.contenu
      });
      const etat = lireEtat(parametresRepo);
      const p = (etat.emails.find((e) => e.id === emailId) || { pj: [] }).pj.find((x) => x.id === pjId);
      if (p) {
        if (r.erreur) p.echec = r.erreur;
        else p.rangee = { chemin: r.chemin, le: new Date().toISOString(), pieceCle: String(b.pieceCle || ''), pieceLabel: String(b.pieceLabel || ''), auto: b.auto === true };
        ecrireEtat(parametresRepo, etat);
      }
      if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
      res.json({ ok: true, chemin: r.chemin, rubrique: r.rubrique });
    } finally { enCours.delete(cle); }
  }));

  // Écarter une pièce jointe (pas une pièce du dossier) ou effacer un échec pour retenter à la main.
  routeur.post('/emails-dossiers/pj/marquer', (req, res) => {
    const b = req.body || {};
    const etat = lireEtat(parametresRepo);
    const p = (etat.emails.find((e) => e.id === String(b.emailId || '')) || { pj: [] }).pj.find((x) => x.id === String(b.pjId || ''));
    if (!p) { res.status(404).json({ erreur: 'Pièce jointe inconnue.' }); return; }
    if (b.ignoree !== undefined) p.ignoree = b.ignoree === true;
    if (b.retenter === true) p.echec = null;
    ecrireEtat(parametresRepo, etat);
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = { creerRouteurEmailsDossiers };
