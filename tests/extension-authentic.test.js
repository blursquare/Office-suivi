'use strict';
// Page d'Authentic reçue de l'extension Firefox : structure copiée SANS DONNÉES. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('masquerValeurAuthentic : le type de la valeur, jamais la valeur', () => {
  const cas = {
    '': '[vide]', 'oui': 'oui', '12/03/2026': '[date]', '2026-03-12': '[date]', 'jean.martel@exemple.fr': '[email]',
    '06 12 34 56 78': '[téléphone]', '250 000,00 €': '[montant]', '250.000,00': '[montant]', '12,5 %': '[pourcentage]',
    '1250': '[nombre]', 'MARTEL Jean-Pierre': '[texte, 2 mots]'
  };
  for (const [v, attendu] of Object.entries(cas)) assert.equal(app.masquerValeurAuthentic(v), attendu, v);
});

test('masquerLibelleAuthentic : chiffres, mots en capitales et noms après civilité masqués, sigles gardés', () => {
  assert.equal(app.masquerLibelleAuthentic('Prix de vente (TTC)'), 'Prix de vente (TTC)');
  assert.equal(app.masquerLibelleAuthentic('Dossier VTE MARTEL / FOURNIER 2026-114'), 'Dossier VTE XXX / XXX 9999-999');
  assert.equal(app.masquerLibelleAuthentic('Vendeur : Monsieur Jean Martel'), 'Vendeur : Monsieur XXX');
  assert.equal(app.masquerLibelleAuthentic('Contact jean@exemple.fr'), 'Contact [email]');
});

test('structureCaptureAuthentic : rubriques, libellés et types ; aucune valeur ne sort', () => {
  const capture = {
    titre: 'Authentic — VTE MARTEL',
    champs: [
      { groupe: 'Vendeur', libelle: 'Nom', valeur: 'MARTEL' },
      { groupe: 'Vendeur', libelle: 'Prénoms', valeur: 'Jean Pierre' },
      { groupe: 'Bien', libelle: 'Prix', valeur: '180 000,00 €' }
    ],
    tableaux: [{ entete: ['Section', 'Numéro', 'Contenance'], lignes: [['AB', '123', '05a 12ca']] }, { entete: [], lignes: [['Vendeur', 'Jean Martel']] }],
    texte: 'MARTEL Jean Pierre vend à FOURNIER'
  };
  const s = app.structureCaptureAuthentic(capture);
  for (const secret of ['MARTEL', 'Martel', 'Jean', 'Pierre', '180', 'FOURNIER', '123', '05a']) assert.ok(!s.includes(secret), secret);
  assert.ok(s.includes('## Vendeur'));
  assert.ok(s.includes('- Nom : [texte, 1 mot]'));
  assert.ok(s.includes('- Prix : [montant]'));
  assert.ok(s.includes('| Section | Numéro | Contenance |'));
  assert.ok(s.includes('| [texte, 1 mot] | [nombre] | [texte, 2 mots] |'));
});

test('masquerLibelleAuthentic : civilité collée au mot précédent (texte d’icône), prénoms masqués ; texte long réduit', () => {
  // Cas réel du 02/10 (noms inventés) : « personM. » — l'icône « person » d'Authentic colle son texte.
  const brut = '1 - Vente MARTEL/FOURNIER Importer avec 1e SENSComparants (3) personM. MARTEL Alexandre et Mme FOURNIER personMme DUVAL CamilleAcquéreur Immeubles (1) 41000 BLOIS L';
  const m = app.masquerLibelleAuthentic(brut);
  for (const secret of ['Alexandre', 'Camille', 'MARTEL', 'FOURNIER', 'DUVAL', 'BLOIS', '41000']) assert.ok(!m.includes(secret), secret);
  assert.equal(m, '[texte, 23 mots]');
  // Libellé court : prénoms après civilité masqués même sans espace avant la civilité.
  const court = app.masquerLibelleAuthentic('personM. Alexandre Martel');
  assert.ok(!court.includes('Alexandre') && !court.includes('Martel'), court);
  assert.equal(app.masquerLibelleAuthentic('Mme Camille Duval et M. Paul Duval'), 'Mme XXX et M. XXX');
});

test('structureCaptureAuthentic : titre de tableau masqué, icônes nommées, valeurs jamais', () => {
  const s = app.structureCaptureAuthentic({
    titre: 'Authentic',
    champs: [],
    tableaux: [{ titre: 'Courriers envoyés', entete: [], lignes: [['Lettre à M. Martel Alexandre', '⟦icône⟧ Signé électroniquement', '12/03/2026']] }],
    texte: ''
  });
  assert.ok(s.includes('## Tableau 1 — Courriers envoyés (1 ligne)'), s);
  assert.ok(s.includes('| [texte, 5 mots] | [icône : Signé électroniquement] | [date] |'), s);
  assert.ok(!s.includes('Martel') && !s.includes('Alexandre'));
});
