'use strict';

// Lecture du NAS de l'étude PAR LE SERVEUR, en remplacement de l'API File System Access du
// navigateur (`showDirectoryPicker`) utilisée jusqu'ici.
//
// Pourquoi ce changement (décision de l'étude) : cette API n'existe QUE dans un contexte sécurisé
// — `localhost` ou HTTPS. Les collaborateurs qui rejoignent l'outil par l'adresse IP du poste
// serveur (`http://192.168.x.x:3000`, le cas normal au bureau) n'ont donc tout simplement pas la
// fonction : impossible pour eux de relier un dossier ou de consulter une pièce, alors que les
// dossiers sont sur un NAS commun, visible par tous. Le serveur, lui, voit ce NAS comme un simple
// chemin de fichiers et peut servir la même chose à tout le monde.
//
// Conséquences heureuses au passage : plus aucune permission à reconfirmer à chaque redémarrage de
// Chrome (la limite la plus pénible de l'ancien mécanisme, qui a demandé une popup de démarrage et
// un bouton groupé pour être supportable), et un seul parcours de fichiers pour tous les postes.
//
// TOUT CE QUI SORT D'ICI EST BORNÉ À LA RACINE CONFIGURÉE. Un chemin arrivant d'une requête HTTP
// est une donnée non fiable : `resoudreCheminNas()` est le seul point de passage, et il refuse
// tout ce qui ne retombe pas à l'intérieur de la racine (voir son commentaire).

const path = require('node:path');
const fs = require('node:fs');

// Mêmes plafonds que ceux déjà éprouvés côté client sur de vrais dossiers de l'étude (voir
// CLAUDE.md, « parcours en largeur ») : un dossier client ancien peut légitimement compter
// plusieurs centaines de PDF entre les scans, courriers et annexes.
const PROFONDEUR_MAX = 6;
const MAX_FICHIERS = 3000;

// Parcours en LARGEUR, comme côté client — et pour exactement la même raison, déjà payée une fois :
// en profondeur, la première rubrique d'un dossier client (« 0 - COMPTABILITE - PRET » et son
// sous-dossier « PRET », des dizaines de relevés scannés) épuise le plafond avant que les rubriques
// suivantes (« 3 - Titre de propriété »…) n'aient jamais été regardées, et leurs pièces ne sont
// alors JAMAIS trouvées quel que soit leur nom.
function listerPdfRecursif(racineAbsolue, fsImpl = fs) {
  const fichiers = [];
  const file = [{ chemin: racineAbsolue, profondeur: 0 }];
  while (file.length > 0 && fichiers.length < MAX_FICHIERS) {
    const courant = file.shift();
    let entrees;
    try {
      entrees = fsImpl.readdirSync(courant.chemin, { withFileTypes: true });
    } catch (_) {
      continue; // dossier illisible (permissions, lien cassé) : ignoré, jamais fatal pour le reste
    }
    const sousDossiers = [];
    for (const entree of entrees) {
      if (entree.isDirectory()) {
        if (courant.profondeur < PROFONDEUR_MAX) {
          sousDossiers.push({ chemin: path.join(courant.chemin, entree.name), profondeur: courant.profondeur + 1 });
        }
      } else if (/\.pdf$/i.test(entree.name)) {
        if (fichiers.length >= MAX_FICHIERS) break;
        const absolu = path.join(courant.chemin, entree.name);
        fichiers.push({ nom: entree.name, chemin: path.relative(racineAbsolue, absolu) });
      }
    }
    // Les fichiers de CE niveau sont déjà pris ci-dessus ; les sous-dossiers partent en fin de
    // file, donc après tous les autres dossiers du même niveau — c'est ça, le parcours en largeur.
    file.push(...sousDossiers);
  }
  return fichiers;
}

function listerSousDossiers(racineAbsolue, fsImpl = fs) {
  let entrees;
  try {
    entrees = fsImpl.readdirSync(racineAbsolue, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  return entrees
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '__MACOSX')
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'fr'));
}

// Normalisation commune au rapprochement de noms : accents retirés, ponctuation et préfixes de
// numérotation ramenés à des espaces. L'étude préfixe ses dossiers NAS par un numéro de rubrique
// ou un code interne (« 2024-118 DUPONT MARTIN »), que le nom du dossier CLAIRE n'a pas.
function normaliserNomRapprochement(nom) {
  return String(nom || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Mots trop courants pour distinguer deux dossiers : les compter ferait matcher n'importe quoi
// avec n'importe quoi. Un nom de dossier CLAIRE est « VENDEUR / ACQUÉREUR ».
const MOTS_IGNORES = new Set(['ET', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'VENTE', 'DOSSIER', 'MME', 'MR', 'M', 'MLLE', 'EPOUX']);

function motsSignificatifs(nom) {
  return normaliserNomRapprochement(nom)
    .split(' ')
    .filter((mot) => mot.length >= 3 && !MOTS_IGNORES.has(mot) && !/^\d+$/.test(mot));
}

// Rapprochement automatique par NOM entre un dossier CLAIRE et un sous-dossier du NAS — méthode
// choisie explicitement par l'étude (plutôt qu'une sélection manuelle systématique ou un identifiant
// à saisir des deux côtés). Le résultat reste TOUJOURS corrigeable à la main : c'est une
// proposition, pas une vérité (voir `changerDossierNas()` côté client).
//
// Score = nombre de mots significatifs du nom CLAIRE retrouvés dans le nom du sous-dossier. Deux
// noms ex æquo ne donnent AUCUN résultat plutôt qu'un choix arbitraire entre deux dossiers clients
// — se tromper de dossier ferait chercher les pièces d'une vente dans celles d'une autre.
function rapprocherParNom(nomDossier, nomsNas) {
  const attendus = motsSignificatifs(nomDossier);
  if (attendus.length === 0) return null;
  let meilleur = null;
  let meilleurScore = 0;
  let exAequo = false;
  for (const candidat of nomsNas || []) {
    const motsCandidat = normaliserNomRapprochement(candidat).split(' ');
    const score = attendus.filter((mot) => motsCandidat.includes(mot)).length;
    if (score === 0) continue;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = candidat;
      exAequo = false;
    } else if (score === meilleurScore) {
      exAequo = true;
    }
  }
  // Un seul mot en commun sur un nom qui en compte plusieurs est un indice trop faible : mieux vaut
  // laisser l'étude choisir que proposer un rapprochement qu'elle devra défaire.
  const suffisant = meilleurScore >= Math.min(2, attendus.length);
  if (exAequo || !suffisant) return null;
  return meilleur;
}

// Correspondance PARFAITE : tous les mots significatifs du nom du dossier se retrouvent dans le nom
// du dossier NAS, et un seul candidat est dans ce cas. C'est le seul niveau auquel le rapprochement
// est appliqué TOUT SEUL, sans demander confirmation (demandé par l'étude) — en dessous, la fenêtre
// de choix s'ouvre avec la proposition en tête de liste.
function rapprochementParfait(nomDossier, nomsNas) {
  const attendus = motsSignificatifs(nomDossier);
  if (attendus.length === 0) return null;
  const complets = (nomsNas || []).filter((candidat) => {
    const motsCandidat = normaliserNomRapprochement(candidat).split(' ');
    return attendus.every((mot) => motsCandidat.includes(mot));
  });
  return complets.length === 1 ? complets[0] : null;
}

// SEUL point de passage d'un chemin venant d'une requête HTTP vers le système de fichiers.
// Renvoie le chemin absolu, ou `null` si la cible sort de la racine — un `..` répété, un chemin
// absolu déguisé ou un lien symbolique qui remonte ailleurs donneraient sinon accès à tout le
// disque du poste serveur. `realpathSync` résout aussi les liens avant le contrôle, sans quoi un
// raccourci posé dans le NAS suffirait à contourner la vérification.
function resoudreCheminNas(racine, cheminRelatif, fsImpl = fs) {
  if (!racine) return null;
  const relatif = String(cheminRelatif || '');
  if (relatif.includes('\0')) return null;
  const racineAbsolue = path.resolve(racine);
  const cible = path.resolve(racineAbsolue, relatif);
  const dansRacine = (c) => c === racineAbsolue || c.startsWith(racineAbsolue + path.sep);
  if (!dansRacine(cible)) return null;
  try {
    // Le chemin peut ne pas exister encore (l'appelant le signalera) : dans ce cas la vérification
    // ci-dessus, purement lexicale, fait foi.
    const reel = fsImpl.realpathSync(cible);
    const racineReelle = fsImpl.realpathSync(racineAbsolue);
    if (reel !== racineReelle && !reel.startsWith(racineReelle + path.sep)) return null;
    return reel;
  } catch (_) {
    return cible;
  }
}

module.exports = {
  listerPdfRecursif,
  listerSousDossiers,
  normaliserNomRapprochement,
  motsSignificatifs,
  rapprocherParNom,
  rapprochementParfait,
  resoudreCheminNas,
  PROFONDEUR_MAX,
  MAX_FICHIERS
};
