'use strict';

// Relecture indépendante du 12/10 : Claire Scan, répertoire des notaires, fiche.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('Claire Scan : une section d’une lettre ne compte que derrière « section / cadastré / parcelle »', () => {
  const d = { id: 'd1', nom: 'X / Y', parties: [], bien: { cadastre: { section: 'A', numero: '12' } } };
  const sansContexte = app.scoreDossierScan(d, ' il y a 12 mois le bien a 12 ans ');
  assert.equal(sansContexte.score, 0);
  const avecContexte = app.scoreDossierScan(d, ' parcelle cadastree section a 12 lieu dit ');
  assert.ok(avecContexte.score > 0, JSON.stringify(avecContexte));
  // Deux lettres : le numéro juste après suffit ; jamais trois mots entre les deux.
  const d2 = { id: 'd2', nom: 'X / Y', parties: [], bien: { cadastre: { section: 'AB', numero: '45' } } };
  assert.ok(app.scoreDossierScan(d2, ' cadastre ab 45 ').score > 0);
  assert.equal(app.scoreDossierScan(d2, ' ab lot numero un deux 45 ').score, 0);
});

test('annuaire : « Maître THOMAS LEMOINE » est Thomas LEMOINE, pas un notaire THOMAS', () => {
  const carnet = [
    { id: 'o1', nom: 'Office THOMAS', ville: 'BOURGES', departement: '18', notaires: ['Séverine THOMAS'] },
    { id: 'o2', nom: 'Office LEMOINE', ville: 'BLOIS', departement: '41', notaires: ['Thomas LEMOINE'] }
  ];
  const r = app.notaireAnnuaireLePlusProche('Maître THOMAS LEMOINE', carnet);
  assert.equal(r.notaire, 'Thomas LEMOINE');
  // Nom entier connu : il l'emporte.
  assert.equal(app.notaireAnnuaireLePlusProche('Maître Séverine THOMAS', carnet).notaire, 'Séverine THOMAS');
});

test('champ notaire : faux prénom ou fausse ville refusés, notaire de deux offices accepté par sa ville', () => {
  const carnet = [
    { id: 'o1', nom: 'Office A', ville: 'BLOIS', departement: '41', notaires: ['Eve CHAMPION'] },
    { id: 'o2', nom: 'Office B', ville: 'VENDÔME', departement: '41', notaires: ['Eve CHAMPION'] },
    { id: 'o3', nom: 'Office C', ville: 'MER', departement: '41', notaires: ['Paul MARTIN', 'Luc MARTIN'] }
  ];
  assert.equal(app.notaireDuRepertoire('Maître Eve CHAMPION (BLOIS)', carnet), true);
  assert.equal(app.notaireDuRepertoire('Maître Eve CHAMPION (VENDÔME)', carnet), true);
  assert.equal(app.notaireDuRepertoire('Maître Anne CHAMPION (BLOIS)', carnet), false);
  assert.equal(app.notaireDuRepertoire('Maître Eve CHAMPION (TOURS)', carnet), false);
  assert.equal(app.notaireDuRepertoire('Maître MARTIN', carnet), false);
  assert.equal(app.notaireDuRepertoire('Maître Paul MARTIN', carnet), true);
  // Même notaire dans deux offices, sans ville : ambigu.
  assert.equal(app.notaireDuRepertoire('Maître Eve CHAMPION', carnet), false);
});


test('Claire Scan : un vrai CU, un rapport du SPANC et une renonciation sur Cerfa restent reconnus ; une demande non', () => {
  const type = (t) => { const r = app.typePieceScan(t); return r ? r.cle : null; };
  assert.equal(type('commune de blois certificat d urbanisme demande deposee le 3 mars 2026 vu la demande d un certificat d urbanisme'.replace(/d urbanisme/g, "d'urbanisme")), 'certificatUrbanisme');
  assert.equal(type('spanc rapport de controle suite a votre demande de controle de l assainissement non collectif'), 'reponseAssainissement');
  assert.equal(type("declaration d'intention d'aliener ou demande d'acquisition le titulaire du droit de preemption renonce a exercer"), 'renonciationPreemption');
  assert.equal(type("declaration d'intention d'aliener un bien soumis au droit de preemption"), 'demandePreemption');
  assert.equal(type('spanc nous vous prions de bien vouloir proceder au controle de l assainissement'), 'demandeAssainissement');
});

test('Claire Scan : un Cerfa de demande de CU et une demande de contrôle au SPANC ne cochent rien', () => {
  const type = (t) => { const r = app.typePieceScan(t); return r ? r.cle : null; };
  assert.notEqual(type("cerfa 13410 demande de certificat d'urbanisme"), 'certificatUrbanisme');
  assert.equal(type("demande de controle de l'installation d'assainissement non collectif"), 'demandeAssainissement');
});
