'use strict';

// Sauvegarde automatique de la base, une fois par jour.
//
// Avant ce module, tous les dossiers vivaient dans UN SEUL fichier (data/claire.db, à côté de
// l'exécutable) et rien ne le copiait nulle part : une panne du disque du poste serveur, un
// fichier corrompu ou une fausse manipulation faisait tout perdre. C'est le point qui bloquait le
// passage de CLAIRE en bêta.
//
// Déroulé d'une sauvegarde, dans cet ordre et pour ces raisons :
//   1. `VACUUM INTO` vers un fichier temporaire LOCAL, à côté de la base. C'est la manière
//      d'obtenir une copie cohérente d'une base SQLite ouverte (une simple copie du fichier
//      pendant une écriture peut donner un fichier corrompu). L'opération est synchrone, mais sur
//      le disque local et une base de quelques mégaoctets elle dure quelques millisecondes.
//   2. Vérification de cette copie (`PRAGMA integrity_check` + nombre de dossiers) : une
//      sauvegarde qu'on n'a jamais relue ne prouve rien.
//   3. Copie ASYNCHRONE vers le dossier de destination (le NAS en pratique). Jamais de
//      `VACUUM INTO` directement sur le NAS : une écriture synchrone sur un partage réseau lent
//      figerait tout le serveur, exactement le défaut déjà corrigé sur la relecture du NAS
//      (voir nas.js). La copie passe par un nom provisoire puis est renommée : une copie coupée en
//      route ne laisse jamais un fichier tronqué sous un nom de sauvegarde valide.
//   4. Rotation : seules les `NB_SAUVEGARDES_CONSERVEES` plus récentes restent. Seuls les fichiers
//      au nom exact d'une sauvegarde sont supprimés, jamais autre chose du dossier.

const fsp = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const NB_SAUVEGARDES_CONSERVEES = 14;
// Le minuteur vérifie toutes les heures si la sauvegarde du jour est faite : un serveur démarré
// tard, ou redémarré, la rattrape sans attendre le lendemain.
const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000;
const DELAI_PREMIERE_VERIFICATION_MS = 2 * 60 * 1000;
// « claire-AAAA-MM-JJ.db » (la sauvegarde du jour), ou « claire-AAAA-MM-JJ-HHMMSS.db » pour une seconde le même jour.
const RE_NOM_SAUVEGARDE = /^claire-\d{4}-\d{2}-\d{2}(?:-\d{6})?\.db$/;
// Au-delà, l'écran signale une sauvegarde en retard (voir script.js) : une journée peut manquer
// sans alarme (poste éteint le week-end), pas davantage.
const JOURS_AVANT_ALERTE = 3;

function jourLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nomFichierSauvegarde(date) {
  return `claire-${jourLocal(date)}.db`;
}

// Pure : parmi les noms d'un dossier, ceux à supprimer pour n'en garder que `nb`. Le nom porte la
// date au format AAAA-MM-JJ, donc l'ordre alphabétique est l'ordre chronologique.
function sauvegardesARetirer(noms, nb = NB_SAUVEGARDES_CONSERVEES) {
  const valides = (noms || []).filter((n) => RE_NOM_SAUVEGARDE.test(n)).sort(comparerNomsSauvegarde).reverse();
  return valides.slice(nb);
}

// Ordre chronologique des noms : la sauvegarde du jour (sans heure) avant celles prises ensuite le même jour.
function comparerNomsSauvegarde(a, b) {
  const cle = (n) => n.replace(/\.db$/, '').replace(/^(claire-\d{4}-\d{2}-\d{2})$/, '$1-000000');
  return cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : 0;
}

// Où partent les sauvegardes : le dossier choisi dans les Réglages, sinon un dossier `sauvegardes`
// à côté de la base — mieux que rien, mais sur le même disque, donc sans protection contre une
// panne de ce disque. L'écran le dit tant qu'aucun dossier n'est choisi.
function destinationSauvegarde(dossierChoisi, cheminDb) {
  if (dossierChoisi) return { dossier: dossierChoisi, locale: false };
  return { dossier: path.join(path.dirname(cheminDb), 'sauvegardes'), locale: true };
}

// Pure : un dossier de destination saisi dans les Réglages. Vide = pas de dossier choisi. Sinon il
// doit être absolu (C:\…, \\serveur\partage\…, ou /… en développement) : un chemin relatif
// dépendrait du répertoire de lancement de l'exécutable, qui change selon qu'on le lance à la
// main, par le .vbs ou par le service.
function validerDossierSauvegarde(valeur) {
  const v = typeof valeur === 'string' ? valeur.trim() : '';
  if (!v) return { ok: true, dossier: '' };
  if (v.length > 500) return { ok: false, erreur: 'Chemin trop long.' };
  if (!path.isAbsolute(v) && !path.win32.isAbsolute(v)) {
    return { ok: false, erreur: 'Indiquez un chemin complet, par exemple \\\\NAS\\Sauvegardes\\CLAIRE ou D:\\Sauvegardes\\CLAIRE.' };
  }
  return { ok: true, dossier: v };
}

function verifierCopie(chemin) {
  const copie = new DatabaseSync(chemin);
  try {
    const integrite = copie.prepare('PRAGMA integrity_check').get();
    const valeur = integrite ? Object.values(integrite)[0] : null;
    if (valeur !== 'ok') throw new Error(`copie invalide (${valeur || 'contrôle impossible'})`);
    const n = copie.prepare('SELECT COUNT(*) AS n FROM dossiers WHERE deleted_at IS NULL').get();
    return n ? n.n : 0;
  } finally {
    copie.close();
  }
}

// `options.dossierChoisi` : destination réglée par l'étude (vide = dossier local par défaut).
// `options.maintenant` : injectable pour les tests.
async function executerSauvegarde(db, cheminDb, options = {}) {
  const maintenant = options.maintenant || new Date();
  const { dossier, locale } = destinationSauvegarde(options.dossierChoisi || '', cheminDb);
  const nom = nomFichierSauvegarde(maintenant);
  const resultat = {
    at: maintenant.toISOString(), ok: false, fichier: nom, dossier, locale,
    taille: 0, nbDossiers: 0, supprimes: [], erreur: null
  };
  // Le fichier temporaire vit à côté de la base (même disque, local), jamais sur le NAS.
  const temporaire = path.join(path.dirname(cheminDb), `.claire-sauvegarde-${process.pid}.tmp`);
  try {
    await fsp.rm(temporaire, { force: true });
    db.exec(`VACUUM INTO '${temporaire.replace(/'/g, "''")}'`);
    resultat.nbDossiers = verifierCopie(temporaire);
    resultat.taille = (await fsp.stat(temporaire)).size;

    await fsp.mkdir(dossier, { recursive: true });
    // Une seconde sauvegarde le même jour (bouton des Réglages) ne remplace jamais celle du matin (audit 12/10 : une base
    // abîmée dans la journée écrasait la dernière bonne copie) : elle prend l'heure dans son nom.
    let cible = path.join(dossier, nom);
    if (await fsp.stat(cible).then(() => true, () => false)) {
      const hms = [maintenant.getHours(), maintenant.getMinutes(), maintenant.getSeconds()].map((x) => String(x).padStart(2, '0')).join('');
      resultat.fichier = nom.replace(/\.db$/, `-${hms}.db`);
      cible = path.join(dossier, resultat.fichier);
    }
    const provisoire = `${cible}.partiel`;
    await fsp.copyFile(temporaire, provisoire);
    await fsp.rename(provisoire, cible);

    const noms = await fsp.readdir(dossier);
    for (const n of sauvegardesARetirer(noms)) {
      try {
        await fsp.rm(path.join(dossier, n), { force: true });
        resultat.supprimes.push(n);
      } catch (e) { /* une ancienne sauvegarde qu'on ne peut pas supprimer n'est pas un échec */ }
    }
    resultat.ok = true;
  } catch (e) {
    resultat.erreur = e.message;
  } finally {
    await fsp.rm(temporaire, { force: true }).catch(() => {});
  }
  return resultat;
}

// Pure : la sauvegarde du jour est-elle déjà faite ?
function sauvegardeDuJourFaite(etat, maintenant) {
  if (!etat || !etat.derniereReussie) return false;
  return jourLocal(etat.derniereReussie) === jourLocal(maintenant || new Date());
}

// Enregistre le résultat d'une tentative dans l'état persisté : la dernière TENTATIVE (réussie ou
// non) et, séparément, la dernière RÉUSSITE — c'est l'âge de celle-ci qui déclenche l'alerte.
function etatApresTentative(etatPrecedent, resultat) {
  const etat = { ...(etatPrecedent || {}) };
  etat.derniereTentative = resultat;
  if (resultat.ok) etat.derniereReussie = resultat.at;
  return etat;
}

// Pure : jours écoulés depuis la dernière réussite, `null` si jamais réussie.
function joursDepuisDerniereSauvegarde(etat, maintenant) {
  if (!etat || !etat.derniereReussie) return null;
  const debut = new Date(`${jourLocal(etat.derniereReussie)}T00:00:00`);
  const fin = new Date(`${jourLocal(maintenant || new Date())}T00:00:00`);
  return Math.round((fin - debut) / 86400000);
}

// Une seule sauvegarde à la fois, que le déclenchement vienne du minuteur ou du bouton des
// Réglages : les deux partagent le même fichier temporaire. Un second appel pendant qu'une
// sauvegarde tourne reçoit simplement le résultat de celle-ci.
let sauvegardeEnCours = null;

function sauvegarderEtEnregistrer(db, cheminDb, parametresRepo, maintenant) {
  if (sauvegardeEnCours) return sauvegardeEnCours;
  sauvegardeEnCours = sauvegarderMaintenant(db, cheminDb, parametresRepo, maintenant)
    .finally(() => { sauvegardeEnCours = null; });
  return sauvegardeEnCours;
}

async function sauvegarderMaintenant(db, cheminDb, parametresRepo, maintenant) {
  const reglage = parametresRepo.lireReglageSauvegarde();
  const resultat = await executerSauvegarde(db, cheminDb, { dossierChoisi: reglage.dossier, maintenant });
  parametresRepo.ecrireEtatSauvegarde(etatApresTentative(parametresRepo.lireEtatSauvegarde(), resultat));
  if (!resultat.ok) console.warn('[CLAIRE] Sauvegarde de la base impossible :', resultat.erreur);
  return resultat;
}

// Démarré uniquement par index.js (jamais par app.js, pour ne pas lancer ce minuteur dans les
// tests qui montent l'application) — même principe que la surveillance du NAS et les rappels.
function demarrerSauvegardeAutomatique(db, config, parametresRepo) {
  if (!config.cheminDb || config.cheminDb === ':memory:') return null;
  const verifier = async () => {
    if (sauvegardeDuJourFaite(parametresRepo.lireEtatSauvegarde())) return;
    try {
      await sauvegarderEtEnregistrer(db, config.cheminDb, parametresRepo);
    } catch (e) {
      console.warn('[CLAIRE] Sauvegarde de la base interrompue :', e.message);
    }
  };
  setTimeout(verifier, DELAI_PREMIERE_VERIFICATION_MS);
  return setInterval(verifier, INTERVALLE_VERIFICATION_MS);
}

module.exports = {
  NB_SAUVEGARDES_CONSERVEES, JOURS_AVANT_ALERTE, RE_NOM_SAUVEGARDE, comparerNomsSauvegarde,
  jourLocal, nomFichierSauvegarde, sauvegardesARetirer, destinationSauvegarde, validerDossierSauvegarde,
  executerSauvegarde, sauvegardeDuJourFaite, etatApresTentative, joursDepuisDerniereSauvegarde,
  sauvegarderEtEnregistrer, demarrerSauvegardeAutomatique
};
