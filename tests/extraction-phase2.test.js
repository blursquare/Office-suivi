const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

// Extraction, phase 2 : désignation cadastrale complète, prix contradictoires, identité des
// personnes morales. Chaque texte reprend la STRUCTURE d'un acte réel du stress test (tableau à
// plat rendu par pdf.js, OCR, rédaction notariale), avec des noms, parcelles et montants inventés.

const app = chargerApplication();

// ---- Cadastre ---------------------------------------------------------------------------------

test('tableau à plat de plusieurs parcelles : toutes lues, total annoncé égal à la somme', () => {
  const c = app.detecterCadastre('Diverses parcelles en nature de Terre Figurant ainsi au cadastre : Section N° Lieudit Surface Nature '
    + 'C 438 Clos des Pins 00 ha 22 a 00 ca Terre C 439 Clos des Pins 00 ha 12 a 90 ca Terre C 1339 Clos des Pins 00 ha 45 a 84 ca Terre '
    + 'Total surface : 00 ha 80 a 74 ca Précision étant ici faite que la parcelle cadastrée section C numéro 1339 provient d’une division.');
  assert.strictEqual(c.parcelles.map(p => p.section + p.numero).join(','), 'C438,C439,C1339');
  assert.strictEqual(c.parcelles[0].lieudit, 'Clos des Pins');
  assert.strictEqual(c.contenanceTotaleM2, 8074);
  assert.strictEqual(c.contenanceLueM2, 8074);
  assert.strictEqual(c.section + c.numero, 'C438', 'la première parcelle reste la référence historique');
  assert.strictEqual(app.libelleCadastre(c), 'section C n° 438, 439, 1339 — 80 a 74 ca');
});

test('colonnes « Préfixe » et « Adresse ou lieudit », numéro avec zéros de tête', () => {
  const c = app.detecterCadastre('et cadastré : Préfixe Section N° Adresse ou lieudit Contenance DR 0396 74 RUE DES LILAS 06 a 51 ca Contenance totale 06 a 51 ca Lot numéro quatorze');
  assert.strictEqual(c.parcelles.length, 1);
  assert.strictEqual(c.numero, '396');
  assert.strictEqual(c.parcelles[0].lieudit, '74 RUE DES LILAS');
  assert.strictEqual(c.contenanceTotaleM2, 651);
});

test('contenance en trois colonnes « ha a ca », seulement quand l’en-tête le dit', () => {
  const c = app.detecterCadastre('Cadastrée : Section N° Lieudit ou voie Contenance ha a ca ZY 37 510 rue des Saules 0 15 20 Ainsi que cet IMMEUBLE s’étend');
  assert.strictEqual(c.parcelles[0].lieudit, '510 rue des Saules');
  assert.strictEqual(c.contenanceTotaleM2, 1520);
});

test('tableau passé à l’OCR, colonnes marquées de crochets et de barres', () => {
  const c = app.detecterCadastre('Figurant ainsi au cadastre : _ [Section [N° [Lieudit [Surface 7 | DB 20 |RES LES MOUETTES 01 ha 35 a 57 ca Un extrait de plan cadastral est joint.');
  assert.strictEqual(c.section + c.numero, 'DB20');
  assert.strictEqual(c.contenanceTotaleM2, 13557);
});

test('forme rédigée : « cadastré comme suit : Section HE numéro 95 pour une contenance de 05a 65ca »', () => {
  const c = app.detecterCadastre('Jardin. Le tout cadastré comme suit : Section HE numéro 95 pour une contenance de 05a 65ca Tel que ledit bien existe.');
  assert.strictEqual(c.section + c.numero, 'HE95');
  assert.strictEqual(c.contenanceTotaleM2, 565);
});

test('formaterContenance / contenanceEnM2 se répondent', () => {
  assert.strictEqual(app.contenanceEnM2('01 ha 40 a 64 ca'), 14064);
  assert.strictEqual(app.contenanceEnM2('99 ca'), 99);
  assert.strictEqual(app.formaterContenance(14064), '1 ha 40 a 64 ca');
  assert.strictEqual(app.formaterContenance(99), '99 ca');
  assert.strictEqual(app.formaterContenance(10005), '1 ha 0 a 5 ca');
});

test('un total annoncé différent de la somme des parcelles lève une alerte de cohérence', () => {
  const ex = app.construireExtractionRegex('COMPROMIS DE VENTE. Le bien est cadastré : Section N° Lieudit Contenance AB 12 Le Bourg 10 a 00 ca AB 13 Le Bourg 05 a 00 ca Contenance totale : 20 a 00 ca. Tel que le bien existe.', null, [], '');
  assert.ok(ex.alertes.some(a => a.code === 'CONTENANCE_TOTALE_INCOHERENTE'));
});

function extraction(cadastre) {
  return { parties: [], champs: { prixVente: { valeur: 100000 } }, bien: { adresse: null, cadastre }, notaires: {}, dates: {} };
}

test('comparaison compromis / projet : une parcelle ajoutée au projet est nommée', () => {
  const ref = extraction({ section: 'C', numero: '438', parcelles: [{ section: 'C', numero: '438' }, { section: 'C', numero: '439' }] });
  const projet = extraction({ section: 'C', numero: '438', parcelles: [{ section: 'C', numero: '438' }, { section: 'C', numero: '439' }, { section: 'C', numero: '440' }] });
  const c = app.comparerCompromisEtProjet(ref, projet).find(x => x.titre === 'Référence cadastrale différente');
  assert.ok(c);
  assert.strictEqual(c.gravite, 'CRITIQUE');
  assert.match(c.description, /ajoutée\(s\) au projet : C 440/);
});

test('comparaison : mêmes parcelles dans un autre ordre, rien ; contenance différente, IMPORTANT', () => {
  const ref = extraction({ section: 'C', numero: '438', parcelles: [{ section: 'C', numero: '438' }, { section: 'C', numero: '0439' }], contenanceTotaleM2: 3490 });
  const memes = extraction({ section: 'C', numero: '439', parcelles: [{ section: 'C', numero: '439' }, { section: 'C', numero: '438' }], contenanceTotaleM2: 3490 });
  assert.strictEqual(app.comparerCompromisEtProjet(ref, memes).filter(x => /cadastrale/i.test(x.titre)).length, 0);
  const autre = extraction({ section: 'C', numero: '439', parcelles: [{ section: 'C', numero: '439' }, { section: 'C', numero: '438' }], contenanceTotaleM2: 3500 });
  const c = app.comparerCompromisEtProjet(ref, autre).find(x => x.titre === 'Contenance cadastrale différente');
  assert.ok(c);
  assert.strictEqual(c.gravite, 'IMPORTANT');
});

// ---- Prix contradictoires ---------------------------------------------------------------------

test('deux clauses qui ne disent pas le même prix : champ à vérifier et alerte', () => {
  const texte = 'PRIX La vente, si elle se réalise, aura lieu moyennant le prix principal de CENT MILLE EUROS (100 000,00 EUR). '
    + 'FINANCEMENT Prix de vente : CENT DIX MILLE EUROS. 110 000,00 EUR Il y a lieu d’ajouter la provision sur frais.';
  const ex = app.construireExtractionRegex(texte, null, [], '');
  assert.strictEqual(ex.champs.prixVente.valeur, 100000);
  assert.strictEqual(ex.champs.prixVente.statut, 'NEEDS_REVIEW');
  assert.strictEqual(ex.champs.prixVente.candidats.map(c => c.valeur).join(','), '100000,110000');
  assert.ok(ex.alertes.some(a => a.code === 'PRIX_CONTRADICTOIRE'));
});

test('ventilation, mobilier, prix de la vente précédente et plus-value ne contredisent pas le prix', () => {
  const texte = 'PRIX La vente est conclue moyennant le prix de DEUX CENT MILLE EUROS (200 000,00 EUR). '
    + 'Ce prix s’applique aux MEUBLES à concurrence de : QUATRE MILLE EUROS (4 000,00 EUR). '
    + 'Ce prix comprenant celui du mobilier dont le montant est évalué à CINQ MILLE EUROS (5 000,00 EUR). '
    + 'ORIGINE DE PROPRIETE Suivant acte reçu par Maître Paul DURAND, notaire à BLOIS, le 25 février 2021 moyennant le prix de TRENTE MILLE EUROS (30 000,00 EUR). '
    + 'Et que l’immeuble a été acquis par eux moyennant le prix de QUATRE-VINGT-DIX MILLE EUROS (90.000,00 €), suivant acte du 02 août 2020. '
    + 'Coût de l’opération : Prix 200 000,00 EUR Frais de la vente 18 200,00 EUR.';
  const mentions = app.detecterMentionsPrix(texte).map(m => m.montant);
  assert.ok(mentions.every(m => m === 200000), mentions.join(','));
  const ex = app.construireExtractionRegex(texte, null, [], '');
  assert.strictEqual(ex.champs.prixVente.statut, 'CONFIRMED');
  assert.ok(!ex.alertes.some(a => a.code === 'PRIX_CONTRADICTOIRE'));
});

// ---- Personnes morales ------------------------------------------------------------------------

test('identité d’une société : les trois rédactions relevées dans le corpus', () => {
  const a = app.detecterIdentiteSociete('IMMO CENTRE SARLU au capital de 100 000 € euros, dont le siège social est situé 3 Avenue de la Gare - 41000 BLOIS , RCS BLOIS n° 410 876 361 , titulaire de la carte professionnelle');
  assert.strictEqual(a.siren, '410876361');
  assert.strictEqual(a.rcs, 'BLOIS');
  assert.strictEqual(a.siege, '3 Avenue de la Gare, 41000 BLOIS');
  assert.strictEqual(a.capital, 100000);
  const b = app.detecterIdentiteSociete('Société en nom collectif au capital de 5.100.000 €, dont le siège est à PARIS (75008), 19 rue du Parc, identifiée au SIREN sous le numéro 732014964 et immatriculée au Registre du Commerce et des Sociétés de PARIS.');
  assert.strictEqual(b.siren, '732014964');
  assert.strictEqual(b.siege, 'PARIS (75008), 19 rue du Parc');
  assert.strictEqual(b.capital, 5100000);
  const c = app.detecterIdentiteSociete('SAS au capital de 1.507.656 €, dont le siège social est à BORDEAUX (33100), 28 avenue des Tilleuls, immatriculée au Registre du Commerce et des Sociétés de Bordeaux, sous le numéro 414 854 216 00010, n° SIREN 414 854 216 représentée par son Président');
  assert.strictEqual(c.siren, '414854216');
  assert.strictEqual(c.rcs, 'Bordeaux');
  assert.strictEqual(c.sirenValide, true);
});

test('clé de contrôle du SIREN (Luhn)', () => {
  assert.strictEqual(app.sirenValide('732014964'), true);
  assert.strictEqual(app.sirenValide('732014965'), false);
  assert.strictEqual(app.sirenValide('12345'), false);
});

test('une SCI acquéreuse : raison sociale, représentant, identité, et alerte si le SIREN est faux', () => {
  const texte = 'COMPROMIS DE VENTE. LE VENDEUR : Monsieur Jean DUPONT, né à TOURS le 3 mars 1970, demeurant 5 rue des Lilas 41000 BLOIS. '
    + 'L’ACQUÉREUR : La SCI LES TILLEULS, société civile immobilière au capital de 1 000 €, dont le siège est à BLOIS (41000), 12 rue du Pont, '
    + 'identifiée au SIREN sous le numéro 732014965 et immatriculée au Registre du Commerce et des Sociétés de BLOIS, représentée par Monsieur Paul MARTIN, gérant. '
    + 'Le VENDEUR vend à l’ACQUÉREUR qui accepte.';
  const ex = app.construireExtractionRegex(texte, null, [], '');
  const sci = ex.parties.find(p => p.qualitePersonne === 'morale');
  assert.ok(sci, JSON.stringify(ex.parties));
  assert.strictEqual(sci.role, 'ACQUEREUR');
  assert.strictEqual(sci.societe.siren, '732014965');
  assert.strictEqual(sci.societe.sirenValide, false);
  assert.strictEqual(sci.societe.siege, 'BLOIS (41000), 12 rue du Pont');
  assert.ok(ex.alertes.some(a => a.code === 'SIREN_INVALIDE'));
  assert.match(app.libelleIdentiteSociete(sci.societe), /numéro invalide/);
});

test('l’identité d’une société survit à l’enregistrement et à l’import, assainie', () => {
  assert.strictEqual(app.societePersistable({ siren: '732014964', rcs: 'PARIS', siege: 'PARIS', capital: 10, autre: 'x' }).sirenValide, true);
  assert.strictEqual(app.societePersistable({ siren: 'abc' }), null);
  assert.strictEqual(app.societePersistable([1]), null);
});
