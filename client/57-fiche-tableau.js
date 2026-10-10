// Fiche dossier — bandeau du haut, suivi des étapes et tableau « À obtenir · À faire · En attente · Fait » (étude, 10/10).
//
// Tout est CALCULÉ à partir des fonctions que la fiche utilisait déjà (planning, pièces, engagements, gestes de « À faire ») :
// rien n'est enregistré ici, et cocher une carte appelle le geste d'avant (basculerEcheance, validerPieceManuellement,
// basculerEngagementFait, marquerFaitJour…). La fiche n'a donc qu'une seule règle métier, celle du reste de CLAIRE.
//
// Les fonctions `cartes…` et `bandeau…` sont PURES (la date du jour et les gestes du jour sont passés en paramètre) : les tests
// les rejouent sur tous les types de dossier (vente, copropriété, terrain, succession, participation, sans prêt, archivé…).

var COLONNES_TABLEAU_FICHE = [
  { cle: 'obtenir', nom: 'À obtenir', vide: 'Rien à obtenir.' },
  { cle: 'faire', nom: 'À faire', vide: 'Rien à faire pour l’instant.' },
  { cle: 'attente', nom: 'En attente', vide: 'Personne n’est attendu.' },
  { cle: 'fait', nom: 'Fait', vide: 'Rien de fait pour l’instant.' }
];

// Échéances qu'on peut cocher et décocher d'un geste (même liste que la fiche, voir basculerEcheance).
var TYPES_ECHEANCE_COCHABLES_FICHE = ['ventebien', 'pret', 'appelFonds', 'projetEnvoye', 'rendezVousSignature', 'redaction'];
// Étapes attendues d'un tiers (la banque, la mairie, la SAFER, le client) : colonne « En attente ».
var TYPES_ECHEANCE_ATTENTE_FICHE = ['ventebien', 'pret', 'safer', 'dia', 'rendezVousSignature'];
var RE_PIECE_D_UN_TIERS = /pr[ée]emption|safer|\bdia\b|offre/i;

// Pure : l'écart en jours (négatif = dépassé) d'une date ISO, null sans date.
function joursCarteTableau(iso, aujourdhuiIso) {
  return iso ? ecartJours(aujourdhuiIso, iso) : null;
}

// Pure : { obtenir, faire, attente, fait } — les cartes d'un dossier, chacune
//   { cle, titre, sous, iso, jours, gravite, categorie, fait, auto, coche, bouton, onglet }.
// `coche` { onclick, libelle } : le geste de la case ronde (absent = rien à cocher ici : lue dans le NAS, Authentic ou l'agenda) ;
// `bouton` { onclick, libelle, icone } : le geste principal d'une action du jour ; `onglet` : où mène le titre.
// `actions` : les gestes du jour de ce dossier (actionsFicheDossier), passés pour que le calcul reste pur.
function cartesTableauFiche(d, aujourdhuiIso, actions) {
  const colonnes = { obtenir: [], faire: [], attente: [], fait: [] };
  if (!d) return colonnes;
  const figee = !!d.archive;
  const id = escapeOnclickArg(d.id);
  const ajouter = (col, c) => {
    const carte = Object.assign({ cle: '', titre: '', sous: '', iso: '', jours: null, gravite: '', categorie: '', fait: false, auto: false, coche: null, bouton: null, onglet: '' }, c);
    carte.jours = joursCarteTableau(carte.iso, aujourdhuiIso);
    if (!carte.gravite && !carte.fait && carte.jours !== null) carte.gravite = carte.jours < 0 ? 'critique' : (carte.jours <= 3 ? 'vigilance' : '');
    if (figee) { carte.coche = null; carte.bouton = null; }
    colonnes[col].push(carte);
  };
  const etapes = etapesAvancement(d, aujourdhuiIso);
  const gestes = Array.isArray(actions) ? actions : [];
  const succession = estSuccession(d);
  const pieces = d.pieces || {};

  // --- Pièces de la checklist : non reçues → à obtenir (ou en attente d'un tiers), reçues → une carte groupée dans « Fait ».
  let piecesRecues = 0;
  let piecesTotal = 0;
  if (d.roleNotaire !== 'participant') {
    checklistPieces(d.typeVente, d).forEach(p => {
      piecesTotal++;
      if (pieces[p.cle] === 'recue') { piecesRecues++; return; }
      const manquante = pieces[p.cle] === 'manquante';
      ajouter(RE_PIECE_D_UN_TIERS.test(p.label || '') ? 'attente' : 'obtenir', {
        cle: 'piece:' + p.cle, titre: p.label, categorie: 'piece', onglet: 'pieces',
        sous: manquante ? 'Pas trouvée sur le NAS' : 'Pas encore vérifiée',
        coche: { onclick: `validerPieceManuellement('${id}', '${escapeOnclickArg(p.cle)}', '${escapeOnclickArg(p.label)}')`, libelle: 'Marquer reçue' }
      });
    });
    // --- Analyse de l'avant-contrat : engagements du vendeur et documents hors checklist.
    const analyse = d.analyseJuridique || {};
    let engagementsFaits = 0;
    (analyse.engagements || []).forEach((e, i) => {
      if (etatEngagementAnalyse(d, e).fait) { engagementsFaits++; return; }
      ajouter('obtenir', {
        cle: 'engagement:' + i, titre: 'Engagement : ' + libelleCourtEngagement(e), categorie: 'engagement', onglet: 'pieces',
        coche: { onclick: `basculerEngagementFait('${id}', ${i})`, libelle: 'Marquer réalisé' }
      });
    });
    (analyse.documents || []).forEach((doc, i) => {
      if (cleChecklistDocumentAnalyse(d, doc) || documentAnalyseRecu(d, doc)) return;
      ajouter('obtenir', {
        cle: 'document:' + i, titre: typeof doc === 'string' ? doc : doc.label, categorie: 'piece', onglet: 'pieces',
        coche: { onclick: `basculerDocumentAnalyseRecu('${id}', ${i})`, libelle: 'Marquer reçu' }
      });
    });
    if (piecesRecues) ajouter('fait', { cle: 'pieces-recues', titre: piecesRecues === 1 ? '1 pièce reçue' : `${piecesRecues} pièces reçues`, sous: `sur ${piecesTotal}`, categorie: 'piece', fait: true, auto: true, onglet: 'pieces' });
    if (engagementsFaits) ajouter('fait', { cle: 'engagements-faits', titre: engagementsFaits === 1 ? '1 engagement réalisé' : `${engagementsFaits} engagements réalisés`, categorie: 'engagement', fait: true, auto: true, onglet: 'pieces' });
  }

  // --- Gestes du jour (les mêmes que « À faire ») : un bouton pour le geste, la case pour « déjà fait ».
  gestes.forEach(a => {
    const cle = escapeOnclickArg(a.cle);
    const sansGeste = !a.geste || a.geste.type === 'fiche';
    ajouter('faire', {
      cle: 'action:' + a.cle, titre: a.titre, sous: delaiAction(a), categorie: a.categorie || '', gravite: a.gravite === 'critique' ? 'critique' : (a.gravite === 'vigilance' ? 'vigilance' : ''),
      coche: { onclick: `marquerFaitJour('${cle}')`, libelle: 'Déjà fait — valider à la main' },
      bouton: sansGeste ? null : { onclick: `executerActionJour('${cle}')`, libelle: libelleCourtGeste(a), icone: iconeGeste(a), titre: a.bouton || '' }
    });
  });

  // --- Échéances du planning encore ouvertes : celles qu'on attend d'un tiers vont en attente, les autres à faire — sauf si un geste
  // du jour les couvre déjà (même étape), pour ne jamais les montrer deux fois.
  echeancesPlanning(d).forEach(it => {
    const cle = it.type === 'autre' ? 'autre-' + it.index : it.type;
    const attente = TYPES_ECHEANCE_ATTENTE_FICHE.includes(it.type);
    if (!attente && it.type !== 'autre' && gestes.some(a => actionLieeEtape(a, it.type))) return;
    ajouter(attente ? 'attente' : 'faire', {
      cle: 'echeance:' + cle, titre: it.label, iso: it.iso || '', categorie: it.type === 'autre' ? 'autre' : it.type,
      sous: it.iso ? formatDateFr(it.iso) : '', onglet: it.type === 'safer' || it.type === 'dia' ? 'pieces' : '',
      coche: it.type === 'autre' || TYPES_ECHEANCE_COCHABLES_FICHE.includes(it.type) ? { onclick: `basculerEcheance('${id}', '${escapeOnclickArg(cle)}')`, libelle: 'Marquer fait' } : null
    });
  });

  // --- Fait : les étapes déjà passées (on peut décocher celles qui se cochent), puis les échéances ajoutées à la main et cochées.
  etapes.filter(e => e.fait).forEach(e => {
    const cochable = ['ventebien', 'pret', 'appelFonds', 'projetEnvoye'].includes(e.type);
    ajouter('fait', {
      cle: 'etape:' + e.type, titre: e.type === 'fixerRdv' ? 'Rendez-vous de signature placé' : (e.type === 'signature' ? 'Acte signé' : e.label),
      iso: e.iso || '', sous: e.iso ? formatDateFr(e.iso) : '', categorie: e.type, fait: true, auto: !cochable,
      coche: cochable ? { onclick: `basculerEcheance('${id}', '${escapeOnclickArg(e.type)}')`, libelle: 'Rouvrir' } : null
    });
  });
  if (!succession && echeanceValidee(d, 'redaction')) {
    ajouter('fait', { cle: 'etape:redaction', titre: 'Rédaction de l’acte', categorie: 'redaction', fait: true, coche: { onclick: `basculerEcheance('${id}', 'redaction')`, libelle: 'Rouvrir' } });
  }
  (d.autres || []).forEach((a, i) => {
    if (!echeanceValidee(d, 'autre-' + i)) return;
    ajouter('fait', { cle: 'echeance:autre-' + i, titre: a.label, iso: a.date || '', sous: a.date ? formatDateFr(a.date) : '', categorie: 'autre', fait: true, coche: { onclick: `basculerEcheance('${id}', 'autre-${i}')`, libelle: 'Rouvrir' } });
  });

  // Ordre : à faire — les gestes du jour d'abord (déjà triés par urgence), puis les échéances par date ; les autres colonnes par date,
  // les cartes sans date après. Le tri est stable : à date égale, l'ordre de construction reste.
  const parDate = (a, b) => (a.jours === null) - (b.jours === null) || (a.jours - b.jours) || 0;
  colonnes.obtenir.sort(parDate);
  colonnes.attente.sort(parDate);
  colonnes.faire = colonnes.faire.filter(c => c.cle.startsWith('action:')).concat(colonnes.faire.filter(c => !c.cle.startsWith('action:')).sort(parDate));
  colonnes.fait.sort((a, b) => (b.jours === null) - (a.jours === null) || (b.jours || 0) - (a.jours || 0));
  return colonnes;
}

// Pure : de quoi dessiner le bandeau du haut — { pieces, signature, maintenant, archive }.
//   pieces : { recues, total, pct, libelle } (sans checklist — participation —, l'avancement général) ;
//   signature : { etat: 'signe' | 'placee' | 'passee' | 'aplacer', iso, jours, heure, texte, proba } ;
//   maintenant : { type: 'action' | 'etape' | 'rien' | 'archive', … } — le geste du moment.
// `probabilite` : le résultat de probabiliteTenueSignature (ou null), passé pour garder la fonction pure.
function bandeauFiche(d, aujourdhuiIso, actions, probabilite) {
  const av = avancementDossier(d, aujourdhuiIso);
  const pieces = av.piecesTotal
    ? { recues: av.piecesRecues, total: av.piecesTotal, pct: Math.round(100 * av.piecesRecues / av.piecesTotal), libelle: 'Pièces' }
    : { recues: 0, total: 0, pct: av.pct, libelle: 'Avancement' };
  const signe = signatureFaiteSuivi(d);
  let signature;
  if (signe) signature = { etat: 'signe', iso: signe.iso || d.rendezVousSignature || '', jours: null, heure: '', texte: texteSigneSuivi(signe), proba: null };
  else if (d.rendezVousSignature) {
    const j = ecartJours(aujourdhuiIso, d.rendezVousSignature);
    signature = { etat: j !== null && j < 0 ? 'passee' : 'placee', iso: d.rendezVousSignature, jours: j, heure: d.rendezVousSignatureHeure || '', texte: '', proba: probabilite || null };
  } else {
    const p = signaturePrevueDossier(d, aujourdhuiIso);
    signature = { etat: 'aplacer', iso: p ? p.date : '', jours: null, heure: '', texte: '', proba: null };
  }
  let maintenant;
  if (d.archive) maintenant = { type: 'archive' };
  else if (actions && actions.length) {
    const a = actions[0];
    maintenant = { type: 'action', cle: a.cle, titre: a.titre, contexte: a.contexte || '', delai: delaiAction(a), categorie: a.categorie || '', gravite: a.gravite || '', sansGeste: !a.geste || a.geste.type === 'fiche', libelleGeste: libelleCourtGeste(a), iconeGeste: iconeGeste(a), titreGeste: a.bouton || '' };
  } else {
    const p = prochaineEcheanceDetail(d);
    maintenant = p ? { type: 'etape', titre: p.label, iso: p.iso, jours: p.jours, categorie: p.type } : { type: 'rien' };
  }
  return { pieces, signature, maintenant };
}

// ---- Rendu ----

function classeDelaiCarteFiche(c) {
  if (c.fait) return 'fini';
  if (c.jours === null) return '';
  return c.jours < 0 ? 'retard' : (c.jours <= 3 ? 'bientot' : '');
}

function renderCarteTableauFiche(c) {
  const rond = c.coche
    ? `<button type="button" class="tf-rond${c.fait ? ' on' : ''}" onclick="${c.coche.onclick}" aria-label="${escapeAttr(c.coche.libelle + ' : ' + c.titre)}" title="${escapeAttr(c.coche.libelle)}">${icone('check')}</button>`
    : `<span class="tf-rond tf-rond-auto" title="${escapeAttr(c.auto ? 'Lu automatiquement' : 'Se met à jour tout seul')}" aria-hidden="true">${icone(c.fait ? 'check' : 'clock')}</span>`;
  const titre = c.onglet
    ? `<button type="button" class="tf-titre tf-lien" onclick="definirOngletFiche('${c.onglet}')">${escapeHtml(c.titre)}</button>`
    : `<span class="tf-titre">${escapeHtml(c.titre)}</span>`;
  let delai = '';
  if (c.jours !== null) delai = `<span class="tf-delai ${classeDelaiCarteFiche(c)}">${icone('clock')}${escapeHtml(c.fait ? formatDateFr(c.iso) : libelleDelaiJour(c.jours))}</span>`;
  const sous = c.sous && !(c.jours !== null && c.sous === formatDateFr(c.iso)) ? `<span class="tf-sous">${escapeHtml(c.sous)}</span>` : '';
  const geste = c.bouton
    ? `<wa-button appearance="outlined" size="s" type="button" class="tf-geste" onclick="${c.bouton.onclick}" title="${escapeAttr(c.bouton.titre)}">${c.bouton.icone}${escapeHtml(c.bouton.libelle)}</wa-button>`
    : '';
  const date = c.jours !== null && !c.fait ? `<span class="tf-date">${escapeHtml(formatDateFr(c.iso))}</span>` : '';
  return `<article class="tf-carte${c.fait ? ' fait' : ''}${c.gravite ? ' ' + c.gravite : ''}" data-cle="${escapeAttr(c.cle)}">
    <div class="tf-ligne">${rond}${titre}</div>
    ${delai || sous || date ? `<div class="tf-meta">${delai}${date}${sous}</div>` : ''}
    ${geste}
  </article>`;
}

function renderTableauFiche(d, actions) {
  const cartes = cartesTableauFiche(d, isoAujourdhuiLocal(), actions);
  return `<div class="tf-tableau" role="list" aria-label="Le dossier en colonnes">${COLONNES_TABLEAU_FICHE.map(col => {
    const liste = cartes[col.cle];
    return `<section class="tf-colonne" role="listitem" data-colonne="${col.cle}" aria-label="${escapeAttr(col.nom)}">
      <header class="tf-colonne-tete"><h3>${escapeHtml(col.nom)}</h3><span class="tf-nb">${liste.length}</span></header>
      <div class="tf-cartes">${liste.length ? liste.map(renderCarteTableauFiche).join('') : `<p class="tf-vide">${escapeHtml(col.vide)}</p>`}</div>
    </section>`;
  }).join('')}</div>`;
}

// Le bandeau du haut : les pièces, la signature, le geste du moment.
function renderBandeauFiche(d, actions) {
  const auj = isoAujourdhuiLocal();
  const proba = d.rendezVousSignature ? probabiliteTenueSignature(d, auj, absencesOffice) : null;
  const b = bandeauFiche(d, auj, actions, proba);
  const p = b.pieces;
  const anneau = `<div class="fb-anneau" role="img" aria-label="${escapeAttr(p.libelle + ' : ' + p.pct + ' %')}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="fb-fond" cx="60" cy="60" r="50" pathLength="100"></circle><circle class="fb-val" cx="60" cy="60" r="50" pathLength="100" style="stroke-dasharray:${p.pct} 100"></circle></svg><span class="fb-pct">${p.pct}%</span></div>`;
  const cartePieces = `<div class="fb-carte fb-pieces">${anneau}<div class="fb-texte"><span class="section-eyebrow">${escapeHtml(p.libelle)}</span>${p.total ? `<strong class="fb-grand">${p.recues} sur ${p.total}</strong><span class="fb-petit">${p.total - p.recues ? 'Plus que ' + (p.total - p.recues) + ' à obtenir' : 'Toutes les pièces sont là'}</span>` : `<span class="fb-petit">Étapes franchies</span>`}</div></div>`;
  const s = b.signature;
  let sigCorps;
  if (s.etat === 'signe') sigCorps = `<strong class="fb-grand fb-ok">${escapeHtml(s.texte)}</strong>`;
  else if (s.etat === 'placee') {
    sigCorps = `<div class="fb-sig-ligne"><span class="fb-jours">${s.jours === 0 ? 'Auj.' : s.jours}</span>${s.jours === 0 ? '' : `<small>jour${s.jours > 1 ? 's' : ''}</small>`}<span class="fb-sig-date"><strong>${escapeHtml(formatDateFr(s.iso))}${s.heure ? ', ' + escapeHtml(String(s.heure).replace(':', ' h ').replace(/ h 00$/, ' h')) : ''}</strong>${renderPastilleProbabilite(s.proba)}</span></div>`;
  } else if (s.etat === 'passee') sigCorps = `<strong class="fb-grand fb-retard">Date passée</strong><span class="fb-petit">${escapeHtml(formatDateFr(s.iso))} · à marquer signée ou à déplacer</span>`;
  else sigCorps = `<strong class="fb-grand">À placer</strong><span class="fb-petit">${s.iso ? 'Au plus tôt le ' + escapeHtml(formatDateFr(s.iso)) : 'Pas encore de date'}</span>`;
  const carteSignature = `<div class="fb-carte fb-signature"><span class="section-eyebrow">Signature</span>${sigCorps}</div>`;
  const m = b.maintenant;
  let corpsMaintenant;
  if (m.type === 'action') {
    const cle = escapeOnclickArg(m.cle);
    corpsMaintenant = `<div class="fb-ligne-titre"><strong class="fb-titre">${escapeHtml(m.titre)}</strong>
        <span class="fb-gestes">${m.sansGeste ? '' : `<wa-button variant="brand" size="s" type="button" onclick="executerActionJour('${cle}')" title="${escapeAttr(m.titreGeste)}">${m.iconeGeste}${escapeHtml(m.libelleGeste)}</wa-button>`}
        <wa-button appearance="outlined" size="s" type="button" onclick="marquerFaitJour('${cle}')">Déjà fait</wa-button></span></div>
      <span class="fb-petit fb-une-ligne" title="${escapeAttr(m.contexte)}">${escapeHtml(m.delai ? m.delai + ' · ' + m.contexte : m.contexte)}</span>`;
  } else if (m.type === 'etape') {
    corpsMaintenant = `<strong class="fb-titre">${escapeHtml(m.titre)}</strong><span class="fb-petit">${escapeHtml(formatDateFr(m.iso))} · ${escapeHtml(libelleDelaiJour(m.jours))}</span>`;
  } else if (m.type === 'archive') corpsMaintenant = '<strong class="fb-titre">Dossier archivé</strong><span class="fb-petit">Plus rien à faire.</span>';
  else corpsMaintenant = '<strong class="fb-titre">Rien à faire pour le moment</strong><span class="fb-petit">On attend les pièces et la signature.</span>';
  const titreCarte = m.type === 'etape' ? 'Prochaine étape' : 'À faire maintenant';
  const carteMaintenant = `<div class="fb-carte fb-maintenant"><span class="section-eyebrow">${titreCarte}</span>${corpsMaintenant}</div>`;
  return `<div class="fb-bandeau">${cartePieces}${carteSignature}${carteMaintenant}</div>`;
}

// Le suivi des étapes, en bande : les étapes qui s'appliquent au dossier, la prochaine en couleur, une barre en segments en pied.
function renderSuiviEtapesFiche(etapes, prochaineEtape, avancement) {
  if (!etapes.length) return '';
  const detail = [`${avancement.etapesFaites}/${avancement.etapesTotal} étapes`];
  if (avancement.piecesTotal) detail.push(`${avancement.piecesRecues}/${avancement.piecesTotal} pièces`);
  return `<section class="fb-etapes" aria-label="Suivi des étapes">
    <div class="fb-etapes-tete"><span class="section-eyebrow">Avancement</span><span class="fb-petit">${escapeHtml(detail.join(' · '))}</span><strong class="fb-pct-etapes">${avancement.pct} %</strong></div>
    <ol class="fb-etapes-liste">${etapes.map(e => {
      const etat = e.fait ? 'fait' : (e === prochaineEtape ? 'encours' : 'afaire');
      return `<li class="fb-etape ${etat}"><span class="fb-etape-marque">${e.fait ? icone('check') : ''}</span><span class="fb-etape-libelle">${escapeHtml(e.label)}</span><span class="fb-etape-date">${e.iso ? formatDateFr(e.iso) : '—'}</span></li>`;
    }).join('')}</ol>
    <div class="fb-segments" role="img" aria-label="Avancement : ${escapeAttr(detail.join(', '))}">${etapes.map(e => `<span class="${e.fait ? 'fait' : (e === prochaineEtape ? 'encours' : '')}" title="${escapeAttr(e.label)}"></span>`).join('')}</div>
  </section>`;
}
