'use strict';

// Fiche › Tableau : à droite, les seules dates du droit de préemption urbain et de la SAFER (étude 13/10 : « uniquement les dates
// d'échéance du droit de préemption urbain et de la SAFER »). Dossiers inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const base = (extra) => Object.assign({ id: 'd1', nom: 'DUPONT / MARTIN', typeVente: 'maison', roleNotaire: 'instrumentaire', pieces: {} }, extra);

test('colonne Préemption : dates de la DIA et de la SAFER quand elles sont connues', () => {
  const html = app.renderPreemptionTableauFiche(base({
    authentic: { safer: { envoyeeLe: '2026-10-01' }, demandes: { renonciationPreemption: { date: '2026-10-02' } } },
    piecesPersonnalisees: [{ cle: 'perso-safer', label: 'Réponse SAFER' }]
  }));
  assert.match(html, /Préemption/);
  assert.match(html, /Réponse à la DIA/);
  assert.match(html, /Délai SAFER/);
});

test('colonne Préemption : sans date, l’état en un mot ; rien en participation ni en succession', () => {
  const sans = app.renderPreemptionTableauFiche(base({}));
  assert.match(sans, /Droit de préemption urbain/);
  assert.match(sans, /DIA pas encore envoyée/);
  assert.match(sans, /Pas de notification/);
  assert.match(app.renderPreemptionTableauFiche(base({ pieces: { renonciationPreemption: 'recue' } })), /Renonciation reçue/);
  assert.equal(app.renderPreemptionTableauFiche(base({ roleNotaire: 'participant' })), '');
  assert.equal(app.renderPreemptionTableauFiche(base({ typeAffaire: 'succession' })), '');
});
