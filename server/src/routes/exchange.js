// Route de TEST de connexion à l'Exchange de l'office (voir server/src/exchange/ews.js).
// Ne stocke rien : les identifiants ne servent qu'à un unique appel EWS en lecture seule, puis sont
// oubliés. Objectif : vérifier au bureau que CLAIRE arrive à parler à l'Exchange avant de construire
// la création de rendez-vous / les brouillons.
'use strict';

const express = require('express');
const { testerConnexionExchange } = require('../exchange/ews');

// URL EWS par défaut (Exchange de Fichorga / Authentic Connect). Surchargeable depuis le formulaire
// au cas où le serveur changerait, mais pré-remplie pour l'étude.
const URL_EWS_DEFAUT = 'https://mail.authentic-connect.fr/EWS/Exchange.asmx';

function creerRouteurExchange() {
  const routeur = express.Router();

  routeur.post('/exchange/test', async (req, res) => {
    const corps = req.body || {};
    const email = String(corps.email || '').trim();
    const motDePasse = String(corps.motDePasse || '');
    let url = String(corps.url || '').trim() || URL_EWS_DEFAUT;
    if (!/^https:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, message: "L'adresse du serveur doit commencer par https://." });
    }
    if (!email || !motDePasse) {
      return res.status(400).json({ ok: false, message: 'Email et mot de passe requis.' });
    }
    // testerConnexionExchange ne rejette jamais : il résout toujours {ok, message}.
    const resultat = await testerConnexionExchange({ url, email, motDePasse });
    // On ne renvoie que ok + message : jamais l'email ni le mot de passe.
    res.json({ ok: !!resultat.ok, message: resultat.message });
  });

  return routeur;
}

module.exports = { creerRouteurExchange, URL_EWS_DEFAUT };
