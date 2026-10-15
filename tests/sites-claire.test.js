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

test('plan aérien : parts de zone en « 66,6 % », une ligne par parcelle et par zone, hors zone dit seulement s’il existe', () => {
  assert.strictEqual(app.pourcentageZonage(66.64), '66,6 %');
  assert.strictEqual(app.pourcentageZonage(100), '100 %');
  const plans = [{ parcelles: [
    { section: 'AL', numero: '694', zonageLu: true, rnu: false, zones: [{ libelle: 'UA', libelong: 'Centre', pourcentage: 70 }, { libelle: 'N', libelong: '', pourcentage: 29.6 }], horsZone: 0.4 },
    { section: 'AL', numero: '887', zonageLu: true, rnu: false, zones: [{ libelle: 'N', libelong: 'Naturelle', pourcentage: 90 }], horsZone: 10 },
    { section: 'AL', numero: '1', zonageLu: true, rnu: true, zones: [], horsZone: 100 },
    { section: 'AL', numero: '2', zonageLu: false, zones: [] }] }];
  const l = app.lignesZonagePlanAerien(plans).map(x => `${x.parcelle}|${x.zone}|${x.part}`);
  assert.strictEqual(l.join(' // '), ['AL 694|UA — Centre|70 %', 'AL 694|N|29,6 %', 'AL 887|N — Naturelle|90 %', 'AL 887|Hors zone du document|10 %',
    'AL 1|Règlement national d’urbanisme (pas de document)|', 'AL 2|Zonage non lu (Géoportail de l’urbanisme injoignable)|'].join(' // '));
});

test('photos à comparer : les numéros de parcelles sont placés en % de l’image, ceux hors cadre écartés', () => {
  const l = app.etiquettesImage([{ texte: 'AL 839', dossier: true, x: 1.5, y: 47.5 }, { texte: '840', dossier: false, x: 1.9, y: 47.1 }, { texte: '12', dossier: false, x: 5, y: 47.5 }, { texte: '', dossier: false, x: 1.5, y: 47.5 }], [1, 47, 2, 48]);
  assert.strictEqual(l.length, 2);
  assert.strictEqual(l[0].texte, 'AL 839');
  assert.ok(l[0].dossier && Math.abs(l[0].x - 50) < 0.01 && Math.abs(l[0].y - 50) < 0.01);
  assert.ok(!l[1].dossier && Math.abs(l[1].x - 90) < 0.01 && Math.abs(l[1].y - 90) < 0.01);
});
