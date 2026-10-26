'use strict';
// Nettoyage de la fiche (étude 26/10) : retirer une partie, une parcelle ou un bien efface aussi ce qu'Authentic en avait retenu, sans rien bloquer.
// Noms, adresses et parcelles inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

function dossier() {
  return {
    id: 'd1', nom: 'MOREAU / LAMBERT', adresseBien: 'BLOIS (41000), 12 rue des Lices',
    parties: [{ role: 'VENDEUR', nom: 'MOREAU', prenom: 'Paul' }, { role: 'VENDEUR', nom: 'MOREAU', prenom: 'Anne' }, { role: 'ACQUEREUR', nom: 'LAMBERT', prenom: 'Claire' }],
    bien: { cadastre: { section: 'AB', numero: '12', parcelles: [{ section: 'AB', numero: '12', commune: 'BLOIS' }, { section: 'AB', numero: '12', commune: 'VINEUIL' }, { section: 'CD', numero: '7' }] } },
    authentic: {
      fichesClients: { 'moreau paul': { nom: 'MOREAU', prenom: 'Paul' }, 'moreau anne': { nom: 'MOREAU', prenom: 'Anne' } },
      fichesAuthentic: { 'paul moreau': { role: 'VENDEUR', emails: ['p@exemple.fr'] }, 'anne moreau': { role: 'VENDEUR', emails: ['a@exemple.fr'] } },
      valeurs: { 'parties:VENDEUR': ['Paul MOREAU', 'Anne MOREAU'], adresse: 'BLOIS (41000), 12 rue des Lices', prix: 245000 },
      majEnAttente: { 'parties:VENDEUR': { x: 1 }, prix: { x: 1 } },
      immeubles: [{ adresse: 'BLOIS (41000), 12 rue des Lices', parcelles: [{ section: 'AB', numero: '12', commune: 'BLOIS' }, { section: 'CD', numero: '7' }] },
        { adresse: 'VINEUIL (41350), chemin des Vignes', parcelles: [{ section: 'ZA', numero: '3', commune: 'VINEUIL' }] }],
      biensRetires: [{ adresse: 'vineuil chemin des vignes', parcelles: ['ZA0003'] }]
    }
  };
}

test('retirer une partie : sa fiche client, ses emails repris et sa place dans les personnes d’Authentic sont effacés — pas ceux des autres', () => {
  const d = dossier();
  assert.equal(app.retirerPartieDuDossier(d, 1), 'Anne MOREAU');
  assert.equal(d.parties.map(p => p.prenom).join(), 'Paul,Claire');
  assert.equal(Object.keys(d.authentic.fichesClients).join(), 'moreau paul');
  assert.equal(Object.keys(d.authentic.fichesAuthentic).join(), 'paul moreau');
  assert.equal(d.authentic.valeurs['parties:VENDEUR'].join(','), 'Paul MOREAU');
  assert.equal(d.authentic.valeurs.prix, 245000, 'le prix et les autres valeurs ne bougent pas');
  assert.equal(d.authentic.majEnAttente['parties:VENDEUR'], undefined);
  assert.ok(d.authentic.majEnAttente.prix);
  assert.equal(app.retirerPartieDuDossier(d, 9), '', 'index inconnu : rien');
});

test('retirer une parcelle : de la fiche ET des immeubles d’Authentic, la commune départage deux « AB 12 »', () => {
  const d = dossier();
  assert.equal(app.retirerParcelleDuDossier(d, 'AB', '12', 'VINEUIL'), 1);
  assert.equal(d.bien.cadastre.parcelles.map(p => p.section + p.numero + (p.commune || '')).join(), 'AB12BLOIS,CD7');
  assert.equal(d.authentic.immeubles[0].parcelles.length, 2, 'AB 12 de BLOIS reste dans l’immeuble de Blois');
  assert.equal(app.retirerParcelleDuDossier(d, 'CD', '7'), 2, 'sans commune : toutes les « CD 7 », fiche et immeuble');
  assert.equal(d.bien.cadastre.parcelles.length, 1);
  assert.equal(d.bien.cadastre.section, 'AB');
  assert.equal(d.authentic.immeubles[0].parcelles.length, 1);
});

test('retirer un bien d’Authentic sans le bloquer : il quitte les immeubles et un blocage antérieur est levé', () => {
  const d = dossier();
  const sig = app.signatureBienVente(d.authentic.immeubles[1]);
  const bien = app.retirerImmeubleSansBlocage(d, sig);
  assert.equal(bien.adresse, 'VINEUIL (41350), chemin des Vignes');
  assert.equal(d.authentic.immeubles.length, 1);
  assert.equal(d.authentic.biensRetires.length, 0, 'plus rien ne l’empêche de revenir');
  assert.equal(app.retirerImmeubleSansBlocage(d, 'inconnu'), null);
});

test('vider le bien : adresse, parcelles, lots, immeubles, biens retirés et valeurs d’adresse effacés ; prix et parties gardés', () => {
  const d = dossier();
  app.viderBienPrincipalDuDossier(d);
  assert.equal(d.adresseBien, '');
  assert.equal(JSON.stringify(d.bien), '{}');
  assert.equal(JSON.stringify(d.authentic.immeubles), '[]');
  assert.equal(JSON.stringify(d.authentic.biensRetires), '[]');
  assert.equal(d.authentic.valeurs.adresse, undefined);
  assert.equal(d.authentic.valeurs.prix, 245000);
  assert.equal(d.parties.length, 3);
});
