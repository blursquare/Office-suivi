'use strict';
// Onglet Analyse de la fiche : engagements et documents cochés reçus/réalisés, comptés dans le statut
// du dossier et la probabilité de tenue (02/10). Dossiers inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const AUJ = '2026-10-02';
// Dossier relié, comptant, toutes les pièces standard reçues : seul compte ce que dit l'analyse.
function dossier(analyse, extra) {
  const d = Object.assign({ id: 'x', nom: 'MARTEL / FOURNIER', typeVente: 'maison', sansPret: true, dossierLie: true, pieces: {}, analyseJuridique: analyse }, extra || {});
  app.checklistPieces(d.typeVente, Object.assign({}, d, { analyseJuridique: { documents: [], engagements: [] } }))
    .forEach(p => { d.pieces[p.cle] = 'recue'; });
  return d;
}
const travaux = { phrase: 'Le PROMETTANT s’engage à remettre en état le portail avant la vente.', type: 'travaux', page: 12 };
const entretien = { phrase: 'Le VENDEUR s’engage à justifier du ramonage de la cheminée.', type: 'entretien', page: 9 };

test('libelleCourtEngagement : l’objet de l’engagement, sans « Le PROMETTANT s’engage à »', () => {
  assert.equal(app.libelleCourtEngagement(travaux), 'Remettre en état le portail avant la vente');
  assert.equal(app.libelleCourtEngagement('Le vendeur devra fournir une facture des travaux de toiture réalisés en 2019 par une entreprise qualifiée.'),
    'Fournir une facture des travaux de toiture réalisés en…');
});

test('un engagement non coché garde le dossier « Attente de pièces » ; coché, il est complet', () => {
  const d = dossier({ documents: [], engagements: [Object.assign({}, travaux)] });
  const e = app.etatDossier(d, AUJ);
  assert.equal(e.cle, 'attente');
  assert.match(e.detail, /Engagement : Remettre en état le portail/);
  d.analyseJuridique.engagements[0].fait = true;
  assert.equal(app.etatDossier(d, AUJ).cle, 'complet');
});

test('un document relevé hors checklist : à recevoir, puis coché reçu', () => {
  const d = dossier({ documents: [{ label: 'Attestation d’assurance dommages-ouvrage', cat: 'justificatif' }], engagements: [] });
  assert.equal(app.elementsAnalyseEnAttente(d).documents.join('|'), 'Attestation d’assurance dommages-ouvrage');
  assert.equal(app.etatDossier(d, AUJ).cle, 'attente');
  d.analyseJuridique.documents[0].recu = true;
  assert.equal(app.etatDossier(d, AUJ).cle, 'complet');
  assert.equal(JSON.stringify(app.avancementAnalyse(d)), '{"faits":1,"total":1}');
});

test('un document qui est une pièce de la checklist partage son état et n’est compté qu’une fois', () => {
  const doc = { label: 'Justificatif de ramonage', cat: 'entretien', cleChecklist: 'ramonage' };
  const d = dossier({ documents: [doc], engagements: [Object.assign({}, entretien)] });
  assert.equal(app.cleChecklistDocumentAnalyse(d, doc), 'ramonage');
  d.pieces.ramonage = 'manquante';
  assert.equal(app.documentAnalyseRecu(d, doc), false);
  // Manque : la pièce de la checklist (une fois) et l'engagement, pas le document en double.
  const manque = app.piecesAttenduesDossier(d);
  assert.equal(manque.filter(x => /ramonage/i.test(x)).length, 2);
  assert.equal(app.elementsAnalyseEnAttente(d).documents.length, 0);
  // La pièce reçue : le document l'est, et l'engagement d'entretien se coche seul.
  d.pieces.ramonage = 'recue';
  assert.equal(app.documentAnalyseRecu(d, doc), true);
  const et = app.etatEngagementAnalyse(d, d.analyseJuridique.engagements[0]);
  assert.equal(`${et.fait}/${et.auto}`, 'true/true');
  assert.match(et.motif, /Justificatif de ramonage/);
  assert.equal(app.etatDossier(d, AUJ).cle, 'complet');
});

test('participation : l’analyse ne compte pas (l’étude ne suit pas la checklist)', () => {
  const d = dossier({ documents: [{ label: 'Facture', cat: 'justificatif' }], engagements: [Object.assign({}, travaux)] }, { roleNotaire: 'participant' });
  const a = app.elementsAnalyseEnAttente(d);
  assert.equal(a.engagements.length + a.documents.length, 0);
});

test('probabilité de tenue : un engagement non réalisé retire des points, avec son geste', () => {
  const d = dossier({ documents: [], engagements: [Object.assign({}, travaux)] }, { rendezVousSignature: '2026-10-08', appelFonds: '2026-09-20', projetEnvoye: '2026-09-28' });
  const p = app.probabiliteTenueSignature(d, AUJ, []);
  const f = p.facteurs.find(x => /engagement du vendeur non réalisé/.test(x.libelle));
  assert.ok(f, p.facteurs.map(x => x.libelle).join(' | '));
  assert.equal(f.retrait, 6);
  assert.equal(f.action, 'Relancer le vendeur');
  // Le même engagement n'est pas aussi compté comme pièce manquante.
  assert.ok(!p.facteurs.some(x => /pièce.*manquante/.test(x.libelle)));
  d.analyseJuridique.engagements[0].fait = true;
  const p2 = app.probabiliteTenueSignature(d, AUJ, []);
  assert.ok(p2.facteurs.some(x => x.libelle === 'Engagements du vendeur réalisés' && x.ok));
  assert.equal(p2.pourcent - p.pourcent, 6);
});
