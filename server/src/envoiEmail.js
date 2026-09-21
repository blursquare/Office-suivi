'use strict';

// Envoi d'un email à un collaborateur, via un flux Power Automate déclenché par une simple requête
// HTTP (voir server/README.md, section "Rappels automatiques par email", pour la procédure de
// création du flux — CLAIRE ne fait ici qu'un POST JSON, tout l'envoi est fait PAR LE FLUX, avec
// l'action Outlook "Envoyer un e-mail (V2)" : À = destinataire, Objet = sujet, Corps = message).
//
// A remplacé un envoi de message privé Teams (même flux, même POST, seule l'action interne du flux
// a changé) — l'étude a basculé sur l'email, mieux archivé et lisible par tout le monde sans
// dépendre d'un compte Teams. Le champ `sujet` est apparu avec ce changement : un message Teams
// n'en a pas, un email sans objet est illisible dans une boîte de réception.
//
// Choisi plutôt qu'un envoi SMTP direct depuis le serveur (nodemailer) : aucun mot de passe de
// messagerie à stocker dans la base, et Microsoft 365 désactive SMTP AUTH par défaut. Choisi aussi
// plutôt qu'une inscription d'application Azure AD/Microsoft Graph (déjà écartée pour les mêmes
// raisons lors des relances email/calendrier — voir CLAUDE.md) : aucun consentement admin
// nécessaire, se met en place en quelques minutes dans Power Automate.
//
// Aucune dépendance npm supplémentaire : `fetch` est natif dans le Node embarqué (voir llm.js, qui
// applique déjà ce choix pour Ollama).

const TIMEOUT_MS = 15 * 1000; // un flux Power Automate répond en général en une seconde ou deux —
// un délai court suffit, et évite de bloquer le job de rappels sur un flux devenu injoignable.

async function envoyerEmail(fluxUrl, destinataireEmail, sujet, texte) {
  if (!fluxUrl) return { ok: false, erreur: "Aucune URL de flux Power Automate configurée (voir Réglages)." };
  if (!destinataireEmail) return { ok: false, erreur: 'Aucune adresse email configurée pour ce collaborateur.' };

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);
  try {
    const reponse = await fetch(fluxUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinataire: destinataireEmail, sujet: sujet || '', message: texte }),
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

module.exports = { envoyerEmail };
