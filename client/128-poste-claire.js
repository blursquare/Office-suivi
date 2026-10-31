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
  // Un brouillon resté ouvert par un travail précédent (d'un autre collaborateur peut-être) n'est jamais rapporté (relecture 0.412.0).
  if (typeof redaction !== 'undefined' && redaction) fermerRedaction({ ok: false, annule: true });
  const texte = 'Travail confié à ton poste virtuel : ' + String(consigne || '').slice(0, 4000);
  await envoyerAgentAssistant(texte);
  const derniere = assistantMessages.filter((m) => m.role === 'claire' && m.html && !/asst-autorisation/.test(m.html)).pop();
  const compteRendu = derniere ? texteDuMessageClaire(derniere.html) : 'Je n’ai rien à rapporter.';
  const brouillon = brouillonPosteClaire();
  if (typeof redaction !== 'undefined' && redaction) fermerRedaction({ ok: false, annule: true });
  return (compteRendu + brouillon).slice(0, 8000);
}

// Un brouillon d'email préparé dans la fenêtre sans écran (rien n'y part, « Envoyer » y est inerte) : rapporté dans le compte rendu, sinon
// il restait invisible (étude 31/10 : « préparer un brouillon et me le présenter… aucun résultat présenté »).
function brouillonPosteClaire() {
  if (typeof redaction === 'undefined' || !redaction) return '';
  const champ = (id) => { const el = document.getElementById(id); return el ? String(el.value || el.innerText || '').trim() : ''; };
  const texte = champ('redaction-texte') || String(redaction.texte || '').trim();
  if (!texte) return '';
  return `\n\n— Brouillon préparé (non envoyé, à copier dans un email) —\nÀ : ${champ('redaction-a') || redaction.a || '?'}\nObjet : ${champ('redaction-sujet') || redaction.sujet || '?'}\n\n${texte.slice(0, 4000)}`;
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

// Côté collaborateur : confier un travail à CLAIRE (profil de CLAIRE, administrateurs). Il part dans une file sur le serveur et se fait en
// ARRIÈRE-PLAN (étude 27/10) : l'écran reste libre, on peut en confier plusieurs ; la liste « Ses travaux » suit leur état et le compte rendu
// arrive à la fin dans sa conversation (message de CLAIRE). On le lui confie par la zone de saisie ; « Son travail » : colonne de droite (client/126).
var travauxClaire = { liste: [], charge: false, minuterie: null };
var INTERVALLE_TRAVAUX_CLAIRE_MS = 10 * 1000;

// Pure : ce que fait CLAIRE pour ce travail, en clair (étude 31/10 : « elle dit qu'elle utilise son navigateur, mais qu'est-ce qu'elle fait
// exactement ? »). Elle travaille dans une fenêtre CLAIRE invisible ouverte par le serveur, avec le même agent que la conversation ; chaque geste
// qui modifie quelque chose attend la validation d'un administrateur (carte « Demande de CLAIRE » dans À traiter) ; rien n'est envoyé.
function explicationTravailClaire(t, maintenant) {
  if (!t) return '';
  const depuis = (iso) => { const m = Math.max(0, Math.round((maintenant - (Date.parse(iso || '') || maintenant)) / 60000)); return m < 1 ? 'à l’instant' : `depuis ${m} min`; };
  if (t.etat === 'attente') return `Confié ${depuis(t.creeLe)} : il démarre dès que le travail précédent est fini (un à la fois, vérifié chaque minute).`;
  if (t.etat === 'en-cours') return `En cours ${depuis(t.debutLe)}, dans sa fenêtre CLAIRE invisible sur le serveur : elle lit et prépare comme dans la conversation ; un geste qui modifie quelque chose attend votre validation (« Demande de CLAIRE » dans À traiter) ; rien n’est envoyé. Arrêté au bout de 20 min s’il n’a pas fini.`;
  return '';
}

// Pure : le libellé de l'état d'un travail.
function libelleEtatTravailClaire(t) {
  if (!t) return '';
  if (t.etat === 'attente') return 'En attente';
  if (t.etat === 'en-cours') return 'En cours…';
  if (t.etat === 'fini') return 'Fait';
  if (t.etat === 'annule') return 'Annulé';
  return 'Non terminé';
}

async function chargerTravauxClaire() {
  if (POSTE_CLAIRE || !utilisateurPoste || !estAdministrateur(utilisateurPoste)) return;
  try {
    const r = await fetchAvecAuth('/api/poste-claire/travaux?utilisateur=' + encodeURIComponent(utilisateurPoste));
    if (!r.ok) return;
    const avant = JSON.stringify(travauxClaire.liste.map(t => [t.id, t.etat]));
    travauxClaire.liste = (await r.json()).travaux || [];
    travauxClaire.charge = true;
    const apres = JSON.stringify(travauxClaire.liste.map(t => [t.id, t.etat]));
    if (avant !== apres) {
      if (avant !== '[]' && travauxClaire.liste.some(t => t.etat === 'fini' || t.etat === 'erreur')) chargerMessagesClaire();
      if (!canaux.actif && typeof renderAssistant === 'function' && ecranAffiche('assistant')) renderAssistant();
    }
  } catch (e) { /* le serveur redémarre peut-être : la prochaine relecture suffit */ }
  // Relu tant qu'un travail attend ou tourne.
  clearTimeout(travauxClaire.minuterie);
  if (travauxClaire.liste.some(t => t.etat === 'attente' || t.etat === 'en-cours')) travauxClaire.minuterie = setTimeout(chargerTravauxClaire, INTERVALLE_TRAVAUX_CLAIRE_MS);
}

async function annulerTravailClaire(id) {
  try {
    const r = await fetchAvecAuth(`/api/poste-claire/travaux/${encodeURIComponent(id)}?utilisateur=${encodeURIComponent(utilisateurPoste)}`, { method: 'DELETE' });
    if (!r.ok) { const c = await r.json().catch(() => ({})); afficherToast(c.erreur || 'Annulation impossible.', 'OK', null); }
  } catch (e) { afficherToast('Annulation impossible : ' + (e.message || e), 'OK', null); }
  await chargerTravauxClaire();
  renderAssistant();
}

// La liste « Ses travaux » sous le profil : état, consigne, compte rendu dépliable.
// Pure : les travaux montrés — en attente, en cours, et ceux finis depuis moins d'une heure (étude 31/10 : la colonne de droite ne garde pas
// les travaux d'avant ; ils restent dans la conversation, où leur compte rendu est arrivé).
function travauxVisiblesClaire(liste, maintenant) {
  return (Array.isArray(liste) ? liste : []).filter(t => t && (t.etat === 'attente' || t.etat === 'en-cours'
    || (Date.parse(t.finLe || '') || 0) > maintenant - 3600 * 1000));
}

function htmlTravauxClaire() {
  const l = travauxVisiblesClaire(travauxClaire.liste, Date.now()).slice(0, 8);
  if (!l.length) return '';
  return `<div class="pf-travaux"><ul>${l.map(t => `<li class="pf-tr pf-tr-${escapeAttr(t.etat)}">
      <div class="pf-tr-tete"><span class="pf-tr-etat">${t.etat === 'en-cours' ? icone('spinner', null, true) : ''}${escapeHtml(libelleEtatTravailClaire(t))}</span>
        <span class="pf-tr-consigne">${escapeHtml(t.consigne)}</span>
        ${t.etat === 'attente' ? `<wa-button appearance="plain" size="s" type="button" onclick="annulerTravailClaire('${escapeOnclickArg(t.id)}')">Annuler</wa-button>` : ''}</div>
      ${t.etat === 'en-cours' || t.etat === 'attente' ? `<p class="pf-tr-quoi">${escapeHtml(explicationTravailClaire(t, Date.now()))}</p>` : ''}
      ${t.etat === 'fini' && t.resultat ? `<details class="pf-tr-cr"><summary>Compte rendu</summary><p>${escapeHtml(t.resultat).replace(/\n/g, '<br>')}</p></details>` : ''}
      ${t.etat === 'erreur' && t.erreur ? `<p class="pf-tr-erreur">${escapeHtml(t.erreur)}</p>` : ''}</li>`).join('')}</ul></div>`;
}
