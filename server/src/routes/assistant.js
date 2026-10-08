'use strict';

// Assistant « Demander à CLAIRE » (étude 06/10) : le poste envoie la phrase du collaborateur, le serveur la comprend
// (commun/assistant.js par mots-clés, IA locale Ollama à défaut — voir server/src/assistant.js) et rend l'intention, ses
// paramètres et le dossier désigné. Le geste lui-même est fait par le poste. Rien n'est journalisé ni gardé.

const express = require('express');
const { creerClientOllama } = require('../llm');
const { comprendreDemande, creerCacheDisponibilite } = require('../assistant');
const { CLE_REGLAGES, MOTEURS, REVISION_REGLAGES_ASSISTANT, assainirReglagesAssistant, creerClientMistralAssistant, lireUsageAssistant, MODELE_ASSISTANT_MISTRAL } = require('../assistantMistral');
const { creerClientClaudeAssistant, MODELE_ASSISTANT_CLAUDE } = require('../assistantClaude');
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

  // Moteur de l'assistant (étude 07/10 : essai de Mistral) : Mistral quand il est choisi ET qu'une clé existe (celle de la
  // Relecture d'actes), sinon l'IA locale. La clé ne sort jamais d'ici.
  const lireReglages = () => {
    const brut = parametresRepo.lireJsonBrut(CLE_REGLAGES, {}) || {};
    // Réglage d'avant le 08/10 (ou aucun) : Claude, qui lit toutes les demandes (étude 08/10).
    if (brut.revision !== REVISION_REGLAGES_ASSISTANT) return { moteur: 'claude', toutesDemandes: true };
    return assainirReglagesAssistant(brut);
  };
  function cleClaude() {
    const r = parametresRepo.lireReglagesClaude ? parametresRepo.lireReglagesClaude() : {};
    return (r && r.cleApi) || process.env.ANTHROPIC_API_KEY || '';
  }
  function cleMistral() {
    const r = parametresRepo.lireReglagesClaude ? parametresRepo.lireReglagesClaude() : {};
    return { cle: (r && r.cleMistral) || process.env.MISTRAL_API_KEY || '', region: (r && r.regionMistral) || 'eu' };
  }
  function moteurCourant() {
    const reglages = lireReglages();
    // Claude choisi sans clé : Mistral s'il a la sienne, sinon l'IA locale.
    if (reglages.moteur === 'claude') {
      const cle = cleClaude();
      if (cle) {
        const client = creerClientClaudeAssistant({ cle, parametresRepo, client: injections && injections.clientClaude });
        return { client, pseudonymiser: true, disponibilite: () => client.verifierDisponibilite(), moteur: 'claude', choisi: 'claude' };
      }
    }
    if (reglages.moteur === 'mistral' || reglages.moteur === 'claude') {
      const { cle, region } = cleMistral();
      if (cle) {
        const client = creerClientMistralAssistant({ cle, region, fetchFn: injections && injections.fetchMistral, parametresRepo });
        return { client, pseudonymiser: true, disponibilite: () => client.verifierDisponibilite(), moteur: 'mistral', choisi: reglages.moteur };
      }
    }
    return { client: ollama, pseudonymiser: false, disponibilite, moteur: 'locale', choisi: reglages.moteur };
  }

  routeur.get('/assistant/reglages', (req, res) => {
    const reglages = lireReglages();
    res.json({ ...reglages, moteurs: MOTEURS, cleMistralEnregistree: !!cleMistral().cle, cleClaudeEnregistree: !!cleClaude(),
      modeleMistral: MODELE_ASSISTANT_MISTRAL, modeleClaude: MODELE_ASSISTANT_CLAUDE,
      usage: lireUsageAssistant(parametresRepo, undefined, reglages.moteur === 'claude' ? 'claude' : 'mistral') });
  });

  routeur.put('/assistant/reglages', (req, res) => {
    const propre = assainirReglagesAssistant(req.body);
    parametresRepo.ecrireJsonBrut(CLE_REGLAGES, { ...propre, revision: REVISION_REGLAGES_ASSISTANT });
    res.json({ ...propre, cleMistralEnregistree: !!cleMistral().cle, cleClaudeEnregistree: !!cleClaude() });
  });

  routeur.get('/assistant/disponibilite', routeAsync(async (req, res) => {
    const m = moteurCourant();
    let statut;
    try { statut = await m.disponibilite(); } catch (err) { statut = { disponible: false, raison: err.message }; }
    const raisonChoix = m.choisi === 'claude' && m.moteur !== 'claude' ? `Aucune clé Claude enregistrée : ${m.moteur === 'mistral' ? 'Mistral' : 'IA locale'} utilisé${m.moteur === 'mistral' ? '' : 'e'}. `
      : m.choisi === 'mistral' && m.moteur !== 'mistral' ? 'Aucune clé Mistral enregistrée : IA locale utilisée. ' : '';
    res.json({ ia: !!statut.disponible, moteur: m.moteur, raison: raisonChoix + (statut.disponible ? '' : String(statut.raison || '')), modele: m.client.modele });
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
    const m = moteurCourant();
    const resultat = await comprendreDemande({
      texte,
      contexte: {
        aujourdhui: typeof contexte.aujourdhui === 'string' ? contexte.aujourdhui : '',
        dossierId: typeof contexte.dossierId === 'string' ? contexte.dossierId : '',
        dossierLibelle: typeof contexte.dossierLibelle === 'string' ? contexte.dossierLibelle.slice(0, 120) : '',
        historique: Array.isArray(contexte.historique) ? contexte.historique.slice(-3) : []
      },
      dossiers
    }, m.client, { disponibilite: m.disponibilite, pseudonymiser: m.pseudonymiser, toujours: m.moteur !== 'locale' && lireReglages().toutesDemandes });
    // Point terrain : l'IA locale a compris une phrase ambiguë (ou n'a pas pu) — jamais la phrase elle-même.
    const point = m.moteur === 'claude' ? 'assistant-claude' : m.moteur === 'mistral' ? 'assistant-mistral' : 'assistant-ia-locale';
    if (resultat.source === 'ia') noterVerification(parametresRepo, point, { detail: `intention ${resultat.intention}` });
    else if (resultat.raisonIa) noterVerification(parametresRepo, point, { ok: false, message: resultat.raisonIa.slice(0, 120) });
    res.json(resultat);
  }));

  return routeur;
}

module.exports = { creerRouteurAssistant };
