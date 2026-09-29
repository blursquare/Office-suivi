'use strict';
// Honoraires de négociation et fonds de travaux « loi ALUR » lus dans l'avant-contrat (demandé par
// l'étude le 29/09). Textes reprenant la structure de deux vraies promesses, noms et montants
// inventés, aplatis comme pdf.js les rend (une ligne par page).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const plat = (t) => t.replace(/\n/g, ' ');

const AGENCE = plat(`REMUNERATION DU MANDATAIRE
A LA CHARGE DU PROMETTANT
Les parties reconnaissent :
- Que les présentes ont été négociées par l'agence "VAL DE LOIRE HABITAT", par
l'intermédiaire de Madame Claire DUVAL, en vertu du mandat qu'il lui a donné le 3
mars 2026, sous le numéro 1234.
- Qu'en conformité de ce mandat, il lui est accordé par son mandant, à titre
irréductible, la somme, TVA incluse, de 12.500,00 €, à titre de rémunération.
CONDITIONS DE LA VENTE`);

const DIRECTE = plat(`NEGOCIATION DIRECTE ENTRE LES PARTIES
Les parties déclarent que les présentes conventions ont été négociées
directement entre elles, sans le concours ni la participation d'un
intermédiaire.
FRAIS - HONORAIRES DE PROMESSE DE VENTE
le montant des honoraires hors taxe d'établissement de la présente promesse de vente est de DEUX
CENTS EUROS (200,00 EUR HT), soit un montant toutes taxes comprises de DEUX CENT QUARANTE EUROS (240,00 EUR TTC).`);

test('honoraires : agence, montant TTC et charge lus dans la clause de rémunération', () => {
  const app = chargerApplication();
  const h = app.detecterHonorairesNegociation(AGENCE, 'PROMESSE_DE_VENTE');
  assert.equal(h.negociateur, 'agence');
  assert.equal(h.nom, 'VAL DE LOIRE HABITAT');
  assert.equal(h.montantTTC, 12500);
  assert.equal(h.charge, 'VENDEUR');
});

test('honoraires : négociation directe, jamais les honoraires du notaire pour la promesse', () => {
  const app = chargerApplication();
  const h = app.detecterHonorairesNegociation(DIRECTE, 'PROMESSE_DE_VENTE');
  assert.equal(h.direct, true);
  assert.equal(h.montantTTC, undefined);
  assert.equal(app.detecterHonorairesNegociation('Aucune clause utile ici.', 'COMPROMIS_DE_VENTE'), null);
});

test('honoraires : confrère négociateur à la charge de l’acquéreur, HT puis TTC', () => {
  const app = chargerApplication();
  const t = plat(`NEGOCIATION La présente vente a été négociée par Maître Paul LEBRUN, notaire à MER, à qui
il est dû des honoraires de négociation de 5.000,00 € HT soit 6.000,00 € TTC, à la charge de l'ACQUEREUR.`);
  const h = app.detecterHonorairesNegociation(t, 'COMPROMIS_DE_VENTE');
  assert.equal(h.negociateur, 'confrere');
  assert.equal(h.nom, 'Maître Paul LEBRUN');
  assert.equal(h.montantTTC, 6000);
  assert.equal(h.charge, 'ACQUEREUR');
});

test('fonds de travaux : remboursé, non remboursé, ou rien de tranché', () => {
  const app = chargerApplication();
  const oui = plat(`FONDS TRAVAUX LOI ALUR
Le PROMETTANT déclare qu’un fonds travaux « Loi ALUR » a été versé au
syndic ainsi qu’il résulte du pré état-daté susvisé.
Le BENEFICIAIRE remboursera au PROMETTANT le fonds travaux.
CONVENTION DES PARTIES SUR LES PROCEDURES`);
  const f = app.detecterFondsTravaux(oui);
  assert.equal(f.rembourse, true);
  assert.equal(f.montant, null);
  const avecMontant = app.detecterFondsTravaux("FONDS DE TRAVAUX La quote-part du lot dans le fonds de travaux s'élève à 1.234,56 €. L'ACQUEREUR remboursera ce montant au VENDEUR le jour de la vente.");
  assert.equal(avecMontant.rembourse, true);
  assert.equal(avecMontant.montant, 1234.56);
  const non = app.detecterFondsTravaux("FONDS DE TRAVAUX Le fonds de travaux reste attaché au lot. Les parties conviennent que le BENEFICIAIRE ne remboursera pas au PROMETTANT la quote-part du fonds de travaux.");
  assert.equal(non.rembourse, false);
  assert.equal(app.detecterFondsTravaux("Le fonds de travaux prévu par l'article 14-2 de la loi reste attaché aux lots."), null);
});

test('appel de fonds : honoraires à la charge de l’acquéreur, fonds de travaux, mode du décompte', () => {
  const app = chargerApplication();
  const d = { id: 'x', nom: 'DUPONT / MARTIN', prixVente: 200000, roleNotaire: 'instrumentaire',
    honoraires: { negociateur: 'agence', nom: 'VAL DE LOIRE HABITAT', montantTTC: 8000, charge: 'ACQUEREUR' },
    fondsTravaux: { rembourse: true, montant: 850.5 } };
  const p = app.prefillAppelFonds(d);
  assert.equal(p.modeDecompte, 'office');
  const l = app.lignesDecompteDepuisPrefill(p);
  const libelles = l.debit.map(x => `${x.libelle}=${x.montant}`).join(' | ');
  assert.match(libelles, /Honoraires de négociation TTC \(VAL DE LOIRE HABITAT\)=8000/);
  assert.match(libelles, /Remboursement du fonds de travaux \(loi ALUR\)=850\.5/);
  // À la charge du vendeur : rien au décompte de l'acquéreur.
  const vendeur = app.prefillAppelFonds(Object.assign({}, d, { honoraires: Object.assign({}, d.honoraires, { charge: 'VENDEUR' }), fondsTravaux: { rembourse: false } }));
  const l2 = app.lignesDecompteDepuisPrefill(vendeur).debit.map(x => x.libelle).join(' | ');
  assert.doesNotMatch(l2, /Honoraires|fonds de travaux/);
  assert.equal(app.prefillAppelFonds(Object.assign({}, d, { roleNotaire: 'participant' })).modeDecompte, 'confrere');
});

// Avis de taxe foncière : « le montant est toujours en bas à droite, en fin de page deux ».
test('avis de taxe foncière : montant le plus bas puis le plus à droite de la page', () => {
  const app = chargerApplication();
  const items = [
    { str: 'Vos bases', x: 40, y: 600 }, { str: '1 520', x: 300, y: 600 },
    { str: 'Taxe ordures ménagères', x: 40, y: 420 }, { str: '168 €', x: 480, y: 420 },
    { str: 'Montant de votre impôt', x: 300, y: 120 }, { str: '1 245 €', x: 520, y: 120 },
    { str: '12,00', x: 200, y: 121 },
    { str: 'Page 2/2', x: 280, y: 30 }, { str: '0412345678', x: 500, y: 30 }
  ];
  assert.equal(app.montantBasDroitePage(items), 1245);
  assert.equal(app.montantBasDroitePage([{ str: '1 245', x: 500, y: 100 }, { str: '€', x: 530, y: 100 }]), 1245);
  assert.equal(app.montantBasDroitePage([{ str: 'Rien', x: 1, y: 1 }]), null);
});

test('avis sur plusieurs biens : ordures ménagères au prorata de la taxe foncière', () => {
  const app = chargerApplication();
  const r = app.montantTfBienAvecTeom(600, 1500, 300);
  assert.equal(r.teom, 120);
  assert.equal(r.total, 720);
  assert.equal(app.montantTfBienAvecTeom(2000, 1500, 300), null);
  assert.equal(app.montantTfBienAvecTeom(600, 0, 300), null);
});

test('prorata de taxe foncière à la charge de l’acquéreur, jour de l’acte compris', () => {
  const app = chargerApplication();
  const l = app.ligneProrataTaxeFonciere(1245, '2026-10-20');
  // Du 20/10 au 31/12 inclus : 73 jours sur 365.
  assert.equal(l.detail.joursAcquereur, 73);
  assert.equal(l.montant, Math.round(1245 * 73 / 365 * 100) / 100);
  assert.equal(l.libelle, 'Prorata de taxe foncière 2026 (du 20/10 au 31/12)');
  assert.equal(app.ligneProrataTaxeFonciere(1245, ''), null);
});
