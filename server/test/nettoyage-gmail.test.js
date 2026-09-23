'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const {
  DELAI_AVANT_EFFACEMENT_MS, MAX_ESSAIS_EFFACEMENT, mettreCopiesEnAttente, executerNettoyageGmail
} = require('../src/nettoyageGmail');

const GMAIL = { smtpHote: 'smtp.gmail.com', smtpUtilisateur: 'claire@gmail.com', smtpMotDePasse: 'x' };
const T0 = Date.UTC(2026, 8, 23, 8, 0, 0);

function repo() {
  return creerRepoParametres(ouvrirDb(':memory:'));
}

test('le délai d\'effacement laisse au flux le temps de relever le message (au moins une heure)', () => {
  assert.ok(DELAI_AVANT_EFFACEMENT_MS >= 60 * 60 * 1000);
});

test('mise en attente : seulement pour un compte Gmail, sans doublon', () => {
  const p = repo();
  assert.equal(mettreCopiesEnAttente(p, { smtpHote: 'smtp.office365.com' }, ['<a@x>'], T0), 0);
  assert.equal(p.lireCopiesEnAttente().length, 0);
  mettreCopiesEnAttente(p, GMAIL, ['<a@x>', '<b@x>'], T0);
  mettreCopiesEnAttente(p, GMAIL, ['<a@x>'], T0 + 1000);
  const file = p.lireCopiesEnAttente();
  assert.equal(file.map((c) => c.messageId).join(','), '<a@x>,<b@x>');
  assert.equal(file[0].envoyeLe, T0, 'la date du premier envoi est conservée');
});

test('une copie trop récente n\'est JAMAIS effacée : le flux ne l\'a peut-être pas encore lue', async () => {
  const p = repo();
  mettreCopiesEnAttente(p, GMAIL, ['<a@x>'], T0);
  let appels = 0;
  const r = await executerNettoyageGmail(p, GMAIL, async () => { appels++; return { ok: true, effaces: 1 }; },
    T0 + DELAI_AVANT_EFFACEMENT_MS - 1);
  assert.equal(appels, 0);
  assert.equal(r.effaces, 0);
  assert.equal(p.lireCopiesEnAttente().length, 1);
});

test('délai écoulé : seules les copies dues sont effacées, les autres restent en attente', async () => {
  const p = repo();
  mettreCopiesEnAttente(p, GMAIL, ['<vieille@x>'], T0);
  mettreCopiesEnAttente(p, GMAIL, ['<recente@x>'], T0 + DELAI_AVANT_EFFACEMENT_MS);
  const recues = [];
  const r = await executerNettoyageGmail(p, GMAIL, async (reg, ids) => { recues.push(...ids); return { ok: true, effaces: 1 }; },
    T0 + DELAI_AVANT_EFFACEMENT_MS + 1);
  assert.equal(recues.join(','), '<vieille@x>');
  assert.equal(r.effaces, 1);
  assert.equal(r.avertissement, null);
  assert.equal(p.lireCopiesEnAttente().map((c) => c.messageId).join(','), '<recente@x>');
});

test('copie introuvable (déjà effacée, par le flux ou à la main) : sort de la file sans avertissement', async () => {
  const p = repo();
  mettreCopiesEnAttente(p, GMAIL, ['<a@x>'], T0);
  const r = await executerNettoyageGmail(p, GMAIL,
    async () => ({ ok: false, effaces: 0, introuvables: 1, erreur: '1 copie(s) introuvable(s)' }),
    T0 + DELAI_AVANT_EFFACEMENT_MS);
  assert.equal(r.avertissement, null);
  assert.equal(p.lireCopiesEnAttente().length, 0);
});

test('connexion en échec : copie gardée pour un nouvel essai, avertissement donné, abandon au bout du plafond', async () => {
  const p = repo();
  mettreCopiesEnAttente(p, GMAIL, ['<a@x>'], T0);
  const echec = async () => ({ ok: false, echec: true, erreur: 'Copie Gmail non effacée (délai IMAP dépassé).' });
  const t = T0 + DELAI_AVANT_EFFACEMENT_MS;

  const r1 = await executerNettoyageGmail(p, GMAIL, echec, t);
  assert.match(r1.avertissement, /délai IMAP dépassé/);
  assert.match(r1.avertissement, /Nouvel essai/);
  assert.equal(p.lireCopiesEnAttente()[0].essais, 1);

  let dernier;
  for (let i = 1; i < MAX_ESSAIS_EFFACEMENT; i++) dernier = await executerNettoyageGmail(p, GMAIL, echec, t);
  assert.match(dernier.avertissement, /abandonnée/);
  assert.equal(p.lireCopiesEnAttente().length, 0);
});

test('compte qui n\'est plus Gmail : la file est vidée sans tentative', async () => {
  const p = repo();
  mettreCopiesEnAttente(p, GMAIL, ['<a@x>'], T0);
  let appels = 0;
  await executerNettoyageGmail(p, { smtpHote: 'smtp.office365.com' }, async () => { appels++; return { ok: true }; },
    T0 + DELAI_AVANT_EFFACEMENT_MS);
  assert.equal(appels, 0);
  assert.equal(p.lireCopiesEnAttente().length, 0);
});
