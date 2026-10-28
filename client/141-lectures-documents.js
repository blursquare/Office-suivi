// ==== Lectures automatiques de documents (étude 28/10) ====
//
// « Lorsque Claire détecte un acte de naissance dans Authentic ou sur le NAS, qu'elle le lise pour nous dire s'il y a une mention au
// répertoire civil ; qu'elle nous dise s'il y a une inscription hypothécaire sur un EHF ; s'il y a des travaux votés dans un procès-verbal
// d'assemblée générale d'une copropriété (à lire sur le NAS). Elle nous le dit dans la discussion du dossier. »
//
// Le POSTE lit (pdf.js, OCR des pages scannées : les mêmes lecteurs que « Demander à CLAIRE ») ; rien ne part à une IA : tout est du code.
// Un document est lu UNE fois (`d.lecturesDocuments[cle]`, gardé sur la fiche et partagé entre les postes) ; seuls les fichiers du NAS
// modifiés depuis 30 jours sont pris (jamais tout l'historique d'un coup dans les discussions) ; un document à la fois sur ce poste.
// Le résultat est un message de CLAIRE dans la discussion du dossier, et reste sur la fiche.

var JOURS_LECTURES_DOCUMENTS = 30;
var MAX_PAGES_LECTURE_DOCUMENT = 30;
var MAX_PAGES_OCR_LECTURE_DOCUMENT = 6;
var INTERVALLE_LECTURES_DOSSIER_MS = 30 * 60 * 1000;
var fileLecturesDocuments = Promise.resolve();
var lecturesDocumentsVues = {};   // dossier → dernière planification (ms), sur ce poste

// Pure : la sorte d'un document d'après son NOM (jamais le contenu, règle des pièces) — '' s'il n'est pas à lire.
// `copropriete` : un PV d'AG n'est lu que pour une vente en copropriété.
function sorteDocumentALire(nom, copropriete) {
  const n = String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_-]+/g, ' ');
  if (!/\.pdf$/.test(n)) return '';
  if (/naissance/.test(n) && !/(date|lieu) de naissance/.test(n)) return 'naissance';
  if (/(^|[^a-z])ehf([^a-z]|$)|hors\s*formalite|etat\s*hypoth|renseignements?\s*hypoth/.test(n)) return 'ehf';
  if (copropriete && (/proces\s*verbal|(^|[^a-z])pv([^a-z]|$)/.test(n) && /(^|[^a-z])a\s?g([^a-z]|$)|assemblee|ago|age/.test(n) || /assemblee\s*generale/.test(n))) return 'pv-ag';
  return '';
}

// Pure : les mentions au répertoire civil d'un acte de naissance. Une mention cite le « répertoire civil » ou « RC n° … » (jamais « RCS ») ;
// sa nature est lue autour (tutelle, curatelle, sauvegarde de justice, habilitation familiale, mandat de protection future, régime
// matrimonial, présomption d'absence). Rend { acteNaissance, mentions: [{ nature, extrait }] }.
var NATURES_MENTION_RC = [
  [/curatelle/i, 'curatelle'], [/tutelle/i, 'tutelle'], [/sauvegarde de justice/i, 'sauvegarde de justice'],
  [/habilitation familiale/i, 'habilitation familiale'], [/mandat de protection future/i, 'mandat de protection future'],
  [/r[ée]gime matrimonial|changement de r[ée]gime/i, 'changement de régime matrimonial'], [/absence/i, 'présomption d’absence']
];
function mentionsRepertoireCivil(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ');
  const re = /r[ée]pertoire\s+civil|(?:^|[^A-Za-z])R\.?\s?C\.?\s*(?:A\.?\s*)?(?:n[°ºo]\.?|num[ée]ro)\s*\S+/gi;
  const mentions = [];
  let m;
  while ((m = re.exec(t)) !== null && mentions.length < 5) {
    const debut = Math.max(0, m.index - 160);
    const extrait = t.slice(debut, Math.min(t.length, m.index + m[0].length + 160)).trim();
    const nature = (NATURES_MENTION_RC.find(([r]) => r.test(extrait)) || [null, 'mesure ou mention à lire'])[1];
    if (!mentions.some(x => x.extrait === extrait)) mentions.push({ nature, extrait: extrait.slice(0, 340) });
  }
  return { acteNaissance: /acte de naissance|extrait d.acte de naissance|copie int[ée]grale/i.test(t), mentions };
}

// Pure : les travaux votés dans un PV d'assemblée générale — une résolution qui parle de travaux et qui est adoptée (jamais rejetée, ajournée
// ni « non adoptée »). Rend { date, resolutions: [{ numero, intitule, montant }], lu }.
function travauxVotesPv(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ');
  const dateAg = (() => {
    const m = /assembl[ée]e\s+g[ée]n[ée]rale[^.]{0,80}?(?:du|le|tenue le)\s+(\d{1,2})[/.](\d{1,2})[/.](\d{4})/i.exec(t.slice(0, 4000));
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  })();
  const coupes = t.split(/(?=r[ée]solution\s*(?:n[°ºo]\.?\s*)?\d{1,3}\b)/i).filter(x => /^r[ée]solution/i.test(x));
  const resolutions = [];
  for (const bloc of coupes) {
    const morceau = bloc.slice(0, 2500);
    if (!/travaux/i.test(morceau)) continue;
    const adoptee = /(?:est|a\s+[ée]t[ée])\s+adopt[ée]e|adopt[ée]e\s+(?:[àa]\s+la\s+majorit|[àa]\s+l.unanimit)|r[ée]solution\s+adopt[ée]e|approuv[ée]e|vot[ée]e\s+[àa]\s+la/i.test(morceau);
    const rejetee = /rejet[ée]e|non\s+adopt[ée]e|n.est\s+pas\s+adopt[ée]e|n.a\s+pas\s+[ée]t[ée]\s+adopt[ée]e|refus[ée]e|ajourn[ée]e|sans\s+objet/i.test(morceau);
    if (!adoptee || rejetee) continue;
    const numero = (/r[ée]solution\s*(?:n[°ºo]\.?\s*)?(\d{1,3})/i.exec(morceau) || [])[1] || '';
    const intitule = morceau.replace(/^r[ée]solution\s*(?:n[°ºo]\.?\s*)?\d{1,3}\s*[:.\-–—]?\s*/i, '').slice(0, 140).trim();
    const montant = (/(\d{1,3}(?:[ .  ]\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)\s*(?:€|euros?\b)/i.exec(morceau) || [])[0] || '';
    resolutions.push({ numero, intitule, montant: montant.replace(/\s+/g, ' ').trim() });
    if (resolutions.length >= 10) break;
  }
  return { date: dateAg, resolutions, lu: t.length > 200 };
}

// Pure : la phrase de CLAIRE pour la discussion du dossier.
function messageLectureDocument(sorte, nom, r) {
  const doc = `« ${String(nom || 'document').slice(0, 80)} »`;
  if (sorte === 'naissance') {
    if (!r || !r.lu) return `J’ai trouvé l’acte de naissance ${doc}, mais je n’ai pas pu le lire : à relire.`;
    if (r.mentions.length) return `Acte de naissance ${doc} : mention au répertoire civil (${[...new Set(r.mentions.map(x => x.nature))].join(', ')}) — « ${r.mentions[0].extrait.slice(0, 200)} ». À vérifier avant la signature.`;
    return `Acte de naissance ${doc} lu : aucune mention au répertoire civil${r.ocr ? ' (scan lu par reconnaissance de caractères : vérifiez les mentions marginales)' : ''}.`;
  }
  if (sorte === 'ehf') {
    if (!r || !r.etat) return `J’ai trouvé l’EHF ${doc}, mais je n’ai pas pu le lire : à relire.`;
    if (!r.etat.anf) return `EHF ${doc} lu, mais ce n’est pas un état-réponse que je sais lire : à relire par le notaire.`;
    return `EHF ${doc} — ${messageEtatHypothecaire(r.etat)}`;
  }
  if (sorte === 'pv-ag') {
    const quand = r && r.date ? ` du ${formatDateFr(r.date)}` : '';
    if (!r || !r.lu) return `J’ai trouvé le procès-verbal d’AG ${doc}, mais je n’ai pas pu le lire : à relire.`;
    if (!r.resolutions.length) return `Procès-verbal de l’AG${quand} ${doc} lu : aucune résolution de travaux adoptée lue.`;
    return `Procès-verbal de l’AG${quand} ${doc} : travaux votés — ${r.resolutions.slice(0, 3).map(x => `résolution ${x.numero || '?'} : ${x.intitule.slice(0, 90)}${x.montant ? ` (${x.montant})` : ''}`).join(' ; ')}${r.resolutions.length > 3 ? ` (et ${r.resolutions.length - 3} autre${r.resolutions.length > 4 ? 's' : ''})` : ''}. Qui les paie : à régler dans l’acte.`;
  }
  return '';
}

// Le texte d'un PDF, page par page (OCR des pages sans texte, quelques-unes au plus).
async function textePdfLectureDocument(blob) {
  if (typeof pdfjsLib === 'undefined') throw new Error('lecteur de PDF indisponible');
  const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await blob.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
  const pages = [];
  let worker = null;
  let ocr = 0;
  try {
    for (let p = 1; p <= pdf.numPages && p <= MAX_PAGES_LECTURE_DOCUMENT; p++) {
      const page = await pdf.getPage(p);
      let texte = lignesDepuisItemsPdf((await page.getTextContent()).items).join('\n').trim();
      page.cleanup();
      if (texte.replace(/\s+/g, '').length < 30 && ocr < MAX_PAGES_OCR_LECTURE_DOCUMENT && typeof creerWorkerOcr === 'function') {
        if (worker === null) worker = (await creerWorkerOcr()) || false;
        if (worker) { texte = String(await ocrPage(pdf, p, worker) || '').trim(); ocr++; }
      }
      pages.push(texte);
    }
  } finally {
    if (worker) { try { await worker.terminate(); } catch (e) { /* déjà arrêté */ } }
    try { pdf.destroy(); } catch (e) { /* déjà libéré */ }
  }
  return { pages, ocr: ocr > 0 };
}

// Lit un document et le dit dans la discussion du dossier. `source` : 'nas' (chemin) ou 'authentic' (pjId). Une seule fois par document.
async function lireDocumentAutomatique(dossierId, source, ref, nom, sorte) {
  const cle = `${source}:${ref}`;
  let d = dossiers.find(x => x && x.id === dossierId);
  if (!d || (d.lecturesDocuments || {})[cle]) return;
  // Réservé tout de suite (un autre poste qui relit la fiche ne le reprend pas).
  d.lecturesDocuments = Object.assign({}, d.lecturesDocuments, { [cle]: { sorte, nom: String(nom || '').slice(0, 160), le: new Date().toISOString(), enCours: true } });
  sauvegarder(d);
  let resultat = null;
  try {
    let blob;
    if (source === 'nas') {
      const r = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(ref));
      if (!r.ok) throw new Error('fichier illisible sur le NAS');
      blob = await r.blob();
    } else {
      blob = await blobPieceAuthenticAT(dossierId, ref);
    }
    const { pages, ocr } = await textePdfLectureDocument(blob);
    const texte = pages.join('\n');
    if (sorte === 'naissance') resultat = Object.assign({ lu: texte.replace(/\s+/g, '').length > 80, ocr }, mentionsRepertoireCivil(texte));
    else if (sorte === 'ehf') resultat = { etat: analyserEtatHypothecaire(pages, isoAujourdhuiLocal()), ocr };
    else if (sorte === 'pv-ag') resultat = Object.assign({ ocr }, travauxVotesPv(texte));
  } catch (e) {
    resultat = null;
  }
  d = dossiers.find(x => x && x.id === dossierId) || d;
  const message = messageLectureDocument(sorte, nom, resultat);
  const alerte = !!resultat && ((sorte === 'naissance' && resultat.mentions && resultat.mentions.length > 0)
    || (sorte === 'ehf' && resultat.etat && inscriptionsEnCours(resultat.etat).length > 0) || (sorte === 'pv-ag' && resultat.resolutions && resultat.resolutions.length > 0));
  d.lecturesDocuments = Object.assign({}, d.lecturesDocuments, { [cle]: { sorte, nom: String(nom || '').slice(0, 160), le: new Date().toISOString(), resume: message.slice(0, 500), alerte, lu: !!resultat } });
  ajouterHistorique(d, `Document lu par CLAIRE : ${message.slice(0, 220)}`);
  sauvegarder(d);
  try {
    await fetchAvecAuth(`/api/canaux/${encodeURIComponent('d:' + d.id)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auteur: utilisateurPoste || '', claire: true, texte: message }) });
  } catch (e) { /* le résultat reste sur la fiche et dans l'historique */ }
  noterVerificationPoste('lecture-document-' + sorte, resultat ? { detail: alerte ? 'point signalé' : 'rien à signaler' } : { ok: false, message: 'document illisible' });
}

// Les documents du NAS à lire pour ce dossier (modifiés depuis 30 jours, pas encore lus), mis dans la file du poste.
async function planifierLecturesDocuments(d) {
  if (!d || d.archive || !d.nasDossier || typeof fetchAvecAuth !== 'function') return;
  const maintenant = Date.now();
  if (lecturesDocumentsVues[d.id] && maintenant - lecturesDocumentsVues[d.id] < INTERVALLE_LECTURES_DOSSIER_MS) return;
  lecturesDocumentsVues[d.id] = maintenant;
  let fichiers = [];
  let base = '';
  try {
    const r = await fetchAvecAuth('/api/nas/fichiers?recents=300&dossier=' + encodeURIComponent(d.nasDossier));
    if (!r.ok) return;
    const j = await r.json();
    base = String(j.base || '');
    fichiers = j.fichiers || [];
  } catch (e) { return; }
  const limite = maintenant - JOURS_LECTURES_DOCUMENTS * 86400000;
  const copro = !estSuccession(d) && d.typeVente === 'copropriete';
  const deja = d.lecturesDocuments || {};
  fichiers.forEach(f => {
    const nom = String(f.nom || String(f.chemin || '').split(/[\\/]/).pop());
    const sorte = sorteDocumentALire(nom, copro);
    const chemin = (base ? base + '/' : '') + String(f.chemin || '');
    if (!sorte || deja['nas:' + chemin] || !(Date.parse(f.modifieLe) >= limite)) return;
    fileLecturesDocuments = fileLecturesDocuments.then(() => lireDocumentAutomatique(d.id, 'nas', chemin, nom, sorte)).catch(() => {});
  });
}

// Les actes de naissance des pièces jointes d'Authentic (GED relevée), pas encore lus — seulement quand CLAIRE est connectée à Authentic.
function planifierLecturesAuthentic(d) {
  if (!d || d.archive || !connexionAuthenticClaire || !connexionAuthenticClaire.actif) return;
  const sd = ((instantanesAuthenticAT[d.id] || {}).inst || {}).sousDossier;
  const deja = d.lecturesDocuments || {};
  ((sd && sd.pieces) || []).forEach(p => {
    const nom = String(p.nom || '');
    if (!/naissance/i.test(nom) || /(date|lieu) de naissance/i.test(nom) || deja['authentic:' + p.pjId]) return;
    fileLecturesDocuments = fileLecturesDocuments.then(() => lireDocumentAutomatique(d.id, 'authentic', p.pjId, nom, 'naissance')).catch(() => {});
  });
}

// Pour l'onglet Dossier et « Demander à CLAIRE » : les lectures faites, les plus récentes d'abord.
function lecturesDocumentsDossier(d) {
  return Object.entries((d && d.lecturesDocuments) || {}).map(([cle, v]) => Object.assign({ cle }, v)).filter(x => !x.enCours)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

// « Demander à CLAIRE » (outil `lectures_documents`) : ce qui a été lu (sorte, date, résumé, point à signaler) ; relire = planifier tout de suite
// la lecture des documents du NAS pas encore lus (après « Autoriser » : CLAIRE écrira dans la discussion du dossier).
async function lecturesDocumentsAgent(e) {
  const d = dossiers.find(x => x && x.id === String((e && e.dossier_id) || ''));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  const lectures = lecturesDocumentsDossier(d).map(x => ({ sorte: x.sorte, lu_le: String(x.le).slice(0, 10), point_a_signaler: !!x.alerte, resume: x.resume || '' }));
  if (e && e.relire === true) {
    if (!d.nasDossier) return { erreur: 'dossier non relié au NAS', lectures };
    if (!(await demanderAutorisationAgent(`Lire les actes de naissance, EHF et procès-verbaux d’AG du dossier du NAS de ${libelleDossierAffiche(d)} (modifiés depuis 30 jours, pas encore lus) et le dire dans la discussion du dossier.`))) {
      return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande', lectures };
    }
    delete lecturesDocumentsVues[d.id];
    await planifierLecturesDocuments(d);
    return { lancee: true, consigne: 'lecture en cours sur ce poste : le résultat arrive dans la discussion du dossier', lectures };
  }
  return { dossier_id: d.id, lectures, note: lectures.length ? '' : 'aucun acte de naissance, EHF ni procès-verbal d’AG lu pour ce dossier' };
}
