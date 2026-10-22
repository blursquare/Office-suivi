// ==== Réponse du FCDDV retrouvée à la racine du COMMUN (étude 22/10) ====
//
// « Pour les FCDDV, s'il n'est pas dans le dossier, regarder à la racine du commun dans le dossier FCDDV et son sous-dossier INTERROGATION. »
// Le serveur liste les PDF de ce dossier (`GET /api/nas/fcddv`, lecture seule, confiné) ; ce fichier les rapproche du DÉFUNT par le nom du
// fichier : TOUS les mots de son nom de famille ET son premier prénom (sans prénom connu, rien n'est retenu : un FCDDV d'un homonyme ne doit jamais être lu pour un autre défunt) ;
// plusieurs fichiers → le plus récent. Le dossier du client du NAS garde la priorité (`fichierFcddv`) ; ceci n'est que le repli.

var fcddvCommunCache = { le: 0, fichiers: null, enCours: null };
var DUREE_CACHE_FCDDV_COMMUN_MS = 60 * 1000;
var PREFIXE_FCDDV_COMMUN = 'FCDDV/';

/** Pure : un texte en mots simples (sans accents, minuscules, 2 lettres au moins). @param {string} t */
function motsFcddvCommun(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length >= 2);
}

/**
 * Pure : le fichier du FCDDV qui désigne ce défunt parmi ceux du dossier commun, ou null — { fichier, plusieurs }.
 * @param {Array<{ chemin: string, nom: string, modifie: string }>} fichiers @param {{ nom?: string, prenoms?: string }} defunt
 */
function fichierFcddvCommunDuDefunt(fichiers, defunt) {
  const nom = motsFcddvCommun(defunt && defunt.nom);
  if (!nom.length) return null;
  const prenom = motsFcddvCommun(defunt && defunt.prenoms)[0] || '';
  if (!prenom) return null; // jamais sur le seul nom de famille : le FCDDV d'un homonyme ne doit pas être lu pour ce défunt (audit 22/10, M1)
  const retenus = (fichiers || []).filter((f) => {
    const mots = motsFcddvCommun(f.nom.replace(/\.pdf$/i, ''));
    return nom.every((m) => mots.includes(m)) && mots.includes(prenom);
  }).sort((a, b) => String(b.modifie).localeCompare(String(a.modifie)));
  return retenus.length ? { fichier: retenus[0], plusieurs: retenus.length } : null;
}

/** La liste du dossier FCDDV du commun, gardée une minute (un « introuvable » 15 s) ; les demandes simultanées partagent un seul appel. */
async function fcddvCommunListe() {
  const duree = fcddvCommunCache.fichiers ? DUREE_CACHE_FCDDV_COMMUN_MS : 15 * 1000;
  if (fcddvCommunCache.le && Date.now() - fcddvCommunCache.le < duree) return fcddvCommunCache.fichiers;
  if (!fcddvCommunCache.enCours) {
    fcddvCommunCache.enCours = (async () => {
      try {
        const r = await fetchAvecAuth('/api/nas/fcddv');
        if (!r.ok) { fcddvCommunCache = { le: Date.now(), fichiers: null, enCours: null }; return null; }
        const j = await r.json();
        if (!j || !j.trouve) {
          noterVerificationPoste('fcddv-commun', { ok: false, message: 'dossier FCDDV du commun introuvable' });
          fcddvCommunCache = { le: Date.now(), fichiers: null, enCours: null };
          return null;
        }
        const fichiers = Array.isArray(j.fichiers) ? j.fichiers : [];
        fcddvCommunCache = { le: Date.now(), fichiers, enCours: null };
        noterVerificationPoste('fcddv-commun', { detail: `${fichiers.length} PDF listés${j.tronque ? ' (liste tronquée)' : ''}` });
        return fichiers;
      } catch (e) { fcddvCommunCache = { le: Date.now(), fichiers: null, enCours: null }; return null; }
    })();
  }
  return fcddvCommunCache.enCours;
}

/** Sans appel : le fichier du FCDDV du commun déjà listé pour ce dossier, ou null. @param {any} d */
function fcddvCommunConnuDuDossier(d) {
  if (!d || !fcddvCommunCache.fichiers) return null;
  const df = defuntConstitution(d).champs;
  const c = fichierFcddvCommunDuDefunt(fcddvCommunCache.fichiers, { nom: df.nom, prenoms: df.prenoms });
  return c ? { chemin: c.fichier.chemin, affiche: PREFIXE_FCDDV_COMMUN + c.fichier.chemin, plusieurs: c.plusieurs } : null;
}

/** Le fichier du FCDDV du commun pour ce dossier de succession, ou null — { chemin (relatif au dossier FCDDV), affiche (« FCDDV/… »), plusieurs }. @param {any} d */
async function fcddvCommunDuDossier(d) {
  if (!d) return null;
  if (!(await fcddvCommunListe())) return null;
  return fcddvCommunConnuDuDossier(d);
}

/** Ouvre la réponse du commun dans une fenêtre (PDF). @param {string} chemin */
function ouvrirFcddvCommun(chemin) {
  window.open('/api/nas/fcddv/fichier?chemin=' + encodeURIComponent(chemin), '_blank', 'noopener');
}

async function ouvrirPdfFcddvCommun(chemin) {
  const reponse = await fetchAvecAuth('/api/nas/fcddv/fichier?chemin=' + encodeURIComponent(chemin));
  if (!reponse.ok) throw new Error(`Lecture impossible (${reponse.status})`);
  return pdfjsLib.getDocument({ isEvalSupported: false, data: await reponse.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
}
