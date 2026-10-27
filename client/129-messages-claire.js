// Les messages de CLAIRE à chacun (étude 27/10 : « tu peux en faire un message de conversation », « repenser toutes les notifications
// pour qu'elles soient intelligentes et pas trop massives », « passer par le système de notification CLAIRE et plus par Teams »).
// Ce qui partait sur Teams (rappels, pièces trouvées, mentions, rendez-vous déplacés…) et ce que CLAIRE remarque (vous ouvrez un dossier
// dans Authentic) arrive en tête de SA conversation (profil de CLAIRE) : court, regroupé par sorte, jamais deux fois — règles tenues par
// le serveur (server/src/messagesClaire.js). Ils comptent dans la pastille (rubrique « Messages de CLAIRE ») et donnent une carte du relais.

var INTERVALLE_MESSAGES_CLAIRE_MS = 30000;
var messagesClaireEtat = { liste: [], nonLus: 0, charge: false, pour: '' };

async function chargerMessagesClaire() {
  if (!utilisateurPoste || !authToken || POSTE_CLAIRE) return;
  if (document.hidden && !pastilleActiveHorsEcran()) return;
  try {
    const r = await fetchAvecAuth('/api/claire-messages?utilisateur=' + encodeURIComponent(utilisateurPoste));
    if (!r.ok) return;
    const corps = await r.json();
    const avant = messagesClaireEtat.liste.map(m => m.id + ':' + m.maj).join(',');
    messagesClaireEtat = { liste: Array.isArray(corps.messages) ? corps.messages : [], nonLus: Number(corps.nonLus) || 0, charge: true, pour: utilisateurPoste };
    const change = avant !== messagesClaireEtat.liste.map(m => m.id + ':' + m.maj).join(',');
    if (change && profilClaireAffiche()) { marquerMessagesClaireLus(); rafraichirMessagesClaire(); }
    if (change) majPastilleClaireListes();
  } catch (e) { /* serveur injoignable : relu au tour suivant */ }
}

// La conversation de CLAIRE est-elle sous les yeux ? (page « Demander à CLAIRE », aucun canal ouvert)
function profilClaireAffiche() {
  return !document.hidden && ecranAffiche('assistant') && !canaux.actif && !POSTE_CLAIRE;
}

async function marquerMessagesClaireLus() {
  if (!messagesClaireEtat.nonLus || !utilisateurPoste) return;
  messagesClaireEtat.nonLus = 0;
  messagesClaireEtat.liste = messagesClaireEtat.liste.map(m => Object.assign({}, m, { lu: true }));
  try {
    await fetchAvecAuth('/api/claire-messages/lus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utilisateur: utilisateurPoste }) });
  } catch (e) { /* remarqué au tour suivant */ }
  majPastilleClaireListes();
}

// Sa pastille (ses messages non lus) est sur deux listes : l'accès rapide de la barre latérale et la liste des Discussions (relecture 0.373.4).
function majPastilleClaireListes() {
  if (typeof majAccesRapideCanaux === 'function') majAccesRapideCanaux();
  if (ecranAffiche('assistant') && typeof renderCanaux === 'function') renderCanaux();
}

// Un message de CLAIRE pour SOI, déposé depuis ce poste (arrivée sur un dossier dans Authentic, client/127).
async function deposerMessageClairePourMoi(texte, options) {
  if (!utilisateurPoste) return false;
  const o = options || {};
  try {
    const r = await fetchAvecAuth('/api/claire-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utilisateur: utilisateurPoste, texte, cle: o.cle || '', sorte: o.sorte || '', dossierId: o.dossierId || '' }) });
    if (!r.ok) return false;
    chargerMessagesClaire();
    return true;
  } catch (e) { return false; }
}

/** Pur : ses messages qui entrent dans le fil — ceux des 3 derniers jours et tous les non-lus, du plus ancien au plus récent. */
function messagesClairePourFil(maintenant, liste) {
  const l = Array.isArray(liste) ? liste : messagesClaireEtat.liste;
  const depuis = (maintenant || Date.now()) - 3 * 86400000;
  return l.map(m => Object.assign({}, m, { quand: Number(m.maj || m.quand) || 0 }))
    .filter(m => !m.lu || m.quand >= depuis).sort((a, b) => a.quand - b.quand);
}

/** Pur : le fil de la conversation — les échanges et les messages de CLAIRE, chacun à son heure (un échange à la même heure passe avant). */
function entreesFilClaire(messages, notifs) {
  const e = (messages || []).map((m, i) => ({ m, i, quand: Number(m.quand) || 0, ordre: 0 }))
    .concat((notifs || []).map(n => ({ notif: n, quand: n.quand, ordre: 1 })));
  return e.sort((a, b) => a.quand - b.quand || a.ordre - b.ordre || (a.i || 0) - (b.i || 0));
}

// Pure : le texte d'un message de CLAIRE en HTML (étude 27/10 : « elle ne gère pas les liens ») — échappé, « CLAIRE — » de tête retiré (le nom
// est déjà au-dessus), retours à la ligne gardés, adresses http(s) et emails en liens ouverts à part ; le lien d'une pièce du NAS (« /piece? »)
// se lit « Ouvrir la pièce » plutôt que son adresse entière.
function htmlTexteMessageClaire(texte) {
  const propre = String(texte || '').split('\n').map(l => l.replace(/^(\s*(?:•\s*)?(?:\p{Extended_Pictographic}\uFE0F?\s*)?)CLAIRE\s+[—–-]\s+/u, '$1')).join('\n');
  return lierLiensTexte(escapeHtml(propre), '')
    .replace(/<a href="([^"]*)">([^<]*)<\/a>/g, (tout, href, libelle) => `<a href="${href}" target="_blank" rel="noopener">${/\/piece\?/.test(href) ? 'Ouvrir la pièce' : libelle}</a>`)
    .replace(/\n/g, '<br>');
}

// Un message de CLAIRE dans le fil, présenté comme ses autres réponses (avatar, nom, heure ; suite d'un groupe sous la précédente).
function htmlNotifClaireFil(n, r, maintenant) {
  const lien = (id, texte) => (id && dossiers.find(x => x.id === id)
    ? ` <button type="button" class="lien-discret" onclick="ouvrirDossierDrawer('${escapeOnclickArg(id)}')">${texte}</button>` : '');
  const elements = (n.elements || []).length > 1
    ? `<ul>${n.elements.map(e => `<li>${htmlTexteMessageClaire(e.court)}${lien(e.dossierId, 'fiche')}</li>`).join('')}</ul>` : '';
  const corps = elements ? `<p>${htmlTexteMessageClaire(n.court)}</p>${elements}`
    : `<p>${htmlTexteMessageClaire(n.detail || n.court)}${lien(n.dossierId, 'Ouvrir la fiche')}</p>`;
  const rr = r || { nouveauJour: false, debutGroupe: true };
  const jour = rr.nouveauJour ? `<div class="asst-jour" role="separator"><span>${escapeHtml(libelleJourAssistant(n.quand, maintenant))}</span></div>` : '';
  const tete = rr.debutGroupe ? `<div class="cx-nom">CLAIRE<span class="cx-heure">${escapeHtml(heureAssistant(n.quand))}</span></div>` : '';
  return `${jour}<div class="asst-message asst-slack asst-claire asst-notif${rr.debutGroupe ? '' : ' asst-suite'}${n.lu ? '' : ' asst-notif-nouveau'}">
      ${rr.debutGroupe ? avatarClaireHtml() : `<span class="cx-heure-marge" aria-hidden="true">${escapeHtml(heureAssistant(n.quand))}</span>`}
      <div class="asst-corps">${tete}<div class="asst-texte">${corps}</div></div></div>`;
}

// Ses messages seuls (conversation encore vide), sous l'accueil.
function htmlFilClaire(entrees, maintenant) {
  if (POSTE_CLAIRE) return '';
  const reperes = repereMessagesAssistant(entrees.map(x => ({ role: 'claire', quand: x.quand })));
  return entrees.map((x, k) => (x.notif ? htmlNotifClaireFil(x.notif, reperes[k], maintenant) : '')).join('');
}

function rafraichirMessagesClaire() {
  const champ = document.getElementById('assistant-saisie');
  const valeur = champ ? champ.value : null;
  renderAssistant();
  const apres = document.getElementById('assistant-saisie');
  if (apres && valeur !== null && apres.value !== valeur) apres.value = valeur;
}

if (typeof window !== 'undefined' && typeof setInterval === 'function') {
  setInterval(chargerMessagesClaire, INTERVALLE_MESSAGES_CLAIRE_MS);
  setTimeout(chargerMessagesClaire, 4000);
}
