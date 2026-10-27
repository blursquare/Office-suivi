'use strict';
// Modèles d'emails (voir src/modelesEmails.js) : lecture de tous, écriture modèle par modèle.

const express = require('express');
const { motsNominatifs } = require('../carnetClaire');
const { lireModelesEmails, ecrireModelesEmails, assainirModelesEmails, RE_CLE_INTEGRE, MAX_PERSO, nouvelIdModele } = require('../modelesEmails');

// Pure : email, téléphone français, IBAN, suite de 6 chiffres et plus.
const RE_COORDONNEES_MODELE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:(?:\+|00)33|\b0)[1-9](?:[\s./-]?\d{2}){4}\b|\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b|\d(?:[\s.]?\d){5,}/;

function creerRouteurModelesEmails(parametresRepo, depot) {
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
    // Un modèle proposé par CLAIRE d'après un brouillon (étude 27/10) vaut pour toute l'étude : un nom de client ou de dossier resté dans
    // le texte le fait refuser (même règle que les consignes CLAIRE.md).
    // `origine` est déclarée par le poste : c'est un garde-fou contre une erreur de l'agent, pas un contrôle d'accès (audit 0.374.0, B3).
    if (b.origine === 'claire') {
      const texteModele = `${String(b.nom || '')}\n${String(b.sujet || '')}\n${String(b.corps || '')}`;
      // Coordonnées d'une personne (email, téléphone, IBAN, long numéro) : jamais dans un modèle de l'étude (audit 0.374.0, M1).
      // Un montant en euros (« 250 000 € ») n'est pas une coordonnée : retiré avant le contrôle des numéros.
      if (RE_COORDONNEES_MODELE.test(texteModele.replace(/\d[\d\s.]*(?:,\d+)?\s?(?:€|euros?\b)/gi, ''))) return res.status(400).json({ erreur: 'Le modèle vaut pour tous les dossiers : retirez les emails, téléphones, IBAN et numéros (variable ou « [à compléter] »).' });
      const mots = motsNominatifs(texteModele, depot && depot.tousActifs ? depot.tousActifs() : []);
      if (mots.length) return res.status(400).json({ erreur: `Le modèle vaut pour tous les dossiers : remplacez les noms de clients ou de dossiers par une variable ou « [à compléter] » (${mots.slice(0, 5).join(', ')}).` });
    }
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
