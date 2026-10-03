'use strict';

// Outil « Noms de fichiers du NAS » (étude, 03/10 : « un outil qui scanne le dossier commun sur le NAS,
// repère les pièces d'un dossier dont tu as besoin pour la check-list, classe les noms de fichiers par
// forme qui se ressemble et par type attendu, et moi je te dis si c'est le bon document […] tu garderas
// les styles de rédaction de nom de fichier dans ta base de données […] une sorte d'apprentissage pour
// améliorer le regex de détection des pièces sur le NAS »).
//
// Le serveur fait deux choses, le reste (formes, groupes, termes élargis, reconnaissance) vit dans le
// navigateur, là où sont déjà les motifs des pièces (script.js) :
//  1. Parcourir TOUT le dossier commun (`config.nasRacine`), dossier client par dossier client, et en
//     relever les NOMS des PDF — jamais leur contenu. En arrière-plan, un parcours à la fois, gardé en
//     mémoire seulement (ces noms citent les clients : ils ne sont ni écrits en base ni journalisés).
//  2. Garder les décisions de l'étude sur une FORME de nom (« diag erp # rue … ») pour une pièce :
//     « oui » (c'est bien cette pièce : la forme est reconnue désormais) ou « non » (ce n'est pas elle :
//     la forme est écartée pour cette pièce, même si le motif la prenait). Clé `formes-noms-apprises`.
//     Le rapport technique reprend les formes décidées (anonymisées) : c'est par là que les motifs
//     fixes de script.js s'enrichissent ensuite.

const path = require('node:path');
const fsp = require('node:fs/promises');
const { listerPdfRecursif, listerSousDossiers } = require('./nas');
const { noterVerification } = require('./verificationsTerrain');

const CLE_FORMES_NOMS = 'formes-noms-apprises';
const MAX_DECISIONS = 3000;
const MAX_FICHIERS_PARCOURS = 200000;
const PARALLELE = 4;
// Dossiers de la racine qui ne sont pas des dossiers clients.
const RE_DOSSIER_IGNORE = /^(?:\.|__MACOSX$|#recycle$|@eaDir$|\$RECYCLE\.BIN$|System Volume Information$)/i;

// ---- Décisions sur les formes ----
const RE_CLE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
// Une forme : des mots (minuscules sans accent, chiffres), « # » (un nombre) et « … » (des mots
// propres au dossier), séparés par une espace. Toujours au moins un vrai mot.
const RE_FORME = /^(?:[a-z0-9]+|#|…)(?: (?:[a-z0-9]+|#|…))*$/;

function texteBorne(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''; }
function formeValide(f) { return typeof f === 'string' && f.length <= 200 && RE_FORME.test(f) && /[a-z]/.test(f); }

// Pure.
function assainirDecisionsFormes(brut) {
  const liste = Array.isArray(brut) ? brut : (brut && Array.isArray(brut.decisions) ? brut.decisions : []);
  const vues = new Set();
  const sortie = [];
  for (const d of liste) {
    if (!d || !RE_CLE.test(String(d.cle || '')) || !formeValide(d.forme) || !['oui', 'non'].includes(d.decision)) continue;
    const k = d.cle + '|' + d.forme;
    if (vues.has(k)) continue;
    vues.add(k);
    sortie.push({
      cle: d.cle, forme: d.forme, decision: d.decision,
      le: typeof d.le === 'string' && !isNaN(Date.parse(d.le)) ? d.le.slice(0, 40) : new Date().toISOString(),
      exemple: texteBorne(d.exemple, 200), fichiers: Number.isInteger(d.fichiers) && d.fichiers >= 0 ? d.fichiers : 0,
      dossiers: Number.isInteger(d.dossiers) && d.dossiers >= 0 ? d.dossiers : 0
    });
    if (sortie.length >= MAX_DECISIONS) break;
  }
  return sortie;
}

function lireDecisionsFormes(parametresRepo) {
  return assainirDecisionsFormes(parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_FORMES_NOMS, []) : []);
}

// Pure : décision posée (ou retirée si `decision` est null), la plus récente en tête.
function appliquerDecisionForme(decisions, { cle, forme, decision, exemple, fichiers, dossiers }, maintenant = new Date().toISOString()) {
  const reste = (decisions || []).filter((d) => !(d.cle === cle && d.forme === forme));
  if (decision !== 'oui' && decision !== 'non') return reste;
  return assainirDecisionsFormes([{ cle, forme, decision, le: maintenant, exemple, fichiers, dossiers }, ...reste]);
}

// Pure : section du rapport technique — totaux par pièce et formes décidées sur la période.
function sectionFormesNoms(decisions, depuis, jusqua, anonymiser = (t) => t) {
  const liste = assainirDecisionsFormes(decisions);
  if (!liste.length) return [];
  const parCle = {};
  for (const d of liste) {
    parCle[d.cle] = parCle[d.cle] || { oui: 0, non: 0 };
    parCle[d.cle][d.decision]++;
  }
  const L = ['', `## Formes de noms de fichiers apprises (${liste.length})`];
  L.push(`- Par pièce : ${Object.entries(parCle).map(([c, n]) => `${c} ${n.oui} oui / ${n.non} non`).join(' · ')}`);
  const recentes = liste.filter((d) => d.le > depuis && d.le <= jusqua);
  if (recentes.length) {
    L.push('- Décidées sur la période (à reporter dans les motifs fixes de script.js) :');
    for (const d of recentes.slice(0, 60)) {
      L.push(`  - ${d.cle} · ${d.decision === 'oui' ? 'OUI' : 'non'} · \`${anonymiser(d.forme).replace(/`/g, 'ˋ')}\` (${d.fichiers} fichier(s), ${d.dossiers} dossier(s))`);
    }
  }
  return L;
}

// ---- Parcours du dossier commun (en mémoire) ----
function etatInitial() {
  return { etat: 'jamais', debut: null, fin: null, dossiersTotal: 0, dossiersLus: 0, fichiers: [], dossiers: [], tronque: false, message: '' };
}
let parcours = etatInitial();

function etatPublicParcours(avecFichiers) {
  const p = parcours;
  const base = {
    etat: p.etat, debut: p.debut, fin: p.fin, dossiersTotal: p.dossiersTotal, dossiersLus: p.dossiersLus,
    nbFichiers: p.fichiers.length, tronque: p.tronque, message: p.message
  };
  // Fichiers : [indexDossier, nom] — l'index suffit à compter les dossiers distincts.
  if (avecFichiers && p.etat === 'pret') base.fichiers = p.fichiers.map((f) => [f.d, f.nom]);
  return base;
}

async function lancerParcoursNoms(racine, { fsImpl = fsp, parametresRepo = null } = {}) {
  if (parcours.etat === 'en-cours') return etatPublicParcours(false);
  parcours = { ...etatInitial(), etat: 'en-cours', debut: new Date().toISOString() };
  const courant = parcours;
  (async () => {
    try {
      const racineAbs = path.resolve(racine);
      const dossiers = (await listerSousDossiers(racineAbs, fsImpl)).filter((n) => !RE_DOSSIER_IGNORE.test(n));
      courant.dossiersTotal = dossiers.length;
      courant.dossiers = dossiers;
      let i = 0;
      const ouvrier = async () => {
        while (i < dossiers.length && !courant.tronque) {
          const index = i++;
          const fichiers = await listerPdfRecursif(path.join(racineAbs, dossiers[index]), fsImpl);
          for (const f of fichiers) {
            if (courant.fichiers.length >= MAX_FICHIERS_PARCOURS) { courant.tronque = true; break; }
            courant.fichiers.push({ d: index, nom: f.nom });
          }
          courant.dossiersLus++;
        }
      };
      await Promise.all(Array.from({ length: PARALLELE }, ouvrier));
      courant.etat = 'pret';
      courant.fin = new Date().toISOString();
      noterVerification(parametresRepo, 'nas-noms-parcours', { detail: `${courant.dossiersLus} dossier(s), ${courant.fichiers.length} PDF` });
    } catch (e) {
      courant.etat = 'erreur';
      courant.fin = new Date().toISOString();
      courant.message = 'Le dossier commun n’a pas pu être parcouru.';
      noterVerification(parametresRepo, 'nas-noms-parcours', { ok: false, message: e && e.code ? `erreur ${e.code}` : 'erreur de lecture' });
    }
  })();
  return etatPublicParcours(false);
}

function reinitialiserParcoursNoms() { parcours = etatInitial(); }

module.exports = {
  CLE_FORMES_NOMS, assainirDecisionsFormes, lireDecisionsFormes, appliquerDecisionForme, sectionFormesNoms,
  lancerParcoursNoms, etatPublicParcours, reinitialiserParcoursNoms, formeValide, MAX_FICHIERS_PARCOURS
};
