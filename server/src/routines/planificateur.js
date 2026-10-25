// @ts-check
'use strict';
// Planificateur des routines de CLAIRE (phase 0, cadrage : docs/spec-routines-claire.md) : un tour par minute, jours ouvrés seulement.
// Il (1) fait expirer les propositions restées sans réponse 30 jours, (2) lance les routines horaires dues — aucune n'existe encore en phase 0 —
// et (3) envoie à l'heure choisie (9 h 30 par défaut) UN résumé Teams par collaborateur qui a des propositions nouvelles. Une routine qui échoue
// est notée au journal et JAMAIS relancée d'elle-même ; un tour est protégé contre le chevauchement. `envoyer` injectable pour les tests.

const { routineParId } = require('./catalogue');
const { lireReglagesRoutines } = require('./reglages');
const { lirePropositions, ecrirePropositions, expirer } = require('./propositions');
const { synchroniserEtatCartes } = require('../canaux/etatCartes');
const { celebrerSignatures } = require('../canaux/celebrations');
const signaux = require('../canaux/signaux');
const { deposerProposition } = require('../canaux/deposer');
const { purgerCanauxOrphelins, purgerMessagesAnciens } = require('../canaux/canaux');
const { noterJournalRoutines } = require('./journal');
const { proposerExemples } = require('./essai');
const X = require('./executants');
const IA = require('./ia');
const { niveauEffectif } = require('./reglages');
const { statsRoutine } = require('./propositions');
const { CATALOGUE } = require('./catalogue');
const { libelleDossierAffiche } = require('../../../commun/dossier');
const { envoiConfigure } = require('../envoiEmail');
const { noterVerification } = require('../verificationsTerrain');
const { COLLABORATEURS_ABSENCE } = require('../agendaOffice');
const COLLABORATEURS = COLLABORATEURS_ABSENCE.map((c) => c.nom);

const CLE_ETAT_ROUTINES = 'routines-etat';
// Les routines par le code (executants.js) : `matin` = une fois par jour ouvré à l'heure du passage ; `continu` = toutes les 15 min de 8 h
// à 19 h (une proposition n'est jamais refaite : l'empreinte suffit à ne pas répéter).
const ROUTINES_CODE = {
  'revue-matin': { fn: X.revueDuMatin, quand: 'matin' },
  'proposition-dates': { fn: X.propositionDates, quand: 'matin' },
  'veille-signature': { fn: X.veilleSignature, quand: 'continu' },
  constitution: { fn: X.constitutionDossier, quand: 'continu' },
  'appel-fonds': { fn: X.appelDeFonds, quand: 'continu' },
  'autorisations-notoriete': { fn: X.autorisationsNotoriete, quand: 'continu' }
};
const INTERVALLE_CONTINU_MS = 15 * 60 * 1000;
const HEURE_DEBUT_BUREAU = '08:00';
const HEURE_FIN_BUREAU = '19:00';
const ADMINISTRATEUR = 'Bastien ANGLUMENT';
const INTERVALLE_PLANIFICATEUR_MS = 60 * 1000;
const MAX_TITRES_RESUME = 6;

/** @param {Date} date */
function infosParis(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  const jour = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  return { iso: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, jour, ouvre: jour >= 1 && jour <= 5 };
}

/** « Julie VASSELIN » → « Julie ». @param {string} nom */
function prenomDe(nom) {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
  const prenom = mots.filter((m) => m !== m.toUpperCase() || !/[A-ZÀ-Ý]/.test(m));
  return (prenom.length ? prenom : mots).join(' ');
}

/**
 * Le texte du résumé Teams d'un collaborateur : un message groupé, jamais une alerte par proposition.
 * @param {string} responsable @param {any[]} propositions ses propositions nouvelles @param {(id: string) => string} libelleDossier
 */
function texteResumeTeams(responsable, propositions, libelleDossier) {
  const n = propositions.length;
  const lignes = propositions.slice(0, MAX_TITRES_RESUME).map((p) => {
    const dossier = p.dossierId ? libelleDossier(p.dossierId) : '';
    return `• ${String(p.titre).replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()}${dossier ? ` — ${dossier}` : ''}`;
  });
  const reste = n - lignes.length;
  return `📝 CLAIRE — Bonjour ${prenomDe(responsable)}, j’ai préparé ${n} chose${n > 1 ? 's' : ''} pour vous :\n${lignes.join('\n')}${reste > 0 ? `\n… et ${reste} autre${reste > 1 ? 's' : ''}` : ''}\n\nOuvrez CLAIRE (l’icône ✦ en haut de la barre) pour les autoriser ou les refuser. Rien ne part sans votre clic.`;
}

/**
 * @param {{ parametresRepo: any, depot?: any, envoyer?: (reglages: any, adresse: string, texte: string) => Promise<{ ok: boolean, erreur?: string | null }>,
 *   ia?: any, lireEmail?: (id: string) => Promise<any>, injectionsEmails?: any }} deps  `ia`, `lireEmail` : faux client de l'IA et lecture d'un email (tests)
 */
function creerPlanificateur(deps) {
  const { parametresRepo, depot } = deps;
  const envoyer = deps.envoyer || ((r, a, t) => require('../envoiEmail').envoyerEmail(r, a, t));
  let enCours = false;

  const lireEtat = () => {
    const e = parametresRepo.lireJsonBrut(CLE_ETAT_ROUTINES, null);
    return { dernierePurgeCanaux: e && typeof e.dernierePurgeCanaux === 'string' ? e.dernierePurgeCanaux : '', dernierResume: e && typeof e.dernierResume === 'string' ? e.dernierResume : '', derniersPassages: e && e.derniersPassages && typeof e.derniersPassages === 'object' ? e.derniersPassages : {} };
  };
  const libelleDossier = (id) => {
    try { const d = depot && depot.trouverParId ? depot.trouverParId(id) : null; return d ? libelleDossierAffiche(d) : ''; } catch (e) { return ''; }
  };

  /**
   * Lance une routine à la demande. Phase 0 : seule « essai » existe. Rend { ok, ajoutees, message }.
   * @param {string} routineId @param {{ responsable: string, maintenant?: Date }} options
   */
  function lancer(routineId, options) {
    const routine = routineParId(routineId);
    const maintenant = (options && options.maintenant) || new Date();
    if (!routine) return { ok: false, ajoutees: 0, message: 'Routine inconnue.' };
    if (!routine.disponible) return { ok: false, ajoutees: 0, message: `Cette routine n’est pas encore disponible (phase ${routine.phase}).` };
    const responsable = String((options && options.responsable) || '').trim();
    if (!responsable) return { ok: false, ajoutees: 0, message: 'Collaborateur non indiqué.' };
    if (routineId !== 'essai') return lancerRoutine(routineId, maintenant, responsable);
    let ajoutees = 0;
    for (const p of proposerExemples({ responsable, jour: infosParis(maintenant).iso })) {
      if (deposerProposition(parametresRepo, p, maintenant).ok) ajoutees += 1;
    }
    const message = ajoutees ? `${ajoutees} proposition${ajoutees > 1 ? 's' : ''} d’exemple déposée${ajoutees > 1 ? 's' : ''} dans la boîte de ${prenomDe(responsable)}.` : `Les exemples d’aujourd’hui sont déjà dans la boîte de ${prenomDe(responsable)}.`;
    noterJournalRoutines(parametresRepo, { routine: routineId, texte: message, resultat: ajoutees ? 'ok' : 'rien', niveau: 1 }, maintenant);
    return { ok: true, ajoutees, message };
  }

  // ---- Les routines construites (25/10) ----

  const niveauPour = (reglages) => (r, g) => niveauEffectif(reglages, r, g);
  const dossiersOuverts = () => { try { return depot && depot.tousActifs ? depot.tousActifs() : []; } catch (e) { return []; } };
  const sondagesOuverts = () => {
    try { return new Set((parametresRepo.lireSondagesCreneaux ? parametresRepo.lireSondagesCreneaux() : []).filter((x) => x && x.statut === 'ouvert' && x.dossierId).map((x) => x.dossierId)); } catch (e) { return new Set(); }
  };
  const lireEmail = deps.lireEmail || ((id) => require('../emailsDossiers').lireEmailComplet(parametresRepo, id, deps.injectionsEmails || {}));
  const ia = () => deps.ia || IA.creerIaRoutines({ parametresRepo });

  /** Dépose les propositions d'une routine et le dit au journal. @param {string} routineId @param {any[]} liste @param {Date} maintenant */
  function deposer(routineId, liste, maintenant) {
    let ajoutees = 0;
    for (const p of liste) if (deposerProposition(parametresRepo, p, maintenant).ok) ajoutees += 1;
    const nom = (routineParId(routineId) || { nom: routineId }).nom;
    if (ajoutees) noterJournalRoutines(parametresRepo, { routine: routineId, texte: `${nom} : ${ajoutees} proposition${ajoutees > 1 ? 's' : ''} déposée${ajoutees > 1 ? 's' : ''}.`, resultat: 'ok', niveau: 1 }, maintenant);
    if (ajoutees && ROUTINES_CODE[/** @type {keyof typeof ROUTINES_CODE} */ (routineId)]) noterVerification(parametresRepo, 'routines-' + routineId, { detail: 'proposition déposée' });
    return ajoutees;
  }

  /** Une routine par l'IA : rend { ajoutees, message }. @param {string} routineId @param {any} reglages @param {Date} maintenant */
  async function routineIa(routineId, reglages, maintenant) {
    const client = ia();
    const dispo = client.disponible();
    if (!dispo.ok) {
      noterJournalRoutines(parametresRepo, { routine: routineId, texte: `${(routineParId(routineId) || { nom: routineId }).nom} non lancée : ${dispo.raison}.`, resultat: 'erreur' }, maintenant);
      return { ajoutees: 0, message: `Non lancée : ${dispo.raison}.` };
    }
    const info = infosParis(maintenant);
    const etatEmails = (() => { try { return require('../emailsDossiers').lireEtat(parametresRepo); } catch (e) { return { emails: [], prepares: [] }; } })();
    const rx = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
    const agendaWatch = require('../agendaWatch');
    const commun = { ia: client, parametresRepo, dossiers: dossiersOuverts(), emails: etatEmails.emails || [], prepares: etatEmails.prepares || [], aujourdhui: info.iso,
      maintenantMs: maintenant.getTime(), lireEmail, niveau: niveauPour(reglages), signalerRefus: () => { try { agendaWatch.signalerIdentifiantsRefuses(rx); } catch (e) { /* rien */ } } };
    if (routineId === 'reponses-emails' || routineId === 'relance-pieces') {
      // Même disjoncteur que l'agenda : identifiants Exchange refusés = aucune lecture (un seul essai, jamais un enchaînement de refus).
      if (!deps.lireEmail && agendaWatch.lectureAgendaSuspendue(rx)) {
        noterJournalRoutines(parametresRepo, { routine: routineId, texte: 'Non lancée : identifiants Exchange refusés (Réglages › Agenda et Outlook).', resultat: 'erreur' }, maintenant);
        return { ajoutees: 0, message: 'Non lancée : identifiants Exchange refusés.' };
      }
      const r = routineId === 'reponses-emails' ? await IA.reponsesEmailsDuSoir(commun) : await IA.relancePiecesDemandees(commun);
      const ajoutees = deposer(routineId, r.propositions, maintenant);
      if (r.erreurs.length) noterJournalRoutines(parametresRepo, { routine: routineId, texte: `${r.erreurs.length} email${r.erreurs.length > 1 ? 's' : ''} non traité${r.erreurs.length > 1 ? 's' : ''} (${r.erreurs[0]}).`, resultat: 'erreur' }, maintenant);
      noterVerification(parametresRepo, 'routines-' + routineId, r.erreurs.length && !r.lus ? { ok: false, message: 'emails illisibles ou IA en échec' } : { detail: `${r.lus} email(s) lu(s)` });
      return { ajoutees, message: `${r.lus} email${r.lus > 1 ? 's' : ''} lu${r.lus > 1 ? 's' : ''}, ${ajoutees} brouillon${ajoutees > 1 ? 's' : ''} déposé${ajoutees > 1 ? 's' : ''}.` };
    }
    if (routineId === 'veille-juridique') {
      const rw = require('../conversationsAgent').lireRechercheWeb(parametresRepo);
      if (!rw.actif || !rw.domaines.length) {
        noterJournalRoutines(parametresRepo, { routine: routineId, texte: 'Veille non lancée : recherche web coupée ou sans site autorisé (Réglages › IA et relecture d’actes).', resultat: 'erreur' }, maintenant);
        return { ajoutees: 0, message: 'Recherche web coupée dans les Réglages.' };
      }
      // Déjà déposée cette semaine : aucun appel (chaque appel avec recherche se paie).
      const lundiSemaine = new Date(Date.parse(info.iso + 'T12:00:00Z') - ((info.jour + 6) % 7) * 86400000).toISOString().slice(0, 10);
      if (lirePropositions(parametresRepo).some((x) => x.routine === routineId && String(x.empreinte).slice(7) >= lundiSemaine)) return { ajoutees: 0, message: 'La veille de cette semaine est déjà déposée.' };
      const domaines = rw.domaines;
      let texte = '';
      try { texte = await client.texteAvecRecherche(IA.promptVeilleJuridique(info.iso), domaines); } catch (e) {
        noterJournalRoutines(parametresRepo, { routine: routineId, texte: `Veille juridique en échec : ${String(e && e.message).slice(0, 100)}`, resultat: 'erreur' }, maintenant);
        noterVerification(parametresRepo, 'routines-veille-juridique', { ok: false, message: 'IA en échec' });
        return { ajoutees: 0, message: 'La veille juridique a échoué.' };
      }
      texte = require('../../../commun/assistant').sansSaufErreur(texte).slice(0, 6000);
      if (!texte) return { ajoutees: 0, message: 'Rien reçu.' };
      const empreinte = `veille:${info.iso}`;
      const p = { id: X.idDepuisEmpreinte(empreinte), routine: routineId, responsable: '', dossierId: '', type: 'alerte', action: 'vu', empreinte,
        titre: `Veille juridique de la semaine (${X.dateFr(info.iso)})`, resume: texte.replace(/\s+/g, ' ').slice(0, 380), details: { corps: texte } };
      const ajoutees = deposer(routineId, [p], maintenant);
      if (ajoutees) {
        const { htmlSurCanal } = /** @type {any} */ (require('../../../commun/html-canal'));
        const echap = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = texte.split(/\n{2,}/).map((bloc) => `<p>${echap(bloc).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')}</p>`).join('');
        require('../canaux/canaux').ajouterMessage(parametresRepo, 'general', { auteur: 'CLAIRE', claire: true, texte, html: htmlSurCanal(html) }, maintenant.getTime() + 1);
      }
      noterVerification(parametresRepo, 'routines-veille-juridique', { detail: 'veille déposée' });
      return { ajoutees, message: ajoutees ? 'Veille juridique déposée dans « général ».' : 'La veille de cette semaine est déjà déposée.' };
    }
    return { ajoutees: 0, message: 'Routine sans exécutant.' };
  }

  /** Phase 4 : une routine acceptée à 90 % sur 30 propositions — CLAIRE propose à l'administrateur de passer au niveau supérieur, jamais d'office. @param {any} reglages @param {Date} maintenant */
  function proposerPromotions(reglages, maintenant) {
    const toutes = lirePropositions(parametresRepo);
    const liste = [];
    for (const r of CATALOGUE) {
      if (r.id === 'essai') continue;
      const s = statsRoutine(toutes, r.id);
      const niveau = (reglages.routines[r.id] && reglages.routines[r.id].niveau) || 1;
      const max = r.gestes.reduce((m, g) => Math.max(m, g.niveauMax), 1);
      if (!s.promotionPossible || niveau >= max) continue;
      const empreinte = `promotion:${r.id}:${niveau + 1}`;
      liste.push({ id: X.idDepuisEmpreinte(empreinte), routine: 'promotion', responsable: ADMINISTRATEUR, dossierId: '', type: 'alerte', action: 'vu', empreinte,
        titre: `« ${r.nom} » : passer au niveau ${niveau + 1} ?`,
        resume: `${Math.round((s.taux || 0) * 100)} % de propositions acceptées sur ${s.decidees}. Au niveau ${niveau + 1}, CLAIRE ${niveau + 1 === 2 ? 'exécute elle-même après votre « Autoriser », envoi compris' : 'agit seule'}. C’est à vous de décider, dans Réglages › Routines.`,
        details: { ouvrir: 'reglages-routines' } });
    }
    return deposer('promotion', liste, maintenant);
  }

  /**
   * Les routines dues à ce tour (jours ouvrés). `force` : « Lancer maintenant » d'une routine, quelle que soit l'heure.
   * @param {any} reglages @param {Date} maintenant
   */
  async function routinesDues(reglages, maintenant) {
    const info = infosParis(maintenant);
    const etat = lireEtat();
    const passages = Object.assign({}, etat.derniersPassages);
    const actif = (id) => !!(reglages.routines[id] && reglages.routines[id].actif);
    const auBureau = info.hhmm >= HEURE_DEBUT_BUREAU && info.hhmm < HEURE_FIN_BUREAU;
    const marquer = (id, valeur) => { passages[id] = valeur; parametresRepo.ecrireJsonBrut(CLE_ETAT_ROUTINES, Object.assign({}, lireEtat(), { derniersPassages: passages })); };
    let dossiers = null;
    const lesDossiers = () => (dossiers || (dossiers = dossiersOuverts()));
    for (const [id, r] of Object.entries(ROUTINES_CODE)) {
      if (!actif(id) || !auBureau) continue;
      if (r.quand === 'matin' ? (info.hhmm < reglages.heure || passages[id] === info.iso) : (maintenant.getTime() - (Date.parse(passages[id] || '') || 0) < INTERVALLE_CONTINU_MS)) continue;
      marquer(id, r.quand === 'matin' ? info.iso : maintenant.toISOString());
      try {
        deposer(id, r.fn(lesDossiers(), info.iso, { niveau: niveauPour(reglages), sondagesOuverts: sondagesOuverts() }), maintenant);
      } catch (e) {
        noterJournalRoutines(parametresRepo, { routine: id, texte: `Routine interrompue : ${String(e && e.message).slice(0, 120)}`, resultat: 'erreur' }, maintenant);
      }
    }
    // Par l'IA : les brouillons de réponse aux emails du soir et les relances dès 8 h ; la veille juridique le lundi à l'heure du passage.
    for (const id of ['reponses-emails', 'relance-pieces']) {
      // 8 h 05 : le relevé des emails des dossiers (toutes les minutes) a eu le temps de prendre ceux arrivés juste avant 8 h.
      if (!actif(id) || info.hhmm < '08:05' || !auBureau || passages[id] === info.iso) continue;
      marquer(id, info.iso);
      try { await routineIa(id, reglages, maintenant); } catch (e) {
        noterJournalRoutines(parametresRepo, { routine: id, texte: `Routine interrompue : ${String(e && e.message).slice(0, 120)}`, resultat: 'erreur' }, maintenant);
      }
    }
    if (actif('veille-juridique') && info.jour === 1 && info.hhmm >= reglages.heure && auBureau && passages['veille-juridique'] !== info.iso) {
      marquer('veille-juridique', info.iso);
      try { await routineIa('veille-juridique', reglages, maintenant); } catch (e) {
        noterJournalRoutines(parametresRepo, { routine: 'veille-juridique', texte: `Routine interrompue : ${String(e && e.message).slice(0, 120)}`, resultat: 'erreur' }, maintenant);
      }
    }
    if (info.hhmm >= reglages.heure && auBureau && passages.promotion !== info.iso) {
      marquer('promotion', info.iso);
      try { proposerPromotions(reglages, maintenant); } catch (e) { /* jamais bloquant */ }
    }
  }

  /** « Lancer maintenant » d'une routine construite (Réglages › Routines), quelle que soit l'heure. @param {string} routineId @param {Date} maintenant @param {string} responsable */
  async function lancerRoutine(routineId, maintenant, responsable) {
    const reglages = lireReglagesRoutines(parametresRepo);
    if (!reglages.actif || !(reglages.routines[routineId] && reglages.routines[routineId].actif)) return { ok: false, ajoutees: 0, message: 'Cette routine est éteinte (Réglages › Routines).' };
    // Jamais en même temps qu'un tour : les mêmes emails seraient lus (et payés) deux fois.
    if (enCours) return { ok: false, ajoutees: 0, message: 'Un passage des routines est en cours : réessayez dans une minute.' };
    enCours = true;
    try { return await lancerRoutineSeule(routineId, reglages, maintenant, responsable); } finally { enCours = false; }
  }

  /** @param {string} routineId @param {any} reglages @param {Date} maintenant @param {string} responsable */
  async function lancerRoutineSeule(routineId, reglages, maintenant, responsable) {
    const info = infosParis(maintenant);
    const r = /** @type {any} */ (ROUTINES_CODE)[routineId];
    if (r) {
      const ajoutees = deposer(routineId, r.fn(dossiersOuverts(), info.iso, { niveau: niveauPour(reglages), sondagesOuverts: sondagesOuverts() }), maintenant);
      noterJournalRoutines(parametresRepo, { routine: routineId, texte: `Lancée à la main par ${prenomDe(responsable)} : ${ajoutees} proposition${ajoutees > 1 ? 's' : ''}.`, resultat: ajoutees ? 'ok' : 'rien' }, maintenant);
      return { ok: true, ajoutees, message: ajoutees ? `${ajoutees} proposition${ajoutees > 1 ? 's' : ''} déposée${ajoutees > 1 ? 's' : ''} dans les canaux des dossiers.` : 'Rien de nouveau à proposer pour l’instant.' };
    }
    const res = await routineIa(routineId, reglages, maintenant);
    return { ok: true, ajoutees: res.ajoutees, message: res.message };
  }

  /** Un tour : expiration, routines horaires dues, résumé Teams. @param {Date} [date] */
  async function tour(date) {
    if (enCours) return { saute: true };
    enCours = true;
    const maintenant = date || new Date();
    const bilan = { expirees: 0, resumes: 0 };
    try {
      const avant = lirePropositions(parametresRepo);
      const apres = expirer(avant, maintenant);
      if (apres !== avant) { bilan.expirees = apres.filter((p, i) => p.etat !== avant[i].etat).length; ecrirePropositions(parametresRepo, apres); }
      // L'état des cartes (⏳ sans réponse depuis un jour, 💤 expirée) se dit par une réaction de CLAIRE sur la carte.
      try { synchroniserEtatCartes(parametresRepo, maintenant.getTime()); } catch (e) { /* de l'affichage : jamais bloquant */ }
      // 🎉 de CLAIRE dans le canal d'un dossier dont l'acte vient d'être signé (une fois par dossier).
      const dossiersActifs = depot && depot.tousActifs ? (() => { try { return depot.tousActifs(); } catch (e) { return []; } })() : [];
      try { if (dossiersActifs.length) celebrerSignatures(parametresRepo, dossiersActifs); } catch (e) { /* de l'affichage : jamais bloquant */ }
      // Signaux de CLAIRE dans les canaux : ⚠️ retard, ✅ tâche faite, 🎂 anniversaires (jamais bloquants).
      try {
        const jourParis = infosParis(maintenant);
        if (dossiersActifs.length) signaux.signalerRetards(parametresRepo, dossiersActifs, jourParis.iso);
        if (parametresRepo.lireRappelsPerso) signaux.confirmerTachesFaites(parametresRepo, parametresRepo.lireRappelsPerso(), COLLABORATEURS);
        signaux.feterAnniversaires(parametresRepo, jourParis.iso, maintenant.getTime());
        if (jourParis.ouvre && jourParis.hhmm >= '09:30') signaux.resumerInterrogations(parametresRepo, jourParis.iso, maintenant.getTime());
      } catch (e) { /* de l'affichage : jamais bloquant */ }
      // Canaux de dossiers supprimés : vidés, une fois par jour.
      const jourPurge = infosParis(maintenant).iso;
      const etatPurge = lireEtat();
      if (depot && depot.trouverParId && etatPurge.dernierePurgeCanaux !== jourPurge) {
        purgerCanauxOrphelins(parametresRepo, (id) => { try { return !!depot.trouverParId(id); } catch (e) { return true; } });
        purgerMessagesAnciens(parametresRepo, maintenant.getTime());
        parametresRepo.ecrireJsonBrut(CLE_ETAT_ROUTINES, Object.assign({}, etatPurge, { dernierePurgeCanaux: jourPurge }));
      }
      const reglages = lireReglagesRoutines(parametresRepo);
      const info = infosParis(maintenant);
      if (!reglages.actif || !info.ouvre) return bilan;
      // Les routines dues : chacune notée au journal, jamais relancée d'elle-même après un échec (son passage est marqué AVANT l'exécution).
      await routinesDues(reglages, maintenant);
      // Résumé Teams de l'heure choisie : un message par collaborateur, une fois par jour ouvré.
      const etat = lireEtat();
      if (reglages.teams && info.hhmm >= reglages.heure && etat.dernierResume !== info.iso) {
        parametresRepo.ecrireJsonBrut(CLE_ETAT_ROUTINES, Object.assign({}, etat, { dernierResume: info.iso }));
        const reglagesMail = parametresRepo.lireReglages();
        const nouvelles = lirePropositions(parametresRepo).filter((p) => p.etat === 'proposee' && !p.resumeTeamsLe && !p.exemple && p.responsable);
        const parResponsable = new Map();
        for (const p of nouvelles) parResponsable.set(p.responsable, [...(parResponsable.get(p.responsable) || []), p]);
        if (parResponsable.size && !envoiConfigure(reglagesMail)) {
          noterJournalRoutines(parametresRepo, { routine: 'resume', texte: 'Résumé Teams non envoyé : l’envoi des rappels n’est pas configuré (Réglages › Rappels).', resultat: 'erreur' }, maintenant);
        } else {
          const marquees = new Set();
          for (const [responsable, liste] of parResponsable) {
            const adresse = (reglagesMail.emailsResponsables || {})[responsable];
            if (!adresse) {
              noterJournalRoutines(parametresRepo, { routine: 'resume', texte: `Résumé Teams non envoyé à ${prenomDe(responsable)} : aucune adresse dans Réglages › Rappels.`, resultat: 'erreur' }, maintenant);
              continue;
            }
            /** @type {any} */
            let r;
            try { r = await envoyer(reglagesMail, adresse, texteResumeTeams(responsable, liste, libelleDossier)); } catch (e) { r = { ok: false, erreur: e && e.message }; }
            if (r && r.ok && r.messageId) {
              try { require('../nettoyageGmail').mettreCopiesEnAttente(parametresRepo, reglagesMail, [r.messageId]); } catch (_) { /* la copie restera dans les envoyés */ }
            }
            noterVerification(parametresRepo, 'routines-resume-teams', r && r.ok ? { detail: 'résumé Teams envoyé' } : { ok: false, message: 'résumé Teams refusé' });
            if (r && r.ok) { bilan.resumes += 1; liste.forEach((p) => marquees.add(p.id)); } else {
              noterJournalRoutines(parametresRepo, { routine: 'resume', texte: `Résumé Teams non envoyé à ${prenomDe(responsable)} : ${String((r && r.erreur) || 'erreur').slice(0, 120)}`, resultat: 'erreur' }, maintenant);
            }
          }
          if (marquees.size) {
            ecrirePropositions(parametresRepo, lirePropositions(parametresRepo).map((p) => (marquees.has(p.id) ? Object.assign({}, p, { resumeTeamsLe: maintenant.toISOString() }) : p)));
            noterJournalRoutines(parametresRepo, { routine: 'resume', texte: `Résumé Teams envoyé à ${bilan.resumes} collaborateur${bilan.resumes > 1 ? 's' : ''} (${marquees.size} proposition${marquees.size > 1 ? 's' : ''}).`, resultat: 'ok' }, maintenant);
          }
        }
      }
      return bilan;
    } catch (e) {
      noterJournalRoutines(parametresRepo, { routine: 'planificateur', texte: `Tour interrompu : ${String(e && e.message).slice(0, 150)}`, resultat: 'erreur' }, maintenant);
      return bilan;
    } finally {
      enCours = false;
    }
  }

  /** @param {number} [intervalleMs] */
  function demarrer(intervalleMs) {
    const minuteur = setInterval(() => { tour().catch(() => {}); }, intervalleMs || INTERVALLE_PLANIFICATEUR_MS);
    if (minuteur && typeof minuteur.unref === 'function') minuteur.unref();
    return minuteur;
  }

  return { lancer, tour, demarrer, lireEtat };
}

module.exports = { CLE_ETAT_ROUTINES, infosParis, prenomDe, texteResumeTeams, creerPlanificateur };
