'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/clotureComptesEmail');

// Notoriété signée : l'étape des comptes peut se faire.
const succession = (o) => Object.assign({ id: 's1', nom: 'Mme Marie LEFEBVRE veuve de M. Jean LEFEBVRE', typeAffaire: 'succession', echeancesValidees: { notoriete: true },
  // Notoriété + déclaration : une notoriété seule n'a ni déblocage ni transfert des comptes (étude 26/10).
  succession: { type: 'notoriete-ds' },
  parties: [{ nom: 'Anne LEFEBVRE', role: 'PARTIE', emails: ['anne.lefebvre@exemple.fr'] }],
  authentic: { courriersBanque: [{ intitule: 'Lettre banque clôture des comptes', date: '2026-10-10', mailLe: '2026-10-11', nature: 'cloture' }] }, historique: [] }, o);
const etude = (a) => a.endsWith('@office-exemple.fr');
const envoye = { objet: 'Succession LEFEBVRE - clôture des comptes', a: ['successions@banque-exemple.fr'], date: '2026-10-11T09:00:00Z' };

test('clôture des comptes : courrier d\'Authentic + email envoyé à la banque (étude 16/10)', () => {
  const d = succession();
  assert.ok(C.courrierEnvoyeParEmail(d, envoye, etude));
  // La veille de la création du courrier : accepté ; avant, ou plus de 30 jours après : rien.
  assert.ok(C.courrierEnvoyeParEmail(d, { ...envoye, date: '2026-10-09T09:00:00Z' }, etude));
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, date: '2026-10-07T09:00:00Z' }, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, date: '2026-11-15T09:00:00Z' }, etude), null);
  // À un héritier seul : pas l'envoi à la banque ; un héritier ou l'étude en copie ne gêne pas.
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, a: ['anne.lefebvre@exemple.fr', 'office@office-exemple.fr'] }, etude), null);
  assert.ok(C.courrierEnvoyeParEmail(d, { ...envoye, a: ['successions@banque-exemple.fr', 'office@office-exemple.fr', 'anne.lefebvre@exemple.fr'] }, etude));
  // Un autre organisme, objet sans rapport avec les comptes, pas le jour du « Mail le » : rien (relecture 16/10).
  assert.equal(C.courrierEnvoyeParEmail(d, { objet: 'LEFEBVRE : déclaration', a: ['sie@impots-exemple.fr'], date: '2026-10-14T09:00:00Z' }, etude), null);
  // … mais le jour où Authentic note le courrier envoyé par mail, l'objet peut être muet.
  assert.ok(C.courrierEnvoyeParEmail(d, { objet: 'LEFEBVRE', a: ['agence@banque-exemple.fr'], date: '2026-10-11T15:00:00Z' }, etude));
  // Un prénom ne désigne pas la succession.
  assert.deepEqual(C.motsSuccession(d), ['LEFEBVRE']);
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, objet: 'Succession Jean LEROY - clôture des comptes' }, etude), null);
  // Sans courrier relevé dans Authentic : rien (jamais un seul signal) ; notoriété pas signée : rien.
  assert.equal(C.courrierEnvoyeParEmail(succession({ authentic: {} }), envoye, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(succession({ echeancesValidees: {} }), envoye, etude), null);
  // Deux successions LEFEBVRE en cours, même si l'autre n'a pas de courrier relevé : rien.
  assert.equal(C.successionDeEnvoiBanque([d, succession({ id: 's2', authentic: {} })], envoye, etude), null);
  const t = C.successionDeEnvoiBanque([d, succession({ id: 's3', nom: 'SUCC MARTIN' })], envoye, etude);
  assert.equal(t.d.id, 's1');
  // Cochée : déblocage des fonds (pas de conjoint survivant), une seule fois.
  assert.equal(C.cocherClotureComptes(d, t.courrier, envoye), true);
  assert.equal(d.echeancesValidees.deblocageFonds, true);
  assert.equal(d.detectionsEmails.clotureComptes, '2026-10-11');
  assert.match(d.historique[0].texte, /Authentic.*envoyé par email à la banque le 11\/10\/2026/);
  d.echeancesValidees.deblocageFonds = false;
  assert.equal(C.cocherClotureComptes(d, t.courrier, envoye), false, 'décochée à la main : jamais recochée');
  // Conjoint survivant : le transfert des comptes.
  const c = succession({ succession: { type: 'notoriete-ds', conjointSurvivant: true } });
  assert.equal(C.etapeClotureComptes(c), 'transfertComptes');
  assert.equal(C.cocherClotureComptes(c, t.courrier, envoye), true);
  assert.equal(c.echeancesValidees.transfertComptes, true);
  // Une vente n'est jamais concernée ; un envoi qui ne nomme aucune succession n'est pas gardé.
  assert.equal(C.successionACocher(succession({ typeAffaire: 'vente' })), false);
  assert.equal(C.envoiAGarderPourCloture({ objet: 'Réunion du lundi' }, [d]), false);
  assert.equal(C.envoiAGarderPourCloture(envoye, [d]), true);
});

test('envois gardés pour un recoupement plus tard : 45 jours, sans doublon', () => {
  const maintenant = new Date('2026-10-16T10:00:00Z');
  const r = C.envoisAGarder([{ id: 'a', date: '2026-08-01T10:00:00Z', objet: 'x', a: ['b@c.fr'] }, { id: 'b', date: '2026-10-10T10:00:00Z', objet: 'y', a: ['B@C.fr'] }],
    [{ id: 'b', date: '2026-10-10T10:00:00Z', objet: 'y' }, { id: 'c', date: '2026-10-15T10:00:00Z', objet: 'z', a: [] }], maintenant);
  assert.equal(r.map((e) => e.id).join(','), 'b,c');
  assert.equal(r[0].a[0], 'b@c.fr');
  assert.equal(C.envoisAGarder([{ id: 'a', date: '2020-01-01T10:00:00Z' }], [], null).length, 1, 'sans date du jour : rien n\'est trié');
});

test('déblocage / transfert des fonds dit dans l’objet (étude 28/10) : l’email envoyé suffit, sans courrier d’Authentic', () => {
  const d = succession({ authentic: {}, succession: { type: 'notoriete-ds', notorieteSigneeLe: '2026-10-15' } });
  // Avant la notoriété (frais d'obsèques…), obsèques ou assurance, ou à un confrère : jamais (audit 0.388.0).
  assert.equal(C.courrierEnvoyeParEmail(d, { objet: 'Succession LEFEBVRE — Déblocage des fonds', a: ['b@banque-exemple.fr'], date: '2026-10-10T09:00:00Z' }, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(d, { objet: 'Succession LEFEBVRE — Déblocage des fonds pour les obsèques', a: ['b@banque-exemple.fr'], date: '2026-10-20T09:00:00Z' }, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(d, { objet: 'Succession LEFEBVRE — Transfert des fonds', a: ['office.x@notaires.fr'], date: '2026-10-20T09:00:00Z' }, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(succession({ authentic: {} }), { objet: 'Succession LEFEBVRE — Déblocage des fonds', a: ['b@banque-exemple.fr'], date: '2026-10-20T09:00:00Z' }, etude), null, 'date de la notoriété inconnue : double preuve');
  const objet = 'Succession de Madame Marie LEFEBVRE — Déblocage des fonds';
  const c = C.courrierEnvoyeParEmail(d, { objet, a: ['successions@banque-exemple.fr'], date: '2026-10-20T09:00:00Z' }, etude);
  assert.ok(c && c.email);
  // Toujours : le nom du défunt, une adresse hors fiche et hors étude, l'étape ouverte (notoriété signée).
  assert.equal(C.courrierEnvoyeParEmail(d, { objet: 'Déblocage des fonds', a: ['successions@banque-exemple.fr'], date: '2026-10-20T09:00:00Z' }, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(d, { objet, a: ['anne.lefebvre@exemple.fr'], date: '2026-10-20T09:00:00Z' }, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(succession({ authentic: {}, echeancesValidees: {} }), { objet, a: ['b@banque-exemple.fr'], date: '2026-10-20T09:00:00Z' }, etude), null);
  assert.ok(C.courrierEnvoyeParEmail(d, { objet: 'Succession LEFEBVRE - transfert des fonds', a: ['b@banque-exemple.fr'], date: '2026-10-20T09:00:00Z' }, etude));
  assert.equal(C.cocherClotureComptes(d, c, { objet, date: '2026-10-20T09:00:00Z' }), true);
  assert.equal(d.echeancesValidees.deblocageFonds, true);
  assert.match(d.historique[d.historique.length - 1].texte, /envoyé par email à la banque le 20\/10\/2026/);
});
