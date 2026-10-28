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
  assert.match(app.messageLectureDocument('pv-ag', 'PV AG.pdf', { lu: true, date: '', resolutions: [], decoupe: true }), /aucune résolution adoptée qui parle de travaux/);
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

test('relecture 0.391.1 : travaux sans le mot « travaux » en tête, honoraires cités plus loin', () => {
  const pv = 'Résolution n° 3 : ravalement de la façade sur rue, devis de l’entreprise retenue pour 52 000 €. Cette résolution est adoptée. '
    + 'Résolution n° 4 : travaux d’étanchéité de la terrasse et honoraires du syndic afférents. Cette résolution est adoptée. '
    + 'Résolution n° 5 : honoraires du syndic pour le suivi des travaux. Cette résolution est adoptée.';
  const r = app.travauxVotesPv(pv);
  assert.equal(r.resolutions.map(x => x.numero).join(','), '3,4');
});

test('acte de naissance : mentions marginales (mariage, divorce, PACS, décès…) avec leur date, jamais un nom', () => {
  const t = 'COPIE INTÉGRALE D\'ACTE DE NAISSANCE. Le 2 mars 1960 est né Paul EXEMPLE, fils de Jean EXEMPLE et de Marie ESSAI, son épouse, mariés. '
    + 'MENTIONS MARGINALES : Marié le 14/06/1985 à Blois avec Anne TEST. Divorcé de Anne TEST par jugement du 3 mai 1999. '
    + 'Pacte civil de solidarité enregistré le 10/01/2010. Dissolution du pacte le 2 février 2015.';
  const m = app.mentionsMarginalesNaissance(t);
  assert.equal(m.rubrique, true);
  assert.equal(m.mentions.map((x) => `${x.nature}:${x.date}`).join('|'), 'mariage:1985-06-14|divorce:1999-05-03|PACS:2010-01-10|dissolution du PACS:2015-02-02');
  const msg = app.messageLectureDocument('naissance', 'Acte de naissance.pdf', { lu: true, acteNaissance: true, mentions: [], marginales: m });
  assert.match(msg, /mentions marginales — mariage le 14 juin 1985, divorce le 3 mai 1999/);
  assert.doesNotMatch(msg, /EXEMPLE|TEST|Blois/, 'ni nom ni lieu dans le message');
  // « son épouse, mariés » dans le corps (les parents) n'est pas une mention ; « Néant » = aucune.
  const n = app.mentionsMarginalesNaissance('Acte de naissance de Paul EXEMPLE, fils de Jean et de Marie, son épouse. Mentions marginales : Néant.');
  assert.equal(n.neant, true);
  assert.equal(n.mentions.length, 0);
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', { lu: true, acteNaissance: true, mentions: [], marginales: n }), /« néant »/);
  assert.equal(app.mentionsMarginalesNaissance('Acte de naissance. Mentions : Décédé le 1er avril 2020 à Tours.').mentions[0].nature, 'décès');
  // Sans rubrique : seules les mentions FORTES sont cherchées (le corps parle des parents), et c'est dit « à vérifier ».
  const s2 = app.mentionsMarginalesNaissance('Extrait d\'acte de naissance. Divorcée par jugement du 2 mai 2001. ');
  assert.equal(s2.rubrique, false);
  assert.equal(s2.mentions[0].nature, 'divorce');
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', { lu: true, acteNaissance: true, mentions: [], marginales: s2 }), /rubrique des mentions non reconnue/);
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', { lu: true, acteNaissance: true, mentions: [], marginales: app.mentionsMarginalesNaissance('Acte de naissance. née Anne Marie le 2 mars 1960.') }), /pas trouvé la rubrique/);
});

test('relecture 0.393.0 : abréviations, « Marie », rubrique au bon endroit, date de la bonne mention, alerte seulement pour ce qui change la situation', () => {
  const ab = app.mentionsMarginalesNaissance('Acte de naissance. Mentions marginales : Mar. le 14/06/1985 à Blois avec Anne T. Div. par jugt du 3/05/1999.');
  assert.equal(ab.mentions.map((x) => `${x.nature}:${x.date}`).join('|'), 'mariage:1985-06-14|divorce:1999-05-03');
  const inconnues = app.mentionsMarginalesNaissance('Acte de naissance. Mentions marginales : RCA 2001 jgt TGI Blois réf 1234 transcription illisible voir original.');
  assert.equal(inconnues.nonReconnues, true);
  assert.equal(app.alerteActeNaissance({ mentions: [], marginales: inconnues }), true);
  assert.match(app.messageLectureDocument('naissance', 'a.pdf', { lu: true, acteNaissance: true, mentions: [], marginales: inconnues }), /je ne les reconnais pas/);
  assert.equal(app.mentionsMarginalesNaissance('Acte de naissance. Mentions marginales : - Néant -').neant, true);
  const corps = app.mentionsMarginalesNaissance('Copie intégrale avec mentions marginales. Fils de Jean et de Marie à Blois, son épouse. Mentions marginales : Néant.');
  assert.equal(corps.neant, true, 'la dernière rubrique « : » fait foi');
  assert.equal(corps.mentions.length, 0);
  const marie = app.mentionsMarginalesNaissance('Acte de naissance. Mentions marginales : Mariée le 1/02/1990 à Blois avec Jean MARIE à Tours.');
  assert.equal(marie.mentions.map((x) => x.nature).join('|'), 'mariage', '« MARIE » n’est pas une mention');
  const deux = app.mentionsMarginalesNaissance('Acte de naissance. Mentions marginales : Divorcé de Anne T. Marié le 20/09/2005 à Tours.');
  assert.equal(deux.mentions.map((x) => `${x.nature}:${x.date}`).join('|'), 'divorce:|mariage:2005-09-20');
  const conj = app.mentionsMarginalesNaissance('Acte de naissance. Mentions marginales : Mariée avec Paul X, né le 3/03/1955, le 14/06/1985 à Blois.');
  assert.equal(conj.mentions[0].date, '1985-06-14', 'jamais la date de naissance du conjoint');
  const pacs = app.mentionsMarginalesNaissance('Acte de naissance. Mentions marginales : Pacte civil de solidarité enregistré le 10/01/2010, dissous le 2/02/2015.');
  assert.equal(pacs.mentions.map((x) => x.nature).join('|'), 'dissolution du PACS');
  assert.equal(app.alerteActeNaissance({ mentions: [], marginales: app.mentionsMarginalesNaissance('Acte. Mentions marginales : Marié le 14/06/1985 à Blois.') }), false, 'un mariage seul : pas de pastille');
  assert.equal(app.alerteActeNaissance({ mentions: [], marginales: deux }), true);
  // L'état relu décide : une ancienne lecture EHF du NAS ne garde pas l'alerte après une mainlevée.
  assert.equal(app.alertesLecturesFiche({ etatHypothecaire: { inscriptions: [], lecture: { complete: true } }, lecturesDocuments: { e: { sorte: 'ehf', alerte: true, resume: 'x' } } }).length, 0);
});

test('fiche : seulement les ALERTES des lectures (rien quand tout va bien) ; état-réponse du retour SPF, jamais la demande ni les annexes', () => {
  assert.equal(app.alertesLecturesFiche({ lecturesDocuments: { a: { sorte: 'naissance', alerte: false, resume: 'rien' } } }).length, 0);
  const a = app.alertesLecturesFiche({ lecturesDocuments: { a: { sorte: 'naissance', alerte: true, resume: 'mention marginale : divorce' }, b: { sorte: 'pv-ag', alerte: true, resume: 'travaux' } } });
  assert.equal(a.map((x) => x.libelle).join('|'), 'Mention marginale|Travaux votés en AG');
  assert.equal(app.pastillesAlertesLecturesEntete({}), '');
  assert.equal(app.pieceEstEtatHypothecaire({ nom: 'Etat reponse.pdf', dossierGed: 'Vente' }), true);
  assert.equal(app.pieceEstEtatHypothecaire({ nom: 'Annexe usager.pdf', dossierGed: 'Retours SPF Téléactes' }), false);
  assert.equal(app.pieceEstEtatHypothecaire({ nom: 'Certificat conservateur.pdf', dossierGed: 'Retours SPF Téléactes' }), false);
  assert.equal(app.pieceEstEtatHypothecaire({ nom: 'Réquisition d’état.pdf', dossierGed: 'Retours SPF Téléactes' }), false);
});
