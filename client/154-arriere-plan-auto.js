// Passage automatique en arrière-plan (étude 31/10 : « je ne vois pas la différence entre Envoyer et Lui confier, les deux boutons pourraient être
// réunis » ; choix : « automatique si je pars »). Il n'y a plus qu'« Envoyer ». Si la fenêtre CLAIRE se ferme (ou se recharge) pendant qu'une
// demande à CLAIRE est en cours, la demande est confiée au serveur — même file que les travaux (server/src/travauxClaire.js) : CLAIRE la reprend
// dans sa fenêtre invisible et écrit son compte rendu dans la conversation du demandeur. Les gestes à autoriser deviennent des « Demande de
// CLAIRE » adressées au demandeur lui-même (dans « À traiter »). Rien n'est jamais envoyé.

var demandeEnCoursAssistant = null;

function debuterDemandeArrierePlan(texte, dossierId, nbPieces) {
  if (typeof POSTE_CLAIRE !== 'undefined' && POSTE_CLAIRE) return;   // la fenêtre de CLAIRE elle-même ne se confie rien
  if (!assistantDisponibilite || !assistantDisponibilite.agent) return;
  demandeEnCoursAssistant = { texte: String(texte || ''), dossierId: String(dossierId || ''), pieces: Number(nbPieces) || 0, autorises: [], debut: Date.now() };
}

function finirDemandeArrierePlan() { demandeEnCoursAssistant = null; }

// Les gestes déjà autorisés pendant la demande : dits dans la reprise, pour que CLAIRE ne les refasse pas.
if (!(typeof POSTE_CLAIRE !== 'undefined' && POSTE_CLAIRE) && typeof demanderAutorisationAgent === 'function') {
  const demanderOrigine = demanderAutorisationAgent;
  demanderAutorisationAgent = async function (description, options) {
    const ok = await demanderOrigine(description, options);
    if (ok && demandeEnCoursAssistant) demandeEnCoursAssistant.autorises.push(String(description || '').slice(0, 200));
    return ok;
  };
}

// Pure : la consigne confiée au serveur — la demande telle qu'elle a été écrite, le dossier, ce qui a déjà été autorisé.
function consigneRepriseArrierePlan(demande, libelleDossier) {
  const lignes = [
    'Demande commencée dans la conversation, fenêtre fermée avant la fin : termine-la.',
    `Demande : ${demande.texte}`,
    libelleDossier ? `Dossier : ${libelleDossier}` : '',
    demande.autorises.length ? `Déjà autorisé pendant la demande (vérifie sur la fiche ou l'historique avant de refaire) : ${demande.autorises.join(' ; ')}` : '',
    demande.pieces ? 'Des pièces jointes étaient jointes à la demande : elles ne te sont pas transmises, dis-le dans ton compte rendu si elles manquent.' : ''
  ];
  return lignes.filter(Boolean).join('\n').slice(0, 4000);
}

// Pure : faut-il confier la demande en partant ? Une demande vraiment lancée (plus d'une seconde), pas une page gardée en cache.
function confierEnPartant(demande, maintenant, persistee) {
  return !!(demande && demande.texte && !persistee && maintenant - demande.debut > 1000);
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pagehide', (ev) => {
    const d = demandeEnCoursAssistant;
    if (!confierEnPartant(d, Date.now(), ev && ev.persisted) || !utilisateurPoste || !navigator.sendBeacon) return;
    const dossier = d.dossierId ? (dossiers || []).find(x => x.id === d.dossierId) : null;
    const corps = JSON.stringify({ consigne: consigneRepriseArrierePlan(d, dossier ? libelleDossierAffiche(dossier) : ''), demandeur: utilisateurPoste, reprise: true });
    try { navigator.sendBeacon('/api/poste-claire/travail', new Blob([corps], { type: 'application/json' })); } catch (e) { /* la fenêtre se ferme : rien d'autre à faire */ }
    demandeEnCoursAssistant = null;
  });
}
