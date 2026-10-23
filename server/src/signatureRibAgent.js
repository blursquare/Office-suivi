// @ts-check
'use strict';
// Brouillon de signature du RIB préparé par l'agent Yousign d'Anthropic (étude 23/10 : « il faut que le bouton dans CLAIRE prépare
// automatiquement le modèle »). Yousign n'enregistre que l'adresse de retour de claude.ai : CLAIRE ne peut pas s'y connecter elle-même ;
// l'étude a donc créé un agent géré (Managed Agent) branché sur Yousign, que le serveur pilote avec la clé d'API Claude des Réglages.
// Le serveur ouvre une session, envoie le signataire, lit le lien du BROUILLON dans la réponse. Aucun outil n'est accordé en dehors de la
// lecture des modèles et de la création d'un brouillon ; l'envoi est refusé, même si l'agent le demandait. Rien ne part sans le clic de
// l'étude dans Yousign. Les valeurs du signataire sont des données : revalidées ici, jamais prises telles quelles du poste.
// Identifiants (agent, environnement, coffre) : `config.json` (agentYousignId, agentYousignEnvironnement, agentYousignVault), sinon ceux de l'étude.

const { telephoneInternationalRib, premierEmailRib, signataireSignatureRib, manquesSignatureRib, consigneSignatureRib } = /** @type {any} */ (require('../../commun/signature-rib'));

const AGENT_PAR_DEFAUT = 'agent_01B92Dko9uhJ2RSRb3giDcrV';
const ENVIRONNEMENT_PAR_DEFAUT = 'env_01GhpfYHqbJcaFA9PDvdF1YY';
const OUTILS_PERMIS = new Set(['search-templates', 'create-signature-request-from-template']);
const OUTILS_LECTURE = new Set(['get-signature-request', 'get-signature-request-signer']);
const RE_ID_DEMANDE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELAI_MS = 150000;
const DELAI_REPONSE_MS = 20000;
const RE_BROUILLON = /https:\/\/yousign\.app\/auth\/workspace\/requests\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const RE_IDENTIFIANT = /^[a-z]{2,8}_[A-Za-z0-9]{10,60}$/;

/**
 * Les identifiants du `config.json` (jamais saisis par le réseau) ; une valeur douteuse est ignorée au profit de celle par défaut.
 * Pas de coffre = aucun `vault_ids` envoyé.
 * @param {any} config
 */
function reglagesAgentYousign(config) {
  const c = (config && typeof config === 'object' ? config : {});
  const pris = (/** @type {unknown} */ v, /** @type {string} */ prefixe, /** @type {string} */ defaut) => (typeof v === 'string' && v.trim().startsWith(prefixe) && RE_IDENTIFIANT.test(v.trim()) ? v.trim() : defaut);
  return { agent: pris(c.agentYousignId, 'agent_', AGENT_PAR_DEFAUT), environnement: pris(c.agentYousignEnvironnement, 'env_', ENVIRONNEMENT_PAR_DEFAUT), coffre: pris(c.agentYousignVault, 'vlt_', '') };
}

/** La décision pour un appel d'outil mis en attente : « allow » seulement pour un outil de la liste. @param {{ name?: string }} evenement */
function decisionOutil(evenement, permis) {
  const nom = String((evenement && evenement.name) || '');
  return (permis || OUTILS_PERMIS).has(nom)
    ? { result: 'allow' }
    : { result: 'deny', deny_message: `L'outil « ${nom || 'inconnu'} » n'est pas autorisé : seuls les outils prévus pour cette demande le sont.` };
}

/** Le code CLAIRE d'une erreur de l'API, sans jamais reprendre son message (il peut citer la requête). @param {any} err */
function codeErreurApi(err) {
  const statut = err && err.status;
  if (statut === 401 || statut === 403) return { code: 'cle', raison: 'La clé d’API Claude des Réglages est refusée, ou n’a pas accès à l’agent.' };
  if (statut === 404) return { code: 'introuvable', raison: 'Agent ou environnement introuvable : la clé des Réglages doit être celle du compte et de l’espace de travail de l’agent.' };
  if (statut === 429) return { code: 'limite', raison: 'Limite de débit Claude atteinte : réessayez dans un moment.' };
  return { code: 'echec', raison: 'L’agent Yousign n’a pas pu être joint.' };
}

/**
 * @param {{ parametresRepo?: any, config?: any, creerClient?: (cle: string) => any, maintenant?: () => number, delaiMs?: number, env?: NodeJS.ProcessEnv }} [o]
 */
function creerSignatureRibAgent(o = {}) {
  const env = o.env || process.env;
  const delaiMs = o.delaiMs || DELAI_MS;
  const creerClient = o.creerClient || ((/** @type {string} */ cle) => {
    const Anthropic = /** @type {any} */ (require('@anthropic-ai/sdk'));
    const Classe = Anthropic.default || Anthropic;
    return new Classe({ apiKey: cle, timeout: DELAI_REPONSE_MS * 3, maxRetries: 0 });
  });
  /** @type {Promise<any> | null} */
  let enCours = null;

  /** La clé d'API Claude des Réglages, sinon celle de l'environnement. */
  function cle() {
    const r = o.parametresRepo && o.parametresRepo.lireReglagesClaude ? o.parametresRepo.lireReglagesClaude() : {};
    return (r && r.cleApi) || env.ANTHROPIC_API_KEY || '';
  }

  async function disponibilite() {
    return { disponible: !!cle() };
  }

  /** @param {any} client @param {string} texte @param {{ agent: string, environnement: string, coffre: string }} r */
  async function seance(client, texte, r, permis) {
    const session = await client.beta.sessions.create({ agent: r.agent, environment_id: r.environnement, ...(r.coffre ? { vault_ids: [r.coffre] } : {}) });
    // Flux ouvert avant l'envoi : il ne livre que les événements postérieurs à son ouverture.
    const flux = await client.beta.sessions.events.stream(session.id);
    await client.beta.sessions.events.send(session.id, { events: [{ type: 'user.message', content: [{ type: 'text', text: texte }] }] });
    let reponse = '';
    let refus = 0;
    let erreurSession = false;
    const boucle = (async () => {
      for await (const e of flux) {
        if (e.type === 'agent.message') {
          for (const b of e.content || []) if (b.type === 'text') reponse += b.text + '\n';
        } else if ((e.type === 'agent.tool_use' || e.type === 'agent.mcp_tool_use') && e.evaluated_permission === 'ask') {
          const d = decisionOutil(e, permis);
          if (d.result === 'deny') refus++;
          await client.beta.sessions.events.send(session.id, { events: [{ type: 'user.tool_confirmation', tool_use_id: e.id, ...d }] });
        } else if (e.type === 'session.error') {
          erreurSession = true;
        } else if (e.type === 'session.status_idle') {
          if (!e.stop_reason || e.stop_reason.type !== 'requires_action') return { fin: e.stop_reason && e.stop_reason.type === 'retries_exhausted' ? 'epuise' : 'ok' };
        } else if (e.type === 'session.status_terminated') {
          return { fin: 'termine' };
        }
      }
      return { fin: 'ferme' };
    })();
    /** @type {any} */
    let minuterie;
    const delai = new Promise((resolve) => { minuterie = setTimeout(() => resolve({ fin: 'delai' }), delaiMs); });
    const issue = /** @type {any} */ (await Promise.race([boucle, delai]));
    clearTimeout(minuterie);
    if (issue.fin === 'delai') {
      // Le temps est écoulé : on demande à l'agent de s'arrêter (il ne doit pas continuer seul), sans attendre sa réponse.
      try { await client.beta.sessions.events.send(session.id, { events: [{ type: 'user.interrupt' }] }); } catch (_) { /* meilleur effort */ }
      try { if (flux && flux.controller) flux.controller.abort(); } catch (_) { /* idem */ }
    }
    return { fin: issue.fin, reponse, refus, erreurSession };
  }

  /** @param {any} corps le signataire envoyé par le poste */
  async function creerBrouillon(corps) {
    const b = corps && typeof corps === 'object' ? corps : {};
    const s = signataireSignatureRib({ prenom: b.prenom, nom: b.nom, emails: [premierEmailRib(b.email)], telephones: [telephoneInternationalRib(b.telephone)] });
    const manques = manquesSignatureRib(s);
    if (manques.length) return { ok: false, code: 'donnees', raison: `Il manque : ${manques.join(', ')}.` };
    const k = cle();
    if (!k) return { ok: false, code: 'configuration', raison: 'Aucune clé d’API Claude n’est enregistrée (Réglages › IA et relecture d’actes).' };
    if (enCours) return { ok: false, code: 'occupe', raison: 'Un brouillon est déjà en cours de préparation. Réessayez dans un instant.' };
    enCours = (async () => {
      try {
        const r = await seance(creerClient(k), consigneSignatureRib(s), reglagesAgentYousign(o.config));
        if (r.fin === 'delai') return { ok: false, code: 'delai', raison: 'L’agent n’a pas répondu à temps. Vérifiez dans Yousign si un brouillon a été créé avant de recommencer.' };
        if (r.fin === 'termine' || r.fin === 'ferme' || r.fin === 'epuise') return { ok: false, code: 'echec', raison: 'La session de l’agent s’est arrêtée avant la fin.' };
        const m = RE_BROUILLON.exec(r.reponse);
        if (!m) {
          return r.refus
            ? { ok: false, code: 'refuse', raison: 'L’agent a demandé un outil non autorisé : rien n’a été créé.' }
            : { ok: false, code: 'sans_lien', raison: 'L’agent n’a pas rendu de lien de brouillon : rien ne permet de dire qu’il est créé.' };
        }
        return { ok: true, id: m[1].toLowerCase(), url: m[0] };
      } catch (e) {
        return { ok: false, ...codeErreurApi(e) };
      }
    })().finally(() => { enCours = null; });
    return enCours;
  }

  /**
   * L'état d'une demande de signature créée plus tôt (lecture seule : get-signature-request) : une phrase, jamais un envoi.
   * @param {unknown} id l'identifiant d'une demande, tel que rendu à la création du brouillon
   */
  async function lireStatut(id) {
    const identifiant = String(id || '').trim().toLowerCase();
    if (!RE_ID_DEMANDE.test(identifiant)) return { ok: false, code: 'donnees', raison: 'Identifiant de demande invalide.' };
    const k = cle();
    if (!k) return { ok: false, code: 'configuration', raison: 'Aucune clé d’API Claude n’est enregistrée (Réglages › IA et relecture d’actes).' };
    if (enCours) return { ok: false, code: 'occupe', raison: 'Une demande est déjà en cours. Réessayez dans un instant.' };
    const consigne = ['Lecture seule : appelle get-signature-request avec l\'identifiant ' + identifiant + ' (aucun autre outil, rien ne se modifie, rien ne s\'envoie).',
      'Réponds en deux phrases au plus, sans nom ni adresse : l\'état de la demande (brouillon, envoyée, signée, refusée, expirée…) et, pour le signataire, s\'il a signé.'].join('\n');
    enCours = (async () => {
      try {
        const r = await seance(creerClient(k), consigne, reglagesAgentYousign(o.config), OUTILS_LECTURE);
        if (r.fin === 'delai') return { ok: false, code: 'delai', raison: 'L’agent n’a pas répondu à temps.' };
        if (r.fin !== 'ok') return { ok: false, code: 'echec', raison: 'La session de l’agent s’est arrêtée avant la fin.' };
        const texte = String(r.reponse || '').replace(/\s+/g, ' ').trim().slice(0, 400);
        return texte ? { ok: true, statut: texte } : { ok: false, code: 'sans_reponse', raison: 'L’agent n’a rien rendu.' };
      } catch (e) {
        return { ok: false, ...codeErreurApi(e) };
      }
    })().finally(() => { enCours = null; });
    return enCours;
  }

  return { disponibilite, creerBrouillon, lireStatut };
}

module.exports = { creerSignatureRibAgent, OUTILS_LECTURE, reglagesAgentYousign, decisionOutil, codeErreurApi, OUTILS_PERMIS, AGENT_PAR_DEFAUT, ENVIRONNEMENT_PAR_DEFAUT };
