'use strict';

// Mise à jour de CLAIRE-serveur.exe en un clic, depuis l'écran Réglages — demandée par l'étude
// (« Est-il possible que tu puisses envoyer les nouvelles versions directement sur le PC de
// l'office ? » puis « seulement avec un clic »). Chaque push sur `main` reconstruit l'exécutable et
// le publie en release GitHub (voir .github/workflows/build-exe.yml) ; il manquait la dernière
// étape, le récupérer sur le poste serveur. Rien n'est JAMAIS installé sans un clic : le serveur ne
// fait que dire qu'une version plus récente existe.
//
// Déroulé d'une installation (routes/miseAJour.js) : sauvegarde de la base → téléchargement de
// l'exécutable à côté de l'actuel → contrôle de sa taille et de son empreinte SHA-256 (celle que
// GitHub publie avec la release) → échange des fichiers → redémarrage. Windows autorise à RENOMMER
// un exécutable en cours d'exécution (pas à l'écraser ni à le supprimer) : l'actuel devient
// `CLAIRE-serveur.ancien.exe`, le nouveau prend sa place, et le processus relance ce chemin avant
// de s'arrêter (voir index.js). L'ancien reste sur le disque : c'est le retour arrière, à la main,
// si la nouvelle version ne démarrait pas.
//
// Le dépôt passant en privé à la demande de l'étude, l'accès aux releases demande un jeton GitHub
// en lecture seule, saisi dans les Réglages et gardé en base — il ne ressort jamais par une route,
// même discipline que le mot de passe SMTP et la clé API Anthropic.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEPOT_GITHUB = 'blursquare/Office-suivi';
const PREFIXE_TAG = 'serveur-exe-';
const NOM_EXE = 'CLAIRE-serveur.exe';
const NOM_EXE_NOUVEAU = 'CLAIRE-serveur.nouveau.exe';
const NOM_EXE_ANCIEN = 'CLAIRE-serveur.ancien.exe';
// Un exécutable Node SEA pèse ~90 Mo : en dessous de ce plancher, ce n'est pas l'exécutable (page
// d'erreur, fichier tronqué) — refusé avant même le contrôle d'empreinte.
const TAILLE_MIN_EXE = 20 * 1024 * 1024;
const DELAI_API_MS = 20 * 1000;
const DELAI_TELECHARGEMENT_MS = 10 * 60 * 1000;

function numeroBuild(tag) {
  const m = typeof tag === 'string' && tag.startsWith(PREFIXE_TAG) ? /^(\d+)$/.exec(tag.slice(PREFIXE_TAG.length)) : null;
  return m ? Number(m[1]) : null;
}

// build-info.json est écrit par le script de construction (voir build-windows-exe.mjs) et embarqué
// dans l'exécutable : c'est ainsi qu'un .exe sait quel build il est. Un exécutable construit avant
// cette fonctionnalité n'en a pas — la version installée est alors « inconnue », ce qui n'empêche
// pas d'installer la dernière (avec une confirmation qui le dit).
function lireBuildInstalle(sea) {
  try {
    if (!sea || !sea.isSea()) return null;
    const info = JSON.parse(sea.getAsset('build-info.json', 'utf8'));
    const build = Number.isInteger(info.build) ? info.build : Number.parseInt(info.build, 10);
    return {
      build: Number.isInteger(build) && build > 0 ? build : null,
      commit: typeof info.commit === 'string' ? info.commit.slice(0, 40) : '',
      date: typeof info.date === 'string' ? info.date : ''
    };
  } catch (_) {
    return null;
  }
}

function entetesGithub(jeton, accept) {
  const h = { 'User-Agent': 'CLAIRE-serveur', Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (jeton) h.Authorization = `Bearer ${jeton}`;
  return h;
}

// Message lisible par l'étude pour un refus de GitHub. Un dépôt privé interrogé sans jeton (ou
// avec un jeton qui n'y a pas accès) répond 404, pas 403 : GitHub ne dit pas qu'un dépôt privé
// existe à qui n'y a pas accès — d'où un 404 qui parle d'abord du jeton.
function messageErreurGithub(statut, avecJeton) {
  if (statut === 401) return 'Jeton GitHub refusé (expiré ou révoqué) : créez-en un nouveau et enregistrez-le dans les Réglages.';
  if (statut === 404) {
    return avecJeton
      ? "Dépôt introuvable avec ce jeton : vérifiez qu'il donne accès au dépôt Office-suivi (droit « Contents : lecture »)."
      : 'Dépôt introuvable : il est privé, un jeton GitHub en lecture seule doit être enregistré dans les Réglages.';
  }
  if (statut === 403 || statut === 429) return 'GitHub limite temporairement les requêtes : réessayez dans quelques minutes.';
  return `GitHub a répondu une erreur (${statut}) : réessayez plus tard.`;
}

function erreurGithub(statut, avecJeton) {
  const e = new Error(messageErreurGithub(statut, avecJeton));
  e.statut = statut;
  return e;
}

async function appelAvecDelai(fetchFn, url, options, delaiMs) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  try {
    return await fetchFn(url, { ...options, signal: controleur.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('GitHub ne répond pas (délai dépassé) : vérifiez la connexion internet du poste serveur.');
    throw new Error("Impossible de joindre GitHub depuis le poste serveur (connexion internet ?).");
  } finally {
    clearTimeout(minuteur);
  }
}

// Lit la release la plus récente et en extrait ce qu'il faut pour l'installer. Pure au sens de
// ses dépendances : `fetchFn` est injectable (tests sans réseau).
async function derniereVersionDisponible({ jeton, fetchFn = fetch, depot = DEPOT_GITHUB } = {}) {
  const r = await appelAvecDelai(fetchFn, `https://api.github.com/repos/${depot}/releases/latest`, { headers: entetesGithub(jeton) }, DELAI_API_MS);
  if (!r.ok) throw erreurGithub(r.status, !!jeton);
  const release = await r.json();
  const asset = (release.assets || []).find((a) => a && a.name === NOM_EXE);
  if (!asset) throw new Error(`La dernière publication (${release.tag_name || '?'}) ne contient pas ${NOM_EXE}.`);
  const empreinte = typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(asset.digest)
    ? asset.digest.slice(7).toLowerCase() : '';
  const commit = /commit ([0-9a-f]{7,40})/i.exec(release.body || '');
  return {
    build: numeroBuild(release.tag_name),
    tag: release.tag_name || '',
    publieLe: release.published_at || release.created_at || '',
    commit: commit ? commit[1] : '',
    asset: { id: asset.id, url: asset.url, taille: asset.size, sha256: empreinte }
  };
}

// 'a-jour' | 'disponible' | 'inconnu' (build installé ou disponible illisible — l'installation
// reste possible, mais on ne peut pas dire si elle apporte quelque chose).
function comparerVersions(installe, disponible) {
  const a = installe && installe.build;
  const b = disponible && disponible.build;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return 'inconnu';
  return b > a ? 'disponible' : 'a-jour';
}

function cheminsExecutable(dossierExe) {
  return {
    actuel: path.join(dossierExe, NOM_EXE),
    nouveau: path.join(dossierExe, NOM_EXE_NOUVEAU),
    ancien: path.join(dossierExe, NOM_EXE_ANCIEN),
    partiel: path.join(dossierExe, `${NOM_EXE_NOUVEAU}.partiel`)
  };
}

// Télécharge l'exécutable vers `destination` en passant par un `.partiel` renommé à la fin (un
// fichier coupé en route ne peut jamais être pris pour un exécutable complet), et contrôle sa
// taille et son empreinte au fil de l'écriture. L'URL de l'API renvoie vers le stockage de
// GitHub ; `fetch` suit la redirection et retire alors lui-même l'en-tête Authorization (autre
// origine), l'URL de destination étant déjà signée.
async function telechargerExecutable({ asset, jeton, destination, fetchFn = fetch, tailleMin = TAILLE_MIN_EXE }) {
  if (!asset || !asset.url) throw new Error('Publication sans exécutable à télécharger.');
  if (!asset.sha256) throw new Error("GitHub n'a pas publié l'empreinte de cet exécutable : installation refusée par prudence.");
  const partiel = `${destination}.partiel`;
  await fsp.rm(partiel, { force: true });
  const r = await appelAvecDelai(fetchFn, asset.url, { headers: entetesGithub(jeton, 'application/octet-stream'), redirect: 'follow' }, DELAI_TELECHARGEMENT_MS);
  if (!r.ok || !r.body) throw erreurGithub(r.status, !!jeton);

  const hachage = crypto.createHash('sha256');
  let taille = 0;
  const sortie = fs.createWriteStream(partiel);
  try {
    for await (const morceau of r.body) {
      const tampon = Buffer.from(morceau);
      hachage.update(tampon);
      taille += tampon.length;
      if (!sortie.write(tampon)) await new Promise((ok) => sortie.once('drain', ok));
    }
    await new Promise((ok, ko) => sortie.end((e) => (e ? ko(e) : ok())));
  } catch (e) {
    sortie.destroy();
    await fsp.rm(partiel, { force: true });
    throw new Error(`Téléchargement interrompu : ${e.message}`);
  }

  const empreinte = hachage.digest('hex');
  const probleme = taille < tailleMin ? `fichier trop petit (${taille} octets)`
    : (asset.taille && taille !== asset.taille) ? `taille ${taille} au lieu de ${asset.taille}`
      : empreinte !== asset.sha256 ? 'empreinte SHA-256 différente de celle publiée par GitHub' : '';
  if (probleme) {
    await fsp.rm(partiel, { force: true });
    throw new Error(`Fichier téléchargé refusé : ${probleme}. Rien n'a été changé.`);
  }
  await fsp.rm(destination, { force: true });
  await fsp.rename(partiel, destination);
  return { taille, sha256: empreinte };
}

// Échange les fichiers : actuel → ancien, nouveau → actuel. Si la seconde étape échoue, la
// première est défaite : on ne laisse jamais le dossier sans CLAIRE-serveur.exe.
async function echangerExecutables(chemins, fsImpl = fsp) {
  await fsImpl.rm(chemins.ancien, { force: true });
  await fsImpl.rename(chemins.actuel, chemins.ancien);
  try {
    await fsImpl.rename(chemins.nouveau, chemins.actuel);
  } catch (e) {
    try { await fsImpl.rename(chemins.ancien, chemins.actuel); } catch (_) { /* voir message */ }
    throw new Error(`Remplacement de l'exécutable impossible (${e.message}). L'ancienne version est conservée.`);
  }
}

module.exports = {
  DEPOT_GITHUB, NOM_EXE, NOM_EXE_ANCIEN, TAILLE_MIN_EXE,
  numeroBuild, lireBuildInstalle, messageErreurGithub, derniereVersionDisponible, comparerVersions,
  cheminsExecutable, telechargerExecutable, echangerExecutables
};
