'use strict';
// Factures d'une succession déposées à la main sur le NAS (étude 20/10 : « reçues par email par exemple »). Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('factures du NAS : seulement « Factures à régler », jamais deux fois, même retirée de la fiche', () => {
  const d = { id: 's1', typeAffaire: 'succession', nasDossier: 'SUCC/SUCC DURAND Paul', succession: {
    factures: [{ id: 'f1', fichier: 'SUCC/SUCC DURAND Paul/Factures à régler/Facture - EDF - Claire Scan.pdf', organisme: 'EDF', recueLe: '2026-10-19' }],
    facturesNasVues: ['SUCC/SUCC DURAND Paul/Factures a regler/Facture pompes funebres.pdf'] } };
  const fichiers = [
    { nom: 'Facture - EDF - Claire Scan.pdf', chemin: 'Factures à régler/Facture - EDF - Claire Scan.pdf' },
    { nom: 'Facture pompes funebres.pdf', chemin: 'Factures a regler/Facture pompes funebres.pdf' },
    { nom: 'Facture_Orange_septembre.pdf', chemin: 'Factures à régler/Facture_Orange_septembre.pdf' },
    { nom: 'Courrier banque.pdf', chemin: 'Courrier reçu/Courrier banque.pdf' },
    { nom: 'Facture eau.pdf', chemin: 'Facture eau.pdf' }
  ];
  const a = app.facturesNasANoter(d, fichiers);
  assert.equal(a.map(x => x.nom).join(','), 'Facture_Orange_septembre.pdf');
  assert.equal(a[0].complet, 'SUCC/SUCC DURAND Paul/Factures à régler/Facture_Orange_septembre.pdf');
  assert.equal(app.organismeNomFichierFacture('Facture_Orange_septembre.pdf'), 'Orange septembre');
  assert.equal(app.organismeNomFichierFacture('Facture - EDF - Claire Scan.pdf'), 'EDF');
});
