// Pastille et notifications Windows (étude 25/10 : « il faudrait des notifications pastille sur l'app » ; choix : la vraie pastille
// de la barre des tâches de Windows, par le relais CLAIRE du poste ; compter les messages non lus et mentions, les propositions à
// traiter, les nouveautés du Suivi ; « et ajouter un réglage notifications dans les réglages pour ajuster et en rajouter »).
//
// Une page ne peut pas poser de pastille sur la barre des tâches sur une adresse IP (Chrome réserve l'API de badge aux sites en
// https et aux applications installées) : la fenêtre CLAIRE calcule le compteur d'après Réglages › Notifications et l'envoie au
// serveur (POST /api/relais-word/pastille) ; le relais du poste (server/src/relaisPoste.js, 2.0) le lit chaque seconde, pose
// la pastille rouge sur l'icône de la fenêtre CLAIRE, affiche une notification Windows pour chaque nouveauté et fait clignoter le
// bouton. Les notifications ne disent qu'un nombre et une rubrique (texte écrit par le serveur), jamais un nom de dossier ni un client. Réglages gardés dans les
// préférences du collaborateur sur le serveur (`notifications`).

// Les rubriques comptées, dans l'ordre des Réglages. `defaut` : allumée tant que le collaborateur n'a rien réglé.
var SOURCES_NOTIFICATIONS = [
  { cle: 'claire', libelle: 'Messages de CLAIRE', aide: 'Ce que CLAIRE vous écrit dans sa conversation : rappels d’échéances, pièces trouvées, rendez-vous déplacés, mentions, ce qu’elle remarque quand vous ouvrez un dossier dans Authentic… (ce qui partait sur Teams). Regroupés et sans doublon.', defaut: true},
  { cle: 'messages', libelle: 'Messages non lus des discussions', aide: 'Les messages non lus des canaux de « Demander à CLAIRE », messages privés et réponses de CLAIRE compris (un canal mis en sourdine ne compte pas ; les propositions de CLAIRE comptent dans « À traiter »).', defaut: true},
  { cle: 'mentions', libelle: 'Mentions (@vous)', aide: 'Les messages où un collègue ou CLAIRE vous cite. Comptés seuls quand les messages non lus sont éteints.', defaut: true},
  { cle: 'traiter', libelle: 'Propositions de CLAIRE à traiter', aide: 'Ce que les routines de CLAIRE attendent de VOTRE décision (« À traiter »).', defaut: true},
  { cle: 'suivi', libelle: 'Nouveautés du Suivi des dossiers', aide: 'La pastille rouge de « Suivi des dossiers » : pièces trouvées, fonds tous reçus, mises à jour d’Authentic de vos dossiers.', defaut: true},
  { cle: 'scans', libelle: 'Scans à ranger', aide: 'Les scans du copieur que Claire Scan n’a pas rangés seuls.', defaut: false},
  { cle: 'taches', libelle: 'Tâches du jour', aide: 'Ce qui reste dans votre liste « Aujourd’hui » (tâches des dossiers et vos rappels).', defaut: false},
  { cle: 'reactions', libelle: 'Réactions à vos messages', aide: 'Une notification quand un collègue réagit par un emoji à l’un de vos messages (« Julie a réagi 👍 à votre message »). Ne compte pas dans la pastille.', defaut: true, sansCompte: true },
  { cle: 'dates', libelle: 'Réponses aux dates proposées', aide: 'Les réponses des clients ou des confrères à un sondage de dates de signature, pas encore vues dans l’Agenda.', defaut: false }
];
var INTERVALLE_PASTILLE_MS = 5000;
var RAPPEL_PASTILLE_MS = 60000;   // le serveur éteint la pastille d'une fenêtre muette depuis 2 min
var DELAI_PREMIERE_PASTILLE_MS = 20000;   // les compteurs du démarrage ne sont pas des nouveautés

var reglagesNotifications = null;   // null tant que les préférences du collaborateur ne sont pas lues
var etatPastille = { envoye: -1, envoyeLe: 0, avant: null, avantDetails: null, demarreLe: 0, relais: false };

/** Pure : les réglages complets (rubriques absentes = leur valeur par défaut). */
function reglagesNotificationsComplets(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const sources = b.sources && typeof b.sources === 'object' ? b.sources : {};
  const out = { pastille: b.pastille !== false, windows: b.windows !== false, apercu: b.apercu !== false, teams: b.teams === true, sources: {} };
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
// Pure : les mentions d'un canal sans les cartes de proposition adressées au collaborateur (comptées par « À traiter »).
function mentionsHorsCartes(c) {
  return Math.max(0, (Number(c && c.mentions) || 0) - (Number(c && c.mentionsCartes) || 0));
}

function compteursNotifications(reglages) {
  const allumees = reglages ? reglagesNotificationsComplets(reglages).sources : null;
  const lire = (cle, f) => {
    if (allumees && !allumees[cle]) return 0;
    try { const n = Number(f()); return Number.isFinite(n) && n > 0 ? n : 0; } catch (e) { return 0; }
  };
  return {
    // Une proposition de CLAIRE (sa carte) est aussi un message de son canal : comptée par « À traiter » seulement. Les réponses de
    // CLAIRE et les messages qui vous citent restent des messages.
    messages: lire('messages', () => (canaux.liste || []).reduce((t, c) => t + (c.notif === 'muet' ? 0 : c.notif === 'mentions' ? mentionsHorsCartes(c)
      : Math.max(0, (Number(c.nonLus) || 0) - (Number(c.nonLusCartes) || 0))), 0)),
    mentions: lire('mentions', () => (canaux.liste || []).filter(c => c.notif !== 'muet').reduce((t, c) => t + mentionsHorsCartes(c), 0)),
    claire: lire('claire', () => messagesClaireEtat.nonLus),
    traiter: lire('traiter', () => propositionsClaire.liste.length),
    suivi: lire('suivi', () => totalNotificationsPieces()),
    scans: lire('scans', () => nombreScansEnAttente(etatScans, lecturesScans, echecsAutoScans, rangementAutoScansActif())),
    taches: lire('taches', () => { const e = etatAujourdhui(); return e.actions.length + rappelsEnTaches(e.aujourdhui).length; }),
    dates: lire('dates', () => reponsesNonVuesSondages(sondagesCreneaux, dateDatesVues()).length)
  };
}

// Le détail des compteurs, pour les cartes « comme Teams » (0.350.0) : non-lus de chaque canal (hors cartes de proposition) et
// identifiants des propositions à décider. Seuls des identifiants partent au serveur, qui écrit lui-même la carte.
function detailsNotifications() {
  const canauxN = {};
  try {
    for (const c of canaux.liste || []) {
      if (c.notif === 'muet') continue;
      const m = mentionsHorsCartes(c);
      const n = c.notif === 'mentions' ? m : Math.max(0, (Number(c.nonLus) || 0) - (Number(c.nonLusCartes) || 0));
      if (n > 0 || m > 0) canauxN[c.id] = { n, m };
    }
  } catch (e) { /* liste pas encore chargée */ }
  let propositions = [];
  try { propositions = propositionsClaire.liste.map(p => p.id).filter(id => typeof id === 'string'); } catch (e) { /* pas encore chargées */ }
  const claire = (messagesClaireEtat.liste || []).filter(m => !m.lu).map(m => m.id + '@' + (m.maj || m.quand));
  return { canaux: canauxN, propositions, claire };
}

/** Pure : les canaux dont le nombre de non-lus a monté et les propositions apparues, 3 de chaque au plus. */
function elementsNouveaux(avant, apres, reglages) {
  const r = reglagesNotificationsComplets(reglages);
  if (!r.windows || !avant) return { canaux: [], propositions: [], claire: [] };
  // Messages éteints, mentions allumées : seulement un canal dont les MENTIONS montent (relecture 25/10 : jamais la carte d'un message
  // qui ne vous cite pas).
  const cle = r.sources.messages ? 'n' : r.sources.mentions ? 'm' : '';
  const valeur = (x, id) => (x.canaux[id] && Number(x.canaux[id][cle])) || 0;
  const canauxMontes = cle ? Object.keys(apres.canaux).filter(id => valeur(apres, id) > valeur(avant, id)).slice(0, 3) : [];
  const vues = new Set(avant.propositions);
  const propositions = r.sources.traiter ? apres.propositions.filter(id => !vues.has(id)).slice(0, 3) : [];
  // Un message de CLAIRE : sa carte une fois ; un groupe qui grossit (« Pièces trouvées (3) ») n'en redonne pas — la pastille suit
  // (étude 27/10 : « on en reçoit trop »).
  const vuesClaire = new Set((avant.claire || []).map(x => x.split('@')[0]));
  const claire = r.sources.claire ? (apres.claire || []).filter(x => !vuesClaire.has(x.split('@')[0])).map(x => x.split('@')[0]).slice(0, 2) : [];
  return { canaux: canauxMontes, propositions, claire };
}

// Gestes demandés depuis une carte du relais (le relais a mis la fenêtre CLAIRE devant ; le serveur ne les garde que 20 s). Fenêtre
// restée cachée : rien.
//  - « Ouvrir » : le canal du message, « À traiter » pour une proposition ; une carte de rubrique ne fait que montrer CLAIRE.
//  - « Autoriser » (étude 25/10 : « remet les autorisations ou refus ») : la proposition est montrée dans « À traiter » puis autorisée
//    comme d'un clic — au niveau 1, la fenêtre d'email ou l'outil s'ouvre et rien ne part sans « Envoyer » ; au niveau 2 (CLAIRE agit
//    seule), une confirmation dans CLAIRE d'abord : la carte ne montre que le titre, jamais le brouillon (audit 25/10).
function executerActionsRelais(actions) {
  if (document.hidden) return;
  for (const a of (Array.isArray(actions) ? actions : []).slice(-3)) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'ouvrir' && typeof a.canal === 'string' && a.canal) {
      definirOnglet('assistant');
      setTimeout(() => { ouvrirCanal(a.canal); }, 0);
    } else if (a.type === 'autoriser' && typeof a.id === 'string') {
      const p = propositionParId(a.id);
      if (!p) continue;
      definirOnglet('assistant');
      setTimeout(() => {
        ouvrirCanal('@traiter');
        if ((Number(p.details && p.details.niveau) || 1) >= 2) demanderConfirmation(`Autoriser « ${p.titre || 'la proposition'} » ? CLAIRE le fera elle-même.`, () => autoriserProposition(a.id), { bouton: 'Autoriser', ton: 'valider' });
        else autoriserProposition(a.id);
      }, 0);
    } else if (a.type === 'refuser' && typeof a.id === 'string') {
      // Relais 2.0 (audit 0.354.0, M4) : un refus venu d'une notification se confirme toujours dans CLAIRE — un lien claire-relais:
      // peut être lancé par une autre page.
      const p = propositionParId(a.id);
      if (!p) continue;
      definirOnglet('assistant');
      setTimeout(() => {
        ouvrirCanal('@traiter');
        demanderConfirmation(`Refuser « ${p.titre || 'la proposition'} » ?`, () => refuserProposition(a.id), { bouton: 'Refuser' });
      }, 0);
    }
  }
}

// La fenêtre est-elle sous les yeux du collaborateur ? Alors pas de notification Windows (la pastille, elle, reste juste).
function fenetreClaireRegardee() { return !document.hidden && document.hasFocus(); }

// Les relevés qui alimentent les compteurs continuent fenêtre cachée ou réduite tant que la pastille est allumée ET que le relais de
// ce collaborateur est installé (client/112, 114 ; audit 25/10 : sinon des relectures pour rien sur tous les postes).
function pastilleActiveHorsEcran() {
  return !!utilisateurPoste && (etatPastille.relais || pastilleApplicationActive()) && lireReglagesNotifications().pastille;
}

async function tourPastille() {
  if (!utilisateurPoste || !authToken || reglagesNotifications === null) return;
  const maintenant = Date.now();
  if (!etatPastille.demarreLe) etatPastille.demarreLe = maintenant;
  const reglages = lireReglagesNotifications();
  const compteurs = compteursNotifications(reglages);
  const details = detailsNotifications();
  const total = totalPastille(compteurs, reglages);
  const pret = maintenant - etatPastille.demarreLe >= DELAI_PREMIERE_PASTILLE_MS;
  const regardee = fenetreClaireRegardee();
  const notifications = pret && !regardee ? nouveautesNotifications(etatPastille.avant, compteurs, reglages) : [];
  const elements = pret && !regardee ? elementsNouveaux(etatPastille.avantDetails, details, reglages) : { canaux: [], propositions: [], claire: [] };
  // Fenêtre regardée : les compteurs du moment deviennent la référence (ce qu'on voit n'est pas une nouveauté à annoncer plus tard).
  // Un canal qui monte pendant qu'un autre est lu ne change pas le total : il a quand même sa carte (audit 25/10).
  const aDire = notifications.length || elements.canaux.length || elements.propositions.length || elements.claire.length;
  if (pret && !aDire) { etatPastille.avant = compteurs; etatPastille.avantDetails = details; }
  // La pastille de l'application installée (client/130) : posée par la page elle-même, à chaque tour.
  poserPastilleApplication(total, reglages.pastille);
  // Un relais attend peut-être un « Ouvrir » : la fenêtre redevenue visible demande tout de suite (voir demarrerPastille).
  if (total === etatPastille.envoye && !aDire && !etatPastille.forcer && maintenant - etatPastille.envoyeLe < RAPPEL_PASTILLE_MS) return;
  etatPastille.forcer = false;
  try {
    const r = await fetchAvecAuth('/api/relais-word/pastille', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // Application installée qui pose sa pastille : le relais ne pose pas la sienne sur la même fenêtre (ses notifications restent).
      body: JSON.stringify({ poste: clePosteAppels(utilisateurPoste), total: pastilleApplicationActive() ? 0 : total, notifications, elements, apercu: reglages.apercu })
    });
    // Les nouveautés ne sont tenues pour annoncées qu'une fois reçues par le serveur (relecture 25/10 : perdues s'il redémarrait).
    if (r.ok) {
      const corps = await r.json().catch(() => ({}));
      etatPastille.relais = corps.relais !== false;
      etatPastille.envoye = total; etatPastille.envoyeLe = maintenant; if (pret) { etatPastille.avant = compteurs; etatPastille.avantDetails = details; }
      executerActionsRelais(corps.actions);
    }
  } catch (e) { /* serveur injoignable : renvoyé au tour suivant */ }
}

// Lancé une fois par demarrerApplication.
function demarrerPastille() {
  setInterval(tourPastille, INTERVALLE_PASTILLE_MS);
  // Fenêtre mise devant par le relais (« Ouvrir ») : le geste attendu est demandé aussitôt, sans attendre le tour suivant.
  const aussitot = () => { if (!document.hidden) { etatPastille.forcer = true; tourPastille(); } };
  document.addEventListener('visibilitychange', aussitot);
  window.addEventListener('focus', aussitot);
}

// Changement du collaborateur du poste : nouvelles préférences, nouveaux compteurs de départ.
function oublierPastilleCollaborateur() {
  reglagesNotifications = null;
  poserPastilleApplication(0, false);   // la pastille du collaborateur d'avant ne reste pas sur l'icône
  etatPastille = { envoye: -1, envoyeLe: 0, avant: null, avantDetails: null, demarreLe: 0, relais: false };
}

// ---- Réglages › Notifications ----

function enregistrerReglagesNotifications(modif) {
  const r = lireReglagesNotifications();
  const suivant = { pastille: r.pastille, windows: r.windows, apercu: r.apercu, teams: r.teams, sources: Object.assign({}, r.sources) };
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
        ${s.sansCompte ? '' : `<span class="reglages-option-sous">${compteurs[s.cle] ? `${compteurs[s.cle]} en ce moment` : 'Rien en ce moment'}</span>`}</span>
      ${interrupteur('notif-source-' + s.cle, r.sources[s.cle], `enregistrerReglagesNotifications({ source: '${s.cle}', valeur: this.checked })`)}
    </label>`).join('');
  zone.innerHTML = `<div class="reglages-section">
      <h3 class="reglages-section-titre">Pour ${escapeHtml(nom)} ${infoBulle('Réglé pour le collaborateur de ce poste, gardé sur le serveur : il le retrouve sur tous les postes.')}</h3>
      <div class="reglages-liste">
        <label class="reglages-option" for="notif-pastille">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Pastille sur l’icône de CLAIRE ${infoBulle('Un rond rouge avec le nombre de choses à voir, en haut à droite de l’icône de la fenêtre CLAIRE dans la barre des tâches de Windows. Il faut le relais CLAIRE de ce poste (plus bas).')}</span>
            <span class="reglages-option-sous">En ce moment : ${totalPastille(compteurs, r) || 'rien'}</span></span>
          ${interrupteur('notif-pastille', r.pastille, "enregistrerReglagesNotifications({ cle: 'pastille', valeur: this.checked })")}
        </label>
        <label class="reglages-option" for="notif-windows">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Notification Windows ${infoBulle('Une notification sombre en bas à droite de l’écran à chaque nouveauté, quand la fenêtre CLAIRE n’est pas devant vous ; elle se retire seule au bout de quelques secondes. « Ouvrir dans CLAIRE » met CLAIRE devant.')}</span></span>
          ${interrupteur('notif-windows', r.windows, "enregistrerReglagesNotifications({ cle: 'windows', valeur: this.checked })")}
        </label>
        <label class="reglages-option" for="notif-apercu">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Montrer le texte des messages ${infoBulle('Allumé : la notification montre le canal, l’auteur et le début du message (ou le titre d’une proposition de CLAIRE), et l’on peut répondre, réagir par un emoji, autoriser ou refuser une proposition sans quitter son travail — comme Teams ; la réponse part dans le fil du message ; « Autoriser » ouvre son geste dans CLAIRE (un email ne part qu’après « Envoyer »). CLAIRE ne répond pas à une réponse tapée dans la notification : pour lui demander quelque chose, ouvrez CLAIRE. Les noms des dossiers s’affichent en bas de l’écran. Éteint : seulement la rubrique et le nombre.')}</span></span>
          ${interrupteur('notif-apercu', r.apercu, "enregistrerReglagesNotifications({ cle: 'apercu', valeur: this.checked })", r.windows)}
        </label>
        <label class="reglages-option" for="notif-teams">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Recevoir aussi sur Teams ${infoBulle('Éteint (par défaut) : rappels, pièces trouvées, rendez-vous déplacés, mentions… arrivent seulement dans la conversation de CLAIRE, regroupés et sans doublon. Allumé : ils partent aussi sur Teams, comme avant.')}</span></span>
          ${interrupteur('notif-teams', r.teams, "enregistrerReglagesNotifications({ cle: 'teams', valeur: this.checked })")}
        </label>
      </div>
    </div>
    <div class="reglages-section">
      <h3 class="reglages-section-titre">Ce qui compte ${infoBulle('Chaque rubrique allumée ajoute son nombre à la pastille et donne une notification quand il monte.')}</h3>
      <div class="reglages-liste">${lignes}</div>
    </div>
    ${htmlPastilleApplication()}
    <div class="reglages-section">
      <h3 class="reglages-section-titre">Relais CLAIRE de ce poste ${infoBulle('Windows ne laisse pas une page web poser une pastille ni une notification depuis une adresse du réseau : c’est le relais CLAIRE du poste (un petit programme de l’étude, sans droit d’administrateur) qui le fait. L’antivirus du cabinet doit l’autoriser : la nouvelle empreinte est à donner à Fichorga (fichier server/relais/LISEZMOI.md du dépôt). Il sert aussi aux appels 3CX (fenêtre CLAIRE au premier plan).')}</h3>
      <p class="hint" id="notifications-relais">Lecture de l’état du relais…</p>
      <div class="reglages-actions">
        <wa-button appearance="outlined" class="secondary" onclick="installerRelaisNotifications()">Télécharger le relais pour ce poste</wa-button>
        <wa-button appearance="outlined" class="secondary" onclick="essaiNotificationRelais()">Envoyer une notification d’essai</wa-button>
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
    : etat.actif && etat.pastille && etat.versionRelais && etat.versionRelais !== '2.0' ? `Relais en marche pour ${nom}.${texteEtatToastsWindows(etat.toasts)}`
      : etat.actif && etat.pastille ? `Le relais de ${nom} est une version ancienne : retéléchargez-le et relancez-le (bouton ci-dessous).`
      : etat.actif ? `Le relais de ${nom} est une version ancienne : téléchargez la nouvelle.`
        : `Relais pas en marche pour ${nom} : aucune notification Windows sur ce poste.`;
}

// Pur : ce que Windows a répondu aux dernières notifications du relais 2.0 (server/src/relaisPoste.js, scriptToasts).
function texteEtatToastsWindows(t) {
  const v = String(t || '');
  if (!v) return ' Aucune notification montrée depuis son démarrage : « Envoyer une notification d’essai » pour vérifier.';
  if (v === 'Muet') return ' Le relais n’a pas pu lancer PowerShell pour afficher la notification.';
  if (/echec/.test(v)) return ' Windows a refusé d’afficher la dernière notification.';
  if (v === 'Enabled') return ' Windows dit accepter ses notifications : si rien ne paraît, vérifiez « Ne pas déranger » et le centre de notifications (en bas à droite).';
  if (/secours/.test(v)) return ' Windows ne reconnaît pas encore « CLAIRE » : les notifications arrivent au nom de Windows PowerShell.';
  const raison = /DisabledForUser/.test(v) ? 'toutes les notifications de ce poste sont coupées (Paramètres › Système › Notifications)'
    : /DisabledByGroupPolicy/.test(v) ? 'une règle du poste (stratégie de groupe) les interdit'
      : /DisabledForApplication/.test(v) ? 'elles sont coupées pour CLAIRE (Paramètres › Système › Notifications › CLAIRE)'
        : 'Windows n’a pas dit pourquoi';
  return ` Notifications bloquées : ${raison}.`;
}

async function essaiNotificationRelais() {
  const poste = utilisateurPoste ? clePosteAppels(utilisateurPoste) : '';
  if (!poste) { afficherToast('Choisissez d’abord le collaborateur de ce poste.', 'OK', null); return; }
  try {
    const r = await fetchAvecAuth('/api/relais-word/essai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poste }) });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corps.erreur || 'statut ' + r.status);
    afficherToast('Notification d’essai envoyée : elle doit paraître en bas à droite dans quelques secondes (fenêtre CLAIRE au premier plan ou non).', 'OK', null);
    setTimeout(() => { if (document.getElementById('notifications-relais')) renderReglagesNotifications(); }, 6000);
  } catch (e) { afficherToast(e.message || 'Notification d’essai impossible.', 'OK', null); }
}

var TEXTE_INSTALLATION_RELAIS = 'Ouvrez « CLAIRE-relais.exe » (le navigateur peut demander de le conserver ; c’est le programme de CLAIRE elle-même, que l’antivirus laisse déjà passer sur le serveur). Windows peut afficher « Windows a protégé votre ordinateur » : « Informations complémentaires », puis « Exécuter quand même ». Il demande le code d’installation : collez-le (Ctrl+V). Un message confirme l’installation ; le relais démarre aussitôt, puis à chaque ouverture de session. Les notifications arrivent dans le centre de notifications de Windows.';

// Le code d'installation de ce collaborateur (copié dans le presse-papiers, collé par l'utilisateur dans le programme, qui ne lit
// jamais le presse-papiers lui-même — relais 1.3) puis le programme,
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
      + (copie ? ' Le code d’installation de ce poste est copié : ouvrez le programme et collez-le.' : '')
      + ' Code à coller : ' + corps.code);
  } catch (e) {
    afficherToast('Téléchargement du relais impossible : ' + (e.message || 'erreur') + '.', 'OK', null);
  }
}
