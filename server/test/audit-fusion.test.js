'use strict';

// Outil 2 (Audit des actes) — vérification des citations et fusion (server/src/audit/fusion.js).
// Même principe que server/src/extraction/extraits.js : le signal de fiabilité d'un constat est la
// vérification MÉCANIQUE de sa citation contre le texte réel, jamais un score auto-déclaré du modèle.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  graviteOuDefaut, pageDepuisIndexServeur, verifierSources, verifierConstats,
  fusionnerDiagnostics, calculerResume
} = require('../src/audit/fusion');

test('graviteOuDefaut accepte les 4 valeurs et remplace le reste par A_VERIFIER', () => {
  assert.equal(graviteOuDefaut('CRITIQUE'), 'CRITIQUE');
  assert.equal(graviteOuDefaut('INFORMATION'), 'INFORMATION');
  assert.equal(graviteOuDefaut('URGENT'), 'A_VERIFIER');
  assert.equal(graviteOuDefaut(undefined), 'A_VERIFIER');
});

test('pageDepuisIndexServeur retrouve la bonne page, replie sur la dernière au-delà', () => {
  const pages = [{ numero: 1, debut: 0, fin: 50 }, { numero: 2, debut: 50, fin: 120 }];
  assert.equal(pageDepuisIndexServeur(pages, 10), 1);
  assert.equal(pageDepuisIndexServeur(pages, 90), 2);
  assert.equal(pageDepuisIndexServeur(pages, 500), 2);
  assert.equal(pageDepuisIndexServeur([], 10), null);
  assert.equal(pageDepuisIndexServeur(pages, -1), null);
});

test('verifierSources retrouve un extrait dans le document nommé', () => {
  const documents = [
    { nom: 'Projet.pdf', texte: 'Le vendeur Monsieur Jean Dupont vend le bien.', pages: [{ numero: 1, debut: 0, fin: 46 }] },
    { nom: 'Titre.pdf', texte: 'Acte de propriété antérieur.', pages: [{ numero: 1, debut: 0, fin: 29 }] }
  ];
  const [source] = verifierSources([{ document: 'Projet.pdf', extrait: 'Monsieur Jean Dupont' }], documents);
  assert.equal(source.extraitTrouve, true);
  assert.equal(source.document, 'Projet.pdf');
  assert.equal(source.page, 1);
});

test('verifierSources retombe sur les autres documents si le nom cité est absent ou faux', () => {
  const documents = [
    { nom: 'Titre.pdf', texte: 'Acte de propriété antérieur, rien à voir.', pages: [{ numero: 1, debut: 0, fin: 42 }] },
    { nom: 'Projet.pdf', texte: 'Le vendeur Monsieur Jean Dupont vend le bien.', pages: [{ numero: 1, debut: 0, fin: 46 }] }
  ];
  const [source] = verifierSources([{ document: 'Nom Incorrect.pdf', extrait: 'Monsieur Jean Dupont' }], documents);
  assert.equal(source.extraitTrouve, true);
  assert.equal(source.document, 'Projet.pdf');
});

test('verifierSources : extrait introuvable nulle part → extraitTrouve false, document tel que cité', () => {
  const documents = [{ nom: 'Projet.pdf', texte: 'Un texte sans rapport avec la citation.', pages: [] }];
  const [source] = verifierSources([{ document: 'Projet.pdf', extrait: 'Ceci ne figure nulle part dans le texte' }], documents);
  assert.equal(source.extraitTrouve, false);
  assert.equal(source.page, null);
  assert.equal(source.document, 'Projet.pdf');
});

test('verifierConstats calcule sourceVerifiee à partir des sources vérifiées', () => {
  const documents = [{ nom: 'Projet.pdf', texte: 'Le prix de vente est de deux cent mille euros.', pages: [{ numero: 1, debut: 0, fin: 47 }] }];
  const constats = [
    { gravite: 'IMPORTANT', titre: 'Vrai', description: '', action: null, sources: [{ document: 'Projet.pdf', extrait: 'Le prix de vente est de deux cent mille' }] },
    { gravite: 'IMPORTANT', titre: 'Faux', description: '', action: null, sources: [{ document: 'Projet.pdf', extrait: 'Ceci n\'existe pas du tout dans le texte' }] },
    { gravite: 'INFORMATION', titre: 'Sans source', description: '', action: null, sources: [] }
  ];
  const verifies = verifierConstats(constats, documents);
  assert.equal(verifies[0].sourceVerifiee, true);
  assert.equal(verifies[1].sourceVerifiee, false);
  assert.equal(verifies[2].sourceVerifiee, false);
});

test('fusionnerDiagnostics dérive la gravité du statut de validité, jamais du modèle', () => {
  const documents = [{ nom: 'DPE.pdf', texte: 'Diagnostic de performance energetique etabli le 01 janvier 2020.', pages: [{ numero: 1, debut: 0, fin: 67 }] }];
  const diagnostics = [
    { nature: 'DPE', document: 'DPE.pdf', dateEtablissement: '2010-01-01', bienConcerne: null, extrait: 'Diagnostic de performance energetique' },
    { nature: 'DPE', document: 'DPE.pdf', dateEtablissement: '2024-01-01', bienConcerne: null, extrait: 'Diagnostic de performance energetique' },
    { nature: 'PLOMB', document: 'DPE.pdf', dateEtablissement: '2024-01-01', bienConcerne: null, extrait: 'Diagnostic de performance energetique' }
  ];
  const resultat = fusionnerDiagnostics(diagnostics, documents, '2026-01-01');
  assert.equal(resultat[0].statutValidite, 'EXPIRE');
  assert.equal(resultat[0].gravite, 'IMPORTANT');
  assert.equal(resultat[1].statutValidite, 'VALIDE');
  assert.equal(resultat[1].gravite, 'INFORMATION');
  assert.equal(resultat[2].statutValidite, 'NON_CALCULABLE');
  assert.equal(resultat[2].gravite, 'A_VERIFIER');
  assert.equal(resultat[0].sourceVerifiee, true);
});

test('calculerResume compte toutes les sections, y compris les diagnostics par leur gravité dérivée', () => {
  const objetFinal = {
    constats: [{ gravite: 'CRITIQUE' }], travaux: [{ gravite: 'IMPORTANT' }], urbanisme: [],
    preemptions: [{ gravite: 'A_VERIFIER' }], servitudes: [], copropriete: [],
    dates: [{ gravite: 'INFORMATION' }], diagnostics: [{ gravite: 'IMPORTANT' }]
  };
  const resume = calculerResume(objetFinal, 'acte', 5);
  assert.equal(resume.mode, 'acte');
  assert.equal(resume.nombreDocuments, 5);
  assert.deepEqual(resume.syntheseParGravite, { CRITIQUE: 1, IMPORTANT: 2, A_VERIFIER: 1, INFORMATION: 1 });
  assert.ok(resume.dateAnalyse);
});
