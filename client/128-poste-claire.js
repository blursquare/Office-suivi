// L'ordinateur virtuel de CLAIRE, côté fenêtre (étude 26/10 : « fabrique-lui son ordinateur virtuel, sans l'accès aux réglages ni aux boutons
// d'envoi ; elle agit comme un collaborateur qui me fait valider toute demande »). Le serveur (server/src/posteClaire.js) ouvre une fenêtre
// CLAIRE sans écran à l'adresse `/?poste-claire=1` ; ce fichier la met en « poste de CLAIRE » :
// - Réglages retirés (lien caché, écran refusé), boutons d'envoi inertes — le serveur refuse de toute façon ces routes à ce poste (403) ;
// - toute carte « Autoriser » de l'agent devient une DEMANDE DE VALIDATION à Bastien (proposition `validation`, carte dans le canal du dossier) :
//   le poste attend sa décision ; refusée ou sans réponse, CLAIRE n'agit pas ;
// - `travaillerPosteClaire(consigne)` : le serveur lui confie un travail, l'agent le fait avec ses outils et rend son compte rendu.
// Côté collaborateur : « Lui confier un travail » dans le profil de CLAIRE (client/126), réservé aux administrateurs.

var POSTE_CLAIRE = typeof location !== 'undefined' && /[?&]poste-claire=1(&|$)/.test(String(location.search || ''));
var DELAI_VALIDATION_POSTE_CLAIRE_MS = 8 * 60 * 1000;
var INTERVALLE_VALIDATION_POSTE_CLAIRE_MS = 4000;

// Pure : la décision lue sur la demande — vrai = autorisée, faux = refusée, expirée ou déjà faite, null = pas encore décidée.
function decisionValidationPosteClaire(etat) {
  if (etat === 'acceptee') return true;
  if (etat === 'refusee' || etat === 'expiree' || etat === 'faite') return false;
  return null;
}

// Pure : le texte brut d'une réponse de CLAIRE (son HTML sans balises), pour le compte rendu rendu au serveur.
function texteDuMessageClaire(html) {
  return String(html || '').replace(/<br\s*\/?>|<\/(p|li|div|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim();
}

async function demanderValidationPosteClaire(description) {
  let id = '';
  try {
    const r = await fetchAvecAuth('/api/poste-claire/demande', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: String(description || ''), dossierId: (assistantContexte && assistantContexte.dossierId) || '' }) });
    if (!r.ok) return false;
    id = (await r.json()).id || '';
  } catch (e) { return false; }
  if (!id) return false;
  assistantEtapeAgent = 'J’attends la validation de Bastien…';
  const fin = Date.now() + DELAI_VALIDATION_POSTE_CLAIRE_MS;
  while (Date.now() < fin) {
    await new Promise((ok) => setTimeout(ok, INTERVALLE_VALIDATION_POSTE_CLAIRE_MS));
    try {
      const r = await fetchAvecAuth('/api/poste-claire/demande/' + encodeURIComponent(id));
      if (!r.ok) continue;
      const decision = decisionValidationPosteClaire((await r.json()).etat);
      if (decision !== null) { assistantEtapeAgent = ''; return decision; }
    } catch (e) { /* le serveur redémarre peut-être : on réessaie */ }
  }
  assistantEtapeAgent = '';
  return false;   // sans réponse : elle n'agit pas
}

// Le serveur lui confie un travail : l'agent le traite sur cette fenêtre ; le compte rendu est son dernier message.
async function travaillerPosteClaire(consigne) {
  const attente = Date.now() + 30000;
  while (Date.now() < attente && !(Array.isArray(dossiers) && dossiers.length)) await new Promise((ok) => setTimeout(ok, 500));
  assistantMessages = [];
  assistantContexte = { dossierId: '', attente: null, historique: [], echanges: [] };
  const texte = 'Travail confié à ton poste virtuel : ' + String(consigne || '').slice(0, 4000);
  await envoyerAgentAssistant(texte);
  const derniere = assistantMessages.filter((m) => m.role === 'claire' && m.html && !/asst-autorisation/.test(m.html)).pop();
  return derniere ? texteDuMessageClaire(derniere.html).slice(0, 8000) : 'Je n’ai rien à rapporter.';
}

if (POSTE_CLAIRE) {
  questionPosteEcartee = true;   // pas de « qui utilise ce poste ? » : c'est le poste de CLAIRE
  document.documentElement.classList.add('poste-claire');
  // Toute demande d'autorisation devient une demande à Bastien.
  demanderAutorisationAgent = demanderValidationPosteClaire;
  // Réglages : refusés (le serveur refuse aussi leurs routes).
  const definirOngletOrigine = definirOnglet;
  definirOnglet = function (nom, ...suite) { return nom === 'reglages' ? undefined : definirOngletOrigine(nom, ...suite); };
  // Envoi d'email : inerte.
  envoyerRedaction = async function () { afficherToast('Le poste de CLAIRE n’envoie rien : un collaborateur envoie depuis le sien.', 'OK', null); return { ok: false, annule: true }; };
  envoyerRedactionOuverte = function () { return false; };
}

// Côté collaborateur : confier un travail à CLAIRE (profil de CLAIRE, administrateurs seulement).
var posteClaireAuTravail = false;
async function confierTravailAClaire() {
  const champ = document.getElementById('poste-claire-consigne');
  const consigne = champ ? champ.value.trim() : '';
  if (!consigne || posteClaireAuTravail) return;
  posteClaireAuTravail = true;
  majEtatTravailClaire('CLAIRE travaille sur son poste…');
  assistantMessages.push({ role: 'moi', html: escapeHtml(consigne), quand: Date.now() });
  renderAssistant();
  try {
    const r = await fetchAvecAuth('/api/poste-claire/travail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consigne }) });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corps.erreur || `HTTP ${r.status}`);
    assistantMessages.push({ role: 'claire', html: escapeHtml(String(corps.resultat || 'Fait.')).replace(/\n/g, '<br>'), quand: Date.now() });
    if (champ) champ.value = '';
  } catch (e) {
    afficherToast('CLAIRE n’a pas pu travailler : ' + (e.message || e), 'OK', null);
  } finally {
    posteClaireAuTravail = false;
    renderAssistant();
    chargerPropositionsClaire('a-traiter');
  }
}

function majEtatTravailClaire(texte) {
  const el = document.getElementById('poste-claire-etat');
  if (el) el.textContent = texte || '';
}
