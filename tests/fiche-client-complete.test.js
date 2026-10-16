'use strict';
// Fiche client d'Authentic reprise en entier (étude 16/10) : capacité, coordonnées commentées, mariage, contrats, historique des relations.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app.js');

const ID = 'ui-ficho-tabs:mainTabPanel:tabForm99:tabContent:';
const capture = {
  champs: [
    { libelle: ID + 'tabView:ficheClientPhysiqueIdentite:etude_input', valeur: 'oui' },
    { libelle: ID + 'tabView:ficheClientPhysiqueIdentite:civilite:selectOneRadio', valeur: 'Monsieur' },
    { libelle: 'Nom de famille*', valeur: 'Martel' },
    { libelle: 'Prénom*', valeur: 'Paul' },
    { libelle: 'Autre(s) Prénom(s)', valeur: 'Jean Louis Marie' },
    { libelle: 'Alias pour l\'acte', valeur: '' },
    { libelle: ID + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: '02/03/1970' },
    { libelle: 'CP, Ville (naissance)', valeur: '37000 TOURS' },
    { libelle: 'Pays (naissance)', valeur: 'France' },
    { libelle: 'Nationalité', valeur: 'Française' },
    { libelle: 'Capacité', valeur: '' },
    { libelle: ID + 'tabView:ficheClientPhysiqueIdentite:capacite:selectonemenu_input', valeur: 'Majeur' },
    { libelle: ID + 'tabView:ficheClientPhysiqueIdentite:mandat:selectonemenu_input', valeur: 'Non' },
    { libelle: 'Profession', valeur: 'Chef de projet' },
    { libelle: 'N° de voie', valeur: '8' },
    { libelle: 'Type de voie', valeur: 'rue' },
    { libelle: 'Nom de la voie', valeur: 'Lilas' },
    { libelle: 'CP - Ville', valeur: '41000 BLOIS' },
    { libelle: 'Pays', valeur: 'France' },
    { libelle: 'Adresse d\'imposition', valeur: '' },
    { libelle: 'Adresse de correspondance', valeur: 'oui' },
    { libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW99:Portable:inputTelephone', valeur: '06 12 34 56 78' },
    { libelle: 'Commentaire', valeur: 'le soir' },
    { libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW99:Telephone:inputTelephone', valeur: '' },
    { libelle: 'Commentaire', valeur: '' },
    { libelle: 'Email', valeur: 'paul.martel@exemple.fr' },
    { libelle: 'Commentaire', valeur: '' },
    { libelle: 'Commentaire général', valeur: '' },
    { libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneeSecondaireW99:Portable:inputTelephone', valeur: '06 98 76 54 32' },
    { libelle: 'Commentaire', valeur: '' },
    { libelle: 'Date de mariage', valeur: '12/06/2010' },
    { libelle: 'Pays', valeur: 'France' },
    { libelle: 'CP, Ville', valeur: '41000 BLOIS' },
    { libelle: ID + 'tabView:ficheClientDetailRelation:somInfoMariageUniquesNocesId:selectonemenu_input', valeur: 'Oui' },
    { libelle: ID + 'tabView:ficheClientDetailRelation:somInfoDivorceEnCoursId:selectonemenu_input', valeur: 'Non' },
    { libelle: ID + 'tabView:ficheClientDetailRelation:separeDeCorps_input', valeur: 'non' },
    { libelle: ID + 'tabView:ficheClientDetailRelation:somContratTypeId:selectonemenu_input', valeur: 'Sans' },
    { libelle: ID + 'tabView:ficheClientDetailRelation:somContratRegimeId:selectonemenu_input', valeur: 'Communauté légale nouvelle' },
    { libelle: 'Date de l\'ancien contrat', valeur: '' },
    { libelle: 'Notaire', valeur: '' },
    { libelle: 'CP, Ville', valeur: '' },
    { libelle: 'Situation dans l’acte', valeur: 'Marié à Madame Léa MOREAU sous le régime de la communauté' }
  ],
  tableaux: [{ titre: 'Historique des relations', entete: ['Situation', 'Date', 'Conjoint', ''], lignes: [['Marié(e)', '12/06/2010', 'Mme Léa MOREAU', 'à BLOIS']] }],
  texte: ''
};

test('fiche client d’Authentic : tout le contenu est lu et retenu', () => {
  const app = chargerApplication();
  const p = app.clientDepuisFicheAuthentic(capture);
  const x = p.complement;
  assert.strictEqual(x.clientEtude, true);
  assert.strictEqual(x.capacite, 'Majeur');
  assert.strictEqual(x.mandatProtection, 'Non');
  assert.strictEqual(x.paysDomicile, 'France');
  assert.strictEqual(x.adresseCorrespondance, true);
  assert.strictEqual(x.adresseImposition, false);
  assert.strictEqual(x.coordonnees.map(c => `${c.bloc}/${c.type}/${c.valeur}/${c.commentaire}`).join(' ; '),
    'principales/Portable/06 12 34 56 78/le soir ; principales/Email/paul.martel@exemple.fr/ ; secondaires/Portable/06 98 76 54 32/');
  assert.strictEqual(x.mariage.date, '2010-06-12');
  assert.strictEqual(x.mariage.lieu, '41000 BLOIS');
  assert.strictEqual(x.mariage.pays, 'France');
  assert.strictEqual(x.mariage.uniquesNoces, 'Oui');
  assert.strictEqual(x.mariage.regime, 'Communauté légale nouvelle');
  assert.strictEqual(x.mariage.notaireAncienContrat, '');
  assert.match(x.mariage.situationActe, /communauté/);
  assert.strictEqual(x.historique.length, 1);
  assert.strictEqual(x.historique[0].conjoint, 'Mme Léa MOREAU');
  assert.strictEqual(x.historique[0].detail, '', 'colonne sans titre (icônes) écartée');
  const d = { id: 'd1', authentic: {} };
  assert.ok(app.retenirFicheClientAuthentic(d, p, '2026-10-16T10:00:00Z'));
  const fiche = Object.values(d.authentic.fichesClients)[0];
  assert.strictEqual(fiche.complement.mariage.regime, 'Communauté légale nouvelle');
  const html = app.renderComplementFicheCb({ complement: fiche.complement, autresPrenoms: fiche.autresPrenoms, paysNaissance: fiche.paysNaissance });
  for (const t of ['Capacité', 'Majeur', 'Coordonnées secondaires', 'le soir', 'Mariage en uniques noces', 'Historique des relations', 'Mme Léa MOREAU', 'Jean Louis Marie', '06 12 34 56 78', 'adresse de correspondance']) {
    assert.ok(html.includes(t), t);
  }
});

test('fiche client sans renseignement en plus : rien de plus', () => {
  const app = chargerApplication();
  assert.strictEqual(app.complementFicheClientAuthentic({ champs: [{ libelle: 'Nom de famille*', valeur: 'Martel' }] }), null);
});

test('fiche client : un champ absent n’est pas pris dans la rubrique suivante ; listes à « Non » sans mariage', () => {
  const app = chargerApplication();
  const x = app.complementFicheClientAuthentic({ champs: [
    { libelle: 'CP - Ville', valeur: '41000 BLOIS' }, { libelle: 'Adresse d\'imposition', valeur: '' }, { libelle: 'Adresse de correspondance', valeur: 'oui' },
    { libelle: 'Email', valeur: 'a@exemple.fr' }, { libelle: 'Commentaire', valeur: '' },
    { libelle: 'Date de mariage', valeur: '' }, { libelle: 'Pays', valeur: 'Belgique' },
    { libelle: 'ui:x:somInfoDivorceEnCoursId:selectonemenu_input', valeur: 'Non' }
  ] });
  assert.strictEqual(x.paysDomicile, '');
  assert.strictEqual(x.mariage, null);
});
