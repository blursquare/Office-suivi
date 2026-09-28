'use strict';
// Rapprochement des reçus comptables du jour avec l'acquéreur d'un dossier (voir renderFondsRecus).
// Les deux premiers tests de format reprennent la STRUCTURE exacte des reçus réels de l'étude
// (JasperReports, un reçu par page, envoyés le 28/09) avec des noms, comptes et montants inventés.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');
const app = chargerApplication();

test('patronymes de l’acquéreur : parties du dossier, sinon partie droite du nom', () => {
  assert.equal(app.motsPayeurDossier({ parties: [{ nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'MARTIN & LÉGER', role: 'ACQUEREUR' }] }).join(','), 'martin,leger');
  assert.equal(app.motsPayeurDossier({ nom: 'DUPONT / Époux BÉNARD' }).join(','), 'benard');
});

test('montants à deux décimales, séparateurs de milliers compris', () => {
  assert.equal(app.montantsDansLigne('Reçu n°12 — 1 234,56 € — solde 227 642,28 EUR').join('|'), '1234.56|227642.28');
  assert.equal(app.montantsDansLigne('le 28/09/2026 réf 45').length, 0);
});

test('tableau : une ligne par reçu, le dernier montant de la ligne est retenu', () => {
  const pages = [[
    'RECUS DU 25/09/2026',
    'N° 1204  VTE DUPONT / MARTIN  virement MARTIN Paul  145 300,00 €',
    'N° 1205  VTE ROBERT / DURAND  virement DURAND  98 000,00 €',
    'N° 1206  MARTIN Paul  provision  100,00 €'
  ]];
  const r = app.recusDuPayeurDansPages(pages, ['martin']);
  assert.equal(r.map(x => x.montant).join('|'), '145300|100');
});

test('un reçu par page : le nom sur une ligne, la somme sur une autre ; page ambiguë ignorée', () => {
  const pages = [
    ['REÇU', 'Reçu de Monsieur Paul MARTIN', 'la somme de : 12 500,00 €', 'Dossier VTE DUPONT / MARTIN'],
    ['REÇU', 'Reçu de Madame DURAND', 'la somme de : 3 000,00 €'],
    ['REÇU', 'MARTIN Paul', 'Débit 50,00', 'Crédit 60,00']
  ];
  const r = app.recusDuPayeurDansPages(pages, ['martin']);
  assert.equal(r.map(x => `${x.page}:${x.montant}`).join('|'), '1:12500');
});

test('montant attendu lu dans un décompte, et état de l’indicateur', () => {
  const texte = ['Prix de vente 200 000,00 €', 'Frais d’acte 15 000,00 €', 'Dépôt de garantie versé 10 000,00 €'].join('\n');
  const solde = app.soldeAttenduDepuisDecompte(texte);
  assert.ok(solde > 0);
  assert.equal(app.bilanFondsRecus(205000, 205000).etat, 'complet');
  assert.equal(app.bilanFondsRecus(204999.5, 205000).etat, 'complet');
  const p = app.bilanFondsRecus(100000, 205000);
  assert.equal(p.etat, 'partiel');
  assert.equal(p.reste, 105000);
  assert.equal(app.bilanFondsRecus(0, 205000).etat, 'aucun');
  assert.equal(app.bilanFondsRecus(500, null).etat, 'inconnu');
});

test('import d’une sauvegarde : le montant saisi reste, le rapprochement repart de zéro', () => {
  const d = app.normaliserDossierImporte({ id: 'x', nom: 'A / B', fondsAttendusManuel: 1234.5, fondsRecus: { total: 10 } });
  assert.equal(d.fondsAttendusManuel, 1234.5);
  assert.equal(d.fondsRecus, null);
});

// Structure réelle : émetteur, ligne date + total, montant en lettres, « compte : N », une ligne par
// écriture (titulaire, libellé, montant) dont le libellé continue à la ligne suivante, puis total.
const RECU_CONFRERE = [
  'DUVAL-MARCHAND ANNE-SOPHIE', '12 RUE DES TILLEULS', '41000 BLOIS',
  '14/09/2026 SGOSSART/BDERO 98 610,40 € Euros',
  'quatre-vingt-dix-huit mille six cent dix Euros et quarante Centimes',
  'compte : 3412 3412 3412',
  'LEMOINE Paul VIR RECU DE MAITRE ANNE-SOPHIE DUVAL-MARCHAND SOLDE PRIX DE 90 000,00 €',
  'VENTE BERTIN/LEMOINE',
  'LEMOINE Paul VIR RECU DE MAITRE ANNE-SOPHIE DUVAL-MARCHAND SOLDE 8 400,00 €',
  'PROVISION SUR FRAIS VTE BERTIN/LEMOINE',
  'LEMOINE Paul VIR RECU DE MAITRE ANNE-SOPHIE DUVAL-MARCHAND PRORATA DE 210,40 €',
  'TAXE FONCIERE VTE BERTIN/LEMOINE',
  '98 610,40 €', 'LE 14/09/2026 - VIREMENT', '98 610,40 €'
];

test('reçu comptable réel : écritures au nom de l’acquéreur, date et compte lus dans le reçu', () => {
  const recu = app.lireRecuComptable(RECU_CONFRERE);
  assert.equal(recu.date, '2026-09-14');
  assert.equal(recu.compte, '3412');
  assert.equal(recu.ecritures.length, 3);
  assert.equal(recu.ecritures[0].titulaire, 'LEMOINE Paul');
  assert.match(recu.ecritures[1].libelle, /PROVISION SUR FRAIS VTE BERTIN\/LEMOINE$/);
  const d = { nom: 'BERTIN / LEMOINE' };
  const r = app.recusDuPayeurDansPages([RECU_CONFRERE], app.motsPayeurDossier(d), app.motsVendeurDossier(d));
  assert.equal(r.map(x => x.montant).join('|'), '90000|8400|210.4');
  assert.ok(r.every(x => x.confirme && x.date === '2026-09-14' && x.compte === '3412'));
  // Le vendeur du même dossier n'est pas le payeur : son nom dans la référence ne compte pas.
  const vendeur = app.recusDuPayeurDansPages([RECU_CONFRERE], ['bertin'], ['lemoine']);
  assert.equal(vendeur.length, 0);
});

test('reçu comptable réel : remboursement de trop-perçu et reçu d’un autre client écartés', () => {
  const remboursement = [
    'SPFE BLOIS 1', '14/09/2026 SGOSSART/BDERO 1,00 € Euros', 'un Euro', 'compte : 3016',
    'LEMOINE Paul VIR SEPA RECU DDFIP LOIR-ET-CHER RESTITUTION TROP PERCU VTE 1,00 €',
    'BERTIN - LEMOINE', '1,00 €', 'LE 14/09/2026 - VIREMENT CDC - COMPTE CLIENTS DCN', '1,00 €'
  ];
  const autre = [
    'MR ROUSSEL ALAIN', '14/08/2026 SGOSSART/ 5 200,00 € Euros', 'cinq mille deux cents Euros',
    'compte : 2988', 'ROUSSEL Alain VIR INST RECU CAVDF SOLDE SUCCESSION ROUSSEL 5 200,00 €',
    '5 200,00 €', 'LE 14/08/2026 - VIREMENT CDC - COMPTE CLIENTS DCN', '5 200,00 €'
  ];
  const r = app.recusDuPayeurDansPages([remboursement, autre], ['lemoine'], ['bertin']);
  assert.equal(r.length, 0);
});

// --- Décompte à la racine du dossier relié, vérification automatique (28/09) -----------------
test('fichiersDecompteRacine : racine seulement, noms parlants d’abord, jamais l’avant-contrat', () => {
  const app = chargerApplication();
  const { parNom, autres } = app.fichiersDecompteRacine([
    { nom: 'Décompte acquéreur.pdf', chemin: 'Décompte acquéreur.pdf' },
    { nom: 'Convocation RDV 2026.pdf', chemin: 'Convocation RDV 2026.pdf' },
    { nom: 'Décompte ancien.pdf', chemin: 'AAE/Décompte ancien.pdf' },
    { nom: 'Compromis signé.pdf', chemin: 'Compromis signé.pdf' },
    { nom: 'SCAN0042.pdf', chemin: 'SCAN0042.pdf' },
    { nom: 'Pour Me DURAND.pdf', chemin: 'Pour Me DURAND.pdf' },
    { nom: 'Offre de prêt.pdf', chemin: 'Offre de prêt.pdf' },
    { nom: 'Tableau d’amortissement.pdf', chemin: 'Tableau d’amortissement.pdf' }
  ], 'SCAN0042.pdf');
  assert.equal(parNom.map(f => f.nom).join(' | '), 'Convocation RDV 2026.pdf | Décompte acquéreur.pdf');
  assert.equal(autres.map(f => f.nom).join(' | '), 'Pour Me DURAND.pdf');
});

test('dossiersAVerifierFonds : dossiers du poste, appel de fonds fait, avant le rendez-vous, une fois par heure', () => {
  const app = chargerApplication();
  const maintenant = Date.parse('2026-10-05T10:00:00Z');
  const base = { responsable: 'Julie VASSELIN', appelFonds: '2026-10-01', echeancesValidees: { appelFonds: true }, rendezVousSignature: '2026-10-12' };
  const liste = [
    Object.assign({ id: 'a' }, base),
    Object.assign({ id: 'b' }, base, { responsable: 'Jérémy SAUJOT' }),
    Object.assign({ id: 'c' }, base, { appelFonds: '', echeancesValidees: {} }),
    Object.assign({ id: 'd' }, base, { receptionFondsConfirmeeLe: '2026-10-04' }),
    Object.assign({ id: 'e' }, base, { fondsRecus: { total: 100, attendu: 100, verifieLe: '2026-10-01T10:00:00Z' } }),
    Object.assign({ id: 'f' }, base, { fondsRecus: { total: 50, attendu: 100, verifieLe: '2026-10-05T09:30:00Z' } }),
    Object.assign({ id: 'g' }, base, { fondsRecus: { total: 50, attendu: 100, verifieLe: '2026-10-05T08:00:00Z' } }),
    Object.assign({ id: 'h' }, base, { rendezVousSignature: '2026-10-01' })
  ];
  assert.equal(app.dossiersAVerifierFonds(liste, 'Julie VASSELIN', '2026-10-05', maintenant).map(d => d.id).join(','), 'a,g');
  assert.equal(app.dossiersAVerifierFonds(liste, '', '2026-10-05', maintenant).length, 0);
});

test('fichiersDecompteRacine : noms employés par l’étude, jamais un décompte de remboursement de prêt', () => {
  const app = chargerApplication();
  const { parNom } = app.fichiersDecompteRacine([
    { nom: 'Convocation au rendez-vous contenant l’appel de fonds.pdf', chemin: 'Convocation au rendez-vous contenant l’appel de fonds.pdf' },
    { nom: 'Décompte acquéreur.pdf', chemin: 'Décompte acquéreur.pdf' },
    { nom: 'DECOMPTE de remboursement ECO PRET.pdf', chemin: 'DECOMPTE de remboursement ECO PRET.pdf' }
  ], '');
  assert.equal(parNom.map(f => f.nom).sort().join(' | '), 'Convocation au rendez-vous contenant l’appel de fonds.pdf | Décompte acquéreur.pdf');
});

test('ligne « Envoi appel de fonds » : lien vers le courrier rattaché, ou « Retrouver le courrier »', () => {
  const app = chargerApplication();
  const base = { id: 'd1', nom: 'X / Y', nasDossier: 'X', appelFonds: '2026-10-01', echeancesValidees: { appelFonds: true } };
  assert.match(app.renderLienCourrierAppelFonds(Object.assign({ appelFondsCourrier: 'Décompte acquéreur.pdf' }, base)), /ouvrirCourrierAppelFonds\('d1'\)[^>]*>.*Décompte acquéreur<\/button>/s);
  assert.match(app.renderLienCourrierAppelFonds(base), /Retrouver le courrier/);
  assert.equal(app.renderLienCourrierAppelFonds(Object.assign({}, base, { nasDossier: '' })), '');
  assert.equal(app.renderLienCourrierAppelFonds(Object.assign({}, base, { appelFonds: '', echeancesValidees: {} })), '');
  // Sur la fiche : sous la ligne de l'envoi.
  const html = app.echeancesOrdonneesFiche(Object.assign({ sansPret: true, rendezVousSignature: '2099-01-01', appelFondsCourrier: 'Convocation au rendez-vous.pdf', historique: [], pieces: {}, autres: [] }, base), {}, '');
  const ligne = html.match(/<li class="ech ech-appelFonds[^"]*">[\s\S]*?<\/li>/)[0];
  assert.match(ligne, /Convocation au rendez-vous<\/button>/);
});
