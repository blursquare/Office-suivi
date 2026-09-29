'use strict';
// Fiche imprimée : cases de la procédure « Appels et réception des fonds » remplies d'après le
// dossier (demande de l'étude du 29/09). Dossier inventé.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const resume = etats => etats.map((e, i) => `${i + 1}:${e.fait ? 'X' : '-'}${e.date ? '@' + e.date : ''}`).join(' ');

test('etatProcedureFonds : cocher sur les faits enregistrés, informer sinon', () => {
  const app = chargerApplication();
  const d = {
    appelFonds: '2026-09-20', projetEnvoye: '2026-09-25', rendezVousSignature: '2026-10-05', rendezVousSignatureHeure: '11:00',
    offrePretStatut: 'recue', depotGarantie: 1000, sequestreDepot: 'Agence du Parc',
    fondsRecus: { verifieLe: '2026-09-28T08:00:00Z', total: 150000, attendu: 150000, attenduChemin: 'MARTIN - DURAND/Appel de fonds.pdf',
      recus: [{ date: '2026-09-26', montant: 100000 }, { date: '2026-09-27', montant: 50000 }] },
    receptionFondsConfirmeeLe: '2026-09-28T09:12:00Z'
  };
  const e = app.etatProcedureFonds(d);
  assert.equal(resume(e), '1:X@2026-09-20 2:- 3:- 4:X 5:- 6:- 7:X@2026-09-25 8:X@2026-09-27 9:X@2026-09-28');
  assert.match(e[1].note, /lundi 5 octobre 2026 à 11h/);
  assert.match(e[2].note, /Offre de prêt reçue/);
  assert.match(e[3].note, /Appel de fonds\.pdf/);
  assert.match(e[4].note, /Séquestre : 1\.000,00\s€ — Agence du Parc/);
});

test('etatProcedureFonds : dossier sans rien d’enregistré, fonds partiels', () => {
  const app = chargerApplication();
  const e = app.etatProcedureFonds({ fondsRecus: { verifieLe: '2026-09-28T08:00:00Z', total: 50000, attendu: 150000, recus: [] } });
  assert.equal(resume(e), '1:- 2:- 3:- 4:- 5:- 6:- 7:- 8:- 9:-');
  assert.match(e[7].note, /Reçu 50\.000,00\s€ sur 150\.000,00\s€ — reste 100\.000,00\s€/);
  assert.match(e[2].note, /non reçue/);
});

test('formaterMontantEuros et eurosDepuisSaisie : « 360.000,00 € », relecture sans multiplier par 100', () => {
  const app = chargerApplication();
  assert.equal(app.formaterPrix(360000), '360.000,00 €');
  assert.equal(app.formaterPrixCentimes(1234567.5), '1.234.567,50 €');
  assert.equal(app.formaterPrixCentimes(999.999), '1.000,00 €');
  assert.equal(app.formaterPrixCentimes(-230.13), '-230,13 €');
  assert.equal(app.eurosDepuisSaisie('360.000,00 €'), 360000);
  assert.equal(app.eurosDepuisSaisie('250 000'), 250000);
  assert.equal(app.eurosDepuisSaisie('250000'), 250000);
  assert.equal(app.eurosDepuisSaisie(''), null);
});
