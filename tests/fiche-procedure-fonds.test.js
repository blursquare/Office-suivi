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
  assert.match(e[4].note, /Séquestre : 1\s000,00 € — Agence du Parc/);
});

test('etatProcedureFonds : dossier sans rien d’enregistré, fonds partiels', () => {
  const app = chargerApplication();
  const e = app.etatProcedureFonds({ fondsRecus: { verifieLe: '2026-09-28T08:00:00Z', total: 50000, attendu: 150000, recus: [] } });
  assert.equal(resume(e), '1:- 2:- 3:- 4:- 5:- 6:- 7:- 8:- 9:-');
  assert.match(e[7].note, /Reçu 50\s000,00 € sur 150\s000,00 € — reste 100\s000,00 €/);
  assert.match(e[2].note, /non reçue/);
});
