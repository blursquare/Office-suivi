// Plan de situation de cadastre.gouv.fr (client/69-sites-claire.js, étude 14/10) : ce qui manque pour le lancer, commune de l'outil,
// parcelles envoyées au serveur, lignes de résultat. Cas inventés.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('consultation : la commune puis les parcelles de l’outil sont exigées', () => {
  assert.match(app.manqueConsultationSites(null), /commune/);
  assert.match(app.manqueConsultationSites({ insee: '', parcelles: 'AL 694' }), /commune/);
  assert.match(app.manqueConsultationSites({ insee: '41018', parcelles: '' }), /parcelles/);
  assert.strictEqual(app.manqueConsultationSites({ insee: '41018', parcelles: 'AL 694, AL 887' }), '');
});

test('commune de l’outil : le nom de la commune choisie', () => {
  const e = { insee: '41018', communes: [{ insee: '41269', nom: 'Vineuil' }, { insee: '41018', nom: 'Blois' }] };
  assert.strictEqual(app.communeOutilSites(e), 'Blois');
  assert.strictEqual(app.communeOutilSites({ insee: '99999', communes: [] }), '');
});

test('parcelles envoyées au serveur sous la forme lue par l’outil (« AB 12 et 13 » → deux parcelles)', () => {
  assert.strictEqual(app.parcellesNormaliseesSites('AB 12 et 13'), 'AB 12, AB 13');
  assert.strictEqual(app.parcellesNormaliseesSites('AL 694, AL 887'), 'AL 694, AL 887');
  assert.strictEqual(app.parcellesNormaliseesSites(''), '');
});

test('une ligne par plan tiré : échelle, parcelles, échelle demandée relevée dite', () => {
  assert.strictEqual(app.lignesPlansSites({ plans: [{ echelle: 500, parcelles: 'AL 694, AL 887' }] }).join(' | '), 'Extrait au 1/500 — parcelles AL 694, AL 887.');
  const deux = app.lignesPlansSites({ plans: [{ echelle: 500, parcelles: 'AL 694' }, { echelle: 1000, parcelles: 'CV 50', echelleRelevee: true }] });
  assert.strictEqual(deux[0], 'Plan 1/2 : au 1/500 — parcelles AL 694.');
  assert.match(deux[1], /^Plan 2\/2 : au 1\/1000 — parcelles CV 50 \(échelle demandée trop fine/);
});
