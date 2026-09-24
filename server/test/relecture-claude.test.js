'use strict';

// Relecture d'actes par l'API Claude (relecture/claude.js + routes/relectureClaude.js). Aucun appel
// réseau : le client Anthropic est remplacé par un faux qui enregistre ce qu'il reçoit.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirReglagesClaude } = require('../src/parametresRepo');
const {
  calculerCoutUsd, estimerCoutUsd, validerGrille, validerDocuments, construireTexteDocuments,
  construireSystemPrompt, normaliserAnalyse, verifierCitations
} = require('../src/relecture/claude');

const grille = [
  { id: 'dpe', section: 'Diagnostics', intitule: 'DPE', declencheur: 'Tous les biens', base_legale: 'Validité 10 ans' },
  { id: 'alur_pv_ag', section: 'Copropriété', intitule: 'PV des 3 dernières AG', declencheur: 'Bien en copropriété' }
];
const texteDoc = 'Page un de l’acte. ⟦PERSONNE_1⟧ vend à ⟦PERSONNE_2⟧ le bien. Le diagnostic de performance énergétique a été établi le 12 mars 2025 par le cabinet.';
const documents = [{
  nom: 'Projet.pdf', nature: 'acte', role: 'principal', texte: texteDoc,
  pages: [{ numero: 1, debut: 0, fin: 20 }, { numero: 2, debut: 20, fin: texteDoc.length }]
}];

test('calculerCoutUsd : tarifs Sonnet 5 et Opus 5, cache compté, modèle inconnu = null', () => {
  assert.equal(calculerCoutUsd({ input_tokens: 1e6, output_tokens: 1e5 }, 'claude-sonnet-5'), 3);
  assert.equal(calculerCoutUsd({ input_tokens: 1e6, output_tokens: 1e5 }, 'claude-opus-5'), 7.5);
  assert.equal(calculerCoutUsd({ cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }, 'claude-sonnet-5'), 2.7);
  assert.equal(calculerCoutUsd({ input_tokens: 10 }, 'modele-inconnu'), null);
  const e = estimerCoutUsd(100000, 'claude-sonnet-5');
  assert.ok(e.bas < e.haut && e.bas > 0.2);
});

test('validerGrille / validerDocuments : identifiants, doublons, volume refusé plutôt que tronqué', () => {
  assert.ok(validerGrille(grille).grille);
  assert.ok(validerGrille([{ id: 'A B' }]).erreur);
  assert.ok(validerGrille([grille[0], grille[0]]).erreur);
  assert.ok(validerDocuments([]).erreur);
  assert.match(validerDocuments([{ texte: 'x'.repeat(950000) }]).erreur, /trop volumineux/);
  const d = validerDocuments(documents).documents;
  assert.equal(d[0].numero, 1);
  assert.equal(d[0].pages.length, 2);
});

test('construireTexteDocuments : balises de document et repères de page, annexes marquées', () => {
  const d = validerDocuments([{ ...documents[0], annexesDepuisPage: 2 }]).documents;
  const t = construireTexteDocuments(d);
  assert.match(t, /<document numero="1" nom="Projet.pdf" role="principal"/);
  assert.match(t, /\[\[page 1\]\]/);
  assert.match(t, /\[\[page 2 — annexe jointe\]\]/);
});

test('construireSystemPrompt : grille injectée, mode projet de vente = comparaison, plusieurs copropriétés', () => {
  const s = construireSystemPrompt('acte', grille);
  assert.match(s, /\[dpe\] DPE — s'applique si : Tous les biens \(Validité 10 ans\)/);
  assert.match(s, /avant_contrat/);
  assert.match(s, /Plusieurs copropriétés/);
  assert.doesNotMatch(construireSystemPrompt('compromis', grille), /Comparaison avec l'avant-contrat/);
  assert.doesNotMatch(construireSystemPrompt('compromis', grille, []), /CONSIGNES DE L'ÉTUDE/);
  assert.match(construireSystemPrompt('compromis', grille, ['Ne signale pas la clause de visite']), /CONSIGNES DE L'ÉTUDE[\s\S]*- Ne signale pas la clause de visite/);
});

test('verifierCitations : page recalculée depuis la position réelle, citation inventée signalée', () => {
  const d = validerDocuments(documents).documents;
  const [ok, faux] = verifierCitations([
    { document: 1, page: 1, extrait: 'Le diagnostic de performance énergétique a été établi le 12 mars 2025' },
    { document: 1, page: 2, extrait: 'Le vendeur déclare que la toiture a été refaite en 2019' }
  ], d);
  assert.equal(ok.verifie, true);
  assert.equal(ok.page, 2); // le modèle disait 1 : c'est la position réelle qui fait foi
  assert.equal(faux.verifie, false);
});

test('normaliserAnalyse : point oublié = à vérifier (jamais présent), point inventé écarté, ordre de la grille', () => {
  const d = validerDocuments(documents).documents;
  const a = normaliserAnalyse({
    synthese: 'Vente.',
    points: [
      { id: 'inconnu', statut: 'present', commentaire: '', citations: [] },
      { id: 'dpe', statut: 'bizarre', commentaire: 'DPE annexé', citations: [] }
    ],
    anomalies: [{ titre: 'Dates incohérentes', description: '', gravite: 'xx', citations: [] }, { titre: '' }]
  }, grille, d);
  assert.equal(a.points.map(p => p.id).join(','), 'dpe,alur_pv_ag');
  assert.equal(a.points[0].statut, 'a_verifier');
  assert.equal(a.points[1].omis, true);
  assert.equal(a.points[1].statut, 'a_verifier');
  assert.equal(a.anomalies.length, 1);
  assert.equal(a.anomalies[0].gravite, 'moyenne');
});

test('assainirReglagesClaude : clé conservée si absente, effacée si vide, modèle borné', () => {
  const p = assainirReglagesClaude({ cleApi: 'sk-ant-x', modele: 'claude-opus-5' });
  assert.equal(assainirReglagesClaude({ modele: 'claude-sonnet-5' }, p).cleApi, 'sk-ant-x');
  assert.equal(assainirReglagesClaude({ cleApi: '' }, p).cleApi, '');
  assert.equal(assainirReglagesClaude({ modele: 'gpt' }, p).modele, 'claude-opus-5');
  assert.equal(assainirReglagesClaude({}).modele, 'claude-sonnet-5');
});

// ---- Route, avec un faux client Anthropic ----
let db, serveurApp, baseUrl, jeton;
const appels = [];
let reponseSuivante = null;

function fauxClient(cle) {
  return {
    messages: {
      countTokens: async (p) => { appels.push({ type: 'count', cle, p }); return { input_tokens: 12000 }; },
      stream: (p) => { appels.push({ type: 'stream', cle, p }); return { finalMessage: async () => reponseSuivante }; }
    },
    beta: { messages: { stream: (p) => { appels.push({ type: 'beta', cle, p }); return { finalMessage: async () => reponseSuivante }; } } },
    models: { retrieve: async (id) => ({ id, display_name: 'Claude Sonnet 5' }) }
  };
}

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' }, creerClientClaude: fauxClient });
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

test('route : sans clé, 503 et état « non configuré »', async () => {
  const etat = await (await appeler('/api/relecture-claude/etat')).json();
  assert.equal(etat.configure, false);
  const r = await appeler('/api/relecture-claude/analyser', 'POST', { mode: 'compromis', grille, documents });
  assert.equal(r.status, 503);
});

test('route : la clé enregistrée ne ressort jamais, seul un booléen', async () => {
  const r = await (await appeler('/api/relecture-claude/reglages', 'PUT', { cleApi: 'sk-ant-secret', modele: 'claude-sonnet-5' })).json();
  assert.equal(r.cleEnregistree, true);
  assert.equal(JSON.stringify(r).includes('sk-ant-secret'), false);
  const g = await (await appeler('/api/relecture-claude/reglages')).json();
  assert.equal(JSON.stringify(g).includes('sk-ant-secret'), false);
  const t = await (await appeler('/api/relecture-claude/tester', 'POST', {})).json();
  assert.equal(t.ok, true);
});

test('route : estimation par comptage de jetons', async () => {
  const r = await (await appeler('/api/relecture-claude/estimer', 'POST', { mode: 'compromis', grille, documents })).json();
  assert.equal(r.jetonsEntree, 12000);
  assert.ok(r.coutEstime.bas > 0);
});

test('route : analyse — sortie structurée demandée, citations vérifiées, coût facturé et journal', async () => {
  const sortie = {
    type_acte: 'Compromis', synthese: 'Vente simple.', coproprietes: [],
    points: [{ id: 'dpe', statut: 'present', commentaire: 'DPE du 12 mars 2025', citations: [{ document: 1, page: 1, extrait: 'Le diagnostic de performance énergétique a été établi le 12 mars 2025' }] }],
    anomalies: []
  };
  reponseSuivante = { model: 'claude-sonnet-5', stop_reason: 'end_turn', usage: { input_tokens: 20000, output_tokens: 5000 }, content: [{ type: 'text', text: JSON.stringify(sortie) }] };
  const r = await appeler('/api/relecture-claude/analyser', 'POST', { mode: 'compromis', grille, documents, libelle: 'Test' });
  assert.equal(r.status, 200);
  const corps = await r.json();
  const appel = appels.filter(a => a.type === 'stream').pop();
  assert.equal(appel.cle, 'sk-ant-secret');
  assert.equal(appel.p.output_config.format.type, 'json_schema');
  assert.deepEqual(appel.p.thinking, { type: 'adaptive' });
  assert.equal(corps.analyse.points[0].citations[0].verifie, true);
  assert.equal(corps.analyse.points[0].citations[0].page, 2);
  assert.equal(corps.analyse.points[1].statut, 'a_verifier');
  assert.equal(corps.facture.coutUsd, 0.09);
  const j = await (await appeler('/api/relecture-claude/journal')).json();
  assert.equal(j.totalNb, 1);
  assert.equal(j.analyses[0].libelle, 'Test');
  const archive = db.prepare('SELECT requete FROM analyses_claude').get();
  assert.match(archive.requete, /⟦PERSONNE_1⟧/); // archivé tel qu'envoyé : pseudonymisé
});

test('route : Opus 5 passe par le repli serveur ; un refus est signalé, facturé et journalisé', async () => {
  await appeler('/api/relecture-claude/reglages', 'PUT', { modele: 'claude-opus-5' });
  reponseSuivante = { model: 'claude-opus-5', stop_reason: 'refusal', usage: { input_tokens: 0, output_tokens: 0 }, content: [] };
  const r = await appeler('/api/relecture-claude/analyser', 'POST', { mode: 'acte', grille, documents });
  assert.equal(r.status, 502);
  const corps = await r.json();
  assert.match(corps.erreur, /refusé/);
  const appel = appels.filter(a => a.type === 'beta').pop();
  assert.equal(appel.p.fallbacks, 'default');
  assert.equal(appel.p.betas[0], 'server-side-fallback-2026-07-01');
});
