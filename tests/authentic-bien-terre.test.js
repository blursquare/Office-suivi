'use strict';

// Fiche bien d'Authentic pour une parcelle de terre ou de bois (structure reçue le 12/10) — valeurs INVENTÉES.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const ID = 'ui-ficho-tabs:mainTabPanel:tabForm9:tabContent:';

function fiche({ type, designation, nature = '', lignes }) {
  return {
    titre: 'Authentic',
    champs: [
      { groupe: 'Informations du bien', libelle: ID + 'ficheImmeubleTabView:infosComponent:ficheImmeubleIdentite:typeWithDialog:selectOneMenu_input', valeur: type },
      { groupe: 'Informations du bien', libelle: 'Désignation', valeur: designation },
      { groupe: 'Informations du bien', libelle: 'Lieu-dit, XXX...', valeur: 'Les Grands Champs' },
      { groupe: 'Informations du bien', libelle: 'CP - Ville*', valeur: '41120 CELLETTES' }
    ],
    tableaux: [{ titre: 'Parcelle Assise volumétrique', entete: ['Commune', 'Préfixe', 'Section', 'Numéro', 'Adresse ou lieu-dit', 'Nature', 'Zone urbanisme', 'SPF', 'surface', ''],
      lignes: lignes || [['CELLETTES', '', 'ZB', '0042', 'Les Grands Champs', nature, '', 'BLOIS 1', '15320', '']] }],
    texte: ''
  };
}

test('parcelle de bois : type « terre », en bois, nature et surface gardées', () => {
  const b = app.bienDepuisFicheAuthentic(fiche({ type: 'Terrain', designation: 'Une parcelle de bois' }));
  assert.equal(b.type, 'terre');
  assert.equal(b.bois, true);
  assert.equal(b.parcelles[0].numero, '42');
  assert.equal(b.parcelles[0].surface, '15320');
  assert.equal(b.parcelles[0].lieuDit, 'Les Grands Champs');
  assert.equal(b.adresse.texte, 'Les Grands Champs 41120 CELLETTES');
});

test('terre agricole : type « terre » ; bois inconnu sans nature, « non » quand chaque nature est connue', () => {
  const t = app.bienDepuisFicheAuthentic(fiche({ type: 'Terre', designation: 'Une parcelle de terre' }));
  assert.equal(t.type, 'terre');
  assert.equal(t.bois, null);
  const p = app.bienDepuisFicheAuthentic(fiche({ type: '', designation: 'Une parcelle', nature: 'T' }));
  assert.equal(p.type, 'terre');
  assert.equal(p.bois, false);
  assert.equal(app.bienDepuisFicheAuthentic(fiche({ type: '', designation: 'Une parcelle', nature: 'BT' })).bois, true);
});

test('terrain à bâtir et maison : jamais « terre »', () => {
  assert.equal(app.bienDepuisFicheAuthentic(fiche({ type: 'Terrain', designation: 'Un terrain à bâtir' })).type, 'terrain');
  assert.equal(app.bienDepuisFicheAuthentic(fiche({ type: 'Terrain', designation: 'Un terrain' })).type, 'terrain');
  assert.equal(app.bienDepuisFicheAuthentic(fiche({ type: 'Maison', designation: 'Une maison avec terrain' })).type, 'maison');
});

test('analyse de préemption : parcelles en bois d’après Authentic, réponse de la fiche prioritaire', () => {
  assert.equal(app.boisDepuisFicheDossier({ bien: { natureBois: true } }), true);
  assert.equal(app.boisDepuisFicheDossier({ bien: { cadastre: { parcelles: [{ section: 'A', numero: '1', nature: 'BF' }, { section: 'A', numero: '2' }] } } }), true);
  assert.equal(app.boisDepuisFicheDossier({ bien: { cadastre: { parcelles: [{ section: 'A', numero: '1', nature: 'T' }] } } }), false);
  assert.equal(app.boisDepuisFicheDossier({ bien: { cadastre: { parcelles: [{ section: 'A', numero: '1' }] } } }), null);
  const e = app.prefillPreemption({ id: 'x', typeVente: 'terre', bien: { natureBois: true }, preemption: { reponses: { bois: false } } });
  assert.equal(e.reponses.bois, false);
  assert.equal(app.prefillPreemption({ id: 'x', typeVente: 'terre', bien: { natureBois: true } }).reponses.bois, true);
});

test('fiche bien lue sur un dossier : type « terre », « Réponse SAFER » ajoutée, bois noté, nature gardée sur la parcelle', () => {
  const d = { id: 'v', nom: 'MARTEL / FOURNIER', adresseBien: 'CELLETTES (41120), Les Grands Champs', historique: [], pieces: [], piecesPersonnalisees: [],
    bien: { cadastre: { section: 'ZB', numero: '42', parcelles: [{ section: 'ZB', numero: '42' }] } } };
  const r = app.appliquerReleveSurDossier(d, fiche({ type: 'Bois', designation: 'Une parcelle de bois', nature: 'BT' }), '2026-10-12T10:00:00Z');
  assert.ok(r.modifie);
  assert.equal(d.typeVente, 'terre');
  assert.equal(d.bien.natureBois, true);
  assert.equal(d.bien.cadastre.parcelles[0].nature, 'BT');
  const hist = d.historique.map(h => h.texte).join('\n');
  assert.match(hist, /Réponse SAFER/);
  assert.match(hist, /en nature de bois/);
});
