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
  alerte: { libelle: 'À savoir', icone: 'info', bouton: 'Marquer comme lu', couleur: 'gris' },
  // Une demande de CLAIRE depuis son ordinateur virtuel (client/128) : « Autoriser » ne fait rien ici, la décision est lue par son poste.
  validation: { libelle: 'Demande de CLAIRE', icone: 'discussion', bouton: 'Autoriser', couleur: 'accent' }
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
  // Terminée (étude 27/10) : le travail autorisé est fait.
  if (p && p.termineeLe) return `Terminée${p.termineePar ? ` par ${prenomCollaborateur(p.termineePar)}` : ''} · ${ageTexteProposition(p.termineeLe, maintenantMs)}`;
  if (p && p.etat === 'acceptee') return `Autorisée${par}${quand}`;
  if (p && p.etat === 'refusee') return `Refusée${par}${quand}`;
  if (p && p.etat === 'faite') return `Déjà fait${par}${quand}`;
  if (p && p.etat === 'expiree') return 'Expirée : sans réponse depuis 30 jours';
  if (p && p.etat === 'vue' && p.type === 'alerte') return 'Lue';
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
    if (typeof majPastilleCanaux === 'function') majPastilleCanaux();
    if (typeof renderCanaux === 'function') renderCanaux();
    rafraichirPropositionsFiche();
  } catch (e) { /* serveur injoignable : la pastille garde son dernier état */ }
}

// Un contrôle toutes les minutes tant que la fenêtre est ouverte ; lancé une fois par demarrerApplication.
function demarrerPropositionsClaire() {
  chargerPropositionsClaire('a-traiter');
  setInterval(() => { if (!document.hidden || pastilleActiveHorsEcran()) chargerPropositionsClaire(); }, INTERVALLE_PROPOSITIONS_MS);
}

// Pure : le canal qui porte la carte d'une proposition — celui de son dossier, sinon « général » (server/src/canaux/deposer.js).
function canalDeProposition(p) {
  return p && p.dossierId ? 'd:' + p.dossierId : 'general';
}

// ---- La carte d'une proposition (dans le canal de son dossier, « général » et la fiche) ----

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
  const traitee = p.etat === 'acceptee' || p.etat === 'refusee' || p.etat === 'expiree' || p.etat === 'faite' || (p.etat === 'vue' && p.type === 'alerte');
  const reportee = !traitee && p.reporteJusqua && Date.parse(p.reporteJusqua) > Date.now();
  const moi = peutDeciderProposition(p, utilisateurPoste);
  // Autorisée, pas encore terminée : « Terminé » quand le travail est fait (étude 27/10 : « comment indiquer que c'est terminé ? »).
  const terminable = p.etat === 'acceptee' && !p.termineeLe && moi && (p.type === 'document' || p.type === 'tache');
  const actions = traitee
    ? `<div class="pc-actions"><p class="pc-etat pc-etat-${escapeAttr(p.termineeLe ? 'terminee' : p.etat)}">${escapeHtml(etatTexteProposition(p))}</p>${terminable ? `<wa-button appearance="outlined" size="s" type="button" onclick="terminerProposition('${idJs}')" title="Le travail est fait : la carte est fermée, CLAIRE ne le reproposera pas">${icone('check')}Terminé</wa-button>` : ''}</div>`
    : !moi
      ? `<p class="pc-etat">Pour ${escapeHtml(prenomCollaborateur(p.responsable))} : c’est à elle ou lui de décider.</p>`
      : reportee
      ? `<div class="pc-actions"><p class="pc-etat">Reportée jusqu’au ${escapeHtml(new Date(p.reporteJusqua).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}.</p>
        <wa-button appearance="outlined" size="s" type="button" onclick="reporterProposition('${idJs}', 'reprendre')">Reprendre maintenant</wa-button></div>`
      : `<div class="pc-actions">
        <wa-button variant="brand" size="s" type="button" onclick="autoriserProposition('${idJs}')">${icone(t.icone)}${escapeHtml(t.bouton)}</wa-button>
        ${p.type === 'alerte' ? '' : `<wa-button appearance="outlined" size="s" type="button" onclick="refuserProposition('${idJs}')">Refuser</wa-button>`}
        ${p.type === 'alerte' ? '' : `<wa-button appearance="outlined" size="s" type="button" onclick="dejaFaitProposition('${idJs}')" title="Ça a déjà été fait : on ferme sans rien exécuter">Déjà fait</wa-button>
        <span class="pc-plus-tard"><wa-button appearance="outlined" size="s" type="button" onclick="this.parentNode.classList.toggle('ouvert')" aria-haspopup="true">Plus tard</wa-button>
          <span class="pc-reporter" role="group" aria-label="Reporter à"><wa-button appearance="plain" size="s" type="button" onclick="reporterProposition('${idJs}', 'demain')">Demain</wa-button><wa-button appearance="plain" size="s" type="button" onclick="reporterProposition('${idJs}', '3-jours')">Dans 3 jours</wa-button><wa-button appearance="plain" size="s" type="button" onclick="reporterProposition('${idJs}', 'lundi')">Lundi</wa-button></span></span>`}
        ${p.dossierId && p.type !== 'alerte' ? `<wa-button appearance="plain" size="s" type="button" onclick="silencerDossierProposition('${idJs}')">Jamais pour ce dossier</wa-button>` : ''}
      </div>`;
  return `<article class="pc-carte pc-type-${escapeAttr(p.type)}${o.compacte ? ' pc-compacte' : ''}${traitee ? ' pc-traitee' : ''}" data-proposition="${escapeAttr(p.id)}">
    <span class="pc-rail" aria-hidden="true"></span>
    <div class="pc-corps">
      <div class="pc-meta"><span class="pc-type">${icone(t.icone)}${escapeHtml(t.libelle)}</span><span class="pc-age">${escapeHtml(ageTexteProposition(p.creeLe))}</span></div>
      <h3 class="pc-titre">${escapeHtml(p.titre)}</h3>
      ${p.resume ? `<p class="pc-resume">${escapeHtml(p.resume)}</p>` : ''}
      ${p.type === 'email' && p.details && p.details.corps ? `<details class="pc-apercu"${!traitee && Number(p.details.niveau) >= 2 ? ' open' : ''}><summary>Texte préparé${Number(p.details.niveau) >= 2 ? ' — il partira tel quel après « Autoriser »' : ''}</summary><div class="pc-apercu-texte">${escapeHtml(p.details.corps).replace(/\n/g, '<br>')}</div></details>` : ''}
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

async function enregistrerDecisionProposition(id, decision, quand) {
  const r = await fetchAvecAuth(`/api/propositions/${encodeURIComponent(id)}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, auteur: utilisateurPoste, quand: quand || '' })
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

// Pure : ce qui est dit quand la décision arrive trop tard (déjà décidée, ou demande de CLAIRE expirée faute de réponse).
function texteDejaTraitee(decidee) {
  if (decidee && decidee.etat === 'expiree') return decidee.type === 'validation'
    ? 'Cette demande a expiré : sans réponse à temps, CLAIRE ne l’a pas faite.' : 'Cette proposition a expiré.';
  return 'Cette proposition a déjà été traitée.';
}

// Ce que fait « Autoriser » : le geste habituel de CLAIRE, JAMAIS un envoi. Rend le message dit à l'utilisateur.
function executerActionProposition(p) {
  if (p.type === 'validation') return 'Autorisé : CLAIRE continue sur son poste.';
  const d = p.dossierId ? dossiers.find(x => x.id === p.dossierId) : null;
  const det = p.details || {};
  if (p.type === 'email') {
    // Niveau 2 (décidé par l'administrateur, geste par geste) : CLAIRE envoie après « Autoriser », sans second clic.
    const envoiSeul = Number(det.niveau) >= 2;
    const apresOuverture = (geste) => { if (envoiSeul) setTimeout(() => {
      if (envoyerRedactionOuverte(p.dossierId || '', geste)) noterVerificationPoste('routines-envoi-niveau-2', { detail: 'email envoyé après Autoriser' });
      else afficherToast('Envoi par CLAIRE impossible ici : relisez l’email et cliquez sur « Envoyer ».', 'OK', null);
    }, 400); };
    // Une relance de l'étude (modèle mot pour mot) : composée par le poste, comme le bouton de la fiche.
    if (det.modele && d && typeof MODELES_EMAIL_RELANCE === 'object' && MODELES_EMAIL_RELANCE[det.modele]) {
      envoyerRelanceCiblee(d.id, det.modele, true);
      apresOuverture(det.modele);
      return envoiSeul ? 'CLAIRE envoie la relance préparée.' : 'Relance ouverte : relisez-la, rien ne part sans votre clic sur « Envoyer ».';
    }
    // La fenêtre d'email habituelle : tout est relisible et modifiable. Une réponse reste dans le fil de l'email reçu (`reponseA`).
    livrerEmailDossier({ destinataire: det.destinataire || '', sujet: det.sujet || p.titre, corps: det.corps || '',
      confrere: det.confrere === true || det.confrere === 'true', responsableSignature: d ? d.responsable : '',
      dossierId: p.dossierId || '', geste: 'routine-claire', reponseA: det.reponseA || '' });
    apresOuverture('routine-claire');
    return envoiSeul ? 'CLAIRE envoie l’email préparé.' : 'Brouillon ouvert : relisez-le, rien ne part sans votre clic sur « Envoyer ».';
  }
  if (p.type === 'document') {
    const outil = OUTILS_PROPOSITION[(p.details && p.details.outil) || ''];
    if (!outil) { if (d) ouvrirDossierDepuisDashboard(d.id); return 'Fiche du dossier ouverte.'; }
    if (outil.onglet === 'appel-fonds' && d) preparerAppelFondsDepuisDossier(d.id);
    else if (outil.onglet === 'autorisations' && d) ouvrirAutorisationsDepuisFiche(d.id);
    else if (outil.onglet === 'constitution' && d) { definirOnglet('constitution'); choisirDossierConstitution(d.id); }
    else if (outil.onglet) definirOnglet(outil.onglet);
    else if (d) {
      if (d.roleNotaire === 'participant') return 'Pas de fiche de signature : l’acte est reçu par le confrère (participation).';
      ouvrirVeilleSignature(d.id);
    }
    return 'Document ouvert dans son outil : relisez-le avant de l’utiliser.';
  }
  if (p.type === 'tache') { poserTacheDepuisProposition(p); return 'Tâche ajoutée dans votre liste « À faire ».'; }
  if (p.type === 'dates' && d) { ouvrirSondageCreneaux(d.id); return 'Sondage de dates ouvert : choisissez les créneaux, rien ne part sans votre clic.'; }
  if (det.ouvrir === 'reglages-routines') { definirOnglet('reglages'); definirSousOngletReglages('routines'); return 'Réglages › Routines ouverts : c’est à vous de décider.'; }
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

// Un brouillon d'email de CLAIRE (niveau 1) : « Ouvrir le brouillon » n'est PAS une décision (étude 27/10 : « si je le referme je dois
// pouvoir le rouvrir ; ouvrir le brouillon ne doit pas forcément valider la tâche »). La proposition reste dans « À traiter » tant que
// l'email n'est pas parti (« Envoyer », Outlook ou la messagerie du poste) ; refermée, la fenêtre garde ce qui a été retouché, sur ce poste.
var CLE_BROUILLONS_PROPOSITIONS = 'claire-brouillons-propositions:';
function brouillonsPropositions() {
  try { const b = JSON.parse(localStorage.getItem(CLE_BROUILLONS_PROPOSITIONS + (utilisateurPoste || '')) || '{}'); return b && typeof b === 'object' ? b : {}; } catch (e) { return {}; }
}
function garderBrouillonProposition(id, brouillon) {
  const b = brouillonsPropositions();
  if (brouillon) b[id] = Object.assign({}, brouillon, { le: Date.now() }); else delete b[id];
  // 30 jours au plus, 40 brouillons au plus : une proposition décidée ailleurs n'en laisse pas pour toujours.
  const gardes = Object.entries(b).filter(([, x]) => x && Date.now() - (Number(x.le) || 0) < 30 * 86400000)
    .sort((x, y) => (Number(y[1].le) || 0) - (Number(x[1].le) || 0)).slice(0, 40);
  ecrireLocal(CLE_BROUILLONS_PROPOSITIONS + (utilisateurPoste || ''), JSON.stringify(Object.fromEntries(gardes)));
}

/** Pur : l'email est-il parti (ou remis à Outlook / à la messagerie) d'après ce que rend la fenêtre ? */
function emailBrouillonParti(r) {
  if (r === false || r == null) return false;
  if (r === true) return true;
  return !!(r.ok && !r.annule);
}

async function ouvrirBrouillonProposition(id, p) {
  const det = p.details || {};
  let decideeAvant = false;
  const d = p.dossierId ? dossiers.find(x => x.id === p.dossierId) : null;
  let r;
  if (det.modele && d && typeof MODELES_EMAIL_RELANCE === 'object' && MODELES_EMAIL_RELANCE[det.modele]) {
    r = await envoyerRelanceCiblee(d.id, det.modele, true);
  } else {
    const b = brouillonsPropositions()[id];
    r = await livrerEmailDossier({ destinataire: b && b.a != null ? b.a : (det.destinataire || ''), sujet: b && b.sujet ? b.sujet : (det.sujet || p.titre), corps: det.corps || '',
      html: b && b.texteModifie ? b.html : '', cc: b && b.cc ? b.cc : '',
      // Décidée au clic sur « Envoyer », AVANT l'envoi (relecture 27/10) : ouverte par deux personnes, ou refusée ailleurs entre-temps,
      // elle ne part qu'une fois.
      avantEnvoi: async () => {
        try {
          const dec = await enregistrerDecisionProposition(id, 'acceptee');
          if (dec.dejaTraitee) return 'Cette proposition a déjà été traitée (envoyée, refusée ou notée faite ailleurs) : rien n’est parti.';
          decideeAvant = true;
          return true;
        } catch (e) { return 'Proposition non enregistrée, rien n’est parti : ' + e.message; }
      }, confrere: det.confrere === true || det.confrere === 'true', responsableSignature: d ? d.responsable : '',
      dossierId: p.dossierId || '', geste: 'routine-claire', reponseA: det.reponseA || '',
      emailsRecus: String(det.emailsRecus || '').split(',').map(x => x.trim()).filter(Boolean) });
  }
  if (!emailBrouillonParti(r)) {
    if (r && r.annule && r.brouillon && r.brouillon.modifie) garderBrouillonProposition(id, r.brouillon);
    if ((r && r.annule) || r === false) afficherToast('Brouillon refermé : il reste dans « À traiter », rouvrez-le quand vous voulez.', 'OK', null);
    return;
  }
  garderBrouillonProposition(id, null);
  if (decideeAvant) { await apresDecisionProposition(); return; }
  try {
    const decidee = await enregistrerDecisionProposition(id, 'acceptee');
    if (!decidee.dejaTraitee) noterVerificationPoste('routines-boite-poste', { detail: 'brouillon de CLAIRE envoyé' });
  } catch (e) {
    afficherToast('Email parti, mais la proposition n’a pas été close : ' + e.message, 'OK', null);
  }
  await apresDecisionProposition();
}

async function autoriserPropositionSure(id, p) {
  if (p.type === 'email' && !(Number(p.details && p.details.niveau) >= 2)) { await ouvrirBrouillonProposition(id, p); return; }
  // Demande Comedec / CJN dans Authentic : la proposition n'est décidée qu'une fois la demande CRÉÉE ; un échec (file pleine, erreur
  // d'Authentic) la laisse à décider, avec la raison (relecture 0.373.0).
  const fm = p.details && p.details.formalite;
  if (p.type === 'tache' && (fm === 'cjn' || fm === 'comedec')) {
    const d = p.dossierId ? dossiers.find(x => x.id === p.dossierId) : null;
    if (!d) { afficherToast('Dossier introuvable : rien préparé dans Authentic.', 'OK', null); return; }
    const r = await preparerFormaliteAuthentic(d, fm, {});
    if (r && r.fait) { await enregistrerDecisionProposition(id, 'acceptee').catch(() => {}); noterVerificationPoste('routines-boite-poste', { detail: 'demande Authentic autorisée' }); }
    await apresDecisionProposition();
    return;
  }
  let decidee;
  try {
    decidee = await enregistrerDecisionProposition(id, p.type === 'alerte' ? 'vue' : 'acceptee');
  } catch (e) {
    afficherToast('Proposition non enregistrée : ' + e.message, 'OK', null);
    return;
  }
  if (decidee.dejaTraitee) {
    afficherToast(texteDejaTraitee(decidee), 'OK', null);
    await apresDecisionProposition();
    return;
  }
  noterVerificationPoste('routines-boite-poste', { detail: `proposition « ${p.type} » autorisée` });
  // Le niveau rendu par le serveur est celui EN VIGUEUR (un niveau abaissé depuis le dépôt s'applique).
  const message = executerActionProposition(Object.assign({}, p, { details: Object.assign({}, p.details, decidee.details ? { niveau: decidee.details.niveau } : { niveau: '1' }) }));
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
  if (decidee.dejaTraitee) { afficherToast(texteDejaTraitee(decidee), 'OK', null); await apresDecisionProposition(); return; }
  noterVerificationPoste('routines-boite-poste', { detail: 'proposition refusée' });
  afficherToast('Refusée : CLAIRE ne la proposera plus.', 'OK', null);
  await apresDecisionProposition();
}

// « Terminé » : le travail d'une proposition autorisée est fait (étude 27/10).
async function terminerProposition(id) {
  if (propositionsEnCours[id]) return;
  propositionsEnCours[id] = true;
  try {
    await enregistrerDecisionProposition(id, 'terminee');
    afficherToast('Noté terminé.', 'OK', null);
  } catch (e) {
    afficherToast('Non enregistré : ' + e.message, 'OK', null);
    return;
  } finally { delete propositionsEnCours[id]; }
  await apresDecisionProposition();
}

// Le geste d'une routine fait pour un dossier, dit par l'écran qui l'a fait (la constitution enregistrée ou imprimée…) : ses propositions
// deviennent « terminées » — Claire le sait, la carte le dit (🏁), rien n'est reproposé. Jamais bloquant.
async function terminerRoutineDossier(dossierId, routine) {
  if (!dossierId || !routine || !utilisateurPoste) return;
  try {
    const r = await fetchAvecAuth('/api/propositions/terminer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId, routine, auteur: utilisateurPoste }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.terminees) await apresDecisionProposition();
  } catch (e) { /* le serveur relira plus tard ; rien de bloquant */ }
}

// « Déjà fait » : la proposition est fermée sans rien exécuter (étude 26/10 : « qu'est-ce qu'on fait si c'est déjà fait ? »).
async function dejaFaitProposition(id) {
  const p = propositionParId(id);
  if (!p || propositionsEnCours[id]) return;
  propositionsEnCours[id] = true;
  try {
    const decidee = await enregistrerDecisionProposition(id, 'faite');
    afficherToast(decidee.dejaTraitee ? 'Cette proposition a déjà été traitée.' : 'Notée « déjà fait » : CLAIRE ne la reproposera pas.', 'OK', null);
  } catch (e) {
    afficherToast('Non enregistré : ' + e.message, 'OK', null);
    return;
  } finally { delete propositionsEnCours[id]; }
  await apresDecisionProposition();
}

// « Plus tard » : la proposition quitte « À traiter » et y revient seule à 8 h (demain, dans 3 jours, lundi) ; « reprendre » la rend tout de suite.
async function reporterProposition(id, quand) {
  const p = propositionParId(id);
  if (!p || propositionsEnCours[id]) return;
  propositionsEnCours[id] = true;
  try {
    await enregistrerDecisionProposition(id, 'reporter', quand);
    afficherToast(quand === 'reprendre' ? 'Remise dans « À traiter ».' : 'Reportée : elle reviendra dans « À traiter » à 8 h.', 'OK', null);
  } catch (e) {
    afficherToast('Non reporté : ' + e.message, 'OK', null);
    return;
  } finally { delete propositionsEnCours[id]; }
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
// Pur : une proposition encore à décider (« À traiter » garde aussi les autorisées pas encore terminées, comptées à part).
function propositionADecider(p) { return !!p && (p.etat === 'proposee' || (p.etat === 'vue' && p.type !== 'alerte')); }

// Propositions à décider, vues ou non (étude 29/10 : « si ça demande une validation, laisser en attendant une notification en grisée ; si une
// nouvelle arrive sur le même dossier, passer en rouge »). Une proposition est « vue » quand son canal a été ouvert fenêtre devant : elle
// reste alors en attente (pastille grise) jusqu'à la décision ; une nouvelle (pas encore vue) est rouge, y compris sur un dossier qui en
// avait déjà une en attente. Seules les rouges comptent dans la pastille de la barre des tâches.
function clePropositionsVues() { return 'claire-propositions-vues:' + (utilisateurPoste || 'poste'); }

var cachePropositionsVues = { cle: '', t: 0, ensemble: null };   // relu au plus toutes les 2 s (une lecture par ligne de canal sinon)
function lirePropositionsVues() {
  const cle = clePropositionsVues();
  if (cachePropositionsVues.ensemble && cachePropositionsVues.cle === cle && Date.now() - cachePropositionsVues.t < 2000) return cachePropositionsVues.ensemble;
  let ensemble;
  try { const l = JSON.parse(localStorage.getItem(cle) || '[]'); ensemble = new Set(Array.isArray(l) ? l.filter(x => typeof x === 'string') : []); } catch (e) { ensemble = new Set(); }
  cachePropositionsVues = { cle, t: Date.now(), ensemble };
  return ensemble;
}

/** Pure : { nouvelles, attente } parmi les propositions à décider (reportées exclues), d'un canal si `canalId` est donné. */
function separerPropositionsAttente(liste, vues, canalId, maintenant) {
  const sortie = { nouvelles: [], attente: [] };
  const t = maintenant || Date.now();
  for (const p of Array.isArray(liste) ? liste : []) {
    if (!propositionADecider(p)) continue;
    if (p.reporteJusqua && Date.parse(p.reporteJusqua) > t) continue;
    if (canalId && canalDeProposition(p) !== canalId) continue;
    (vues && vues.has(p.id) ? sortie.attente : sortie.nouvelles).push(p);
  }
  return sortie;
}

function propositionsEnAttente(canalId) { return separerPropositionsAttente(propositionsClaire.liste, lirePropositionsVues(), canalId); }

// Le canal est sous les yeux : ses propositions à décider passent de rouge à grise.
function marquerPropositionsVues(canalId) {
  const vues = lirePropositionsVues();
  const nouvelles = separerPropositionsAttente(propositionsClaire.liste, vues, canalId).nouvelles;
  if (!nouvelles.length) return false;
  for (const p of nouvelles) vues.add(p.id);
  ecrireLocal(clePropositionsVues(), JSON.stringify(Array.from(vues).slice(-300)));
  cachePropositionsVues = { cle: '', t: 0, ensemble: null };
  return true;
}

function renderPropositionsFiche(d) {
  const duDossier = propositionsClaire.liste.filter(p => p.dossierId === d.id);
  const aDecider = duDossier.filter(propositionADecider).length;
  const aTerminer = duDossier.length - aDecider;
  const c = typeof canaux === 'object' && canaux.liste ? canaux.liste.find(x => x.id === 'd:' + d.id) : null;
  const nonLus = c ? c.nonLus : 0;
  if (!aDecider && !aTerminer && !nonLus) return '';
  const texte = [nonLus ? `${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}` : '', aDecider ? `${aDecider} à décider` : '', aTerminer ? `${aTerminer} à terminer` : ''].filter(Boolean).join(' · ');
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
