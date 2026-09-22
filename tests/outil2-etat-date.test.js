'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Textes synthétiques reprenant la STRUCTURE d'un état daté et d'un certificat d'urbanisme réels,
// avec des noms et des montants inventés — aucune donnée client n'entre dans le dépôt.

const doc = (nom, texte) => ({ nom, texte, pages: null });

test('un état daté est reconnu par son nom comme par son titre', () => {
  const app = chargerApplication();
  assert.equal(app.typeDocumentSyndicUrbanisme(doc('Etat date lot 12.pdf', 'Sans rapport')), 'etat-date');
  assert.equal(app.typeDocumentSyndicUrbanisme(doc('doc.pdf', 'ÉTAT DATÉ établi en application de l’article 5 du décret du 17 mars 1967')), 'etat-date');
  assert.equal(app.typeDocumentSyndicUrbanisme(doc('Pre-etat-date.pdf', '')), 'pre-etat-date');
  // « CU a) » est le raccourci interne de l'étude, déjà reconnu par la checklist de pièces ;
  // « CU » seul ne suffit pas — deux lettres ne désignent pas un document.
  assert.equal(app.typeDocumentSyndicUrbanisme(doc('CU a) DUPONT.pdf', '')), 'certificat-urbanisme');
  assert.equal(app.typeDocumentSyndicUrbanisme(doc("Certificat d'urbanisme.pdf", '')), 'certificat-urbanisme');
  assert.equal(app.typeDocumentSyndicUrbanisme(doc('Reponse urbanisme.pdf', '')), 'certificat-urbanisme');
  assert.equal(app.typeDocumentSyndicUrbanisme(doc('Compromis.pdf', 'Le vendeur remettra un état daté avant la vente.')), null);
});

test('une rubrique à « néant » ou à zéro ne produit aucun constat', () => {
  // Le syndic a répondu : il n'y a rien à signaler. Sans cette règle, chaque état daté produirait
  // une dizaine de constats et le rapport deviendrait l'inventaire que l'étude a demandé d'éviter.
  const app = chargerApplication();
  const a = app.analyserEtatDate(doc('Etat date.pdf', [
    'ÉTAT DATÉ',
    'Sommes restant dues par le copropriétaire cédant : néant.',
    'Fonds de travaux : 0,00 €.',
    'Emprunt souscrit par le syndicat : néant.',
    'Procédure en cours : sans objet.'
  ].join('\n')));
  assert.equal(a.type, 'etat-date');
  assert.equal(a.rubriques.length, 0);
});

test('les rubriques chiffrées d’un état daté remontent avec leur montant', () => {
  const app = chargerApplication();
  const a = app.analyserEtatDate(doc('Etat date.pdf', [
    'ÉTAT DATÉ du 3 septembre 2026',
    'Sommes restant dues par le copropriétaire cédant : 1 250,00 €.',
    'Sommes incombant au nouveau copropriétaire : 840,50 €.',
    'Fonds de travaux attaché au lot : 3 200,00 €.'
  ].join('\n')));
  const parCle = Object.fromEntries(a.rubriques.map(r => [r.cle, r.montant]));
  assert.equal(parCle.chargesImpayees, 1250);
  assert.equal(parCle.sommesIncombantAcquereur, 840.5);
  assert.equal(parCle.fondsTravaux, 3200);
});

test('procédure en cours et devis de ravalement sont relevés, avec leur question', () => {
  // Le cas réel qui a motivé la demande : c'est ce que l'étude avait fini par demander au confrère
  // à la main après avoir lu l'état daté.
  const app = chargerApplication();
  const a = app.analyserEtatDate(doc('Etat date.pdf', [
    'ÉTAT DATÉ',
    'Une procédure est en cours devant le tribunal judiciaire au sujet de l’affaissement de la cour.',
    'Des travaux de ravalement sont envisagés, un devis a été demandé à deux entreprises.'
  ].join('\n')));
  const cles = a.rubriques.map(r => r.cle);
  assert.ok(cles.includes('proceduresEnCours'));
  assert.ok(cles.includes('travauxEnvisages'));
  const procedure = a.rubriques.find(r => r.cle === 'proceduresEnCours');
  assert.equal(procedure.gravite, 'CRITIQUE');
  assert.equal(procedure.destinataire, 'syndic');
  assert.ok(/où elle en est/.test(procedure.question));
});

test('un pré-état daté ne dispense pas de demander l’état daté', () => {
  const app = chargerApplication();
  const constats = app.constatsEtatDate([
    app.analyserEtatDate(doc('Pre etat date.pdf', 'PRÉ-ÉTAT DATÉ du 4 janvier 2026\nAucune somme due.'))
  ], '2026-09-22', true);
  assert.equal(constats.length, 1);
  assert.ok(/état daté reste à demander/.test(constats[0].titre));
  assert.equal(constats[0].destinataire, 'syndic');
});

test('une copropriété sans état daté déposé produit un point à vérifier', () => {
  const app = chargerApplication();
  const constats = app.constatsEtatDate([], '2026-09-22', true);
  assert.equal(constats.length, 1);
  assert.equal(constats[0].gravite, 'A_VERIFIER');
  // Hors copropriété, l'état daté n'a pas lieu d'être : aucun constat.
  assert.equal(app.constatsEtatDate([], '2026-09-22', false).length, 0);
});

test('un certificat d’urbanisme périmé est signalé comme critique', () => {
  const app = chargerApplication();
  const a = app.analyserCertificatUrbanisme(doc("Certificat d'urbanisme.pdf",
    "CERTIFICAT D'URBANISME délivré le 10 janvier 2025.\nLe terrain est grevé d'une servitude d'utilité publique."));
  assert.equal(a.expiration, '2026-07-10');
  const constats = app.constatsCertificatUrbanisme([a], '2026-09-22');
  const perime = constats.find(c => /périmé/.test(c.titre));
  assert.equal(perime.gravite, 'CRITIQUE');
  assert.equal(perime.destinataire, 'mairie');
});

test('un certificat d’urbanisme encore valable est une simple information', () => {
  const app = chargerApplication();
  const a = app.analyserCertificatUrbanisme(doc("CU.pdf", "CERTIFICAT D'URBANISME délivré le 2 juin 2026."));
  const constats = app.constatsCertificatUrbanisme([a], '2026-09-22');
  const validite = constats.find(c => /valable jusqu/.test(c.titre));
  assert.equal(validite.gravite, 'INFORMATION');
  assert.ok(!validite.question);
});

test('un CU d’information (a) est distingué d’un CU opérationnel (b)', () => {
  // Se fier à un CU « a » pour juger un projet de construction est précisément l'erreur à signaler.
  const app = chargerApplication();
  const info = app.analyserCertificatUrbanisme(doc('CU.pdf', "CERTIFICAT D'URBANISME délivré le 2 juin 2026."));
  const oper = app.analyserCertificatUrbanisme(doc('CU.pdf', "CERTIFICAT D'URBANISME OPÉRATIONNEL délivré le 2 juin 2026."));
  assert.equal(info.genre, 'a');
  assert.equal(oper.genre, 'b');
  assert.ok(app.constatsCertificatUrbanisme([info], '2026-09-22').some(c => /CU a/.test(c.titre)));
  assert.ok(!app.constatsCertificatUrbanisme([oper], '2026-09-22').some(c => /CU a/.test(c.titre)));
});

test('les points de vigilance du certificat d’urbanisme sont relevés', () => {
  const app = chargerApplication();
  const a = app.analyserCertificatUrbanisme(doc('CU.pdf', [
    "CERTIFICAT D'URBANISME délivré le 2 juin 2026.",
    "Le terrain est concerné par un emplacement réservé au profit de la commune.",
    "Il est situé dans le périmètre des abords d'un monument historique.",
    "Le bien est soumis au droit de préemption urbain.",
    "Une taxe d'aménagement sera exigible en cas de construction."
  ].join('\n')));
  const cles = a.points.map(p => p.cle);
  ['emplacementReserve', 'patrimoine', 'preemption', 'taxes'].forEach(c => assert.ok(cles.includes(c), c));
  assert.equal(a.points.find(p => p.cle === 'emplacementReserve').gravite, 'CRITIQUE');
});

test('les questions sont groupées par destinataire et jamais répétées', () => {
  const app = chargerApplication();
  const blocs = app.questionsOutil2([
    { destinataire: 'syndic', question: 'Q1' },
    { destinataire: 'syndic', question: 'Q1' },
    { destinataire: 'syndic', question: 'Q2' },
    { destinataire: 'mairie', question: 'Q3' },
    { gravite: 'INFORMATION' }
  ]);
  assert.equal(blocs.length, 2);
  assert.equal(blocs[0].cle, 'syndic');
  assert.equal(blocs[0].questions.join('|'), 'Q1|Q2');
  assert.equal(blocs[1].cle, 'mairie');
});

test('un constat sans question ne produit aucune demande', () => {
  // Toutes n'appellent pas un courrier : un certificat encore valable n'a rien à demander.
  const app = chargerApplication();
  assert.equal(app.questionsOutil2([{ titre: 'Rien à demander' }]).length, 0);
  assert.equal(app.questionsOutil2([]).length, 0);
});

test('un avant-contrat qui CITE l’état daté n’en est pas un', () => {
  // Piège structurel déjà payé sur la checklist de pièces : ces documents sont mentionnés en
  // boilerplate dans quasiment tout avant-contrat, qu'ils existent ou non.
  const app = chargerApplication();
  assert.equal(app.typeDocumentSyndicUrbanisme(
    doc('Compromis DUPONT.pdf', 'COMPROMIS DE VENTE\nLe vendeur remettra un état daté avant la signature.')), null);
  assert.equal(app.typeDocumentSyndicUrbanisme(
    doc('piece.pdf', "PROJET D'ACTE DE VENTE\nIl sera produit un certificat d'urbanisme.")), null);
});

test('la citation et la page sont conservées sur chaque rubrique', () => {
  // Sans la page, un constat n'est pas relisable dans le document — c'est la règle de tout le
  // rapport d'Outil 2.
  const app = chargerApplication();
  const tete = 'ÉTAT DATÉ\n';
  const clause = 'Une procédure est en cours devant le tribunal judiciaire.';
  const texte = tete + clause;
  const a = app.analyserEtatDate({ nom: 'Etat date.pdf', texte,
    pages: [{ numero: 1, debut: 0, fin: tete.length }, { numero: 2, debut: tete.length, fin: texte.length }] });
  const r = a.rubriques.find(x => x.cle === 'proceduresEnCours');
  assert.equal(r.page, 2);
  assert.ok(r.phrase.includes('tribunal judiciaire'));
});
