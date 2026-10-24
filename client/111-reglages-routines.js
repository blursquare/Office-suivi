// Réglages › Routines (étude 24/10, phase 0, cadrage docs/spec-routines-claire.md) : l'interrupteur général, l'heure du passage et du résumé Teams,
// le plafond mensuel de l'IA en ligne (50 €), puis chaque routine avec son interrupteur et ses TROIS NIVEAUX D'AUTONOMIE réglables routine par
// routine et geste par geste (1 proposer, 2 agir en réversible, 3 agir seule vers l'extérieur — décision de l'étude, geste par geste), ses
// statistiques d'acceptation et la proposition de passer au niveau supérieur (90 % d'acceptation sur 30 propositions). Pour finir, le journal
// « Ce que CLAIRE a fait seule ». Chaque réglage s'enregistre dès qu'on le change (comme les interrupteurs des autres rubriques).
// Réservé à l'administrateur : l'interrupteur général et le niveau 3 (les autres collaborateurs voient les réglages sans les changer).

var routinesEtat = null;
var routinesJournal = [];

// ---- Pures ----

// Pure : le pourcentage d'acceptation, « 92 % » ou « — ».
function pourcentageAcceptation(taux) {
  return taux == null ? '—' : `${Math.round(taux * 100)} %`;
}

// Pure : la ligne de statistiques d'une routine (« 12 propositions · 92 % acceptées · 2 à décider »).
function texteStatsRoutine(s) {
  if (!s || !s.total) return 'Pas encore de proposition';
  const morceaux = [`${s.total} proposition${s.total > 1 ? 's' : ''}`];
  if (s.decidees) morceaux.push(`${pourcentageAcceptation(s.taux)} acceptée${s.taux != null && Math.round(s.taux * 100) > 1 ? 's' : ''}`);
  if (s.aTraiter) morceaux.push(`${s.aTraiter} à décider`);
  return morceaux.join(' · ');
}

// Pure : le prochain passage des routines horaires — « aujourd'hui à 9 h 30 », « demain à 9 h 30 », « lundi à 9 h 30 » (jours ouvrés seulement).
function prochainPassageRoutines(heure, maintenant) {
  const m = /^(\d{2}):(\d{2})$/.exec(heure || '');
  if (!m) return '';
  const base = maintenant ? new Date(maintenant.getTime()) : new Date();
  const cible = new Date(base.getTime());
  cible.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (cible.getTime() <= base.getTime()) cible.setDate(cible.getDate() + 1);
  while (cible.getDay() === 0 || cible.getDay() === 6) cible.setDate(cible.getDate() + 1);
  const debut = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const jours = Math.round((new Date(cible.getFullYear(), cible.getMonth(), cible.getDate()) - debut) / 86400000);
  const quand = jours === 0 ? 'aujourd’hui' : (jours === 1 ? 'demain' : cible.toLocaleDateString('fr-FR', { weekday: 'long' }));
  return `${quand} à ${Number(m[1])} h${m[2] === '00' ? '' : ' ' + m[2]}`;
}

// Pure : la part du plafond mensuel dépensée, 0 à 100.
function partPlafondRoutines(usage, plafond) {
  if (!plafond || plafond <= 0) return usage && usage.euros > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((usage && usage.euros) || 0) / plafond * 100)));
}

// Pure : les niveaux qu'un geste accepte, 1 jusqu'à son maximum.
function niveauxPossiblesGeste(geste) {
  return [1, 2, 3].filter(n => n <= (geste ? geste.niveauMax : 1));
}

// Pure : le niveau en vigueur d'un geste d'après les réglages (celui du geste, sinon celui de la routine, jamais au-dessus du maximum).
function niveauGesteReglages(reglages, routine, geste) {
  const s = reglages && reglages.routines && reglages.routines[routine.id];
  const propre = s && s.gestes && s.gestes[geste.cle];
  return Math.min(geste.niveauMax, Math.max(1, Number(propre || (s && s.niveau) || 1)));
}

// ---- Rendu ----

function boutonsNiveau(niveaux, courant, onclickPour, desactive, titres) {
  return `<wa-button-group>${[1, 2, 3].map(n => {
    const permis = niveaux.includes(n);
    return `<wa-button appearance="outlined" size="s" class="vue-bascule-btn${n === courant ? ' actif' : ''}" type="button" ${permis && !desactive(n) ? `onclick="${onclickPour(n)}"` : 'disabled'} title="${escapeAttr(!permis ? 'Niveau non prévu pour ce geste' : (desactive(n) ? 'Réservé à l’administrateur' : titres[n]))}">${n}</wa-button>`;
  }).join('')}</wa-button-group>`;
}

function renderGesteRoutine(routine, geste, reglages, admin) {
  const niveau = niveauGesteReglages(reglages, routine, geste);
  const idJs = escapeOnclickArg(routine.id);
  const cle = escapeOnclickArg(geste.cle);
  const niveaux = niveauxPossiblesGeste(geste);
  return `<div class="rt-geste">
    <div class="rt-geste-texte"><span class="rt-geste-nom">${escapeHtml(geste.libelle)}</span>${geste.sensible ? `<span class="rt-sensible" title="Ce geste agit vers l’extérieur : le niveau 3 n’est à accorder qu’après une période d’essai.">${icone('shield')}Vers l’extérieur</span>` : ''}</div>
    ${boutonsNiveau(niveaux, niveau, n => `choisirNiveauGeste('${idJs}', '${cle}', ${n})`, n => n === 3 && !admin, { 1: 'Proposer', 2: 'Agir en réversible', 3: 'Agir seule' })}
  </div>`;
}

function renderRoutineReglages(routine, etat, admin) {
  const reglages = etat.reglages;
  const s = (reglages.routines && reglages.routines[routine.id]) || { actif: false, niveau: 1 };
  const idJs = escapeOnclickArg(routine.id);
  const stats = routine.stats || { total: 0 };
  const niveauMax = routine.gestes.reduce((m, g) => Math.max(m, g.niveauMax), 1);
  const niveaux = [1, 2, 3].filter(n => n <= niveauMax);
  const promotion = stats.promotionPossible && s.niveau < niveauMax
    ? `<div class="rt-promotion">${icone('sparkle')}<span>${pourcentageAcceptation(stats.taux)} acceptées sur ${stats.decidees} propositions : CLAIRE peut passer au niveau ${s.niveau + 1}.</span>
        <wa-button variant="brand" size="s" type="button" ${admin || s.niveau + 1 < 3 ? `onclick="choisirNiveauRoutine('${idJs}', ${s.niveau + 1})"` : 'disabled'}>Passer au niveau ${s.niveau + 1}</wa-button></div>` : '';
  const badge = routine.disponible ? '<span class="rt-badge rt-badge-ok">Disponible</span>' : `<span class="rt-badge">Phase ${routine.phase} · bientôt</span>`;
  const essai = routine.id === 'essai'
    ? `<wa-button variant="brand" size="s" type="button" onclick="lancerRoutineEssai()">${icone('boite-claire')}Déposer des exemples dans ma boîte</wa-button>` : '';
  return `<article class="rt-routine${routine.disponible ? '' : ' rt-a-venir'}${s.actif ? ' rt-allumee' : ''}" data-routine="${escapeAttr(routine.id)}">
    <header class="rt-routine-tete">
      <span class="rt-routine-icone" aria-hidden="true">${icone(routine.icone || 'sparkle')}</span>
      <div class="rt-routine-titre"><h4>${escapeHtml(routine.nom)}</h4><p>${escapeHtml(routine.description)}</p></div>
      <div class="rt-routine-droite">${badge}
        ${routine.id === 'essai' ? '' : `<wa-switch ${s.actif ? 'checked' : ''} ${routine.disponible && admin ? '' : 'disabled'} onchange="basculerRoutine('${idJs}', this.checked)" aria-label="Allumer la routine ${escapeAttr(routine.nom)}"></wa-switch>`}</div>
    </header>
    <div class="rt-routine-infos">
      <span class="rt-info">${icone('clock')}${escapeHtml(routine.declencheur)}</span>
      ${routine.ia ? `<span class="rt-info">${icone('sparkle')}Rédaction par l’IA en ligne</span>` : ''}
      <span class="rt-info rt-stats">${escapeHtml(texteStatsRoutine(stats))}</span>
    </div>
    ${promotion}
    <div class="rt-autonomie">
      <div class="rt-autonomie-texte"><strong>Autonomie</strong><span>${escapeHtml(((etat.niveaux || []).find(n => n.niveau === s.niveau) || {}).court || '')}</span></div>
      ${niveaux.length > 1 ? boutonsNiveau(niveaux, s.niveau, n => `choisirNiveauRoutine('${idJs}', ${n})`, n => n === 3 && !admin, { 1: 'Proposer', 2: 'Agir en réversible', 3: 'Agir seule' }) : '<span class="rt-niveau-fixe">Niveau 1 · Proposer</span>'}
    </div>
    ${routine.gestes.length > 1 || niveauMax > 1 ? `<wa-details summary="Régler geste par geste" class="rt-gestes">${routine.gestes.map(g => renderGesteRoutine(routine, g, reglages, admin)).join('')}</wa-details>` : ''}
    ${essai ? `<div class="rt-routine-pied">${essai}</div>` : ''}
  </article>`;
}

function renderReglagesRoutines() {
  const zone = document.getElementById('routines-contenu');
  if (!zone) return;
  if (!routinesEtat) { zone.innerHTML = '<p class="vide">Chargement des routines…</p>'; return; }
  const e = routinesEtat;
  const r = e.reglages;
  const admin = estAdministrateur(utilisateurPoste);
  const part = partPlafondRoutines(e.usage, r.plafondEuros);
  const euros = (n) => formaterMontantEuros(n);
  const niveaux = (e.niveaux || []).map(n => `<div class="rt-niveau rt-niveau-${n.niveau}"><span class="rt-niveau-num">${n.niveau}</span><div><strong>${escapeHtml(n.nom)}</strong><span>${escapeHtml(n.detail)}</span></div></div>`).join('');
  zone.innerHTML = `
    <div class="rt-hero">
      <div class="rt-hero-id">
        <span class="rt-avatar" aria-hidden="true">${icone('sparkle')}</span>
        <div><h3>CLAIRE, quatrième collaboratrice</h3>
          <p>Elle prépare le travail prévisible — brouillons, documents, tâches — et le dépose dans votre boîte de propositions. Vous décidez ; rien ne part sans votre clic, tant que vous ne lui accordez pas plus.</p></div>
      </div>
      <label class="rt-hero-switch"><span>${r.actif ? 'Routines activées' : 'Routines éteintes'}</span>
        <wa-switch id="rt-actif" ${r.actif ? 'checked' : ''} ${admin ? '' : 'disabled'} onchange="basculerRoutinesGenerales(this.checked)" aria-label="Activer les routines de CLAIRE"></wa-switch></label>
      <div class="rt-hero-etat">
        <span class="rt-chip">${icone('clock')}Prochain passage : ${escapeHtml(prochainPassageRoutines(r.heure))}</span>
        <span class="rt-chip">${icone('sparkle')}IA en ligne ce mois-ci : ${escapeHtml(euros(e.usage.euros))} sur ${escapeHtml(euros(r.plafondEuros))}</span>
        <span class="rt-barre" role="img" aria-label="${part} % du plafond mensuel"><span style="width:${part}%"></span></span>
      </div>
      ${admin ? '' : '<p class="rt-lecture">Lecture seule : l’interrupteur général et le niveau 3 sont réservés à l’administrateur.</p>'}
    </div>

    <div class="reglages-section">
      <h3 class="reglages-section-titre">Les trois niveaux d’autonomie <span class="info-i" tabindex="0" data-info="Réglables routine par routine et geste par geste. Au départ, tout est au niveau 1 : CLAIRE propose, vous décidez."></span></h3>
      <div class="rt-niveaux">${niveaux}</div>
    </div>

    <div class="reglages-section">
      <h3 class="reglages-section-titre">Passage et plafond</h3>
      <div class="reglages-liste">
        <div class="reglages-option">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Heure du passage <span class="info-i" tabindex="0" data-info="Les jours ouvrés. Les routines à événement (création d’un dossier, rendez-vous relevé) partent dans la minute, sans attendre."></span></span></span>
          <input type="time" class="rt-champ" value="${escapeAttr(r.heure)}" ${admin ? '' : 'disabled'} onchange="changerHeureRoutines(this.value)" aria-label="Heure du passage des routines">
        </div>
        <div class="reglages-option">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Résumé Teams <span class="info-i" tabindex="0" data-info="Un seul message par collaborateur et par jour, à l’heure du passage, qui dit ce que CLAIRE a préparé. Jamais une alerte par proposition."></span></span></span>
          <wa-switch class="switch reglages-switch" ${r.teams ? 'checked' : ''} ${admin ? '' : 'disabled'} onchange="basculerResumeTeamsRoutines(this.checked)" aria-label="Résumé Teams"></wa-switch>
        </div>
        <div class="reglages-option">
          <span class="reglages-option-texte"><span class="reglages-option-titre">Plafond mensuel de l’IA en ligne <span class="info-i" tabindex="0" data-info="Les routines qui rédigent avec l’IA s’arrêtent au plafond ; elles repartent le mois suivant. 0 € coupe l’IA."></span></span></span>
          <span class="rt-champ-euro"><input type="number" class="rt-champ" min="0" max="10000" step="5" value="${escapeAttr(String(r.plafondEuros))}" ${admin ? '' : 'disabled'} onchange="changerPlafondRoutines(this.value)" aria-label="Plafond mensuel en euros"><span>€ par mois</span></span>
        </div>
      </div>
    </div>

    <div class="reglages-section">
      <h3 class="reglages-section-titre">Les routines</h3>
      <div class="rt-liste">${(e.catalogue || []).map(routine => renderRoutineReglages(routine, e, admin)).join('')}</div>
    </div>

    <div class="reglages-section">
      <h3 class="reglages-section-titre">Ce que CLAIRE a fait seule</h3>
      ${routinesJournal.length
        ? `<ol class="rt-journal">${routinesJournal.map(j => `<li class="rt-journal-ligne rt-j-${escapeAttr(j.resultat)}"><span class="rt-j-point" aria-hidden="true"></span><span class="rt-j-texte">${escapeHtml(j.texte)}</span><time class="rt-j-quand" datetime="${escapeAttr(j.at)}" title="${escapeAttr(new Date(j.at).toLocaleString('fr-FR'))}">${escapeHtml(ageTexteProposition(j.at))}</time></li>`).join('')}</ol>`
        : '<p class="rt-journal-vide">Rien pour le moment. Chaque tour de CLAIRE s’écrira ici : ce qu’elle a préparé, écarté ou n’a pas pu faire.</p>'}
    </div>`;
}

// ---- Chargement et réglages ----

async function chargerReglagesRoutines() {
  try {
    const [etat, journal] = await Promise.all([fetchAvecAuth('/api/routines'), fetchAvecAuth('/api/routines/journal?limite=40')]);
    if (etat.ok) routinesEtat = await etat.json();
    if (journal.ok) routinesJournal = (await journal.json()).entrees || [];
  } catch (e) { /* serveur injoignable : la page garde ce qu'elle avait */ }
  renderReglagesRoutines();
}

function ouvrirReglagesRoutines() {
  renderReglagesRoutines();
  chargerReglagesRoutines();
}

async function enregistrerReglagesRoutines(corps, message) {
  try {
    const r = await fetchAvecAuth('/api/routines/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, corps, { auteur: utilisateurPoste })) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `HTTP ${r.status}`);
    if (routinesEtat) routinesEtat.reglages = await r.json();
    renderReglagesRoutines();
    if (message) afficherToast(message, 'OK', null);
  } catch (e) {
    afficherToast('Réglage non enregistré : ' + e.message, 'OK', null);
    chargerReglagesRoutines();
  }
}

function routineDuCatalogue(id) {
  return routinesEtat && (routinesEtat.catalogue || []).find(r => r.id === id);
}

function basculerRoutinesGenerales(coche) {
  enregistrerReglagesRoutines({ actif: !!coche }, coche ? 'Routines activées.' : 'Routines éteintes : plus aucun passage ni résumé.');
}

function basculerResumeTeamsRoutines(coche) {
  enregistrerReglagesRoutines({ teams: !!coche }, coche ? 'Résumé Teams activé.' : 'Résumé Teams coupé.');
}

function changerHeureRoutines(valeur) {
  if (/^\d{2}:\d{2}$/.test(valeur || '')) enregistrerReglagesRoutines({ heure: valeur }, 'Heure du passage enregistrée.');
}

function changerPlafondRoutines(valeur) {
  const n = Number(String(valeur).replace(',', '.'));
  if (Number.isFinite(n) && n >= 0) enregistrerReglagesRoutines({ plafondEuros: n }, n === 0 ? 'IA en ligne coupée pour les routines.' : 'Plafond enregistré.');
}

function basculerRoutine(id, coche) {
  const r = routineDuCatalogue(id);
  enregistrerReglagesRoutines({ routines: { [id]: { actif: !!coche } } }, `${r ? r.nom : 'Routine'} ${coche ? 'allumée' : 'éteinte'}.`);
}

// Un niveau 3 se CONFIRME : la fenêtre dit ce que CLAIRE fera seule. Les autres niveaux s'enregistrent aussitôt.
function demanderNiveau3(nomGeste, surConfirme) {
  demanderConfirmation(`Accorder le niveau 3 à « ${nomGeste} » ? CLAIRE fera et enverra seule, sans votre clic, vers l’extérieur (email, agenda). À n’accorder qu’après une période d’essai ; vous pourrez toujours revenir au niveau 1.`, surConfirme, { bouton: 'Accorder le niveau 3', ton: 'valider' });
}

function choisirNiveauRoutine(id, niveau) {
  const r = routineDuCatalogue(id);
  if (!r) return;
  const appliquer = () => enregistrerReglagesRoutines({ routines: { [id]: { niveau, gestes: Object.fromEntries(r.gestes.map(g => [g.cle, Math.min(g.niveauMax, niveau)])) } } }, `${r.nom} : niveau ${niveau}.`);
  if (niveau === 3) demanderNiveau3(r.nom, appliquer); else appliquer();
}

function choisirNiveauGeste(id, cle, niveau) {
  const r = routineDuCatalogue(id);
  const g = r && r.gestes.find(x => x.cle === cle);
  if (!g) return;
  const appliquer = () => enregistrerReglagesRoutines({ routines: { [id]: { gestes: Object.assign({}, (routinesEtat.reglages.routines[id] || {}).gestes, { [cle]: niveau }) } } }, `« ${g.libelle} » : niveau ${niveau}.`);
  if (niveau === 3) demanderNiveau3(g.libelle, appliquer); else appliquer();
}

// « Déposer des exemples dans ma boîte » : la routine d'essai, pour voir à quoi ressemble le travail de CLAIRE.
async function lancerRoutineEssai() {
  try {
    const r = await fetchAvecAuth('/api/routines/essai/lancer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsable: utilisateurPoste }) });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corps.erreur || `HTTP ${r.status}`);
    afficherToast(corps.message, 'Ouvrir « À traiter »', () => { definirOnglet('assistant'); setTimeout(() => ouvrirCanal('@traiter'), 0); });
    chargerPropositionsClaire('a-traiter');
    chargerReglagesRoutines();
  } catch (e) {
    afficherToast('Exemples non déposés : ' + e.message, 'OK', null);
  }
}
