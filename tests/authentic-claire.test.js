// CLAIRE dans Authentic, côté poste (client/131) : qui entre dans la demande d'état civil, quand la demande de casier se prépare ici.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('Comedec : les parties que l’étude représente ; mariés d’après la situation du couple ou la fiche d’Authentic ; jamais une société', () => {
  const d = { id: 'd1', nom: 'MARTIN / DURAND', situationVendeur: 'marie', parties: [
    { role: 'VENDEUR', nom: 'MARTIN', prenom: 'Paul' }, { role: 'VENDEUR', nom: 'MARTIN', prenom: 'Léa' },
    { role: 'ACQUEREUR', nom: 'DURAND', prenom: 'Claire' }, { role: 'ACQUEREUR', nom: 'SCI DES LICES', qualitePersonne: 'morale' }],
    authentic: { fichesClients: { 'claire durand': { nom: 'Claire DURAND', situationMatrimoniale: { situation: 'Marié(e)' } } } } };
  const p = app.partiesComedecDossier(d);
  assert.equal(p.map((x) => `${x.prenom} ${x.nom}:${x.marie}`).join('|'), 'Paul MARTIN:true|Léa MARTIN:true|Claire DURAND:true');
});

test('CJN : pas pour une succession, ni en participation, ni sans acquéreur personne physique', () => {
  const vente = { id: 'd1', parties: [{ role: 'ACQUEREUR', nom: 'DURAND' }] };
  assert.equal(app.raisonSansCjn(vente), '');
  assert.match(app.raisonSansCjn(Object.assign({}, vente, { roleNotaire: 'participant' })), /notaire qui reçoit/);
  assert.match(app.raisonSansCjn({ id: 'd2', parties: [] }), /aucun acquéreur/);
  assert.match(app.raisonSansCjn({ id: 'd3', parties: [{ role: 'ACQUEREUR', nom: 'SCI', qualitePersonne: 'morale' }] }), /société/);
});
