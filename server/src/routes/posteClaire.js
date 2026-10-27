// @ts-check
'use strict';
// L'ordinateur virtuel de CLAIRE (voir ../posteClaire.js) : lui confier un travail (poste d'un collaborateur), et, depuis SA fenêtre seulement,
// demander la validation de Bastien pour un geste. Le garde-fou (`garde`) refuse au poste de CLAIRE réglages, envois, Exchange, Yousign, Teams…

const express = require('express');
const crypto = require('node:crypto');
const { routeInterditePosteClaire, jetonDuCookie } = require('../posteClaire');
const { lirePropositions } = require('../routines/propositions');
const { deposerProposition } = require('../canaux/deposer');
const { noterVerification } = require('../verificationsTerrain');
const { creerFileTravaux } = require('../travauxClaire');
const { collaborateurDe } = require('./routines');

const ADMINISTRATEURS = ['Bastien ANGLUMENT', 'Sophie GOSSART'];

const VALIDEUR = 'Bastien ANGLUMENT';

/**
 * Middleware, monté AVANT toutes les routes : repère le poste de CLAIRE par son cookie secret et lui refuse ce qu'il n'a pas le droit de faire.
 * @param {any} poste
 */
function garde(poste) {
  return (req, res, next) => {
    const jeton = jetonDuCookie(req.headers.cookie || '');
    req.posteClaire = !!jeton && poste.estPosteClaire(jeton);
    if (req.posteClaire && routeInterditePosteClaire(req.method, req.originalUrl || req.url)) {
      res.status(403).json({ erreur: 'Le poste de CLAIRE n’a pas accès à cette fonction (réglages, envois, agenda, signature…).' });
      return;
    }
    next();
  };
}

/** @param {any} parametresRepo @param {any} poste @param {{ authActive?: boolean }} [config] */
function creerRouteurPosteClaire(parametresRepo, poste, config) {
  const routeur = express.Router();
  const ordinaire = (req, res) => { if (req.posteClaire) { res.status(403).json({ erreur: 'Réservé aux postes des collaborateurs.' }); return false; } return true; };
  const duPoste = (req, res) => { if (!req.posteClaire) { res.status(403).json({ erreur: 'Réservé au poste de CLAIRE.' }); return false; } return true; };

  routeur.get('/poste-claire/etat', (req, res) => {
    if (!ordinaire(req, res)) return;
    res.json(Object.assign({ disponible: config && config.authActive === true ? false : true }, poste.etat()));
  });

  // Les travaux confiés passent par une FILE traitée en arrière-plan (travauxClaire.js) : la réponse est immédiate, le compte rendu arrive
  // à la fin dans la liste des travaux et par une proposition « À savoir » au nom du demandeur.
  const file = creerFileTravaux({ repo: parametresRepo, poste, deposer: (p) => {
    const r = deposerProposition(parametresRepo, p);
    if (/^Travail terminé/.test(p.titre)) noterVerification(parametresRepo, 'poste-claire-fenetre', { detail: 'travail rendu' });
    return r;
  } });
  file.reprendre().catch(() => {});

  routeur.post('/poste-claire/travail', (req, res) => {
    if (!ordinaire(req, res)) return;
    if (config && config.authActive === true) { res.status(501).json({ erreur: 'Le poste de CLAIRE ne sait pas encore ouvrir un serveur protégé par mot de passe.' }); return; }
    const consigne = String(req.body && req.body.consigne || '').trim().slice(0, 4000);
    const demandeur = collaborateurDe(req.body && req.body.demandeur);
    if (!consigne) { res.status(400).json({ erreur: 'Consigne vide.' }); return; }
    if (!demandeur) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const r = file.confier(consigne, demandeur);
    res.status(202).json({ ok: true, id: r.travail.id, position: r.position });
  });

  routeur.get('/poste-claire/travaux', (req, res) => {
    if (!ordinaire(req, res)) return;
    const qui = collaborateurDe(req.query.utilisateur);
    if (!qui) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    res.json({ travaux: file.lister(qui, ADMINISTRATEURS.includes(qui)).slice(0, 30), poste: poste.etat() });
  });

  routeur.delete('/poste-claire/travaux/:id', (req, res) => {
    if (!ordinaire(req, res)) return;
    const qui = collaborateurDe(req.query.utilisateur);
    const r = file.annuler(req.params.id, qui, ADMINISTRATEURS.includes(qui));
    if (r.erreur) { res.status(r.erreur).json({ erreur: r.erreur === 409 ? 'Ce travail a déjà commencé.' : 'Travail introuvable ou pas le vôtre.' }); return; }
    res.json({ ok: true });
  });

  routeur.delete('/poste-claire', async (req, res) => {
    if (!ordinaire(req, res)) return;
    await poste.arreter();
    res.json({ ok: true });
  });

  // Depuis la fenêtre de CLAIRE : « je voudrais faire ceci, vous validez ? » — une proposition pour Bastien, avec sa carte dans le canal du
  // dossier (« Autoriser » / « Refuser »). Le poste attend la décision (GET ci-dessous) ; refusée ou sans réponse = elle n'agit pas.
  routeur.post('/poste-claire/demande', (req, res) => {
    if (!duPoste(req, res)) return;
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const lignes = String(corps.description || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lignes.length) { res.status(400).json({ erreur: 'Description vide.' }); return; }
    const id = 'val-' + crypto.randomBytes(9).toString('base64url');
    const r = deposerProposition(parametresRepo, {
      id, routine: 'poste-claire', responsable: VALIDEUR, dossierId: String(corps.dossierId || '').slice(0, 80), type: 'validation',
      titre: lignes[0].slice(0, 140), resume: lignes.slice(1).join(' · ').slice(0, 400), empreinte: 'poste-claire:' + id
    });
    if (!r.ok) { res.status(409).json({ erreur: r.silence ? 'Ce dossier est en silence.' : 'Demande non enregistrée.' }); return; }
    noterVerification(parametresRepo, 'poste-claire-validation', { detail: 'demande déposée' });
    res.json({ ok: true, id });
  });

  routeur.get('/poste-claire/demande/:id', (req, res) => {
    if (!duPoste(req, res)) return;
    const p = lirePropositions(parametresRepo).find((x) => x.id === req.params.id && x.routine === 'poste-claire');
    if (!p) { res.status(404).json({ erreur: 'Demande introuvable.' }); return; }
    res.json({ etat: p.etat });
  });

  return routeur;
}

module.exports = { garde, creerRouteurPosteClaire, VALIDEUR };
