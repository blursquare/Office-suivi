'use strict';

// Décompte vendeur (étude 30/10, modèle de l'étude) : lignes de départ, totaux, document du courrier, lecture du décompte de remboursement de
// la banque, reconnaissance du fichier par son nom. Noms et montants inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

const dossier = (extra) => Object.assign({ id: 'v1', nom: 'FOURNEL / TESSIER', prixVente: 180000, parties: [
  { role: 'VENDEUR', civilite: 'Monsieur', prenom: 'Hugo', nom: 'FOURNEL' }, { role: 'VENDEUR', civilite: 'Madame', prenom: 'Lina', nom: 'FOURNEL' },
  { role: 'ACQUEREUR', civilite: 'Madame', prenom: 'Nora', nom: 'TESSIER' }], situationVendeur: 'marie' }, extra || {});

test('lignes de départ : prix et prorata au crédit, commission du vendeur, remboursement lu et provision de mainlevée au débit', () => {
  const d = dossier({ honoraires: { charge: 'VENDEUR', montantTTC: 9000, nom: 'Agence des Essais' } });
  const l = app.lignesDecompteVendeurInitiales(d, { prorata: 250.5, remboursements: [100000.45] });
  assert.equal(l.map(x => `${x.libelle}|${x.sens}|${x.montant}`).join(' ; '),
    'Prix de vente|credit|180000 ; Prorata de taxes foncières|credit|250.5 ; Commission due à l\'agence|debit|9000 ; Remboursement anticipé prêt|debit|100000.45 ; Provision sur frais acte de mainlevée|debit|450');
  const t = app.totauxDecompteVendeur(l);
  assert.equal(`${t.debit}|${t.credit}|${t.solde}`, '109450.45|180250.5|70800.05');
});

test('rien de deviné : commission à la charge de l’acquéreur absente, remboursement non lu = à saisir, mainlevée seulement si une inscription ou un prêt', () => {
  const sans = app.lignesDecompteVendeurInitiales(dossier({ honoraires: { charge: 'ACQUEREUR', montantTTC: 9000 } }), {});
  assert.equal(sans.map(x => x.libelle).join(' ; '), 'Prix de vente ; Prorata de taxes foncières');
  assert.equal(sans[1].montant, null);
  const nonLu = app.lignesDecompteVendeurInitiales(dossier(), { remboursements: [null] });
  assert.equal(nonLu.find(x => /Remboursement/.test(x.libelle)).montant, null);
  assert.ok(nonLu.some(x => /mainlevée/.test(x.libelle)));
  assert.ok(app.lignesDecompteVendeurInitiales(dossier(), { mainlevee: true }).some(x => /mainlevée/.test(x.libelle) && x.montant === 450));
});

test('solde négatif : la somme manque au vendeur, dite telle', () => {
  const t = app.totauxDecompteVendeur([{ sens: 'credit', montant: 100 }, { sens: 'debit', montant: 150.25 }, { sens: 'debit', montant: null }]);
  assert.equal(t.solde, -50.25);
  const doc = app.documentDecompteVendeur({ lignes: [{ libelle: 'Prix de vente', sens: 'credit', montant: 100 }, { libelle: 'Remboursement anticipé prêt', sens: 'debit', montant: 150.25 }], destinataire: ['Monsieur et Madame FOURNEL'], reference: 'VENTE FOURNEL / TESSIER', date: '2026-11-20', datePrevue: true, aujourdhui: '2026-10-30' });
  const tableau = doc.lignes.find(x => x && x.type === 'tableau');
  assert.match(tableau.lignes[tableau.lignes.length - 1].cellules[0].texte, /Solde à verser par le vendeur/);
});

test('document : références, date prévisionnelle, titre, tableau DEBIT / CREDIT, phrase du R.I.B. de l’étude mot pour mot', () => {
  const lignes = [{ libelle: 'Prix de vente', sens: 'credit', montant: 180000 }, { libelle: 'Provision sur frais acte de mainlevée', sens: 'debit', montant: 450 }, { libelle: '', sens: 'debit', montant: null }];
  const doc = app.documentDecompteVendeur({ lignes, destinataire: ['Monsieur et Madame FOURNEL'], reference: 'VENTE FOURNEL / TESSIER', date: '2026-11-20', datePrevue: true, aujourdhui: '2026-10-30' });
  const textes = doc.lignes.filter(x => typeof x === 'string').join('\n');
  assert.match(textes, /\*\*Références dossier :\*\* VENTE FOURNEL \/ TESSIER/);
  assert.match(textes, /Date de signature prévisionnelle : 20\/11\/2026/);
  assert.match(textes, /\*\*DECOMPTE VENDEUR\*\*/);
  assert.match(textes, /Pour le règlement du prix de vente, veuillez-vous munir d'un R\.I\.B\. pour le jour de la signature$/);
  assert.equal(doc.adresse.join('|'), 'Monsieur et Madame FOURNEL');
  const tableau = doc.lignes.find(x => x && x.type === 'tableau');
  const rangees = tableau.lignes.map(r => r.cellules.map(c => c.texte).join(' | '));
  assert.equal(rangees[0], ' | **DEBIT** | **CREDIT**');
  assert.equal(rangees[1], 'Prix de vente |  | 180.000,00 €');
  assert.equal(rangees[2], 'Provision sur frais acte de mainlevée | 450,00 € | ');
  assert.equal(rangees[3], '[à compléter] | [à compléter] | ');
  assert.equal(rangees[4], '**Ensemble :** | **450,00 €** | **180.000,00 €**');
  assert.equal(rangees[5], '**Solde :** |  | **179.550,00 €**');
  assert.equal(tableau.grille.reduce((s, x) => s + x, 0), 8500);
});

test('lecture du décompte de remboursement de la banque : le total, jamais le capital restant dû seul', () => {
  const texte = ['DECOMPTE DE REMBOURSEMENT ANTICIPE', 'Prêt n° 0000000 du 12/03/2019', 'Capital restant dû au 20/11/2026 : 98 512,30 €',
    'Intérêts courus : 210,15 €', 'Indemnité de remboursement anticipé : 2 950,00 €', 'Frais de dossier : 50,00 €', 'TOTAL A REMBOURSER : 101 722,45 €'].join('\n');
  assert.equal(app.montantRemboursementDansTexte(texte), 101722.45);
  assert.equal(app.montantRemboursementDansTexte('Montant total du remboursement anticipé au 01/12/2026 : 45.120,10 EUR'), 45120.1);
  assert.equal(app.montantRemboursementDansTexte('Prêt A — Total dû : 10 000,00 €\nPrêt B — Total dû : 5 000,00 €\nTotal général à régler : 15 000,00 €'), 15000);
  assert.equal(app.montantRemboursementDansTexte('Capital restant dû : 98 512,30 €'), null);
  assert.equal(app.montantRemboursementDansTexte(''), null);
  assert.equal(app.montantRemboursementDansTexte('Montant du prêt : 120 000,00 €\nCapital restant dû : 98 512,30 €'), null);
  assert.equal(app.montantRemboursementDansTexte('Somme due au 20/11/2026 : 99 000,00 €'), 99000);
});

test('fichier du décompte de la banque reconnu par son nom, jamais notre décompte ni l’appel de fonds', () => {
  assert.ok(app.nomDitDecompteRemboursement('Décompte remboursement anticipé Crédit Agricole.pdf'));
  assert.ok(app.nomDitDecompteRemboursement('VENDEUR/Decompte pret CIC.pdf'.split('/').pop()));
  assert.ok(app.nomDitDecompteRemboursement('Remboursement anticipé prêt immobilier.pdf'));
  assert.ok(!app.nomDitDecompteRemboursement('Décompte vendeur - VTE FOURNEL.pdf'));
  assert.ok(!app.nomDitDecompteRemboursement('Décompte acquéreur.pdf'));
  assert.ok(!app.nomDitDecompteRemboursement('Convocation au rendez-vous contenant l\'appel de fonds - TESSIER.pdf'));
  assert.ok(!app.nomDitDecompteRemboursement('Offre de prêt.pdf'));
  assert.ok(!app.nomDitDecompteRemboursement('Décompte remboursement.docx'));
});

test('fusion des lignes : une ligne corrigée à la main pendant la lecture du NAS est gardée, une ligne ajoutée reste', () => {
  const avant = [{ id: 'a', libelle: 'Prix de vente', sens: 'credit', montant: 175000, modifiee: true }, { id: 'b', libelle: 'Frais divers', sens: 'debit', montant: 30, modifiee: true }, { id: 'c', libelle: 'Prorata de taxes foncières', sens: 'credit', montant: null }];
  const neuves = [{ id: 'n1', libelle: 'Prix de vente', sens: 'credit', montant: 180000 }, { id: 'n2', libelle: 'Prorata de taxes foncières', sens: 'credit', montant: 250 }];
  assert.equal(app.fusionLignesDecompteVendeur(avant, neuves).map(x => x.id).join(','), 'a,n2,b');
});

test('email au vendeur : premier jet de CLAIRE, formule selon les civilités, phrase du R.I.B.', () => {
  const corps = app.corpsEmailDecompteVendeur([{ civilite: 'M', nom: 'FOURNEL' }, { civilite: 'Mme', nom: 'FOURNEL' }], 'marie', '2026-11-20', true);
  assert.match(corps, /^Chers Monsieur et Madame,/);
  assert.match(corps, /prévue le 20 novembre 2026/);
  assert.match(corps, /veuillez-vous munir d'un R\.I\.B\. pour le jour de la signature\./);
  assert.ok(!/sauf erreur/i.test(corps));
});

test('vendeurs du dossier : civilités de la fiche, société sans civilité', () => {
  const v = app.vendeursDecompteVendeur(dossier());
  assert.equal(v.map(x => `${x.civilite} ${x.prenom} ${x.nom}`).join(' ; '), 'M Hugo FOURNEL ; Mme Lina FOURNEL');
  const sci = app.vendeursDecompteVendeur({ parties: [{ role: 'VENDEUR', nom: 'SCI DES ESSAIS', qualitePersonne: 'morale' }] });
  assert.equal(sci[0].civilite, 'SCI');
});
