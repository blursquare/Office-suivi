// @ts-check
'use strict';
// « Demander à CLAIRE » par l'API Claude (étude 08/10 : « connecte Claude à Demander à CLAIRE pour toutes les requêtes »).
// Même règle que Mistral (assistantMistral.js) : seule la PHRASE part, noms masqués par le serveur avant l'envoi
// (`pseudonymiserDemande`), valeurs recopiées rétablies au retour ; aucune donnée de fiche dans le prompt. Même interface que le
// client Ollama (`verifierDisponibilite`, `genererJson`) : comprendreDemande ne voit pas la différence. La clé est celle de la
// Relecture d'actes (Réglages › IA et relecture d'actes), jamais renvoyée par une route.

const A = require('../../commun/assistant');
const { noterUsageAssistant } = require('./assistantMistral');

const MODELE_ASSISTANT_CLAUDE = 'claude-opus-5';
const DELAI_CLAUDE_MS = 20 * 1000;
const MAX_JETONS_CLAUDE = 600;
const PARAMETRES_CHAINES = ['dossier', 'date', 'heure', 'texte', 'modele', 'echeance', 'champ', 'partie', 'ecran', 'collaborateur', 'titre'];

// Sortie structurée : une intention de la liste fermée, chaque paramètre une chaîne ("" si absent), le montant un nombre ou null.
const SCHEMA_ASSISTANT = {
  type: 'object',
  additionalProperties: false,
  required: ['intention', 'parametres'],
  properties: {
    intention: { type: 'string', enum: A.INTENTIONS_ASSISTANT.map((i) => i.cle) },
    parametres: {
      type: 'object',
      additionalProperties: false,
      required: [...PARAMETRES_CHAINES, 'montant'],
      properties: Object.fromEntries([...PARAMETRES_CHAINES.map((k) => [k, { type: 'string' }]), ['montant', { type: ['number', 'null'] }]])
    }
  }
};

function creerClientParDefaut(cle) {
  const Anthropic = /** @type {any} */ (require('@anthropic-ai/sdk'));
  const Classe = Anthropic.default || Anthropic;
  return new Classe({ apiKey: cle, timeout: DELAI_CLAUDE_MS, maxRetries: 0 });
}

/** Message d'erreur sans aucun contenu de la requête. @param {any} err */
function messageErreurClaude(err) {
  const statut = err && err.status;
  if (statut === 401) return 'clé Claude refusée';
  if (statut === 403) return 'cette clé n’a pas accès au modèle';
  if (statut === 429) return 'limite de débit Claude atteinte';
  if (statut >= 500) return 'service de Claude momentanément indisponible';
  if (err && /timeout|timed out/i.test(String(err.name || '') + String(err.message || ''))) return 'Claude n’a pas répondu en 20 s';
  return 'Claude injoignable depuis le serveur';
}

/**
 * Client Claude à l'interface du client Ollama. `cle` vide → indisponible. Un seul essai, 20 s au plus, JSON par schéma.
 * @param {{ cle: string, parametresRepo?: any, client?: any }} o  `client` : faux client Anthropic des tests.
 */
function creerClientClaudeAssistant({ cle, parametresRepo, client }) {
  let sdk = client || null;
  const noter = (ajout) => { if (parametresRepo) noterUsageAssistant(parametresRepo, ajout, undefined, 'claude'); };
  return {
    modele: MODELE_ASSISTANT_CLAUDE,
    moteur: 'claude',
    async verifierDisponibilite() {
      return cle ? { disponible: true, raison: '' } : { disponible: false, raison: 'Aucune clé Claude : à saisir dans Réglages › IA et relecture d’actes.' };
    },
    /** @param {string} prompt @param {(o: any) => string|null} valider */
    async genererJson(prompt, valider) {
      if (!sdk) sdk = creerClientParDefaut(cle);
      let message;
      try {
        // Phrase courte, réponse attendue vite : sans réflexion, effort bas ; JSON garanti par le schéma.
        message = await sdk.messages.create({
          model: MODELE_ASSISTANT_CLAUDE,
          max_tokens: MAX_JETONS_CLAUDE,
          thinking: { type: 'disabled' },
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_ASSISTANT } },
          messages: [{ role: 'user', content: prompt }]
        });
      } catch (err) {
        noter({ erreur: true });
        throw new Error(messageErreurClaude(err));
      }
      const usage = (message && message.usage) || {};
      noter({ entree: usage.input_tokens || 0, sortie: usage.output_tokens || 0 });
      if (message.stop_reason === 'refusal') throw new Error('Claude a refusé la demande');
      const brut = (message.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
      let objet;
      try { objet = JSON.parse(brut); } catch (_) {
        throw new Error(message.stop_reason === 'max_tokens' ? 'réponse de Claude coupée (trop longue)' : 'réponse de Claude illisible');
      }
      const probleme = valider ? valider(objet) : null;
      if (probleme) throw new Error(`réponse de Claude hors format (${probleme})`);
      return objet;
    }
  };
}

module.exports = { MODELE_ASSISTANT_CLAUDE, SCHEMA_ASSISTANT, creerClientClaudeAssistant, messageErreurClaude };
