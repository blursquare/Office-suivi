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
  // « Toutes en bois » : trois terres et un taillis → non.
  const melange = app.bienDepuisFicheAuthentic(fiche({ type: 'Terre', designation: 'Des parcelles', lignes: [
    ['C', '', 'ZB', '1', '', 'T', '', '', '1', ''], ['C', '', 'ZB', '2', '', 'BT', '', '', '1', '']] }));
  assert.equal(melange.bois, false);
  assert.equal(app.bienDepuisFicheAuthentic(fiche({ type: '', designation: 'Une parcelle', nature: 'BT' })).bois, true);
});

test('relecture 0.221.0 : jamais « terre » ni « bois » sur un mot pris au hasard', () => {
  const type = (t, des, nature) => app.bienDepuisFicheAuthentic(fiche({ type: t, designation: des, nature })).type;
  assert.equal(type('Terrain', 'Un terrain situé près du bourg'), 'terrain');
  assert.equal(type('Terrain', 'Un terrain avec parterre de fleurs'), 'terrain');
  assert.equal(type('Terrain', 'Terrain en zone rurale'), 'terrain');
  assert.equal(type('Terrain', 'Terrain rue de l’Étang'), 'terrain');
  assert.equal(type('Terrain', 'Terrain chemin des Bois'), 'terrain');
  assert.equal(type('Immeuble', 'Immeuble près de la gare'), null);
  assert.equal(type('Local commercial', 'Local rue des Prés'), null);
  assert.equal(type('Hangar', 'Hangar agricole'), null);
  assert.equal(type('', 'Une maison, parquet en bois'), null);
  // Terrain à bâtir cadastré en terre : reste un terrain.
  assert.equal(type('Terrain', 'Une parcelle de terrain', 'T'), 'terrain');
  const maison = app.bienDepuisFicheAuthentic(fiche({ type: 'Maison', designation: 'Maison, charpente bois' }));
  assert.equal(maison.bois, null);
  assert.equal(type('Terrain', 'Une parcelle de terre agricole'), 'terre');
  assert.equal(type('Terrain', 'Terrain en nature de pré'), 'terre');
  assert.equal(type('', 'Bois taillis'), 'terre');
});

test('terrain à bâtir et maison : jamais « terre »', () => {
  assert.equal(app.bienDepuisFicheAuthentic(fiche({ type: 'Terrain', designation: 'Un terrain à bâtir' })).type, 'terrain');
  assert.equal(app.bienDepuisFicheAuthentic(fiche({ type: 'Terrain', designation: 'Un terrain' })).type, 'terrain');
  assert.equal(app.bienDepuisFicheAuthentic(fiche({ type: 'Maison', designation: 'Une maison avec terrain' })).type, 'maison');
});

test('analyse de préemption : parcelles en bois d’après Authentic, réponse de la fiche prioritaire', () => {
  assert.equal(app.boisDepuisFicheDossier({ bien: { natureBois: true } }), true);
  assert.equal(app.boisDepuisFicheDossier({ bien: { cadastre: { parcelles: [{ section: 'A', numero: '1', nature: 'BF' }, { section: 'A', numero: '2' }] } } }), null);
  assert.equal(app.boisDepuisFicheDossier({ bien: { cadastre: { parcelles: [{ section: 'A', numero: '1', nature: 'BF' }, { section: 'A', numero: '2', nature: 'BT' }] } } }), true);
  assert.equal(app.boisDepuisFicheDossier({ bien: { cadastre: { parcelles: [{ section: 'A', numero: '1', nature: 'T' }] } } }), false);
  assert.equal(app.boisDepuisFicheDossier({ bien: { cadastre: { parcelles: [{ section: 'A', numero: '1' }] } } }), null);
  const e = app.prefillPreemption({ id: 'x', typeVente: 'terre', bien: { natureBois: true }, preemption: { reponses: { bois: false } } });
  assert.equal(e.reponses.bois, false);
  // Un « bois » gardé par l'analyse automatique (déduit) suit la fiche.
  assert.equal(app.prefillPreemption({ id: 'x', typeVente: 'terre', bien: { natureBois: true }, preemption: { reponses: { bois: false }, boisDeduit: true } }).reponses.bois, true);
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

test('succession qui connaît déjà un bien : une fiche bien d’un autre bien, annoncé par la rubrique « Immeubles », est proposée d’un clic (étude 23/10)', () => {
  const capture = Object.assign(fiche({ type: 'Terre', designation: 'Une parcelle de terre', nature: 'T' }), { onglets: [{ titre: 'Authentic', actif: true }] });
  const succ = { id: 's1', nom: 'SUCC LOURY', typeAffaire: 'succession', parties: [], pieces: {}, biens: [{ adresse: 'BLOIS (41000), 1 rue X', parcelles: 'AB 12' }],
    authentic: { biensDossier: { nombre: 2, texte: '41000 BLOIS 41120 CELLETTES' } } };
  assert.equal(app.questionBienSuccessionAuthentic(capture, succ, [succ]), true, 'deux biens annoncés, un seul connu');
  const complet = Object.assign({}, succ, { authentic: { biensDossier: { nombre: 1, texte: '41000 BLOIS' } } });
  assert.equal(app.questionBienSuccessionAuthentic(capture, complet, [complet]), false, 'tous les biens annoncés sont connus : rien à proposer');
  const recherche = Object.assign({}, capture, { onglets: [{ titre: 'Recherche d’immeubles', actif: true }] });
  assert.equal(app.questionBienSuccessionAuthentic(recherche, succ, [succ]), false, 'jamais depuis une recherche d’immeubles');
  const autre = { id: 'v1', nom: 'VTE X / Y', parties: [], pieces: {}, bien: { adresse: 'CELLETTES (41120), Les Grands Champs', cadastre: { parcelles: [{ section: 'ZB', numero: '42' }] } } };
  assert.equal(app.questionBienSuccessionAuthentic(capture, succ, [succ, autre]), false, 'le bien d’un autre dossier n’est jamais proposé');
});
