// Historique des courriers d'appel de fonds (client/43-historique-appels-fonds.js). Noms et montants inventés.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

const etat = {
  dossierLie: 'dos-1',
  clients: [{ civilite: 'M', prenom: 'Paul', nom: 'ROCHE' }, { civilite: 'Mme', prenom: 'Léa', nom: 'ROCHE' }],
  situation: 'marie',
  mode: 'office',
  lignes: { debit: [], credit: [] },
  champs: { 'af-ref': 'VTE LAMBERT / ROCHE', 'af-date-rdv': '2026-11-03' },
  cases: { 'af-sans-pret': false },
  mention: ''
};

test('entreeHistoriqueAppelFonds : dossier, destinataires du courrier, rendez-vous et premier geste', () => {
  const e = app.entreeHistoriqueAppelFonds({
    id: 'af-test1', maintenant: '2026-10-06T08:00:00.000Z', par: 'Julie',
    dossier: { id: 'dos-1', nom: 'LAMBERT / ROCHE' }, nomFichier: 'Convocation - ROCHE.docx', geste: 'telecharge',
    donnees: { solde: '12.345,00 €' }, etat
  });
  assert.strictEqual(e.dossierId, 'dos-1');
  assert.match(e.dossier, /ROCHE/);
  assert.strictEqual(e.destinataires, 'Monsieur et Madame Paul ROCHE');
  assert.strictEqual(e.dateRdv, '2026-11-03');
  assert.strictEqual(e.mode, 'office');
  assert.strictEqual(e.gestes.length, 1);
  assert.strictEqual(e.gestes[0].type, 'telecharge');
  assert.strictEqual(e.gestes[0].par, 'Julie');
  assert.strictEqual(e.creeLe, e.modifieLe);
});

test('entreeHistoriqueAppelFonds : sans dossier relié, courrier gardé quand même', () => {
  const e = app.entreeHistoriqueAppelFonds({
    id: 'af-test2', par: '', dossier: null, geste: 'envoye', donnees: {},
    etat: Object.assign({}, etat, { dossierLie: '', situation: '', mode: 'confrere' })
  });
  assert.strictEqual(e.dossierId, '');
  assert.strictEqual(e.dossier, '');
  assert.strictEqual(e.mode, 'confrere');
  assert.strictEqual(e.destinataires, 'Monsieur Paul ROCHE et Madame Léa ROCHE');
});

test('filtrerAppelsFonds : dossier, client, référence ou auteur, sans accents ni casse', () => {
  const liste = [
    { id: 'a', dossier: 'VTE - LAMBERT / ROCHE', destinataires: 'Monsieur Paul ROCHE', ref: '', par: 'Julie' },
    { id: 'b', dossier: 'VTE - DUPRÉ / MOREAU', destinataires: 'Madame Inès MOREAU', ref: 'VTE DUPRÉ', par: 'Jérémy' }
  ];
  assert.strictEqual(app.filtrerAppelsFonds(liste, 'roche').map(a => a.id).join(','), 'a');
  assert.strictEqual(app.filtrerAppelsFonds(liste, 'dupre').map(a => a.id).join(','), 'b');
  assert.strictEqual(app.filtrerAppelsFonds(liste, 'jeremy').map(a => a.id).join(','), 'b');
  assert.strictEqual(app.filtrerAppelsFonds(liste, '').length, 2);
  assert.strictEqual(app.filtrerAppelsFonds(liste, 'martin').length, 0);
});

test('texteDernierGesteAppelFonds : dernier geste, quand et par qui', () => {
  const m = new Date(2026, 9, 6, 15, 0);
  const a = { gestes: [
    { type: 'telecharge', le: new Date(2026, 9, 1, 9, 0).toISOString(), par: 'Julie' },
    { type: 'envoye', le: new Date(2026, 9, 6, 10, 32).toISOString(), par: 'Bastien' }
  ] };
  assert.match(app.texteDernierGesteAppelFonds(a, m), /^Email envoyé à 10:32 par Bastien$/);
  assert.match(app.texteDernierGesteAppelFonds({ gestes: [a.gestes[0]] }, m), /^Téléchargé le 1 oct\.? par Julie$/);
  assert.strictEqual(app.texteDernierGesteAppelFonds({ gestes: [{ type: 'prepare', le: new Date(2026, 9, 5, 9, 0).toISOString(), par: '' }] }, m), 'Email préparé hier');
  assert.strictEqual(app.texteDernierGesteAppelFonds({ gestes: [] }, m), '');
});
