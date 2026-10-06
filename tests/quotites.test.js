'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

function etat(sources, lignes, acquereurs) {
  return {
    typeBien: 'immeuble',
    acquereurs: acquereurs || [{ id: 'a', civilite: 'Monsieur', nom: 'Jean DUPONT' }, { id: 'b', civilite: 'Madame', nom: 'Claire MARTIN' }],
    lignes: lignes || [{ id: 'l1', libelle: "Prix d'acquisition", montant: 250000, memoire: false }],
    sources
  };
}

test('repartirPourcentages : trois parts égales totalisent exactement 100 %', () => {
  const p = app.repartirPourcentages([1000, 1000, 1000]);
  assert.strictEqual(p.join('|'), '33.34|33.33|33.33');
  assert.strictEqual(Math.round(p.reduce((a, b) => a + b, 0) * 100), 10000);
});

test('repartirPourcentages : le centième manquant va au plus fort reste', () => {
  // 2/3 = 66,666… et 1/3 = 33,333… : le reste le plus grand est celui des deux tiers.
  assert.strictEqual(app.repartirPourcentages([200, 100]).join('|'), '66.67|33.33');
  assert.strictEqual(app.repartirPourcentages([0, 0]).join('|'), '0|0');
  assert.strictEqual(app.repartirPourcentages([500, 0]).join('|'), '100|0');
});

test('calculerQuotites : proportions selon le financement, écart avec l\'opération', () => {
  const r = app.calculerQuotites(etat([
    { id: 's1', type: 'apport', montants: { a: 8000, b: 4000 } },
    { id: 's2', type: 'pret', banque: 'CIC', montants: { a: '176900', b: '92000,5' } }
  ], [
    { id: 'l1', libelle: 'Prix', montant: 250000, memoire: false },
    { id: 'l2', libelle: 'Frais', montant: 30900.5, memoire: false },
    { id: 'l3', libelle: 'Prorata', montant: 999, memoire: true }
  ]));
  assert.strictEqual(r.totalOperation, 280900.5);
  assert.strictEqual(r.totalFinancement, 280900.5);
  assert.strictEqual(r.couvert, true);
  assert.strictEqual(r.totalParSource.s2, 268900.5);
  assert.strictEqual(r.parAcquereur[0].total, 184900);
  assert.strictEqual(Math.round((r.parAcquereur[0].pourcentage + r.parAcquereur[1].pourcentage) * 100), 10000);
});

test('calculerQuotites : écart signalé et acquéreur sans financement', () => {
  const r = app.calculerQuotites(etat([{ id: 's1', type: 'apport', montants: { a: 100000 } }]));
  assert.strictEqual(r.couvert, false);
  assert.strictEqual(r.ecart, -150000);
  assert.strictEqual(r.sansFinancement.join(','), 'b');
  // Rien de saisi : personne n'est signalé.
  assert.strictEqual(app.calculerQuotites(etat([{ id: 's1', type: 'apport', montants: {} }])).sansFinancement.length, 0);
});

test('phraseQuotitesAcquisition : seul en pleine propriété, à plusieurs en indivision', () => {
  const r = app.calculerQuotites(etat([{ id: 's', type: 'apport', montants: { a: 200, b: 100 } }]));
  assert.match(app.phraseQuotitesAcquisition(etat([]).acquereurs, r),
    /^M\. Jean DUPONT et Mme Claire MARTIN acquièrent .* en indivision, savoir : 66,67 % pour M\. Jean DUPONT, 33,33 % pour Mme Claire MARTIN\.$/);
  const seul = [{ id: 'a', civilite: 'Madame', nom: 'Claire MARTIN' }];
  assert.match(app.phraseQuotitesAcquisition(seul, app.calculerQuotites(etat([], null, seul))), /Mme Claire MARTIN acquiert .* en pleine propriété\./);
});

test('clausesQuotites : convention sur les prêts et vie courante seulement en indivision', () => {
  const deux = app.clausesQuotites(etat([{ id: 'p', type: 'pret', banque: 'CIC OUEST', numero: '123' }]));
  const conv = deux.find(c => c.amorce === 'Convention des acquéreurs - sort des prêts souscrits');
  assert.ok(conv);
  assert.match(conv.texte, /le prêt n°123 consenti par CIC OUEST/);
  assert.match(deux.find(c => c.amorce === 'Vie courante').texte, /à concurrence de la moitié chacun/);
  const seul = app.clausesQuotites(etat([], null, [{ id: 'a', civilite: 'Monsieur', nom: 'X' }]));
  assert.ok(!seul.some(c => c.amorce === 'Vie courante' || c.amorce === 'Convention des acquéreurs - sort des prêts souscrits'));
  const trois = app.clausesQuotites(etat([], null, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
  assert.match(trois.find(c => c.amorce === 'Vie courante').texte, /à parts égales entre eux/);
});

test('lignesOperationParDefaut : montants vides, prorata en mémoire, construction pour un terrain', () => {
  const imm = app.lignesOperationParDefaut('immeuble');
  assert.ok(imm.every(l => l.montant === null));
  assert.strictEqual(imm[imm.length - 1].memoire, true);
  assert.ok(!imm.some(l => /construction/i.test(l.libelle)));
  assert.ok(app.lignesOperationParDefaut('terrain').some(l => l.libelle === 'Coût de la construction'));
});

test('prefillQuotites : acquéreurs, prix, prêt reporté seulement pour un acquéreur seul', () => {
  const d = {
    nom: 'DUPONT / MARTIN & DURAND', typeVente: 'terrain', prixVente: 90000, montantPret: 120000,
    parties: [{ role: 'vendeur', nom: 'DUPONT' }, { role: 'acquereur', nom: 'MARTIN' }, { role: 'acquereur', nom: 'DURAND' }]
  };
  const p = app.prefillQuotites(d);
  assert.strictEqual(p.typeBien, 'terrain');
  assert.strictEqual(p.acquereurs.map(a => a.nom).join(','), 'MARTIN,DURAND');
  assert.strictEqual(p.prix, 90000);
  assert.ok(p.aCompleter.some(x => /Répartition du prêt/.test(x)));
  assert.ok(p.aCompleter.some(x => /Civilité/.test(x)));
  assert.ok(p.aCompleter.some(x => /Prénom/.test(x)));
  const sansPret = app.prefillQuotites({ nom: 'A / B', sansPret: true, montantPret: 5000 });
  assert.strictEqual(sansPret.montantPret, 0);
  assert.ok(sansPret.repris.includes('Achat sans prêt'));
});

test('prefillQuotites : civilité et prénom repris de la fiche du dossier (Monsieur, Madame, ou deux de la même civilité)', () => {
  const d = {
    nom: 'DUPONT / ROCHE', prixVente: 200000,
    parties: [
      { role: 'VENDEUR', nom: 'DUPONT' },
      { role: 'ACQUEREUR', civilite: 'M', prenom: 'Paul', nom: 'ROCHE' },
      { role: 'ACQUEREUR', civilite: 'Mme', prenom: 'Léa', nom: 'ROCHE' }
    ]
  };
  const p = app.prefillQuotites(d);
  assert.strictEqual(p.acquereurs.map(a => a.civilite + ' ' + a.nom).join(' | '), 'Monsieur Paul ROCHE | Madame Léa ROCHE');
  assert.ok(!p.aCompleter.some(x => /Civilité|Prénom/.test(x)));
  const deux = app.prefillQuotites({ nom: 'A / B', parties: [
    { role: 'ACQUEREUR', civilite: 'Mme', prenom: 'Inès', nom: 'MOREAU' },
    { role: 'ACQUEREUR', civilite: 'Madame', prenom: 'Zoé', nom: 'FAURE' }
  ] });
  assert.strictEqual(deux.acquereurs.map(a => a.civilite).join(','), 'Madame,Madame');
  assert.strictEqual(deux.acquereurs.map(a => a.nom).join(','), 'Inès MOREAU,Zoé FAURE');
});
