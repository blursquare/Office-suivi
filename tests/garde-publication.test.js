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
  assert.equal(sources('git push origin \\\n  HEAD:main'), 'HEAD', 'ligne continuée');
  assert.equal(sources('bash -lc "git push origin HEAD:main"'), 'HEAD');
  assert.equal(sources("bash <<'EOF'\ngit push origin HEAD:main\nEOF"), 'HEAD', 'document en ligne donné à un shell : exécuté');
  assert.equal(sources('X=push; git $X origin HEAD:main'), '*');
  assert.equal(sources('git push origin :main'), '*', 'suppression de main');
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
  assert.equal(G.commandeChangeMainSurGithub('gh api repos/o/r/git/refs/heads/main'), false, 'une lecture passe');
  assert.equal(G.commandeChangeMainSurGithub('gh api -X PUT repos/o/r/contents/f -f branch=main'), true);
  assert.equal(G.commandeChangeMainSurGithub('gh api graphql -f query=mutation{mergePullRequest}'), true);
  assert.equal(G.outilGithubChangeMain('mcp__github__merge_pull_request', {}), true);
  assert.equal(G.outilGithubChangeMain('mcp__github__enable_pr_auto_merge', {}), true);
  assert.equal(G.outilGithubChangeMain('mcp__github__update_pull_request_branch', {}), false);
  assert.equal(G.outilGithubChangeMain('mcp__github__push_files', { branch: 'main' }), true);
  assert.equal(G.outilGithubChangeMain('mcp__github__create_or_update_file', { branch: 'claude/x' }), false);
  assert.equal(G.outilGithubChangeMain('mcp__github__actions_list', {}), false);
  assert.equal(G.outilGithubChangeMain('Bash', {}), false);
});

test('garde : découpe une ligne de commande sans couper dans les guillemets', () => {
  assert.equal(G.segmentsCommande('a && b || c; d | e').join(','), 'a,b,c,d,e');
  assert.equal(G.segmentsCommande('git commit -m "x && y" && git push').length, 2);
});

test('garde : rien ne part sur main entre 19 h et 8 h (heure de Paris, étude 18/10)', () => {
  // Octobre = heure d'été (UTC+2), décembre = heure d'hiver (UTC+1).
  assert.equal(G.heureParis(new Date('2026-10-20T16:59:00Z')), 18);
  assert.equal(G.horsHeuresBureau(new Date('2026-10-20T16:59:00Z')), false);
  assert.equal(G.horsHeuresBureau(new Date('2026-10-20T17:00:00Z')), true); // 19 h
  assert.equal(G.horsHeuresBureau(new Date('2026-10-21T05:59:00Z')), true); // 7 h 59
  assert.equal(G.horsHeuresBureau(new Date('2026-10-21T06:00:00Z')), false); // 8 h
  assert.equal(G.horsHeuresBureau(new Date('2026-12-15T17:30:00Z')), false); // 18 h 30 l'hiver
  assert.equal(G.horsHeuresBureau(new Date('2026-12-15T18:00:00Z')), true); // 19 h l'hiver
});

test('garde : rien ne part sur main le week-end (heure de Paris, étude 24/10)', () => {
  assert.equal(G.weekEndParis(new Date('2026-10-24T08:00:00Z')), true); // samedi 10 h
  assert.equal(G.horsHeuresBureau(new Date('2026-10-24T08:00:00Z')), true);
  assert.equal(G.horsHeuresBureau(new Date('2026-10-25T12:00:00Z')), true); // dimanche 13 h
  assert.equal(G.horsHeuresBureau(new Date('2026-10-23T15:00:00Z')), false); // vendredi 17 h
  assert.equal(G.horsHeuresBureau(new Date('2026-10-26T07:00:00Z')), false); // lundi 8 h (heure d'hiver)
  assert.equal(G.weekEndParis(new Date('2026-10-25T23:30:00Z')), false); // dimanche 23 h 30 UTC = lundi 0 h 30 à Paris
});
