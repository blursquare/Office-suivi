'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/clotureComptesEmail');

const succession = (o) => Object.assign({ id: 's1', nom: 'SUCC LEFEBVRE', typeAffaire: 'succession', parties: [{ nom: 'Anne LEFEBVRE', role: 'PARTIE', emails: ['anne.lefebvre@exemple.fr'] }],
  authentic: { courriersBanque: [{ intitule: 'Lettre banque clôture des comptes', date: '2026-10-10', nature: 'cloture' }] }, historique: [] }, o);
const etude = (a) => a.endsWith('@office-exemple.fr');

test('clôture des comptes : courrier d\'Authentic + email envoyé à la banque (étude 16/10)', () => {
  const d = succession();
  const envoye = { objet: 'Succession LEFEBVRE - clôture des comptes', a: ['successions@banque-exemple.fr'], date: '2026-10-11T09:00:00Z' };
  assert.ok(C.courrierEnvoyeParEmail(d, envoye, etude));
  // Avant la création du courrier, ou plus de 30 jours après : rien.
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, date: '2026-10-09T09:00:00Z' }, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, date: '2026-11-15T09:00:00Z' }, etude), null);
  // À un héritier ou à l'étude : pas l'envoi à la banque.
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, a: ['anne.lefebvre@exemple.fr'] }, etude), null);
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, a: ['successions@banque-exemple.fr', 'office@office-exemple.fr'] }, etude), null);
  // L'objet ne nomme pas la succession : rien.
  assert.equal(C.courrierEnvoyeParEmail(d, { ...envoye, objet: 'Clôture des comptes' }, etude), null);
  // Sans courrier relevé dans Authentic : rien (jamais un seul signal).
  assert.equal(C.courrierEnvoyeParEmail(succession({ authentic: {} }), envoye, etude), null);
  // Deux successions du même nom : rien.
  assert.equal(C.successionDeEnvoiBanque([d, succession({ id: 's2' })], envoye, etude), null);
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
  const c = succession({ succession: { conjointSurvivant: true } });
  assert.equal(C.etapeClotureComptes(c), 'transfertComptes');
  assert.equal(C.cocherClotureComptes(c, t.courrier, envoye), true);
  assert.equal(c.echeancesValidees.transfertComptes, true);
  // Une vente n'est jamais concernée.
  assert.equal(C.successionACocher(succession({ typeAffaire: 'vente' })), false);
});

test('envois gardés pour un recoupement plus tard : 45 jours, sans doublon', () => {
  const maintenant = new Date('2026-10-16T10:00:00Z');
  const r = C.envoisAGarder([{ id: 'a', date: '2026-08-01T10:00:00Z', objet: 'x', a: ['b@c.fr'] }, { id: 'b', date: '2026-10-10T10:00:00Z', objet: 'y', a: ['B@C.fr'] }],
    [{ id: 'b', date: '2026-10-10T10:00:00Z', objet: 'y' }, { id: 'c', date: '2026-10-15T10:00:00Z', objet: 'z', a: [] }], maintenant);
  assert.equal(r.map((e) => e.id).join(','), 'b,c');
  assert.equal(r[0].a[0], 'b@c.fr');
});
