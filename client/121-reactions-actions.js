// Des emojis qui COMMANDENT un geste (étude 25/10 : « 🎉, 🔁, ✋ et 📌 »). Le sens est du code (`actionReaction`, commun/reactions.js), jamais deviné ;
// seul le poste de celui qui réagit agit (pas de doublon). Rien ne part seul : 🔁 prépare un brouillon par l'agent, l'email attend « Envoyer ».
//   📌 épingle le message · ✋ « je la prends » : tâche dans MON « Aujourd'hui » + confirmation de CLAIRE dans le fil ·
//   🔁 « relance ça » : CLAIRE prépare l'email dans le fil du message (canal d'un dossier) · 🎉 de CLAIRE : serveur, server/src/canaux/celebrations.js.

function extraitMessageReaction(m) {
  return String(m.texte || texteDepuisHtmlCanal(m.html) || '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

async function actionDeReactionCanal(m, emoji) {
  const action = actionReaction(emoji);
  if (!action || !m || !m.id || !canaux.actif || vueSpecialeCanal(canaux.actif)) return;
  if (action === 'epingler') {
    if (!m.epingle) await epinglerMessageCanal(m.id);
    return;
  }
  const extrait = extraitMessageReaction(m);
  if (!extrait) return;
  const racine = m.parent || m.id;
  if (action === 'prendre') {
    const aujourdhui = isoAujourdhuiLocal();
    const rappel = { id: 'rp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), auteur: utilisateurPoste,
      texte: `Je m’en occupe : « ${extrait} »`.slice(0, 200), echeance: aujourdhui, dossierId: canalAuDossierOuvert(), fait: false, faitLe: '', creeLe: new Date().toISOString() };
    rappelsPerso.push(rappel);
    renderAlertesDashboard(dossiersPerimetreDashboard());
    await enregistrerRappelPerso(rappel);
    noterVerificationPoste('reaction-prendre', { detail: 'tâche posée par ✋' });
    await ecrireClaireDansFil(racine, `${prenomCollaborateur(utilisateurPoste)} prend cette demande : elle est dans sa liste « Aujourd’hui ».`);
    return;
  }
  if (action === 'relancer') {
    if (!canalAuDossierOuvert()) { afficherToast('🔁 relance un dossier : ouvrez le canal d’un dossier.', 'OK', null); return; }
    ouvrirFilCanal(racine);
    noterVerificationPoste('reaction-relancer', { detail: 'brouillon demandé par 🔁' });
    await envoyerDansFilCanal(`Prépare l’email de relance qui correspond à ce message : « ${extrait} ». Je le relirai avant de l’envoyer.`, racine);
  }
}
