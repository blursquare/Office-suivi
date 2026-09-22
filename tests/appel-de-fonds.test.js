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

test('depotDeductible déduit le dépôt quel que soit son détenteur, mais le nomme', () => {
  // L'agence REVERSE le dépôt à l'étude (règle donnée par l'étude) : ne pas le déduire ferait
  // virer la somme une seconde fois au client. Le détenteur reste distingué par `motif`, parce
  // qu'il décide de ce que l'étude a à faire avant la signature.
  assert.strictEqual(app.depotDeductible({ depotGarantie: 10000, sequestreDepot: "en la comptabilité de l'étude" }).motif, 'etude');
  assert.strictEqual(app.depotDeductible({ depotGarantie: 10000, sequestreDepot: "entre les mains du notaire" }).deductible, true);
  const agence = app.depotDeductible({ depotGarantie: 10000, sequestreDepot: "versé à l'agence" });
  assert.strictEqual(agence.deductible, true);
  assert.strictEqual(agence.motif, 'tiers');
  // Piège réel : la phrase nomme l'agence ET le notaire, mais c'est l'agence qui détient.
  const mixte = app.depotDeductible({ depotGarantie: 10000, sequestreDepot: "versé à l'agence qui en donnera quittance au notaire" });
  assert.strictEqual(mixte.deductible, true);
  assert.strictEqual(mixte.motif, 'tiers');
  assert.strictEqual(app.depotDeductible({ depotGarantie: 10000, sequestreDepot: '' }).motif, 'indetermine');
  // Pas de dépôt du tout : rien à déduire, c'est le seul cas où `deductible` est faux.
  assert.strictEqual(app.depotDeductible({ depotGarantie: null }).deductible, false);
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

test('prefillAppelFonds déduit un dépôt détenu par l’agence et rappelle de le réclamer', () => {
  const p = app.prefillAppelFonds({
    id: 'd2', nom: 'A / B', depotGarantie: 9000, sequestreDepot: "séquestré à l'agence"
  });
  assert.strictEqual(p.depotGarantie, 9000);
  assert.strictEqual(p.depotMotif, 'tiers');
  assert.ok(p.repris.some(t => t.includes('Dépôt de garantie')));
  assert.ok(p.aCompleter.some(t => t.includes('à réclamer avant la signature')));
});

test('prefillAppelFonds déduit un dépôt au détenteur illisible, mais le signale', () => {
  const p = app.prefillAppelFonds({ id: 'd3', nom: 'A / B', depotGarantie: 5000, sequestreDepot: '' });
  assert.strictEqual(p.depotGarantie, 5000);
  assert.ok(p.aCompleter.some(t => t.includes('qui le détient')));
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

test('afExtraireFormule lit aussi un prorata écrit sans parenthèses', () => {
  // Mise en page rencontrée en vérifiant le contrôle de bout en bout : sans ce cas, la formule
  // était bien sur la ligne mais aucun recalcul n'était tenté.
  const r = app.parserDecompteConfrere('Prorata taxe foncière 913 € x 92 jours / 365 jours    230,13 €');
  assert.strictEqual(r.lignes.debit.length, 1);
  assert.strictEqual(r.lignes.debit[0].libelle, 'Prorata taxe foncière');
  assert.ok(r.lignes.debit[0].formule.includes('913'));
  assert.strictEqual(app.verifierProrataLigne(r.lignes.debit[0]).statut, 'ok');
});

test('estLigneFraisActeVente ne retient que les frais de l’acte de VENTE', () => {
  // Les frais d'acte de prêt, de mainlevée ou de négociation relèvent d'autres barèmes :
  // les contrôler contre celui-ci signalerait un écart sur une ligne parfaitement juste.
  assert.strictEqual(app.estLigneFraisActeVente("Montant des frais et droits de l'acte de vente"), true);
  assert.strictEqual(app.estLigneFraisActeVente("Frais d'acte"), true);
  assert.strictEqual(app.estLigneFraisActeVente('Provision sur frais'), true);
  assert.strictEqual(app.estLigneFraisActeVente("Frais d'acte de prêt"), false);
  assert.strictEqual(app.estLigneFraisActeVente('Frais de mainlevée'), false);
  assert.strictEqual(app.estLigneFraisActeVente('Frais de négociation'), false);
  assert.strictEqual(app.estLigneFraisActeVente("Prix d'acquisition"), false);
});

test('cleBaremeDepuisDepartement ne devine pas ce que le code postal ne dit pas', () => {
  // Corse et Alsace sont regroupées dans le barème ; le 69 y est scindé entre Métropole de Lyon
  // et Rhône, indiscernables depuis un code postal — rien n'est proposé plutôt qu'un pari.
  assert.strictEqual(app.cleBaremeDepuisDepartement('41'), '41');
  assert.strictEqual(app.cleBaremeDepuisDepartement('2A'), '20');
  assert.strictEqual(app.cleBaremeDepuisDepartement('2B'), '20');
  assert.strictEqual(app.cleBaremeDepuisDepartement('67'), '67/68');
  assert.strictEqual(app.cleBaremeDepuisDepartement('69'), null);
  assert.strictEqual(app.cleBaremeDepuisDepartement('975'), null);
  assert.strictEqual(app.cleBaremeDepuisDepartement(null), null);
});

test('estimerFraisActe applique le taux départemental selon le régime', () => {
  const primo = app.estimerFraisActe(185000, '41', 'house', true);
  const plein = app.estimerFraisActe(185000, '41', 'house', false);
  assert.strictEqual(primo.tauxApplique, 0.045);
  assert.strictEqual(plein.tauxApplique, 0.05);
  // La hausse départementale temporaire coûte forcément plus cher.
  assert.ok(plein.total > primo.total);
  // Un département ou un type inconnu ne rend rien plutôt qu'un chiffre inventé.
  assert.strictEqual(app.estimerFraisActe(185000, '2A', 'house', false), null);
  assert.strictEqual(app.estimerFraisActe(0, '41', 'house', false), null);
});

test('fourchetteFraisActe encadre les deux régimes possibles', () => {
  // Le dossier ne dit pas si l'acquéreur est primo-accédant : on encadre au lieu de parier.
  const f = app.fourchetteFraisActe(185000, '41', 'house');
  assert.ok(f.min < f.max);
  assert.strictEqual(app.fourchetteFraisActe(185000, '', 'house'), null);
});

test('verifierFraisActeLigne dit au-dessus, en dessous, ou conforme', () => {
  const f = app.fourchetteFraisActe(185000, '41', 'house');
  assert.strictEqual(app.verifierFraisActeLigne((f.min + f.max) / 2, f).statut, 'ok');
  // Les deux bornes du régime restent conformes : c'est tout l'intérêt de la fourchette.
  assert.strictEqual(app.verifierFraisActeLigne(f.min, f).statut, 'ok');
  assert.strictEqual(app.verifierFraisActeLigne(f.max, f).statut, 'ok');
  const sous = app.verifierFraisActeLigne(f.min - 3000, f);
  assert.strictEqual(sous.statut, 'sous');
  assert.ok(sous.ecart > 2900);
  assert.strictEqual(app.verifierFraisActeLigne(f.max + 3000, f).statut, 'sur');
  // Une ligne à zéro (le cas par défaut, à remplir) ne doit rien signaler du tout.
  assert.strictEqual(app.verifierFraisActeLigne(0, f).statut, 'non-verifiable');
  assert.strictEqual(app.verifierFraisActeLigne(14000, null).statut, 'non-verifiable');
});

test('prefillAppelFonds propose le département et le type de bien du contrôle', () => {
  const p = app.prefillAppelFonds({
    id: 'd4', nom: 'A / B', typeVente: 'copropriete',
    adresseBien: '3 rue Haute, 41000 BLOIS'
  });
  assert.strictEqual(p.departementFrais, '41');
  assert.strictEqual(p.typeBienFrais, 'condo');
  // Adresse sans code postal : rien n'est proposé, le contrôle reste silencieux.
  const sans = app.prefillAppelFonds({ id: 'd5', nom: 'A / B', adresseBien: 'lieu-dit Les Vignes' });
  assert.strictEqual(sans.departementFrais, null);
});

test('urlRechercheAdresseDataGouv encode la requête et borne les résultats', () => {
  const url = app.urlRechercheAdresseDataGouv('5 rue des Lilas, Blois');
  assert.ok(url.startsWith('https://api-adresse.data.gouv.fr/search/?q='));
  // L'espace et la virgule doivent être encodés : une URL mal formée rend une 400 silencieuse.
  assert.ok(url.includes('5%20rue%20des%20Lilas%2C%20Blois'));
  assert.ok(url.includes('limit=5'));
  assert.ok(url.includes('autocomplete=1'));
  // Rien d'autre que le texte tapé ne part vers ce service tiers.
  assert.ok(!url.includes('DUPONT'));
});

test('adressesDepuisReponseDataGouv lit le GeoJSON et écarte ce qui n’est pas exploitable', () => {
  const json = {
    features: [
      { properties: { label: '5 Rue des Lilas 41000 Blois', context: '41, Loir-et-Cher, Centre-Val de Loire' } },
      { properties: { label: '', context: '41, Loir-et-Cher' } },
      { properties: {} },
      null
    ]
  };
  const r = app.adressesDepuisReponseDataGouv(json);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].label, '5 Rue des Lilas 41000 Blois');
  assert.ok(r[0].contexte.includes('Loir-et-Cher'));
  // Une réponse vide, absente ou malformée ne doit jamais lever : le champ reste une saisie libre.
  assert.strictEqual(app.adressesDepuisReponseDataGouv(null).length, 0);
  assert.strictEqual(app.adressesDepuisReponseDataGouv({}).length, 0);
  assert.strictEqual(app.adressesDepuisReponseDataGouv({ features: 'pas un tableau' }).length, 0);
});

test('composerAdresseCourrier ajoute la mention d envoi APRES les lignes du destinataire', () => {
  const app = chargerApplication();
  const combine = app.composerAdresseCourrier('Monsieur Jean DUPONT', 'Envoi par e-mail uniquement');
  const lignes = combine.split('\n');
  assert.equal(lignes.length, 2);
  assert.equal(lignes[0], 'Monsieur Jean DUPONT');
  assert.equal(lignes[1], 'Envoi par e-mail uniquement');
});

test('composerAdresseCourrier omet la mention quand une adresse postale est saisie', () => {
  const app = chargerApplication();
  const adresse = 'Monsieur Jean DUPONT\n12 rue des Lilas\n41000 BLOIS';
  // L appelant ne transmet pas la mention des qu une adresse est renseignee : les deux
  // se contrediraient sur le meme courrier.
  assert.equal(app.composerAdresseCourrier(adresse, ''), adresse);
  assert.equal(app.composerAdresseCourrier(adresse, '   '), adresse);
  assert.equal(app.composerAdresseCourrier(adresse, null), adresse);
});

test('composerAdresseCourrier tient sans destinataire, et la mention par defaut est celle attendue', () => {
  const app = chargerApplication();
  assert.equal(app.composerAdresseCourrier('', 'Envoi par e-mail uniquement'), 'Envoi par e-mail uniquement');
  assert.equal(app.composerAdresseCourrier('', ''), '');
  assert.equal(app.MENTION_ENVOI_APPEL_FONDS, 'Envoi par e-mail uniquement');
});

test('typeBienDepuisDesignation lit la nature du bien dans la désignation libre', () => {
  const app = chargerApplication();
  assert.equal(app.typeBienDepuisDesignation('une maison'), 'house');
  assert.equal(app.typeBienDepuisDesignation('un immeuble de rapport'), 'house');
  assert.equal(app.typeBienDepuisDesignation('un pavillon'), 'house');
  assert.equal(app.typeBienDepuisDesignation('un lot de copropriété'), 'condo');
  assert.equal(app.typeBienDepuisDesignation('un appartement'), 'condo');
  assert.equal(app.typeBienDepuisDesignation('un terrain à bâtir'), 'land');
  assert.equal(app.typeBienDepuisDesignation('une parcelle'), 'land');
});

test('un lot situé dans un immeuble reste une copropriété', () => {
  // L'ordre des tests porte la règle : les deux mots sont présents, mais c'est « lot » qui dit la
  // nature du bien vendu. Testé dans les deux sens de rédaction.
  const app = chargerApplication();
  assert.equal(app.typeBienDepuisDesignation('un lot de copropriété dans un immeuble'), 'condo');
  assert.equal(app.typeBienDepuisDesignation('un immeuble en copropriété, lot numéro 4'), 'condo');
});

test('une désignation qui ne tranche pas ne propose aucune nature', () => {
  // Le contrôle des frais se tait alors, plutôt que de comparer à un barème qui n'est pas celui
  // du bien — même prudence que le département ambigu (69), qui ne propose rien non plus.
  const app = chargerApplication();
  assert.equal(app.typeBienDepuisDesignation(''), null);
  assert.equal(app.typeBienDepuisDesignation('un bien'), null);
  assert.equal(app.typeBienDepuisDesignation('les droits indivis du vendeur'), null);
});

test('typeBienDepuisDesignation ignore accents et majuscules', () => {
  const app = chargerApplication();
  assert.equal(app.typeBienDepuisDesignation('UN TERRAIN À BÂTIR'), 'land');
  assert.equal(app.typeBienDepuisDesignation('un lot de COPROPRIETE'), 'condo');
});
