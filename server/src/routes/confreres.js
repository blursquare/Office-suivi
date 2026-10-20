'use strict';

// Annuaire des notaires (voir carnetConfreres.js, fusionnerCarnetEtAnnuaire) : GET rend tous les offices de
// France corrigés par l'étude. Comme les corrections apprises : pas de PUT global, chaque poste envoie le
// seul office qu'il vient d'ajouter ou de corriger, fusionné par identifiant — deux collaborateurs qui
// corrigent en même temps ne s'écrasent pas. DELETE oublie une correction (ou retire un office saisi).

const express = require('express');
const zlib = require('node:zlib');
const { assainirOffice, MAX_OFFICES, ID_OFFICE_ETUDE, fusionnerCarnetEtAnnuaire } = require('../carnetConfreres');
const { assainirContact, MAX_CONTACTS, THEMES_REPERTOIRE } = require('../repertoire');
const { MAX_THEMES_REPERTOIRE } = require('../parametres/assainir');
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

  // Répertoire (repertoire.js) : mêmes règles que le carnet — un contact à la fois, fusionné par
  // identifiant.
  routeur.get('/repertoire', (req, res) => {
    res.json({ themes: THEMES_REPERTOIRE.concat(parametresRepo.lireThemesRepertoire().map((t) => Object.assign({ perso: true }, t))), contacts: parametresRepo.lireRepertoire() });
  });

  // Thèmes ajoutés par l'étude (étude 20/10) : créer, renommer, supprimer un thème vide. Ceux du relevé ne changent pas.
  const themesComplets = () => THEMES_REPERTOIRE.concat(parametresRepo.lireThemesRepertoire().map((t) => Object.assign({ perso: true }, t)));
  const libelleTheme = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '');
  routeur.post('/repertoire/themes', (req, res) => {
    const libelle = libelleTheme(req.body && req.body.libelle);
    if (!libelle) return res.status(400).json({ erreur: 'Donnez un nom au thème.' });
    const perso = parametresRepo.lireThemesRepertoire();
    const tous = themesComplets();
    const norm = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (tous.some((t) => norm(t.libelle) === norm(libelle))) return res.status(400).json({ erreur: 'Un thème porte déjà ce nom.' });
    if (perso.length >= MAX_THEMES_REPERTOIRE) return res.status(400).json({ erreur: 'Trop de thèmes ajoutés.' });
    const base = 'perso-' + (norm(libelle).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'theme');
    let cle = base.length >= 9 ? base : base + '-theme';
    for (let i = 2; tous.some((t) => t.cle === cle); i++) cle = base + '-' + i;
    parametresRepo.ecrireThemesRepertoire(perso.concat([{ cle, libelle }]));
    res.json({ cle, themes: themesComplets() });
  });

  routeur.put('/repertoire/themes/:cle', (req, res) => {
    const libelle = libelleTheme(req.body && req.body.libelle);
    const perso = parametresRepo.lireThemesRepertoire();
    if (!perso.some((t) => t.cle === req.params.cle)) return res.status(404).json({ erreur: 'Thème introuvable (seuls les thèmes ajoutés se renomment).' });
    if (!libelle) return res.status(400).json({ erreur: 'Donnez un nom au thème.' });
    parametresRepo.ecrireThemesRepertoire(perso.map((t) => (t.cle === req.params.cle ? { cle: t.cle, libelle } : t)));
    res.json({ themes: themesComplets() });
  });

  routeur.delete('/repertoire/themes/:cle', (req, res) => {
    const perso = parametresRepo.lireThemesRepertoire();
    if (!perso.some((t) => t.cle === req.params.cle)) return res.status(404).json({ erreur: 'Thème introuvable.' });
    if (parametresRepo.lireRepertoire().some((c) => c.theme === req.params.cle)) return res.status(400).json({ erreur: 'Ce thème contient encore des contacts : déplacez-les ou supprimez-les d’abord.' });
    parametresRepo.ecrireThemesRepertoire(perso.filter((t) => t.cle !== req.params.cle));
    res.json({ themes: themesComplets() });
  });

  routeur.post('/repertoire', (req, res) => {
    const contact = assainirContact(req.body && req.body.contact);
    // Un thème ajouté puis supprimé depuis un autre poste : le contact retombe dans « divers » plutôt que de disparaître.
    if (contact && /^perso-/.test(contact.theme) && !parametresRepo.lireThemesRepertoire().some((t) => t.cle === contact.theme)) contact.theme = 'divers';
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
