'use strict';
// Dossiers archivés visibles dans la vue « Échéances » du Suivi (étude, 30/09). Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const archive = (id, extra) => Object.assign({ id, nom: id.toUpperCase() + ' / MARTIN', archive: true, historique: [] }, extra);

test('repère d’un archivé : la signature, sinon la date d’archivage', () => {
  const signe = archive('a', { rendezVousSignature: '2026-09-12' });
  assert.equal(JSON.stringify(app.repereArchiveSuivi(signe)), JSON.stringify({ iso: '2026-09-12', type: 'rendezVousSignature', label: 'Signé' }));
  const sansRdv = archive('b', { historique: [{ date: '2026-08-01T10:00:00', texte: 'Dossier archivé' }, { date: '2026-09-03T10:00:00', texte: 'Dossier archivé automatiquement (questionnaire de satisfaction envoyé)' }] });
  assert.equal(app.repereArchiveSuivi(sansRdv).iso, '2026-09-03');
  assert.equal(app.repereArchiveSuivi(sansRdv).label, 'Archivé');
});

test('seuls les archivés, les plus récents d’abord, un archivé sans date en dernier', () => {
  const liste = [
    archive('ancien', { rendezVousSignature: '2026-06-02' }),
    { id: 'actif', nom: 'ACTIF', archive: false, rendezVousSignature: '2026-10-02' },
    archive('sansdate'),
    archive('recent', { rendezVousSignature: '2026-09-20' }),
  ];
  assert.equal(app.archivesPourEcheances(liste).map(x => x.dossier.id).join(','), 'recent,ancien,sansdate');
});
