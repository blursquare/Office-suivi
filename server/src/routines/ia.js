// @ts-check
'use strict';
// Les routines de CLAIRE qui font appel à l'IA en ligne (étude 24/10 : Claude, noms masqués par le serveur, plafond de 50 € par mois ;
// étude 25/10 : « toutes les phases pour demain », et « une proposition des brouillons de réponse aux emails reçus après 18 h, le
// lendemain » — emails liés à un dossier seulement). Chaque routine rend des PROPOSITIONS ; rien ne part sans un clic (règle n° 4).
//
// Ce qui part chez Anthropic : le texte de l'email (relu dans Exchange, jamais gardé), son objet, le nom du dossier, la liste des pièces
// manquantes — tout MASQUÉ par le serveur avec le masquage FORT de la phrase (`masquer` : noms des fiches, civilités, emails, téléphones,
// IBAN, références, mots en capitales, mots à majuscule hors tête de phrase — un email est court, une adresse ou un nom absent des fiches
// y est codé aussi) ; les codes [NOM1]… sont rétablis à l'arrivée du brouillon. La veille juridique n'envoie aucune donnée de client (voir veille.js).
// Coût compté dans `routines-usage` ; au plafond, plus aucun appel.

const { motsSensiblesDossiers, masquer, retablirTexte, MODELES_CLAUDE_ASSISTANT } = require('../assistantMistral');
const { requeteAssistantClaude, messageErreurClaude } = require('../assistantClaude');
const { promptPropositionReponse, validerProposition } = require('../envoiEmailsExchange');
const { sansSaufErreur } = require('../../../commun/assistant');
const { estJourFerie } = require('../../../commun/dates');
const { libelleDossierAffiche, estSuccession } = require('../../../commun/dossier');
const { piecesRecuesEtManquantes } = require('../piecesChecklist');
const { lireUsageRoutines, ajouterDepenseRoutines, plafondAtteint } = require('./usage');
const { idDepuisEmpreinte, dossierOuvert, joursEntre } = require('./executants');

const MODELE_ROUTINES = 'claude-sonnet-5';
const MODELE_VEILLE = 'claude-sonnet-5-5';
const TARIF_VEILLE = { entree: 2, sortie: 10 };
const MAX_EMAILS_PAR_TOUR = 20;
const HEURE_SOIR = '18:00';
const HEURE_MATIN = '08:00';
const CLE_EMAILS_TRAITES = 'routines-emails-traites';
const JOURS_EMAILS_TRAITES = 30;

const SCHEMA_REPONSE = { type: 'object', properties: { reponse: { type: 'string' } }, required: ['reponse'], additionalProperties: false };
const SCHEMA_RELANCE = {
  type: 'object', additionalProperties: false, required: ['pieces', 'relance'],
  properties: { pieces: { type: 'array', items: { type: 'integer' } }, relance: { type: 'string' } }
};

// ---- Pures ----

/**
 * Le jour ouvré qui précède `iso` : ni samedi, ni dimanche, ni jour férié (vendredi pour un lundi ; le mardi 10/11 pour le jeudi
 * 12/11, le 11 étant férié). Tout ce qui est arrivé entre ce jour-là 18 h et ce matin 8 h — week-end et jours fériés compris — est repris.
 * @param {string} iso AAAA-MM-JJ
 */
function veilleOuvree(iso) {
  const t = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  do { t.setUTCDate(t.getUTCDate() - 1); } while (t.getUTCDay() === 0 || t.getUTCDay() === 6 || estJourFerie(t.toISOString().slice(0, 10)));
  return t.toISOString().slice(0, 10);
}

/** Jour et heure de Paris d'une date ISO. @param {string} iso */
function momentParis(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: `${p.hour}:${p.minute}` };
}

/**
 * L'email est-il arrivé « après 18 h » pour la revue de ce matin ? Du jour ouvré précédent 18 h jusqu'à ce matin 8 h (le week-end compris
 * le lundi). @param {string} dateIso @param {string} aujourdhui AAAA-MM-JJ (Paris)
 */
function recuApres18h(dateIso, aujourdhui) {
  const m = momentParis(dateIso);
  if (!m) return false;
  const veille = veilleOuvree(aujourdhui);
  if (m.jour === veille) return m.heure >= HEURE_SOIR;
  if (m.jour > veille && m.jour < aujourdhui) return true;
  return m.jour === aujourdhui && m.heure < HEURE_MATIN;
}

/** Les mots à masquer tirés des dossiers du serveur (même liste que celle que le poste envoie à l'agent). @param {any[]} dossiers */
function sensiblesDesDossiers(dossiers) {
  const t = (v) => (typeof v === 'string' ? v : '');
  return motsSensiblesDossiers((dossiers || []).filter((d) => d && d.id).map((d) => ({
    nom: String(d.nom || ''),
    parties: (Array.isArray(d.parties) ? d.parties : []).map((p) => ({ nom: t(p && p.nom), prenom: t(p && p.prenom), nomUsage: t(p && p.nomUsage) })).filter((p) => p.nom),
    autres: [d.adresseBien, d.bien && d.bien.adresse, ...(Array.isArray(d.biens) ? d.biens.map((b) => b && b.adresse) : []), d.nomAgence,
      d.notaireVendeur, d.notaireAcquereur, d.defunt && d.defunt.prenoms, d.defunt && d.defunt.nom].map(t).filter(Boolean)
  })));
}

/** Un code [NOM…] que l'IA aurait inventé (absent de la table) devient « [à compléter] » : jamais un code dans un email. @param {string} texte @param {Map<string, string>} table */
function retablirBrouillon(texte, table) {
  return sansSaufErreur(retablirTexte(String(texte || ''), table)).replace(/\[(?:NOM|EMAIL|TEL|REF|NUM|MONTANT)\d+\]/g, '[à compléter]').trim();
}

/** L'email reçu vient-il d'un confrère du dossier ? @param {any} d @param {string} adresse */
function expediteurConfrereDossier(d, adresse) {
  const a = String(adresse || '').toLowerCase();
  const de = (v) => String(v || '').toLowerCase().split(/[;,\s]+/).filter(Boolean);
  return !!a && [...de(d && d.emailNotaireParticipant), ...de(d && d.emailConfrereVendeur)].includes(a);
}

/** « RE: » devant l'objet, une seule fois. @param {string} objet */
function sujetReponse(objet) {
  const o = String(objet || '').trim();
  return /^re\s*:/i.test(o) ? o : `RE: ${o}`;
}

/** Les emails déjà lus par une routine (gardés 30 jours) : jamais relus ni reproposés. @param {any} repo @param {number} maintenantMs */
function lireEmailsTraites(repo, maintenantMs) {
  const brut = repo.lireJsonBrut(CLE_EMAILS_TRAITES, null);
  const limite = maintenantMs - JOURS_EMAILS_TRAITES * 86400000;
  /** @type {Record<string, string>} */
  const propre = {};
  for (const [id, quand] of Object.entries(brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {})) {
    if (typeof quand === 'string' && Date.parse(quand) >= limite) propre[String(id).slice(0, 80)] = quand;
  }
  return propre;
}

// ---- L'appel à Claude, compté dans le plafond des routines ----

/**
 * @param {{ parametresRepo: any, sdk?: any, cle?: string }} deps
 * @returns {{ disponible: () => { ok: boolean, raison?: string }, json: (prompt: string, schema: any, valider?: (o: any) => string | null, maxJetons?: number) => Promise<any>, texte: (prompt: string) => Promise<string> }}
 */
function creerIaRoutines(deps) {
  const repo = deps.parametresRepo;
  const cle = deps.cle != null ? deps.cle : (() => { const r = repo.lireReglagesClaude ? repo.lireReglagesClaude() : {}; return (r && r.cleApi) || process.env.ANTHROPIC_API_KEY || ''; })();
  let sdk = deps.sdk || null;
  const client = () => {
    if (!sdk) {
      const Anthropic = /** @type {any} */ (require('@anthropic-ai/sdk'));
      const Classe = Anthropic.default || Anthropic;
      sdk = new Classe({ apiKey: cle, timeout: 120000, maxRetries: 0 });
    }
    return sdk;
  };
  const reglagesPlafond = () => require('./reglages').lireReglagesRoutines(repo);
  return {
    disponible() {
      if (!cle && !deps.sdk) return { ok: false, raison: 'aucune clé Claude (Réglages › IA et relecture d’actes)' };
      if (plafondAtteint(reglagesPlafond(), lireUsageRoutines(repo))) return { ok: false, raison: 'plafond mensuel de l’IA des routines atteint' };
      return { ok: true };
    },
    async json(prompt, schema, valider, maxJetons) {
      if (plafondAtteint(reglagesPlafond(), lireUsageRoutines(repo))) throw new Error('plafond mensuel de l’IA des routines atteint');
      let message;
      try { message = await client().messages.create(requeteAssistantClaude(MODELE_ROUTINES, prompt, schema, maxJetons || 1200)); } catch (e) { throw new Error(messageErreurClaude(e)); }
      const u = (message && message.usage) || {};
      const t = MODELES_CLAUDE_ASSISTANT[MODELE_ROUTINES];
      ajouterDepenseRoutines(repo, { euros: ((u.input_tokens || 0) * t.entree + (u.output_tokens || 0) * t.sortie) / 1e6, jetons: (u.input_tokens || 0) + (u.output_tokens || 0) });
      const brut = (message.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
      let objet;
      try { objet = JSON.parse(brut); } catch (e) { throw new Error('réponse de Claude illisible'); }
      const probleme = valider ? valider(objet) : null;
      if (probleme) throw new Error('réponse de Claude hors format (' + probleme + ')');
      return objet;
    },
    async texte(prompt) {
      if (plafondAtteint(reglagesPlafond(), lireUsageRoutines(repo))) throw new Error('plafond mensuel de l’IA des routines atteint');
      let message;
      try { message = await client().messages.create({ model: MODELE_VEILLE, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }); } catch (e) { throw new Error(messageErreurClaude(e)); }
      const u = (message && message.usage) || {};
      ajouterDepenseRoutines(repo, { euros: ((u.input_tokens || 0) * TARIF_VEILLE.entree + (u.output_tokens || 0) * TARIF_VEILLE.sortie) / 1e6, jetons: (u.input_tokens || 0) + (u.output_tokens || 0) });
      return (message.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
    }
  };
}

// ---- R9 — Brouillons de réponse aux emails reçus après 18 h ----

/**
 * Le matin, pour chaque email reçu d'une adresse d'un dossier entre le jour ouvré précédent 18 h et 8 h : un brouillon de réponse par
 * l'IA (court, rien d'inventé, « [à compléter] » où l'information manque), déposé dans le canal du dossier pour son responsable. Un email
 * auquel l'étude a déjà répondu, ou déjà lu par CLAIRE, est sauté.
 * @param {{ ia: any, parametresRepo: any, dossiers: any[], emails: any[], prepares?: any[], aujourdhui: string, maintenantMs: number, lireEmail: (id: string) => Promise<any>, niveau: (r: string, g: string) => number, signalerRefus?: () => void }} o
 * @returns {Promise<{ propositions: any[], lus: number, erreurs: string[] }>}
 */
async function reponsesEmailsDuSoir(o) {
  const traites = lireEmailsTraites(o.parametresRepo, o.maintenantMs);
  const parId = new Map((o.dossiers || []).map((d) => [d.id, d]));
  const envoyes = (o.emails || []).filter((e) => e && e.sens === 'envoye');
  // Réponses préparées depuis CLAIRE (fenêtre d'email) : elles comptent comme une réponse, même pas encore retrouvées dans les envoyés.
  const prepares = (o.prepares || []).filter((x) => x && Array.isArray(x.destinataires));
  const candidats = (o.emails || []).filter((e) => e && e.sens === 'recu' && e.dossierId && parId.has(e.dossierId) && dossierOuvert(parId.get(e.dossierId))
    && e.de && e.de.adresse && !traites['rep:' + e.id] && !/\[CLAIRE-/i.test(String(e.objet || '')) && recuApres18h(e.date, o.aujourdhui)
    // Déjà répondu : un email envoyé à cet expéditeur après la réception.
    && !envoyes.some((x) => (x.a || []).includes(String(e.de.adresse).toLowerCase()) && String(x.date) > String(e.date))
    && !prepares.some((x) => x.destinataires.includes(String(e.de.adresse).toLowerCase()) && String(x.prepareLe) > String(e.date)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, MAX_EMAILS_PAR_TOUR);
  const sensibles = sensiblesDesDossiers(o.dossiers);
  const sortie = { propositions: /** @type {any[]} */ ([]), lus: 0, erreurs: /** @type {string[]} */ ([]) };
  for (const e of candidats) {
    const d = parId.get(e.dossierId);
    traites['rep:' + e.id] = new Date(o.maintenantMs).toISOString();
    let lu;
    try { lu = await o.lireEmail(e.id); } catch (err) { lu = { erreur: 'lecture impossible' }; }
    // Identifiants refusés : on s'arrête tout de suite et le disjoncteur de l'agenda est posé (un seul essai, jamais d'enchaînement de refus).
    if (lu && lu.erreur && /Identifiants de messagerie refusés/.test(String(lu.erreur))) {
      if (o.signalerRefus) o.signalerRefus();
      sortie.erreurs.push('identifiants Exchange refusés');
      break;
    }
    if (!lu || lu.erreur) { sortie.erreurs.push('email illisible dans Exchange'); continue; }
    sortie.lus += 1;
    const table = new Map();
    const confrere = expediteurConfrereDossier(d, e.de.adresse);
    const prompt = promptPropositionReponse({
      objet: masquer(String(e.objet || ''), sensibles, table), deNom: masquer(String((e.de && (e.de.nom || '')) || (confrere ? 'un confrère' : 'le client')), sensibles, table),
      texte: masquer(String(lu.texte || '').slice(0, 4000), sensibles, table), dossier: masquer(libelleDossierAffiche(d), sensibles, table),
      confrere, pj: (e.pj || []).map(() => 'un document')
    });
    let objet;
    try { objet = await o.ia.json(prompt, SCHEMA_REPONSE, validerProposition, 800); } catch (err) { sortie.erreurs.push(String(err && err.message).slice(0, 80)); continue; }
    const corps = retablirBrouillon(objet.reponse, table);
    if (!corps) continue;
    const empreinte = `reponse:${e.id}`;
    sortie.propositions.push({
      id: idDepuisEmpreinte(empreinte), routine: 'reponses-emails', responsable: d.responsable, dossierId: d.id,
      type: 'email', action: 'email', empreinte,
      titre: `Répondre à ${(e.de && (e.de.nom || e.de.adresse)) || 'l’expéditeur'} — ${libelleDossierAffiche(d)}`.slice(0, 140),
      resume: `Email reçu hors des heures de bureau (« ${String(e.objet || '(sans objet)').slice(0, 80)} ») : un brouillon de réponse est prêt à relire.`,
      details: { destinataire: e.de.adresse, sujet: sujetReponse(e.objet), corps, reponseA: e.id, confrere, geste: 'reponse', niveau: o.niveau('reponses-emails', 'reponse') }
    });
  }
  o.parametresRepo.ecrireJsonBrut(CLE_EMAILS_TRAITES, traites);
  return sortie;
}

// ---- R6 — Relance des pièces demandées ----

/** Le prompt de la relance (pure : tout ce qui entre est déjà masqué). @param {{ objet: string, texte: string, manquantes: string[], confrere: boolean }} e */
function promptRelancePieces(e) {
  return [
    'Tu travailles pour une étude notariale française (Maître Sophie GOSSART, Blois). L’étude a envoyé l’email ci-dessous il y a plus de deux jours.',
    `Objet : ${e.objet || '(sans objet)'}`, 'Email envoyé :', String(e.texte || '').slice(0, 4000), '',
    'Pièces du dossier qui ne sont TOUJOURS PAS reçues (numérotées) :', ...e.manquantes.map((m, i) => `${i + 1}. ${m}`), '',
    'Consignes :',
    '- Dans "pieces", donne les NUMÉROS de la liste ci-dessus que cet email demandait. Si l’email ne demandait aucune de ces pièces, rends une liste vide et "relance" vide.',
    e.confrere ? '- Le destinataire est un confrère notaire : « Mon Cher Maître, » puis « Votre bien dévoué. ».' : '- Le destinataire est le client : « Madame, Monsieur, » puis « Bien cordialement, ».',
    '- Sinon, "relance" = un email de relance courtois et court (2 phrases au plus entre les formules) qui rappelle les pièces encore attendues.',
    '- N’invente aucune date, aucun délai ni aucune pièce ; écris « [à compléter] » si une information manque. Jamais « Sauf erreur de ma part ».',
    '- Pas de signature, pas d’objet. Réponds en JSON : {"pieces": [1, 3], "relance": "…"}'
  ].join('\n');
}

/**
 * 48 h après un email ENVOYÉ d'un dossier (jusqu'à 7 jours) : si cet email réclamait des pièces qui ne sont toujours pas reçues, un
 * brouillon de relance aux mêmes destinataires. Chaque email n'est lu qu'une fois.
 * @param {{ ia: any, parametresRepo: any, dossiers: any[], emails: any[], maintenantMs: number, lireEmail: (id: string) => Promise<any>, niveau: (r: string, g: string) => number, signalerRefus?: () => void }} o
 */
async function relancePiecesDemandees(o) {
  const traites = lireEmailsTraites(o.parametresRepo, o.maintenantMs);
  const parId = new Map((o.dossiers || []).map((d) => [d.id, d]));
  const min = o.maintenantMs - 7 * 86400000;
  const max = o.maintenantMs - 2 * 86400000;
  const candidats = (o.emails || []).filter((e) => {
    if (!e || e.sens !== 'envoye' || !e.dossierId || traites['rel:' + e.id] || !(e.a || []).length) return false;
    const t = Date.parse(e.date);
    const d = parId.get(e.dossierId);
    if (!(t >= min && t <= max && d && dossierOuvert(d) && !estSuccession(d) && d.roleNotaire !== 'participant' && piecesRecuesEtManquantes(d).manquantes.length > 0)) return false;
    // Un destinataire a répondu depuis : pas de relance (ses pièces sont peut-être en route).
    return !(o.emails || []).some((r) => r && r.sens === 'recu' && r.dossierId === e.dossierId && (e.a || []).includes(String(r.de && r.de.adresse || '').toLowerCase()) && String(r.date) > String(e.date));
  })
    // Une relance par dossier et par tour : le plus récent des emails envoyés.
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .filter((e, i, t) => t.findIndex((x) => x.dossierId === e.dossierId) === i)
    .slice(0, MAX_EMAILS_PAR_TOUR);
  const sensibles = sensiblesDesDossiers(o.dossiers);
  const sortie = { propositions: /** @type {any[]} */ ([]), lus: 0, erreurs: /** @type {string[]} */ ([]) };
  for (const e of candidats) {
    const d = parId.get(e.dossierId);
    traites['rel:' + e.id] = new Date(o.maintenantMs).toISOString();
    let lu;
    try { lu = await o.lireEmail(e.id); } catch (err) { lu = { erreur: 'lecture impossible' }; }
    // Identifiants refusés : on s'arrête tout de suite et le disjoncteur de l'agenda est posé (un seul essai, jamais d'enchaînement de refus).
    if (lu && lu.erreur && /Identifiants de messagerie refusés/.test(String(lu.erreur))) {
      if (o.signalerRefus) o.signalerRefus();
      sortie.erreurs.push('identifiants Exchange refusés');
      break;
    }
    if (!lu || lu.erreur) { sortie.erreurs.push('email illisible dans Exchange'); continue; }
    sortie.lus += 1;
    const manquantes = piecesRecuesEtManquantes(d).manquantes;
    const table = new Map();
    const confrere = (e.a || []).some((a) => expediteurConfrereDossier(d, a));
    let objet;
    try {
      // Les libellés aussi sont masqués (une pièce ajoutée à la main peut nommer quelqu'un) ; l'IA ne rend que des numéros.
      objet = await o.ia.json(promptRelancePieces({ objet: masquer(String(e.objet || ''), sensibles, table), texte: masquer(String(lu.texte || '').slice(0, 4000), sensibles, table),
        manquantes: manquantes.map((m) => masquer(m, sensibles, table)), confrere }),
      SCHEMA_RELANCE, (x) => (Array.isArray(x.pieces) && typeof x.relance === 'string' ? null : 'champs attendus : pieces, relance'), 900);
    } catch (err) { sortie.erreurs.push(String(err && err.message).slice(0, 80)); continue; }
    const demandees = [...new Set(objet.pieces.map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= manquantes.length).map((n) => manquantes[n - 1]);
    const corps = retablirBrouillon(objet.relance, table);
    if (!demandees.length || !corps) continue;
    const empreinte = `relance-pieces:${e.id}`;
    sortie.propositions.push({
      id: idDepuisEmpreinte(empreinte), routine: 'relance-pieces', responsable: d.responsable, dossierId: d.id, type: 'email', action: 'email', empreinte,
      titre: `Relancer pour ${demandees.length} pièce${demandees.length > 1 ? 's' : ''} — ${libelleDossierAffiche(d)}`.slice(0, 140),
      resume: `Demandée${demandees.length > 1 ? 's' : ''} par email il y a ${Math.max(2, Math.round(joursEntre(String(e.date).slice(0, 10), new Date(o.maintenantMs).toISOString().slice(0, 10))))} jours, toujours attendue${demandees.length > 1 ? 's' : ''} : ${demandees.slice(0, 3).join(', ')}${demandees.length > 3 ? '…' : ''}.`,
      details: { destinataire: (e.a || []).join(', '), sujet: sujetReponse(e.objet), corps, confrere, geste: 'relance', niveau: o.niveau('relance-pieces', 'relance') }
    });
  }
  o.parametresRepo.ecrireJsonBrut(CLE_EMAILS_TRAITES, traites);
  return sortie;
}

// ---- R8 — Veille juridique ----

/** Le prompt de la veille (aucune donnée de client). @param {string} aujourdhui */

module.exports = {
  MODELE_ROUTINES, CLE_EMAILS_TRAITES, MAX_EMAILS_PAR_TOUR, veilleOuvree, momentParis, recuApres18h, sensiblesDesDossiers, retablirBrouillon,
  expediteurConfrereDossier, sujetReponse, lireEmailsTraites, creerIaRoutines, reponsesEmailsDuSoir, promptRelancePieces, relancePiecesDemandees
};
