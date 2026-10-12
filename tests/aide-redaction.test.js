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

test('pièces de la mairie et d’Agglopolys (structure de vrais scans, texte d’OCR, noms inventés)', () => {
  const cu = R.lireCertificatUrbanisme('RÉPUBLIQUE FRANCAISE Dossier n° CU a 041 999 26 00012 Date de dépôt : 18 Septembre 2026 Demandeur : Maître X … Zone(s) et coefficient(s) d’occupation des sols : – Zone Ub2 … Fait le 22 Septembre 2026 Le Maire');
  assert.equal(cu.numero, 'CU a 041 999 26 00012');
  assert.equal(cu.date, '2026-09-22');
  assert.equal(cu.zone, 'Ub2');
  const ren = R.lireRenonciationPreemption('Le 22 septembre 2026 Mairie de Nulleville à Maître X OBJET : Droit de Préemption Urbain - DIA 41999 26 00032 Renonciation … au même prix que celui fixé dans la DIA jointe (en date du 15 Septembre 2026) … Considérant la déclaration d’intention d’aliéner présentée par Maître X, Notaire à BLOIS le 15/09/2026, reçue en mairie le 18/09/2026 DÉCIDE … date renonciation : 22//09/2026');
  assert.equal(ren.numero, '41999 26 00032');
  assert.equal(ren.dateDia, '2026-09-15');
  assert.equal(ren.receptionMairie, '2026-09-18');
  assert.equal(ren.dateRenonciation, '2026-09-22');
  const per = R.lireCertificatPeril('RÉPUBLIQUE FRANÇAISE Le 23 septembre 2026 Monsieur le Maire à Maître X … Je vous informe qu’aucun arrêté n’a été pris pour les situations évoquées ci-dessus.');
  assert.equal(per.date, '2026-09-23');
  assert.match(per.conclusion, /Aucun arrêté/);
  const ass = R.lireCourrierAssainissement('Étude de Maître X Blois, le 23 septembre 2026 Maître, L’immeuble sis 1 rue Y est situé en zone d’assainissement collectif. La rue est desservie par un réseau de type séparatif');
  assert.equal(ass.date, '2026-09-23');
  assert.equal(ass.conclusion, 'Zone d’assainissement collectif, réseau séparatif');
  const erp = R.lireEtatRisques('État des Risques et Pollutions (ERP) INFORMATIONS GÉNÉRALES : Date d\'édition : 07/09/2026 Valide jusqu\'au : 07/03/2027 … Risques sur parcelle(s) : Argiles Sismicité max : Zone 1 Radon max : Niveau 1');
  assert.equal(erp.date, '2026-09-07');
  assert.equal(erp.risques, 'Argiles, sismicité zone 1, radon niveau 1');
  assert.equal(R.dateFrVersIso('1er octobre 2026'), '2026-10-01');
});

test('valeurs de l’acte depuis les pièces lues (DPU : DIA, réception, renonciation)', () => {
  const d = { id: 'r2', nom: 'X', typeVente: 'maison' };
  const v = app.valeursActeDossier(d, { pieces: {
    renonciation: { chemin: 'a.pdf', libelle: 'Renonciation', numero: '41999 26 00032', dateDia: '2026-09-15', receptionMairie: '2026-09-18', dateRenonciation: '2026-09-22' },
    cu: { chemin: 'b.pdf', libelle: 'CU', numero: 'CU a 041 999 26 00012', date: '2026-09-22', zone: 'Ub2' },
    erp: { chemin: 'c.pdf', libelle: 'ERP', erreur: true } } });
  assert.equal(v.dia_envoi_date.valeur, '15 septembre 2026');
  assert.equal(v.dia_presentation_date.valeur, '18 septembre 2026');
  assert.equal(v.dia_renonciation_date.valeur, '22 septembre 2026');
  assert.equal(v.cu_numero.valeur, 'CU a 041 999 26 00012');
  assert.equal(v.cu_date.chemin, 'b.pdf');
  assert.equal(v.erp_date, undefined, 'une pièce illisible ne donne rien');
});

test('relecture 0.218.0 : jamais un champ par position quand la trame a changé, jamais une clause sur un seul mot', () => {
  assert.equal(champs('HONORAIRES D\'AGENCE\nnégociée par l\'agence ---, carte professionnelle n°---, honoraires de --- à la charge de ---'), ',,,', 'quatre blancs, trois champs attendus : l’IA décide');
  assert.equal(R.clauseDuPassage('PLOMB - Le constat a été établi le --- par la société ---, en même temps que le repérage amiante').cle, 'plomb');
  assert.equal(R.clauseDuPassage('Termites - L’état a été établi le --- par ---, comme le repérage amiante').cle, 'termites');
  assert.equal(R.clauseDuPassage('Etat de l\'installation intérieure d\'électricité et de l\'installation intérieure de gaz ---').cle, 'electricite', 'l’intitulé en tête l’emporte');
  assert.equal(R.clauseDuPassage('Il est ici rappelé aux parties que le diagnostiqueur a examiné l’installation intérieure de gaz et l’installation intérieure d’électricité de l’immeuble ---'), null, 'deux clauses citées au même rang : rien');
  assert.equal(R.trousDuPassage('--- Option 2\n--- le cas échéant\nLe ---').length, 1);
});

test('relecture 0.218.0 : étiquette énergie du DPE = la pire des deux lettres', () => {
  const l = R.lireDossierDiagnostic(['Diagnostic de performance énergétique (logement) Etabli le : 05/04/2026 Surface de référence : 100,00 m² énergie totale pour les usages recensés : 20 000 kWh Ce logement émet 6 000 kg de CO ₂ par an']);
  assert.equal(l.dpe.classeGes, 'E');
  assert.equal(l.dpe.classeEnergie, 'E', '200 kWh/m² (D) et 60 kg/m² (E) : étiquette E');
  const sommaire = R.lireDossierDiagnostic(['Sommaire Constat de repérage amiante État de l’installation intérieure d’électricité Diagnostic de performance énergétique Date de visite : 01/01/2026']);
  assert.equal(Object.keys(sommaire.diagnostics).length, 0, 'une page de sommaire ne désigne aucun diagnostic');
});
