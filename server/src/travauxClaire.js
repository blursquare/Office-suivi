// @ts-check
'use strict';
// Les travaux confiés à CLAIRE (étude 27/10 : « tu peux lui faire faire les tâches en arrière-plan ? » — choix : les travaux confiés) :
// une FILE sur le serveur (clé `poste-claire-travaux`, 50 au plus), traitée l'un après l'autre par son ordinateur virtuel (posteClaire.js),
// sans bloquer l'écran de celui qui confie. À la fin, le compte rendu est gardé avec le travail et une proposition « À savoir » prévient la
// personne (profil de CLAIRE, canal général). Un travail resté « en cours » au redémarrage du serveur est noté interrompu, jamais refait seul.

const crypto = require('node:crypto');

const CLE_TRAVAUX = 'poste-claire-travaux';
const MAX_TRAVAUX = 50;
const ETATS_TRAVAIL = ['attente', 'en-cours', 'fini', 'erreur', 'annule'];
// Un travail ne bloque jamais la file (étude 31/10 : « quand je lui envoie une tâche, si elle dit qu'elle le fait en arrière-plan, il faut
// vraiment qu'elle le fasse » — un travail resté « en attente » sans fin) : au-delà de 20 min (délai de la fenêtre), il est arrêté, la fenêtre fermée, et noté non terminé ; 25 min = filet si la fenêtre ne répond plus.
const DELAI_MAX_TRAVAIL_MS = 25 * 60 * 1000;

/** @param {any} v @param {number} max */
const borne = (v, max) => String(v == null ? '' : v).replace(/\u0000/g, '').slice(0, max);

/** Pure : une liste de travaux propre. @param {any} brut */
function assainirTravaux(brut) {
  return (Array.isArray(brut) ? brut : []).filter((t) => t && typeof t === 'object' && t.id).map((t) => ({
    id: borne(t.id, 40), consigne: borne(t.consigne, 4000), demandeur: borne(t.demandeur, 80),
    etat: ETATS_TRAVAIL.includes(t.etat) ? t.etat : 'erreur',
    creeLe: borne(t.creeLe, 40), debutLe: borne(t.debutLe, 40), finLe: borne(t.finLe, 40),
    resultat: borne(t.resultat, 8000), erreur: borne(t.erreur, 300)
  })).slice(-MAX_TRAVAUX);
}

/** Pure : ajoute un travail en attente. @param {any[]} liste @param {string} consigne @param {string} demandeur @param {Date} [maintenant] */
function ajouterTravail(liste, consigne, demandeur, maintenant) {
  const t = { id: 'tr-' + crypto.randomBytes(8).toString('base64url'), consigne: borne(consigne, 4000).trim(), demandeur: borne(demandeur, 80),
    etat: 'attente', creeLe: (maintenant || new Date()).toISOString(), debutLe: '', finLe: '', resultat: '', erreur: '' };
  // Les plus anciens travaux FINIS partent d'abord ; jamais un travail encore à faire.
  let l = [...liste, t];
  while (l.length > MAX_TRAVAUX) {
    const i = l.findIndex((x) => x.etat !== 'attente' && x.etat !== 'en-cours');
    if (i < 0) break;
    l = l.slice(0, i).concat(l.slice(i + 1));
  }
  return { liste: l, travail: t };
}

/** Pure : ce qu'une personne voit — ses travaux, ou tous pour un administrateur ; le plus récent d'abord. @param {any[]} liste @param {string} qui @param {boolean} tous */
function travauxVisibles(liste, qui, tous) {
  return liste.filter((t) => tous || t.demandeur === qui).slice().reverse();
}

/**
 * @param {{ repo: any, poste: any, deposer: (p: any) => any, journal?: (m: string) => void, maintenant?: () => Date, delaiMaxMs?: number }} o
 */
function creerFileTravaux(o) {
  const maintenant = o.maintenant || (() => new Date());
  const lire = () => assainirTravaux(o.repo.lireJsonBrut(CLE_TRAVAUX, []));
  const ecrire = (l) => o.repo.ecrireJsonBrut(CLE_TRAVAUX, l);
  let enMarche = false;

  // Au démarrage : un travail resté « en cours » a été coupé par l'arrêt du serveur.
  const auDemarrage = lire().map((t) => (t.etat === 'en-cours' ? Object.assign({}, t, { etat: 'erreur', erreur: 'Interrompu par un redémarrage du serveur.', finLe: maintenant().toISOString() }) : t));
  ecrire(auDemarrage);

  /** @param {string} id @param {any} champs */
  const majTravail = (id, champs) => { const l = lire(); const i = l.findIndex((x) => x.id === id); if (i >= 0) { l[i] = Object.assign({}, l[i], champs); ecrire(l); } return l[i]; };

  async function traiter() {
    if (enMarche) return;
    enMarche = true;
    try {
      for (;;) {
        const suivant = lire().find((t) => t.etat === 'attente');
        if (!suivant) break;
        majTravail(suivant.id, { etat: 'en-cours', debutLe: maintenant().toISOString() });
        let fin;
        try {
          let minuterie;
          const delai = new Promise((_, ko) => { minuterie = setTimeout(() => ko(new Error('Arrêté : la fenêtre de CLAIRE ne répondait plus.')), o.delaiMaxMs || DELAI_MAX_TRAVAIL_MS); });
          let r;
          try { r = await Promise.race([o.poste.travailler(suivant.consigne), delai]); }
          catch (e) { if (o.poste.arreter) await Promise.resolve(o.poste.arreter()).catch(() => {}); throw e; }   // la fenêtre fermée : rien ne continue derrière
          finally { clearTimeout(minuterie); }
          fin = majTravail(suivant.id, { etat: 'fini', finLe: maintenant().toISOString(), resultat: typeof r === 'string' ? r : JSON.stringify(r || '') });
        } catch (e) {
          fin = majTravail(suivant.id, { etat: 'erreur', finLe: maintenant().toISOString(), erreur: String(e && e.message || e).slice(0, 300) });
        }
        // La personne est prévenue : un message de CLAIRE dans sa conversation, avec le compte rendu (routes/posteClaire.js).
        try {
          if (fin) o.deposer({ id: 'pc-' + fin.id, routine: 'poste-claire', responsable: fin.demandeur, type: 'alerte', empreinte: 'poste-claire-fini:' + fin.id,
            titre: (fin.etat === 'fini' ? 'Travail terminé : ' : 'Travail non terminé : ') + fin.consigne.slice(0, 100),
            resume: (fin.etat === 'fini' ? fin.resultat : fin.erreur).slice(0, 3500) });
        } catch (e) { if (o.journal) o.journal('travail de CLAIRE : prévenir le demandeur a échoué'); }
      }
    } finally { enMarche = false; }
  }

  return {
    /** @param {string} consigne @param {string} demandeur */
    confier(consigne, demandeur) {
      const r = ajouterTravail(lire(), consigne, demandeur, maintenant());
      ecrire(r.liste);
      setImmediate(() => { traiter().catch(() => {}); });
      return { travail: r.travail, position: r.liste.filter((t) => t.etat === 'attente').length };
    },
    /** @param {string} id @param {string} qui @param {boolean} admin */
    annuler(id, qui, admin) {
      const t = lire().find((x) => x.id === id);
      if (!t) return { erreur: 404 };
      if (t.demandeur !== qui && !admin) return { erreur: 403 };
      if (t.etat !== 'attente') return { erreur: 409 };
      return { travail: majTravail(id, { etat: 'annule', finLe: maintenant().toISOString() }) };
    },
    lister: (qui, tous) => travauxVisibles(lire(), qui, tous),
    reprendre: () => traiter(),
    /** Vrai pendant qu'un travail est traité (pour le dire à l'écran). */
    enMarche: () => enMarche
  };
}

module.exports = { CLE_TRAVAUX, MAX_TRAVAUX, assainirTravaux, ajouterTravail, travauxVisibles, creerFileTravaux };
