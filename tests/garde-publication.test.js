'use strict';

// Garde de publication (étude 16/10) : un envoi vers main est reconnu dans toutes ses formes, avec la source réellement envoyée ;
// les autres envois et ce qui n'est pas un envoi passent.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../scripts/garde-publication');

const sources = (c, branche = 'claude/x', amont = '') => [...new Set(G.segmentsCommande(c).flatMap((s) => G.sourcesVersMain(s, branche, amont)))].join(',');

test('garde : reconnaît un envoi vers main sous toutes ses formes, avec la source envoyée', () => {
  assert.equal(sources('git push origin main'), 'main');
  assert.equal(sources('git push -q origin HEAD:main'), 'HEAD');
  assert.equal(sources('git push origin feature:main'), 'feature');
  assert.equal(sources('git push -u origin HEAD:refs/heads/main'), 'HEAD');
  assert.equal(sources('git push origin +HEAD:main'), 'HEAD');
  assert.equal(sources('npm run verifier && git push -q origin HEAD:main && git push -qf origin HEAD:claude/x'), 'HEAD');
  assert.equal(sources('git -C /home/user/Office-suivi push origin main'), 'main');
  assert.equal(sources('bash -c "git push origin HEAD:main"'), 'HEAD');
  assert.equal(sources("sh -c 'cd /x && git push origin main'"), 'main');
  assert.equal(sources('eval "git push origin main"'), 'main');
  assert.equal(sources('(git push origin main)'), 'main');
  assert.equal(sources('echo $(git push origin main)'), 'main');
  assert.equal(sources('git push origin main&'), 'main');
  assert.equal(sources('git push origin main>/dev/null'), 'main');
  assert.equal(sources('git push origin main 2>&1'), 'main');
  assert.equal(sources('git push --all origin'), '*');
  assert.equal(sources("git push origin 'refs/heads/*:refs/heads/*'"), '*');
  assert.equal(sources('git -c alias.p=push p origin main'), '*');
  assert.equal(sources('git push', 'main'), 'HEAD', 'sans destination depuis main');
  assert.equal(sources('git push origin HEAD', 'main'), 'HEAD');
  assert.equal(sources('git push', 'ma-branche', 'origin/main'), 'HEAD', 'branche qui suit origin/main');
});

test('garde : laisse passer les autres envois et ce qui n’est pas un envoi', () => {
  for (const c of ['git push -qf origin HEAD:claude/fiche-prod', 'git push -u origin claude/rapport-2026-10-16-17h', 'git push', 'git fetch origin main',
    'git log origin/main', 'echo "git push origin main"', 'git push origin main-test', 'git push origin HEAD:mainline', 'git log --grep push',
    "cat > f.txt <<'EOF'\ngit push origin main\nEOF\necho fini"]) {
    assert.equal(G.commandePousseVersMain(c, 'claude/x'), false, c);
  }
  assert.equal(G.commandePousseVersMain('git log --grep push', 'main'), false, 'push n’est pas la sous-commande');
  assert.equal(G.commandePousseVersMain("cat > f <<EOF\nx\nEOF\ngit push origin main", 'claude/x'), true, 'après le document en ligne, la commande compte');
});

test('garde : fusions et écritures sur main par GitHub refusées, le reste permis', () => {
  assert.equal(G.commandeChangeMainSurGithub('gh pr merge 12 --squash'), true);
  assert.equal(G.commandeChangeMainSurGithub('gh api -X PATCH repos/a/b/git/refs/heads/main -f sha=x'), true);
  assert.equal(G.commandeChangeMainSurGithub('curl -X PUT https://api.github.com/repos/a/b/pulls/3/merge'), true);
  assert.equal(G.commandeChangeMainSurGithub('gh pr view 12'), false);
  assert.equal(G.outilGithubChangeMain('mcp__github__merge_pull_request', {}), true);
  assert.equal(G.outilGithubChangeMain('mcp__github__push_files', { branch: 'main' }), true);
  assert.equal(G.outilGithubChangeMain('mcp__github__create_or_update_file', { branch: 'claude/x' }), false);
  assert.equal(G.outilGithubChangeMain('mcp__github__actions_list', {}), false);
  assert.equal(G.outilGithubChangeMain('Bash', {}), false);
});

test('garde : découpe une ligne de commande sans couper dans les guillemets', () => {
  assert.equal(G.segmentsCommande('a && b || c; d | e').join(','), 'a,b,c,d,e');
  assert.equal(G.segmentsCommande('git commit -m "x && y" && git push').length, 2);
});
