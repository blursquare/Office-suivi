'use strict';

// Relecture d'un projet d'acte par l'API Claude (Outil 2). Voir relecture/claude.js pour le
// contenu du prompt et la vérification des citations, et CLAUDE.md pour le cadre retenu (guide
// IEJ/CSN sur l'IA : secret professionnel, pseudonymisation locale, archivage des requêtes,
// décision laissée au notaire).
//
// Ce que ce serveur reçoit est DÉJÀ pseudonymisé par le navigateur : il ne voit jamais la table de
// correspondance, et c'est ce texte-là — et lui seul — qui part chez Anthropic et qui est archivé.
//
// La clé API est lue dans les réglages (écran Réglages, jamais renvoyée au navigateur) ou, à
// défaut, dans la variable d'environnement ANTHROPIC_API_KEY.

const express = require('express');
const crypto = require('node:crypto');
const {
  calculerCoutUsd, estimerCoutUsd, validerGrille, validerDocuments, validerConsignes, construireTexteDocuments,
  construireSystemPrompt, SCHEMA_RELECTURE, normaliserAnalyse, LIMITE_JETONS_ENTREE, MAX_JETONS_SORTIE
} = require('../relecture/claude');

// Opus 5 seulement : le repli serveur en cas de refus par les classifieurs de sécurité. Une
// relecture d'acte n'a aucune raison d'en déclencher un, mais un refus silencieux ferait perdre
// plusieurs minutes et un coût d'entrée ; le repli le rend transparent.
const BETA_REPLI = 'server-side-fallback-2026-07-01';

function creerClientParDefaut(cleApi) {
  const Anthropic = require('@anthropic-ai/sdk');
  const Classe = Anthropic.default || Anthropic;
  // Délai large : un dossier complet avec ses annexes peut demander plusieurs minutes.
  return new Classe({ apiKey: cleApi, timeout: 15 * 60 * 1000, maxRetries: 1 });
}

function sourceCle(parametresRepo) {
  const r = parametresRepo.lireReglagesClaude();
  if (r.cleApi) return { cle: r.cleApi, source: 'reglages', modele: r.modele };
  if (process.env.ANTHROPIC_API_KEY) return { cle: process.env.ANTHROPIC_API_KEY, source: 'environnement', modele: r.modele };
  return { cle: '', source: null, modele: r.modele };
}

// Journalise des métadonnées sûres seulement : une erreur du SDK peut embarquer un extrait du corps
// de la requête (donc du texte d'un acte, même pseudonymisé) — même précaution que le prototype.
function journaliserErreur(contexte, err) {
  console.error(`[relecture-claude] ${contexte} :`, {
    nom: err && err.name, statut: err && err.status, message: err && String(err.message || '').slice(0, 200)
  });
}

function messageErreurApi(err) {
  const statut = err && err.status;
  if (statut === 401) return 'Clé API refusée par Anthropic : vérifiez-la dans les Réglages.';
  if (statut === 403) return "Cette clé API n'a pas accès au modèle choisi.";
  if (statut === 429) return 'Limite de débit atteinte chez Anthropic : réessayez dans une minute.';
  if (statut === 400) return "Requête refusée par l'API (document trop volumineux ou format inattendu).";
  if (statut >= 500) return "Service d'Anthropic momentanément indisponible : réessayez.";
  return "Impossible de joindre l'API d'Anthropic depuis le serveur (connexion internet du poste serveur ?).";
}

function preparerRequete(corps) {
  const mode = corps && corps.mode === 'acte' ? 'acte' : 'compromis';
  const g = validerGrille(corps && corps.grille);
  if (g.erreur) return { erreur: g.erreur };
  const d = validerDocuments(corps && corps.documents);
  if (d.erreur) return { erreur: d.erreur };
  const system = construireSystemPrompt(mode, g.grille, validerConsignes(corps && corps.consignes), corps && corps.typeBien);
  const contenu = `Voici les documents pseudonymisés à relire. Remplis la fiche demandée.\n\n${construireTexteDocuments(d.documents)}`;
  return { mode, grille: g.grille, documents: d.documents, system, contenu };
}

function creerRouteurRelectureClaude(parametresRepo, db, options) {
  const routeur = express.Router();
  const creerClient = (options && options.creerClient) || creerClientParDefaut;
  const insererJournal = db && db.prepare(`INSERT INTO analyses_claude
    (id, created_at, mode, modele, libelle, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cout_usd, duree_ms, requete, reponse)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  routeur.get('/relecture-claude/etat', (req, res) => {
    const s = sourceCle(parametresRepo);
    res.json({ configure: !!s.cle, source: s.source, modele: s.modele });
  });

  // Compte exact des jetons d'entrée (gratuit chez Anthropic) → fourchette de coût, affichée AVANT
  // de lancer : l'étude décide en connaissance de cause.
  routeur.post('/relecture-claude/estimer', async (req, res) => {
    const s = sourceCle(parametresRepo);
    if (!s.cle) { res.status(503).json({ erreur: 'Aucune clé API Claude configurée (Réglages).' }); return; }
    const r = preparerRequete(req.body);
    if (r.erreur) { res.status(400).json({ erreur: r.erreur }); return; }
    try {
      const client = creerClient(s.cle);
      const compte = await client.messages.countTokens({
        model: s.modele,
        system: r.system,
        messages: [{ role: 'user', content: r.contenu }]
      });
      // Le compte exact dit si le dossier tient dans le contexte du modèle : c'est la seule limite
      // réelle (aucune limite de pages, voir LIMITE_JETONS_ENTREE). Signalé AVANT le lancement.
      const depasse = compte.input_tokens > LIMITE_JETONS_ENTREE;
      res.json({
        modele: s.modele, jetonsEntree: compte.input_tokens, coutEstime: estimerCoutUsd(compte.input_tokens, s.modele),
        depasse, limiteJetons: LIMITE_JETONS_ENTREE
      });
    } catch (err) {
      journaliserErreur('estimation', err);
      res.status(502).json({ erreur: messageErreurApi(err) });
    }
  });

  routeur.post('/relecture-claude/analyser', async (req, res) => {
    const s = sourceCle(parametresRepo);
    if (!s.cle) { res.status(503).json({ erreur: 'Aucune clé API Claude configurée (Réglages).' }); return; }
    const r = preparerRequete(req.body);
    if (r.erreur) { res.status(400).json({ erreur: r.erreur }); return; }

    const debut = Date.now();
    const client = creerClient(s.cle);
    const params = {
      model: s.modele,
      max_tokens: MAX_JETONS_SORTIE,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA_RELECTURE } },
      system: r.system,
      messages: [{ role: 'user', content: r.contenu }]
    };
    let message;
    try {
      // Flux plutôt que requête simple : l'entrée est longue et la sortie aussi, une requête non
      // streamée dépasserait les délais HTTP.
      const flux = s.modele === 'claude-opus-5'
        ? client.beta.messages.stream({ ...params, betas: [BETA_REPLI], fallbacks: 'default' })
        : client.messages.stream(params);
      message = await flux.finalMessage();
    } catch (err) {
      journaliserErreur('analyse', err);
      res.status(502).json({ erreur: messageErreurApi(err) });
      return;
    }

    const usage = message.usage || {};
    const modeleServi = message.model || s.modele;
    const coutUsd = calculerCoutUsd(usage, modeleServi) ?? calculerCoutUsd(usage, s.modele);
    const texte = (message.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const dureeMs = Date.now() - debut;

    let brute = null;
    let erreur = null;
    if (message.stop_reason === 'refusal') {
      erreur = "Le modèle a refusé de traiter ce document. Rien n'a été analysé.";
    } else if (message.stop_reason === 'max_tokens') {
      erreur = "L'analyse a dépassé la longueur de réponse autorisée : retirez des annexes et relancez.";
    } else {
      try { brute = JSON.parse(texte); } catch (_) { erreur = "Réponse du modèle illisible : relancez l'analyse."; }
    }

    const id = crypto.randomUUID();
    const libelle = texteLibelle(req.body);
    try {
      insererJournal && insererJournal.run(id, new Date().toISOString(), r.mode, modeleServi, libelle,
        usage.input_tokens || 0, usage.output_tokens || 0, usage.cache_read_input_tokens || 0,
        usage.cache_creation_input_tokens || 0, coutUsd || 0, dureeMs,
        JSON.stringify({ system: r.system, contenu: r.contenu }), texte);
    } catch (e) {
      journaliserErreur('journal', e);
    }

    const facture = { modele: modeleServi, jetonsEntree: usage.input_tokens || 0, jetonsSortie: usage.output_tokens || 0, coutUsd, dureeMs, id };
    if (erreur) { res.status(502).json({ erreur, facture }); return; }
    res.json({ analyse: normaliserAnalyse(brute, r.grille, r.documents), facture });
  });

  // Coût cumulé : ce mois-ci et au total, plus les dernières analyses (métadonnées seulement — la
  // requête archivée n'est jamais renvoyée au navigateur par cette route).
  routeur.get('/relecture-claude/journal', (req, res) => {
    if (!db) { res.json({ analyses: [], moisUsd: 0, totalUsd: 0 }); return; }
    const mois = new Date().toISOString().slice(0, 7);
    const analyses = db.prepare(`SELECT id, created_at, mode, modele, libelle, input_tokens, output_tokens, cout_usd, duree_ms
      FROM analyses_claude ORDER BY created_at DESC LIMIT 20`).all();
    const m = db.prepare(`SELECT COALESCE(SUM(cout_usd), 0) AS s, COUNT(*) AS n FROM analyses_claude WHERE substr(created_at, 1, 7) = ?`).get(mois);
    const t = db.prepare('SELECT COALESCE(SUM(cout_usd), 0) AS s, COUNT(*) AS n FROM analyses_claude').get();
    res.json({ analyses, moisUsd: m.s, moisNb: m.n, totalUsd: t.s, totalNb: t.n });
  });

  // Réglages : la clé ne ressort jamais, seulement le fait qu'elle soit enregistrée.
  routeur.get('/relecture-claude/reglages', (req, res) => {
    const r = parametresRepo.lireReglagesClaude();
    res.json({ modele: r.modele, cleEnregistree: !!r.cleApi, cleEnvironnement: !!process.env.ANTHROPIC_API_KEY });
  });

  routeur.put('/relecture-claude/reglages', (req, res) => {
    const r = parametresRepo.ecrireReglagesClaude(req.body || {});
    res.json({ modele: r.modele, cleEnregistree: !!r.cleApi, cleEnvironnement: !!process.env.ANTHROPIC_API_KEY });
  });

  // Vérifie la clé sans rien facturer : la lecture de la fiche d'un modèle est gratuite.
  routeur.post('/relecture-claude/tester', async (req, res) => {
    const s = sourceCle(parametresRepo);
    if (!s.cle) { res.status(400).json({ erreur: 'Aucune clé API enregistrée.' }); return; }
    try {
      const modele = await creerClient(s.cle).models.retrieve(s.modele);
      res.json({ ok: true, modele: modele.id, libelle: modele.display_name || modele.id });
    } catch (err) {
      journaliserErreur('test', err);
      res.status(502).json({ erreur: messageErreurApi(err) });
    }
  });

  return routeur;
}

function texteLibelle(corps) {
  const l = corps && typeof corps.libelle === 'string' ? corps.libelle : '';
  return l.trim().slice(0, 160);
}

module.exports = { creerRouteurRelectureClaude, messageErreurApi };
