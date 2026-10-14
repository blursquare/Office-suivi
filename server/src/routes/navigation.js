'use strict';
// Consultation de sites par CLAIRE (étude 14/10, voir navigateur/taches.js) : plan de situation sur cadastre.gouv.fr, Géofoncier par
// l'agent, réglages du compte Géofoncier (mot de passe jamais renvoyé), tâches suivies en direct, documents rangés sur le NAS au clic.

const express = require('express');
const { creerGestionnaireTaches, reglagesPublics, SITES } = require('../navigateur/taches');
const { trouverNavigateur } = require('../navigateur/chrome');
const { parcelleCadastre } = require('../urbanisme');
const { parcellesDepuisListe, anneauxGeometrie } = require('../historiqueParcelle');
const { MODELES_AGENT, MODELE_AGENT_DEFAUT, CLE_REGLAGES: CLE_REGLAGES_ASSISTANT } = require('../assistantMistral');
const { copierDansDossierClient } = require('../scans');
const { noterVerification } = require('../verificationsTerrain');

const routeAsync = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[navigation]', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.' });
  });
};

/** Pure : le texte de la mission Géofoncier. @param {{ commune: string, insee: string, parcelles: string[], demande?: string }} d */
function missionGeofoncier(d) {
  const liste = d.parcelles.join(', ');
  const plus = d.demande ? `\nDemande de l’étude en plus : ${d.demande}` : '';
  return `Commune : ${d.commune} (code INSEE ${d.insee}). Parcelles vendues : ${liste}.
1. Connecte-toi au compte de l’étude.
2. Pour chaque parcelle : zonage d’urbanisme avec la part (en %) de la parcelle dans chaque zone ; situation au regard des monuments historiques ; opérations de géomètres connues (bornage, document d’arpentage, division) avec date, cabinet, nature, référence.
3. Plan aérien : photographies aériennes + cadastre avec les numéros, toutes les parcelles vendues visibles en entier, puis garder_ecran.
4. Termine par le compte rendu.${plus}`;
}

/**
 * @param {any} config @param {any} parametresRepo @param {any} depot
 * @param {{ gestionnaire?: any, creerClient?: (cle: string) => any, injections?: any }} [o]
 */
function creerRouteurNavigation(config, parametresRepo, depot, o = {}) {
  const routeur = express.Router();
  // Fin d'une tâche : le point « vérifié au bureau » se coche (ou note l'échec) — une fois, sans rien de personnel.
  const surFin = (t) => {
    const point = t.type === 'plan-cadastre' ? 'plan-cadastre-surligne' : 'agent-geofoncier';
    if (t.etat === 'fini') noterVerification(parametresRepo, point, { detail: t.type === 'plan-cadastre' ? `1/${(t.resultat && t.resultat.echelle) || ''}` : `${(t.resultat && t.resultat.complet) ? 'complet' : 'incomplet'}` });
    else if (t.etat === 'erreur') noterVerification(parametresRepo, point, { ok: false, message: String(t.erreur || '').slice(0, 120) });
  };
  const gestion = o.gestionnaire || creerGestionnaireTaches({ parametresRepo, cheminDb: config.cheminDb, injections: o.injections, surFin });
  const injections = o.injections || {};

  const cleClaude = () => {
    const r = parametresRepo.lireReglagesClaude ? parametresRepo.lireReglagesClaude() : {};
    return (r && r.cleApi) || process.env.ANTHROPIC_API_KEY || '';
  };
  const creerClient = o.creerClient || ((cle) => {
    const Anthropic = /** @type {any} */ (require('@anthropic-ai/sdk'));
    const Classe = Anthropic.default || Anthropic;
    return new Classe({ apiKey: cle, timeout: 120000, maxRetries: 1 });
  });

  /** Contours des parcelles (API Carto de l'IGN) et nom de la commune. @param {string} insee @param {string} texte */
  async function parcellesAvecContours(insee, texte) {
    const liste = parcellesDepuisListe(texte).slice(0, 12);
    const out = [];
    let commune = '';
    for (const p of liste) {
      const f = await parcelleCadastre(insee, p.section, p.numero, injections).catch(() => null);
      if (!f) continue;
      commune = commune || String((f.properties && f.properties.nom_com) || '');
      out.push({ section: p.section, numero: p.numero, anneaux: anneauxGeometrie(f.geometry) });
    }
    return { commune, parcelles: out, demandees: liste.length };
  }

  routeur.get('/navigation/reglages', routeAsync(async (req, res) => {
    const r = gestion.lireReglages();
    const chemin = await trouverNavigateur({ chemin: r.navigateur || undefined });
    res.json({ ...reglagesPublics(r), navigateurTrouve: !!chemin, navigateurNom: /msedge/i.test(chemin) ? 'Microsoft Edge' : chemin ? 'Google Chrome' : '',
      cleClaude: !!cleClaude(), sites: Object.entries(SITES).map(([cle, s]) => ({ cle, libelle: s.libelle })) });
  }));

  routeur.put('/navigation/reglages', (req, res) => {
    gestion.ecrireReglages(req.body || {});
    res.json(reglagesPublics(gestion.lireReglages()));
  });

  routeur.post('/navigation/plan-cadastre', routeAsync(async (req, res) => {
    const b = req.body || {};
    const insee = String(b.insee || '').toUpperCase();
    if (!/^\d[0-9AB]\d{3}$/.test(insee)) { res.status(400).json({ erreur: 'Code INSEE de la commune manquant ou invalide.' }); return; }
    const { commune, parcelles, demandees } = await parcellesAvecContours(insee, String(b.parcelles || ''));
    if (!demandees) { res.status(400).json({ erreur: 'Aucune parcelle (section et numéro).' }); return; }
    if (parcelles.length < demandees) { res.status(404).json({ erreur: `${demandees - parcelles.length} parcelle(s) introuvable(s) au cadastre de cette commune.` }); return; }
    const id = gestion.lancerPlanCadastre({ commune, insee, parcelles, echelle: Number(b.echelle) || 0, dossierId: typeof b.dossierId === 'string' ? b.dossierId : '' });
    res.json({ id });
  }));

  routeur.post('/navigation/consultation', routeAsync(async (req, res) => {
    const b = req.body || {};
    const site = String(b.site || '');
    if (!(SITES)[site]) { res.status(400).json({ erreur: 'Site inconnu.' }); return; }
    const cle = cleClaude();
    if (!cle) { res.status(400).json({ erreur: 'Clé Claude nécessaire (Réglages › IA et relecture d’actes) : l’agent doit voir les pages.' }); return; }
    const r = gestion.lireReglages();
    if (site === 'geofoncier' && !(r.geofoncier && r.geofoncier.identifiant && r.geofoncier.motDePasse)) {
      res.status(400).json({ erreur: 'Identifiant et mot de passe Géofoncier à enregistrer dans Réglages › Sites consultés par CLAIRE.' }); return;
    }
    const insee = String(b.insee || '').toUpperCase();
    const parcelles = parcellesDepuisListe(String(b.parcelles || '')).map((p) => `${p.section} ${p.numero}`);
    if (!/^\d[0-9AB]\d{3}$/.test(insee) || !parcelles.length) { res.status(400).json({ erreur: 'Commune (code INSEE) et parcelles nécessaires.' }); return; }
    const commune = String(b.commune || '').replace(/[^\p{L}\p{N} '’-]/gu, '').slice(0, 80) || insee;
    // Une précision libre de l'étude (jamais un nom de client : l'écran ne la pré-remplit pas), bornée.
    const demande = String(b.demande || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const reglagesAssistant = parametresRepo.lireJsonBrut(CLE_REGLAGES_ASSISTANT, {}) || {};
    const modele = MODELES_AGENT[reglagesAssistant.modeleAgent] ? reglagesAssistant.modeleAgent : MODELE_AGENT_DEFAUT;
    const fiche = MODELES_AGENT[modele];
    const id = gestion.lancerConsultation({ site, titre: `${SITES[site].libelle} — ${commune} ${parcelles.join(', ')}`,
      demande: missionGeofoncier({ commune, insee, parcelles, demande }), dossierId: typeof b.dossierId === 'string' ? b.dossierId : '',
      claude: { client: creerClient(cle), modele, secours: !!fiche.secours, tarif: fiche } });
    res.json({ id });
  }));

  routeur.get('/navigation/taches/:id', (req, res) => {
    const t = gestion.tache(req.params.id);
    if (!t) { res.status(404).json({ erreur: 'Consultation inconnue ou expirée.' }); return; }
    res.json(t);
  });

  routeur.get('/navigation/taches/:id/capture', (req, res) => {
    const c = gestion.capture(req.params.id);
    if (!c) { res.status(404).end(); return; }
    res.set('Content-Type', 'image/jpeg').set('Cache-Control', 'no-store').send(c);
  });

  routeur.get('/navigation/taches/:id/documents/:doc', (req, res) => {
    const d = gestion.document(req.params.id, req.params.doc);
    if (!d) { res.status(404).json({ erreur: 'Document inconnu ou expiré.' }); return; }
    const nom = encodeURIComponent(d.nom);
    res.set('Content-Type', d.type).set('Content-Disposition', `${req.query.telecharger ? 'attachment' : 'inline'}; filename*=UTF-8''${nom}`).send(d.octets);
  });

  // Ranger un document dans le dossier du NAS relié à la fiche (sur clic, comme les documents de « Demander à CLAIRE ») : une COPIE à la
  // racine du dossier client, jamais par-dessus un fichier existant (« Nom (2).pdf »).
  routeur.post('/navigation/taches/:id/documents/:doc/ranger', routeAsync(async (req, res) => {
    if (!config.nasRacine) { res.status(503).json({ erreur: 'Aucun dossier NAS configuré.' }); return; }
    const doc = gestion.document(req.params.id, req.params.doc);
    if (!doc || !/pdf/i.test(doc.type)) { res.status(404).json({ erreur: 'Document inconnu ou expiré.' }); return; }
    const b = req.body || {};
    const d = depot && typeof b.dossierId === 'string' ? depot.trouverParId(b.dossierId) : null;
    if (!d || !d.nasDossier) { res.status(400).json({ erreur: 'Dossier inconnu ou non relié au NAS.' }); return; }
    const r = await copierDansDossierClient({ nasRacine: config.nasRacine, dossierNas: String(d.nasDossier), rubriques: [], nomCible: doc.nom.replace(/\.pdf$/i, ''), extension: 'pdf', contenu: doc.octets });
    if (r.erreur) { res.status(r.statut || 400).json({ erreur: r.erreur }); return; }
    res.json({ ok: true, chemin: r.chemin });
  }));

  routeur.post('/navigation/taches/:id/annuler', (req, res) => {
    res.json({ ok: gestion.annuler(req.params.id) });
  });

  return routeur;
}

module.exports = { creerRouteurNavigation, missionGeofoncier };
