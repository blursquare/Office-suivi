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

// Règle de l'étude (05/10) : 2 € d'écart au plus (50 € jusque-là), dans un sens comme dans l'autre. Bien au-delà du montant attendu : écart à vérifier.
test('bilanFondsRecus : complet à 2 € près, excédent jamais « complet »', () => {
  assert.equal(app.bilanFondsRecus(331158.76, 331158.76).etat, 'complet');
  const plus = app.bilanFondsRecus(331160.76, 331158.76);
  assert.equal(plus.etat, 'complet');
  assert.equal(plus.ecart, 2);
  assert.equal(app.bilanFondsRecus(331157, 331158.76).etat, 'complet');
  assert.equal(app.bilanFondsRecus(331156.5, 331158.76).etat, 'partiel');
  assert.equal(app.bilanFondsRecus(331188.76, 331158.76).etat, 'excedent');
  const trop = app.bilanFondsRecus(405977.91, 331158.76);
  assert.equal(trop.etat, 'excedent');
  assert.equal(trop.reste, 0);
  assert.equal(trop.ecart, 74819.15);
});

test('patronymes de l’acquéreur : nom d’usage du nom du dossier, du courrier d’appel de fonds, saisi à la main', () => {
  const parties = [{ nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'MARTIN', role: 'ACQUEREUR' }];
  assert.equal(app.motsPayeurDossier({ parties, nom: 'DUPONT / CRIL' }).join(','), 'martin,cril');
  assert.equal(app.motsPayeurDossier({ parties, nom: 'DUPONT / MARTIN',
    appelFondsCourrier: "Convocation au rendez-vous contenant l'appel de fonds - CRIL.pdf" }).join(','), 'martin,cril');
  assert.equal(app.motsPayeurDossier({ parties, nom: 'DUPONT / MARTIN',
    fondsRecus: { attenduChemin: "Convocation au rendez-vous contenant l'appel de fonds - CRIL et ROUX.pdf" } }).join(','), 'martin,cril,roux');
  assert.equal(app.motsPayeurDossier({ parties, nom: 'DUPONT / MARTIN', nomsRecus: 'Cril' }).join(','), 'martin,cril');
  // Le vendeur n'est jamais pris pour l'acquéreur, et le nom d'usage ne passe pas côté vendeur.
  assert.equal(app.motsVendeurDossier({ parties, nom: 'DUPONT / MARTIN', nomsRecus: 'CRIL' }).join(','), 'dupont');
  // Import d'une sauvegarde : les noms saisis restent.
  assert.equal(app.normaliserDossierImporte({ id: 'y', nom: 'A / B', nomsRecus: 'CRIL' }).nomsRecus, 'CRIL');
});

// Reçu au nom d'usage (structure réelle, noms inventés) : l'acquéreuse désignée dans l'acte sous son
// nom de naissance MARTIN verse sous son nom d'épouse CRIL.
test('reçu au nom d’épouse : retrouvé une fois le nom d’usage connu', () => {
  const page = [
    'CAISSE D’ÉPARGNE', '28/09/2026 SGOSSART/JSAUJO 331 158,76 € Euros', 'trois cent trente et un mille…',
    'compte : 3071', 'CRIL Yvette VIR RECU DE MME CRIL YVETTE SOLDE PRIX ET FRAIS 331 158,76 €',
    'VTE DUPONT/CRIL', '331 158,76 €'
  ];
  assert.equal(app.recusDuPayeurDansPages([page], ['martin'], ['dupont']).length, 0);
  const r = app.recusDuPayeurDansPages([page], ['martin', 'cril'], ['dupont']);
  assert.equal(r.map(x => x.montant).join('|'), '331158.76');
  assert.ok(r[0].confirme);
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

test('referenceVenteLibelle : les deux côtés de la référence de la vente', () => {
  assert.equal(app.referenceVenteLibelle('VIR RECU DE SCP X SOLDE PRIX DE VENTE FAURE-LEGRAND/VASSEUR'), 'FAURE-LEGRAND / VASSEUR');
  assert.equal(app.referenceVenteLibelle('VIR RECU PROVISION SUR FRAIS VTE BERTIN/LEMOINE'), 'BERTIN / LEMOINE');
  assert.equal(app.referenceVenteLibelle('RECU DE MME ROLLAND CLAIRE QUOTE-PART PASSIF'), '');
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

// Reçu du 28/09 (structure réelle, noms inventés) : le libellé cite les vendeurs d'une autre vente
// (« VTE FAURE-LEGRAND/VASSEUR ») — le versement est celui de VASSEUR, titulaire en début de ligne,
// jamais celui d'un autre dossier des FAURE. Et une ligne qui commence par « RECU » (sans VIR) isole
// aussi son titulaire : le libellé « RECU DE MME ROLLAND CLAIRE » ne compte pas pour les ROLLAND.
test('reçu comptable : seul le titulaire en début de ligne désigne le client, jamais le libellé', () => {
  const vente = [
    'SCP NOTAIRES DU VAL', '28/09/2026 SGOSSART/JSAUJO 405 977,91 € Euros', 'quatre cent cinq mille…',
    'compte : 3064 3064 3064',
    'VASSEUR Léon et BERNARD VIR RECU DE SCP NOTAIRES DU VAL SOLDE PRIX DE VENTE 375 000,00 €',
    'FAURE-LEGRAND/VASSEUR',
    'VASSEUR Léon et BERNARD VIR RECU DE SCP NOTAIRES DU VAL SOLDE PROVISION SUR 30 395,11 €',
    'FRAIS VTE FAURE-LEGRAND/VASSEUR',
    'VASSEUR Léon et BERNARD VIR RECU DE SCP NOTAIRES DU VAL PRORATA DE TAXE 582,80 €',
    'FONCIERE VTE FAURE-LEGRAND/VASSEUR',
    '405 977,91 €'
  ];
  const sansVir = [
    'MME ROLLAND CLAIRE', '28/09/2026 SGOSSART/ 2 000,00 € Euros', 'deux mille Euros', 'compte : 3039',
    'PERRIN Jacques RECU DE MME ROLLAND CLAIRE QUOTE-PART PASSIF À RÉGLER 2 000,00 €', '2 000,00 €'
  ];
  assert.equal(app.lireRecuComptable(sansVir).ecritures[0].titulaire, 'PERRIN Jacques');
  // L'acquéreur VASSEUR : les trois écritures, confirmées par la référence de la vente.
  const vasseur = app.recusDuPayeurDansPages([vente], ['vasseur'], ['faure', 'legrand']);
  assert.equal(vasseur.map(r => r.montant).join(' + '), '375000 + 30395.11 + 582.8');
  assert.ok(vasseur.every(r => r.confirme));
  // Un autre dossier où les FAURE achètent : rien, malgré « FAURE-LEGRAND » dans le libellé.
  assert.equal(app.recusDuPayeurDansPages([vente], ['faure', 'legrand'], ['dupont']).length, 0);
  // Un dossier où BERNARD (le co-titulaire nommé après « et ») achète une autre maison : rien — le
  // client du compte est VASSEUR, et la référence cite une autre vente (reçu du 28/09).
  assert.equal(app.recusDuPayeurDansPages([vente], ['bernard'], ['dupont']).length, 0);
  assert.equal(app.recusDuPayeurDansPages([vente], ['bernard'], []).length, 0);
  // Même co-titulaire, mais la référence est bien la vente de son dossier : retenu, confirmé.
  const coTitulaire = app.recusDuPayeurDansPages([vente], ['bernard'], ['faure', 'legrand']);
  assert.equal(coTitulaire.length, 3);
  assert.ok(coTitulaire.every(r => r.confirme));
  // Les ROLLAND ne récupèrent pas le versement porté au compte de PERRIN.
  assert.equal(app.recusDuPayeurDansPages([sansVir], ['rolland'], []).length, 0);
  assert.equal(app.recusDuPayeurDansPages([sansVir], ['perrin'], []).length, 1);
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
    Object.assign({ id: 'e' }, base, { fondsRecus: { total: 100, attendu: 100, verifieLe: '2026-10-01T10:00:00Z', regle: 2 } }),
    Object.assign({ id: 'f' }, base, { fondsRecus: { total: 5000, attendu: 10000, verifieLe: '2026-10-05T09:30:00Z', regle: 2 } }),
    Object.assign({ id: 'g' }, base, { fondsRecus: { total: 5000, attendu: 10000, verifieLe: '2026-10-05T08:00:00Z', regle: 2 } }),
    Object.assign({ id: 'h' }, base, { rendezVousSignature: '2026-10-01' }),
    // « Complet » lu avec l'ancienne règle de rapprochement (avant le 29/09) : relu tout de suite.
    Object.assign({ id: 'i' }, base, { fondsRecus: { total: 405977.91, attendu: 331158.76, verifieLe: '2026-10-05T09:50:00Z' } })
  ];
  assert.equal(app.dossiersAVerifierFonds(liste, 'Julie VASSELIN', '2026-10-05', maintenant).map(d => d.id).join(','), 'a,g,i');
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

test('décompte du confrère (nom du fichier) : jamais le courrier de l’étude, ni à rattacher, ni déjà rattaché (étude 06/10)', () => {
  const app = chargerApplication();
  const D = require('../commun/decompte');
  assert.equal(D.nomDitDecompteConfrere('Décompte Me FOURNIER.pdf'), true);
  assert.equal(D.nomDitDecompteConfrere('DECOMPTE_CONSOEUR_DURAND.pdf'), true);
  assert.equal(D.nomDitDecompteConfrere('Décompte confrère.pdf'), true);
  assert.equal(D.nomDitDecompteConfrere('Décompte acquéreur.pdf'), false);
  assert.equal(D.nomDitDecompteConfrere('Décompte meublé.pdf'), false, '« me » seulement comme mot entier');
  assert.equal(D.nomDitDecompteConfrere('Convocation au rendez-vous contenant l’appel de fonds - Me DUPONT.pdf'), false, 'le courrier de CLAIRE, même s’il nomme un Me');
  const { parNom, autres } = app.fichiersDecompteRacine([
    { nom: 'Décompte Me FOURNIER.pdf', chemin: 'Décompte Me FOURNIER.pdf' },
    { nom: 'Décompte acquéreur.pdf', chemin: 'Décompte acquéreur.pdf' },
    { nom: 'Convocation au rendez-vous contenant l’appel de fonds - DUPONT.pdf', chemin: 'Convocation au rendez-vous contenant l’appel de fonds - DUPONT.pdf' }
  ], '');
  assert.equal(parNom.map(f => f.nom).join(' | '), 'Convocation au rendez-vous contenant l’appel de fonds - DUPONT.pdf | Décompte acquéreur.pdf', 'le courrier de CLAIRE d’abord, jamais celui du confrère');
  assert.equal(autres.map(f => f.nom).join(' | '), 'Décompte Me FOURNIER.pdf', 'le décompte du confrère reste lisible pour le montant attendu');
  // Déjà rattaché par erreur : ignoré par la fiche.
  assert.equal(app.courrierAppelFondsDossier({ appelFondsCourrier: 'Décompte Me FOURNIER.pdf' }), '');
  assert.equal(app.courrierAppelFondsDossier({ detectionsNas: { appelFondsFichier: 'Décompte confrère.pdf' } }), '');
  assert.equal(app.courrierAppelFondsDossier({ appelFondsCourrier: 'Décompte acquéreur.pdf' }), 'Décompte acquéreur.pdf');
});

test('solde attendu d’un courrier de convocation scanné, tel que l’OCR le rend (étude 06/10)', () => {
  const app = chargerApplication();
  // Structure du courrier réel « Convocation au RDV contenant l'appel de fonds » (montants inventés), lignes rendues par l'OCR.
  const texte = ['Votre décompte prévisionnel s\'établit comme suit :', 'Prix d\'acquisition 93.000,00 €',
    'Montant des frais et droits de l\'acte de vente 8.800,00 €', 'Honoraires négociation agence immobilière 7.000,00 €',
    'Quote-part de taxes foncières 92,60 €', 'Soit au total 108.892,60 €', 'A déduire', 'Acompte sur prix versé à l\'agence 8.000,00 €',
    'Acompte sur frais versé à l\'étude 0,00 €', 'Soit au total 8.000,00 €', 'Solde a verser 100.892,60€',
    'ATTENTION : Les paiements effectués ou reçus par un notaire doivent être assurés par virement'].join('\n');
  assert.equal(app.soldeAttenduDepuisDecompte(texte), 100892.6);
  assert.equal(app.PAGES_MAX_OCR_DECOMPTE, 4);
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

// Offre de prêt enregistrée à 16 h, reconnue à 18 h 30 (29/09) : un PDF qui dit « offre de prêt »
// dans son nom, ou que la surveillance du NAS vient de signaler, passe avant le budget du tour.
test('pdfPrioritairePourOffre : nom explicite ou fichier signalé nouveau', () => {
  const app = chargerApplication();
  assert.equal(app.pdfPrioritairePourOffre('Offre de pret Credit Agricole', 'Offre de prêt Crédit Agricole.pdf', []), true);
  assert.equal(app.pdfPrioritairePourOffre('SCAN0042', 'AAE/SCAN0042.pdf', ['AAE/SCAN0042.pdf']), true);
  assert.equal(app.pdfPrioritairePourOffre('SCAN0042', 'AAE/SCAN0042.pdf', []), false);
  assert.equal(app.pdfPrioritairePourOffre('Diagnostics', 'Diagnostics.pdf', null), false);
});

test('reçus supprimés du commun : les montants déjà retenus sont gardés en mémoire (30/09)', () => {
  const r1 = { chemin: 'COMMUN/recus_25-09-26.pdf', fichier: 'recus_25-09-26.pdf', page: 1, montant: 20000, date: '2026-09-25', extrait: 'MARTIN Paul — virement' };
  const r2 = { chemin: 'COMMUN/recus_28-09-26.pdf', fichier: 'recus_28-09-26.pdf', page: 2, montant: 5300, date: '2026-09-28', extrait: 'MARTIN Paul — virement' };
  const r3 = { chemin: 'COMMUN/recus_30-09-26.pdf', fichier: 'recus_30-09-26.pdf', page: 1, montant: 1000, date: '2026-09-30', extrait: 'MARTIN Paul — virement' };
  // Les deux premiers fichiers ont disparu ; seul le reçu du 30/09 est relu.
  const f = app.fusionnerRecusMemorises([r1, r2], [r3], new Set([r3.chemin]));
  assert.equal(f.map(r => `${r.montant}${r.memorise ? '*' : ''}`).join(' '), '20000* 5300* 1000');
  assert.equal(f.reduce((t, r) => t + r.montant, 0), 26300);
  // Un fichier encore présent et relu fait foi : un versement qu'il ne contient plus disparaît.
  assert.equal(app.fusionnerRecusMemorises([r1, r2], [r2], new Set([r1.chemin, r2.chemin])).map(r => r.montant).join(' '), '5300');
  // Retrouvé dans le fichier relu : pas de doublon, plus marqué « mémorisé ».
  const g = app.fusionnerRecusMemorises([Object.assign({ memorise: true }, r2)], [r2], new Set([r2.chemin]));
  assert.equal(g.length, 1);
  assert.equal(!!g[0].memorise, false);
  // Rien d'ancien : la lecture seule.
  assert.equal(app.fusionnerRecusMemorises(null, [r3], new Set([r3.chemin])).length, 1);
});

test('convocation de l’étude : « Solde à verser » précédé du texte de la marge, jamais le total des sommes à déduire (étude, 03/10)', () => {
  const texte = [
    'Nos Réf : VTE DUPRE / MARTIN',
    'Votre décompte prévisionnel s\'établit comme suit :',
    'Prix d\'acquisition 150.000,00 €',
    'Montant des frais et droits de l\'acte de 12.400,00 €',
    'vente',
    'Quote - part de taxes foncières 210, 40 €',
    'Frais de promesse 335,00 €',
    'Soit au total 162.945,40 €',
    'A déduire',
    'Acompte sur prix versé à l\'étude 1.000,00 €',
    'Frais de promesse 335,00 €',
    'Soit au total 1.335,00 €',
    'OFFICE EQUIPE Solde à verser 161.610,40 €',
    'DE LA VISIOCONFERENCE'
  ].join('\n');
  assert.equal(app.soldeAttenduDepuisDecompte(texte), 161610.4);
  const r = app.parserDecompteConfrere(texte);
  assert.equal(r.lignes.debit.find(l => /taxes fonci/i.test(l.libelle)).montant, 210.4);
  // Sans ligne « Solde » : ni le total des débits ni celui des sommes à déduire n'est le solde — recalcul.
  const sansSolde = texte.split('\n').filter(l => !/Solde/.test(l)).join('\n');
  assert.equal(app.soldeAttenduDepuisDecompte(sansSolde), 161610.4);
});

test('convocation scannée : le solde attendu est la dernière ligne « Solde à verser », même mal lue par l’OCR', () => {
  // Structure de la convocation de l'étude scannée (09/10), montants inventés ; erreurs typiques de l'OCR d'un scan.
  const lignes = [
    'Prix d’acquisition',
    '120.000,00 €',
    'Montant des frais et droits de l’acte de vente 2.800,00 €',
    'Charges du trimestre en cours 500,00 €',
    'Quote-part de taxes foncières 300,00 €',
    'Soit au total 123.600,00 €',
    'A déduire',
    'Acompte sur prix versé à l’étude 150.00 €',
    'Soit au total 150,00 €',
    'Solde à verser 123.450,00 E',
    'de faire le point sur le déblocage de votre prêt (total ou partiel si vous financez des',
    'travaux), ainsi que sur le virement du solde correspondant à votre apport personnel.'
  ];
  assert.equal(app.soldeAttenduDepuisDecompte(lignes.join('\n')), 123450);
  assert.equal(app.soldeAVerserDansTexte(lignes.join('\n')), 123450);
  // Montant lu seul sur la ligne suivante.
  const renvoye = lignes.map(l => l.startsWith('Solde') ? 'Solde a verser\n123 450,00' : l).join('\n');
  assert.equal(app.soldeAttenduDepuisDecompte(renvoye), 123450);
  // Pas de ligne « Solde à verser » : rien de lu à part, le lecteur du décompte décide.
  assert.equal(app.soldeAVerserDansTexte(lignes.filter(l => !l.startsWith('Solde')).join('\n')), null);
});

test('fonds reçus : le prénom de l’acquéreur n’est jamais cherché seul (audit 13/10)', () => {
  const d = { id: 'd1', nom: 'DUPONT / MARTIN', parties: [{ nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'Jean MARTIN', role: 'ACQUEREUR' }] };
  assert.equal(app.motsPayeurDossier(d, []).join(','), 'martin');
  assert.equal(app.ligneNommeLePayeur('DURAND Jean VIR RECU DE SOLDE', app.motsPayeurDossier(d, [])), false);
  assert.equal(app.ligneNommeLePayeur('MARTIN Jean VIR RECU DE SOLDE', app.motsPayeurDossier(d, [])), true);
  const d2 = { id: 'd2', nom: 'X / Y', parties: [{ nom: 'Martin', prenom: 'Jean', role: 'ACQUEREUR' }] };
  assert.ok(!app.motsPayeurDossier(d2, []).includes('jean'));
});

test('fonds reçus : rien reçu n’est jamais « complet », même pour un attendu minuscule (audit 13/10)', () => {
  assert.equal(app.bilanFondsRecus(0, 1.5).etat, 'aucun');
  assert.equal(app.bilanFondsRecus(1.5, 1.5).etat, 'complet');
  assert.equal(app.bilanFondsRecus(120000, 120001.5).etat, 'complet');
});
