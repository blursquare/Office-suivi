'use strict';

// Annuaire des notaires (voir carnetConfreres.js, fusionnerCarnetEtAnnuaire) : GET rend tous les offices de
// France corrigés par l'étude. Comme les corrections apprises : pas de PUT global, chaque poste envoie le
// seul office qu'il vient d'ajouter ou de corriger, fusionné par identifiant — deux collaborateurs qui
// corrigent en même temps ne s'écrasent pas. DELETE oublie une correction (ou retire un office saisi).

const express = require('express');
const zlib = require('node:zlib');
const { assainirOffice, MAX_OFFICES, ID_OFFICE_ETUDE, fusionnerCarnetEtAnnuaire } = require('../carnetConfreres');
const { assainirContact, MAX_CONTACTS, THEMES_REPERTOIRE } = require('../repertoire');
const annuaire = require('../annuaireNotaires');

function creerRouteurConfreres(parametresRepo) {
  const routeur = express.Router();

  // Annuaire des notaires unique (étude, 03/10) : tous les offices de France, corrigés par l'étude
  // (≈ 7 000 offices, 2 Mo) — compressé quand le navigateur l'accepte, en tâche de fond (zlib.gzip).
  const envoyerAnnuaire = (req, res, statut = 200) => {
    const corps = JSON.stringify({ offices: fusionnerCarnetEtAnnuaire(parametresRepo.lireCarnetConfreres(), annuaire.officesAnnuaire()) });
    res.status(statut).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) { res.end(corps); return; }
    zlib.gzip(corps, (err, gz) => {
      if (err) { res.end(corps); return; }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.end(gz);
    });
  };

  routeur.get('/confreres', (req, res) => envoyerAnnuaire(req, res));

  routeur.post('/confreres', (req, res) => {
    const office = assainirOffice(req.body && req.body.office);
    if (!office) return res.status(400).json({ erreur: 'Office invalide : un nom d’office ou un notaire est nécessaire.' });
    const carnet = parametresRepo.lireCarnetConfreres();
    const existe = carnet.some((o) => o.id === office.id);
    if (!existe && carnet.length >= MAX_OFFICES) return res.status(400).json({ erreur: 'Carnet plein.' });
    office.modifieLe = new Date().toISOString();
    const suite = existe ? carnet.map((o) => (o.id === office.id ? office : o)) : carnet.concat([office]);
    parametresRepo.ecrireCarnetConfreres(suite);
    envoyerAnnuaire(req, res);
  });

  routeur.delete('/confreres/:id', (req, res) => {
    if (req.params.id === ID_OFFICE_ETUDE) return res.status(400).json({ erreur: 'Notre office reste dans l’annuaire.' });
    // Office de l'annuaire corrigé : la correction est oubliée, l'office revient tel que relevé.
    const carnet = parametresRepo.lireCarnetConfreres();
    parametresRepo.ecrireCarnetConfreres(carnet.filter((o) => o.id !== req.params.id));
    envoyerAnnuaire(req, res);
  });

  // Annuaire des notaires de France (annuaireNotaires.js), en lecture seule : la liste des
  // départements, les offices d'un département, ou une recherche (50 au plus) — jamais tout d'un coup.
  routeur.get('/annuaire/departements', (req, res) => {
    res.json(Object.assign(annuaire.infosAnnuaire(), { departements: annuaire.departementsAnnuaire() }));
  });

  routeur.get('/annuaire/departement/:code', (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!/^(\d{2,3}|2[AB])$/.test(code)) return res.status(400).json({ erreur: 'Département inconnu.' });
    res.json({ code, nom: annuaire.DEPARTEMENTS[code] || code, offices: annuaire.officesDepartement(code) });
  });

  routeur.get('/annuaire/recherche', (req, res) => {
    const q = String((req.query && req.query.q) || '').slice(0, 120);
    res.json({ offices: annuaire.chercherAnnuaire(q, 50) });
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
