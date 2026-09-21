// Générateur d'appel de fonds — socle pur (voir « Générateur d'appel de fonds » dans CLAUDE.md).
//
// Les motifs du parseur ont été écrits sur de vrais décomptes de confrères : avant de les
// resserrer, relire les cas ci-dessous pour comprendre quelle rédaction réelle chacun couvre.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('montantDepuisTexteFr lit les montants français, espace insécable comprise', () => {
  assert.strictEqual(app.montantDepuisTexteFr('1 234,56 €'), 1234.56);
  assert.strictEqual(app.montantDepuisTexteFr('1 234,56 €'), 1234.56);
  assert.strictEqual(app.montantDepuisTexteFr('1.234,56'), 1234.56);
  assert.strictEqual(app.montantDepuisTexteFr('230,13 €'), 230.13);
  assert.strictEqual(app.montantDepuisTexteFr(''), null);
  assert.strictEqual(app.montantDepuisTexteFr(null), null);
});

test('parserDecompteConfrere reprend les lignes de débit et de crédit', () => {
  const texte = [
    'Prix de vente                              185 000,00 €',
    'Frais à ajouter',
    "Frais et droits d'acte                      14 250,00 €",
    'A déduire',
    'Acompte versé                                9 250,00 €'
  ].join('\n');
  const r = app.parserDecompteConfrere(texte);
  assert.strictEqual(r.lignes.debit.length, 2);
  assert.strictEqual(r.lignes.credit.length, 1);
  assert.strictEqual(r.lignes.debit[0].montant, 185000);
  assert.strictEqual(r.lignes.credit[0].montant, 9250);
});

test('parserDecompteConfrere écarte les sous-totaux, qui ne sont pas des lignes du décompte', () => {
  // Les reprendre comme lignes compterait deux fois les mêmes sommes.
  const texte = [
    'Prix de vente                              100 000,00 €',
    "Frais d'acte                                 8 000,00 €",
    'Soit au total                              108 000,00 €',
    'Reste à verser à la signature              108 000,00 €'
  ].join('\n');
  const r = app.parserDecompteConfrere(texte);
  assert.strictEqual(r.lignes.debit.length, 2);
  assert.strictEqual(r.meta.soldeDeclare, 108000);
});

test('parserDecompteConfrere rattache une formule de prorata à sa ligne', () => {
  const texte = [
    'Frais à ajouter',
    'Prorata de taxe foncière',
    '(913 € x 92 jours / 365 jours)                230,13 €'
  ].join('\n');
  const r = app.parserDecompteConfrere(texte);
  assert.strictEqual(r.lignes.debit.length, 1);
  assert.strictEqual(r.lignes.debit[0].libelle, 'Prorata de taxe foncière');
  assert.ok(r.lignes.debit[0].formule.includes('913'));
  assert.strictEqual(r.lignes.debit[0].montant, 230.13);
});

test('parserDecompteConfrere garde une ligne sans montant chiffré', () => {
  // « Offerts », « Néant », « pour mémoire » : la ligne existe sur le décompte du confrère et
  // doit rester visible — la masquer ferait croire à un oubli.
  const r = app.parserDecompteConfrere('Frais de mainlevée                  Pour mémoire');
  assert.strictEqual(r.lignes.debit.length, 1);
  assert.strictEqual(r.lignes.debit[0].memoire, true);
  assert.strictEqual(r.lignes.debit[0].montant, 0);
});

test('verifierProrataLigne recalcule la formule et signale un écart', () => {
  assert.strictEqual(app.verifierProrataLigne({ formule: '913 x 92 / 365', montant: 230.13 }).statut, 'ok');
  assert.strictEqual(app.verifierProrataLigne({ formule: '913 x 92 / 365', montant: 250 }).statut, 'ecart');
  // Une tolérance de 2 centimes : le confrère a pu arrondir dans l'autre sens.
  assert.strictEqual(app.verifierProrataLigne({ formule: '913 x 92 / 365', montant: 230.14 }).statut, 'ok');
  assert.strictEqual(app.verifierProrataLigne({ formule: null, montant: 10 }).statut, 'non-verifiable');
  assert.strictEqual(app.verifierProrataLigne({ formule: 'au prorata temporis', montant: 10 }).statut, 'non-verifiable');
});

test('salutationAppelFonds suit la civilité de chaque destinataire', () => {
  assert.strictEqual(app.salutationAppelFonds([{ civilite: 'M' }]), 'Cher Monsieur,');
  assert.strictEqual(app.salutationAppelFonds([{ civilite: 'Mme' }]), 'Chère Madame,');
  assert.strictEqual(app.salutationAppelFonds([{ civilite: 'M' }, { civilite: 'Mme' }]), 'Chers Monsieur et Madame,');
  assert.strictEqual(app.salutationAppelFonds([{ civilite: 'Mme' }, { civilite: 'Mme' }]), 'Chères Mesdames,');
  // Une société n'a pas de civilité : on ne présume pas le genre de son gérant.
  assert.strictEqual(app.salutationAppelFonds([{ civilite: 'SCI' }]), 'Cher Monsieur/Madame le gérant,');
  assert.strictEqual(app.salutationAppelFonds([]), 'Cher Monsieur,');
});

test('clientsDepuisDossier reprend les acquéreurs, jamais les vendeurs', () => {
  const d = {
    parties: [
      { nom: 'DUPONT', role: 'vendeur' },
      { nom: 'MARTIN', role: 'acquereur' },
      { nom: 'SCI LES TILLEULS', role: 'acquereur', qualitePersonne: 'morale' }
    ]
  };
  const c = app.clientsDepuisDossier(d);
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[0].nom, 'MARTIN');
  assert.strictEqual(c[1].civilite, 'SCI');
  // La civilité d'une personne physique n'est jamais devinée : elle reste à confirmer.
  assert.strictEqual(c[0].aCompleter, true);
  assert.strictEqual(c[1].aCompleter, false);
});

test('clientsDepuisDossier retombe sur le nom du dossier quand les parties manquent', () => {
  const c = app.clientsDepuisDossier({ nom: 'DUPONT / MARTIN & BERNARD' });
  assert.strictEqual(c.map(x => x.nom).join('|'), 'MARTIN|BERNARD');
});

test('designationDepuisTypeVente reste sur le vocabulaire notarial', () => {
  // « Copropriété » ne veut pas dire « appartement » : un garage ou une cave se vendent aussi
  // en lots.
  assert.strictEqual(app.designationDepuisTypeVente('copropriete'), 'un lot de copropriété');
  assert.strictEqual(app.designationDepuisTypeVente('terrain'), 'un terrain à bâtir');
  assert.strictEqual(app.designationDepuisTypeVente('maison'), 'une maison');
  assert.strictEqual(app.designationDepuisTypeVente(undefined), '');
});

test('depotDeductible ne déduit que ce qui est séquestré à l’étude', () => {
  // Déduire un dépôt détenu par l'agence ferait réclamer au client une somme trop faible —
  // une erreur qui ne se voit que le jour de la signature.
  assert.strictEqual(app.depotDeductible({ depotGarantie: 10000, sequestreDepot: "en la comptabilité de l'étude" }).deductible, true);
  assert.strictEqual(app.depotDeductible({ depotGarantie: 10000, sequestreDepot: "entre les mains du notaire" }).deductible, true);
  assert.strictEqual(app.depotDeductible({ depotGarantie: 10000, sequestreDepot: "versé à l'agence" }).deductible, false);
  // Piège réel : la phrase nomme l'agence ET le notaire, mais c'est l'agence qui détient.
  const mixte = app.depotDeductible({ depotGarantie: 10000, sequestreDepot: "versé à l'agence qui en donnera quittance au notaire" });
  assert.strictEqual(mixte.deductible, false);
  assert.strictEqual(mixte.motif, 'tiers');
  assert.strictEqual(app.depotDeductible({ depotGarantie: 10000, sequestreDepot: '' }).motif, 'indetermine');
  assert.strictEqual(app.depotDeductible({ depotGarantie: null }).motif, 'absent');
});

test('pretHypothecaireDossier distingue « pas d’hypothèque » de « garanties inconnues »', () => {
  // Un prêt cautionné ne donne lieu à aucun acte notarié, donc à aucun frais d'acte de prêt.
  assert.strictEqual(app.pretHypothecaireDossier({ garantiesPret: ['caution'] }), false);
  assert.strictEqual(app.pretHypothecaireDossier({ garantiesPret: ['hypothequeLegale'] }), true);
  assert.strictEqual(app.pretHypothecaireDossier({ garantiesPret: ['hypothequeConventionnelle'] }), true);
  assert.strictEqual(app.pretHypothecaireDossier({ sansPret: true }), false);
  // Aucune garantie lue : ni oui ni non, c'est à l'étude de trancher.
  assert.strictEqual(app.pretHypothecaireDossier({ garantiesPret: [] }), null);
});

test('prefillAppelFonds dit aussi ce qu’il n’a PAS pu remplir', () => {
  const p = app.prefillAppelFonds({
    id: 'd1', nom: 'DUPONT / MARTIN', typeVente: 'maison',
    adresseBien: '2 rue des Cours, 41110 SAINT-AIGNAN',
    prixVente: 185000, rendezVousSignature: '2026-10-20',
    parties: [{ nom: 'MARTIN', role: 'acquereur' }]
  });
  assert.strictEqual(p.dossierId, 'd1');
  assert.strictEqual(p.prixVente, 185000);
  assert.strictEqual(p.designation, 'une maison');
  assert.ok(p.repris.some(t => t.includes('Adresse')));
  // Les frais d'acte ne sont JAMAIS repris du simulateur de provision (barème non audité, voir
  // l'avertissement de cet écran) : ils restent toujours à saisir.
  assert.ok(p.aCompleter.some(t => t.includes('frais et droits')));
  assert.ok(p.aCompleter.some(t => t.includes('Civilité')));
});

test('prefillAppelFonds signale un dépôt séquestré hors de l’étude au lieu de le déduire', () => {
  const p = app.prefillAppelFonds({
    id: 'd2', nom: 'A / B', depotGarantie: 9000, sequestreDepot: "séquestré à l'agence"
  });
  assert.strictEqual(p.depotGarantie, null);
  assert.ok(p.aCompleter.some(t => t.includes('séquestré hors de l’étude')));
});

test('lignesDecompteDepuisPrefill garde une ligne à zéro plutôt que de la masquer', () => {
  // Une ligne vide est un emplacement à remplir, pas une ligne à faire disparaître : la retirer
  // ferait oublier les frais.
  const l = app.lignesDecompteDepuisPrefill({ prixVente: 100000, depotGarantie: null, pretHypothecaire: false });
  assert.strictEqual(l.debit.length, 2);
  assert.strictEqual(l.debit[0].montant, 100000);
  assert.strictEqual(l.debit[1].montant, 0);
  assert.strictEqual(l.credit.length, 1);
  const avecPret = app.lignesDecompteDepuisPrefill({ prixVente: 1, depotGarantie: 5000, pretHypothecaire: true });
  assert.strictEqual(avecPret.debit.length, 3);
  assert.strictEqual(avecPret.credit.length, 2);
});

test('phraseRdvAppelFonds écrit ce qu’on sait, jamais une date inventée', () => {
  assert.strictEqual(app.phraseRdvAppelFonds('', '', "en l'étude"), "à une date à fixer, en l'étude");
  const p = app.phraseRdvAppelFonds('2026-10-20', '11:00', "en l'étude");
  assert.ok(p.includes('20 octobre'));
  assert.ok(p.includes('11 heures'));
  assert.ok(p.endsWith("en l'étude"));
  assert.ok(app.phraseRdvAppelFonds('2026-10-20', '14:30', '').includes('14 h 30'));
});

test('afNomFichierDocx remplace les caractères interdits plutôt que de les retirer', () => {
  const n = app.afNomFichierDocx([{ civilite: 'M', nom: 'dupont' }, { civilite: 'Mme', nom: 'martin' }]);
  assert.ok(n.includes('DUPONT et MARTIN'));
  assert.ok(n.endsWith('.docx'));
  assert.ok(!app.afNomFichierDocx([{ civilite: 'M', nom: 'A/B' }]).includes('A/B'));
  assert.ok(app.afNomFichierDocx([]).includes('CLIENT'));
});

test('ligneClientComplete développe la civilité, sauf pour une société', () => {
  assert.strictEqual(app.ligneClientComplete({ civilite: 'M', prenom: 'Jean', nom: 'DUPONT' }), 'Monsieur Jean DUPONT');
  assert.strictEqual(app.ligneClientComplete({ civilite: 'Mme', prenom: '', nom: 'MARTIN' }), 'Madame MARTIN');
  assert.strictEqual(app.ligneClientComplete({ civilite: 'SCI', nom: 'SCI LES TILLEULS' }), 'SCI LES TILLEULS');
});
