// Routines de CLAIRE (étude 24/10, cadrage docs/spec-routines-claire.md) — le côté du collaborateur : les PROPOSITIONS.
// CLAIRE prépare (brouillon d'email, document, tâche, dates, alerte) et le dit dans le canal du dossier (client/114-canaux.js) ; le collaborateur
// AUTORISE ou REFUSE sur la carte. Rien ne part ni ne s'écrit sans ce clic : « Autoriser » exécute le geste habituel de CLAIRE (ouvrir le
// brouillon dans la fenêtre d'email, ouvrir l'outil, poser la tâche) — jamais un envoi. La liste de ce qui attend MA décision (toutes les
// propositions dont je suis le responsable) alimente la vue « À traiter » des canaux ; les réglages des routines (interrupteurs, trois niveaux
// d'autonomie) sont dans client/113-reglages-routines.js. Serveur : server/src/routines/, canaux/, routes/routines.js, routes/canaux.js.

var propositionsClaire = { aTraiter: 0, liste: [], traitees: [], charge: false };
var INTERVALLE_PROPOSITIONS_MS = 60 * 1000;

// ---- Pures ----

var TYPES_PROPOSITION = {
  email: { libelle: 'Brouillon d’email', icone: 'mail', bouton: 'Ouvrir le brouillon', couleur: 'acte' },
  document: { libelle: 'Document', icone: 'file-text', bouton: 'Ouvrir le document', couleur: 'accent' },
  tache: { libelle: 'Tâche', icone: 'check', bouton: 'Ajouter à ma liste', couleur: 'succes' },
  dates: { libelle: 'Dates proposées', icone: 'calendar', bouton: 'Voir les dates', couleur: 'violet' },
  alerte: { libelle: 'À savoir', icone: 'info', bouton: 'Marquer comme lu', couleur: 'gris' }
};

// Pure : le descripteur d'un type de proposition (un type inconnu se lit comme une alerte).
function typeProposition(type) {
  return TYPES_PROPOSITION[type] || TYPES_PROPOSITION.alerte;
}

// Pure : « à l'instant », « il y a 5 min », « il y a 2 h », « hier », « il y a 3 j », puis la date.
function ageTexteProposition(iso, maintenantMs) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor(((maintenantMs == null ? Date.now() : maintenantMs) - t) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 60 * 24) return `il y a ${Math.floor(min / 60)} h`;
  const jours = Math.floor(min / (60 * 24));
  if (jours === 1) return 'hier';
  if (jours < 14) return `il y a ${jours} j`;
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Pure : ce que dit une proposition déjà traitée (« Autorisée par Julie · hier », « Refusée », « Expirée »).
function etatTexteProposition(p, maintenantMs) {
  const par = p && p.traitePar ? ` par ${prenomCollaborateur(p.traitePar)}` : '';
  const quand = p && p.traiteLe ? ` · ${ageTexteProposition(p.traiteLe, maintenantMs)}` : '';
  if (p && p.etat === 'acceptee') return `Autorisée${par}${quand}`;
  if (p && p.etat === 'refusee') return `Refusée${par}${quand}`;
  if (p && p.etat === 'expiree') return 'Expirée : sans réponse depuis 30 jours';
  return '';
}

// Pure : le texte du résumé en tête de la boîte (« 3 à décider · préparé pour Julie »).
function resumeBoiteClaire(nbATraiter, utilisateur) {
  const prenom = typeof prenomCollaborateur === 'function' ? prenomCollaborateur(utilisateur) : '';
  const etat = nbATraiter ? `${nbATraiter} à décider` : 'Rien à décider';
  return prenom ? `${etat} · préparé pour ${prenom}` : etat;
}

// Pure : l'outil ouvert par une proposition « document » — { onglet, dossier: true si l'outil se prépare sur un dossier }.
var OUTILS_PROPOSITION = {
  'appel-fonds': { onglet: 'appel-fonds', surDossier: true },
  constitution: { onglet: 'constitution', surDossier: true },
  autorisations: { onglet: 'autorisations', surDossier: true },
  'fiche-signature': { onglet: '', surDossier: true },
  quotites: { onglet: 'quotites', surDossier: true },
  preemption: { onglet: 'preemption', surDossier: true }
};

// ---- Chargement et pastille ----

async function chargerPropositionsClaire(onglet) {
  if (!utilisateurPoste) {
    Object.assign(propositionsClaire, { liste: [], traitees: [], aTraiter: 0 });
    if (typeof renderCanaux === 'function') renderCanaux();
    return;
  }
  const filtre = onglet || 'a-traiter';
  try {
    const q = `utilisateur=${encodeURIComponent(utilisateurPoste)}&etat=${filtre}`;
    const r = await fetchAvecAuth('/api/propositions?' + q);
    if (!r.ok) return;
    const corps = await r.json();
    if (filtre === 'a-traiter') {
      propositionsClaire.liste = corps.propositions || [];
      propositionsClaire.aTraiter = corps.aTraiter || 0;
    } else {
      propositionsClaire.traitees = corps.propositions || [];
      propositionsClaire.aTraiter = corps.aTraiter || 0;
    }
    propositionsClaire.charge = true;
    if (typeof renderCanaux === 'function') renderCanaux();
    rafraichirPropositionsFiche();
  } catch (e) { /* serveur injoignable : la pastille garde son dernier état */ }
}

// Un contrôle toutes les minutes tant que la fenêtre est ouverte ; lancé une fois par demarrerApplication.
function demarrerPropositionsClaire() {
  chargerPropositionsClaire('a-traiter');
  setInterval(() => { if (!document.hidden) chargerPropositionsClaire(); }, INTERVALLE_PROPOSITIONS_MS);
}

// ---- La carte d'une proposition (dans un canal, la vue « À traiter » et la fiche) ----

function carteProposition(p, options) {
  const o = options || {};
  const t = typeProposition(p.type);
  const idJs = escapeOnclickArg(p.id);
  const dossier = p.dossierId ? dossiers.find(d => d.id === p.dossierId) : null;
  const puces = [
    dossier && !o.compacte ? `<button type="button" class="pc-puce pc-puce-dossier" onclick="ouvrirDossierDepuisProposition('${escapeOnclickArg(dossier.id)}')" title="Ouvrir la fiche">${icone('folder')}${escapeHtml(libelleDossierAffiche(dossier))}</button>` : '',
    p.routineNom ? `<span class="pc-puce">${escapeHtml(p.routineNom)}</span>` : '',
    p.exemple ? '<span class="pc-puce pc-puce-exemple">Exemple</span>' : ''
  ].join('');
  const traitee = p.etat === 'acceptee' || p.etat === 'refusee' || p.etat === 'expiree';
  const moi = peutDeciderProposition(p, utilisateurPoste);
  const actions = traitee
    ? `<p class="pc-etat pc-etat-${escapeAttr(p.etat)}">${escapeHtml(etatTexteProposition(p))}</p>`
    : !moi
      ? `<p class="pc-etat">Pour ${escapeHtml(prenomCollaborateur(p.responsable))} : c’est à elle ou lui de décider.</p>`
      : `<div class="pc-actions">
        <wa-button variant="brand" size="s" type="button" onclick="autoriserProposition('${idJs}')">${icone(t.icone)}${escapeHtml(t.bouton)}</wa-button>
        ${p.type === 'alerte' ? '' : `<wa-button appearance="outlined" size="s" type="button" onclick="refuserProposition('${idJs}')">Refuser</wa-button>`}
        ${p.dossierId && p.type !== 'alerte' ? `<wa-button appearance="plain" size="s" type="button" onclick="silencerDossierProposition('${idJs}')">Jamais pour ce dossier</wa-button>` : ''}
      </div>`;
  return `<article class="pc-carte pc-type-${escapeAttr(p.type)}${o.compacte ? ' pc-compacte' : ''}${traitee ? ' pc-traitee' : ''}" data-proposition="${escapeAttr(p.id)}">
    <span class="pc-rail" aria-hidden="true"></span>
    <div class="pc-corps">
      <div class="pc-meta"><span class="pc-type">${icone(t.icone)}${escapeHtml(t.libelle)}</span><span class="pc-age">${escapeHtml(ageTexteProposition(p.creeLe))}</span></div>
      <h3 class="pc-titre">${escapeHtml(p.titre)}</h3>
      ${p.resume ? `<p class="pc-resume">${escapeHtml(p.resume)}</p>` : ''}
      ${puces ? `<div class="pc-puces">${puces}</div>` : ''}
      ${actions}
    </div>
  </article>`;
}

function ouvrirDossierDepuisProposition(id) {
  ouvrirDossierDepuisDashboard(id);
}

// ---- Décisions ----

function propositionParId(id) {
  const deCanal = typeof canaux === 'object' && canaux.cartes ? canaux.cartes[id] : null;
  return propositionsClaire.liste.concat(propositionsClaire.traitees).find(p => p.id === id) || deCanal || null;
}

// Une décision prise : la liste « à traiter », les compteurs et le canal ouvert se remettent à jour.
async function apresDecisionProposition() {
  await chargerPropositionsClaire('a-traiter');
  if (typeof chargerMessagesCanal === 'function') chargerMessagesCanal(true);
  if (typeof chargerCanaux === 'function') chargerCanaux();
}

// Pure : le collaborateur peut-il décider cette proposition ? Son responsable, ou l'administrateur.
function peutDeciderProposition(p, utilisateur) {
  return !!p && (!p.responsable || p.responsable === utilisateur || estAdministrateur(utilisateur));
}

async function enregistrerDecisionProposition(id, decision) {
  const r = await fetchAvecAuth(`/api/propositions/${encodeURIComponent(id)}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, auteur: utilisateurPoste })
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `HTTP ${r.status}`);
  const corps = await r.json();
  return Object.assign({}, corps.proposition, { dejaTraitee: !!corps.dejaTraitee });
}

// La tâche d'une proposition « tâche » : un rappel de la liste « À faire » du collaborateur, comme « Ajouter une tâche ».
function poserTacheDepuisProposition(p) {
  const rappel = {
    id: 'rp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    auteur: utilisateurPoste,
    texte: String((p.details && p.details.libelle) || p.titre).slice(0, 200),
    echeance: '', dossierId: p.dossierId || '', fait: false, faitLe: '', creeLe: new Date().toISOString()
  };
  rappelsPerso.push(rappel);
  renderAlertesDashboard(dossiersPerimetreDashboard());
  enregistrerRappelPerso(rappel);
}

// Ce que fait « Autoriser » : le geste habituel de CLAIRE, JAMAIS un envoi. Rend le message dit à l'utilisateur.
function executerActionProposition(p) {
  const d = p.dossierId ? dossiers.find(x => x.id === p.dossierId) : null;
  if (p.type === 'email') {
    // La fenêtre d'email habituelle : tout est relisible et modifiable ; l'email ne part qu'au clic sur « Envoyer ».
    livrerEmailDossier({ destinataire: (p.details && p.details.destinataire) || '', sujet: (p.details && p.details.sujet) || p.titre, corps: (p.details && p.details.corps) || '',
      dossierId: p.dossierId || '', geste: 'routine-claire' });
    return 'Brouillon ouvert : relisez-le, rien ne part sans votre clic sur « Envoyer ».';
  }
  if (p.type === 'document') {
    const outil = OUTILS_PROPOSITION[(p.details && p.details.outil) || ''];
    if (!outil) { if (d) ouvrirDossierDepuisDashboard(d.id); return 'Fiche du dossier ouverte.'; }
    if (outil.onglet === 'appel-fonds' && d) preparerAppelFondsDepuisDossier(d.id);
    else if (outil.onglet === 'constitution' && d) { definirOnglet('constitution'); choisirDossierConstitution(d.id); }
    else if (outil.onglet) definirOnglet(outil.onglet);
    else if (d) ouvrirVeilleSignature(d.id);
    return 'Document ouvert dans son outil : relisez-le avant de l’utiliser.';
  }
  if (p.type === 'tache') { poserTacheDepuisProposition(p); return 'Tâche ajoutée dans votre liste « À faire ».'; }
  if (p.type === 'dates' && d) { ouvrirDossierDepuisDashboard(d.id); return 'Fiche du dossier ouverte.'; }
  return 'C’est noté.';
}

var propositionsEnCours = {};

async function autoriserProposition(id) {
  const p = propositionParId(id);
  if (!p || propositionsEnCours[id]) return;
  propositionsEnCours[id] = true;
  try {
    await autoriserPropositionSure(id, p);
  } finally { delete propositionsEnCours[id]; }
}

async function autoriserPropositionSure(id, p) {
  let decidee;
  try {
    decidee = await enregistrerDecisionProposition(id, p.type === 'alerte' ? 'vue' : 'acceptee');
  } catch (e) {
    afficherToast('Proposition non enregistrée : ' + e.message, 'OK', null);
    return;
  }
  if (decidee.dejaTraitee) {
    afficherToast('Cette proposition a déjà été traitée.', 'OK', null);
    await apresDecisionProposition();
    return;
  }
  noterVerificationPoste('routines-boite-poste', { detail: `proposition « ${p.type} » autorisée` });
  const message = executerActionProposition(p);
  afficherToast(message, 'OK', null);
  await apresDecisionProposition();
}

async function refuserProposition(id) {
  const p = propositionParId(id);
  if (!p || propositionsEnCours[id]) return;
  let decidee;
  try {
    decidee = await enregistrerDecisionProposition(id, 'refusee');
  } catch (e) {
    afficherToast('Refus non enregistré : ' + e.message, 'OK', null);
    return;
  }
  if (decidee.dejaTraitee) { afficherToast('Cette proposition a déjà été traitée.', 'OK', null); await apresDecisionProposition(); return; }
  noterVerificationPoste('routines-boite-poste', { detail: 'proposition refusée' });
  afficherToast('Refusée : CLAIRE ne la proposera plus.', 'OK', null);
  await apresDecisionProposition();
}

// « Jamais pour ce dossier » : la proposition est refusée ET CLAIRE ne dépose plus de proposition de cette routine sur ce dossier (annulable).
async function silencerDossierProposition(id) {
  const p = propositionParId(id);
  if (!p || !p.dossierId || propositionsEnCours[id]) return;
  propositionsEnCours[id] = true;
  try {
    await enregistrerDecisionProposition(id, 'refusee');
    const r = await fetchAvecAuth(`/api/canaux/silences/${encodeURIComponent(p.dossierId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auteur: utilisateurPoste, routine: p.routine || '' }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    afficherToast('Non enregistré : ' + e.message, 'OK', null);
    return;
  } finally { delete propositionsEnCours[id]; }
  afficherToast('CLAIRE ne vous proposera plus ça sur ce dossier.', 'Annuler', async () => {
    try {
      await fetchAvecAuth(`/api/canaux/silences/${encodeURIComponent(p.dossierId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auteur: utilisateurPoste, routine: p.routine || '', lever: true }) });
    } catch (e) { /* le silence reste : il se lève dans le canal du dossier */ }
    if (typeof chargerSilencesCanal === 'function') chargerSilencesCanal();
  });
  await apresDecisionProposition();
  if (typeof chargerSilencesCanal === 'function') chargerSilencesCanal();
}

// ---- Le lien de la fiche du dossier vers son canal ----

// En tête du Tableau de la fiche : le lien vers le canal du dossier — ce que CLAIRE y a écrit, ce qui attend une décision. Rien s'il n'y a rien.
function renderPropositionsFiche(d) {
  const aDecider = propositionsClaire.liste.filter(p => p.dossierId === d.id).length;
  const c = typeof canaux === 'object' && canaux.liste ? canaux.liste.find(x => x.id === 'd:' + d.id) : null;
  const nonLus = c ? c.nonLus : 0;
  if (!aDecider && !nonLus) return '';
  const texte = [nonLus ? `${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}` : '', aDecider ? `${aDecider} à décider` : ''].filter(Boolean).join(' · ');
  return `<section class="pc-fiche" aria-label="Canal du dossier">
    <header class="pc-fiche-tete"><span class="pc-etincelle pc-etincelle-petite" aria-hidden="true">${icone('diese')}</span><strong>Canal du dossier</strong><span class="pc-fiche-nb">${escapeHtml(texte)}</span>
      <wa-button variant="brand" size="s" type="button" class="pc-fiche-ouvrir" onclick="ouvrirCanalDepuisFiche('${escapeOnclickArg(d.id)}')">Ouvrir</wa-button></header>
  </section>`;
}

// Une décision prise ailleurs (la boîte) ou une nouvelle proposition : la fiche ouverte se redessine seule, sans toucher à sa saisie.
function rafraichirPropositionsFiche() {
  if (typeof majBoutonCanalFiche === 'function') majBoutonCanalFiche();
  const bandeau = document.querySelector('#dossier-drawer .pc-fiche');
  const id = typeof dossierOuvert === 'string' ? dossierOuvert : '';
  if (!id) return;
  const d = dossiers.find(x => x.id === id);
  if (!d) return;
  const html = renderPropositionsFiche(d);
  if (!bandeau && !html) return;
  if (bandeau && !html) { bandeau.remove(); return; }
  if (bandeau) { bandeau.outerHTML = html; return; }
  const tableau = document.querySelector('#dossier-drawer .tf-tableau');
  if (tableau) tableau.insertAdjacentHTML('beforebegin', html);
}
