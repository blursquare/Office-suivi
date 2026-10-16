// @ts-check
'use strict';

// Garde de publication (étude 16/10 : « j'aimerais aussi que les tests et la relecture indépendante soient automatiques pour toutes
// les modifications de CLAIRE maintenant »). Un envoi sur `main` construit un .exe installé seul au bureau : il n'est permis que si
// le contenu exact envoyé a passé `npm run verifier` ET la relecture indépendante (second agent, /relire).
//
// - `node scripts/garde-publication.js marquer verifie` : écrit l'empreinte de l'arbre de travail (fin de `npm run verifier`) ;
// - `node scripts/garde-publication.js marquer relu`    : idem, après une relecture dont les défauts confirmés sont corrigés ;
// - sans argument : crochet PreToolUse de Claude Code (.claude/settings.json) — lit l'appel d'outil sur l'entrée standard et refuse
//   (code 2) un `git push` vers `main` dont l'arbre n'a pas ces deux marques.
// L'empreinte est celle de l'arbre git du contenu (fichiers suivis + nouveaux fichiers non ignorés) : un commit qui ne change rien au
// contenu garde la même empreinte, une seule modification après la vérification la change.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ETAPES = ['verifie', 'relu'];
const LIBELLES = { verifie: 'npm run verifier', relu: 'la relecture indépendante (/relire), puis node scripts/garde-publication.js marquer relu' };

/** Pure : les morceaux d'une ligne de commande séparés par &&, ||, ; ou | (hors guillemets simples ou doubles). @param {string} commande */
function segmentsCommande(commande) {
  const sortie = [];
  let courant = '';
  let guillemet = '';
  const t = String(commande || '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemet) { if (c === guillemet) guillemet = ''; courant += c; continue; }
    if (c === '"' || c === "'") { guillemet = c; courant += c; continue; }
    if (c === ';' || c === '\n' || c === '|' || (c === '&' && t[i + 1] === '&')) {
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

/** Pure : les mots d'un morceau de commande, guillemets retirés. @param {string} segment */
function motsSegment(segment) {
  return (String(segment).match(/"[^"]*"|'[^']*'|\S+/g) || []).map((m) => m.replace(/^["']|["']$/g, ''));
}

/**
 * Pure : ce morceau de commande pousse-t-il vers `main` ? `brancheCourante` sert pour un `git push` sans destination.
 * @param {string} segment @param {string} brancheCourante
 */
function pousseVersMain(segment, brancheCourante) {
  const mots = motsSegment(segment);
  const iGit = mots.findIndex((m, i) => /(^|\/)git$/.test(m) && mots.slice(i + 1).includes('push'));
  if (iGit < 0) return false;
  const apres = mots.slice(mots.indexOf('push', iGit) + 1);
  const options = apres.filter((m) => m.startsWith('-'));
  if (options.some((o) => o === '--all' || o === '--mirror')) return true;
  const positionnels = [];
  for (let i = 0; i < apres.length; i++) {
    const m = apres[i];
    if (m.startsWith('-')) { if (['-o', '--push-option', '--repo', '--receive-pack', '--exec'].includes(m)) i++; continue; }
    positionnels.push(m);
  }
  const refspecs = positionnels.slice(1); // le premier est le dépôt distant
  if (!refspecs.length) return brancheCourante === 'main';
  return refspecs.some((r) => {
    const dst = (r.includes(':') ? r.slice(r.lastIndexOf(':') + 1) : r).replace(/^\+/, '');
    const cible = dst || (r.includes(':') ? '' : r);
    return cible === 'main' || cible === 'refs/heads/main' || (cible === 'HEAD' && brancheCourante === 'main');
  });
}

/** Pure : la commande contient-elle un envoi vers `main` ? @param {string} commande @param {string} brancheCourante */
function commandePousseVersMain(commande, brancheCourante) {
  return segmentsCommande(commande).some((s) => pousseVersMain(s, brancheCourante));
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

function marquer(etape) {
  if (!ETAPES.includes(etape)) throw new Error(`Étape inconnue : ${etape} (verifie ou relu).`);
  const dossier = dossierMarques();
  fs.mkdirSync(dossier, { recursive: true });
  const empreinte = empreinteArbreTravail();
  fs.writeFileSync(path.join(dossier, etape), empreinte + '\n');
  console.log(`Garde de publication : « ${etape} » noté pour ce contenu (${empreinte.slice(0, 10)}).`);
}

/** Les étapes qui manquent pour le contenu de HEAD (ce qu'un push envoie). */
function etapesManquantes() {
  const dossier = dossierMarques();
  const arbre = git(['rev-parse', 'HEAD^{tree}']);
  return ETAPES.filter((e) => { try { return fs.readFileSync(path.join(dossier, e), 'utf8').trim() !== arbre; } catch (_) { return true; } });
}

function crochet() {
  let entree = '';
  try { entree = fs.readFileSync(0, 'utf8'); } catch (_) { return 0; }
  let appel = null;
  try { appel = JSON.parse(entree); } catch (_) { return 0; }
  const commande = appel && appel.tool_input && typeof appel.tool_input.command === 'string' ? appel.tool_input.command : '';
  if (!commande || !/\bpush\b/.test(commande)) return 0;
  let branche = '';
  try { branche = git(['rev-parse', '--abbrev-ref', 'HEAD']); } catch (_) { return 0; }
  if (!commandePousseVersMain(commande, branche)) return 0;
  const manque = etapesManquantes();
  if (!manque.length) return 0;
  process.stderr.write(`Envoi sur main refusé par la garde de publication de CLAIRE : le contenu de HEAD n'a pas passé ${manque.map((e) => LIBELLES[e]).join(' ni ')}.\n` +
    'Lancer ce qui manque APRÈS la dernière modification (une modification ou un commit qui change le contenu efface les marques), puis renvoyer.\n');
  return 2;
}

if (require.main === module) {
  if (process.argv[2] === 'marquer') { marquer(process.argv[3]); process.exit(0); }
  process.exit(crochet());
}

module.exports = { segmentsCommande, motsSegment, pousseVersMain, commandePousseVersMain };
