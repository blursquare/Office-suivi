'use strict';
// Compléter un dossier existant avec son compromis (étude, 03/10 : « Authentic crée le dossier, le compromis le
// complète ») : comparaison fiche / compromis, résolution (la fiche gagne sauf choix), application sur le dossier.
// Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const FICHE = {
  id: 'd1', nom: 'MARTEL / FOURNIER', typeVente: 'maison', responsable: 'Julie VASSELIN', roleNotaire: 'instrumentaire',
  adresseBien: 'VENDÔME (41100), 25 route de Tours', prixVente: 250000, emailAcquereur: 'luc.fournier@exemple.fr',
  notaireVendeur: 'Maître Sophie GOSSART (Blois)', coteInstrumentaire: 'vendeur',
  parties: [{ nom: 'MARTEL Paul', role: 'VENDEUR' }], bien: { adresse: { adresseComplete: 'VENDÔME (41100), 25 route de Tours' } },
  dateAvantContrat: '', pret: '', acte: '', ventebien: '', historique: []
};

test('comparaison fiche / compromis : vide, identique, différente, fusion des emails, rien lu', () => {
  const fiche = app.valeursFicheComplement(FICHE);
  assert.equal(fiche.prixVente, 250000);
  assert.equal(fiche.roleNotaire, 'instrumentaire');
  const lu = {
    nom: 'MARTEL / FOURNIER', typeVente: 'copropriete', signature: '2026-09-15', pret: '2026-11-15', acte: '2026-12-20', ventebien: '',
    adresseBien: 'Vendôme (41100), 25 route de tours', prixVente: 245000, prixMobilier: 5000,
    emailAcquereur: 'l.fournier@travail.fr', emailVendeur: '', nomAgence: '', depotGarantie: 12000, sequestreDepot: '',
    notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', notaireAcquereur: '', coteInstrumentaire: 'vendeur', roleNotaire: 'instrumentaire'
  };
  const c = app.comparaisonComplement(fiche, lu);
  const etat = (cle) => (c.find(x => x.cle === cle) || {}).etat;
  assert.equal(etat('nom'), 'identique');
  assert.equal(etat('adresseBien'), 'identique', 'adresse comparée normalisée');
  assert.equal(etat('notaireVendeur'), 'identique', 'casse de la ville ignorée');
  assert.equal(etat('typeVente'), 'different');
  assert.equal(etat('prixVente'), 'different');
  assert.equal(etat('pret'), 'lu-seul');
  assert.equal(etat('signature'), 'lu-seul');
  assert.equal(etat('emailAcquereur'), 'fusion');
  assert.equal(etat('coteInstrumentaire'), 'identique');
  assert.equal(etat('emailVendeur'), undefined, 'vide des deux côtés : pas de ligne');
  assert.equal(etat('ventebien'), undefined);
});

test('résolution : la fiche gagne par défaut, le compromis sur choix, les emails s’ajoutent', () => {
  const fiche = app.valeursFicheComplement(FICHE);
  const lu = Object.assign(fiche, {}) && { nom: 'MARTEL / FOURNIER', typeVente: 'copropriete', pret: '2026-11-15', prixVente: 245000, emailAcquereur: 'l.fournier@travail.fr', notaireVendeur: 'Maître Sophie GOSSART (Blois)', coteInstrumentaire: 'vendeur', roleNotaire: 'instrumentaire', adresseBien: 'VENDÔME (41100), 25 route de Tours' };
  const c = app.comparaisonComplement(app.valeursFicheComplement(FICHE), lu);
  const defaut = app.resolutionComplement(c, {});
  assert.equal(defaut.resolu.prixVente, 250000, 'fiche gardée sans choix');
  assert.equal(defaut.resolu.typeVente, 'maison');
  assert.equal(defaut.resolu.pret, '2026-11-15', 'fiche vide : valeur lue');
  assert.equal(defaut.resolu.emailAcquereur, 'luc.fournier@exemple.fr; l.fournier@travail.fr');
  assert.equal(defaut.changements.map(x => x.cle).join(), 'pret,emailAcquereur');
  const choisi = app.resolutionComplement(c, { prixVente: 'compromis', typeVente: 'compromis' });
  assert.equal(choisi.resolu.prixVente, 245000);
  assert.equal(choisi.resolu.typeVente, 'copropriete');
  assert.equal(choisi.changements.map(x => x.cle).sort().join(), 'emailAcquereur,pret,prixVente,typeVente');
});

test('application sur le dossier : échéances, engagements, parties gardées, rien d’écrasé hors choix', () => {
  const d = JSON.parse(JSON.stringify(FICHE));
  const c = app.comparaisonComplement(app.valeursFicheComplement(d), {
    nom: 'MARTEL / FOURNIER', typeVente: 'maison', signature: '2026-09-15', pret: '2026-11-15', acte: '2026-12-20', ventebien: '',
    adresseBien: 'VENDÔME (41100), 25 route de Tours', prixVente: 245000, prixMobilier: 5000, emailAcquereur: 'luc.fournier@exemple.fr',
    emailVendeur: '', nomAgence: 'Agence du Centre', depotGarantie: 12000, sequestreDepot: 'l’office', notaireVendeur: 'Maître Sophie GOSSART (Blois)',
    notaireAcquereur: '', coteInstrumentaire: 'vendeur', roleNotaire: 'instrumentaire'
  });
  const { resolu } = app.resolutionComplement(c, {});
  const textes = app.appliquerComplementSurDossier(d, resolu, {
    pages: { pret: 4, acte: 9, ventebien: null }, confiance: { pret: 'auto', acte: 'auto', ventebien: 'manuel' },
    autres: [{ label: 'Purge du droit de préemption', date: '2026-10-30', page: 6 }],
    analyse: { documents: [{ label: 'Attestation ramonage', cleChecklist: 'ramonage' }], engagements: [{ phrase: 'Le vendeur s’engage à faire ramoner la cheminée', type: 'entretien', page: 7 }] },
    piecesEngagements: ['ramonage'],
    instantane: { typeActe: { valeur: 'COMPROMIS_DE_VENTE', statut: 'CONFIRMED' }, parties: [{ nom: 'AUTRE', role: 'VENDEUR' }], notaires: { x: 1 }, bien: { y: 1 }, extraction: { z: 1 }, honoraires: { montant: 8000 }, fondsTravaux: null },
    notairesDetectes: [{ nom: 'Maître Sophie GOSSART (Blois)', role: 'instrumentaire' }],
    telephones: { acquereur: '06 12 34 56 78', vendeur: '' },
    compromisNomFichier: 'Compromis MARTEL.pdf', pdfNumPages: 24, sansPret: false, reminderDays: [15, 7]
  });
  assert.equal(d.pret, '2026-11-15');
  assert.equal(d.pretPage, 4);
  assert.equal(d.confiance.pret, 'auto');
  assert.equal(d.acte, '2026-12-20');
  assert.equal(d.sansPret, false);
  assert.deepEqual([...d.reminderDays], [15, 7]);
  assert.equal(d.dateAvantContrat, '2026-09-15');
  assert.equal(d.prixVente, 250000, 'prix de la fiche gardé (pas de choix)');
  assert.equal(d.prixMobilier, 5000);
  assert.equal(d.depotGarantie, 12000);
  assert.equal(d.nomAgence, 'Agence du Centre');
  assert.equal(d.parties.length, 1);
  assert.equal(d.parties[0].nom, 'MARTEL Paul', 'parties d’Authentic gardées');
  assert.equal(d.bien.y, undefined, 'bien de la fiche gardé');
  assert.equal(d.notaires.x, 1);
  assert.equal(d.extraction.z, 1);
  assert.equal(d.typeActe.valeur, 'COMPROMIS_DE_VENTE');
  assert.equal(d.honoraires.montant, 8000);
  assert.equal(d.autres.length, 1);
  assert.equal(d.analyseJuridique.engagements.length, 1);
  assert.equal(d.analyseJuridique.documents.length, 1);
  assert.equal(d.piecesEngagementsDetectees.join(), 'ramonage');
  assert.equal(d.telephoneAcquereur, '06 12 34 56 78');
  assert.equal(d.compromisNomFichier, 'Compromis MARTEL.pdf');
  assert.equal(d.pdfNumPages, 24);
  assert.ok(textes.includes('obtention du prêt'), textes.join(' | '));
  assert.ok(textes.includes('1 engagement du vendeur'), textes.join(' | '));
  // Une seconde application du même compromis n'ajoute rien en double.
  const encore = app.appliquerComplementSurDossier(d, resolu, {
    autres: [{ label: 'Purge du droit de préemption', date: '2026-10-30' }],
    analyse: { documents: [{ label: 'Attestation ramonage' }], engagements: [{ phrase: 'Le vendeur s’engage à faire ramoner la cheminée' }] },
    telephones: { acquereur: '0612345678' }
  });
  assert.equal(encore.length, 0, encore.join(' | '));
  assert.equal(d.autres.length, 1);
  assert.equal(d.analyseJuridique.engagements.length, 1);
});

test('achat sans prêt lu, fiche sans date de prêt : l’échéance est retirée ; une date de prêt sur la fiche la garde', () => {
  const d = { nom: 'A / B', pret: '', historique: [] };
  app.appliquerComplementSurDossier(d, { nom: 'A / B' }, { sansPret: true });
  assert.equal(d.sansPret, true);
  const d2 = { nom: 'A / B', pret: '2026-11-15', historique: [] };
  app.appliquerComplementSurDossier(d2, { nom: 'A / B', pret: '2026-11-15' }, { sansPret: true });
  assert.ok(!d2.sansPret);
});

test('texteValeurComplement : dates, montants, listes lisibles', () => {
  assert.equal(app.texteValeurComplement('pret', '2026-11-15'), '15 novembre 2026');
  assert.equal(app.texteValeurComplement('prixVente', 250000), app.formaterPrix(250000));
  assert.equal(app.texteValeurComplement('typeVente', 'copropriete'), 'Copropriété');
  assert.equal(app.texteValeurComplement('coteInstrumentaire', ''), '—');
});
