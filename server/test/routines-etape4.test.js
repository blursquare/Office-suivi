'use strict';

// Étape 4 du vrai agent (étude 29/10) : contrôle du rendez-vous de signature (délai de réflexion, vente préalable, DIA/SAFER, pièces,
// diagnostics périmés lus dans l'index du NAS) et dossiers qui n'avancent plus depuis trois semaines. Dossiers inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const X = require('../src/routines/executants');
const { CATALOGUE } = require('../src/routines/catalogue');

const vente = (o) => Object.assign({ id: 'v1', nom: 'MARTEL / FOURNIER', responsable: 'Julie VASSELIN', typeVente: 'maison', roleNotaire: 'instrumentaire', pieces: {}, historique: [{ date: '2026-10-20T09:00:00', texte: 'Dossier créé' }] }, o);

test('diagnostics : un ERP de plus de six mois, un DPE valable ; sans date lue, rien n’est jugé', () => {
  const docs = [{ type: 'État des risques (ERP)', date: '2026-03-01', resume: '' }, { type: 'DPE', date: '2022-05-01', resume: '' }, { type: 'Diagnostic termites', date: '', resume: '' }];
  const p = X.diagnosticsPerimes(docs, '2026-11-20');
  assert.equal(p.map((x) => x.nom).join(','), 'État des risques (ERP)');
  assert.equal(p[0].fin, '2026-09-01');
  assert.equal(X.plusMois('2026-03-01', 6), '2026-09-01');
});

test('contrôle du rendez-vous : offre trop tard, pièces, diagnostic périmé — une alerte par date et par liste de problèmes', () => {
  const d = vente({ rendezVousSignature: '2026-11-20', pret: '2026-11-15' });
  const ctx = { documentsDossier: () => [{ type: 'ERP', date: '2026-03-01', resume: '' }] };
  const r = X.controleRendezVous([d], '2026-10-30', ctx);
  assert.equal(r.length, 1);
  assert.equal(r[0].type, 'alerte');
  assert.match(r[0].resume, /moins de 11 jours de réflexion/);
  assert.match(r[0].resume, /État des risques/);
  const r2 = X.controleRendezVous([Object.assign({}, d, { rendezVousSignature: '2026-11-21' })], '2026-10-30', ctx);
  assert.notEqual(r2[0].empreinte, r[0].empreinte, 'déplacé : nouveau contrôle');
  assert.deepEqual(X.controleRendezVous([vente({ rendezVousSignature: '2026-11-20', roleNotaire: 'participant' })], '2026-10-30', ctx), []);
  assert.deepEqual(X.controleRendezVous([vente({ rendezVousSignature: '2026-10-01', pret: '2026-09-28' })], '2026-10-30', ctx), [], 'rendez-vous passé : rien');
});

test('dossiers bloqués : trois semaines sans activité → une alerte avec ce qui retient ; activité récente → rien', () => {
  const vieux = vente({ historique: [{ date: '2026-10-01T09:00:00', texte: 'Pièce reçue' }], pret: '2026-11-15' });
  const r = X.dossiersBloques([vieux], '2026-10-30');
  assert.equal(r.length, 1);
  assert.match(r[0].titre, /Rien de neuf depuis 29 jours/);
  assert.equal(r[0].empreinte, 'bloque:v1:2026-10-01');
  assert.deepEqual(X.dossiersBloques([vente()], '2026-10-30'), []);
  assert.deepEqual(X.dossiersBloques([vente({ archive: true, historique: [{ date: '2026-09-01' }] })], '2026-10-30'), []);
});

test('catalogue : les deux routines de l’étape 4, allumées par défaut, sans IA, niveau 1 seulement', () => {
  for (const id of ['controle-rendez-vous', 'dossiers-bloques']) {
    const r = CATALOGUE.find((x) => x.id === id);
    assert.ok(r && r.allumeeParDefaut && !r.ia && r.gestes.every((g) => g.niveauMax === 1));
  }
});

test('étape 5 : une demande d’Authentic sans réponse après 15 jours → tâche de relance, une par quinzaine ; pièce reçue → rien', () => {
  const d = vente({ authentic: { demandes: { noteUrbanisme: { date: '2026-10-01', titre: 'Note de renseignements d’urbanisme' }, renonciationPreemption: { date: '2026-10-10', titre: 'DIA' } } } });
  const r = X.relancesFormalites([d], '2026-10-20');
  assert.equal(r.map((x) => x.titre.split(' — ')[0]).join('|'), 'Relancer : Note de renseignements d’urbanisme');
  assert.notEqual(X.relancesFormalites([d], '2026-11-05')[0].empreinte, r[0].empreinte, 'nouvelle quinzaine : nouvelle relance');
  assert.deepEqual(X.relancesFormalites([vente(Object.assign({}, d, { pieces: { noteUrbanisme: 'recue' } }))], '2026-10-20'), []);
});

test('email reçu dans un dossier : sujet reconnu ou pièce jointe → proposition des suites ; déjà répondu ou ancien → rien', () => {
  const d = vente({});
  const recu = { id: 'e1', dossierId: 'v1', sens: 'recu', date: '2026-10-30T08:00:00Z', de: { nom: 'Agence Exemple', adresse: 'agence@exemple.fr' }, objet: 'Offre de prêt', sujets: ['Offre de prêt', 'Pièces'], pj: [{ nom: 'x.pdf' }] };
  const ctx = (emails) => ({ emailsDossiers: () => emails });
  const r = X.emailsRecusDossiers([d], '2026-10-30', ctx([recu]));
  assert.equal(r.length, 1);
  assert.match(r[0].resume, /calculer les quotités/);
  assert.match(r[0].titre, /1 pièce jointe/);
  assert.deepEqual(X.emailsRecusDossiers([d], '2026-10-30', ctx([recu, { id: 'e2', dossierId: 'v1', sens: 'envoye', date: '2026-10-30T09:00:00Z', a: ['agence@exemple.fr'] }])), []);
  assert.deepEqual(X.emailsRecusDossiers([d], '2026-11-05', ctx([recu])), []);
  assert.deepEqual(X.emailsRecusDossiers([d], '2026-10-30', ctx([Object.assign({}, recu, { sujets: [], pj: [] })])), [], 'un email sans sujet ni pièce : pas de bruit');
});
