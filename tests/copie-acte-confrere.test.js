const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const dossier = (extra) => Object.assign({ id: 'p1', nom: 'MARTEL / FOURNIER', roleNotaire: 'participant', sansPret: true, rendezVousSignature: '2026-10-23', parties: [],
  notaireVendeur: 'Maître Paul DUPUIS (Tours)', notaireAcquereur: 'Maître Sophie GOSSART (BLOIS)' }, extra);

test('copie de l’acte du confrère : une fausse minute du dossier postérieure à la signature la fait reconnaître reçue', () => {
  const d = dossier({});
  const fichiers = [
    { nom: 'Copie.pdf', chemin: '2026/VTE MARTEL FOURNIER/Copie.pdf', modifie: '2026-10-26T10:00:00' },
    { nom: 'Autre.pdf', chemin: '2026/VTE DURAND/Autre.pdf', modifie: '2026-10-26T10:00:00' }
  ];
  const f = app.copieActeConfrereRecue(fichiers, d, '2026-10-27');
  assert.equal(f && f.nom, 'Copie.pdf');
  assert.equal(app.copieActeConfrereRecue([{ nom: 'Copie.pdf', chemin: '2026/VTE MARTEL FOURNIER/Copie.pdf', modifie: '2026-10-20T10:00:00' }], d, '2026-10-27'), null, 'antérieure à la signature');
  assert.equal(app.copieActeConfrereRecue(fichiers, dossier({ rendezVousSignature: '2026-11-30' }), '2026-10-27'), null, 'acte pas encore signé');
});

test('dossiers qui attendent la copie du confrère : participation, confrère côté vendeur, signé depuis la mise en service, une seule fois', () => {
  const att = (d, j) => app.dossiersCopieConfrereAttendue([d], j).length;
  assert.equal(att(dossier({}), '2026-10-27'), 1);
  assert.equal(att(dossier({ relanceTitreConfrereLe: '2026-10-26' }), '2026-10-27'), 0);
  assert.equal(att(dossier({ roleNotaire: 'instrumentaire' }), '2026-10-27'), 0);
  assert.equal(att(dossier({ rendezVousSignature: '2026-10-10' }), '2026-10-27'), 0, 'signé avant la mise en service');
  assert.equal(att(dossier({}), '2026-12-01'), 0, 'au-delà de 15 jours');
});

test('date de l’avant-contrat reprise du « Signé le » du sous-dossier Promesse d’Authentic, jamais par-dessus une date posée', () => {
  const capture = { texte: '1 - Promesse VTE MARTEL / FOURNIER\nSigné\n15/09/2026\nRédaction\nPromesse MARTEL / FOURNIER\nSigné le 15/09/2026', champs: [], tableaux: [] };
  const d = { id: 'v1', nom: 'MARTEL / FOURNIER', parties: [], historique: [] };
  assert.equal(app.retenirDateAvantContratAuthentic(d, capture), true);
  assert.equal(d.dateAvantContrat, '2026-09-15');
  const posee = { id: 'v2', nom: 'X / Y', parties: [], historique: [], dateAvantContrat: '2026-08-01' };
  assert.equal(app.retenirDateAvantContratAuthentic(posee, capture), false);
  assert.equal(posee.dateAvantContrat, '2026-08-01');
  assert.equal(app.retenirDateAvantContratAuthentic({ id: 'v3', nom: 'X / Y', parties: [], historique: [] }, { texte: 'Rédaction\nNon rédigé', champs: [], tableaux: [] }), false);
});

test('date de l’avant-contrat : le badge « Signé » + date du sous-dossier Promesse suffit', () => {
  const d = { id: 'v4', nom: 'X / Y', parties: [], historique: [] };
  assert.equal(app.retenirDateAvantContratAuthentic(d, { texte: '1 - Promesse VTE X / Y\nSigné\n12/09/2026\nSupprimer le sous-dossier', champs: [], tableaux: [] }), true);
  assert.equal(d.dateAvantContrat, '2026-09-12');
});

test('copie du confrère : un seul côté nommé ou une attestation seule ne ferment pas la relance ; date de l’avant-contrat future ou impossible refusée', () => {
  const d = dossier({});
  const un = [{ nom: 'Copie.pdf', chemin: '2026/VTE MARTEL AUTRE/Copie.pdf', modifie: '2026-10-26T10:00:00' }];
  assert.equal(app.copieActeConfrereRecue(un, d, '2026-10-27'), null, 'un seul côté nommé');
  const att = [{ nom: 'Attestation.pdf', chemin: '2026/VTE MARTEL FOURNIER/Attestation.pdf', modifie: '2026-10-26T10:00:00' }];
  assert.equal(app.copieActeConfrereRecue(att, d, '2026-10-27'), null, 'attestation seule');
  const v = { id: 'v5', nom: 'X / Y', parties: [], historique: [] };
  assert.equal(app.retenirDateAvantContratAuthentic(v, { texte: 'SIGNÉ\n31/02/2026', champs: [], tableaux: [] }), false, '31/02 impossible');
  assert.equal(app.retenirDateAvantContratAuthentic(v, { texte: 'Signé\n01/01/2099', champs: [], tableaux: [] }), false, 'date future');
  assert.equal(app.retenirDateAvantContratAuthentic(v, { texte: 'SIGNÉ\n12/09/2026', champs: [], tableaux: [] }), true, 'majuscules acceptées');
});
