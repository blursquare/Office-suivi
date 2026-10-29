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
  // Le mariage d'un couple de parties n'est demandé qu'UNE fois (même acte) : pour le premier des deux époux.
  assert.equal(p.map((x) => `${x.prenom} ${x.nom}:${x.marie}`).join('|'), 'Paul MARTIN:true|Léa MARTIN:false|Claire DURAND:true');
});

test('Comedec : une personne née à l’étranger n’a pas de demande de naissance (Comedec ne la délivre pas) ; née en France : demandée', () => {
  const d = { id: 'd1', nom: 'X', parties: [{ role: 'VENDEUR', nom: 'EXEMPLE', prenom: 'Ana' }, { role: 'ACQUEREUR', nom: 'ESSAI', prenom: 'Lou' }],
    authentic: { fichesClients: { 'ana exemple': { nom: 'Ana EXEMPLE', paysNaissance: 'PORTUGAL' }, 'lou essai': { nom: 'Lou ESSAI', paysNaissance: 'France' } } } };
  assert.equal(app.partiesComedecDossier(d).map((x) => `${x.prenom}:${x.naissance}`).join('|'), 'Ana:false|Lou:true');
  assert.equal(app.neALEtrangerAuthentic({ authentic: { fichesClients: {} } }, { nom: 'X', prenom: 'Y' }), false, 'pays inconnu : demandée');
});

test('CJN : pas pour une succession, ni en participation, ni sans acquéreur personne physique', () => {
  const vente = { id: 'd1', parties: [{ role: 'ACQUEREUR', nom: 'DURAND' }] };
  assert.equal(app.raisonSansCjn(vente), '');
  assert.match(app.raisonSansCjn(Object.assign({}, vente, { roleNotaire: 'participant' })), /notaire qui reçoit/);
  assert.match(app.raisonSansCjn({ id: 'd2', parties: [] }), /aucun acquéreur/);
  assert.match(app.raisonSansCjn({ id: 'd3', parties: [{ role: 'ACQUEREUR', nom: 'SCI', qualitePersonne: 'morale' }] }), /société/);
});
