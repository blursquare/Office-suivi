'use strict';

// Relecture d'un projet d'acte par un modèle hébergé (Outil 2) : MISTRAL par défaut depuis le
// 27/09/2026 (point d'accès de l'Union européenne, voir relecture/mistral.js), Claude en option.
// Les chemins gardent leur nom historique (/api/relecture-claude/…) pour ne rien casser côté client ;
// c'est le réglage `fournisseur` qui décide. Voir relecture/claude.js pour le prompt, le schéma et
// la vérification des citations — partagés par les deux fournisseurs — et CLAUDE.md pour le cadre
// retenu (guide IEJ/CSN sur l'IA : secret professionnel, pseudonymisation locale, archivage des
// requêtes, décision laissée au notaire).
//
// Ce que ce serveur reçoit est DÉJÀ pseudonymisé par le navigateur : il ne voit jamais la table de
// correspondance, et c'est ce texte-là — et lui seul — qui part chez le fournisseur et est archivé.
//
// Les clés API sont lues dans les réglages (écran Réglages, jamais renvoyées au navigateur) ou, à
// défaut, dans MISTRAL_API_KEY / ANTHROPIC_API_KEY.

const express = require('express');
const crypto = require('node:crypto');
const {
  calculerCoutUsd, estimerCoutUsd, validerGrille, validerDocuments, validerConsignes, construireTexteDocuments,
  construireSystemPrompt, SCHEMA_RELECTURE, normaliserAnalyse, LIMITE_JETONS_ENTREE, MAX_JETONS_SORTIE
} = require('../relecture/claude');
const mistral = require('../relecture/mistral');

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

// Fournisseur retenu dans les réglages, avec sa clé, son modèle et (Mistral) sa région.
function configurationFournisseur(parametresRepo) {
  const r = parametresRepo.lireReglagesClaude();
  if (r.fournisseur === 'claude') {
    if (r.cleApi) return { fournisseur: 'claude', cle: r.cleApi, source: 'reglages', modele: r.modele };
    if (process.env.ANTHROPIC_API_KEY) return { fournisseur: 'claude', cle: process.env.ANTHROPIC_API_KEY, source: 'environnement', modele: r.modele };
    return { fournisseur: 'claude', cle: '', source: null, modele: r.modele };
  }
  const base = { fournisseur: 'mistral', modele: r.modeleMistral, region: r.regionMistral };
  if (r.cleMistral) return { ...base, cle: r.cleMistral, source: 'reglages' };
  if (process.env.MISTRAL_API_KEY) return { ...base, cle: process.env.MISTRAL_API_KEY, source: 'environnement' };
  return { ...base, cle: '', source: null };
}

const LIBELLES_FOURNISSEUR = { mistral: 'Mistral', claude: 'Claude' };

// Journalise des métadonnées sûres seulement : une erreur du SDK peut embarquer un extrait du corps
// de la requête (donc du texte d'un acte, même pseudonymisé) — même précaution que le prototype.
function journaliserErreur(contexte, err) {
  console.error(`[relecture] ${contexte} :`, {
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
  // Injectables pour les tests (aucun appel réseau réel).
  const appelerMistral = (options && options.appelerMistral) || mistral.appelerMistral;
  const testerMistral = (options && options.testerMistral) || mistral.testerMistral;
  const insererJournal = db && db.prepare(`INSERT INTO analyses_claude
    (id, created_at, mode, modele, libelle, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cout_usd, duree_ms, requete, reponse)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  routeur.get('/relecture-claude/etat', (req, res) => {
    const s = configurationFournisseur(parametresRepo);
    res.json({ configure: !!s.cle, source: s.source, modele: s.modele, fournisseur: s.fournisseur, region: s.region || null });
  });

  // Estimation AVANT de lancer : l'étude décide en connaissance de cause. Claude : compte exact des
  // jetons (gratuit). Mistral : pas de comptage gratuit, estimation sur la longueur du texte.
  routeur.post('/relecture-claude/estimer', async (req, res) => {
    const s = configurationFournisseur(parametresRepo);
    if (!s.cle) { res.status(503).json({ erreur: `Aucune clé API ${LIBELLES_FOURNISSEUR[s.fournisseur]} configurée (Réglages).` }); return; }
    const r = preparerRequete(req.body);
    if (r.erreur) { res.status(400).json({ erreur: r.erreur }); return; }
    if (s.fournisseur === 'mistral') {
      const jetons = mistral.estimerJetonsMistral(r.system, r.contenu);
      res.json({
        fournisseur: 'mistral', modele: s.modele, jetonsEntree: jetons, estime: true,
        coutEstime: mistral.estimerCoutMistralUsd(jetons, s.modele, s.region),
        depasse: jetons > mistral.LIMITE_JETONS_ENTREE_MISTRAL, limiteJetons: mistral.LIMITE_JETONS_ENTREE_MISTRAL
      });
      return;
    }
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
        fournisseur: 'claude', modele: s.modele, jetonsEntree: compte.input_tokens, estime: false,
        coutEstime: estimerCoutUsd(compte.input_tokens, s.modele), depasse, limiteJetons: LIMITE_JETONS_ENTREE
      });
    } catch (err) {
      journaliserErreur('estimation', err);
      res.status(502).json({ erreur: messageErreurApi(err) });
    }
  });

  routeur.post('/relecture-claude/analyser', async (req, res) => {
    const s = configurationFournisseur(parametresRepo);
    if (!s.cle) { res.status(503).json({ erreur: `Aucune clé API ${LIBELLES_FOURNISSEUR[s.fournisseur]} configurée (Réglages).` }); return; }
    const r = preparerRequete(req.body);
    if (r.erreur) { res.status(400).json({ erreur: r.erreur }); return; }

    const debut = Date.now();
    // Chaque fournisseur rend la même forme : texte de la réponse, jetons, coût, modèle servi, et
    // une éventuelle erreur de fin (refus, réponse coupée).
    let rendu;
    try {
      rendu = s.fournisseur === 'mistral' ? await analyserAvecMistral(s, r) : await analyserAvecClaude(s, r);
    } catch (err) {
      journaliserErreur('analyse', err);
      res.status(502).json({ erreur: s.fournisseur === 'mistral' ? mistral.messageErreurMistral(err) : messageErreurApi(err) });
      return;
    }
    const dureeMs = Date.now() - debut;

    let brute = null;
    let erreur = rendu.erreur || null;
    if (!erreur) {
      try { brute = JSON.parse(rendu.texte); } catch (_) { erreur = "Réponse du modèle illisible : relancez l'analyse."; }
    }

    const id = crypto.randomUUID();
    const libelle = texteLibelle(req.body);
    try {
      insererJournal && insererJournal.run(id, new Date().toISOString(), r.mode, rendu.modele, libelle,
        rendu.jetonsEntree, rendu.jetonsSortie, rendu.cacheLu || 0, rendu.cacheEcrit || 0, rendu.coutUsd || 0, dureeMs,
        JSON.stringify({ fournisseur: s.fournisseur, system: r.system, contenu: r.contenu }), rendu.texte);
    } catch (e) {
      journaliserErreur('journal', e);
    }

    const facture = { fournisseur: s.fournisseur, modele: rendu.modele, jetonsEntree: rendu.jetonsEntree, jetonsSortie: rendu.jetonsSortie, coutUsd: rendu.coutUsd, dureeMs, id };
    if (erreur) { res.status(502).json({ erreur, facture }); return; }
    res.json({ analyse: normaliserAnalyse(brute, r.grille, r.documents), facture });
  });

  async function analyserAvecClaude(s, r) {
    const client = creerClient(s.cle);
    const params = {
      model: s.modele,
      max_tokens: MAX_JETONS_SORTIE,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA_RELECTURE } },
      system: r.system,
      messages: [{ role: 'user', content: r.contenu }]
    };
    // Flux plutôt que requête simple : l'entrée est longue et la sortie aussi, une requête non
    // streamée dépasserait les délais HTTP.
    const flux = s.modele === 'claude-opus-5'
      ? client.beta.messages.stream({ ...params, betas: [BETA_REPLI], fallbacks: 'default' })
      : client.messages.stream(params);
    const message = await flux.finalMessage();
    const usage = message.usage || {};
    const modeleServi = message.model || s.modele;
    let erreur = null;
    if (message.stop_reason === 'refusal') erreur = "Le modèle a refusé de traiter ce document. Rien n'a été analysé.";
    else if (message.stop_reason === 'max_tokens') erreur = "L'analyse a dépassé la longueur de réponse autorisée : retirez des annexes et relancez.";
    return {
      texte: (message.content || []).filter(b => b.type === 'text').map(b => b.text).join(''),
      modele: modeleServi,
      jetonsEntree: usage.input_tokens || 0,
      jetonsSortie: usage.output_tokens || 0,
      cacheLu: usage.cache_read_input_tokens || 0,
      cacheEcrit: usage.cache_creation_input_tokens || 0,
      coutUsd: calculerCoutUsd(usage, modeleServi) ?? calculerCoutUsd(usage, s.modele),
      erreur
    };
  }

  async function analyserAvecMistral(s, r) {
    const reponse = await appelerMistral({
      cle: s.cle, modele: s.modele, region: s.region, system: r.system, contenu: r.contenu, schema: SCHEMA_RELECTURE
    });
    const usage = reponse.usage || {};
    // Le modèle servi porte souvent un suffixe de version (« mistral-medium-2604 ») : le tarif se
    // lit sur le modèle DEMANDÉ, seul présent dans la table.
    const modeleServi = reponse.modele || s.modele;
    let erreur = null;
    if (reponse.finishReason === 'length') erreur = "L'analyse a dépassé la longueur de réponse autorisée : retirez des annexes et relancez.";
    else if (!reponse.texte.trim()) erreur = "Mistral n'a renvoyé aucune réponse exploitable : relancez l'analyse.";
    return {
      texte: reponse.texte,
      modele: modeleServi,
      jetonsEntree: usage.prompt_tokens || 0,
      jetonsSortie: usage.completion_tokens || 0,
      coutUsd: mistral.calculerCoutMistralUsd(usage, s.modele, s.region),
      erreur
    };
  }

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

  // Réglages : les clés ne ressortent jamais, seulement le fait qu'elles soient enregistrées.
  function reglagesPublics(r) {
    return {
      fournisseur: r.fournisseur,
      modele: r.modele,
      cleEnregistree: !!r.cleApi,
      cleEnvironnement: !!process.env.ANTHROPIC_API_KEY,
      modeleMistral: r.modeleMistral,
      regionMistral: r.regionMistral,
      cleMistralEnregistree: !!r.cleMistral,
      cleMistralEnvironnement: !!process.env.MISTRAL_API_KEY
    };
  }

  routeur.get('/relecture-claude/reglages', (req, res) => {
    res.json(reglagesPublics(parametresRepo.lireReglagesClaude()));
  });

  routeur.put('/relecture-claude/reglages', (req, res) => {
    res.json(reglagesPublics(parametresRepo.ecrireReglagesClaude(req.body || {})));
  });

  // Vérifie la clé du fournisseur choisi sans rien facturer : la lecture de la fiche d'un modèle
  // est gratuite chez l'un comme chez l'autre.
  routeur.post('/relecture-claude/tester', async (req, res) => {
    const s = configurationFournisseur(parametresRepo);
    if (!s.cle) { res.status(400).json({ erreur: 'Aucune clé API enregistrée.' }); return; }
    try {
      if (s.fournisseur === 'mistral') {
        const m = await testerMistral({ cle: s.cle, modele: s.modele, region: s.region });
        res.json({ ok: true, fournisseur: 'mistral', modele: m.id, libelle: m.libelle, region: s.region });
        return;
      }
      const modele = await creerClient(s.cle).models.retrieve(s.modele);
      res.json({ ok: true, fournisseur: 'claude', modele: modele.id, libelle: modele.display_name || modele.id });
    } catch (err) {
      journaliserErreur('test', err);
      res.status(502).json({ erreur: s.fournisseur === 'mistral' ? mistral.messageErreurMistral(err) : messageErreurApi(err) });
    }
  });

  return routeur;
}

function texteLibelle(corps) {
  const l = corps && typeof corps.libelle === 'string' ? corps.libelle : '';
  return l.trim().slice(0, 160);
}

module.exports = { creerRouteurRelectureClaude, messageErreurApi };
