'use strict';

// Outil 2 (Audit des actes) — mémoire des décisions de l'étude sur les constats (script.js,
// section « apprentissage des constats d'Outil 2 ») : un constat écarté ou confirmé est reconnu
// au prochain audit par similarité de son empreinte (titre + extrait cité), jamais supprimé.
// Les fonctions testées ici prennent la mémoire en paramètre (pures) ; l'état de la page
// (memoireAuditConstats, un `let` invisible depuis ce harnais) les enrobe.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const EXTRAIT = "Le vendeur déclare que l'immeuble n'a fait l'objet d'aucuns travaux soumis à autorisation depuis moins de dix ans";

function constat(titre, extrait, description) {
  return {
    gravite: 'IMPORTANT',
    titre,
    description: description || '',
    sources: extrait ? [{ document: 'projet.pdf', page: 4, extrait, extraitTrouve: true }] : []
  };
}

test('empreinteConstat : titre et extrait cité, mots courts et nombres neutralisés', () => {
  const app = chargerApplication();
  const tokens = app.empreinteConstat(constat('Travaux non déclarés en 2021', EXTRAIT));
  assert.ok(tokens.size >= 5);
  assert.ok(tokens.has('travaux'));
  assert.ok(tokens.has('autorisation'));
  assert.ok(!tokens.has('en'));
  assert.ok(!tokens.has('2021'));
});

test('memoriserDecisionDans : enregistre une décision, sans toucher la mémoire passée', () => {
  const app = chargerApplication();
  const avant = [];
  const apres = app.memoriserDecisionDans(avant, constat('Travaux non déclarés', EXTRAIT), 'ecarte');
  assert.equal(avant.length, 0);
  assert.equal(apres.length, 1);
  assert.equal(apres[0].decision, 'ecarte');
  assert.equal(apres[0].nb, 1);
  assert.match(apres[0].titreExemple, /Travaux/);
});

test('decisionPourConstat : reconnaît le même constat, même avec un titre reformulé par le modèle', () => {
  const app = chargerApplication();
  const memoire = app.memoriserDecisionDans([], constat('Travaux non déclarés', EXTRAIT), 'ecarte');
  const reformule = constat("Absence de déclaration de travaux récents", EXTRAIT);
  const decision = app.decisionPourConstat(reformule, memoire);
  assert.ok(decision);
  assert.equal(decision.decision, 'ecarte');
});

test('decisionPourConstat : un constat sans rapport reste inconnu', () => {
  const app = chargerApplication();
  const memoire = app.memoriserDecisionDans([], constat('Travaux non déclarés', EXTRAIT), 'ecarte');
  const autre = constat('Prix de vente différent du compromis', "Le prix de vente est fixé à la somme de deux cent mille euros payable comptant le jour de la signature");
  assert.equal(app.decisionPourConstat(autre, memoire), null);
});

test('memoriserDecisionDans : changer d’avis remplace la décision, ne la cumule pas', () => {
  const app = chargerApplication();
  let memoire = app.memoriserDecisionDans([], constat('Travaux non déclarés', EXTRAIT), 'ecarte');
  memoire = app.memoriserDecisionDans(memoire, constat('Travaux non déclarés', EXTRAIT), 'confirme');
  assert.equal(memoire.length, 1);
  assert.equal(memoire[0].decision, 'confirme');
  assert.equal(memoire[0].nb, 2);
});

test('memoriserDecisionDans : une décision inconnue ou un constat trop court ne sont pas mémorisés', () => {
  const app = chargerApplication();
  assert.equal(app.memoriserDecisionDans([], constat('Travaux non déclarés', EXTRAIT), 'peut-etre').length, 0);
  assert.equal(app.memoriserDecisionDans([], constat('Prix', null), 'ecarte').length, 0);
});
