// @ts-check
'use strict';

// Garde de publication (étude 16/10 : « j'aimerais aussi que les tests et la relecture indépendante soient automatiques pour toutes
// les modifications de CLAIRE maintenant »). Un envoi sur `main` construit un .exe installé seul au bureau : il n'est permis que si
// le contenu exact envoyé a passé `npm run verifier` ET la relecture indépendante (second agent, /relire).
//
// - `node scripts/garde-publication.js debut`           : au début de `npm run verifier`, retient l'empreinte du contenu testé ;
// - `node scripts/garde-publication.js marquer verifie` : à la fin réussie de `npm run verifier` — marque posée seulement si le contenu
//   n'a pas changé pendant les tests ;
// - `node scripts/garde-publication.js marquer relu`    : après une relecture dont les défauts confirmés sont corrigés (`npm run relu`) ;
// - sans argument : crochet PreToolUse de Claude Code (.claude/settings.json) — lit l'appel d'outil sur l'entrée standard et refuse
//   (code 2) un envoi vers `main` dont le contenu n'a pas ces deux marques.
// C'est un garde-fou pour les sessions Claude Code : une modification faite à la main sur GitHub ne passe pas par lui, et les marques
// sont posées par la session elle-même (elles disent que l'étape a été faite, elles ne la font pas).
// L'empreinte est celle de l'arbre git du contenu (fichiers suivis + nouveaux fichiers non ignorés) : un commit qui ne change rien au
// contenu garde la même empreinte, une seule modification la change.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ETAPES = ['verifie', 'relu'];
const LIBELLES = { verifie: 'npm run verifier', relu: 'la relecture indépendante (/relire), puis npm run relu' };
const OPTIONS_GIT_AVEC_VALEUR = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'];
const OPTIONS_PUSH_AVEC_VALEUR = ['-o', '--push-option', '--repo', '--receive-pack', '--exec'];
/** Les alias git de la configuration qui lancent un push (lus par le crochet). */
const aliasVersPush = new Set();

/** Pure : la commande sans le corps de ses documents en ligne (`<<'EOF' … EOF`) : du texte écrit dans un fichier n'est pas exécuté. @param {string} commande */
function sansDocumentsEnLigne(commande) {
  // Une ligne continuée par « \ » est une seule commande.
  const lignes = String(commande || '').replace(/\\\r?\n/g, ' ').split('\n');
  const sortie = [];
  /** @type {string[]} */
  let fins = [];
  let execute = false; // le corps est donné à un shell (bash <<EOF) : il est exécuté, donc gardé
  for (const ligne of lignes) {
    if (fins.length) {
      if (ligne.replace(/^\t+/, '').trim() === fins[0]) { fins.shift(); continue; }
      if (execute) sortie.push(ligne);
      continue;
    }
    sortie.push(ligne);
    const re = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g;
    for (let m = re.exec(ligne); m; m = re.exec(ligne)) fins.push(m[2]);
    if (fins.length) execute = /(^|[\s;&|(])(bash|sh|zsh|dash|eval|source|\.)\s*(-[a-z]+\s*)*<</.test(ligne);
  }
  return sortie.join('\n');
}

/** Pure : les morceaux d'une ligne de commande séparés par &&, ||, ;, |, & ou un retour à la ligne (hors guillemets et documents en ligne). @param {string} commande */
function segmentsCommande(commande) {
  const sortie = [];
  let courant = '';
  let guillemet = '';
  const t = sansDocumentsEnLigne(commande);
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemet) { if (c === guillemet) guillemet = ''; courant += c; continue; }
    if (c === '"' || c === "'") { guillemet = c; courant += c; continue; }
    if (c === ';' || c === '\n' || c === '|' || c === '&') {
      sortie.push(courant);
      courant = '';
      if ((c === '&' || c === '|') && t[i + 1] === c) i++;
      continue;
    }
    courant += c;
  }
  sortie.push(courant);
  return sortie.map((s) => s.trim()).filter(Boolean);
}

/** Pure : les mots d'un morceau de commande — guillemets retirés, parenthèses, `$(` et accents graves de bord ôtés, redirections coupées. @param {string} segment */
function motsSegment(segment) {
  const mots = [];
  for (const brut of String(segment).match(/"[^"]*"|'[^']*'|\S+/g) || []) {
    const cite = /^["']/.test(brut);
    let m = brut.replace(/^["']|["']$/g, '');
    if (!cite) {
      m = m.replace(/^(?:\$\(|[(`])+/, '').replace(/[)`]+$/, '');
      if (/^\d*[<>]/.test(m)) break; // redirection : la suite n'est pas un argument de git
      m = m.replace(/\d*[<>].*$/, '');
    }
    if (m) mots.push(m);
  }
  return mots;
}

/** Pure : les commandes cachées dans un morceau (`bash -c "…"`, `sh -c '…'`, `eval "…"`), à examiner aussi. @param {string[]} mots */
function commandesImbriquees(mots) {
  const out = [];
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i].replace(/^.*\//, '');
    if (['bash', 'sh', 'zsh', 'dash'].includes(m)) { const j = mots.findIndex((x, k) => k > i && /^-[a-z]*c[a-z]*$/.test(x)); if (j > 0 && mots[j + 1]) out.push(mots[j + 1]); }
    if (m === 'eval' && mots[i + 1]) out.push(mots.slice(i + 1).join(' '));
  }
  return out;
}

/**
 * Pure : les sources envoyées vers `main` par ce morceau de commande (['HEAD'], ['ma-branche'], ['*'] pour un envoi qu'on ne sait pas
 * réduire), [] s'il n'envoie rien vers main. `brancheCourante` et `amontCourant` (« origin/main ») servent pour un `git push` sans destination.
 * @param {string} segment @param {string} brancheCourante @param {string} [amontCourant]
 */
function sourcesVersMain(segment, brancheCourante, amontCourant = '') {
  const mots = motsSegment(segment);
  const imbriquees = commandesImbriquees(mots).flatMap((c) => segmentsCommande(c)).flatMap((s) => sourcesVersMain(s, brancheCourante, amontCourant));
  const iGit = mots.findIndex((m) => /(^|\/)git$/.test(m));
  if (iGit < 0) return imbriquees;
  // La sous-commande : le premier mot après git et ses options globales (-C x, -c k=v, --git-dir=…).
  let i = iGit + 1;
  let aliasPush = false;
  while (i < mots.length && mots[i].startsWith('-')) {
    if (mots[i] === '-c' && /^alias\.[^=]+=.*\bpush\b/.test(mots[i + 1] || '')) aliasPush = true;
    i += OPTIONS_GIT_AVEC_VALEUR.includes(mots[i]) ? 2 : 1;
  }
  if (aliasPush || /^\$/.test(mots[i] || '') || (mots[i] && aliasVersPush.has(mots[i]))) return ['*'];
  if (mots[i] !== 'push') return imbriquees;
  const apres = mots.slice(i + 1);
  if (apres.some((o) => o === '--all' || o === '--mirror' || o === '--branches')) return ['*'];
  const positionnels = [];
  for (let k = 0; k < apres.length; k++) {
    const m = apres[k];
    if (m.startsWith('-')) { if (OPTIONS_PUSH_AVEC_VALEUR.includes(m)) k++; continue; }
    positionnels.push(m);
  }
  const refspecs = positionnels.slice(1); // le premier est le dépôt distant
  if (!refspecs.length) {
    // Sans destination : la branche courante, vers elle-même ou vers son amont (push.default=upstream).
    return brancheCourante === 'main' || amontCourant === 'origin/main' ? ['HEAD'] : imbriquees;
  }
  const sources = [];
  for (const r of refspecs) {
    const sansPlus = r.replace(/^\+/, '');
    const avecDeux = sansPlus.includes(':');
    const src = avecDeux ? sansPlus.slice(0, sansPlus.indexOf(':')) : sansPlus;
    const dst = avecDeux ? sansPlus.slice(sansPlus.indexOf(':') + 1) : sansPlus;
    if (dst.includes('*')) { sources.push('*'); continue; }
    const versMain = dst === 'main' || dst === 'refs/heads/main' || (dst === 'HEAD' && brancheCourante === 'main');
    if (versMain) sources.push(avecDeux && !src ? '*' : (src || 'HEAD')); // « :main » supprime main : jamais permis
  }
  return sources.concat(imbriquees);
}

/** Pure : la commande contient-elle un envoi vers `main` ? @param {string} commande @param {string} brancheCourante @param {string} [amont] */
function commandePousseVersMain(commande, brancheCourante, amont = '') {
  return segmentsCommande(commande).some((s) => sourcesVersMain(s, brancheCourante, amont).length > 0);
}

/** Pure : une commande qui change `main` sur GitHub sans passer par `git push` (fusion d'une demande, API). @param {string} commande */
function commandeChangeMainSurGithub(commande) {
  return segmentsCommande(commande).some((s) => {
    const mots = motsSegment(s);
    const iGh = mots.findIndex((m) => /(^|\/)gh$/.test(m));
    if (iGh >= 0 && mots[iGh + 1] === 'pr' && mots[iGh + 2] === 'merge') return true;
    // Une écriture seulement (méthode autre que GET, ou des champs envoyés) : une lecture de l'API passe.
    const ecrit = (/** @type {string[]} */ ms) => ms.some((m, k) => ((m === '-X' || m === '--method' || m === '--request') && !/^get$/i.test(ms[k + 1] || '')) || /^-X(?!GET)[A-Z]+$/.test(m)
      || ['-f', '-F', '--field', '--raw-field', '--input', '-d', '--data', '--data-raw', '--data-binary'].includes(m));
    if (iGh >= 0 && mots[iGh + 1] === 'api' && ecrit(mots) && mots.some((m) => /refs\/heads\/main\b|\/merges?\b|\/merge\b|\/contents\/|mergePullRequest|branch=main/.test(m))) return true;
    if (mots.some((m) => /(^|\/)curl$/.test(m)) && ecrit(mots) && mots.some((m) => /api\.github\.com\/.*(refs\/heads\/main|\/merges?\b|\/merge\b|\/contents\/|graphql)/.test(m))) return true;
    return false;
  });
}

/** Pure : un appel d'outil GitHub (MCP) qui écrit sur `main` ou fusionne une demande. @param {string} outil @param {any} entree */
function outilGithubChangeMain(outil, entree) {
  const nom = String(outil || '');
  if (!/^mcp__github__/.test(nom)) return false;
  if (/(merge_pull_request|enable_pr_auto_merge)$/.test(nom)) return true;
  if (/(push_files|create_or_update_file|delete_file|create_branch)$/.test(nom)) {
    const branche = String((entree && (entree.branch || entree.ref)) || '');
    return branche === 'main' || branche === 'refs/heads/main';
  }
  return false;
}

function git(args, opts = {}) { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim(); }

/** L'empreinte du contenu de l'arbre de travail (index temporaire : HEAD + toutes les modifications, nouveaux fichiers compris). */
function empreinteArbreTravail() {
  const index = path.join(os.tmpdir(), `claire-garde-${process.pid}-${Date.now()}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(['read-tree', 'HEAD'], { env });
    git(['add', '-A'], { env });
    return git(['write-tree'], { env });
  } finally { try { fs.unlinkSync(index); } catch (_) { /* déjà retiré */ } }
}

function dossierMarques() { return path.join(git(['rev-parse', '--absolute-git-dir']), 'claire'); }
function lireMarque(nom) { try { return fs.readFileSync(path.join(dossierMarques(), nom), 'utf8').trim(); } catch (_) { return ''; } }
function ecrireMarque(nom, valeur) { const d = dossierMarques(); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, nom), valeur + '\n'); }

function debut() { ecrireMarque('verifie-en-cours', empreinteArbreTravail()); }

function marquer(etape) {
  if (!ETAPES.includes(etape)) throw new Error(`Étape inconnue : ${etape} (verifie ou relu).`);
  const empreinte = empreinteArbreTravail();
  if (etape === 'verifie' && lireMarque('verifie-en-cours') !== empreinte) {
    console.error('Garde de publication : le contenu a changé pendant les tests — « verifie » NON noté, relancer npm run verifier.');
    process.exit(1);
  }
  ecrireMarque(etape, empreinte);
  console.log(`Garde de publication : « ${etape} » noté pour ce contenu (${empreinte.slice(0, 10)}).`);
}

/** Les étapes qui manquent pour le contenu d'une source (HEAD, une branche). */
function etapesManquantes(source) {
  let arbre = '';
  try { arbre = git(['rev-parse', `${source}^{tree}`]); } catch (_) { return ETAPES.slice(); }
  return ETAPES.filter((e) => lireMarque(e) !== arbre);
}

function refuser(message) {
  process.stderr.write(`Envoi sur main refusé par la garde de publication de CLAIRE : ${message}\n`);
  return 2;
}

function crochet() {
  let entree = '';
  try { entree = fs.readFileSync(0, 'utf8'); } catch (_) { return 0; }
  let appel = null;
  try { appel = JSON.parse(entree); } catch (_) { return 0; }
  const outil = appel && typeof appel.tool_name === 'string' ? appel.tool_name : '';
  const params = (appel && appel.tool_input) || {};
  // Les outils GitHub écrivent sur GitHub sans passer par le contenu vérifié ici : jamais vers main (c'est l'étude qui fusionne).
  if (outilGithubChangeMain(outil, params)) return refuser('écrire sur main ou fusionner une demande par les outils GitHub n’est pas permis ici — envoyer le contenu vérifié et relu par git push, ou laisser l’étude fusionner.');
  const commande = typeof params.command === 'string' ? params.command : '';
  if (!commande || !/\b(push|merge|api|curl|git)\b/.test(commande)) return 0;
  if (commandeChangeMainSurGithub(commande)) return refuser('fusion ou écriture sur main par gh / l’API GitHub — envoyer le contenu vérifié et relu par git push.');
  let branche = '';
  let amont = '';
  try { branche = git(['rev-parse', '--abbrev-ref', 'HEAD']); } catch (_) { return 0; }
  try { amont = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']); } catch (_) { amont = ''; }
  try {
    git(['config', '--get-regexp', '^alias\\.']).split('\n').forEach((l) => { const m = /^alias\.(\S+)\s+(.*)$/.exec(l); if (m && /\bpush\b/.test(m[2])) aliasVersPush.add(m[1]); });
  } catch (_) { /* aucun alias */ }
  const sources = [...new Set(segmentsCommande(commande).flatMap((s) => sourcesVersMain(s, branche, amont)))];
  if (!sources.length) return 0;
  if (sources.includes('*')) return refuser('envoi qui ne désigne pas une seule source (--all, *, alias) — pousser explicitement HEAD:main.');
  for (const src of sources) {
    const manque = etapesManquantes(src);
    if (manque.length) {
      let nonSuivis = '';
      try { nonSuivis = git(['ls-files', '--others', '--exclude-standard']); } catch (_) { nonSuivis = ''; }
      return refuser(`le contenu de ${src} n'a pas passé ${manque.map((e) => LIBELLES[e]).join(' ni ')}. Lancer ce qui manque APRÈS la dernière modification (une modification qui change le contenu efface les marques), puis renvoyer.`
        + (nonSuivis ? ` Attention : des fichiers non suivis (git status) entrent dans le contenu testé et le séparent de ${src} — les commiter ou les déplacer, puis relancer.` : ''));
    }
  }
  return 0;
}

if (require.main === module) {
  if (process.argv[2] === 'debut') { debut(); process.exit(0); }
  if (process.argv[2] === 'marquer') { marquer(process.argv[3]); process.exit(0); }
  let code = 0;
  try { code = crochet(); } catch (_) { code = 0; } // une erreur inattendue ne bloque jamais tout Bash
  process.exit(code);
}

module.exports = { sansDocumentsEnLigne, segmentsCommande, motsSegment, sourcesVersMain, commandePousseVersMain, commandeChangeMainSurGithub, outilGithubChangeMain };
