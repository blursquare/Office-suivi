'use strict';

// Outil 2, projet de vente — défauts relevés sur un vrai couple promesse / acte de vente (dossier
// MOKADEM, 23/09/2026). Les textes ci-dessous reprennent la STRUCTURE exacte des passages en cause,
// telle que pdf.js la rend, avec des noms, adresses et parcelles inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const PROMESSE = `PROMESSE UNILATERALE DE VENTE
IDENTIFICATION DES PARTIES PROMETTANT Madame Claire LEROUX , sans emploi, demeurant à BLOIS (41000) 12 rue des Tilleuls. Née à TOURS (37000) le 5 mars 1978. BENEFICIAIRE Madame Sophie BERTRAND , comptable, demeurant à FOSSE (41330) 2 impasse des Pins. Née à ORLEANS (45000) le 11 mai 1987.
IDENTIFICATION DU BIEN D   ESIGNATION  A VENDOME (LOIR-ET-CHER) 41100 12 Rue des Tilleuls,  Une maison d'habitation. Figurant ainsi au c adastre : Section N° Lieudit Surface KT 208 12 Rue des Tilleuls 00 ha 02 a 75 ca
HISTORIQUE CADASTRAL La parcelle, originairement cadastrée section KT numéro 189 lieudit 45 rue du Moulin a fait l'objet d'une division.
PRIX La vente est consentie moyennant le prix de DEUX CENT VINGT MILLE EUROS (220 000,00 EUR).`;

test('désignation d’un acte d’office : « D   ESIGNATION » avec plusieurs espaces est lu', () => {
  const app = chargerApplication();
  const x = app.detecterAdresseBienStructuree(PROMESSE);
  assert.equal(x.adresse.codePostal, '41100');
  assert.match(x.adresse.adresseComplete, /12 Rue des Tilleuls/i);
});

test('cadastre : colonne « Surface », « c adastre » coupé, et parcelle d’origine écartée', () => {
  const app = chargerApplication();
  const c = app.detecterCadastre(PROMESSE);
  assert.equal(c.section + c.numero, 'KT208');
  // Sans le tableau, la parcelle « originairement cadastrée » ne doit toujours pas être retenue.
  const sansTableau = PROMESSE.replace(/Figurant ainsi[^\n]*/, '');
  assert.equal(app.detecterCadastre(sansTableau), null);
});

test('référence d’audit : le texte de l’avant-contrat prime sur des parties périmées du dossier', () => {
  const app = chargerApplication();
  // Dossier créé avec une ancienne version : l'acquéreuse rangée côté vendeur.
  const dossier = {
    parties: [{ nom: 'LEROUX', role: 'VENDEUR' }, { nom: 'BERTRAND', role: 'VENDEUR' }],
    prixVente: 220000
  };
  const ref = app.referenceAudit(PROMESSE, 'promesse.pdf', dossier);
  const roles = ref.parties.map(p => p.nom + ':' + p.role).join(',');
  assert.equal(roles, 'LEROUX:VENDEUR,BERTRAND:ACQUEREUR');
});

test('référence d’audit : le dossier complète ce que le texte n’a pas donné', () => {
  const app = chargerApplication();
  const dossier = { parties: [], prixVente: 150000, bien: { adresse: null, cadastre: { section: 'AB', numero: '12' } } };
  const ref = app.referenceAudit('Texte sans rien d’exploitable.', 'x.pdf', dossier);
  assert.equal(ref.champs.prixVente.valeur, 150000);
  assert.equal(ref.bien.cadastre.section + ref.bien.cadastre.numero, 'AB12');
  // Sans texte, retour à la référence tirée du dossier seul.
  assert.equal(app.referenceAudit('', 'x.pdf', dossier).champs.prixVente.valeur, 150000);
});

test('obligation du vendeur : débris de mise en page retirés du début de la clause', () => {
  const app = chargerApplication();
  assert.equal(app.nettoyerDebutClause('Annexe n°9bis 28 Le PROMETTANT s’engage à fournir'), 'Le PROMETTANT s’engage à fournir');
  assert.equal(app.nettoyerDebutClause('CONDITIONS PARTICULIERES Le PROMETTANT s’engage'), 'Le PROMETTANT s’engage');
  assert.equal(app.nettoyerDebutClause('Le VENDEUR s’engage'), 'Le VENDEUR s’engage');
});

test('document non établi mais justifié par un renvoi à la loi : aucun constat', () => {
  const app = chargerApplication();
  const texte = `Audit énergétique Le BIEN étant un bâtiment à usage d'habitation ne relevant pas du statut de la copropriété et appartenant aux classes A, B, C ou D, il n’a pas été établi d’audit énergétique, conformément aux dispositions de l'article L 126-28-1 du Code de la construction.`;
  const constats = app.constatsLectureActe(texte, [{ numero: 1, debut: 0, fin: texte.length }]);
  assert.equal(constats.filter(c => /non établi/.test(c.titre)).length, 0);
});
