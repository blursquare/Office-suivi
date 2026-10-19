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
  // Le libellé du confrère est ramené au vocabulaire de l'étude (normaliserLibelleDecompte) ; ce
  // test porte sur la formule et son rattachement à la bonne ligne.
  assert.strictEqual(r.lignes.debit[0].libelle, 'Quote-part de taxes foncières');
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
  // Frais d'acte estimés par le barème validé (étude 06/10 : « que le décompte se remplisse tout seul »), au taux plein,
  // et signalés « à vérifier » avec le montant d'un primo-accédant.
  assert.ok(p.fraisActe > 0);
  assert.ok(p.aCompleter.some(t => /Frais et droits de l’acte estimés par le barème : .* primo-accédant .* à vérifier/.test(t)));
  assert.strictEqual(app.lignesDecompteDepuisPrefill(p).debit[1].montant, p.fraisActe);
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
  // Prêt hypothécaire : frais de garantie au débit, montant du prêt en déduction (règle de l'étude, 29/09).
  const avecPret = app.lignesDecompteDepuisPrefill({ prixVente: 1, depotGarantie: 5000, pretHypothecaire: true, montantPret: 180000 });
  assert.strictEqual(avecPret.debit.length, 3);
  assert.match(avecPret.debit[2].libelle, /Frais d'acte de prêt \(garantie hypothécaire\)/);
  assert.strictEqual(avecPret.credit.length, 3);
  assert.strictEqual(avecPret.credit[1].libelle, 'Montant du prêt (versé par la banque)');
  assert.strictEqual(avecPret.credit[1].montant, 180000);
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
  assert.strictEqual(r.lignes.debit[0].libelle, 'Quote-part de taxes foncières');
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

test('composerAdresseCourrier : lignes du destinataire nettoyées, sans la mention (champ à part depuis le 06/10)', () => {
  const app = chargerApplication();
  assert.equal(app.composerAdresseCourrier('Monsieur Jean DUPONT'), 'Monsieur Jean DUPONT');
  const adresse = 'Monsieur Jean DUPONT\n12 rue des Lilas\n41000 BLOIS';
  assert.equal(app.composerAdresseCourrier(adresse + '\n\n'), adresse);
  assert.equal(app.composerAdresseCourrier('  Monsieur Jean DUPONT \n\n 12 rue des Lilas '), 'Monsieur Jean DUPONT\n12 rue des Lilas');
  assert.equal(app.composerAdresseCourrier(''), '');
  assert.equal(app.composerAdresseCourrier(null), '');
  assert.equal(app.MENTION_ENVOI_APPEL_FONDS, 'Envoi par e-mail uniquement');
});

test('normaliserDonneesCourrierAppelFonds (06/10) : un courrier gardé avant perd la mention et les retours d’addrLines, qui passent au modèle', () => {
  const app = chargerApplication();
  // Données d'avant : mention en dernière ligne + cinq retours.
  const ancien = app.normaliserDonneesCourrierAppelFonds({ addrLines: 'Monsieur Jean DUPONT\nEnvoi par e-mail uniquement\n\n\n\n\n', ville: 'Blois' });
  assert.equal(ancien.addrLines, 'Monsieur Jean DUPONT');
  assert.equal(ancien.mention, 'Envoi par e-mail uniquement');
  assert.equal(ancien.ville, 'Blois');
  // Adresse postale (sans mention) + retours.
  const postal = app.normaliserDonneesCourrierAppelFonds({ addrLines: 'Monsieur Jean DUPONT\n12 rue des Lilas\n41000 BLOIS\n\n\n\n\n' });
  assert.equal(postal.addrLines, 'Monsieur Jean DUPONT\n12 rue des Lilas\n41000 BLOIS');
  assert.equal(postal.mention, '');
  // Données d'aujourd'hui : rien ne bouge (la mention peut être vide).
  const neuf = { addrLines: 'Monsieur Jean DUPONT', mention: '' };
  assert.deepEqual(app.normaliserDonneesCourrierAppelFonds(neuf), neuf);
  assert.equal(app.normaliserDonneesCourrierAppelFonds({ addrLines: 'Envoi par e-mail uniquement' }).addrLines, '', 'mention seule, sans destinataire');
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

test('les lignes d’un PDF sont reconstruites depuis la position verticale des items', () => {
  // pdf.js rend une page comme une suite d'items, pas comme des lignes : les deux autres lecteurs
  // du fichier les joignent par une espace et ne produisent qu'UN retour à la ligne par page.
  // Le parseur du décompte, lui, travaille ligne par ligne — d'où ce lecteur dédié.
  const app = chargerApplication();
  const item = (str, x, y) => ({ str, height: 10, transform: [1, 0, 0, 10, x, y] });
  const lignes = app.lignesDepuisItemsPdf([
    // Volontairement dans le désordre : c'est la position, pas l'ordre d'arrivée, qui décide.
    item('220 000,00 €', 420, 700),
    item('- Acompte', 60, 660),
    item('Prix de vente', 60, 700),
    item('11 000,00 €', 420, 660)
  ]);
  assert.equal(lignes.join(' // '), 'Prix de vente 220 000,00 € // - Acompte 11 000,00 €');
});

test('deux items légèrement décalés restent sur la même ligne', () => {
  // Un décompte mélange les corps de police (un exposant, une note en petit) : la tolérance est
  // dérivée de la hauteur du texte, un seuil absolu couperait une ligne écrite plus grand.
  const app = chargerApplication();
  const lignes = app.lignesDepuisItemsPdf([
    { str: 'Prorata', height: 10, transform: [1, 0, 0, 10, 60, 500] },
    { str: 'taxe foncière', height: 10, transform: [1, 0, 0, 10, 110, 502] },
    { str: '501,28 €', height: 10, transform: [1, 0, 0, 10, 420, 499] },
    { str: 'Ligne suivante', height: 10, transform: [1, 0, 0, 10, 60, 480] }
  ]);
  assert.equal(lignes.length, 2);
  assert.equal(lignes[0], 'Prorata taxe foncière 501,28 €');
});

test('un tiret ou une puce en début de ligne ne part pas dans le courrier', () => {
  // Décoration de liste du décompte du confrère, pas une partie du libellé. Le cas du libellé et
  // du montant sur DEUX lignes est le seul que l'ancien nettoyage laissait passer.
  const app = chargerApplication();
  const res = app.parserDecompteConfrere([
    'Prix de vente: 220 000,00 €',
    'Frais à ajouter :',
    '- Frais d’achat 18 200,00 €',
    '• Frais de promesse TTC 341,00 €',
    '— Prorata taxe foncière',
    '501,28 €'
  ].join('\n'));
  const libelles = res.lignes.debit.map(l => l.libelle);
  assert.equal(libelles.join(' | '), 'Prix d’acquisition | Montant des frais et droits de l’acte de vente | Frais de promesse TTC | Quote-part de taxes foncières');
});

test('« Frais d’achat » est contrôlé contre le barème, « frais de prêt » non', () => {
  // Libellé réel d'un décompte de confrère : le contrôle ne se déclenchait jamais sur un décompte
  // importé, celui-là même qu'il sert à vérifier. Signalé par l'étude.
  const app = chargerApplication();
  assert.ok(app.estLigneFraisActeVente('Frais d’achat (sauf à parfaire ou à diminuer)'));
  assert.ok(app.estLigneFraisActeVente("Frais d'acquisition"));
  assert.ok(app.estLigneFraisActeVente("Frais et droits de l'acte de vente"));
  assert.ok(!app.estLigneFraisActeVente('Frais de prêt(s) (sauf à parfaire ou à diminuer)'));
  assert.ok(!app.estLigneFraisActeVente('Frais de promesse TTC'));
});

test('le décompte réel d’un confrère se recalcule au centime près', () => {
  // Décompte d'une vraie convocation (LD Notaires), tel que lireTextePdfEnLignes le restitue.
  // Le solde recalculé doit retomber sur celui que le confrère annonce : c'est le seul contrôle
  // possible sur un décompte que l'outil n'a pas produit.
  const app = chargerApplication();
  const res = app.parserDecompteConfrere([
    'Prix de vente: 220 000,00 €',
    'Frais à ajouter :',
    '- Frais d’achat (sauf à parfaire ou à diminuer) 18 200,00 €',
    '- Frais de prêt(s) (sauf à parfaire ou à diminuer) mémoire',
    '- Frais de promesse TTC 341,00 €',
    '- Prorata taxe foncière 501,28 €',
    'Ensemble 19 042,28 € +19 042,28 €',
    'Total des dépenses 239 042,28 €',
    'Sommes à déduire :',
    '- Acompte 11 000,00 €',
    '- Provision sur frais versée à ce jour 400,00 €',
    'Ensemble 11 400,00 € - 11 400,00 €',
    'Versement à la signature 227 642,28 €'
  ].join('\n'));
  const somme = (s) => res.lignes[s].reduce((t, l) => t + (l.memoire ? 0 : (l.montant || 0)), 0);
  assert.equal(res.lignes.debit.length, 5);
  assert.equal(res.lignes.credit.length, 2);
  assert.equal(res.lignes.debit[2].memoire, true);
  assert.equal(res.meta.soldeDeclare, 227642.28);
  assert.equal(Math.round((somme('debit') - somme('credit')) * 100) / 100, 227642.28);
});

test('les libellés du confrère sont ramenés au vocabulaire de l’étude', () => {
  // Chaque confrère nomme les mêmes lignes à sa façon, et ces libellés partent tels quels dans le
  // courrier : l'étude a demandé une formulation unique. Les variantes sont reconnues.
  const app = chargerApplication();
  const n = app.normaliserLibelleDecompte;
  ['Prix de vente', "Prix d'acquisition", 'Prix de cession', 'Prix principal']
    .forEach(l => assert.equal(n(l), 'Prix d’acquisition', l));
  ["Frais d'achat (sauf à parfaire ou à diminuer)", "Frais d'acte", 'Frais et droits',
   'Frais de notaire', "Frais d'acquisition", 'Émoluments et droits']
    .forEach(l => assert.equal(n(l), 'Montant des frais et droits de l’acte de vente', l));
  ['Prorata taxe foncière', 'Quote-part de taxes foncières', 'Prorata TF', 'Répartition taxes foncières']
    .forEach(l => assert.equal(n(l), 'Quote-part de taxes foncières', l));
  ['Acompte', 'Arrhes versées', 'Dépôt de garantie', 'Séquestre']
    .forEach(l => assert.equal(n(l), 'Acompte sur prix versé à l’étude', l));
  ['Provision sur frais versée à ce jour', 'Acompte sur frais', 'Provision déjà versée']
    .forEach(l => assert.equal(n(l), 'Acompte sur frais versé à l’étude', l));
});

test('les lignes qui ressemblent aux frais d’acte sans en être gardent leur libellé', () => {
  // « Frais d'acte de prêt », « frais de promesse », « frais de mainlevée » relèvent d'autres
  // barèmes : les renommer « frais et droits de l'acte de vente » serait un contresens, et le
  // contrôle du barème les prendrait alors à tort pour la ligne qu'il vérifie.
  const app = chargerApplication();
  const n = app.normaliserLibelleDecompte;
  ["Frais d'acte de prêt", 'Frais de prêt(s) (sauf à parfaire ou à diminuer)',
   'Frais de promesse TTC', 'Frais de mainlevée', 'Frais de négociation']
    .forEach(l => assert.equal(n(l), l, l));
});

test('un libellé non reconnu n’est jamais renommé', () => {
  // Renommer ce qu'on n'a pas compris serait pire que de ne rien faire : le libellé du confrère
  // part dans le courrier de l'étude tel quel.
  const app = chargerApplication();
  const n = app.normaliserLibelleDecompte;
  ['Taxe de séjour communale', 'Honoraires de rédaction', 'Copies authentiques', '', '  ']
    .forEach(l => assert.equal(n(l), String(l).trim(), JSON.stringify(l)));
});

test('la normalisation s’applique au décompte importé, sans toucher aux montants', () => {
  const app = chargerApplication();
  const res = app.parserDecompteConfrere([
    'Prix de vente: 220 000,00 €',
    'Frais à ajouter :',
    '- Frais d’achat (sauf à parfaire ou à diminuer) 18 200,00 €',
    '- Prorata taxe foncière 501,28 €',
    'Sommes à déduire :',
    '- Acompte 11 000,00 €',
    '- Provision sur frais versée à ce jour 400,00 €'
  ].join('\n'));
  assert.equal(res.lignes.debit.map(l => l.libelle).join(' | '),
    'Prix d’acquisition | Montant des frais et droits de l’acte de vente | Quote-part de taxes foncières');
  assert.equal(res.lignes.credit.map(l => l.libelle).join(' | '),
    'Acompte sur prix versé à l’étude | Acompte sur frais versé à l’étude');
  assert.equal(res.lignes.debit.map(l => l.montant).join(','), '220000,18200,501.28');
  assert.equal(res.lignes.credit.map(l => l.montant).join(','), '11000,400');
});

// --- date et heure du rendez-vous lues dans la convocation du confrère -------------------------
//
// Textes construits sur la STRUCTURE de vraies convocations, avec des noms et des dates inventés.

test('detecterRendezVousDecompte lit le jour et l’heure d’une convocation', () => {
  const r = app.detecterRendezVousDecompte(
    'Maître LEROY, notaire à VENDOME\n' +
    'Le rendez-vous de signature de l’acte authentique de vente est fixé au mercredi 14 octobre 2026 ' +
    'à 14 heures 30 en notre étude.');
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.heure, '14:30');
});

test('detecterRendezVousDecompte accepte les quatre écritures de l’heure', () => {
  const lu = (h) => app.detecterRendezVousDecompte(
    'Rendez-vous de signature le 14/10/2026 à ' + h + ' en l’étude.').heure;
  assert.equal(lu('14h30'), '14:30');
  assert.equal(lu('14 h 30'), '14:30');
  assert.equal(lu('14:30'), '14:30');
  assert.equal(lu('14 heures'), '14:00');
});

test('detecterRendezVousDecompte ignore la date du courrier et retient celle du rendez-vous', () => {
  // La date du courrier PRÉCÈDE l'objet : c'est le piège que l'ancrage doit écarter.
  const r = app.detecterRendezVousDecompte(
    'BLOIS, le 3 septembre 2026\n' +
    'Objet : convocation\n' +
    'Nous vous invitons à vous présenter pour la signature de l’acte le 9 octobre 2026 à 10 h.');
  assert.equal(r.date, '2026-10-09');
  assert.equal(r.heure, '10:00');
});

test('detecterRendezVousDecompte survit au découpage en lignes d’un PDF', () => {
  const r = app.detecterRendezVousDecompte(
    'Le rendez-vous de signature est fixé au\n14 octobre 2026\nà 15 h 00.');
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.heure, '15:00');
});

test('detecterRendezVousDecompte préfère la mention qui porte l’heure', () => {
  // Un titre daté ouvre le courrier, la phrase complète vient plus bas : c'est elle qu'on veut.
  const r = app.detecterRendezVousDecompte(
    'Convocation du 12 octobre 2026\n' +
    'Le rendez-vous est fixé au 14 octobre 2026 à 11 heures.');
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.heure, '11:00');
});

test('detecterRendezVousDecompte accepte la date écrite avant l’ancre', () => {
  const r = app.detecterRendezVousDecompte(
    'Le 14 octobre 2026 à 9 h 15 se tiendra le rendez-vous de signature.');
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.heure, '09:15');
});

test('detecterRendezVousDecompte ne rend rien sans année, plutôt qu’une année devinée', () => {
  const r = app.detecterRendezVousDecompte(
    'Rendez-vous de signature le mardi 14 octobre à 10 heures en l’étude.');
  assert.equal(r.date, null);
  assert.equal(r.heure, null);
});

test('detecterRendezVousDecompte ne prend aucune date sans vocabulaire de rendez-vous', () => {
  // Un décompte seul : prorata de taxe foncière, prix, solde — aucune de ces dates n'est un RDV.
  const r = app.detecterRendezVousDecompte(
    'Prorata taxe foncière du 15/03/2026 au 31/12/2026   913,00 €\n' +
    'Prix de vente   220 000,00 €');
  assert.equal(r.date, null);
});

test('afHeureDansFragment ne prend pas un montant pour une heure', () => {
  assert.equal(app.afHeureDansFragment('Reste à verser 1 430,00 € à la signature'), null);
  assert.equal(app.afHeureDansFragment('Frais d’achat 18 200,00 €'), null);
});

test('detecterRendezVousDecompte rend la date seule quand l’heure n’est pas écrite', () => {
  const r = app.detecterRendezVousDecompte(
    'La réitération par acte authentique interviendra le 14 octobre 2026 en notre étude.');
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.heure, null);
});

test('donneesCourrierAppelFonds (06/10) : adresse sans retour d’aération (ils sont dans le modèle Word), mention dans son propre champ', () => {
  const app = chargerApplication();
  const adresse = { innerHTML: '<u>Monsieur Jean DUPONT<br>12 rue des Lices</u>' };
  const mention = { textContent: 'Envoi par e-mail uniquement', style: { display: '' } };
  app.afEl = (id) => (id === 'af-p-adresse' ? adresse : id === 'af-p-mention' || id === 'af-p-mention-ligne' ? mention : null);
  app.afValeur = () => '';
  const avecMention = app.donneesCourrierAppelFonds();
  assert.equal(avecMention.addrLines, 'Monsieur Jean DUPONT\n12 rue des Lices');
  assert.equal(avecMention.mention, 'Envoi par e-mail uniquement');
  mention.style.display = 'none';
  assert.equal(app.donneesCourrierAppelFonds().mention, '', 'mention masquée (adresse postale saisie) : champ vide');
});

// Étude 05/10 : sur la fiche, chaque personne en « Monsieur / Madame Prénom NOM » et la seule situation matrimoniale du
// couple (marié, pacsé, concubins) ; deux hommes ou deux femmes compris. Noms inventés.
test('situation : destinataire et formule d’appel du courrier', () => {
  const app = chargerApplication();
  const paul = { civilite: 'M', prenom: '', nom: 'Paul DUPONT' };
  const lea = { civilite: 'Mme', prenom: '', nom: 'Léa MARTIN' };
  const marc = { civilite: 'M', prenom: '', nom: 'Marc LEROY' };
  const anne = { civilite: 'Mme', prenom: '', nom: 'Anne ROCHE' };
  assert.equal(app.lignesDestinatairesAppelFonds([paul, lea], 'marie').join('|'), 'Monsieur et Madame Paul DUPONT');
  assert.equal(app.lignesDestinatairesAppelFonds([lea, paul], 'marie').join('|'), 'Monsieur et Madame Paul DUPONT', 'Monsieur trouvé par sa civilité');
  assert.equal(app.lignesDestinatairesAppelFonds([lea, paul], 'pacse').join('|'), 'Monsieur Paul DUPONT et Madame Léa MARTIN');
  assert.equal(app.lignesDestinatairesAppelFonds([paul, lea], 'concubin').join('|'), 'Monsieur Paul DUPONT et Madame Léa MARTIN');
  assert.equal(app.lignesDestinatairesAppelFonds([paul, marc], 'marie').join('|'), 'Monsieur Paul DUPONT et Monsieur Marc LEROY', 'deux hommes mariés');
  assert.equal(app.lignesDestinatairesAppelFonds([lea, anne], 'pacse').join('|'), 'Madame Léa MARTIN et Madame Anne ROCHE', 'deux femmes pacsées');
  assert.equal(app.lignesDestinatairesAppelFonds([{ civilite: 'M', prenom: '', nom: 'DUPONT' }], 'marie').join('|'), 'Monsieur et Madame DUPONT', 'couple en une seule ligne');
  assert.equal(app.lignesDestinatairesAppelFonds([lea], '').join('|'), 'Madame Léa MARTIN');
  assert.equal(app.lignesDestinatairesAppelFonds([paul, lea], '').join('|'), 'Monsieur Paul DUPONT|Madame Léa MARTIN', 'sans situation : une ligne par personne');
  ['marie', 'pacse', 'concubin'].forEach(s => assert.equal(app.salutationAppelFonds([paul, lea], s), 'Chers Monsieur et Madame,'));
  assert.equal(app.salutationAppelFonds([paul, marc], 'marie'), 'Chers Messieurs,');
  assert.equal(app.salutationAppelFonds([lea, anne], 'concubin'), 'Chères Mesdames,');
  assert.equal(app.salutationAppelFonds([lea], ''), 'Chère Madame,');
  assert.equal(app.salutationAppelFonds([paul], ''), 'Cher Monsieur,');
  assert.equal(app.salutationAppelFonds([{ civilite: 'M', nom: 'DUPONT' }], 'marie'), 'Chers Monsieur et Madame,');
});

test('situation matrimoniale : saisie sur la fiche, sinon déduite d’Authentic pour un couple, jamais homme/femme', () => {
  const app = chargerApplication();
  assert.equal(app.SITUATIONS_CLIENT.map(x => x.cle).join(','), 'marie,pacse,concubin');
  const seul = { parties: [{ role: 'ACQUEREUR', nom: 'Léa MARTIN', civilite: 'Madame' }] };
  assert.equal(app.situationClientDossier(seul, 'acquereur'), '', 'une personne seule n’a pas de situation de couple');
  const couple = { parties: [{ role: 'ACQUEREUR', nom: 'DUPONT', situationMatrimoniale: { situation: 'Marié(e)' } }, { role: 'ACQUEREUR', nom: 'MARTIN' }] };
  assert.equal(app.situationClientDossier(couple, 'acquereur'), 'marie');
  assert.equal(app.situationClientDossier(Object.assign({ situationAcquereur: 'concubin' }, couple), 'acquereur'), 'concubin', 'la fiche l’emporte');
  assert.equal(app.situationClientDossier(Object.assign({ situationAcquereur: 'homme' }, couple), 'acquereur'), 'marie', 'ancienne valeur « homme » ignorée');
  const pacses = { parties: [{ role: 'VENDEUR', nom: 'A', situationMatrimoniale: { situation: 'Pacte civil de solidarité' } }, { role: 'VENDEUR', nom: 'B' }] };
  assert.equal(app.situationClientDossier(pacses, 'vendeur'), 'pacse');
  assert.equal(app.situationClientDossier({ parties: [{ role: 'ACQUEREUR', nom: 'X' }, { role: 'ACQUEREUR', nom: 'Y' }] }, 'acquereur'), '');
  assert.equal(app.civiliteDepuisTexte('Monsieur'), 'M');
  assert.equal(app.civiliteDepuisTexte('Mme'), 'Mme');
  assert.equal(app.civiliteDepuisTexte('Marie'), '', 'jamais un prénom');
});

test('situation : l’appel de fonds reprend la fiche (rôle en capitales, civilités saisies)', () => {
  const app = chargerApplication();
  const d = { id: 'x', nom: 'LEROY / DUPONT', situationAcquereur: 'pacse',
    parties: [{ role: 'VENDEUR', nom: 'LEROY' }, { role: 'ACQUEREUR', nom: 'Paul DUPONT' }, { role: 'ACQUEREUR', nom: 'Léa MARTIN' }, { role: 'ACQUEREUR', nom: '' }] };
  const p = app.prefillAppelFonds(d);
  assert.equal(p.situation, 'pacse');
  assert.equal(p.clients.map(c => `${c.civilite} ${c.nom}`).join('|'), 'M Paul DUPONT|Mme Léa MARTIN', 'sans civilité connue : Monsieur puis Madame, une personne sans nom écartée');
  assert.match(p.aCompleter.join(' '), /vérifiez qui est qui/);
  const deuxHommes = app.prefillAppelFonds(Object.assign({}, d, { parties: [{ role: 'ACQUEREUR', nom: 'Paul DUPONT', civilite: 'M' }, { role: 'ACQUEREUR', nom: 'Marc LEROY', civilite: 'M' }] }));
  assert.equal(app.lignesDestinatairesAppelFonds(deuxHommes.clients, deuxHommes.situation).join('|'), 'Monsieur Paul DUPONT et Monsieur Marc LEROY');
  assert.doesNotMatch(deuxHommes.aCompleter.join(' '), /qui est qui|Civilité/);
  const sansSituation = app.prefillAppelFonds(Object.assign({}, d, { situationAcquereur: undefined }));
  assert.match(sansSituation.aCompleter.join(' '), /Situation des acquéreurs/);
});

test('appel de fonds du confrère sur le NAS : « Projet VENTE confrère » d’abord, jamais le décompte de l’étude à la racine', () => {
  const app = chargerApplication();
  const f = (chemin) => ({ nom: chemin.split('/').pop(), chemin });
  const fichiers = [
    f('Decompte acquéreur DUPONT.pdf'),                                      // le nôtre, à la racine : jamais
    f('Convocation au rendez-vous contenant l\'appel de fonds - VTE - DUPONT.pdf'),
    f('5 - Comptabilité/Décompte acquéreur 2026.pdf'),
    f('Projet VENTE confrère/Projet acte de vente.pdf'),
    f('Projet VENTE confrère/Décompte Me FOURNIER.pdf'),
    f('Projet VENTE confrère/Annexes.docx'),
    f('5 - Comptabilité/Décompte remboursement prêt.pdf'),
    f('2 - Acquéreur/Pièce identité.pdf')
  ];
  const ordre = app.candidatsDecompteConfrereNas(fichiers, '5 - Comptabilité/Décompte acquéreur 2026.pdf').map(x => x.chemin).join(' | ');
  assert.strictEqual(ordre, 'Projet VENTE confrère/Décompte Me FOURNIER.pdf | Projet VENTE confrère/Projet acte de vente.pdf',
    'dossier du confrère : le décompte avant le reste ; le courrier rattaché (le nôtre) écarté');
  const sansRattache = app.candidatsDecompteConfrereNas(fichiers, '').map(x => x.chemin);
  assert.strictEqual(sansRattache[2], '5 - Comptabilité/Décompte acquéreur 2026.pdf', 'autre sous-dossier : seulement par le nom, après le dossier du confrère');
  assert.ok(!sansRattache.some(c => !/[\\/]/.test(c)), 'rien à la racine');
  assert.ok(app.candidatsDecompteConfrereNas([f('PROJET VTE CONFRERE/AF.pdf')], '').length === 1, 'dossier du confrère en capitales, sans accent');
  // Étude 06/10 : un PDF de la racine dont le NOM dit le confrère (« Décompte Me FOURNIER ») est bien son décompte — candidat en tête.
  const racineConfrere = app.candidatsDecompteConfrereNas([f('Décompte acquéreur.pdf'), f('Décompte Me FOURNIER.pdf'), f('5 - Comptabilité/Décompte 2026.pdf')], '').map(x => x.chemin);
  assert.strictEqual(racineConfrere.join(' | '), 'Décompte Me FOURNIER.pdf | 5 - Comptabilité/Décompte 2026.pdf');
});

test('frais d’acte estimés : assiette hors mobilier, taux plein arrondi à l’euro supérieur, jamais en participation', () => {
  const app = chargerApplication();
  const avec = app.fraisActeEstimesAppelFonds(200000, 5000, '41', 'house');
  const sans = app.fraisActeEstimesAppelFonds(195000, 0, '41', 'house');
  assert.strictEqual(avec.montant, sans.montant, 'le mobilier sort de l’assiette');
  assert.ok(avec.primo < avec.montant, 'un primo-accédant paie moins');
  assert.strictEqual(avec.montant, Math.ceil(avec.montant));
  assert.strictEqual(app.fraisActeEstimesAppelFonds(200000, 0, null, 'house'), null);
  assert.strictEqual(app.fraisActeEstimesAppelFonds(0, 0, '41', 'house'), null);
  const d = { id: 'p', nom: 'A / B', typeVente: 'maison', adresseBien: 'BLOIS (41000), 3 rue des Lices', prixVente: 200000, roleNotaire: 'participant', parties: [] };
  assert.strictEqual(app.prefillAppelFonds(d).fraisActe, null, 'en participation, le décompte vient du confrère');
});

test('pièces du NAS pour le décompte : le fichier de la checklist d’abord, sinon le plus récent par le nom', () => {
  const app = chargerApplication();
  const d = { nasDossier: 'VTE DUPONT', fichiersTrouves: {} };
  const fichiers = [{ nom: 'Taxe fonciere 2024.pdf', chemin: 'Comptabilité/Taxe fonciere 2024.pdf' }, { nom: 'TF 2025.pdf', chemin: 'TF 2025.pdf' }, { nom: 'Titre.pdf', chemin: 'Titre.pdf' }];
  const motif = /\bTF\b|taxes?\s+fonci[èe]\s?re/i;
  const r = app.fichierPieceNasAppelFonds(d, fichiers, 'avisTaxeFonciere', motif);
  assert.strictEqual(`${r.chemin}|${r.nom}`, 'VTE DUPONT/TF 2025.pdf|TF 2025.pdf');
  d.fichiersTrouves['piece::avisTaxeFonciere'] = 'VTE DUPONT/Comptabilité/Avis 2025.pdf';
  assert.strictEqual(app.fichierPieceNasAppelFonds(d, fichiers, 'avisTaxeFonciere', motif).nom, 'Avis 2025.pdf', 'fichier retrouvé par la checklist');
  assert.strictEqual(app.fichierPieceNasAppelFonds({ nasDossier: 'X' }, [{ nom: 'Titre.pdf', chemin: 'Titre.pdf' }], 'etatDate', /[ée]tat\s+dat[ée]/i), null);
});

test('afNettoyerLibelle : ni « à parfaire » ni tirets dans les lignes du courrier', () => {
  assert.strictEqual(app.afNettoyerLibelle("- Frais d'acte (à parfaire)"), "Frais d'acte");
  assert.strictEqual(app.afNettoyerLibelle('Frais divers - sauf à parfaire'), 'Frais divers');
  assert.strictEqual(app.afNettoyerLibelle('Provision sur frais à parfaire ou à diminuer :'), 'Provision sur frais');
  assert.strictEqual(app.afNettoyerLibelle('– Frais de garantie –'), 'Frais de garantie');
  assert.strictEqual(app.afNettoyerLibelle('Taxe - foncière'), 'Taxe - foncière');
  assert.strictEqual(app.afNettoyerLibelle('Prix de vente: '), 'Prix de vente');
});
