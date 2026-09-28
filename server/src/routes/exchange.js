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
const { testerConnexionExchange, creerRendezVousExchange, creerBrouillonExchange } = require('../exchange/ews');
const { URL_EWS_DEFAUT } = require('../parametresRepo');

// Garde-fou de taille : un brouillon avec pièce(s) jointe(s) reste modeste (un .docx d'appel de
// fonds ou un PDF de questionnaire font quelques centaines de Ko). Plafond large mais borné, pour
// ne pas laisser passer un envoi énorme vers Exchange.
const MAX_PIECES = 5;
const MAX_BASE64_TOTAL = 15 * 1024 * 1024; // ~11 Mo de fichier une fois décodé
function adresseValide(a) {
  return typeof a === 'string' && /^[^\s@]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(a.trim());
}

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

  // Crée un BROUILLON d'email dans Outlook, avec pièce(s) jointe(s) — ce qu'un mailto: ne sait pas
  // faire. Le brouillon est enregistré dans le dossier « Brouillons » (jamais envoyé) : l'étude le
  // relit et l'envoie elle-même. Identifiants pris dans les Réglages, jamais dans la requête.
  routeur.post('/exchange/brouillon', async (req, res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      return res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
    }
    if (!reglages.email || !reglages.motDePasse) {
      return res.status(400).json({ ok: false, message: "Identifiants de messagerie manquants dans les Réglages." });
    }
    const b = req.body || {};
    const destinataire = String(b.destinataire || '').trim();
    const sujet = String(b.sujet || '').trim();
    if (!adresseValide(destinataire)) {
      return res.status(400).json({ ok: false, message: 'Adresse du destinataire invalide.' });
    }
    if (!sujet) {
      return res.status(400).json({ ok: false, message: "Objet de l'email manquant." });
    }
    const piecesBrutes = Array.isArray(b.pieces) ? b.pieces : [];
    if (piecesBrutes.length > MAX_PIECES) {
      return res.status(400).json({ ok: false, message: 'Trop de pièces jointes.' });
    }
    let total = 0;
    const pieces = [];
    for (const p of piecesBrutes) {
      const contenuBase64 = (p && typeof p.contenuBase64 === 'string') ? p.contenuBase64.replace(/\s/g, '') : '';
      if (!contenuBase64) continue;
      total += contenuBase64.length;
      if (total > MAX_BASE64_TOTAL) {
        return res.status(400).json({ ok: false, message: 'Pièces jointes trop volumineuses.' });
      }
      pieces.push({
        nom: String(p.nom || 'piece-jointe').slice(0, 200),
        type: p.type ? String(p.type).slice(0, 100) : '',
        contenuBase64
      });
    }
    const resultat = await creerBrouillonExchange({
      url: reglages.url,
      email: reglages.email,
      motDePasse: reglages.motDePasse,
      brouillon: { destinataire, sujet, corps: String(b.corps || ''), pieces }
    });
    res.json({ ok: !!resultat.ok, message: resultat.message });
  });

  return routeur;
}

module.exports = { creerRouteurExchange, reglagesExchangePublics, URL_EWS_DEFAUT };
