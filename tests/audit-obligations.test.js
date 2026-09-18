'use strict';

// Outil 2 (Audit des actes) — les obligations du vendeur ont-elles été tenues ?
// (script.js, verifierObligationsVendeur) : croisement déterministe, sans IA, entre les engagements
// lus dans le compromis du dossier Outil 1 lié, l'état de ses pièces sur le NAS, et les documents
// déposés dans Outil 2. Voir CLAUDE.md, « Outil 2 : obligations du vendeur ».

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

function dossierAvecEngagements(extra) {
  return Object.assign({
    id: 'd1',
    typeVente: 'maison',
    pieces: {},
    fichiersTrouves: {},
    analyseJuridique: {
      engagements: [
        { phrase: "Le vendeur s'engage à fournir le justificatif de ramonage avant la signature de l'acte", type: 'entretien', page: 12 },
        { phrase: "Le vendeur s'engage à remettre les factures des travaux réalisés dans la cuisine", type: 'document', page: 13 }
      ],
      documents: [
        { label: 'Justificatif de ramonage', cat: 'entretien', cleChecklist: 'ramonage' },
        { label: 'Factures des travaux réalisés', cat: 'justificatif', cleChecklist: 'facturesTravaux' }
      ]
    }
  }, extra || {});
}

test('verifierObligationsVendeur : sans dossier, rien', () => {
  const app = chargerApplication();
  assert.equal(app.verifierObligationsVendeur(null, []).length, 0);
});

test('verifierObligationsVendeur : rien reçu, rien déposé → non tenues, IMPORTANT au plus, avec la clause et sa page', () => {
  const app = chargerApplication();
  const obligations = app.verifierObligationsVendeur(dossierAvecEngagements(), []);
  assert.equal(obligations.length, 2);
  assert.ok(obligations.every(o => o.statut === 'non_tenue' && o.gravite === 'IMPORTANT'));
  const ramonage = obligations.find(o => o.cle === 'ramonage');
  assert.ok(ramonage);
  assert.match(ramonage.clause, /ramonage/);
  assert.equal(ramonage.page, 12);
  assert.equal(ramonage.cat, 'entretien');
});

test('verifierObligationsVendeur : une pièce reçue dans le dossier client est tenue, avec le fichier trouvé', () => {
  const app = chargerApplication();
  const d = dossierAvecEngagements({
    pieces: { ramonage: 'recue' },
    fichiersTrouves: { ramonage: '4 - Diagnostics/Attestation ramonage.pdf' }
  });
  const ramonage = app.verifierObligationsVendeur(d, []).find(o => o.cle === 'ramonage');
  assert.equal(ramonage.statut, 'tenue');
  assert.equal(ramonage.preuve.source, 'dossier');
  assert.match(ramonage.preuve.nom, /Attestation ramonage\.pdf$/);
});

test('verifierObligationsVendeur : un document déposé dans Outil 2 vaut preuve, par son type…', () => {
  const app = chargerApplication();
  const factures = app.verifierObligationsVendeur(dossierAvecEngagements(), [{ nom: 'Scan_2026-03.pdf', type: 'facture' }])
    .find(o => o.cle === 'facturesTravaux');
  assert.equal(factures.statut, 'tenue');
  assert.equal(factures.preuve.source, 'depot');
  assert.equal(factures.preuve.nom, 'Scan_2026-03.pdf');
});

test('verifierObligationsVendeur : … ou par son nom de fichier, avec la même normalisation que le NAS', () => {
  const app = chargerApplication();
  const ramonage = app.verifierObligationsVendeur(dossierAvecEngagements(), [{ nom: 'Attestation_ramonage_2026.pdf', type: 'autre' }])
    .find(o => o.cle === 'ramonage');
  assert.equal(ramonage.statut, 'tenue');
  assert.equal(ramonage.preuve.source, 'depot');
});

test('verifierObligationsVendeur : un engagement sans pièce type ressort « à vérifier », jamais « non tenue »', () => {
  const app = chargerApplication();
  const d = dossierAvecEngagements({
    analyseJuridique: {
      engagements: [{ phrase: "Le vendeur s'engage à faire réparer la toiture du garage avant la signature de l'acte", type: 'travaux', page: 9 }],
      documents: []
    }
  });
  const obligations = app.verifierObligationsVendeur(d, []);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].statut, 'a_verifier');
  assert.equal(obligations[0].gravite, 'A_VERIFIER');
  assert.equal(obligations[0].cle, null);
  assert.equal(obligations[0].page, 9);
  assert.match(obligations[0].clause, /toiture/);
});

test('verifierObligationsVendeur : les manquements d’abord, puis à vérifier, puis tenues', () => {
  const app = chargerApplication();
  const d = dossierAvecEngagements({
    pieces: { ramonage: 'recue' },
    analyseJuridique: {
      engagements: [
        { phrase: "Le vendeur s'engage à fournir le justificatif de ramonage", type: 'entretien', page: 12 },
        { phrase: "Le vendeur s'engage à remettre les factures des travaux réalisés", type: 'document', page: 13 },
        { phrase: "Le vendeur s'engage à faire réparer la toiture du garage", type: 'travaux', page: 9 }
      ],
      documents: [
        { label: 'Justificatif de ramonage', cat: 'entretien', cleChecklist: 'ramonage' },
        { label: 'Factures des travaux réalisés', cat: 'justificatif', cleChecklist: 'facturesTravaux' }
      ]
    }
  });
  const statuts = app.verifierObligationsVendeur(d, []).map(o => o.statut).join(',');
  assert.equal(statuts, 'non_tenue,a_verifier,tenue');
});

test('verifierObligationsVendeur : une pièce retirée de la checklist du dossier n’est plus attendue', () => {
  const app = chargerApplication();
  const d = dossierAvecEngagements({ piecesRetirees: ['ramonage'] });
  const obligations = app.verifierObligationsVendeur(d, []);
  assert.ok(!obligations.some(o => o.cle === 'ramonage'));
  assert.ok(obligations.some(o => o.cle === 'facturesTravaux'));
});
