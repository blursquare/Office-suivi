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
  assert.match(app.texteDernierGesteAppelFonds({ gestes: [{ type: 'modifie', le: new Date(2026, 9, 6, 11, 5).toISOString(), par: 'Julie' }] }, m), /^Modifié à 11:05 par Julie$/);
});

// Barre d'étapes des outils (client/44-presentation-outils.js).
test('etapeCouranteOutil : titre passé le plus proche de la ligne, colonne voisine remontée ignorée, bas de page', () => {
  const positions = [
    { cle: 'dossier', haut: -900 }, { cle: 'decompte', haut: -500 }, { cle: 'clients', haut: 120 },
    { cle: 'rdv', haut: 600 }, { cle: 'courrier', haut: -1400 }
  ];
  assert.strictEqual(app.etapeCouranteOutil(positions, 350), 'clients');
  // Haut de page : premier titre et aperçu voisin à la même hauteur → la première étape.
  assert.strictEqual(app.etapeCouranteOutil([{ cle: 'dossier', haut: 250 }, { cle: 'courrier', haut: 255 }], 350), 'dossier');
  assert.strictEqual(app.etapeCouranteOutil([{ cle: 'dossier', haut: 500 }], 350), 'dossier');
  // Bas de page : la dernière section à l'écran, même sous la ligne.
  assert.strictEqual(app.etapeCouranteOutil([{ cle: 'bien', haut: 200 }, { cle: 'financement', haut: 770 }, { cle: 'courrier', haut: -900 }], 350, 1000), 'financement');
});

test('etatTuilePiece : à choisir, lue avec ce qui est retenu, ou illisible', () => {
  assert.strictEqual(app.etatTuilePiece('tf', null).etat, 'vide');
  assert.match(app.etatTuilePiece('tf', { montantAvis: 1200, retenu: 1250 }).texte, /^Lu · 1\.250,00/);
  assert.strictEqual(app.etatTuilePiece('tf', { erreur: true }).etat, 'erreur');
  assert.strictEqual(app.etatTuilePiece('charges', { analyse: { montant: null } }).etat, 'erreur');
  assert.match(app.etatTuilePiece('charges', { analyse: { montant: 450.5 } }).texte, /450,50/);
  assert.strictEqual(app.etatTuilePiece('etatDate', { analyse: { montant: 0, absent: true } }).texte, 'Lu · pas de fonds de travaux');
  assert.match(app.etatTuilePiece('releve', { analyse: { recu: { prix: 1000, frais: 500 } } }).texte, /1\.500,00\s€ versés/);
  assert.strictEqual(app.etatTuilePiece('charges', { erreur: true }).texte, 'PDF illisible');
});
