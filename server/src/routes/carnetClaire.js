// @ts-check
'use strict';
// Carnet de consignes de CLAIRE — « CLAIRE.md » (voir carnetClaire.js) : lu et modifié par Réglages › Consignes de CLAIRE, une
// consigne ajoutée par « Corriger » sous une réponse de « Demander à CLAIRE ». Un texte qui cite un client ou un dossier est refusé.

const express = require('express');
const { CLE_CARNET, lireCarnet, ecrireCarnet, ajouterConsigne, motsNominatifs, MAX_CARNET, MAX_CONSIGNE } = require('../carnetClaire');

const PRENOMS = ['Bastien', 'Julie', 'Jérémy', 'Sophie'];

/** L'auteur annoncé par le poste : un prénom de l'étude, sinon rien. @param {any} v */
function auteurDuCorps(v) {
  const p = String(v || '').trim().split(/\s+/)[0] || '';
  return PRENOMS.find((x) => x.toLowerCase() === p.toLowerCase()) || '';
}

/** @param {any} parametresRepo @param {any} depot */
function creerRouteurCarnetClaire(parametresRepo, depot) {
  const routeur = express.Router();
  const refusNominatif = (texte) => {
    const mots = motsNominatifs(texte, depot && depot.tousActifs ? depot.tousActifs() : []);
    return mots.length ? `Le carnet vaut pour toute l'étude : retirez les noms de clients ou de dossiers (${mots.slice(0, 5).join(', ')}).` : '';
  };
  const vue = () => { const c = lireCarnet(parametresRepo); return { texte: c.texte, maj: c.maj, auteur: c.auteur, initial: c.initial, versions: c.versions.length }; };

  routeur.get('/carnet-claire', (req, res) => { res.json(vue()); });

  routeur.put('/carnet-claire', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof corps.texte !== 'string' || !corps.texte.trim()) { res.status(400).json({ erreur: 'Texte du carnet manquant.' }); return; }
    if (corps.texte.length > MAX_CARNET) { res.status(400).json({ erreur: `Carnet trop long (${MAX_CARNET} caractères au plus).` }); return; }
    const refus = refusNominatif(corps.texte);
    if (refus) { res.status(400).json({ erreur: refus }); return; }
    ecrireCarnet(parametresRepo, corps.texte, auteurDuCorps(corps.auteur));
    res.json({ ok: true, ...vue() });
  });

  routeur.post('/carnet-claire/consigne', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const consigne = typeof corps.consigne === 'string' ? corps.consigne.replace(/\s+/g, ' ').trim() : '';
    if (!consigne) { res.status(400).json({ erreur: 'Consigne vide.' }); return; }
    if (consigne.length > MAX_CONSIGNE) { res.status(400).json({ erreur: `Consigne trop longue (${MAX_CONSIGNE} caractères au plus).` }); return; }
    const refus = refusNominatif(consigne);
    if (refus) { res.status(400).json({ erreur: refus }); return; }
    const auteur = auteurDuCorps(corps.auteur);
    const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const texte = ajouterConsigne(lireCarnet(parametresRepo).texte, consigne, auteur, jour);
    if (texte.length > MAX_CARNET) { res.status(400).json({ erreur: 'Carnet plein : faites de la place dans Réglages › Consignes de CLAIRE.' }); return; }
    ecrireCarnet(parametresRepo, texte, auteur);
    res.json({ ok: true, ...vue() });
  });

  // Revenir à la version d'avant (la version courante devient à son tour la plus récente des versions gardées).
  routeur.post('/carnet-claire/version-precedente', (req, res) => {
    const c = lireCarnet(parametresRepo);
    if (!c.versions.length) { res.status(400).json({ erreur: 'Aucune version précédente.' }); return; }
    const avant = c.versions[0];
    // Une version acceptée avant la création d'un dossier peut citer ce client : contrôlée comme une nouvelle saisie.
    const refus = refusNominatif(avant.texte);
    if (refus) { res.status(400).json({ erreur: refus }); return; }
    const reste = c.versions.slice(1);
    parametresRepo.ecrireJsonBrut(CLE_CARNET, { texte: avant.texte, maj: new Date().toISOString(), auteur: auteurDuCorps((req.body || {}).auteur),
      versions: [{ texte: c.texte, maj: c.maj, auteur: c.auteur }, ...reste].slice(0, 20) });
    res.json({ ok: true, ...vue() });
  });

  routeur.get('/carnet-claire/fichier', (req, res) => {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="CLAIRE.md"');
    res.send(lireCarnet(parametresRepo).texte);
  });

  return routeur;
}

module.exports = { creerRouteurCarnetClaire };
