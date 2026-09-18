'use strict';

// Envoi d'un message privé à un collaborateur sur Teams, via un flux Power Automate déclenché par
// une simple requête HTTP (voir server/README.md, section "Rappels automatiques vers Teams", pour
// la procédure de création du flux dans Power Automate — CLAIRE ne fait ici qu'un POST JSON, tout
// le routage vers la bonne personne est fait par LE FLUX ("Publier un message... en tant que Flow
// bot, dans un chat avec Flow bot", destinataire = adresse email dynamique du corps de la requête).
// Choisi plutôt qu'une inscription d'application Azure AD/Microsoft Graph (déjà écartée pour les
// mêmes raisons lors des relances email/calendrier — voir CLAUDE.md, "Mode serveur intranet") :
// aucun consentement admin nécessaire, se met en place en quelques minutes dans Power Automate.
//
// Aucune dépendance npm supplémentaire : `fetch` est natif dans le Node embarqué (voir llm.js, qui
// applique déjà ce choix pour Ollama).

const TIMEOUT_MS = 15 * 1000; // un flux Power Automate répond en général en une seconde ou deux —
// un délai court suffit, et évite de bloquer le job de rappels sur un flux devenu injoignable.

async function envoyerMessageTeams(webhookUrl, destinataireEmail, texte) {
  if (!webhookUrl) return { ok: false, erreur: "Aucune URL de flux Power Automate configurée (voir Réglages)." };
  if (!destinataireEmail) return { ok: false, erreur: 'Aucune adresse email Teams configurée pour ce collaborateur.' };

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);
  try {
    const reponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinataire: destinataireEmail, message: texte }),
      signal: controleur.signal
    });
    if (!reponse.ok) {
      const corps = await reponse.text().catch(() => '');
      return { ok: false, erreur: `Le flux Power Automate a répondu ${reponse.status} : ${corps.slice(0, 200)}` };
    }
    return { ok: true, erreur: null };
  } catch (e) {
    return { ok: false, erreur: `Impossible de joindre le flux Power Automate (${e.message}).` };
  } finally {
    clearTimeout(minuteur);
  }
}

module.exports = { envoyerMessageTeams };
