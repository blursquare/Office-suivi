'use strict';

// Garde de publication (étude 16/10) : un envoi vers main est reconnu dans toutes ses formes, les autres envois passent.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../scripts/garde-publication');

test('garde : reconnaît un envoi vers main sous toutes ses formes', () => {
  for (const c of ['git push origin main', 'git push -q origin HEAD:main', 'git push -u origin HEAD:refs/heads/main', 'git push origin +HEAD:main',
    'npm run verifier && git push -q origin HEAD:main && git push -qf origin HEAD:claude/x', 'cd /x; git push origin main', 'git push --all origin',
    'git -C /home/user/Office-suivi push origin main']) {
    assert.equal(G.commandePousseVersMain(c, 'claude/x'), true, c);
  }
  assert.equal(G.commandePousseVersMain('git push', 'main'), true, 'sans destination depuis main');
  assert.equal(G.commandePousseVersMain('git push origin HEAD', 'main'), true);
});

test('garde : laisse passer les autres envois et ce qui n’est pas un envoi', () => {
  for (const c of ['git push -qf origin HEAD:claude/fiche-prod', 'git push -u origin claude/rapport-2026-10-16-17h', 'git push', 'git fetch origin main',
    'git log origin/main', 'echo "git push origin main"', 'git push origin main-test', 'git push origin HEAD:mainline']) {
    assert.equal(G.commandePousseVersMain(c, 'claude/x'), false, c);
  }
});

test('garde : découpe une ligne de commande sans couper dans les guillemets', () => {
  assert.equal(G.segmentsCommande('a && b || c; d | e').join(','), 'a,b,c,d,e');
  assert.equal(G.segmentsCommande('git commit -m "x && y" && git push').length, 2);
});
