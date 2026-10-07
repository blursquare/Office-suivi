'use strict';

// Assistant « Demander à CLAIRE » (étude 06/10) : le poste envoie la phrase du collaborateur, le serveur la comprend
// (commun/assistant.js par mots-clés, IA locale Ollama à défaut — voir server/src/assistant.js) et rend l'intention, ses
// paramètres et le dossier désigné. Le geste lui-même est fait par le poste. Rien n'est journalisé ni gardé.

const express = require('express');
const { creerClientOllama } = require('../llm');
const { comprendreDemande, creerCacheDisponibilite } = require('../assistant');
const { noterVerification } = require('../verificationsTerrain');

const chaine = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const listeChaines = (v, n, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, n).map((x) => x.slice(0, max)) : []);

function routeAsync(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function creerRouteurAssistant(config, injections, parametresRepo) {
  const routeur = express.Router();
  const ollama = (injections && injections.ollama) || creerClientOllama(config);
  const disponibilite = creerCacheDisponibilite(ollama);

  routeur.get('/assistant/disponibilite', routeAsync(async (req, res) => {
    let statut;
    try { statut = await disponibilite(); } catch (err) { statut = { disponible: false, raison: err.message }; }
    res.json({ ia: !!statut.disponible, raison: statut.disponible ? '' : String(statut.raison || ''), modele: ollama.modele });
  }));

  routeur.post('/assistant/comprendre', routeAsync(async (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const texte = typeof corps.texte === 'string' ? corps.texte.trim() : '';
    if (!texte) { res.status(400).json({ erreur: 'Aucune demande (champ "texte" requis).' }); return; }
    const contexte = corps.contexte && typeof corps.contexte === 'object' ? corps.contexte : {};
    const dossiers = Array.isArray(corps.dossiers) ? corps.dossiers.filter((d) => d && typeof d.id === 'string').map((d) => ({
      id: d.id, nom: typeof d.nom === 'string' ? d.nom : '', archive: !!d.archive,
      parties: Array.isArray(d.parties) ? d.parties.filter((p) => p && typeof p.nom === 'string').slice(0, 20).map((p) => ({
        nom: p.nom.slice(0, 120), prenom: chaine(p.prenom, 80), nomUsage: chaine(p.nomUsage, 120), civilite: chaine(p.civilite, 12)
      })) : [],
      autres: listeChaines(d.autres, 10, 300),
      reference: chaine(d.reference, 40),
      contacts: listeChaines(d.contacts, 20, 200)
    })) : [];
    const resultat = await comprendreDemande({
      texte,
      contexte: {
        aujourdhui: typeof contexte.aujourdhui === 'string' ? contexte.aujourdhui : '',
        dossierId: typeof contexte.dossierId === 'string' ? contexte.dossierId : '',
        dossierLibelle: typeof contexte.dossierLibelle === 'string' ? contexte.dossierLibelle.slice(0, 120) : '',
        historique: Array.isArray(contexte.historique) ? contexte.historique.slice(-3) : []
      },
      dossiers
    }, ollama, { disponibilite });
    // Point terrain : l'IA locale a compris une phrase ambiguë (ou n'a pas pu) — jamais la phrase elle-même.
    if (resultat.source === 'ia') noterVerification(parametresRepo, 'assistant-ia-locale', { detail: `intention ${resultat.intention}` });
    else if (resultat.raisonIa) noterVerification(parametresRepo, 'assistant-ia-locale', { ok: false, message: resultat.raisonIa.slice(0, 120) });
    res.json(resultat);
  }));

  return routeur;
}

module.exports = { creerRouteurAssistant };
