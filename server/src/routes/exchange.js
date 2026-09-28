// Connexion à l'agenda Outlook de l'office par EWS/NTLM (voir server/src/exchange/ews.js).
// Microsoft Graph n'atteint pas ces boîtes (hébergées chez Fichorga / Authentic Connect, hors de
// Microsoft 365), d'où ce chemin — la même porte qu'Outlook.
//
// Trois usages :
//   - GET/PUT /exchange/reglages : l'étude enregistre l'URL EWS, son adresse et son mot de passe de
//     messagerie, plus un interrupteur d'activation. Le mot de passe ne ressort JAMAIS de la base
//     (reglagesExchangePublics le remplace par un booléen) — même discipline que le mot de passe
//     SMTP et les clés API.
//   - POST /exchange/test : vérifie que les identifiants passent (lecture seule de l'agenda).
//   - POST /exchange/rendez-vous : crée un rendez-vous de signature dans l'agenda.
//
// RÈGLE reprise de ews.js et à ne pas assouplir : un seul essai par appel, aucun réessai automatique
// (plusieurs échecs verrouillent le compte de messagerie). Le mot de passe n'est jamais renvoyé au
// navigateur ni recopié dans un message d'erreur.
'use strict';

const express = require('express');
const { testerConnexionExchange, creerRendezVousExchange } = require('../exchange/ews');
const { URL_EWS_DEFAUT } = require('../parametresRepo');

function reglagesExchangePublics(reglages) {
  const { motDePasse, ...reste } = reglages;
  return { ...reste, motDePasseEnregistre: !!motDePasse };
}

function creerRouteurExchange(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/exchange/reglages', (req, res) => {
    res.json(reglagesExchangePublics(parametresRepo.lireReglagesExchange()));
  });

  routeur.put('/exchange/reglages', (req, res) => {
    res.json(reglagesExchangePublics(parametresRepo.ecrireReglagesExchange(req.body || {})));
  });

  // Test de connexion (lecture seule). Utilise les identifiants du formulaire s'ils sont fournis,
  // sinon ceux déjà enregistrés — ce qui permet de retester une configuration stockée sans avoir à
  // retaper le mot de passe.
  routeur.post('/exchange/test', async (req, res) => {
    const corps = req.body || {};
    const stockes = parametresRepo.lireReglagesExchange();
    const email = String(corps.email || '').trim() || stockes.email;
    const motDePasse = corps.motDePasse ? String(corps.motDePasse) : stockes.motDePasse;
    const url = String(corps.url || '').trim() || stockes.url || URL_EWS_DEFAUT;
    if (!/^https:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, message: "L'adresse du serveur doit commencer par https://." });
    }
    if (!email || !motDePasse) {
      return res.status(400).json({ ok: false, message: 'Email et mot de passe requis (à saisir, ou à enregistrer d\'abord).' });
    }
    // testerConnexionExchange ne rejette jamais : il résout toujours {ok, message}.
    const resultat = await testerConnexionExchange({ url, email, motDePasse });
    // On ne renvoie que ok + message : jamais l'email ni le mot de passe.
    res.json({ ok: !!resultat.ok, message: resultat.message });
  });

  // Crée un rendez-vous dans l'agenda, à partir des identifiants ENREGISTRÉS (jamais d'un mot de
  // passe transitant dans cette requête). Le client fournit l'objet, la date, l'heure, la durée, le
  // lieu et un corps de note.
  routeur.post('/exchange/rendez-vous', async (req, res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      return res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
    }
    if (!reglages.email || !reglages.motDePasse) {
      return res.status(400).json({ ok: false, message: "Identifiants de messagerie manquants dans les Réglages." });
    }
    const b = req.body || {};
    const dateStr = String(b.date || '').trim();
    const heureStr = String(b.heure || '').trim();
    const sujet = String(b.sujet || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ ok: false, message: 'Date du rendez-vous invalide.' });
    }
    if (!/^\d{2}:\d{2}$/.test(heureStr)) {
      return res.status(400).json({ ok: false, message: 'Heure du rendez-vous invalide.' });
    }
    if (!sujet) {
      return res.status(400).json({ ok: false, message: 'Objet du rendez-vous manquant.' });
    }
    const dureeBrute = Number.parseInt(b.dureeMinutes, 10);
    const dureeMinutes = Number.isInteger(dureeBrute) && dureeBrute > 0 ? Math.min(600, dureeBrute) : 60;
    const resultat = await creerRendezVousExchange({
      url: reglages.url,
      email: reglages.email,
      motDePasse: reglages.motDePasse,
      rendezVous: {
        sujet,
        dateStr,
        heureStr,
        dureeMinutes,
        lieu: String(b.lieu || '').trim(),
        corps: String(b.corps || '').trim()
      }
    });
    res.json({ ok: !!resultat.ok, message: resultat.message });
  });

  return routeur;
}

module.exports = { creerRouteurExchange, reglagesExchangePublics, URL_EWS_DEFAUT };
