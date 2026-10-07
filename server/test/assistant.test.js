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
  assert.match(p, /etat_dossier = /);
  assert.match(p, /rendez_vous_placer/);
  assert.match(p, /mardi 6 octobre 2026/);
  assert.match(p, /Dossier en consultation : VTE - LEROY/);
  assert.match(p, /« Relance MARTIN » → email/);
  assert.match(p, /Phrase : « Où en est ce dossier \? »/);
  assert.doesNotMatch(p, /DUPONT \/ ROUX/);
  assert.match(p, /rien d'invent/);
});

test('le prompt donne à l\'IA les exemples de la base les plus proches de la phrase', () => {
  const p = promptAssistant('Où en sommes-nous avec Garnier ?', { aujourdhui: '2026-10-06' });
  assert.match(p, /Exemples proches :\n« [^\n]+ » → etat_dossier/);
  assert.ok(!/Exemples proches/.test(promptAssistant('xyzzy', { aujourdhui: '2026-10-06' })));
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

test('un nom de dossier seul : l\'état du dossier, sans appeler Ollama', async () => {
  let appels = 0;
  const ollama = { verifierDisponibilite: async () => { appels += 1; return { disponible: true }; }, genererJson: async () => { appels += 1; return {}; } };
  const r = await comprendreDemande({ texte: 'dossier Martin', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, ollama);
  assert.equal(r.intention, 'etat_dossier');
  assert.equal(r.dossier, 'd1');
  assert.equal(appels, 0);
});

test('l\'IA locale est appelée sans relance et avec un délai borné, le prompt reste court', async () => {
  let limites = null;
  const ollama = {
    verifierDisponibilite: async () => ({ disponible: true }),
    genererJson: async (prompt, valider, l) => { limites = l; return { intention: 'inconnu', parametres: {} }; }
  };
  await comprendreDemande({ texte: 'machin truc bidule', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, ollama);
  assert.equal(limites.sansRelance, true);
  assert.ok(limites.delaiMs <= 60000);
  assert.ok(promptAssistant('x', { aujourdhui: '2026-10-06' }).length < 2500);
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
  const r = await comprendreDemande({ texte: 'Le virement et les pièces de MARTIN, c\'est bon ?', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, ollama);
  assert.equal(r.intention, 'pieces_manquantes');
  assert.equal(r.source, 'motscles');
  assert.match(r.raisonIa, /ne répond pas/);
  assert.equal(r.dossier, 'd1');
});

test('réponse de l’IA hors liste : intention « inconnu » plutôt qu’une erreur', async () => {
  const ollama = { verifierDisponibilite: async () => ({ disponible: true }), genererJson: async () => { throw new Error("Le modèle local n'a pas produit de réponse exploitable"); } };
  const r = await comprendreDemande({ texte: 'Le virement et les pièces de MARTIN, c\'est bon ?', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS }, ollama);
  assert.equal(r.intention, 'pieces_manquantes'); // les mots-clés avaient une lecture
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
    body: JSON.stringify({ texte: 'Le virement et les pièces de MARTIN, c\'est bon ?', contexte: { aujourdhui: '2026-10-06' }, dossiers: DOSSIERS })
  });
  const corps = await r.json();
  assert.equal(corps.intention, 'fonds_dossier');
  assert.equal(corps.dossier, 'd1');
  assert.equal(corps.source, 'ia');
  assert.equal(fauxOllama.appels, 1);
  // Ce qui est parti vers Ollama : la phrase, pas la liste des dossiers.
  assert.match(fauxOllama.prompts[0], /pièces de MARTIN/);
  assert.doesNotMatch(fauxOllama.prompts[0], /DUPONT \/ ROUX/);
});

// ---- Mistral (étude 07/10 : essai de l'API, noms masqués) ----

test('Mistral : la phrase part noms masqués, aucune donnée de fiche, le dossier recopié est rétabli puis relu par le code', async () => {
  const { creerClientMistralAssistant, pseudonymiserDemande, retablirTexte } = require('../src/assistantMistral');
  const D = [{ id: 'd1', nom: 'FOURNIER / GAUTHIER', parties: [{ nom: 'FOURNIER', prenom: 'Paul' }, { nom: 'GAUTHIER' }],
    autres: ['BLOIS (41000), 2 rue des Tanneurs'], reference: 'A 2026 00247', contacts: ['paul.fournier@exemple.fr', '06 12 34 56 78'] },
  { id: 'd2', nom: 'BRUNET', parties: [{ nom: 'BRUNET' }] }];
  const envoyes = [];
  const fetchFn = async (url, o) => {
    envoyes.push({ url, corps: JSON.parse(o.body), auth: o.headers.Authorization });
    const prompt = JSON.parse(o.body).messages[0].content;
    const jeton = ((prompt.split('Phrase :')[1] || '').match(/\[NOM\d+\]/) || [''])[0];
    return { ok: true, json: async () => ({ usage: { prompt_tokens: 600, completion_tokens: 40 },
      choices: [{ message: { content: JSON.stringify({ intention: 'etat_dossier', parametres: { dossier: jeton } }) } }] }) };
  };
  const ecrits = {};
  const repo = { lireJsonBrut: (k, d) => ecrits[k] || d, ecrireJsonBrut: (k, v) => { ecrits[k] = v; } };
  const client = creerClientMistralAssistant({ cle: 'cle-secrete', region: 'eu', fetchFn, parametresRepo: repo });
  const r = await comprendreDemande({ texte: 'Tu peux me dire pour Paul Fournier, rue des Tanneurs, paul.fournier@exemple.fr ?', contexte: { aujourdhui: '2026-10-07', dossierLibelle: 'VTE - BRUNET' }, dossiers: D },
    client, { pseudonymiser: true });
  assert.equal(envoyes.length, 1);
  assert.match(envoyes[0].url, /^https:\/\/api\.eu\.mistral\.ai\/v1\/chat\/completions$/);
  assert.equal(envoyes[0].corps.model, 'mistral-small-latest');
  const prompt = envoyes[0].corps.messages[0].content;
  assert.doesNotMatch(prompt, /Paul|Fournier|FOURNIER|Tanneurs|paul\.fournier|BRUNET|GAUTHIER|00247|06 12/, 'aucun nom, adresse, email ni référence ne part');
  assert.match(prompt, /\[NOM1\]/);
  assert.equal(r.source, 'ia');
  assert.equal(r.moteur, 'mistral');
  assert.equal(r.intention, 'etat_dossier');
  assert.equal(r.dossier, 'd1', 'le nom rétabli est relu par le code');
  assert.equal(ecrits['assistant-ia-usage'].demandes, 1);
  assert.equal(ecrits['assistant-ia-usage'].entree, 600);
  const p = pseudonymiserDemande('Relance Monsieur Durand', {}, D);
  assert.equal(p.texte, 'Relance Monsieur [NOM1]');
  assert.equal(retablirTexte('dossier [NOM1]', p.table), 'dossier Durand');
});

test('Mistral indisponible ou en erreur : repli sur les mots-clés, raison dite, erreur comptée', async () => {
  const { creerClientMistralAssistant } = require('../src/assistantMistral');
  const ecrits = {};
  const repo = { lireJsonBrut: (k, d) => ecrits[k] || d, ecrireJsonBrut: (k, v) => { ecrits[k] = v; } };
  const client = creerClientMistralAssistant({ cle: 'x', fetchFn: async () => ({ ok: false, status: 401, json: async () => ({}) }), parametresRepo: repo });
  const r = await comprendreDemande({ texte: 'Le virement et les pièces de MARTIN, c\'est bon ?', contexte: { aujourdhui: '2026-10-07' }, dossiers: DOSSIERS }, client, { pseudonymiser: true });
  assert.equal(r.source, 'motscles');
  assert.equal(r.intention, 'pieces_manquantes');
  assert.match(r.raisonIa, /IA Mistral : clé Mistral refusée/);
  assert.equal(ecrits['assistant-ia-usage'].erreurs, 1);
  const sansCle = creerClientMistralAssistant({ cle: '' });
  assert.equal((await sansCle.verifierDisponibilite()).disponible, false);
});

test('route : réglage du moteur (Mistral par défaut, IA locale au choix), usage du mois, repli local sans clé', async () => {
  const lire = await fetch(`${baseUrl}/api/assistant/reglages`, { headers: { Authorization: `Bearer ${jeton}` } });
  const r = await lire.json();
  assert.equal(r.moteur, 'mistral');
  assert.equal(r.cleMistralEnregistree, false);
  assert.equal(r.usage.demandes, 0);
  const dispo = await (await fetch(`${baseUrl}/api/assistant/disponibilite`, { headers: { Authorization: `Bearer ${jeton}` } })).json();
  assert.equal(dispo.moteur, 'locale', 'sans clé Mistral : IA locale');
  assert.match(dispo.raison, /Aucune clé Mistral/);
  const ecrit = await (await fetch(`${baseUrl}/api/assistant/reglages`, { method: 'PUT', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ moteur: 'locale' }) })).json();
  assert.equal(ecrit.moteur, 'locale');
  await fetch(`${baseUrl}/api/assistant/reglages`, { method: 'PUT', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ moteur: 'n importe quoi' }) });
  assert.equal((await (await fetch(`${baseUrl}/api/assistant/reglages`, { headers: { Authorization: `Bearer ${jeton}` } })).json()).moteur, 'mistral');
});
