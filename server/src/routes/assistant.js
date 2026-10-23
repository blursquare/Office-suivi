'use strict';

// Assistant « Demander à CLAIRE » (étude 06/10) : le poste envoie la phrase du collaborateur, le serveur la comprend
// (commun/assistant.js par mots-clés, IA locale Ollama à défaut — voir server/src/assistant.js) et rend l'intention, ses
// paramètres et le dossier désigné. Le geste lui-même est fait par le poste. Rien n'est journalisé ni gardé.

const express = require('express');
const { creerClientOllama } = require('../llm');
const { comprendreDemande, creerCacheDisponibilite } = require('../assistant');
const { CLE_REGLAGES, MOTEURS, REVISION_REGLAGES_ASSISTANT, assainirReglagesAssistant, creerClientMistralAssistant, lireUsageAssistant, MODELE_ASSISTANT_MISTRAL, MODELES_CLAUDE_ASSISTANT, MODELES_AGENT, MODELES_AGENT_MISTRAL } = require('../assistantMistral');
const { tourAgent, EFFORTS_AGENT } = require('../assistantAgent');

const { lireCarnet } = require('../carnetClaire');
const { lireRechercheWeb, ecrireRechercheWeb, noterConversation, lireConversations, rechercherConversations, sensiblesConversations } = require('../conversationsAgent');
const { lireReglagesOpenlegi } = require('./openlegi');
const { lireReglagesYousign } = require('./yousign');
const { creerClientClaudeAssistant } = require('../assistantClaude');
const { converser } = require('../assistantConversation');
const { noterVerification } = require('../verificationsTerrain');

const chaine = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const listeChaines = (v, n, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, n).map((x) => x.slice(0, max)) : []);

function routeAsync(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Modèle choisi pour la conversation dans la colonne de droite (Claude seulement), sinon celui des Réglages.
function modeleConversation(a, corps) {
  return a.fournisseur !== 'mistral' && typeof corps.modele === 'string' && MODELES_AGENT[corps.modele] ? corps.modele : a.modele;
}

// Les dossiers reçus du poste, ramenés aux seuls champs qui servent à reconnaître un dossier cité (jamais une donnée de fiche utile
// à l'IA) : sert à masquer les noms avant tout envoi en ligne.

function dossiersDuCorps(corps) {
    return Array.isArray(corps.dossiers) ? corps.dossiers.filter((d) => d && typeof d.id === 'string').map((d) => ({
      id: d.id, nom: typeof d.nom === 'string' ? d.nom : '', archive: !!d.archive,
      parties: Array.isArray(d.parties) ? d.parties.filter((p) => p && typeof p.nom === 'string').slice(0, 20).map((p) => ({
        nom: p.nom.slice(0, 120), prenom: chaine(p.prenom, 80), nomUsage: chaine(p.nomUsage, 120), civilite: chaine(p.civilite, 12), societe: p.societe === true
      })) : [],
      autres: listeChaines(d.autres, 10, 300),
      reference: chaine(d.reference, 40),
      contacts: listeChaines(d.contacts, 20, 200)
    })) : [];
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
    if (brut.revision !== REVISION_REGLAGES_ASSISTANT) return assainirReglagesAssistant({ moteur: 'claude', toutesDemandes: true });
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
        const client = creerClientClaudeAssistant({ cle, modele: reglages.modeleClaude, parametresRepo, client: injections && injections.clientClaude });
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

  // L'agent en service : celui du moteur choisi — Claude (ou Mistral à défaut de clé Claude, comme pour la compréhension), Mistral
  // choisi avec sa clé ; rien avec l'IA locale ou l'agent coupé.
  function agentCourant() {
    const reglages = lireReglages();
    if (!reglages.agent) return null;
    const m = moteurCourant();
    if (m.moteur === 'claude') return { fournisseur: 'claude', cle: cleClaude(), modele: reglages.modeleAgent };
    if (m.moteur === 'mistral') { const { cle, region } = cleMistral(); return { fournisseur: 'mistral', cle, region, modele: reglages.modeleAgentMistral }; }
    return null;
  }

  routeur.get('/assistant/reglages', (req, res) => {
    const reglages = lireReglages();
    res.json({ ...reglages, moteurs: MOTEURS, cleMistralEnregistree: !!cleMistral().cle, cleClaudeEnregistree: !!cleClaude(),
      modeleMistral: MODELE_ASSISTANT_MISTRAL,
      modelesClaude: Object.entries(MODELES_CLAUDE_ASSISTANT).map(([id, m]) => ({ id, libelle: m.libelle, entree: m.entree, sortie: m.sortie })),
      modelesAgent: Object.entries(MODELES_AGENT).map(([id, m]) => ({ id, libelle: m.libelle, entree: m.entree, sortie: m.sortie })),
      modelesAgentMistral: Object.entries(MODELES_AGENT_MISTRAL).map(([id, m]) => ({ id, libelle: m.libelle, entree: m.entree, sortie: m.sortie })),
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
    // L'agent (11/10) : Claude ou Mistral (le moteur en service, clé comprise), et l'agent allumé.
    const a = agentCourant();
    const agent = !!a && !!statut.disponible;
    res.json({ ia: !!statut.disponible, moteur: m.moteur, raison: raisonChoix + (statut.disponible ? '' : String(statut.raison || '')), modele: agent ? a.modele : m.client.modele, agent });
  }));

  routeur.post('/assistant/comprendre', routeAsync(async (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const texte = typeof corps.texte === 'string' ? corps.texte.trim() : '';
    if (!texte) { res.status(400).json({ erreur: 'Aucune demande (champ "texte" requis).' }); return; }
    const contexte = corps.contexte && typeof corps.contexte === 'object' ? corps.contexte : {};
    const dossiers = dossiersDuCorps(corps);
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

  // Échange libre (étude 11/10) : l'IA en ligne répond à une phrase SANS donnée de dossier, noms masqués. Sans IA en ligne ou en cas
  // d'erreur : { reponse: '' } et la raison — le poste répond alors lui-même.
  routeur.post('/assistant/converser', routeAsync(async (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const texte = typeof corps.texte === 'string' ? corps.texte.trim() : '';
    if (!texte) { res.status(400).json({ erreur: 'Aucune phrase (champ "texte" requis).' }); return; }
    const m = moteurCourant();
    if (m.moteur === 'locale') { res.json({ reponse: '', raison: 'Aucune IA en ligne configurée (Claude ou Mistral).' }); return; }
    const contexte = corps.contexte && typeof corps.contexte === 'object' ? corps.contexte : {};
    try {
      const { reponse } = await converser({ texte, contexte: { aujourdhui: chaine(contexte.aujourdhui, 10), prenom: chaine(contexte.prenom, 20), historique: Array.isArray(contexte.historique) ? contexte.historique : [] }, dossiers: dossiersDuCorps(corps) }, m.client);
      noterVerification(parametresRepo, 'assistant-conversation', { detail: m.moteur });
      res.json({ reponse, moteur: m.moteur });
    } catch (err) {
      const raison = err && err.message ? String(err.message).slice(0, 160) : 'réponse illisible';
      noterVerification(parametresRepo, 'assistant-conversation', { ok: false, message: raison.slice(0, 120) });
      res.json({ reponse: '', raison });
    }
  }));

  // Agent (étude 11/10 : « aussi intelligent que toi ») : un tour de conversation — la question ou les résultats des outils que le
  // poste vient d'exécuter. Données masquées par assistantAgent.js avant tout envoi. Sans agent possible : { repli: true }, le poste
  // revient à la compréhension d'une phrase.
  routeur.post('/assistant/agent', routeAsync(async (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const a = agentCourant();
    if (!a) { const r = lireReglages(); res.json({ repli: true, raison: !r.agent ? 'Agent coupé dans les Réglages.' : r.moteur === 'locale' ? 'IA locale choisie : pas d’agent.' : 'Aucune clé Claude ni Mistral enregistrée.' }); return; }
    const resultats = Array.isArray(corps.resultats) ? corps.resultats.slice(0, 20).filter((r) => r && typeof r.id === 'string')
      .map((r) => ({ id: r.id.slice(0, 120), contenu: r.contenu, erreur: r.erreur === true })) : undefined;
    // Outils d'OpenLegi : lus par l'agent seulement quand une conversation naît (ceux d'une conversation en cours sont fixés).
    const chargerOutilsExternes = async () => {
      const ol = lireReglagesOpenlegi(parametresRepo);
      const droit = ol.jeton && ol.actif && injections && injections.openlegi ? await injections.openlegi.outilsAgent() : [];
      // Yousign (signature électronique, étude 23/10) : lecture, et écriture si elle n'est pas coupée dans les Réglages.
      const yo = lireReglagesYousign(parametresRepo);
      const signature = yo.connecte && yo.actif && injections && injections.yousign ? await injections.yousign.outilsAgent() : [];
      return droit.concat(signature);
    };
    const sortie = await tourAgent({
      conversation: chaine(corps.conversation, 80),
      texte: chaine(corps.texte, 12000),
      resultats,
      anonymiser: typeof corps.anonymiser === 'boolean' ? corps.anonymiser : undefined,
      documents: Array.isArray(corps.documents) ? corps.documents : undefined,
      dossiers: dossiersDuCorps(corps),
      contexte: corps.contexte && typeof corps.contexte === 'object' ? corps.contexte : {},
      // Carnet de consignes de l'étude (CLAIRE.md) : pris par l'agent au premier tour de chaque conversation (reprise comprise).
      carnet: lireCarnet(parametresRepo).texte,
      // Échanges gardés par le poste : relus seulement si le serveur a oublié la conversation (reprise).
      historique: Array.isArray(corps.historique) ? corps.historique.slice(-12).map((h) => ({ role: h && h.role === 'moi' ? 'moi' : 'claire', texte: chaine(h && h.texte, 1500) })) : []
    }, { cle: a.cle, fournisseur: a.fournisseur, modele: modeleConversation(a, corps), effort: EFFORTS_AGENT.includes(corps.effort) ? corps.effort : undefined, region: a.region, client: injections && injections.clientAgent,
      fetchMistral: injections && injections.fetchMistral, parametresRepo, chargerOutilsExternes,
      rechercheWeb: (() => { const w = lireRechercheWeb(parametresRepo); return w.actif ? w.domaines : []; })(),
      noterConversation: (info) => noterConversation(parametresRepo, info),
      sensiblesConversations: () => sensiblesConversations(parametresRepo),
      surRefusOutilsExternes: () => { if (injections && injections.openlegi) injections.openlegi.suspendre(); if (injections && injections.yousign) injections.yousign.suspendre(); },
      surRefusYousign: () => { if (injections && injections.yousign) injections.yousign.suspendre(); },
      surAppelsEcriture: (appels) => { if (injections && injections.yousign) injections.yousign.attendre(appels); } });
    if (sortie.erreur && !sortie.expiree && sortie.erreur !== 'aucun outil attendu') noterVerification(parametresRepo, 'assistant-agent', { ok: false, message: String(sortie.erreur).slice(0, 120) });
    else if (sortie.reponse) noterVerification(parametresRepo, 'assistant-agent', { detail: String(sortie.modele || '') });
    res.json(sortie);
  }));

  // Mémoire des conversations (étude 18/10) : l'outil chercher_conversations de l'agent, exécuté par le poste ; résultat masqué par le serveur
  // au retour comme tout résultat d'outil.
  routeur.get('/assistant/conversations/recherche', (req, res) => {
    res.json({ resultats: rechercherConversations(lireConversations(parametresRepo), chaine(req.query.q, 200), chaine(req.query.dossier, 80)) });
  });

  // Recherche web de l'agent : sites autorisés (Réglages › IA et relecture d'actes).
  routeur.get('/assistant/recherche-web', (req, res) => { res.json(lireRechercheWeb(parametresRepo)); });
  routeur.put('/assistant/recherche-web', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    if (corps.domaines !== undefined && !Array.isArray(corps.domaines)) { res.status(400).json({ erreur: 'Liste de sites attendue.' }); return; }
    res.json(ecrireRechercheWeb(parametresRepo, { actif: corps.actif !== false, domaines: Array.isArray(corps.domaines) ? corps.domaines : lireRechercheWeb(parametresRepo).domaines }));
  });

  return routeur;
}

module.exports = { creerRouteurAssistant };
