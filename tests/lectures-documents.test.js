'use strict';
// Lectures automatiques de documents (étude 28/10) : acte de naissance (répertoire civil), EHF, PV d'AG. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('sorte d’un document par son nom', () => {
  assert.equal(app.sorteDocumentALire('Acte de naissance EXEMPLE.pdf', false), 'naissance');
  assert.equal(app.sorteDocumentALire('Fiche date de naissance.pdf', false), '');
  assert.equal(app.sorteDocumentALire('EHF 2026.pdf', false), 'ehf');
  assert.equal(app.sorteDocumentALire('Etat hypothecaire hors formalite.pdf', false), 'ehf');
  assert.equal(app.sorteDocumentALire('PV AG 12-03-2025.pdf', true), 'pv-ag');
  assert.equal(app.sorteDocumentALire('Procès-verbal assemblée générale 2025.pdf', true), 'pv-ag');
  assert.equal(app.sorteDocumentALire('PV AG 12-03-2025.pdf', false), '', 'pas une copropriété');
  assert.equal(app.sorteDocumentALire('Acte de naissance.docx', false), '', 'PDF seulement');
});

test('acte de naissance : mention au répertoire civil et sa nature ; jamais un RCS', () => {
  const r = app.mentionsRepertoireCivil('EXTRAIT D\'ACTE DE NAISSANCE … Mentions marginales : Placé sous curatelle renforcée par jugement du 3 mai 2020. RC n° 2020-1234 Blois.');
  assert.equal(r.acteNaissance, true);
  assert.equal(r.mentions.length, 1);
  assert.equal(r.mentions[0].nature, 'curatelle');
  assert.equal(app.mentionsRepertoireCivil('Copie intégrale d\'acte de naissance. Mentions marginales : Néant. Société inscrite au RCS Blois.').mentions.length, 0);
  assert.equal(app.mentionsRepertoireCivil('Acte de naissance. Mention : inscrit au répertoire civil annexe, changement de régime matrimonial.').mentions[0].nature, 'changement de régime matrimonial');
});

test('PV d’AG : seules les résolutions de travaux ADOPTÉES', () => {
  const pv = 'PROCÈS-VERBAL DE L\'ASSEMBLÉE GÉNÉRALE ordinaire du 12/03/2025. Résolution n° 6 : approbation des comptes. Cette résolution est adoptée. '
    + 'Résolution n° 7 : travaux de ravalement de façade pour un budget de 45 000,00 €. Cette résolution est adoptée à la majorité de l\'article 25. '
    + 'Résolution n° 8 : travaux de remplacement de l\'ascenseur. Cette résolution est rejetée. Résolution n° 9 : travaux de toiture. Cette résolution n\'est pas adoptée.';
  const r = app.travauxVotesPv(pv);
  assert.equal(r.date, '2025-03-12');
  assert.equal(r.resolutions.length, 1);
  assert.equal(r.resolutions[0].numero, '7');
  assert.match(r.resolutions[0].montant, /45 000,00 €/);
  assert.match(app.messageLectureDocument('pv-ag', 'PV AG.pdf', r), /travaux votés — résolution 7/);
  assert.match(app.messageLectureDocument('pv-ag', 'PV AG.pdf', { lu: true, date: '', resolutions: [] }), /aucune résolution de travaux adoptée/);
});

test('messages : jamais « aucune mention » sur un document non lu', () => {
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', null), /pas pu le lire/);
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', { lu: true, mentions: [], ocr: true }), /aucune mention.*reconnaissance de caractères/);
  assert.match(app.messageLectureDocument('ehf', 'e.pdf', { etat: { anf: false } }), /pas un état-réponse/);
});
