'use strict';

// « Mes rappels » du tableau de bord (voir parametresRepo, CLE_RAPPELS_PERSO). Pas de PUT global :
// chaque poste envoie le seul rappel qu'il crée, coche ou supprime — deux collaborateurs qui
// travaillent en même temps ne s'écrasent pas l'un l'autre. La liste est lue par collaborateur
// (`?auteur=`) : chacun ne voit que les siens.

const express = require('express');
const { assainirRappelPerso } = require('../parametresRepo');

function creerRouteurRappelsPerso(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/rappels-perso', (req, res) => {
    const auteur = typeof req.query.auteur === 'string' ? req.query.auteur : '';
    const tous = parametresRepo.lireRappelsPerso();
    res.json({ rappels: auteur ? tous.filter((r) => r.auteur === auteur) : [] });
  });

  routeur.post('/rappels-perso', (req, res) => {
    const rappel = assainirRappelPerso(req.body && req.body.rappel);
    if (!rappel) return res.status(400).json({ erreur: 'Rappel invalide : un texte et un collaborateur sont requis.' });
    const tous = parametresRepo.lireRappelsPerso().filter((r) => r.id !== rappel.id);
    tous.push(rappel);
    parametresRepo.ecrireRappelsPerso(tous);
    res.json({ rappel });
  });

  routeur.delete('/rappels-perso/:id', (req, res) => {
    const tous = parametresRepo.lireRappelsPerso();
    const reste = tous.filter((r) => r.id !== req.params.id);
    if (reste.length === tous.length) return res.status(404).json({ erreur: 'Rappel introuvable.' });
    parametresRepo.ecrireRappelsPerso(reste);
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = { creerRouteurRappelsPerso };
