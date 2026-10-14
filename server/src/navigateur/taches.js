// @ts-check
'use strict';
// Les consultations de sites par CLAIRE (étude 14/10), une à la fois : plan de situation sur cadastre.gouv.fr (parcours écrit à
// l'avance) et consultation de Géofoncier par l'agent (Claude). Chaque tâche garde en MÉMOIRE du serveur (2 h) ses étapes — ce que
// CLAIRE fait, affiché en direct sur le poste —, la dernière capture d'écran, son résultat et ses documents (PDF) ; rien n'est
// écrit sur le disque hors du profil du navigateur (cookies de session du site) ni journalisé.

const crypto = require('node:crypto');
const path = require('node:path');
const { SessionNavigation } = require('./session');
const { planCadastre, DOMAINES_CADASTRE } = require('./planCadastre');
const { surlignerParcelles } = require('./surlignage');
const { consulterSite } = require('./agentNavigation');

const CLE_REGLAGES = 'sites-agent';
const DUREE_TACHE_MS = 2 * 3600 * 1000;
const MAX_TACHES = 30;

// Les sites que l'agent peut consulter. `domaines` : la liste blanche du navigateur pour ce site.
const SITES = {
  geofoncier: {
    libelle: 'Géofoncier',
    domaines: ['geofoncier.fr'],
    depart: 'https://www.geofoncier.fr/',
    identifiants: true,
    consignes: `Géofoncier (geofoncier.fr) est le portail foncier de l’Ordre des géomètres-experts ; l’étude y a un compte (version payante).
Connexion : depuis l’adresse de départ, trouve « Se connecter » / « Connexion » / « Mon espace », puis ecrire_identifiant et ecrire_mot_de_passe.
Recherche : « Recherche parcellaire » (commune, section, numéro) — ou le champ de recherche de la carte.
À relever pour CHAQUE parcelle : le zonage d’urbanisme avec la part de la parcelle dans chaque zone (pourcentage), la situation au regard des monuments historiques (périmètre de protection, abords, site patrimonial), les opérations de géomètres (bornage, document d’arpentage, division : date, cabinet, nature, référence).
Plan aérien : fond « photographies aériennes » / « orthophoto », couche cadastrale avec les numéros de parcelles visibles, vue centrée sur les parcelles et assez rapprochée pour lire les numéros, puis garder_ecran (« Plan aérien »).
Un document ou un rapport à commander ou à payer à l’unité ne se commande pas : signale-le.`
  }
};

/** Pure : les réglages tels qu'une route peut les rendre (aucun secret). @param {any} r */
function reglagesPublics(r) {
  const g = (r && r.geofoncier) || {};
  return { geofoncier: { identifiant: String(g.identifiant || ''), motDePasseEnregistre: !!g.motDePasse, adresse: String(g.adresse || '') },
    navigateur: String((r && r.navigateur) || '') };
}

/** Pure : réglages enregistrés après un formulaire — mot de passe absent = gardé, chaîne vide = effacé. @param {any} avant @param {any} b */
function fusionnerReglages(avant, b) {
  const a = (avant && avant.geofoncier) || {};
  const n = (b && b.geofoncier) || {};
  const adresse = typeof n.adresse === 'string' ? n.adresse.trim().slice(0, 300) : String(a.adresse || '');
  return {
    geofoncier: {
      identifiant: typeof n.identifiant === 'string' ? n.identifiant.trim().slice(0, 200) : String(a.identifiant || ''),
      motDePasse: typeof n.motDePasse === 'string' ? n.motDePasse.slice(0, 300) : String(a.motDePasse || ''),
      // Seulement une adresse https de Géofoncier : jamais un autre site par ce biais.
      adresse: /^https:\/\/([a-z0-9-]+\.)*geofoncier\.fr(\/|$)/i.test(adresse) ? adresse : ''
    },
    navigateur: typeof (b && b.navigateur) === 'string' ? String(b.navigateur).trim().slice(0, 400) : String((avant && avant.navigateur) || '')
  };
}

/**
 * Le gestionnaire des tâches. `injections` : lancer (navigateur), client (Claude), etc. pour les tests.
 * @param {{ parametresRepo: any, cheminDb: string, injections?: any, surFin?: (t: any) => void }} o
 */
function creerGestionnaireTaches(o) {
  /** @type {Map<string, any>} */
  const taches = new Map();
  let file = Promise.resolve();
  const inj = o.injections || {};
  const profil = path.join(path.dirname(o.cheminDb || '.'), 'navigateur');

  const lireReglages = () => o.parametresRepo.lireJsonBrut(CLE_REGLAGES, {}) || {};

  function purger() {
    const limite = Date.now() - DUREE_TACHE_MS;
    for (const [id, t] of taches) if (t.fini && t.fini < limite) taches.delete(id);
    while (taches.size > MAX_TACHES) { const plusVieille = taches.keys().next().value; if (plusVieille === undefined) break; taches.delete(plusVieille); }
  }

  /** Vue publique d'une tâche (sans octets). @param {any} t */
  function vue(t) {
    return { id: t.id, type: t.type, etat: t.etat, titre: t.titre, etapes: t.etapes.slice(-60), erreur: t.erreur || '', resultat: t.resultat || null,
      documents: t.documents.map((d) => ({ id: d.id, titre: d.titre, nom: d.nom, type: d.type, taille: d.octets.length })),
      coutUsd: Math.round((t.coutUsd || 0) * 1000) / 1000, creeLe: t.cree, finiLe: t.fini || 0, avecCapture: !!t.capture, rang: t.rang || 0 };
  }

  /** Lance une tâche à la suite des autres. @param {string} type @param {string} titre @param {(t: any, s: any) => Promise<void>} faire @param {string[]} domaines */
  function lancer(type, titre, faire, domaines) {
    purger();
    const t = { id: crypto.randomUUID(), type, titre, etat: 'attente', etapes: [], documents: [], cree: Date.now(), fini: 0, capture: '', annule: false, coutUsd: 0, resultat: null, erreur: '' };
    taches.set(t.id, t);
    const etape = (texte) => { t.etapes.push({ texte: String(texte).slice(0, 160), le: Date.now() }); };
    t.etape = etape;
    file = file.then(async () => {
      if (t.annule) { t.etat = 'annule'; t.fini = Date.now(); return; }
      t.etat = 'en-cours';
      let s = null;
      try {
        etape('Ouvre le navigateur de CLAIRE');
        s = await SessionNavigation.ouvrir({ profil, chemin: lireReglages().navigateur || undefined, domaines, lancer: inj.lancer });
        // Capture régulière pour l'écran du poste (« voir CLAIRE travailler »).
        const minuterie = setInterval(() => { if (s) s.capture().then((c) => { t.capture = c; }).catch(() => {}); }, 2500);
        try { await faire(t, s); } finally { clearInterval(minuterie); }
        t.capture = await s.capture().catch(() => t.capture);
        t.etat = 'fini';
        etape('Terminé');
      } catch (e) {
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
      const plan = await planCadastre(s, d, t.etape);
      t.etape('Surligne les parcelles en jaune fluo');
      const surligne = await surlignerParcelles(plan.pdf, plan);
      const base = `Plan de situation ${d.commune} ${libelle}`.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
      t.documents.push({ id: 'plan', titre: 'Plan de situation surligné', nom: `${base}.pdf`, type: 'application/pdf', octets: surligne });
      t.documents.push({ id: 'officiel', titre: 'Extrait officiel (sans surlignage)', nom: `${base} - extrait cadastre.gouv.fr.pdf`, type: 'application/pdf', octets: plan.pdf });
      t.resultat = { echelle: plan.echelle, echelleRelevee: plan.relevee, parcelles: libelle, commune: d.commune, dossierId: d.dossierId || '' };
    }, DOMAINES_CADASTRE);
  }

  /**
   * Consultation d'un site par l'agent.
   * @param {{ site: string, demande: string, titre: string, dossierId?: string, claude: { client: any, modele: string, secours?: boolean, tarif?: any } }} d
   */
  function lancerConsultation(d) {
    const site = /** @type {any} */ (SITES)[d.site];
    if (!site) throw new Error('site inconnu');
    const reglages = lireReglages();
    const g = reglages[d.site] || {};
    const depart = g.adresse || site.depart;
    return lancer('site', d.titre, async (t, s) => {
      const r = await consulterSite(s, {
        site, demande: `${d.demande}\nAdresse de départ : ${depart}`, identifiants: site.identifiants ? { identifiant: g.identifiant || '', motDePasse: g.motDePasse || '' } : undefined,
        modele: d.claude.modele, secours: d.claude.secours, client: d.claude.client, tarif: d.claude.tarif,
        etape: t.etape, annule: () => t.annule
      });
      t.coutUsd = r.coutUsd;
      t.resultat = { ...r.resultat, site: d.site, dossierId: d.dossierId || '', complet: r.fini };
      // Les écrans gardés (plan aérien…) en PDF A4 portrait, avec leur titre et leur légende.
      for (const [i, e] of r.ecrans.entries()) {
        const html = pageEcranA4(e.titre, e.legende, e.png.toString('base64'), site.libelle);
        const pdf = await s.pdfDepuisHtml(html);
        t.documents.push({ id: `ecran${i + 1}`, titre: e.titre, nom: `${e.titre} - ${site.libelle}.pdf`.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 120), type: 'application/pdf', octets: pdf });
      }
      // Les PDF rendus par le site pendant la consultation (fiche, rapport) sont gardés aussi.
      for (const doc of s.documents.filter((x) => /pdf/i.test(x.type)).slice(-6)) {
        t.documents.push({ id: `site-${doc.id}`, titre: doc.nom, nom: doc.nom.endsWith('.pdf') ? doc.nom : `${doc.nom}.pdf`, type: 'application/pdf', octets: doc.octets });
      }
    }, site.domaines);
  }

  return {
    lancerPlanCadastre,
    lancerConsultation,
    tache: (id) => { const t = taches.get(String(id)); return t ? vue(t) : null; },
    document: (id, doc) => { const t = taches.get(String(id)); return t ? t.documents.find((d) => d.id === String(doc)) || null : null; },
    capture: (id) => { const t = taches.get(String(id)); return t && t.capture ? Buffer.from(t.capture, 'base64') : null; },
    annuler: (id) => { const t = taches.get(String(id)); if (!t || t.fini) return false; t.annule = true; t.etape('Arrêt demandé'); return true; },
    lireReglages,
    ecrireReglages: (b) => o.parametresRepo.ecrireJsonBrut(CLE_REGLAGES, fusionnerReglages(lireReglages(), b)),
    profil
  };
}

/** Pure : la page A4 portrait d'un écran gardé (titre, image, légende, source et date). @param {string} titre @param {string} legende @param {string} pngBase64 @param {string} source */
function pageEcranA4(titre, legende, pngBase64, source) {
  const ech = (x) => String(x || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 portrait; margin: 14mm; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #222; }
h1 { font-size: 16pt; font-weight: normal; color: #6D2332; margin: 0 0 4mm; }
.legende { font-size: 10pt; margin: 0 0 5mm; }
img { width: 100%; border: 0.3mm solid #999; }
.pied { font-size: 8pt; color: #666; margin-top: 3mm; }
</style></head><body><h1>${ech(titre)}</h1><p class="legende">${ech(legende)}</p>
<img src="data:image/png;base64,${pngBase64}"><p class="pied">Source : ${ech(source)} — capture faite par CLAIRE le ${date}.</p></body></html>`;
}

module.exports = { creerGestionnaireTaches, SITES, CLE_REGLAGES, reglagesPublics, fusionnerReglages, pageEcranA4 };
