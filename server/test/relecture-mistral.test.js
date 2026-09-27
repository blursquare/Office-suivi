'use strict';

// Relecture d'actes par l'API Mistral (relecture/mistral.js + routes/relectureClaude.js). Aucun
// appel réseau : fetch et l'appel Mistral sont remplacés par des doublures.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirReglagesClaude } = require('../src/parametresRepo');
const { SCHEMA_RELECTURE } = require('../src/relecture/claude');
const {
  estimerJetonsMistral, calculerCoutMistralUsd, estimerCoutMistralUsd, construireCorpsMistral,
  texteDepuisDelta, lireFluxMistral, appelerMistral, messageErreurMistral, baseMistral,
  LIMITE_JETONS_ENTREE_MISTRAL
} = require('../src/relecture/mistral');

const grille = [
  { id: 'dpe', section: 'Diagnostics', intitule: 'DPE', declencheur: 'Tous les biens', base_legale: 'Validité 10 ans' },
  { id: 'alur_pv_ag', section: 'Copropriété', intitule: 'PV des 3 dernières AG', declencheur: 'Bien en copropriété' }
];
const texteDoc = 'Page un de l’acte. ⟦PERSONNE_1⟧ vend à ⟦PERSONNE_2⟧ le bien. Le diagnostic de performance énergétique a été établi le 12 mars 2025 par le cabinet.';
const documents = [{
  nom: 'Projet.pdf', nature: 'acte', role: 'principal', texte: texteDoc,
  pages: [{ numero: 1, debut: 0, fin: 20 }, { numero: 2, debut: 20, fin: texteDoc.length }]
}];

// Un flux SSE tel que Mistral le rend : chunks JSON, découpés n'importe où (y compris au milieu
// d'une ligne), trace de raisonnement puis réponse, consommation dans le dernier chunk.
function fluxSse(evenements, tailleMorceau) {
  const texte = evenements.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  const octets = new TextEncoder().encode(texte);
  const n = tailleMorceau || 7;
  return (async function* () {
    for (let i = 0; i < octets.length; i += n) yield octets.slice(i, i + n);
  })();
}

test('tarifs et estimation : point d\'accès UE majoré de 10 %, modèle inconnu = null', () => {
  assert.equal(calculerCoutMistralUsd({ prompt_tokens: 1e6, completion_tokens: 1e5 }, 'mistral-medium-3-5', 'global'), 2.25);
  assert.equal(calculerCoutMistralUsd({ prompt_tokens: 1e6, completion_tokens: 1e5 }, 'mistral-medium-3-5', 'eu'), 2.475);
  assert.equal(calculerCoutMistralUsd({ prompt_tokens: 1e6, completion_tokens: 1e6 }, 'mistral-large-2512', 'global'), 2);
  assert.equal(calculerCoutMistralUsd({ prompt_tokens: 10 }, 'inconnu', 'eu'), null);
  const e = estimerCoutMistralUsd(100000, 'mistral-medium-3-5', 'eu');
  assert.ok(e.bas > 0 && e.bas < e.haut);
  // Estimation pessimiste : 3,2 caractères par jeton.
  assert.equal(estimerJetonsMistral('x'.repeat(320), 'y'.repeat(320)), 200);
  assert.ok(LIMITE_JETONS_ENTREE_MISTRAL < 256000);
  assert.equal(baseMistral('eu'), 'https://api.eu.mistral.ai');
  assert.equal(baseMistral('nimporte'), 'https://api.eu.mistral.ai');
});

test('corps de requête : sortie structurée stricte, raisonnement seulement sur Medium 3.5', () => {
  const c = construireCorpsMistral({ modele: 'mistral-medium-3-5', system: 'S', contenu: 'C', schema: SCHEMA_RELECTURE, raisonnement: true });
  assert.equal(c.stream, true);
  assert.equal(c.response_format.type, 'json_schema');
  assert.equal(c.response_format.json_schema.strict, true);
  assert.equal(c.response_format.json_schema.schema, SCHEMA_RELECTURE);
  assert.equal(c.reasoning_effort, 'high');
  assert.equal(c.messages[0].role, 'system');
  assert.equal(construireCorpsMistral({ modele: 'mistral-large-2512', system: 'S', contenu: 'C', schema: {}, raisonnement: true }).reasoning_effort, undefined);
  assert.equal(construireCorpsMistral({ modele: 'mistral-medium-3-5', system: 'S', contenu: 'C', schema: {}, raisonnement: false }).reasoning_effort, undefined);
});

test('flux : la trace de raisonnement est écartée, le texte recollé, la consommation lue', async () => {
  assert.equal(texteDepuisDelta([{ type: 'thinking', thinking: [{ type: 'text', text: 'je réfléchis' }] }]), '');
  assert.equal(texteDepuisDelta([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'ab');
  const r = await lireFluxMistral(fluxSse([
    { model: 'mistral-medium-2604', choices: [{ delta: { content: [{ type: 'thinking', thinking: [{ type: 'text', text: 'raisonnement' }] }] } }] },
    { choices: [{ delta: { content: '{"type_acte":' } }] },
    { choices: [{ delta: { content: '"Compromis ⟦PERSONNE_1⟧"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } },
    '[DONE]'
  ], 5));
  assert.equal(r.texte, '{"type_acte":"Compromis ⟦PERSONNE_1⟧"}');
  assert.equal(r.modele, 'mistral-medium-2604');
  assert.equal(r.finishReason, 'stop');
  assert.equal(r.usage.prompt_tokens, 100);
});

test('appelerMistral : point d\'accès UE, clé en en-tête ; 400 sur le raisonnement = une relance sans', async () => {
  const appels = [];
  const fauxFetch = async (url, init) => {
    const corps = JSON.parse(init.body);
    appels.push({ url, auth: init.headers.Authorization, corps });
    if (corps.reasoning_effort) return { ok: false, status: 400, text: async () => 'reasoning_effort not supported with response_format' };
    return { ok: true, status: 200, body: fluxSse([{ choices: [{ delta: { content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 1 } }]) };
  };
  const r = await appelerMistral({ cle: 'cle-m', modele: 'mistral-medium-3-5', region: 'eu', system: 'S', contenu: 'C', schema: {}, fetchFn: fauxFetch });
  assert.equal(r.texte, '{}');
  assert.equal(appels.length, 2);
  assert.equal(appels[0].url, 'https://api.eu.mistral.ai/v1/chat/completions');
  assert.equal(appels[0].auth, 'Bearer cle-m');
  assert.equal(appels[1].corps.reasoning_effort, undefined);

  // Une clé refusée n'est pas relancée.
  const refus = async () => ({ ok: false, status: 401, text: async () => '' });
  await assert.rejects(appelerMistral({ cle: 'x', modele: 'mistral-medium-3-5', region: 'eu', system: 'S', contenu: 'C', schema: {}, fetchFn: refus }), (e) => e.status === 401);
  assert.match(messageErreurMistral({ status: 401 }), /Clé API refusée par Mistral/);
  assert.match(messageErreurMistral({ status: 404 }), /région/);
});

test('réglages : Mistral par défaut (y compris pour des réglages Claude anciens), clé conservée/effacée', () => {
  assert.equal(assainirReglagesClaude({}).fournisseur, 'mistral');
  assert.equal(assainirReglagesClaude({}).modeleMistral, 'mistral-medium-3-5');
  assert.equal(assainirReglagesClaude({}).regionMistral, 'eu');
  const ancien = { cleApi: 'sk-ant-x', modele: 'claude-opus-5' };
  const a = assainirReglagesClaude({}, ancien);
  assert.equal(a.fournisseur, 'mistral');
  assert.equal(a.cleApi, 'sk-ant-x'); // la clé Anthropic n'est pas perdue
  const p = assainirReglagesClaude({ cleMistral: 'm-1', modeleMistral: 'mistral-large-2512', regionMistral: 'global' });
  assert.equal(assainirReglagesClaude({ fournisseur: 'claude' }, p).cleMistral, 'm-1');
  assert.equal(assainirReglagesClaude({ cleMistral: '' }, p).cleMistral, '');
  assert.equal(assainirReglagesClaude({ modeleMistral: 'gpt', regionMistral: 'mars' }, p).modeleMistral, 'mistral-large-2512');
  assert.equal(assainirReglagesClaude({ regionMistral: 'mars' }, p).regionMistral, 'global');
});

// ---- Route, avec un faux appel Mistral ----
let db, serveurApp, baseUrl, jeton;
const appelsMistral = [];
let reponseMistral = null;

before(async () => {
  delete process.env.MISTRAL_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({
    db,
    config: { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' },
    creerClientClaude: () => { throw new Error('Claude ne doit pas être appelé'); },
    appelerMistral: async (p) => { appelsMistral.push(p); if (reponseMistral instanceof Error) throw reponseMistral; return reponseMistral; },
    testerMistral: async (p) => ({ id: p.modele, libelle: 'Mistral Medium 3.5' })
  });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => { serveurApp.close(); db.close(); });

function appeler(chemin, methode, corps) {
  return fetch(`${baseUrl}${chemin}`, {
    method: methode || 'GET',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined
  });
}

test('route : Mistral est le fournisseur par défaut ; sans clé, 503 qui le nomme', async () => {
  const etat = await (await appeler('/api/relecture-claude/etat')).json();
  assert.equal(etat.fournisseur, 'mistral');
  assert.equal(etat.region, 'eu');
  assert.equal(etat.configure, false);
  const r = await appeler('/api/relecture-claude/analyser', 'POST', { mode: 'compromis', grille, documents });
  assert.equal(r.status, 503);
  assert.match((await r.json()).erreur, /Mistral/);
});

test('route : la clé Mistral ne ressort jamais ; test de la clé', async () => {
  const r = await (await appeler('/api/relecture-claude/reglages', 'PUT', { cleMistral: 'cle-mistral-secrete' })).json();
  assert.equal(r.cleMistralEnregistree, true);
  assert.equal(r.fournisseur, 'mistral');
  assert.equal(JSON.stringify(r).includes('cle-mistral-secrete'), false);
  const g = await (await appeler('/api/relecture-claude/reglages')).json();
  assert.equal(JSON.stringify(g).includes('cle-mistral-secrete'), false);
  const t = await (await appeler('/api/relecture-claude/tester', 'POST', {})).json();
  assert.equal(t.ok, true);
  assert.equal(t.fournisseur, 'mistral');
});

test('route : estimation sans appel réseau, signalée comme estimée', async () => {
  const r = await (await appeler('/api/relecture-claude/estimer', 'POST', { mode: 'compromis', grille, documents })).json();
  assert.equal(r.fournisseur, 'mistral');
  assert.equal(r.estime, true);
  assert.ok(r.jetonsEntree > 0);
  assert.ok(r.coutEstime.bas > 0);
  assert.equal(r.depasse, false);
  assert.equal(r.limiteJetons, LIMITE_JETONS_ENTREE_MISTRAL);
  assert.equal(appelsMistral.length, 0);
});

test('route : analyse Mistral — texte pseudonymisé envoyé, citations vérifiées, coût et journal', async () => {
  const sortie = {
    type_acte: 'Compromis', synthese: 'Vente simple.', coproprietes: [],
    points: [{ id: 'dpe', statut: 'present', commentaire: 'DPE du 12 mars 2025', citations: [{ document: 1, page: 1, extrait: 'Le diagnostic de performance énergétique a été établi le 12 mars 2025' }] }],
    anomalies: []
  };
  reponseMistral = { texte: JSON.stringify(sortie), usage: { prompt_tokens: 20000, completion_tokens: 5000 }, modele: 'mistral-medium-2604', finishReason: 'stop' };
  const r = await appeler('/api/relecture-claude/analyser', 'POST', { mode: 'compromis', grille, documents, libelle: 'Test Mistral' });
  assert.equal(r.status, 200);
  const corps = await r.json();
  const appel = appelsMistral.pop();
  assert.equal(appel.cle, 'cle-mistral-secrete');
  assert.equal(appel.region, 'eu');
  assert.equal(appel.modele, 'mistral-medium-3-5');
  assert.match(appel.contenu, /⟦PERSONNE_2⟧/);
  assert.equal(corps.analyse.points[0].citations[0].verifie, true);
  assert.equal(corps.analyse.points[0].citations[0].page, 2);
  assert.equal(corps.analyse.points[1].statut, 'a_verifier');
  assert.equal(corps.facture.fournisseur, 'mistral');
  // (20 000 × 1,5 + 5 000 × 7,5) / 1e6 × 1,1 = 0,07425 $ — tarif lu sur le modèle DEMANDÉ.
  assert.equal(corps.facture.coutUsd, 0.0743);
  const j = await (await appeler('/api/relecture-claude/journal')).json();
  assert.equal(j.analyses[0].libelle, 'Test Mistral');
  const archive = db.prepare('SELECT requete FROM analyses_claude').get();
  assert.match(archive.requete, /"fournisseur":"mistral"/);
});

test('route : réponse coupée ou erreur réseau Mistral signalées clairement', async () => {
  reponseMistral = { texte: '{"type_acte":', usage: { prompt_tokens: 10, completion_tokens: 40000 }, modele: 'mistral-medium-3-5', finishReason: 'length' };
  let r = await appeler('/api/relecture-claude/analyser', 'POST', { mode: 'compromis', grille, documents });
  assert.equal(r.status, 502);
  assert.match((await r.json()).erreur, /longueur de réponse/);
  reponseMistral = Object.assign(new Error('x'), { status: 429 });
  r = await appeler('/api/relecture-claude/analyser', 'POST', { mode: 'compromis', grille, documents });
  assert.equal(r.status, 502);
  assert.match((await r.json()).erreur, /débit atteinte chez Mistral/);
});
