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
  const n = inscriptionsEnCours(etat).length;   // `etat` : les inscriptions du bien vendu seulement (relireEtatHypothecaireAT)
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
    const retirees = (d.etatHypothecaire && Array.isArray(d.etatHypothecaire.retirees)) ? d.etatHypothecaire.retirees : [];
    d.etatHypothecaire = Object.assign({ luLe: new Date().toISOString(), piece: nom, retirees }, etat);
    // Seules les inscriptions du bien vendu comptent (étude 30/10, client/147) : celles d'un autre bien du vendeur sont écartées.
    const etatBien = Object.assign({}, etat, { inscriptions: (() => { const r = inscriptionsDuBien(d); return r.liees.concat(r.aVerifier); })() });
    ajouterHistorique(d, `État hypothécaire relu : ${inscriptionsEnCours(etatBien).length} inscription(s) en cours sur le bien vendu`);
    // Pièces à réclamer : seulement quand l'étude représente le vendeur (un confrère du vendeur s'en charge sinon), jamais en double.
    if (inscriptionsEnCours(etatBien).length && !(typeof confrereRepresenteVendeur === 'function' && confrereRepresenteVendeur(d))) {
      d.piecesPersonnalisees = d.piecesPersonnalisees || [];
      for (const label of piecesEtatHypothecaire(etatBien)) {
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
        body: JSON.stringify({ auteur: utilisateurPoste || '', claire: true, texte: messageEtatHypothecaire(etatBien) }) });
      if (!rc.ok) throw new Error(String(rc.status));
    } catch (err) {
      afficherToast('Message de CLAIRE non déposé dans le canal du dossier : l’état est quand même relu sur la fiche.', 'OK', null);
    }
    noterVerificationPoste('etat-hypothecaire', { detail: `${etat.inscriptions.length} charge(s) lue(s)` });
    afficherToast(messageEtatHypothecaire(etatBien), 'OK', null);
    return { etat: etatBien };
  } catch (e) {
    noterVerificationPoste('etat-hypothecaire', { ok: false, message: String((e && e.message) || 'erreur').slice(0, 80) });
    afficherToast('État non relu : ' + (e && e.message ? e.message : 'erreur'), 'OK', null);
    return { erreur: String((e && e.message) || 'erreur').slice(0, 160) };
  } finally {
    relecturesEtatEnCours.delete(verrou);
  }
}
