'use strict';

// Client HTTP minimal vers Ollama (https://ollama.com), qui tourne EN LOCAL sur le serveur de
// l'étude — jamais un appel réseau externe (voir CLAUDE.md, décision "rester en local"/
// confidentialité notariale : le texte d'un compromis/d'une promesse ne quitte jamais le LAN).
// Ollama expose une API HTTP simple sur localhost:11434 une fois installé et un modèle téléchargé
// (`ollama pull <modele>`) — voir server/README.md pour l'installation, jamais automatisée ici
// (nécessite de télécharger plusieurs Go, impossible depuis cet environnement de développement).
//
// Aucune dépendance npm supplémentaire : `fetch` est disponible nativement dans le Node embarqué
// par build-windows-exe.mjs (Node récent avec fetch global).

const TIMEOUT_MS = 180 * 1000; // Un modèle 7-8B sur un CPU de bureau peut prendre plusieurs
// dizaines de secondes pour un acte long — mieux vaut un délai généreux qu'un abandon prématuré.

function creerClientOllama(config) {
  const url = (config.ollama && config.ollama.url) || 'http://localhost:11434';
  const modele = (config.ollama && config.ollama.modele) || 'llama3.1:8b';

  async function appelAvecTimeout(chemin, options) {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${url}${chemin}`, { ...options, signal: controleur.signal });
    } finally {
      clearTimeout(minuteur);
    }
  }

  // Vérifie qu'Ollama tourne ET que le modèle configuré est bien téléchargé — les deux causes
  // d'échec les plus probables au démarrage, distinguées pour donner un message actionnable côté
  // interface plutôt qu'un simple "IA indisponible" sans piste.
  async function verifierDisponibilite() {
    try {
      const reponse = await appelAvecTimeout('/api/tags', { method: 'GET' });
      if (!reponse.ok) return { disponible: false, raison: `Ollama a répondu ${reponse.status}.` };
      const { models = [] } = await reponse.json();
      const modeleInstalle = models.some(
        (m) => m && (m.name === modele || m.name === `${modele}:latest` || m.model === modele)
      );
      if (!modeleInstalle) {
        return {
          disponible: false,
          raison: `Ollama tourne mais le modèle "${modele}" n'est pas installé — lancez "ollama pull ${modele}" sur le serveur.`
        };
      }
      return { disponible: true, raison: '' };
    } catch (err) {
      return {
        disponible: false,
        raison: `Ollama ne répond pas sur ${url} — voir server/README.md, section "Analyse juridique par IA locale" (${err.message}).`
      };
    }
  }

  // `format: 'json'` (spécifique à Ollama) contraint le modèle à produire un JSON syntaxiquement
  // valide — le CONTENU reste sous la responsabilité du modèle (voir le prompt dans
  // routes/analyseIa.js), mais ça évite déjà la moitié des échecs de parsing observés avec un
  // modèle non contraint.
  async function generer(prompt) {
    const reponse = await appelAvecTimeout('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modele,
        prompt,
        format: 'json',
        stream: false,
        options: { temperature: 0.1 } // Une analyse juridique doit rester factuelle et reproductible,
        // pas créative — température basse plutôt que la valeur par défaut d'Ollama (0.8).
      })
    });
    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => '');
      throw new Error(`Ollama a répondu ${reponse.status} : ${texte.slice(0, 200)}`);
    }
    const donnees = await reponse.json();
    return donnees.response || '';
  }

  return { verifierDisponibilite, generer, modele, url };
}

module.exports = { creerClientOllama };
