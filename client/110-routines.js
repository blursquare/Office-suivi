// Routines de CLAIRE, phase 0 (étude 24/10, cadrage docs/spec-routines-claire.md) — le côté du collaborateur : la BOÎTE DE PROPOSITIONS.
// CLAIRE prépare (brouillon d'email, document, tâche, dates, alerte) et dépose dans la boîte de chacun ; le collaborateur AUTORISE ou REFUSE.
// Rien ne part ni ne s'écrit sans ce clic : « Autoriser » exécute le geste habituel de CLAIRE (ouvrir le brouillon dans la fenêtre d'email,
// ouvrir l'outil, poser la tâche) — jamais un envoi. La boîte se trouve : (1) dans l'icône ✦ en haut de la barre latérale (pastille = ce qui
// attend une décision), (2) dans un bandeau « CLAIRE a préparé » en tête du Tableau de la fiche du dossier concerné. Les réglages des routines
// (interrupteurs, trois niveaux d'autonomie) sont dans client/111-reglages-routines.js. Serveur : server/src/routines/, routes/routines.js.

var propositionsClaire = { aTraiter: 0, liste: [], traitees: [], onglet: 'a-traiter', tous: false, charge: false, ouvert: false };
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
    majPastillePropositionsClaire();
    return;
  }
  const filtre = onglet || (propositionsClaire.ouvert ? propositionsClaire.onglet : 'a-traiter');
  try {
    const q = `utilisateur=${encodeURIComponent(utilisateurPoste)}&etat=${filtre}${propositionsClaire.tous && estAdministrateur(utilisateurPoste) ? '&tous=1' : ''}`;
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
    majPastillePropositionsClaire();
    if (propositionsClaire.ouvert) renderPropositionsClaire();
    rafraichirPropositionsFiche();
  } catch (e) { /* serveur injoignable : la pastille garde son dernier état */ }
}

function majPastillePropositionsClaire() {
  const badge = document.getElementById('badge-propositions');
  if (!badge) return;
  const n = propositionsClaire.aTraiter;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.style.display = n ? '' : 'none';
  const bouton = document.getElementById('tab-propositions');
  if (bouton) {
    const titre = n ? `Propositions de CLAIRE : ${n} à décider` : 'Propositions de CLAIRE';
    bouton.title = titre;
    bouton.setAttribute('aria-label', titre);
  }
}

// Un contrôle toutes les minutes tant que la fenêtre est ouverte ; lancé une fois par demarrerApplication.
function demarrerPropositionsClaire() {
  chargerPropositionsClaire('a-traiter');
  setInterval(() => { if (!document.hidden) chargerPropositionsClaire(); }, INTERVALLE_PROPOSITIONS_MS);
}

// ---- La boîte (volet à droite) ----

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
  const actions = traitee
    ? `<p class="pc-etat pc-etat-${escapeAttr(p.etat)}">${escapeHtml(etatTexteProposition(p))}</p>`
    : `<div class="pc-actions">
        <wa-button variant="brand" size="s" type="button" onclick="autoriserProposition('${idJs}')">${icone(t.icone)}${escapeHtml(t.bouton)}</wa-button>
        ${p.type === 'alerte' ? '' : `<wa-button appearance="plain" size="s" type="button" onclick="refuserProposition('${idJs}')">Refuser</wa-button>`}
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

function renderPropositionsClaire() {
  const contenu = document.getElementById('propositions-contenu');
  if (!contenu) return;
  const a = propositionsClaire;
  const liste = a.onglet === 'a-traiter' ? a.liste : a.traitees;
  const admin = estAdministrateur(utilisateurPoste);
  const vide = a.onglet === 'a-traiter'
    ? `<div class="pc-vide"><span class="pc-vide-icone" aria-hidden="true">${icone('sparkle')}</span><h3>Rien à décider pour le moment</h3>
        <p>CLAIRE prépare des brouillons, des documents et des tâches d’après vos dossiers. Dès qu’elle a quelque chose, ça arrive ici — et vous décidez.</p>
        <wa-button appearance="outlined" size="s" type="button" onclick="ouvrirReglagesRoutinesDepuisBoite()">${icone('settings')}Régler les routines</wa-button></div>`
    : `<div class="pc-vide"><span class="pc-vide-icone" aria-hidden="true">${icone('archive')}</span><h3>Aucune proposition traitée</h3><p>Ce que vous autorisez ou refusez se retrouve ici.</p></div>`;
  contenu.innerHTML = `
    <header class="pc-tete">
      <span class="pc-etincelle" aria-hidden="true">${icone('sparkle')}</span>
      <div class="pc-tete-texte"><h2 id="propositions-titre">Propositions de CLAIRE</h2><p>${escapeHtml(resumeBoiteClaire(a.aTraiter, utilisateurPoste))}</p></div>
      <wa-button appearance="plain" class="bouton-icone" type="button" onclick="fermerPropositionsClaire()" aria-label="Fermer">${icone('x')}</wa-button>
    </header>
    <div class="pc-barre">
      <wa-button-group>
        <wa-button appearance="outlined" size="s" class="vue-bascule-btn${a.onglet === 'a-traiter' ? ' actif' : ''}" type="button" onclick="choisirOngletPropositions('a-traiter')">À décider${a.aTraiter ? ` (${a.aTraiter})` : ''}</wa-button>
        <wa-button appearance="outlined" size="s" class="vue-bascule-btn${a.onglet === 'traitees' ? ' actif' : ''}" type="button" onclick="choisirOngletPropositions('traitees')">Traitées</wa-button>
      </wa-button-group>
      ${admin ? `<label class="pc-tous"><wa-switch ${a.tous ? 'checked' : ''} onchange="basculerPropositionsToutes(this.checked)"></wa-switch><span>Toute l’étude</span></label>` : ''}
    </div>
    <div class="pc-liste" role="list">${liste.length ? liste.map(p => carteProposition(p)).join('') : vide}</div>
    <footer class="pc-pied"><span class="pc-pied-texte">${icone('shield')}Rien ne part sans votre clic.</span>
      <wa-button appearance="plain" size="s" type="button" onclick="ouvrirReglagesRoutinesDepuisBoite()">Réglages des routines</wa-button></footer>`;
}

function ouvrirPropositionsClaire() {
  const overlay = document.getElementById('propositions-overlay');
  if (!overlay) return;
  propositionsClaire.ouvert = true;
  overlay.style.display = 'flex';
  // Le volet glisse depuis la droite : la classe est posée à l'image suivante pour que la transition parte.
  requestAnimationFrame(() => overlay.classList.add('ouvert'));
  renderPropositionsClaire();
  chargerPropositionsClaire(propositionsClaire.onglet);
}

function fermerPropositionsClaire() {
  const overlay = document.getElementById('propositions-overlay');
  propositionsClaire.ouvert = false;
  if (!overlay) return;
  overlay.classList.remove('ouvert');
  setTimeout(() => { if (!propositionsClaire.ouvert) overlay.style.display = 'none'; }, 220);
}

function choisirOngletPropositions(onglet) {
  propositionsClaire.onglet = onglet === 'traitees' ? 'traitees' : 'a-traiter';
  renderPropositionsClaire();
  chargerPropositionsClaire(propositionsClaire.onglet);
}

function basculerPropositionsToutes(coche) {
  propositionsClaire.tous = !!coche;
  chargerPropositionsClaire(propositionsClaire.onglet);
  chargerPropositionsClaire(propositionsClaire.onglet === 'a-traiter' ? 'traitees' : 'a-traiter');
}

function ouvrirReglagesRoutinesDepuisBoite() {
  fermerPropositionsClaire();
  definirOnglet('reglages');
  definirSousOngletReglages('routines');
}

function ouvrirDossierDepuisProposition(id) {
  fermerPropositionsClaire();
  ouvrirDossierDepuisDashboard(id);
}

// ---- Décisions ----

function propositionParId(id) {
  return propositionsClaire.liste.concat(propositionsClaire.traitees).find(p => p.id === id) || null;
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
    fermerPropositionsClaire();
    livrerEmailDossier({ destinataire: (p.details && p.details.destinataire) || '', sujet: (p.details && p.details.sujet) || p.titre, corps: (p.details && p.details.corps) || '',
      dossierId: p.dossierId || '', geste: 'routine-claire' });
    return 'Brouillon ouvert : relisez-le, rien ne part sans votre clic sur « Envoyer ».';
  }
  if (p.type === 'document') {
    const outil = OUTILS_PROPOSITION[(p.details && p.details.outil) || ''];
    fermerPropositionsClaire();
    if (!outil) { if (d) ouvrirDossierDepuisDashboard(d.id); return 'Fiche du dossier ouverte.'; }
    if (outil.onglet === 'appel-fonds' && d) preparerAppelFondsDepuisDossier(d.id);
    else if (outil.onglet === 'constitution' && d) { definirOnglet('constitution'); choisirDossierConstitution(d.id); }
    else if (outil.onglet) definirOnglet(outil.onglet);
    else if (d) ouvrirVeilleSignature(d.id);
    return 'Document ouvert dans son outil : relisez-le avant de l’utiliser.';
  }
  if (p.type === 'tache') { poserTacheDepuisProposition(p); return 'Tâche ajoutée dans votre liste « À faire ».'; }
  if (p.type === 'dates' && d) { fermerPropositionsClaire(); ouvrirDossierDepuisDashboard(d.id); return 'Fiche du dossier ouverte.'; }
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
    await chargerPropositionsClaire('a-traiter');
    return;
  }
  noterVerificationPoste('routines-boite-poste', { detail: `proposition « ${p.type} » autorisée` });
  const message = executerActionProposition(p);
  afficherToast(message, 'OK', null);
  await chargerPropositionsClaire('a-traiter');
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
  if (decidee.dejaTraitee) { afficherToast('Cette proposition a déjà été traitée.', 'OK', null); await chargerPropositionsClaire('a-traiter'); return; }
  noterVerificationPoste('routines-boite-poste', { detail: 'proposition refusée' });
  afficherToast('Refusée : CLAIRE ne la proposera plus.', 'OK', null);
  await chargerPropositionsClaire('a-traiter');
}

// ---- Le bandeau de la fiche du dossier ----

// Le bandeau « CLAIRE a préparé » en tête du Tableau de la fiche : les propositions à décider de CE dossier, ou rien.
function renderPropositionsFiche(d) {
  const siennes = propositionsClaire.liste.filter(p => p.dossierId === d.id);
  if (!siennes.length) return '';
  return `<section class="pc-fiche" aria-label="CLAIRE a préparé">
    <header class="pc-fiche-tete"><span class="pc-etincelle pc-etincelle-petite" aria-hidden="true">${icone('sparkle')}</span><strong>CLAIRE a préparé</strong><span class="pc-fiche-nb">${siennes.length}</span></header>
    <div class="pc-fiche-liste">${siennes.map(p => carteProposition(p, { compacte: true })).join('')}</div>
  </section>`;
}

// Une décision prise ailleurs (la boîte) ou une nouvelle proposition : la fiche ouverte se redessine seule, sans toucher à sa saisie.
function rafraichirPropositionsFiche() {
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

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && propositionsClaire.ouvert) fermerPropositionsClaire(); });
}
