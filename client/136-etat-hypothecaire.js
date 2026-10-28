// Relecture de l'état hypothécaire (étude 27/10 : « la relecture d'un état hypothécaire dans les annexes [d'Authentic] pour vérifier s'il y a
// des inscriptions hypothécaires » ; choix : annexes d'Authentic, alerte sur la fiche + pièces à réclamer + proposition au responsable,
// inscriptions périmées signalées à part ; « les inscriptions seront en rouge » — la rubrique Charge de l'état-réponse ANF).
// « Relire l'état » sur la pièce jointe : le PDF lu dans Authentic (client/133 `blobPieceAuthenticAT`), son texte lu ICI par pdf.js — sans
// IA, sans OCR (les fiches anciennes scannées ne sont que comptées) —, la lecture de commun/etat-hypothecaire.js gardée sur la fiche
// (`d.etatHypothecaire`). Une inscription en cours : alerte, « Décompte de remboursement » et « Accord de mainlevée » par créancier dans la
// checklist (quand l'étude représente le vendeur), message de CLAIRE dans le canal du dossier (compté pour son responsable).

var MAX_PAGES_ETAT = 200;

// Le texte de chaque page (pdf.js, sans OCR) ; `tronque` vrai au-delà de 200 pages (dit, jamais tu).
async function textePagesPdfEtat(blob) {
  if (typeof pdfjsLib === 'undefined') throw new Error('lecteur de PDF indisponible (connexion aux bibliothèques coupée) : rouvrez CLAIRE');
  const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await blob.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
  try {
    const pages = [];
    for (let p = 1; p <= pdf.numPages && p <= MAX_PAGES_ETAT; p++) {
      const page = await pdf.getPage(p);
      const c = await page.getTextContent();
      pages.push(c.items.map(it => it.str).join(' '));
      page.cleanup();
    }
    return { pages, tronque: pdf.numPages > MAX_PAGES_ETAT };
  } finally { pdf.destroy(); }
}

// Pure : les pièces à réclamer pour les inscriptions en cours — une paire par créancier (créancier non lu : une paire « à identifier »).
function piecesEtatHypothecaire(etat) {
  const enCours = inscriptionsEnCours(etat);
  let creanciers = [...new Set(enCours.map(x => x.creancier || ''))];
  // Une paire « à identifier » seulement quand aucun créancier n'a été lu (audit 0.384.0).
  if (creanciers.some(Boolean)) creanciers = creanciers.filter(Boolean);
  return creanciers.flatMap(c => {
    const qui = c ? ` — ${c}` : ' — créancier à identifier';
    return [`Décompte de remboursement${qui}`, `Accord de mainlevée${qui}`];
  });
}

// Pure : la phrase de CLAIRE pour le canal du dossier (courte, comme une collègue).
// Pure : la lecture est-elle complète ? (formalités annoncées retrouvées, pages comprises, PDF lu en entier.)
function lectureEtatComplete(etat) {
  return !!(etat && (!etat.lecture || etat.lecture.complete !== false) && !etat.tronque);
}

function plurielEH(n, mot) { return `${n} ${mot}${n > 1 ? 's' : ''}`; }

function messageEtatHypothecaire(etat) {
  const n = inscriptionsEnCours(etat).length;
  const perimees = ((etat && etat.inscriptions) || []).filter(x => x.etat !== 'en_cours').length;
  const comp = ((etat && etat.chargesComplement) || []).length;
  const attente = (etat && etat.enAttente) || 0;
  // Jamais « aucune inscription » sur une lecture incomplète (audit 0.384.0).
  const tete = n ? `État hypothécaire relu : ${plurielEH(n, 'inscription')} en cours, à purger avant la signature.`
    : !lectureEtatComplete(etat) ? 'État hypothécaire : lecture incomplète, relevé à vérifier par le notaire.'
      : `État hypothécaire relu : aucune inscription en cours dans le relevé des formalités${etat && etat.facesStock ? ' depuis 2002' : ''}.`;
  const suite = [n && !lectureEtatComplete(etat) ? 'lecture incomplète, relevé à vérifier' : '',
    attente ? `${plurielEH(attente, 'formalité')} en attente ou rejetée${attente > 1 ? 's' : ''} à vérifier` : '',
    perimees ? `${perimees} radiée${perimees > 1 ? 's' : ''} ou périmée${perimees > 1 ? 's' : ''}` : '', comp ? `${plurielEH(comp, 'charge')} signalée${comp > 1 ? 's' : ''} dans un complément` : '',
    etat && etat.facesStock ? `${plurielEH(etat.facesStock, 'face')} de fiches anciennes à relire` : ''].filter(Boolean).join(', ');
  return tete + (suite ? ` ${suite.charAt(0).toUpperCase() + suite.slice(1)}.` : '');
}

var relecturesEtatEnCours = new Set();

async function relireEtatHypothecaireAT(dossierId, pjId) {
  const verrou = dossierId + '|' + pjId;
  if (relecturesEtatEnCours.has(verrou)) { afficherToast('La relecture de cet état est déjà en cours.', 'OK', null); return { erreur: 'relecture déjà en cours' }; }
  if (!dossiers.some(x => x.id === dossierId)) return { erreur: 'dossier introuvable' };
  relecturesEtatEnCours.add(verrou);
  afficherToast('CLAIRE ouvre l’état dans Authentic et le relit (une minute environ)…', 'OK', null);
  try {
    const { pages, tronque } = await textePagesPdfEtat(await blobPieceAuthenticAT(dossierId, pjId));
    const etat = Object.assign(analyserEtatHypothecaire(pages, isoAujourdhuiLocal()), { tronque });
    // La fiche relue APRÈS l'attente (piège payé : jamais la copie d'avant l'attente).
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) throw new Error('dossier introuvable');
    if (!etat.anf && !etat.inscriptions.length) throw new Error('ce document n’a pas la forme d’un état-réponse ANF');
    const piece = (((instantanesAuthenticAT[dossierId] || {}).inst || {}).sousDossier || {}).pieces || [];
    const nom = (piece.find(p => p.pjId === pjId) || {}).nom || '';
    d.etatHypothecaire = Object.assign({ luLe: new Date().toISOString(), piece: nom }, etat);
    ajouterHistorique(d, `État hypothécaire relu : ${inscriptionsEnCours(etat).length} inscription(s) en cours`);
    // Pièces à réclamer : seulement quand l'étude représente le vendeur (un confrère du vendeur s'en charge sinon), jamais en double.
    if (inscriptionsEnCours(etat).length && !(typeof confrereRepresenteVendeur === 'function' && confrereRepresenteVendeur(d))) {
      d.piecesPersonnalisees = d.piecesPersonnalisees || [];
      for (const label of piecesEtatHypothecaire(etat)) {
        if (d.piecesPersonnalisees.some(p => p.label === label)) continue;
        d.piecesPersonnalisees.push({ cle: 'perso-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label });
        ajouterHistorique(d, `Pièce ajoutée à la checklist : « ${label} » (état hypothécaire)`);
      }
    }
    sauvegarder(d);
    render();
    // Le message de CLAIRE dans le canal du dossier (compté pour son responsable, 0.383.1) ; un échec est dit.
    try {
      const rc = await fetchAvecAuth(`/api/canaux/${encodeURIComponent('d:' + d.id)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auteur: utilisateurPoste || '', claire: true, texte: messageEtatHypothecaire(etat) }) });
      if (!rc.ok) throw new Error(String(rc.status));
    } catch (err) {
      afficherToast('Message de CLAIRE non déposé dans le canal du dossier : l’état est quand même relu sur la fiche.', 'OK', null);
    }
    noterVerificationPoste('etat-hypothecaire', { detail: `${etat.inscriptions.length} charge(s) lue(s)` });
    afficherToast(messageEtatHypothecaire(etat), 'OK', null);
    return { etat };
  } catch (e) {
    noterVerificationPoste('etat-hypothecaire', { ok: false, message: String((e && e.message) || 'erreur').slice(0, 80) });
    afficherToast('État non relu : ' + (e && e.message ? e.message : 'erreur'), 'OK', null);
    return { erreur: String((e && e.message) || 'erreur').slice(0, 160) };
  } finally {
    relecturesEtatEnCours.delete(verrou);
  }
}

// Le bloc de la fiche (panneau « Authentic ») : les inscriptions en cours en rouge, puis radiées / périmées, les charges des compléments et
// les fiches anciennes à relire.
function htmlEtatHypothecaireFiche(d) {
  const e = d && d.etatHypothecaire;
  if (!e || !Array.isArray(e.inscriptions)) return '';
  const date = (x) => (x ? formatDateFr(x) : '');
  const ligne = (x, classe) => `<li class="eh-ligne ${classe}"><span class="eh-nature">${escapeHtml(x.nature || 'Inscription')}</span>
    <span class="eh-detail">${escapeHtml([x.creancier || 'créancier à vérifier', x.montant, x.dateDepot ? 'déposée le ' + date(x.dateDepot) : '', x.reference,
      x.dateExtremeEffet ? (x.etat === 'perimee' ? 'périmée le ' : 'effet jusqu’au ') + date(x.dateExtremeEffet) : 'date extrême d’effet à vérifier',
      x.etat === 'radiee' ? 'radiée' : x.radiation === 'partielle' ? 'radiation partielle' : '', 'p. ' + x.page].filter(Boolean).join(' · '))}</span></li>`;
  const enCours = e.inscriptions.filter(x => x.etat === 'en_cours');
  const autres = e.inscriptions.filter(x => x.etat !== 'en_cours');
  return `<div class="at-groupe eh-bloc"><div class="at-groupe-titre">État hypothécaire${infoBulle('Relu par CLAIRE dans l’état-réponse ANF' + (e.delivreLe ? ` délivré le ${date(e.delivreLe)}` : '') + ' : rubrique Charge du relevé des formalités (depuis 2002). Les fiches d’avant sont des scans manuscrits que CLAIRE ne lit pas : à relire par le notaire. Assistance : le notaire garde l’analyse juridique.')}</div>
    ${!lectureEtatComplete(e) ? `<p class="eh-alerte">Lecture incomplète${e.lecture && e.lecture.annoncees != null ? ` : ${e.lecture.reconnues} formalité${e.lecture.reconnues > 1 ? 's' : ''} lue${e.lecture.reconnues > 1 ? 's' : ''} sur ${e.lecture.annoncees} annoncée${e.lecture.annoncees > 1 ? 's' : ''}` : ''}${e.tronque ? ' (PDF de plus de 200 pages)' : ''} — relevé à vérifier par le notaire.</p>` : ''}
    ${enCours.length ? `<p class="eh-alerte">${plurielEH(enCours.length, 'inscription')} en cours</p><ul class="at-liste">${enCours.map(x => ligne(x, 'eh-en-cours')).join('')}</ul>`
      : lectureEtatComplete(e) ? `<p class="eh-ok">Aucune inscription en cours dans le relevé des formalités${e.facesStock ? ' depuis 2002' : ''}.</p>` : ''}
    ${autres.length ? `<details class="eh-autres"><summary>${autres.length} radiée${autres.length > 1 ? 's' : ''} ou périmée${autres.length > 1 ? 's' : ''}</summary><ul class="at-liste">${autres.map(x => ligne(x, 'eh-passee')).join('')}</ul></details>` : ''}
    ${(e.chargesComplement || []).length ? `<ul class="at-liste">${e.chargesComplement.map(c => `<li class="eh-ligne eh-complement"><span class="eh-nature">${escapeHtml(c.nature || 'Charge')}</span><span class="eh-detail">${escapeHtml((c.complement || 'charge signalée dans le complément') + ' · p. ' + c.page)}</span></li>`).join('')}</ul>` : ''}
    ${e.enAttente ? `<p class="eh-note">${e.enAttente} formalité${e.enAttente > 1 ? 's' : ''} en attente ou rejetée${e.enAttente > 1 ? 's' : ''} : à vérifier.</p>` : ''}
    ${e.facesStock ? `<p class="eh-note">${plurielEH(e.facesStock, 'face')} de fiches anciennes (avant 2002) à relire par le notaire.</p>` : ''}
  </div>`;
}
