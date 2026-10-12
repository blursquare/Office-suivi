'use strict';

// Aide à la rédaction de l'acte (étude 12/10, commun/redaction.js, client/64-aide-redaction.js) : passages reprenant la structure
// de la trame d'Authentic de l'étude, rapport de diagnostic reprenant la structure d'un rapport LICIEL — noms, adresses et numéros
// INVENTÉS.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../commun/redaction.js');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const champs = (texte, noms) => R.champsDuPassage(texte, noms).trous.map(t => t.champ).join(',');

test('les blancs « --- » de la trame, jamais une ligne de consigne', () => {
  assert.equal(R.trousDuPassage('--- OPTION 1 (version)\nLe ---\n--- A SUPPRIMER LE CAS ECHEANT\nnuméro ---, délivré le ---').length, 3);
});

test('clauses de la trame reconnues et champ de chaque blanc', () => {
  assert.equal(champs('CERTIFICAT D\'URBANISME\nUn certificat d\'urbanisme numéro ---, délivré le ---, au titre de l\'article L.410-1 a)'), 'cu_numero,cu_date');
  assert.equal(champs('Etat de l\'installation intérieure de gaz - Cet état a été établi, le ---, par la société ---, répondant aux conditions. De cet état, il résulte les éléments suivants : ---.'), 'gaz_date,diag_societe,gaz_conclusion');
  assert.equal(champs('Déclaration d\'origine des deniers - L\'acquéreur déclare … d\'un prêt d\'un montant de --- euros consenti par ---. … offre en date du --- acceptée par lui le ---.'), 'pret_montant,pret_banque,pret_offre_date,pret_acceptation_date');
  assert.equal(champs('Les parties déclarent que la présente vente a été précédée d\'une promesse de vente reçue elle-même en la forme authentique par Maître ---, notaire à ---, le ---, et régulièrement notifiée à l\'acquéreur au sens de l\'article L.271-1 … le --- par lettre recommandée'), 'avant_contrat_notaire,avant_contrat_notaire_ville,avant_contrat_date,avant_contrat_notification_date');
  assert.equal(champs('L\'AN DEUX MILLE VINGT-SIX\nLe ---\nMaître Sophie GOSSART'), 'date_signature');
  assert.equal(champs('TRANSMISSION PAR COURRIER ELECTRONIQUE … aux adresses suivantes :\nMonsieur Paul MOREL : ---\nMadame Lina ROCHE : ---', { vendeurs: ['MOREL'], acquereurs: ['ROCHE'] }), 'email_vendeur,email_acquereur');
  assert.equal(R.clauseDuPassage('Texte sans rapport ---'), null);
});

test('nombres, montants et dates en lettres (forme des actes)', () => {
  assert.equal(R.nombreEnLettres(175000), 'cent soixante-quinze mille');
  assert.equal(R.nombreEnLettres(280), 'deux cent quatre-vingts');
  assert.equal(R.nombreEnLettres(1200071), 'un million deux cents mille soixante et onze'.replace('deux cents mille', 'deux cent mille'));
  assert.equal(R.montantEnLettresActe(175000), 'CENT SOIXANTE-QUINZE MILLE EUROS (175.000,00 €)'.replace(' ', R.montantEnLettresActe(1).includes(' ') ? ' ' : ' '));
  assert.equal(R.montantEnLettresActe(12195.92).split(' (')[0], 'DOUZE MILLE CENT QUATRE-VINGT-QUINZE EUROS ET QUATRE-VINGT-DOUZE CENTIMES');
  assert.equal(R.dateActe('2026-09-07'), '07 septembre 2026');
  assert.equal(R.dateActe('18/05/2026'), '18 mai 2026');
  assert.equal(R.jourMoisEnLettres('2026-05-18'), 'DIX-HUIT MAI');
  assert.equal(R.jourMoisEnLettres('2026-10-01'), 'PREMIER OCTOBRE');
});

test('rapport de diagnostic : société, diagnostiqueur, dates, conclusions et classes du DPE', () => {
  const pages = [
    'SARL DIAG - EXPERT | 12 rue des Lilas 41000 BLOIS | Tél. : 02.00.00.00.00 Résumé de l’expertise n° 09 - 11111X Prestations Conclusion Amiante Dans le cadre de la mission, il n\'a pas été repéré de matériaux et produits susceptibles de contenir de l\'amiante. Électricité L\'installation intérieure d\'électricité ne comporte aucune anomalie. DPE Numéro enregistrement DPE (ADEME) : 2641E9999999Z',
    'Constat de repérage Amiante n° 09 - 11111X SARL DIAG - EXPERT Rapport du : 03/04/2026 Rapport de mission de repérage des matériaux et produits contenant de l\'amiante Raison sociale de l\'entreprise : SARL DIAG - EXPERT (Numéro SIRET : 000 000 000 00000)',
    'Etat de l’ Installation Intérieure d’Electricité n° 09 - 11111X Rapport du : 04/04/2026 Etat de l’Installation Intérieure d’Electricité',
    'Diagnostic de performance énergétique (logement) Etabli le : 05/04/2026 Valable jusqu’au : 04/04/2036 Surface de référence : 100,00 m² Diagnostiqueur : DURAND Léo Email : x N° de certification : AB12 - 0034 Organisme de certification : CERTIFEX énergie totale pour les usages recensés : 30 000 kWh (15 000 kWh é.f.) Ce logement émet 1 200 kg de CO ₂ par an'
  ];
  const l = R.lireDossierDiagnostic(pages);
  assert.equal(l.societe, 'SARL DIAG-EXPERT');
  assert.equal(l.operateur, 'DURAND Léo');
  assert.equal(l.certification, 'AB12-0034');
  assert.equal(l.diagnostics.amiante.date, '03/04/2026');
  assert.equal(l.diagnostics.electricite.date, '04/04/2026');
  assert.match(l.diagnostics.electricite.conclusion, /ne comporte aucune anomalie/);
  assert.equal(l.diagnostics.dpe.date, '05/04/2026');
  assert.equal(l.dpe.numero, '2641E9999999Z');
  assert.equal(l.dpe.classeEnergie, 'E'); // 300 kWh/m²
  assert.equal(l.dpe.classeGes, 'C'); // 12 kg/m²
});

test('valeurs de l’acte d’un dossier : fiche et rapport lu, inconnues absentes', () => {
  const d = { id: 'r1', nom: 'MOREL / ROCHE', typeVente: 'maison', prixVente: 175000, rendezVousSignature: '2026-11-03', dateAvantContrat: '2026-07-01',
    adresseBien: 'CELLETTES (41120), 2 Bis route de la Forêt', emailVendeur: 'vendeur@exemple.fr', honoraires: { montantTTC: 6000, charge: 'ACQUEREUR' }, nomAgence: 'Agence du Parc' };
  const v = app.valeursActeDossier(d, { chemin: 'VTE MOREL/DDT.pdf', ddt: { societe: 'SARL DIAG-EXPERT', operateur: '', certification: '', organisme: '', diagnostics: { electricite: { date: '04/04/2026', page: 3, conclusion: 'Aucune anomalie.' } }, dpe: null } });
  assert.equal(v.date_signature.valeur, 'TROIS NOVEMBRE');
  assert.equal(v.avant_contrat_date.valeur, '01 juillet 2026');
  assert.match(v.prix_lettres.valeur, /^CENT SOIXANTE-QUINZE MILLE EUROS/);
  assert.equal(v.commune.valeur, 'CELLETTES');
  assert.equal(v.numero_voie.valeur, '2 Bis');
  assert.equal(v.electricite_date.valeur, '04 avril 2026');
  assert.equal(v.electricite_date.chemin, 'VTE MOREL/DDT.pdf');
  assert.equal(v.honoraires_debiteur.valeur, 'l’acquéreur');
  assert.equal(v.cu_date, undefined);
});
