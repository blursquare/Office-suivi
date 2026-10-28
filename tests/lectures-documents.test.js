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
  assert.match(app.messageLectureDocument('pv-ag', 'PV AG.pdf', { lu: true, date: '', resolutions: [], decoupe: true }), /aucune résolution de travaux adoptée/);
});

test('messages : jamais « aucune mention » sur un document non lu', () => {
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', null), /pas pu le lire/);
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', { lu: true, acteNaissance: true, mentions: [], ocr: true }), /aucune mention.*reconnaissance de caractères/);
  assert.match(app.messageLectureDocument('ehf', 'e.pdf', { etat: { anf: false } }), /pas un état-réponse/);
});

test('audit 0.391.0 : jamais « rien trouvé » sur un autre document ou une lecture partielle', () => {
  assert.equal(app.sorteDocumentALire('Demande acte de naissance EXEMPLE.pdf', false), '', 'une demande n’est pas l’acte');
  assert.equal(app.sorteDocumentALire('Requisition EHF.pdf', false), '');
  assert.equal(app.sorteDocumentALire('PV de bornage.pdf', true), '', 'bornage n’est pas une AG');
  assert.equal(app.sorteDocumentALire('PV livraison garage.pdf', true), '');
  assert.equal(app.sorteDocumentALire('PV AGO 2025.pdf', true), 'pv-ag');
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', { lu: true, acteNaissance: false, mentions: [] }), /n’y reconnais pas un acte de naissance/);
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', { lu: true, acteNaissance: true, mentions: [], partiel: '6 pages lues sur 9' }), /lecture partielle/);
  assert.match(app.messageLectureDocument('pv-ag', 'p.pdf', { lu: true, resolutions: [], decoupe: true, partiel: '6 pages lues sur 20' }), /lecture partielle.*à relire/);
  assert.match(app.messageLectureDocument('pv-ag', 'p.pdf', { lu: true, resolutions: [], decoupe: false }), /n’y reconnais pas les résolutions/);
  // Mention : la nature et la référence seulement, jamais l'identité autour.
  const r = app.mentionsRepertoireCivil('Acte de naissance de Paul EXEMPLE né le 1er janvier 1950. Mention : placé sous tutelle. RC n° 2021-77 Tours.');
  assert.equal(r.mentions[0].nature, 'tutelle');
  assert.doesNotMatch(app.messageLectureDocument('naissance', 'a.pdf', Object.assign({ lu: true }, r)), /EXEMPLE/);
  assert.equal(app.mentionsRepertoireCivil('Acte de naissance. En l’absence de mention. RC n° 1 Blois').mentions[0].nature, 'mesure ou mention à lire');
});

test('audit 0.391.0 : PV d’AG — fonds de travaux, passerelle de l’article 25-1, numérotation « 5ème résolution »', () => {
  const pv = 'Assemblée générale du 02/04/2025. 4ème résolution : cotisation annuelle au fonds de travaux. Cette résolution est adoptée. '
    + '5ème résolution : travaux de réfection de la toiture, budget 30 000 €. La résolution n’est pas adoptée à la majorité de l’article 25. '
    + 'Second vote à la majorité de l’article 24 : la résolution est adoptée. 6ème résolution : honoraires du syndic sur travaux. Cette résolution est adoptée.';
  const r = app.travauxVotesPv(pv);
  assert.equal(r.resolutions.length, 1);
  assert.equal(r.resolutions[0].numero, '5');
  assert.equal(r.decoupe, true);
});

test('audit 0.391.0 : une réservation « en cours » restée en plan est reprise après 15 min', () => {
  const t = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(app.lectureDocumentALancer(null, t), true);
  assert.equal(app.lectureDocumentALancer({ enCours: true, le: '2026-10-28T11:55:00Z' }, t), false);
  assert.equal(app.lectureDocumentALancer({ enCours: true, le: '2026-10-28T11:40:00Z' }, t), true);
  assert.equal(app.lectureDocumentALancer({ lu: true, le: '2026-10-01T00:00:00Z' }, t), false);
});
