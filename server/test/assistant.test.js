'use strict';

// Assistant « Demander à CLAIRE » (étude 06/10) : la compréhension d'une phrase côté serveur — voie rapide par mots-clés
// (sans appel à Ollama), IA locale quand la phrase est ambiguë, repli par mots-clés quand Ollama ne répond pas ; le dossier
// désigné est toujours relu par le code, jamais pris tel quel de l'IA.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { demarrerFauxOllama } = require('./helpers/faux-ollama');
const { promptAssistant, comprendreDemande, nettoyerParametresIa } = require('../src/assistant');

const DOSSIERS = [
  { id: 'd1', nom: 'MARTIN / DUPONT', parties: [{ nom: 'MARTIN' }, { nom: 'DUPONT' }] },
  { id: 'd2', nom: 'LEROY', parties: [{ nom: 'LEROY' }, { nom: 'BERNARD' }] },
  { id: 'd3', nom: 'DUPONT / ROUX', parties: [] }
];
const CONTEXTE = { aujourdhui: '2026-10-06', dossierId: 'd2', dossierLibelle: 'VTE - LEROY' };

test('le prompt liste les intentions, la date du jour en français et le dossier en consultation — jamais la liste des dossiers', () => {
  const p = promptAssistant('Où en est ce dossier ?', { ...CONTEXTE, historique: [{ texte: 'Relance MARTIN', intention: 'email' }] });
  assert.match(p, /etat_dossier : /);
  assert.match(p, /rendez_vous_placer/);
  assert.match(p, /mardi 6 octobre 2026/);
  assert.match(p, /Dossier en consultation : VTE - LEROY/);
  assert.match(p, /« Relance MARTIN » → email/);
  assert.match(p, /Phrase : « Où en est ce dossier \? »/);
  assert.doesNotMatch(p, /DUPONT \/ ROUX/);
  assert.match(p, /tu n'inventes rien/);
});

test('nettoyerParametresIa écarte une valeur hors liste et une date mal formée, et normalise le collaborateur', () => {
  const p = nettoyerParametresIa({ modele: 'inconnu', echeance: 'pret', date: '14 novembre', heure: '10:00', collaborateur: 'julie', montant: '250000', partie: 'acquereur' });
  assert.equal(p.modele, '');
  assert.equal(p.echeance, 'pret');
  assert.equal(p.date, '');
  assert.equal(p.heure, '10:00');
  assert.equal(p.collaborateur, 'Julie VASSELIN');
  assert.equal(p.montant, null);
  assert.equal(p.partie, 'acquereur');
});

test('phrase sans ambiguïté : mots-clés seuls, Ollama jamais appelé, dossier reconnu par son nom', async () => {
  let appels = 0;
  const ollama = { verifierDisponibilite: async () => { appels += 1; return { disponible: true }; }, genererJson: async () => { appels += 1; return {}; } };
  const r = await comprendreDemande({ texte: 'Où en est le dossier MARTIN ?', contexte: CONTEXTE, dossiers: DOSSIERS }, ollama);
  assert.equal(r.intention, 'etat_dossier');
  assert.equal(r.source, 'motscles');
  assert.equal(r.dossier, 'd1');
  assert.equal(appels, 0);
});

test('dossier non cité : celui en consultation est pris, et dit comme tel', async () => {
  const r = await comprendreDemande({ texte: 'Quelles pièces manquent ?', contexte: CONTEXTE, dossiers: DOSSIERS }, null);
  assert.equal(r.intention, 'pieces_manquantes');
  assert.equal(r.dossier, 'd2');
  assert.equal(r.parametres.dossierParContexte, true);
});

test('deux dossiers possibles : aucun choisi, les candidats sont rendus', async () => {
  const r = await comprendreDemande({ texte: 'Demande le RIB à DUPONT', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, null);
  assert.equal(r.intention, 'email');
  assert.equal(r.parametres.modele, 'rib');
  assert.equal(r.dossier, '');
  assert.deepEqual(r.candidats.map((c) => c.id).sort(), ['d1', 'd3']);
});

test('phrase ambiguë : l’IA locale choisit l’intention, le code garde la date et l’heure qu’il a lues, le dossier de l’IA est relu', async () => {
  const prompts = [];
  const ollama = {
    verifierDisponibilite: async () => ({ disponible: true }),
    genererJson: async (prompt) => { prompts.push(prompt); return { intention: 'rendez_vous_placer', parametres: { dossier: 'Leroy', date: '2026-01-01', heure: '09:00', titre: '' } }; }
  };
  const r = await comprendreDemande({ texte: 'Leroy le 14/11 à 10h30 ?', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, ollama);
  assert.equal(prompts.length, 1);
  assert.equal(r.source, 'ia');
  assert.equal(r.intention, 'rendez_vous_placer');
  assert.equal(r.parametres.date, '2026-11-14');
  assert.equal(r.parametres.heure, '10:30');
  assert.equal(r.dossier, 'd2');
});

test('IA indisponible : repli sur les mots-clés, raison rendue, jamais d’erreur', async () => {
  const ollama = { verifierDisponibilite: async () => ({ disponible: false, raison: 'Ollama ne répond pas' }), genererJson: async () => { throw new Error('ne doit pas être appelé'); } };
  const r = await comprendreDemande({ texte: 'Combien il manque sur les fonds de MARTIN ?', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, ollama);
  assert.equal(r.intention, 'fonds_dossier');
  assert.equal(r.source, 'motscles');
  assert.match(r.raisonIa, /ne répond pas/);
  assert.equal(r.dossier, 'd1');
});

test('réponse de l’IA hors liste : intention « inconnu » plutôt qu’une erreur', async () => {
  const ollama = { verifierDisponibilite: async () => ({ disponible: true }), genererJson: async () => { throw new Error("Le modèle local n'a pas produit de réponse exploitable"); } };
  const r = await comprendreDemande({ texte: 'Combien il manque sur les fonds de MARTIN ?', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, ollama);
  assert.equal(r.intention, 'fonds_dossier'); // les mots-clés avaient une lecture
  assert.match(r.raisonIa, /IA locale/);
  const r2 = await comprendreDemande({ texte: 'blabla', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, ollama);
  assert.equal(r2.intention, 'inconnu');
});

// ---- La route ----

let db, serveurApp, baseUrl, jeton, fauxOllama;

before(async () => {
  fauxOllama = await demarrerFauxOllama(JSON.stringify({ intention: 'fonds_dossier', parametres: { dossier: 'MARTIN' } }));
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, ollama: { url: fauxOllama.url, modele: 'llama3.1:8b' } } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  fauxOllama.serveur.close();
  db.close();
});

test('GET /api/assistant/disponibilite dit si l’IA locale répond', async () => {
  const r = await fetch(`${baseUrl}/api/assistant/disponibilite`, { headers: { Authorization: `Bearer ${jeton}` } });
  const corps = await r.json();
  assert.equal(corps.ia, true);
  assert.equal(corps.modele, 'llama3.1:8b');
});

test('POST /api/assistant/comprendre : 400 sans texte, 401 sans session, réponse complète sinon', async () => {
  const sans = await fetch(`${baseUrl}/api/assistant/comprendre`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: 'x' }) });
  assert.equal(sans.status, 401);
  const vide = await fetch(`${baseUrl}/api/assistant/comprendre`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: '' }) });
  assert.equal(vide.status, 400);
  fauxOllama.reinitialiser();
  const r = await fetch(`${baseUrl}/api/assistant/comprendre`, {
    method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: 'Combien il manque sur les fonds de MARTIN ?', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS })
  });
  const corps = await r.json();
  assert.equal(corps.intention, 'fonds_dossier');
  assert.equal(corps.dossier, 'd1');
  assert.equal(corps.source, 'ia');
  assert.equal(fauxOllama.appels, 1);
  // Ce qui est parti vers Ollama : la phrase, pas la liste des dossiers.
  assert.match(fauxOllama.prompts[0], /fonds de MARTIN/);
  assert.doesNotMatch(fauxOllama.prompts[0], /DUPONT \/ ROUX/);
});
