// @ts-check
'use strict';
// Les consultations de sites par CLAIRE (étude 14/10), une à la fois : plan de situation sur cadastre.gouv.fr (parcours écrit à
// l'avance, sans IA — la consultation de Géofoncier par un agent Claude, payante en jetons, a été retirée le même soir par l'étude). Chaque tâche garde en MÉMOIRE du serveur (2 h) ses étapes — ce que
// CLAIRE fait, affiché en direct sur le poste —, la dernière capture d'écran, son résultat et ses documents (PDF) ; rien n'est
// écrit sur le disque hors du profil du navigateur (cookies de session du site) ni journalisé.

const crypto = require('node:crypto');
const path = require('node:path');
const { SessionNavigation, adresseAchat } = require('./session');
const { planCadastre, DOMAINES_CADASTRE } = require('./planCadastre');
const { surlignerParcelles } = require('./surlignage');

// Ancienne clé du compte Géofoncier (0.229.0, retiré le 14/10 au soir par l'étude) : effacée au démarrage, aucun secret gardé sans usage.
const CLE_ANCIENS_REGLAGES = 'sites-agent';
const DUREE_TACHE_MS = 2 * 3600 * 1000;
const MAX_TACHES = 30;
const MAX_EN_ATTENTE = 3;

/**
 * Le gestionnaire des tâches. `injections.lancer` : le navigateur, pour les tests.
 * @param {{ parametresRepo: any, cheminDb: string, injections?: any, surFin?: (t: any) => void }} o
 */
function creerGestionnaireTaches(o) {
  /** @type {Map<string, any>} */
  const taches = new Map();
  let file = Promise.resolve();
  const inj = o.injections || {};
  const profil = path.join(path.dirname(o.cheminDb || '.'), 'navigateur');

  // Le mot de passe Géofoncier saisi pendant la 0.229.0 ne reste pas en base.
  try { const ancien = o.parametresRepo.lireJsonBrut(CLE_ANCIENS_REGLAGES, null); if (ancien && Object.keys(ancien).length) o.parametresRepo.ecrireJsonBrut(CLE_ANCIENS_REGLAGES, {}); } catch (_) { /* base sans la clé */ }

  function purger() {
    const limite = Date.now() - DUREE_TACHE_MS;
    for (const [id, t] of taches) if (t.fini && t.fini < limite) taches.delete(id);
    // Jamais une tâche encore en attente ou en cours (elle tournerait sans pouvoir être suivie ni arrêtée).
    for (const [id, t] of taches) { if (taches.size <= MAX_TACHES) break; if (t.fini) taches.delete(id); }
  }

  /** Vue publique d'une tâche (sans octets). @param {any} t */
  function vue(t) {
    return { id: t.id, type: t.type, etat: t.etat, titre: t.titre, etapes: t.etapes.slice(-60), erreur: t.erreur || '', resultat: t.resultat || null,
      documents: t.documents.map((d) => ({ id: d.id, titre: d.titre, nom: d.nom, type: d.type, taille: d.octets.length })),
      creeLe: t.cree, finiLe: t.fini || 0, avecCapture: !!t.capture, rang: t.rang || 0 };
  }

  /** Lance une tâche à la suite des autres. @param {string} type @param {string} titre @param {(t: any, s: any) => Promise<void>} faire @param {string[]} domaines @param {string} [profilTache] */
  function lancer(type, titre, faire, domaines, profilTache) {
    purger();
    if ([...taches.values()].filter((x) => !x.fini).length >= MAX_EN_ATTENTE) throw Object.assign(new Error('Trop de consultations en attente : réessayer dans quelques minutes.'), { statut: 429 });
    const t = { id: crypto.randomUUID(), type, titre, etat: 'attente', etapes: [], documents: [], cree: Date.now(), fini: 0, capture: '', annule: false, resultat: null, erreur: '' };
    taches.set(t.id, t);
    const etape = (texte) => { t.etapes.push({ texte: String(texte).slice(0, 160), le: Date.now() }); };
    t.etape = etape;
    file = file.then(async () => {
      if (t.annule) { t.etat = 'annule'; t.fini = Date.now(); return; }
      t.etat = 'en-cours';
      let s = null;
      try {
        etape('Ouvre le navigateur de CLAIRE');
        s = await SessionNavigation.ouvrir({ profil: profilTache || profil, domaines, lancer: inj.lancer, refuserAdresse: adresseAchat });
        // Capture régulière pour l'écran du poste (« voir CLAIRE travailler »).
        const minuterie = setInterval(() => { if (s) s.capture().then((c) => { t.capture = c; }).catch(() => {}); }, 2500);
        try { await faire(t, s); } finally { clearInterval(minuterie); }
        t.capture = await s.capture().catch(() => t.capture);
        t.etat = 'fini';
        etape('Terminé');
      } catch (e) {
        // La dernière page du navigateur au moment de l'échec (aperçu du poste, étude 29/10) : 4 s au plus, jamais bloquant.
        if (s && !t.annule && !(e && e.annule)) {
          t.capture = await Promise.race([s.capture(), new Promise((ok) => setTimeout(() => ok(t.capture), 4000).unref())]).catch(() => t.capture);
        }
        t.etat = t.annule || (e && e.annule) ? 'annule' : 'erreur';
        t.erreur = t.etat === 'annule' ? 'Arrêté à la demande.' : String((e && e.message) || 'erreur').slice(0, 300);
      } finally {
        t.fini = Date.now();
        if (s) await s.fermer().catch(() => {});
        try { if (o.surFin) o.surFin(t); } catch (_) { /* le suivi ne casse pas la tâche */ }
      }
    });
    return t.id;
  }

  /**
   * Plan de situation (cadastre.gouv.fr) surligné.
   * @param {{ commune: string, insee: string, parcelles: Array<{ section: string, numero: string, anneaux: any[] }>, echelle?: number, dossierId?: string }} d
   */
  function lancerPlanCadastre(d) {
    const libelle = d.parcelles.map((p) => `${p.section} ${Number(p.numero) || p.numero}`).join(', ');
    return lancer('plan-cadastre', `Plan de situation — ${d.commune} ${libelle}`, async (t, s) => {
      // « Arrêter » : vérifié à chaque étape du parcours.
      const etapeOuArret = (x) => { if (t.annule) throw Object.assign(new Error('Consultation arrêtée.'), { annule: true }); t.etape(x); };
      const { plans } = await planCadastre(s, d, etapeOuArret);
      t.etape('Surligne les parcelles en jaune fluo');
      const plusieurs = plans.length > 1;
      for (const [n, plan] of plans.entries()) {
        const surligne = await surlignerParcelles(plan.pdf, plan);
        const ses = plan.parcelles.map((p) => `${p.section} ${Number(p.numero) || p.numero}`).join(', ');
        const base = `Plan de situation ${d.commune} ${ses}`.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
        const rang = plusieurs ? ` ${n + 1}/${plans.length}` : '';
        // Le premier plan garde les identifiants « plan » / « officiel » (l'écran et « Demander à CLAIRE » les connaissent).
        t.documents.push({ id: n ? `plan${n + 1}` : 'plan', titre: `Plan de situation surligné${rang} — ${ses}`, nom: `${base}.pdf`, type: 'application/pdf', octets: surligne });
        t.documents.push({ id: n ? `officiel${n + 1}` : 'officiel', titre: `Extrait officiel${rang} (sans surlignage)`, nom: `${base} - extrait cadastre.gouv.fr.pdf`, type: 'application/pdf', octets: plan.pdf });
      }
      t.resultat = { plans: plans.map((p) => ({ echelle: p.echelle, echelleRelevee: p.relevee, parcelles: p.parcelles.map((x) => `${x.section} ${Number(x.numero) || x.numero}`).join(', ') })),
        echelle: plans[0].echelle, echelleRelevee: plans.some((p) => p.relevee), parcelles: libelle, commune: d.commune, dossierId: d.dossierId || '' };
    }, DOMAINES_CADASTRE);
  }

  // Authentic (authenticClaire.js) : un profil à part (cookies de la session de l'étude), même file d'attente que le cadastre.
  const profilAuthentic = path.join(path.dirname(o.cheminDb || '.'), 'navigateur-authentic');
  /** @param {string} type @param {string} titre @param {(t: any, s: any) => Promise<void>} faire @param {string[]} domaines */
  function lancerAuthentic(type, titre, faire, domaines) { return lancer(type, titre, faire, domaines, profilAuthentic); }

  return {
    lancerPlanCadastre,
    lancerAuthentic,
    tache: (id) => { const t = taches.get(String(id)); return t ? vue(t) : null; },
    document: (id, doc) => { const t = taches.get(String(id)); return t ? t.documents.find((d) => d.id === String(doc)) || null : null; },
    capture: (id) => { const t = taches.get(String(id)); return t && t.capture ? Buffer.from(t.capture, 'base64') : null; },
    annuler: (id) => { const t = taches.get(String(id)); if (!t || t.fini) return false; t.annule = true; t.etape('Arrêt demandé'); return true; },
    profil
  };
}

module.exports = { creerGestionnaireTaches };
