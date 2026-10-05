'use strict';

// Parcours du dossier NAS (verifierDossierLocalUneFois) : un fichier que le motif reconnaît mais qu'une réponse « Non » de
// l'étude écarte doit être dit dans le diagnostic ; sans cette réponse, la pièce est cochée. Noms et dossier inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chargerApplication } = require('./helpers/load-app');

async function parcourir(decisions) {
  const app = chargerApplication();
  vm.runInContext("dossiers.push({ id: 'd1', nom: 'DUPONT / MARTIN', dossierLie: true, nasDossier: 'DUPONT - MARTIN', typeVente: 'maison', sansPret: true, roleNotaire: 'instrumentaire', pieces: {}, historique: [], responsable: 'Julie VASSELIN' })", app);
  app.listerFichiersNas = async () => [{ nom: 'Certificat_Assainissement.pdf', chemin: 'AAE/Certificat_Assainissement.pdf' }];
  app.sauvegarder = async () => {};
  app.render = () => {};
  app.afficherToast = () => {};
  app.notifierNouvellesPiecesTrouvees = () => {};
  app.notifierNavigateurPieces = () => {};
  app.synchroniserEcheanceAgenda = () => {};
  app.fetchAvecAuth = async (url) => ({ ok: true, json: async () => (String(url).startsWith('/api/formes-noms') ? { decisions } : { exclusions: {} }) });
  await app.verifierDossierLocalUneFois('d1', true);
  const d = vm.runInContext('dossiers[0]', app);
  return { piece: d.pieces.reponseAssainissement, journal: vm.runInContext('dernierDiagnosticParcours.d1.journal', app).join('\n') };
}

test('sans décision : « Certificat_Assainissement.pdf » coche « Courrier réponse assainissement »', async () => {
  const r = await parcourir([]);
  assert.equal(r.piece, 'recue');
  assert.match(r.journal, /pièce trouvée par nom : « Courrier réponse assainissement »/);
});

test('avec une réponse « Non » sur cette forme : pièce manquante et diagnostic explicite', async () => {
  const r = await parcourir([{ cle: 'reponseAssainissement', forme: 'certificat assainissement', decision: 'non' }]);
  assert.equal(r.piece, 'manquante');
  assert.match(r.journal, /Certificat_Assainissement\.pdf → correspond à « Courrier réponse assainissement » mais écarté par une réponse « Non »/);
});
