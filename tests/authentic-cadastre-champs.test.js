'use strict';
// Fiche du bien d'Authentic : cadastre en champs par ligne (structure reçue le 16/10), surface en hectare / are / centiare. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const P = 'ui-ficho-tabs:mainTabPanel:tabForm13:tabContent:ficheImmeubleTabView:infosComponent:cadastre:dataTableCadastre:';
const NATURES = 'Agricole (PLU)Bois et forêt dans une commune sans document d’urbanisme (A)Naturel (PLU)Protégée (POS)Richesse';
const ligne = (n, section, numero, adresse, ha, a, ca, avecId) => [
  ...(avecId ? [{ libelle: `${P}${n}:cadastreHorsVolumeSection`, valeur: section }] : [{ libelle: `${P}${n}:j_idt28320`, valeur: section }]),
  { libelle: `${P}${n}:cadastreHorsVolumeNumero`, valeur: numero },
  { libelle: `${P}${n}:j_idt28334`, valeur: adresse },
  { libelle: `${P}${n}:selectNatureHorsVolumeMenu_focus`, valeur: '' },
  { libelle: `${P}${n}:selectNatureHorsVolumeMenu_input`, valeur: '—' },
  { libelle: `${P}${n}:j_idt28352_focus`, valeur: '' },
  { libelle: NATURES, valeur: '—' },
  { libelle: NATURES, valeur: 'BLOIS 1' },
  { libelle: 'BLOIS 1', valeur: ha }, { libelle: 'BLOIS 1', valeur: a }, { libelle: 'BLOIS 1', valeur: ca }
];

test('cadastre de la fiche du bien : numéro, section, adresse cadastrale et surface ha/a/ca par ligne', () => {
  const champs = [...ligne(0, 'AB', '526', '30 AV DE FRANCE', '0', '07', '95', true), ...ligne(1, 'AC', '0012', 'LES GRANDS CHAMPS', '1', '02', '00', false),
    { libelle: 'Observations', valeur: '12' }];
  const p = app.parcellesChampsCadastreAuthentic(champs);
  assert.equal(p.map((x) => `${x.section} ${x.numero} = ${x.surface} · ${x.adresseCadastre}`).join(' | '),
    'AB 526 = 0 ha 07 a 95 ca · 30 AV DE FRANCE | AC 12 = 1 ha 02 a 00 ca · LES GRANDS CHAMPS');
  assert.equal(app.centiaresDepuisContenance(p[0].surface), 795);
  assert.equal(app.centiaresDepuisContenance(p[1].surface), 10200);
  // La fiche du bien entière : parcelles reprises avec leur surface.
  const bien = app.bienDepuisFicheAuthentic({ champs: [{ libelle: 'ui-ficho-tabs:ficheImmeubleTabView:designation', valeur: 'Maison' }, ...champs], tableaux: [], texte: '' });
  assert.equal(bien.parcelles.map((x) => `${x.section}${x.numero}:${app.centiaresDepuisContenance(x.surface)}`).join(','), 'AB526:795,AC12:10200');
});

test('cadastre de la fiche du bien : une ligne sans section lisible n’invente rien', () => {
  const champs = [{ libelle: `${P}0:cadastreHorsVolumeNumero`, valeur: '526' }, { libelle: 'BLOIS 1', valeur: '0' }];
  assert.equal(app.parcellesChampsCadastreAuthentic(champs).length, 0);
});
