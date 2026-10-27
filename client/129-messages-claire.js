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
    if (change && typeof majAccesRapideCanaux === 'function') majAccesRapideCanaux();
  } catch (e) { /* serveur injoignable : relu au tour suivant */ }
}

// La conversation de CLAIRE est-elle sous les yeux ? (page « Demander à CLAIRE », aucun canal ouvert)
function profilClaireAffiche() {
  return !document.hidden && ecranAffiche('assistant') && !!document.querySelector('.pf-claire');
}

async function marquerMessagesClaireLus() {
  if (!messagesClaireEtat.nonLus || !utilisateurPoste) return;
  messagesClaireEtat.nonLus = 0;
  messagesClaireEtat.liste = messagesClaireEtat.liste.map(m => Object.assign({}, m, { lu: true }));
  try {
    await fetchAvecAuth('/api/claire-messages/lus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utilisateur: utilisateurPoste }) });
  } catch (e) { /* remarqué au tour suivant */ }
  if (typeof majAccesRapideCanaux === 'function') majAccesRapideCanaux();
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

/** Pur : « 9:42 », « hier 17:05 », « lun. 14:10 » — selon l'âge du message. */
function quandMessageClaire(quand, maintenant) {
  const d = new Date(quand);
  const now = maintenant ? new Date(maintenant) : new Date();
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(now) - jour(d)) / 86400000);
  if (ecart <= 0) return heure;
  if (ecart === 1) return 'hier ' + heure;
  if (ecart < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' }) + ' ' + heure;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + heure;
}

/** Pur : les messages à montrer — les non-lus d'abord, puis les plus récents, 8 au plus (le reste se déplie). */
function messagesClaireAMontrer(liste, max) {
  const l = Array.isArray(liste) ? liste.slice() : [];
  l.sort((a, b) => (Number(b.maj || b.quand) || 0) - (Number(a.maj || a.quand) || 0));
  return { montres: l.slice(0, max || 8), reste: Math.max(0, l.length - (max || 8)) };
}

function htmlUnMessageClaire(m) {
  const elements = (m.elements || []).length > 1 ? `<ul class="mc-elements">${m.elements.slice().reverse().map(e => `<li>${escapeHtml(e.court)}${e.dossierId && dossiers.find(x => x.id === e.dossierId) ? ` <button type="button" class="lien-discret" onclick="ouvrirDossierDrawer('${escapeOnclickArg(e.dossierId)}')">fiche</button>` : ''}</li>`).join('')}</ul>` : '';
  const detail = !elements && m.detail ? `<details class="mc-detail"><summary>Détail</summary><p>${escapeHtml(m.detail).replace(/\n/g, '<br>')}</p></details>` : '';
  const fiche = !elements && m.dossierId && dossiers.find(x => x.id === m.dossierId)
    ? `<button type="button" class="lien-discret" onclick="ouvrirDossierDrawer('${escapeOnclickArg(m.dossierId)}')">Ouvrir la fiche</button>` : '';
  return `<li class="mc-message${m.lu ? '' : ' mc-nouveau'}"><span class="mc-quand">${escapeHtml(quandMessageClaire(m.maj || m.quand))}</span>
    <div class="mc-corps"><p class="mc-court">${escapeHtml(m.court)}</p>${elements}${detail}${fiche}</div></li>`;
}

// En tête de la conversation de CLAIRE, sous son profil.
function htmlMessagesClaire() {
  if (POSTE_CLAIRE || !messagesClaireEtat.liste.length) return '';
  const { montres, reste } = messagesClaireAMontrer(messagesClaireEtat.liste, 8);
  const autres = reste ? messagesClaireAMontrer(messagesClaireEtat.liste, 200).montres.slice(8) : [];
  return `<section class="mc-fil" id="messages-claire" aria-label="Messages de CLAIRE"><h3 class="mc-titre">Ce que CLAIRE vous dit ${infoBulle('Ce qui arrivait sur Teams (rappels, pièces trouvées, mentions, rendez-vous…) et ce que CLAIRE remarque, regroupé et sans doublon. Teams en plus : Réglages › Notifications.')}</h3>
    <ul class="mc-liste">${montres.map(htmlUnMessageClaire).join('')}</ul>
    ${autres.length ? `<details class="mc-plus"><summary>${autres.length} plus ancien${autres.length > 1 ? 's' : ''}</summary><ul class="mc-liste">${autres.map(htmlUnMessageClaire).join('')}</ul></details>` : ''}</section>`;
}

function rafraichirMessagesClaire() {
  const zone = document.getElementById('messages-claire');
  const html = htmlMessagesClaire();
  if (zone) { zone.outerHTML = html || '<section id="messages-claire" hidden></section>'; return; }
  const profil = document.querySelector('.pf-claire');
  if (profil && html) profil.insertAdjacentHTML('afterend', html);
}

if (typeof window !== 'undefined' && typeof setInterval === 'function') {
  setInterval(chargerMessagesClaire, INTERVALLE_MESSAGES_CLAIRE_MS);
  setTimeout(chargerMessagesClaire, 4000);
}
