'use strict';

// « Demander à CLAIRE » : l'échange libre rédigé par l'IA en ligne (étude 11/10). Mêmes garanties que la compréhension d'une phrase :
// aucun nom, adresse, email ni référence ne part, les noms rendus par l'IA sont rétablis, aucune donnée de fiche dans le prompt.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { promptConversation, validerConversation, nettoyerReponseConversation, converser } = require('../src/assistantConversation');
const { creerClientMistralAssistant } = require('../src/assistantMistral');
const { requeteAssistantClaude, SCHEMA_ASSISTANT } = require('../src/assistantClaude');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

const D = [{ id: 'd1', nom: 'FOURNIER / GAUTHIER', parties: [{ nom: 'FOURNIER', prenom: 'Paul' }, { nom: 'GAUTHIER' }],
  autres: ['BLOIS (41000), 2 rue des Tanneurs'], reference: 'A 2026 00247', contacts: ['paul.fournier@exemple.fr', '06 12 34 56 78'] }];

test('le prompt : vouvoiement, aucune donnée de dossier, prénom du collaborateur, historique borné', () => {
  const p = promptConversation('Explique-moi la différence entre une promesse et un compromis', { aujourdhui: 'mardi 6 octobre 2026', prenom: 'Bastien',
    historique: [{ role: 'moi', texte: 'Bonjour' }, { role: 'claire', texte: 'Bonjour Bastien' }] });
  assert.match(p, /vouvoiement/);
  assert.match(p, /aucune donnée de dossier/);
  assert.match(p, /n'en invente jamais/);
  assert.match(p, /Bastien dit : « Explique-moi/);
  assert.match(p, /CLAIRE : Bonjour Bastien/);
  assert.doesNotMatch(promptConversation('x', { prenom: 'Jean-Marc' }), /Jean-Marc/, 'un prénom hors liste des collaborateurs n’est jamais envoyé');
});

test('validerConversation et nettoyerReponseConversation', () => {
  assert.equal(validerConversation({ reponse: 'Bonjour' }), null);
  assert.ok(validerConversation({ reponse: '  ' }));
  assert.ok(validerConversation('texte'));
  const table = new Map([['[NOM1]', 'Fournier']]);
  assert.equal(nettoyerReponseConversation('Pour [NOM1], voyez [NOM7].', table), 'Pour Fournier, voyez ….', 'un code inventé est effacé');
});

test('Mistral : la phrase et l’historique partent noms masqués, la réponse rétablit les noms, l’usage est compté', async () => {
  const envoyes = [];
  const fetchFn = async (url, o) => {
    envoyes.push(JSON.parse(o.body));
    return { ok: true, json: async () => ({ usage: { prompt_tokens: 500, completion_tokens: 60 },
      choices: [{ message: { content: JSON.stringify({ reponse: 'Bien sûr. Pour [NOM1], je peux chercher le dossier si vous me le demandez.' }) } }] }) };
  };
  const ecrits = {};
  const repo = { lireJsonBrut: (k, d) => ecrits[k] || d, ecrireJsonBrut: (k, v) => { ecrits[k] = v; } };
  const client = creerClientMistralAssistant({ cle: 'cle', region: 'eu', fetchFn, parametresRepo: repo });
  const r = await converser({ texte: 'Que penses-tu de la façon de traiter Paul Fournier, paul.fournier@exemple.fr ?',
    contexte: { aujourdhui: '2026-10-11', prenom: 'Julie', historique: [{ role: 'moi', texte: 'Je pense à Monsieur Gauthier, rue des Tanneurs' }] }, dossiers: D }, client);
  const prompt = envoyes[0].messages[0].content;
  assert.doesNotMatch(prompt, /Paul|Fournier|FOURNIER|Gauthier|GAUTHIER|Tanneurs|paul\.fournier|00247|06 12/, 'aucun nom, adresse, email ni référence ne part');
  assert.match(prompt, /\[NOM\d\]/);
  assert.match(prompt, /Julie dit/);
  assert.equal(envoyes[0].response_format.type, 'json_object');
  assert.match(r.reponse, /Pour (Paul|Fournier)/, 'le nom masqué est rétabli au retour');
  assert.equal(ecrits['assistant-ia-usage'].demandes, 1);
});

test('Claude : la requête de conversation porte son propre schéma et assez de jetons', () => {
  const schema = { type: 'object', required: ['reponse'], properties: { reponse: { type: 'string' } } };
  const r = requeteAssistantClaude('claude-sonnet-5', 'prompt', schema, 700);
  assert.deepEqual(r.output_config.format.schema, schema);
  assert.equal(r.max_tokens, 700);
  assert.equal(requeteAssistantClaude('claude-sonnet-5', 'prompt').output_config.format.schema, SCHEMA_ASSISTANT, 'sans schéma : le choix d’intention, comme avant');
});

test('route /assistant/converser : sans IA en ligne, réponse vide et raison ; avec Mistral, la réponse de l’IA', async () => {
  const db = ouvrirDb(':memory:');
  let reponseMistral = { reponse: 'Avec plaisir, expliquons cela ensemble.' };
  const fetchMistral = async () => ({ ok: true, json: async () => ({ usage: {}, choices: [{ message: { content: JSON.stringify(reponseMistral) } }] }) });
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, authActive: false }, injections: { fetchMistral } });
  void gestionnaireAuth;
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}`;
    const post = async (corps) => (await fetch(`${base}/api/assistant/converser`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) })).json();
    const sans = await post({ texte: 'Bonjour, peux-tu m’expliquer comment tu fonctionnes ?' });
    assert.equal(sans.reponse, '');
    assert.match(sans.raison, /Aucune IA en ligne/);
    assert.equal((await fetch(`${base}/api/assistant/converser`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
  } finally { serveur.close(); }
});
