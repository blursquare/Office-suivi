// Autres emojis (étude 25/10, « ok vas-y ») : 🕐/🕒 me le rappeler dans 3 jours / une semaine · 👥 prévenir le responsable du dossier (tâche + Teams)
// · 📝 ajouter le message à CLAIRE.md (après confirmation) · 🔒 clore le fil · 🗳️ compter un sondage « sondage : … » (1️⃣ 2️⃣ 3️⃣…).
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
      texte: `Je m’en occupe : « ${extrait} »`.slice(0, 200), echeance: aujourdhui, dossierId: canalAuDossierOuvert(), fait: false, faitLe: '', creeLe: new Date().toISOString(), source: { canal: canaux.actif, messageId: m.id } };
    rappelsPerso.push(rappel);
    renderAlertesDashboard(dossiersPerimetreDashboard());
    await enregistrerRappelPerso(rappel);
    noterVerificationPoste('reaction-prendre', { detail: 'tâche posée par ✋' });
    await ecrireClaireDansFil(racine, `${prenomCollaborateur(utilisateurPoste)} prend cette demande : elle est dans sa liste « Aujourd’hui ».`);
    return;
  }
  if (action === 'rappeler3' || action === 'rappeler7') {
    const jours = action === 'rappeler3' ? 3 : 7;
    const quand = new Date(); quand.setDate(quand.getDate() + jours);
    const iso = `${quand.getFullYear()}-${String(quand.getMonth() + 1).padStart(2, '0')}-${String(quand.getDate()).padStart(2, '0')}`;
    const rappel = { id: 'rp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), auteur: utilisateurPoste,
      texte: `Revoir : « ${extrait} »`.slice(0, 200), echeance: iso, dossierId: canalAuDossierOuvert(), fait: false, faitLe: '', creeLe: new Date().toISOString() };
    rappelsPerso.push(rappel);
    renderAlertesDashboard(dossiersPerimetreDashboard());
    await enregistrerRappelPerso(rappel);
    afficherToast(`Rappel posé dans ${jours} jours dans votre liste « À faire ».`, 'OK', null);
    return;
  }
  if (action === 'prevenir') {
    const d = dossiers.find(x => x.id === canalAuDossierOuvert());
    const responsable = d && d.responsable;
    if (!responsable) { afficherToast('👥 prévient le responsable d’un dossier : ouvrez le canal d’un dossier qui en a un.', 'OK', null); return; }
    if (responsable === utilisateurPoste) { afficherToast('Vous êtes déjà le responsable de ce dossier.', 'OK', null); return; }
    const entree = { collaborateur: Object.keys(COLLABORATEURS_AGENT).find(k => COLLABORATEURS_AGENT[k] === responsable) || '', texte: `Voir le message de ${nomAuteurCanal(m) === 'Vous' ? prenomCollaborateur(utilisateurPoste) : nomAuteurCanal(m)} dans le canal : « ${extrait} »`, date: '', dossier_id: d.id };
    if (!entree.collaborateur) return;
    noterVerificationPoste('reaction-prevenir', { detail: 'responsable prévenu par 👥' });
    await envoyerDemandeCollaborateur(rappelDemandeCollaborateur(entree, utilisateurPoste, isoAujourdhuiLocal(), Date.now()), responsable, entree, d);
    return;
  }
  if (action === 'consigne') {
    demanderConfirmation(`Ajouter à CLAIRE.md pour toute l’étude : « ${extrait} » ?`, async () => {
      try {
        const r = await fetchAvecAuth('/api/carnet-claire/consigne', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consigne: extrait, auteur: prenomPosteAssistant() }) });
        const corps = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(corps.erreur || `HTTP ${r.status}`);
        assistantAgentConversation = '';
        noterVerificationPoste('reaction-consigne', { detail: 'consigne ajoutée par 📝' });
        afficherToast('C’est noté dans CLAIRE.md.', 'OK', null);
      } catch (e) { afficherToast('Consigne non ajoutée : ' + (e.message || e), 'OK', null); }
    }, { bouton: 'Ajouter' });
    return;
  }
  if (action === 'clore') {
    if (m.parent) { afficherToast('🔒 clôt un fil : posez-le sur le message de départ.', 'OK', null); return; }
    try {
      const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(canaux.actif)}/messages/${encodeURIComponent(m.id)}`, { method: 'PATCH', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, clos: !m.clos }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      noterVerificationPoste('reaction-clore', { detail: 'fil clos par 🔒' });
      await chargerMessagesCanal(true);
    } catch (e) { afficherToast('Fil non clos : ' + (e.message || e), 'OK', null); }
    return;
  }
  if (action === 'decompte') {
    const sondage = decompteSondage(m.texte || texteDepuisHtmlCanal(m.html), m.reactions);
    if (!sondage) { afficherToast('🗳️ compte un sondage : écrivez « sondage : question » puis une option par ligne.', 'OK', null); return; }
    const lignes = sondage.options.map(o => `${o.emoji} ${o.texte} : ${o.votes.length}${o.votes.length ? ` (${o.votes.map(prenomCollaborateur).join(', ')})` : ''}`);
    await ecrireClaireDansFil(racine, `Sondage « ${sondage.question} » — état des votes :\n${lignes.join('\n')}`);
    ouvrirFilCanal(racine);
    return;
  }
  if (action === 'relancer') {
    if (!canalAuDossierOuvert()) { afficherToast('🔁 relance un dossier : ouvrez le canal d’un dossier.', 'OK', null); return; }
    ouvrirFilCanal(racine);
    noterVerificationPoste('reaction-relancer', { detail: 'brouillon demandé par 🔁' });
    await envoyerDansFilCanal(`Prépare l’email de relance qui correspond à ce message : « ${extrait} ». Je le relirai avant de l’envoyer.`, racine);
  }
}
