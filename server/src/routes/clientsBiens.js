'use strict';
// Clients et biens (étude 16/10) : la base calculée depuis les dossiers (server/src/clientsBiens.js), la recherche, une fiche, les fiches
// d'un dossier ; les seuls écrits sont les choix de l'étude — « même personne / personnes distinctes » et les corrections à la main (clé
// `clients-biens`). Rien n'est journalisé (noms des clients).

const express = require('express');
const { construireBase, chercherClientsBiens, fichesDuDossier, assainirReglagesClientsBiens, valeurCorrection, CHAMPS_PERSONNE } = require('../clientsBiens');

const CLE = 'clients-biens';
const RE_ID = /^[pb][0-9a-f]{12}$/;
const RE_OCC = /^[A-Za-z0-9_-]{1,80}:[a-z0-9 |]{1,200}$/;

/** @param {any} depot @param {any} parametresRepo */
function creerRouteurClientsBiens(depot, parametresRepo) {
  const routeur = express.Router();
  const reglages = () => assainirReglagesClientsBiens(parametresRepo.lireJsonBrut(CLE, {}));
  // Tous les dossiers, archivés compris (un client d'un ancien dossier se retrouve), jamais les supprimés.
  const base = () => construireBase(depot.tousActifs(), reglages());

  routeur.get('/clients-biens', (req, res) => {
    res.json(chercherClientsBiens(base(), String(req.query.q || '').slice(0, 80)));
  });

  routeur.get('/clients-biens/personne/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant invalide.' }); return; }
    const b = base();
    const p = b.personnes.find((x) => x.id === id);
    if (!p) { res.status(404).json({ erreur: 'Fiche introuvable (elle a pu être réunie à une autre : relancez la recherche).' }); return; }
    res.json({ personne: p });
  });

  routeur.get('/clients-biens/bien/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant invalide.' }); return; }
    const bien = base().biens.find((x) => x.id === id);
    if (!bien) { res.status(404).json({ erreur: 'Fiche introuvable.' }); return; }
    res.json({ bien });
  });

  routeur.get('/clients-biens/dossier/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) { res.status(400).json({ erreur: 'Identifiant invalide.' }); return; }
    res.json(fichesDuDossier(base(), id));
  });

  // « Même personne » / « Personnes distinctes » pour deux occurrences proposées (homonymes sans date de naissance).
  routeur.post('/clients-biens/liaison', (req, res) => {
    const b = req.body || {};
    const occA = String(b.occA || ''); const occB = String(b.occB || '');
    if (!RE_OCC.test(occA) || !RE_OCC.test(occB) || occA === occB || !['meme', 'distinct', ''].includes(b.decision)) {
      res.status(400).json({ erreur: 'Liaison invalide.' }); return;
    }
    const r = reglages();
    delete r.liaisons[`${occB}#${occA}`];
    if (b.decision) r.liaisons[`${occA}#${occB}`] = b.decision; else delete r.liaisons[`${occA}#${occB}`];
    parametresRepo.ecrireJsonBrut(CLE, assainirReglagesClientsBiens(r));
    res.json({ ok: true });
  });

  // Correction à la main d'un champ (Authentic fait foi : si Authentic change ensuite, le changement est proposé sur la fiche).
  routeur.put('/clients-biens/correction', (req, res) => {
    const b = req.body || {};
    const occ = String(b.occ || '');
    if (!RE_OCC.test(occ) || !CHAMPS_PERSONNE.includes(b.champ)) { res.status(400).json({ erreur: 'Correction invalide.' }); return; }
    const p = construireBase(depot.tousActifs(), reglages()).personnes.find((x) => x.occurrences.includes(occ));
    if (!p) { res.status(404).json({ erreur: 'Fiche introuvable.' }); return; }
    const r = reglages();
    r.corrections = r.corrections.filter((c) => !(p.occurrences.includes(c.occ) && c.champ === b.champ));
    // « Revenir à Authentic » : la correction est retirée.
    if (!b.retirer) r.corrections.push({ occ, champ: b.champ, valeur: valeurCorrection(b.champ, b.valeur), authentic: p.authentic[b.champ], le: new Date().toISOString() });
    parametresRepo.ecrireJsonBrut(CLE, assainirReglagesClientsBiens(r));
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = { creerRouteurClientsBiens };
