'use strict';

// Carnet des confrères (voir carnetConfreres.js). Comme les corrections apprises : pas de PUT
// global, chaque poste envoie le seul office qu'il vient d'ajouter ou de corriger, fusionné par
// identifiant — deux collaborateurs qui complètent le carnet en même temps ne s'écrasent pas.

const express = require('express');
const { assainirOffice, MAX_OFFICES } = require('../carnetConfreres');

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
    const carnet = parametresRepo.lireCarnetConfreres();
    res.json({ offices: parametresRepo.ecrireCarnetConfreres(carnet.filter((o) => o.id !== req.params.id)) });
  });

  return routeur;
}

module.exports = { creerRouteurConfreres };
