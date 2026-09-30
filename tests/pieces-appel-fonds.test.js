'use strict';
// Pièces lues pour l'appel de fonds et le prorata (exemples réels reçus le 30/09) : avis de taxe
// foncière (page 1 + bas de page 2), appel de charges d'un syndic, état daté (fonds de travaux),
// relevé de compte client de l'étude. Textes reprenant la structure des documents réels, tels
// que lignesDepuisItemsPdf les rend (une ligne par ligne du tableau), noms et montants inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('montantSyndicDepuisTexte lit les points décimaux des syndics et les formats français', () => {
  const app = chargerApplication();
  assert.equal(app.montantSyndicDepuisTexte('422.13'), 422.13);
  assert.equal(app.montantSyndicDepuisTexte('122.97 €'), 122.97);
  assert.equal(app.montantSyndicDepuisTexte('1 380,43'), 1380.43);
  assert.equal(app.montantSyndicDepuisTexte('1.245,00'), 1245);
  assert.equal(app.montantSyndicDepuisTexte('1.245'), 1245);
  assert.equal(app.montantSyndicDepuisTexte('662,00'), 662);
  assert.equal(app.montantSyndicDepuisTexte(''), null);
});

test('avis de taxe foncière : « Montant de vos taxes foncières » en page 1, jamais la somme à prélever', () => {
  const app = chargerApplication();
  const lignes = ['410 Somme à prélever', '149 561,00 €', '221 Montant de vos taxes foncières 921,00 €', '31/08/2026 Acomptes mensuels déjà versés - 360,00 €'];
  assert.equal(app.montantAvisTaxeFonciereEnTete(lignes), 921);
  assert.equal(app.montantAvisTaxeFonciereEnTete(['Somme à prélever 561,00 €']), null);
});

test('avis de taxe foncière : le total en bas à droite de la page 2 peut être un entier nu', () => {
  const app = chargerApplication();
  // Disposition de l'avis réel : le total « 921 » seul, au-dessus d'une ligne de codes à gauche.
  const items = [
    { str: '60,79 3,36 44,90 11,26 0,741', x: 200, y: 400 },
    { str: '32', x: 549, y: 275 },
    { str: '921', x: 543, y: 170 },
    { str: '410 01 111 048 149 149 F E', x: 120, y: 163 }
  ];
  assert.equal(app.montantBasDroitePage(items), 921);
  // Un numéro de téléphone ou un « 0 » de colonne ne sont jamais des candidats.
  assert.equal(app.montantBasDroitePage([{ str: 'Page 2/2', x: 280, y: 30 }, { str: '0412345678', x: 500, y: 30 }, { str: '0', x: 486, y: 40 }]), null);
});

const APPEL_CITYA = `APPEL TRIMESTRIEL
Période du 01/10/2025 au 31/12/2025
Copropriétaire : DURAND Camille
Immeuble (2202) : SCP 12 RUE DES LILAS
Postes à répartir Total Base Tantièmes Quote-part Locatif
0002 Cave Etage: Sous-sol Porte: 9
CHARGES BATIMENT A 1792.50 995 1 1.80
FONDS TRAVAUX ALUR 187.50 9971 10 0.19
TOTAL DU LOT 1.99 0.47
0030 Appartement T4 Etage: 2ème étage Porte: 9
CHARGES BATIMENT A 1792.50 995 130 234.20
CHAUDIERES 350.00 12 1 29.17
FONDS TRAVAUX ALUR 187.50 9971 910 17.11
TOTAL DU LOT 420.01 229.45
0159 Parking
FONDS TRAVAUX ALUR 187.50 9971 7 0.13
TOTAL DU LOT 0.13 0.00
Montant de l'appel de fonds 422.13 €
RECAPITULATIF ETAT DE VOTRE COMPTE Dépenses Versements
Fonds TRV 209.04 Solde au 01/06/2025 140.44
Appel TTC 422.13 01/07/2025 Appel trimestriel 17.43
MONTANT DE VOTRE APPEL 422.13
TOTAL A PAYER 422.13`;

test('appel de charges : période, montant de l’appel, cotisation au fonds de travaux à part', () => {
  const app = chargerApplication();
  const a = app.analyserAppelCharges(APPEL_CITYA);
  assert.equal(a.periode.debut, '2025-10-01');
  assert.equal(a.periode.fin, '2025-12-31');
  assert.equal(a.typePeriode, 'trimestre');
  assert.equal(a.montant, 422.13);
  assert.equal(a.source, 'Montant de l’appel');
  assert.equal(a.fondsTravaux, 17.43);
  assert.equal(a.lignesFondsTravaux, 3);
  assert.equal(a.montantHorsFondsTravaux, 404.7);
  assert.equal(a.coproprietaire, 'DURAND Camille');
  assert.equal(a.immeuble, 'SCP 12 RUE DES LILAS');
});

test('appel de charges : « Total à payer » seulement en dernier recours, période mensuelle reconnue', () => {
  const app = chargerApplication();
  const a = app.analyserAppelCharges('Période du 01/11/2025 au 30/11/2025\nSolde antérieur 50,00\nTOTAL A PAYER 180,00');
  assert.equal(a.montant, 180);
  assert.equal(a.source, 'Total à payer');
  assert.equal(a.typePeriode, 'mois');
  assert.equal(a.fondsTravaux, 0);
  assert.equal(app.analyserAppelCharges('Période du 15/10/2025 au 31/12/2025\nAppel TTC 100.00').typePeriode, 'autre');
  assert.equal(app.analyserAppelCharges('rien').montant, null);
});

test('ligneProrataCharges : du jour de l’acte à la fin de la période, rien hors période', () => {
  const app = chargerApplication();
  const periode = { debut: '2025-10-01', fin: '2025-12-31' };
  const l = app.ligneProrataCharges(404.7, periode, '2025-11-15');
  assert.equal(l.libelle, 'Prorata de charges de copropriété (du 15/11/2025 au 31/12/2025)');
  // 47 jours sur 92.
  assert.equal(l.montant, Math.round(404.7 * 47 / 92 * 100) / 100);
  assert.equal(app.ligneProrataCharges(404.7, periode, '2026-01-10'), null);
  assert.equal(app.ligneProrataCharges(404.7, null, '2025-11-15'), null);
});

test('état daté : rubrique B12, forme la plus courante, y compris scannée', () => {
  const app = chargerApplication();
  const propre = `B12/ EXISTENCE D'UN FONDS DE TRAVAUX
oui non
└─► Montant de la part dudit fonds rattachée au lot principal cédé 662,00
└─► Montant de la dernière cotisation versée par le propriétaire 75,75
cédant au titre de son lot
Pour une date de signature le : 30/12/2025`;
  const r = app.fondsTravauxDepuisEtatDate(propre);
  assert.equal(r.montant, 662);
  assert.equal(r.absent, false);
  assert.equal(r.cotisation, 75.75);
  assert.equal(r.dateSignature, '2025-12-30');
  // Scan OCRisé : lettres perdues, chiffre parasite collé au montant, libellé coupé sur deux lignes.
  const ocr = `- Existence d'un fonds travaux @Oui ONon
- Montant de la part dudit fonds rattachée au lot
principa vendu 1 380,431
- Monta t de la dernière cotisation versée par le
propriétaire cédant au titre de son lot 18,751`;
  const s = app.fondsTravauxDepuisEtatDate(ocr);
  assert.equal(s.montant, 1380.43);
  assert.equal(s.cotisation, 18.75);
});

test('état daté : « montant du fonds ALUR », lots vendus, ou pas de fonds — jamais la cotisation exigible', () => {
  const app = chargerApplication();
  const immozel = `4.4 Fonds de travaux (105) (Loi du 10/07/65 n° 65-557 art. 14-2) 12.49 €
B. – Au titre des honoraires de mutation : 300.00 €
Pour information montant du fonds ALUR : 122.97 €`;
  const r = app.fondsTravauxDepuisEtatDate(immozel);
  assert.equal(r.montant, 122.97);
  assert.equal(r.source, 'montant du fonds ALUR');
  const lots = app.fondsTravauxDepuisEtatDate('Fonds travaux attachés aux lots vendus: 1 380,43 €');
  assert.equal(lots.montant, 1380.43);
  const aucun = app.fondsTravauxDepuisEtatDate("Il n’y a pas de fonds ALUR, ni de PPT, ni de DTG, ni d’emprunt collectif sur cet immeuble");
  assert.equal(aucun.absent, true);
  assert.equal(aucun.montant, 0);
  // Une avance d'exercice n'est pas la part attachée au lot.
  const avance = app.fondsTravauxDepuisEtatDate("L'avance 'Fonds de Travaux - Exercice 2025' d'un montant de 197,97€ est non remboursable");
  assert.equal(avance.montant, null);
});

const RELEVE = [
  'Relevé de compte Client',
  'Nature du compte : Vente MARTIN / DURAND (A202600999) 41000 BLOIS',
  { texte: "Date Libellé d'écriture Débit Crédit", items: [{ x: 20, str: 'Date' }, { x: 120, str: "Libellé d'écriture" }, { x: 400, str: 'Débit' }, { x: 480, str: 'Crédit' }] },
  { texte: '21/07/2026 VIR INST RECU MME DURAND SOPHIE INDEMNITE IMMOBILISATION 3 000,00', items: [{ x: 20, str: '21/07/2026' }, { x: 60, str: 'VIR INST RECU MME DURAND SOPHIE INDEMNITE IMMOBILISATION' }, { x: 485, str: '3 000,00' }] },
  { texte: '22/07/2026 VIREMENT A SELARL LOIRE NOTAIRES INDEMNITÉ IMMOBILISATION VTE MARTIN/DURAND 3 000,00', items: [{ x: 20, str: '22/07/2026' }, { x: 60, str: 'VIREMENT A SELARL LOIRE NOTAIRES INDEMNITÉ IMMOBILISATION VTE MARTIN/DURAND' }, { x: 405, str: '3 000,00' }] },
  { texte: '22/07/2026 VIR INST RECU MME DURAND SOPHIE PROVISION SUR FRAIS 500,00', items: [{ x: 20, str: '22/07/2026' }, { x: 60, str: 'VIR INST RECU MME DURAND SOPHIE PROVISION SUR FRAIS' }, { x: 490, str: '500,00' }] },
  'Total 3 500,00 3 000,00',
  'Solde 500,00 €'
];

test('relevé de compte client : colonne par position, nature des versements, sommes reversées', () => {
  const app = chargerApplication();
  const r = app.analyserReleveCompteClient(RELEVE);
  assert.equal(r.titre, true);
  assert.equal(r.nature, 'Vente MARTIN / DURAND (A202600999)');
  assert.equal(r.ecritures.length, 3);
  assert.equal(r.recu.prix, 3000);
  assert.equal(r.recu.frais, 500);
  assert.equal(r.reverse.prix, 3000);
  assert.equal(r.tiers.join('|'), 'SELARL LOIRE NOTAIRES');
  assert.equal(r.solde, 500);
  assert.equal(r.ambigues, 0);
});

test('relevé de compte client : sans positions, la colonne vient du libellé', () => {
  const app = chargerApplication();
  const r = app.analyserReleveCompteClient(RELEVE.map(l => (typeof l === 'string' ? l : l.texte)));
  assert.equal(r.recu.prix, 3000);
  assert.equal(r.recu.frais, 500);
  assert.equal(r.reverse.prix, 3000);
  assert.equal(r.ambigues, 0);
  // Libellé muet : compté reçu, mais signalé.
  const flou = app.analyserReleveCompteClient(['03/09/2026 OPERATION DIVERSE 120,00']);
  assert.equal(flou.recu.autre, 120);
  assert.equal(flou.ambigues, 1);
  assert.equal(flou.solde, 120);
});

test('lignesAvecPositionsDepuisItems garde l’abscisse de chaque item et le texte de la ligne', () => {
  const app = chargerApplication();
  const items = [
    { str: '500,00', transform: [1, 0, 0, 1, 490, 700], height: 10 },
    { str: '22/07/2026', transform: [1, 0, 0, 1, 20, 700], height: 10 },
    { str: 'Solde', transform: [1, 0, 0, 1, 20, 680], height: 10 }
  ];
  const lignes = app.lignesAvecPositionsDepuisItems(items);
  assert.equal(lignes.length, 2);
  assert.equal(lignes[0].texte, '22/07/2026 500,00');
  assert.equal(lignes[0].items.map(i => i.x).join(','), '20,490');
  assert.equal(app.lignesDepuisItemsPdf(items).join('|'), '22/07/2026 500,00|Solde');
});
