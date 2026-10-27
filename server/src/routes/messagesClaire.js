// @ts-check
'use strict';
// Les messages de CLAIRE à chaque collaborateur (../messagesClaire.js) : les lire (profil de CLAIRE, pastille), les marquer lus, et en
// déposer un pour SOI depuis le poste (arrivée sur un dossier dans Authentic — client/127). Jamais pour un autre : ce que CLAIRE dit à un
// collègue passe par le serveur (notifications aiguillées) ou par une conversation privée.

const express = require('express');
const { messagesDe, marquerLus, deposerMessageClaire } = require('../messagesClaire');
const { collaborateurDe } = require('./routines');

/** @param {any} parametresRepo */
function creerRouteurMessagesClaire(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/claire-messages', (req, res) => {
    const qui = collaborateurDe(req.query.utilisateur);
    if (!qui) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const liste = messagesDe(parametresRepo, qui).slice().reverse().slice(0, 60);
    res.json({ messages: liste, nonLus: liste.filter((m) => !m.lu).length });
  });

  routeur.post('/claire-messages/lus', (req, res) => {
    const qui = collaborateurDe(req.body && req.body.utilisateur);
    if (!qui) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    res.json({ ok: true, lus: marquerLus(parametresRepo, qui) });
  });

  // Pour soi seulement (le poste dit qui il est, comme partout dans CLAIRE) : texte court, sorte et clé fournies.
  routeur.post('/claire-messages', (req, res) => {
    const c = req.body && typeof req.body === 'object' ? req.body : {};
    const qui = collaborateurDe(c.utilisateur);
    if (!qui) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const texte = String(c.texte || '').slice(0, 600);
    if (!texte.trim()) { res.status(400).json({ erreur: 'Message vide.' }); return; }
    const r = deposerMessageClaire(parametresRepo, qui, { texte, cle: String(c.cle || '').slice(0, 160), sorte: String(c.sorte || '').slice(0, 30), dossierId: String(c.dossierId || '').slice(0, 80) });
    res.json({ ok: true, effet: r.effet, id: r.message ? r.message.id : '' });
  });

  return routeur;
}

module.exports = { creerRouteurMessagesClaire };
