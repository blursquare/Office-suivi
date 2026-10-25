// Pastille et notifications Windows (étude 25/10 : « il faudrait des notifications pastille sur l'app » ; choix : la vraie pastille
// de la barre des tâches de Windows, par le relais CLAIRE du poste ; compter les messages non lus et mentions, les propositions à
// traiter, les nouveautés du Suivi ; « et ajouter un réglage notifications dans les réglages pour ajuster et en rajouter »).
//
// Une page ne peut pas poser de pastille sur la barre des tâches sur une adresse IP (Chrome réserve l'API de badge aux sites en
// https et aux applications installées) : la fenêtre CLAIRE calcule le compteur d'après Réglages › Notifications et l'envoie au
// serveur (POST /api/relais-word/pastille) ; le relais du poste (server/relais/CLAIRE-relais.cs, 1.1) le lit chaque seconde, pose
// la pastille rouge sur l'icône de la fenêtre CLAIRE, affiche une notification Windows pour chaque nouveauté et fait clignoter le
// bouton. Les notifications ne disent qu'un nombre et une rubrique (texte écrit par le serveur), jamais un nom de dossier ni un client. Réglages gardés dans les
// préférences du collaborateur sur le serveur (`notifications`).

// Les rubriques comptées, dans l'ordre des Réglages. `defaut` : allumée tant que le collaborateur n'a rien réglé.
var SOURCES_NOTIFICATIONS = [
  { cle: 'messages', libelle: 'Messages non lus des discussions', aide: 'Les messages non lus de vos collègues dans les canaux de « Demander à CLAIRE », messages privés compris (un canal mis en sourdine ne compte pas ; les propositions de CLAIRE comptent dans « À traiter »).', defaut: true},
  { cle: 'mentions', libelle: 'Mentions (@vous)', aide: 'Les messages où un collègue ou CLAIRE vous cite. Comptés seuls quand les messages non lus sont éteints.', defaut: true},
  { cle: 'traiter', libelle: 'Propositions de CLAIRE à traiter', aide: 'Ce que les routines de CLAIRE attendent de VOTRE décision (« À traiter »).', defaut: true},
  { cle: 'suivi', libelle: 'Nouveautés du Suivi des dossiers', aide: 'La pastille rouge de « Suivi des dossiers » : pièces trouvées, fonds tous reçus, mises à jour d’Authentic de vos dossiers.', defaut: true},
  { cle: 'scans', libelle: 'Scans à ranger', aide: 'Les scans du copieur que Claire Scan n’a pas rangés seuls.', defaut: false},
  { cle: 'taches', libelle: 'Tâches du jour', aide: 'Ce qui reste dans votre liste « Aujourd’hui » (tâches des dossiers et vos rappels).', defaut: false},
  { cle: 'dates', libelle: 'Réponses aux dates proposées', aide: 'Les réponses des clients ou des confrères à un sondage de dates de signature, pas encore vues dans l’Agenda.', defaut: false }
];
var INTERVALLE_PASTILLE_MS = 5000;
var RAPPEL_PASTILLE_MS = 60000;   // le serveur éteint la pastille d'une fenêtre muette depuis 2 min
var DELAI_PREMIERE_PASTILLE_MS = 20000;   // les compteurs du démarrage ne sont pas des nouveautés

var reglagesNotifications = null;   // null tant que les préférences du collaborateur ne sont pas lues
var etatPastille = { envoye: -1, envoyeLe: 0, avant: null, demarreLe: 0, relais: false };

/** Pure : les réglages complets (rubriques absentes = leur valeur par défaut). */
function reglagesNotificationsComplets(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const sources = b.sources && typeof b.sources === 'object' ? b.sources : {};
  const out = { pastille: b.pastille !== false, windows: b.windows !== false, sources: {} };
  for (const s of SOURCES_NOTIFICATIONS) out.sources[s.cle] = typeof sources[s.cle] === 'boolean' ? sources[s.cle] : s.defaut;
  return out;
}

function lireReglagesNotifications() { return reglagesNotificationsComplets(reglagesNotifications); }

// Appelé par chargerPreferencesCollaborateur (client/37).
function appliquerReglagesNotificationsServeur(brut) {
  reglagesNotifications = brut && typeof brut === 'object' ? brut : {};
  etatPastille.envoye = -1;
  if (ecranAffiche('reglages')) renderReglagesNotifications();
}

/** Pure : le nombre de la pastille. Les mentions sont déjà dans les messages non lus : comptées à part seulement sans eux. */
function totalPastille(compteurs, reglages) {
  const r = reglagesNotificationsComplets(reglages);
  if (!r.pastille) return 0;
  let total = 0;
  for (const s of SOURCES_NOTIFICATIONS) {
    if (!r.sources[s.cle]) continue;
    if (s.cle === 'mentions' && r.sources.messages) continue;
    total += Math.max(0, Number(compteurs[s.cle]) || 0);
  }
  return Math.min(total, 999);
}

/** Pure : une notification par rubrique allumée dont le nombre a monté — { cle, n } seulement : le serveur en écrit le texte
 * (server/src/relaisWord.js, TEXTES_NOTIFICATIONS), jamais un nom de dossier ni de client. */
function nouveautesNotifications(avant, apres, reglages) {
  const r = reglagesNotificationsComplets(reglages);
  if (!r.windows || !avant) return [];
  const sortie = [];
  for (const s of SOURCES_NOTIFICATIONS) {
    if (!r.sources[s.cle]) continue;
    const ecart = (Number(apres[s.cle]) || 0) - (Number(avant[s.cle]) || 0);
    if (ecart <= 0) continue;
    // Une mention est aussi un message non lu : une seule notification, celle de la mention, qui dit davantage.
    if (s.cle === 'messages' && r.sources.mentions && (Number(apres.mentions) || 0) > (Number(avant.mentions) || 0)) continue;
    sortie.push({ cle: s.cle, n: ecart });
  }
  return sortie;
}

// Les compteurs de l'écran, chacun lu par la fonction qui fait déjà sa pastille dans la barre latérale. `reglages` : seules les
// rubriques allumées sont calculées (« Aujourd'hui » et les scans parcourent tous les dossiers) ; sans réglages, toutes (écran des Réglages).
function compteursNotifications(reglages) {
  const allumees = reglages ? reglagesNotificationsComplets(reglages).sources : null;
  const lire = (cle, f) => {
    if (allumees && !allumees[cle]) return 0;
    try { const n = Number(f()); return Number.isFinite(n) && n > 0 ? n : 0; } catch (e) { return 0; }
  };
  return {
    // Messages des personnes seulement : une proposition de CLAIRE est aussi un message de son canal, comptée par « À traiter ».
    messages: lire('messages', () => (canaux.liste || []).reduce((t, c) => t + (c.notif === 'muet' ? 0 : c.notif === 'mentions' ? (Number(c.mentions) || 0)
      : Math.max(0, (Number(c.nonLus) || 0) - (Number(c.nonLusClaire) || 0))), 0)),
    mentions: lire('mentions', () => (canaux.liste || []).filter(c => c.notif !== 'muet').reduce((t, c) => t + (Number(c.mentions) || 0), 0)),
    traiter: lire('traiter', () => propositionsClaire.liste.length),
    suivi: lire('suivi', () => totalNotificationsPieces()),
    scans: lire('scans', () => nombreScansEnAttente(etatScans, lecturesScans, echecsAutoScans, rangementAutoScansActif())),
    taches: lire('taches', () => { const e = etatAujourdhui(); return e.actions.length + rappelsEnTaches(e.aujourdhui).length; }),
    dates: lire('dates', () => reponsesNonVuesSondages(sondagesCreneaux, dateDatesVues()).length)
  };
}

// La fenêtre est-elle sous les yeux du collaborateur ? Alors pas de notification Windows (la pastille, elle, reste juste).
function fenetreClaireRegardee() { return !document.hidden && document.hasFocus(); }

// Les relevés qui alimentent les compteurs continuent fenêtre cachée ou réduite tant que la pastille est allumée ET que le relais de
// ce collaborateur est installé (client/112, 114 ; audit 25/10 : sinon des relectures pour rien sur tous les postes).
function pastilleActiveHorsEcran() {
  return !!utilisateurPoste && etatPastille.relais && lireReglagesNotifications().pastille;
}

async function tourPastille() {
  if (!utilisateurPoste || !authToken || reglagesNotifications === null) return;
  const maintenant = Date.now();
  if (!etatPastille.demarreLe) etatPastille.demarreLe = maintenant;
  const reglages = lireReglagesNotifications();
  const compteurs = compteursNotifications(reglages);
  const total = totalPastille(compteurs, reglages);
  const pret = maintenant - etatPastille.demarreLe >= DELAI_PREMIERE_PASTILLE_MS;
  const notifications = pret && !fenetreClaireRegardee() ? nouveautesNotifications(etatPastille.avant, compteurs, reglages) : [];
  // Fenêtre regardée : les compteurs du moment deviennent la référence (ce qu'on voit n'est pas une nouveauté à annoncer plus tard).
  if (pret && !notifications.length) etatPastille.avant = compteurs;
  if (total === etatPastille.envoye && !notifications.length && maintenant - etatPastille.envoyeLe < RAPPEL_PASTILLE_MS) return;
  try {
    const r = await fetchAvecAuth('/api/relais-word/pastille', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poste: clePosteAppels(utilisateurPoste), total, notifications })
    });
    // Les nouveautés ne sont tenues pour annoncées qu'une fois reçues par le serveur (relecture 25/10 : perdues s'il redémarrait).
    if (r.ok) {
      const corps = await r.json().catch(() => ({}));
      etatPastille.relais = corps.relais !== false;
      etatPastille.envoye = total; etatPastille.envoyeLe = maintenant; if (pret) etatPastille.avant = compteurs;
    }
  } catch (e) { /* serveur injoignable : renvoyé au tour suivant */ }
}

// Lancé une fois par demarrerApplication.
function demarrerPastille() {
  setInterval(tourPastille, INTERVALLE_PASTILLE_MS);
}

// Changement du collaborateur du poste : nouvelles préférences, nouveaux compteurs de départ.
function oublierPastilleCollaborateur() {
  reglagesNotifications = null;
  etatPastille = { envoye: -1, envoyeLe: 0, avant: null, demarreLe: 0, relais: false };
}

// ---- Réglages › Notifications ----

function enregistrerReglagesNotifications(modif) {
  const r = lireReglagesNotifications();
  const suivant = { pastille: r.pastille, windows: r.windows, sources: Object.assign({}, r.sources) };
  if (modif.source) suivant.sources[modif.source] = !!modif.valeur;
  else if (modif.cle) suivant[modif.cle] = !!modif.valeur;
  reglagesNotifications = suivant;
  etatPastille.envoye = -1;
  enregistrerPreferenceCollaborateur({ notifications: suivant });
  renderReglagesNotifications();
}

async function renderReglagesNotifications() {
  const zone = document.getElementById('notifications-contenu');
  if (!zone) return;
  if (!utilisateurPoste) { zone.innerHTML = '<p class="hint">Choisissez d’abord le collaborateur de ce poste (Réglages › Général) : les notifications sont réglées pour chacun.</p>'; return; }
  const r = lireReglagesNotifications();
  const nom = prenomCollaborateur(utilisateurPoste);
  const compteurs = compteursNotifications();
  const interrupteur = (id, coche, appel, actif = true) => `<wa-switch class="switch reglages-switch" id="${id}"${coche ? ' checked' : ''}${actif ? '' : ' disabled'} onchange="${appel}"></wa-switch>`;
  const lignes = SOURCES_NOTIFICATIONS.map(s => `<label class="reglages-option" for="notif-source-${s.cle}">
      <span class="reglages-option-texte"><span class="reglages-option-titre">${escapeHtml(s.libelle)} ${infoBulle(s.aide)}</span>
        <span class="reglages-option-sous">${compteurs[s.cle] ? `${compteurs[s.cle]} en ce moment` : 'Rien en ce moment'}</span></span>
      ${interrupteur('notif-source-' + s.cle, r.sources[s.cle], `enregistrerReglagesNotifications({ source: '${s.cle}', valeur: this.checked })`)}
    </label>`).join('');
  zone.innerHTML = `<div class="reglages-section">
      <h3 class="reglages-section-titre">Pour ${escapeHtml(nom)} ${infoBulle('Réglé pour le collaborateur de ce poste, gardé sur le serveur : il le retrouve sur tous les postes.')}</h3>
      <div class="reglages-liste">
        <label class="reglages-option" for="notif-pastille">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Pastille sur l’icône de CLAIRE ${infoBulle('Un rond rouge avec le nombre de choses à voir, sur l’icône de la fenêtre CLAIRE dans la barre des tâches de Windows. Il faut le relais CLAIRE de ce poste (plus bas).')}</span>
            <span class="reglages-option-sous">En ce moment : ${totalPastille(compteurs, r) || 'rien'}</span></span>
          ${interrupteur('notif-pastille', r.pastille, "enregistrerReglagesNotifications({ cle: 'pastille', valeur: this.checked })")}
        </label>
        <label class="reglages-option" for="notif-windows">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Notification Windows ${infoBulle('Une bulle en bas de l’écran à chaque nouveauté, quand la fenêtre CLAIRE n’est pas devant vous, et le bouton CLAIRE de la barre des tâches qui clignote. Elle dit la rubrique et le nombre, jamais un nom de dossier ni de client. Un clic sur la bulle ouvre CLAIRE.')}</span></span>
          ${interrupteur('notif-windows', r.windows, "enregistrerReglagesNotifications({ cle: 'windows', valeur: this.checked })")}
        </label>
      </div>
    </div>
    <div class="reglages-section">
      <h3 class="reglages-section-titre">Ce qui compte ${infoBulle('Chaque rubrique allumée ajoute son nombre à la pastille et donne une notification quand il monte.')}</h3>
      <div class="reglages-liste">${lignes}</div>
    </div>
    <div class="reglages-section">
      <h3 class="reglages-section-titre">Relais CLAIRE de ce poste ${infoBulle('Windows ne laisse pas une page web poser une pastille ni une notification depuis une adresse du réseau : c’est le relais CLAIRE du poste (un petit programme de l’étude, sans droit d’administrateur) qui le fait. L’antivirus du cabinet doit l’autoriser : la nouvelle empreinte est à donner à Fichorga (fichier server/relais/LISEZMOI.md du dépôt). Il sert aussi aux appels 3CX (fenêtre CLAIRE au premier plan).')}</h3>
      <p class="hint" id="notifications-relais">Lecture de l’état du relais…</p>
      <div class="reglages-actions">
        <wa-button appearance="outlined" class="secondary" onclick="installerRelaisNotifications()">Télécharger le relais pour ce poste</wa-button>
      </div>
    </div>`;
  let etat = null;
  try {
    const rep = await fetchAvecAuth('/api/relais-word/etat?poste=' + encodeURIComponent(clePosteAppels(utilisateurPoste)));
    if (rep.ok) etat = await rep.json();
  } catch (e) { /* état inconnu */ }
  const ligne = document.getElementById('notifications-relais');
  if (!ligne) return;
  ligne.textContent = !etat ? 'État du relais inconnu (serveur injoignable).'
    : etat.actif && etat.pastille ? `Relais en marche pour ${nom} : la pastille et les notifications s’affichent sur ce poste.`
      : etat.actif ? `Le relais de ${nom} est une version ancienne : téléchargez la nouvelle pour avoir la pastille.`
        : `Relais pas en marche pour ${nom} : ni pastille ni notification Windows sur ce poste.`;
}

var TEXTE_INSTALLATION_RELAIS = 'Ouvrez « CLAIRE-relais.exe » (le navigateur peut demander de le conserver). Windows peut afficher « Windows a protégé votre ordinateur » : « Informations complémentaires », puis « Exécuter quand même ». Un message confirme l’installation ; le relais démarre aussitôt, puis à chaque ouverture de session. L’antivirus doit l’autoriser : sa nouvelle empreinte est à donner à Fichorga.';

// Le code d'installation de ce collaborateur (copié dans le presse-papiers, lu par le programme à son ouverture) puis le programme,
// le même pour tous les postes (exclusion de l'antivirus par empreinte).
async function installerRelaisNotifications() {
  const poste = utilisateurPoste ? clePosteAppels(utilisateurPoste) : '';
  if (!poste) { afficherToast('Choisissez d’abord le collaborateur de ce poste.', 'OK', null); return; }
  try {
    const rc = await fetchAvecAuth('/api/relais-word/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poste }) });
    const corps = await rc.json().catch(() => ({}));
    if (!rc.ok || !corps.code) throw new Error(corps.erreur || 'statut ' + rc.status);
    const copie = copierTexteSilencieux(corps.code);
    const r = await fetchAvecAuth('/api/relais-word/programme');
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).erreur) || 'statut ' + r.status);
    const blob = await r.blob();
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = 'CLAIRE-relais.exe';
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
    afficherInfoAction('Relais téléchargé', TEXTE_INSTALLATION_RELAIS
      + (copie ? ' Le code d’installation de ce poste est copié : ouvrez le programme tout de suite, il le lit seul.' : '')
      + ' Si le programme demande le code, collez : ' + corps.code);
  } catch (e) {
    afficherToast('Téléchargement du relais impossible : ' + (e.message || 'erreur') + '.', 'OK', null);
  }
}
