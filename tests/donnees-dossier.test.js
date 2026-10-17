'use strict';

// Données d'un dossier venues d'Authentic, lues de la même façon par tous les outils (étude 16/10 : « parfois tout le contenu est dans
// un outil mais pas dans un autre »). Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../commun/donnees-dossier');

const VENTE = {
  id: 'v1', nom: 'EXEMPLE / ESSAI', typeVente: 'maison', adresseBien: 'CHAUMONT-SUR-THARONNE (41600), 3 rue des Essais',
  bien: { adresse: { codePostal: '41600', commune: 'Chaumont-sur-Tharonne' }, cadastre: { parcelles: [{ section: 'AB', numero: '0100' }] } },
  parties: [
    { role: 'VENDEUR', nom: 'Léa EXEMPLE', civilite: 'Mme', emails: ['lea@exemple.fr'] },
    { role: 'VENDEUR', nom: 'SCI DU TEST', qualitePersonne: 'morale' },
    { role: 'ACQUEREUR', nom: 'Paul ESSAI', telephones: ['06 00 00 00 01'] }
  ],
  authentic: {
    immeubles: [
      { adresse: 'CHAUMONT-SUR-THARONNE (41600), 3 rue des Essais', codePostal: '41600', commune: 'Chaumont-sur-Tharonne', type: 'Maison',
        parcelles: [{ section: 'AB', numero: '100', surface: '3845', nature: 'S' }, { section: 'AB', numero: '101', surface: '120' }] },
      { adresse: 'VOUZON (41600), Les Prés', codePostal: '41600', commune: 'Vouzon', type: 'Terre', parcelles: [{ section: 'ZC', numero: '12', surface: '5000', nature: 'T' }] }
    ],
    fichesClients: {
      'lea exemple': { nom: 'Léa EXEMPLE', prenom: 'Léa', nomFamille: 'EXEMPLE', domicile: 'BLOIS (41000), 1 rue Imaginaire', dateNaissance: '1970-01-02',
        emails: ['lea@exemple.fr', 'lea.pro@exemple.fr'], telephones: ['06 11 11 11 11'], profession: 'Essayiste' }
    }
  }
};

test('biens : bien de la fiche et immeubles d’Authentic réunis, sans doublon, le principal d’abord, détails complétés', () => {
  const biens = D.biensDossier(VENTE);
  assert.equal(biens.length, 2, 'le même bien (parcelle AB 100 commune) + un second bien à Vouzon');
  assert.equal(biens[0].principal, true);
  assert.deepEqual(biens[0].sources.join(','), 'authentic,fiche');
  assert.equal(biens[0].parcelles.map((p) => `${p.section} ${p.numero}`).join(','), 'AB 100,AB 101');
  assert.equal(biens[0].parcelles[0].surface, '3845', 'la surface d’Authentic complète la parcelle de la fiche');
  assert.equal(biens[1].commune, 'Vouzon');
  const toutes = D.parcellesDossier(VENTE);
  assert.equal(toutes.length, 3);
  assert.equal(toutes.find((p) => p.section === 'ZC').commune, 'Vouzon');
});

test('biens : succession (immeubles + biens notés en texte), dossier vide ou abîmé', () => {
  const succ = { typeAffaire: 'succession', authentic: { immeubles: [{ adresse: 'BLOIS (41000), 2 rue Fictive', parcelles: [{ section: 'CK', numero: '7' }] }] },
    biens: [{ adresse: 'BLOIS (41000), 2 rue Fictive', parcelles: 'CK 7' }, { adresse: 'VINEUIL (41350), 9 allée Inventée', parcelles: 'AZ 3, AZ 4' }] };
  const b = D.biensDossier(succ);
  assert.equal(b.length, 2);
  assert.equal(b[1].parcelles.map((p) => p.numero).join(','), '3,4');
  assert.equal(D.biensDossier(null).length, 0);
  assert.equal(D.biensDossier({ bien: 'abîmé', authentic: { immeubles: 'non' } }).length, 0);
});

test('fiche client : retrouvée par le nom complet dans n’importe quel ordre, jamais deux candidates, partie enrichie', () => {
  assert.equal(D.ficheClientDe(VENTE, 'EXEMPLE Léa').domicile, 'BLOIS (41000), 1 rue Imaginaire');
  assert.equal(D.ficheClientDe(VENTE, 'Madame Léa EXEMPLE').prenom, 'Léa');
  assert.equal(D.ficheClientDe(VENTE, 'EXEMPLE'), null, 'un seul mot ne suffit pas');
  const deux = { authentic: { fichesClients: { a: { nom: 'Jean MARTIN' }, b: { nom: 'MARTIN Jean' } } } };
  assert.equal(D.ficheClientDe(deux, 'Jean MARTIN'), null);
  const vendeurs = D.personnesDossier(VENTE, 'vendeur');
  assert.equal(vendeurs.length, 2);
  assert.equal(vendeurs[0].domicile, 'BLOIS (41000), 1 rue Imaginaire');
  assert.equal(vendeurs[0].emails.join(','), 'lea@exemple.fr,lea.pro@exemple.fr', 'emails réunis sans doublon');
  assert.equal(vendeurs[0].profession, 'Essayiste');
  assert.equal(vendeurs[1].morale, true);
  assert.equal(vendeurs[1].fiche, null);
});

test('fusion d’une fiche bien : même immeuble complété, autre immeuble ajouté, rien de nouveau → null', () => {
  const ims = VENTE.authentic.immeubles;
  const plus = D.fusionnerImmeubleAuthentic(ims, { adresse: '', parcelles: [{ section: 'AB', numero: '101', nature: 'J' }, { section: 'AB', numero: '102' }] });
  assert.equal(plus.length, 2);
  assert.equal(plus[0].parcelles.map((p) => p.numero).join(','), '100,101,102');
  assert.equal(plus[0].parcelles[1].nature, 'J');
  const autre = D.fusionnerImmeubleAuthentic(ims, { adresse: 'SALBRIS (41300), 5 route Fictive', parcelles: [{ section: 'B', numero: '9' }] });
  assert.equal(autre.length, 3);
  assert.equal(D.fusionnerImmeubleAuthentic(ims, { adresse: '', parcelles: [{ section: 'AB', numero: '100' }] }), null);
});
