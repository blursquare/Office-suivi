'use strict';

// Carnet des confrères (voir carnetConfreres.js). Comme les corrections apprises : pas de PUT
// global, chaque poste envoie le seul office qu'il vient d'ajouter ou de corriger, fusionné par
// identifiant — deux collaborateurs qui complètent le carnet en même temps ne s'écrasent pas.

const express = require('express');
const { assainirOffice, MAX_OFFICES, ID_OFFICE_ETUDE } = require('../carnetConfreres');
const { assainirContact, MAX_CONTACTS, THEMES_REPERTOIRE } = require('../repertoire');

function creerRouteurConfreres(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/confreres', (req, res) => {
    res.json({ offices: parametresRepo.lireCarnetConfreres() });
  });

  routeur.post('/confreres', (req, res) => {
    const office = assainirOffice(req.body && req.body.office);
    if (!office) return res.status(400).json({ erreur: 'Office invalide : un nom d’office ou un notaire est nécessaire.' });
    const carnet = parametresRepo.lireCarnetConfreres();
    const existe = carnet.some((o) => o.id === office.id);
    if (!existe && carnet.length >= MAX_OFFICES) return res.status(400).json({ erreur: 'Carnet plein.' });
    office.modifieLe = new Date().toISOString();
    const suite = existe ? carnet.map((o) => (o.id === office.id ? office : o)) : carnet.concat([office]);
    res.json({ offices: parametresRepo.ecrireCarnetConfreres(suite) });
  });

  routeur.delete('/confreres/:id', (req, res) => {
    if (req.params.id === ID_OFFICE_ETUDE) return res.status(400).json({ erreur: 'Notre office reste dans le carnet.' });
    const carnet = parametresRepo.lireCarnetConfreres();
    res.json({ offices: parametresRepo.ecrireCarnetConfreres(carnet.filter((o) => o.id !== req.params.id)) });
  });

  // Répertoire (repertoire.js) : mêmes règles que le carnet — un contact à la fois, fusionné par
  // identifiant.
  routeur.get('/repertoire', (req, res) => {
    res.json({ themes: THEMES_REPERTOIRE, contacts: parametresRepo.lireRepertoire() });
  });

  routeur.post('/repertoire', (req, res) => {
    const contact = assainirContact(req.body && req.body.contact);
    if (!contact) return res.status(400).json({ erreur: 'Contact invalide : un organisme ou une personne est nécessaire.' });
    const contacts = parametresRepo.lireRepertoire();
    const existe = contacts.some((c) => c.id === contact.id);
    if (!existe && contacts.length >= MAX_CONTACTS) return res.status(400).json({ erreur: 'Répertoire plein.' });
    contact.modifieLe = new Date().toISOString();
    const suite = existe ? contacts.map((c) => (c.id === contact.id ? contact : c)) : contacts.concat([contact]);
    res.json({ contacts: parametresRepo.ecrireRepertoire(suite) });
  });

  routeur.delete('/repertoire/:id', (req, res) => {
    const contacts = parametresRepo.lireRepertoire();
    res.json({ contacts: parametresRepo.ecrireRepertoire(contacts.filter((c) => c.id !== req.params.id)) });
  });

  return routeur;
}

module.exports = { creerRouteurConfreres };
