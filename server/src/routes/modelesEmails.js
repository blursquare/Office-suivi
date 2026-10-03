'use strict';
// Modèles d'emails (voir src/modelesEmails.js) : lecture de tous, écriture modèle par modèle.

const express = require('express');
const { lireModelesEmails, ecrireModelesEmails, assainirModelesEmails, RE_CLE_INTEGRE, MAX_PERSO, nouvelIdModele } = require('../modelesEmails');

function creerRouteurModelesEmails(parametresRepo) {
  const routeur = express.Router();
  const corpsValide = (b) => b && typeof b.corps === 'string' && b.corps.trim();

  routeur.get('/modeles-emails', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(lireModelesEmails(parametresRepo));
  });

  // Version de l'étude d'un modèle d'origine.
  routeur.put('/modeles-emails/integres/:cle', (req, res) => {
    const cle = String(req.params.cle || '');
    if (!RE_CLE_INTEGRE.test(cle)) return res.status(400).json({ erreur: 'Modèle inconnu.' });
    if (!corpsValide(req.body)) return res.status(400).json({ erreur: 'Le texte du modèle est vide.' });
    const etat = lireModelesEmails(parametresRepo);
    etat.modifies[cle] = { sujet: req.body.sujet, corps: req.body.corps, modifieLe: new Date().toISOString(), par: req.body.par };
    res.json(ecrireModelesEmails(parametresRepo, etat));
  });

  // Revenir au texte d'origine.
  routeur.delete('/modeles-emails/integres/:cle', (req, res) => {
    const etat = lireModelesEmails(parametresRepo);
    delete etat.modifies[String(req.params.cle || '')];
    res.json(ecrireModelesEmails(parametresRepo, etat));
  });

  routeur.post('/modeles-emails/perso', (req, res) => {
    const b = req.body || {};
    if (!String(b.nom || '').trim()) return res.status(400).json({ erreur: 'Donnez un nom au modèle.' });
    if (!corpsValide(b)) return res.status(400).json({ erreur: 'Le texte du modèle est vide.' });
    const etat = lireModelesEmails(parametresRepo);
    if (etat.perso.length >= MAX_PERSO) return res.status(400).json({ erreur: 'Trop de modèles.' });
    const id = nouvelIdModele();
    etat.perso.push({ id, nom: b.nom, sujet: b.sujet, corps: b.corps, creeLe: new Date().toISOString(), par: b.par });
    res.status(201).json({ id, ...ecrireModelesEmails(parametresRepo, etat) });
  });

  routeur.put('/modeles-emails/perso/:id', (req, res) => {
    const b = req.body || {};
    const etat = lireModelesEmails(parametresRepo);
    const m = etat.perso.find((x) => x.id === String(req.params.id || ''));
    if (!m) return res.status(404).json({ erreur: 'Modèle introuvable.' });
    if (!String(b.nom || '').trim()) return res.status(400).json({ erreur: 'Donnez un nom au modèle.' });
    if (!corpsValide(b)) return res.status(400).json({ erreur: 'Le texte du modèle est vide.' });
    Object.assign(m, { nom: b.nom, sujet: b.sujet, corps: b.corps, modifieLe: new Date().toISOString(), par: b.par });
    res.json(ecrireModelesEmails(parametresRepo, etat));
  });

  routeur.delete('/modeles-emails/perso/:id', (req, res) => {
    const etat = lireModelesEmails(parametresRepo);
    const reste = etat.perso.filter((x) => x.id !== String(req.params.id || ''));
    if (reste.length === etat.perso.length) return res.status(404).json({ erreur: 'Modèle introuvable.' });
    res.json(ecrireModelesEmails(parametresRepo, assainirModelesEmails({ ...etat, perso: reste })));
  });

  return routeur;
}

module.exports = { creerRouteurModelesEmails };
