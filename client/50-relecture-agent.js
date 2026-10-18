  // ---- Relecture d'actes dans « Demander à CLAIRE » (étude 18/10 : « on va fusionner Relectures d'acte dans Demander à CLAIRE, qui sera
  // l'interface ; on lui enverra les données et elle fera un compte rendu comme Claude le ferait, sous format texte ») ----
  // L'outil `controles_relecture` de l'agent : sur le POSTE, le document entier est lu (pdf.js, OCR des pages sans texte) et passé aux
  // contrôles de CLAIRE, sans IA (client/07 à 13, 55 : dangers d'un avant-contrat, comparaison du projet avec l'avant-contrat, assemblées
  // générales, état daté, urbanisme…) ; la grille de relecture de l'étude (client/12) dit les points à vérifier selon le mode et le type
  // de bien ; les commentaires de l'étude sur les relectures passées deviennent des consignes. Le résultat part au serveur, qui le MASQUE
  // avant l'IA comme tout résultat d'outil ; l'IA lit ensuite le document (lire_document) pour vérifier chaque point et rédige le compte rendu.

  var MAX_CONSTATS_RELECTURE_AGENT = 40;

  // Pure : un constat de CLAIRE résumé pour l'agent (texte borné, page citée).
  function constatRelectureAgent(c) {
    const court = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);
    return { gravite: String(c.gravite || ''), categorie: String(c.categorie || ''), titre: court(c.titre, 160), detail: court(c.description, 300),
      ...(c.phrase ? { passage: court(c.phrase, 300) } : {}), ...(c.page ? { page: c.page } : {}) };
  }

  // Pure : les constats rangés du plus grave au moins grave, bornés — sans ceux que l'étude a écartés (constat reconnu par similarité,
  // `memoire`) ni ceux d'une rubrique qu'elle a masquée (`masquees`) : ses choix de l'ancien outil valent toujours (moins de bruit).
  function constatsRelectureAgent(constats, memoire, masquees) {
    const rang = { CRITIQUE: 0, IMPORTANT: 1, A_VERIFIER: 2, INFORMATION: 3 };
    const caches = new Set(masquees || []);
    return (constats || []).filter(Boolean)
      .filter(c => !caches.has(String(c.categorie || '')) && !((decisionPourConstat(c, memoire) || {}).decision === 'ecarte')).map((c, i) => ({ c, i })).sort((a, b) => (rang[a.c.gravite] ?? 4) - (rang[b.c.gravite] ?? 4) || a.i - b.i)
      .slice(0, MAX_CONSTATS_RELECTURE_AGENT).map(x => constatRelectureAgent(x.c));
  }

  // Le texte entier d'un document connu de la conversation (NAS ou pièce jointe), comme le lisait l'ancien outil de relecture.
  async function texteDocumentRelectureAgent(documentId) {
    const doc = documentsAgentConnus[documentId];
    if (!doc) return { erreur: `document inconnu (${String(documentId || '').slice(0, 20)}) : prends un document_id rendu par documents_du_dossier, documents_recents ou une pièce jointe (pj1…)` };
    if (doc.sorte === 'joint' && doc.sortePiece === 'image') return { erreur: 'une image ne se relit pas comme un acte : joins le PDF' };
    if (doc.sorte !== 'joint' && !doc.chemin) return { erreur: 'fichier pas encore localisé sur le NAS' };
    if (typeof pdfjsLib === 'undefined') return { erreur: 'lecteur PDF du poste non chargé (bibliothèque en ligne injoignable)' };
    let pdf;
    try {
      pdf = doc.sorte === 'joint'
        ? await pdfjsLib.getDocument({ isEvalSupported: false, data: await doc.fichier.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise
        : await ouvrirPdfNas(doc.chemin);
    } catch (e) { return { erreur: 'PDF illisible : ' + String(e && e.message || e).slice(0, 120) }; }
    try {
      const lu = await lireTextePdfParPage(pdf);
      noterDocumentLuAssistant(documentId, `1-${lu.pagesTotal}`);
      return { nom: doc.libelle || documentId, dossier: doc.dossier || null, ...lu };
    } finally { try { pdf.destroy(); } catch (e) { /* déjà libéré */ } }
  }

  async function controlesRelectureAgent(e) {
    const mode = e && e.mode === 'acte' ? 'acte' : 'compromis';
    assistantEtapeAgent = 'Je lis le document en entier pour les contrôles de CLAIRE…';
    renderAssistant();
    const principal = await texteDocumentRelectureAgent(e && e.document_id);
    if (principal.erreur) return principal;
    if (principal.texte.trim().length < 200) return { erreur: 'document presque vide : un scan illisible ? Lis-le avec lire_document pour voir' };
    const d = (e && e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null) || principal.dossier || null;
    // Projet d'acte : l'avant-contrat sert de référence (document_reference, sinon celui du dossier du NAS).
    let ref = null;
    if (mode === 'acte') {
      if (e.document_reference) { ref = await texteDocumentRelectureAgent(e.document_reference); if (ref.erreur) return { erreur: 'avant-contrat : ' + ref.erreur }; }
      else if (d) { assistantEtapeAgent = 'Je cherche l’avant-contrat du dossier…'; renderAssistant(); ref = await recupererTextCompromisDossier(d); }
    }
    const typeForce = ['maison', 'copropriete', 'terrain'].includes(e && e.type_bien) ? e.type_bien : '';
    assistantEtapeAgent = 'Je passe les contrôles de CLAIRE…';
    renderAssistant();
    let resultat;
    let entree;
    try {
      entree = mode === 'acte'
        ? { texteAvantContrat: ref ? ref.texte : '', pagesAvantContrat: ref ? ref.pages : [], texteProjet: principal.texte, pagesProjet: principal.pages,
          nomProjet: principal.nom, nomAvantContrat: ref ? (ref.nom || 'Avant-contrat') : 'Avant-contrat', documentsDeposes: [], dossierLie: d,
          reference: ref ? referenceAudit(ref.texte, ref.nom, d) : (d ? referenceDepuisDossier(d) : null), projet: construireExtractionRegex(principal.texte, null, null, principal.nom) }
        : { texte: principal.texte, pages: principal.pages, nomTexte: principal.nom, documentsDeposes: [], dossierLie: d, extraction: construireExtractionRegex(principal.texte, null, null, principal.nom) };
      resultat = mode === 'acte' ? analyserProjetVenteOutil2({ ...entree, typeBienForce: typeForce || undefined }) : analyserCompromisOutil2({ ...entree, typeBienForce: typeForce || undefined });
    } catch (err) {
      console.error('Contrôles de relecture :', err);
      return { erreur: 'contrôles de CLAIRE impossibles sur ce document : relis-le toi-même avec lire_document' };
    }
    const typeBien = typeForce || deduireTypeBienOutil2(entree).type;
    let retours = [];
    try { retours = await chargerRetoursAudit(); } catch (err) { retours = []; }
    noterVerificationPoste('agent-relecture', { detail: mode });
    const compte = (resultat && resultat.resume) || {};
    // Grille et consignes AVANT les constats : un résultat trop long est coupé à la fin par le serveur (relecture 0.284.0).
    return {
      mode: mode === 'acte' ? 'projet d’acte de vente' : 'avant-contrat (compromis ou promesse)',
      type_bien: typeBien,
      pages_total: principal.pagesTotal,
      ...(principal.viaOcr ? { attention: 'des pages scannées ont été lues par reconnaissance de caractères : citations à vérifier' } : {}),
      ...(mode === 'acte' ? { avant_contrat: ref ? 'comparé' : 'introuvable : la comparaison avec l’avant-contrat n’a pas été faite (le dire)' } : {}),
      consignes_de_l_etude: consignesDepuisRetours(retours, cleDossierAudit(d, principal.nom)),
      grille_de_l_etude: grillePourModeOutil2(mode, typeBien).map(p => ({ id: p.id, section: p.section, point: p.intitule, quand: p.declencheur || '', consigne: String(p.consigne || '').slice(0, 240) })),
      compte_des_constats: { critiques: compte.CRITIQUE || 0, importants: compte.IMPORTANT || 0, a_verifier: compte.A_VERIFIER || 0, information: compte.INFORMATION || 0 },
      constats_claire: constatsRelectureAgent(resultat && resultat.constats, memoireAuditConstats, rubriquesMasqueesAudit)
    };
  }

  // ---- « Imprimer » sous un compte rendu de l'agent ----

  // Pure : la page imprimable d'une réponse (HTML déjà échappé par htmlReponseAgentAssistant), autonome.
  function htmlImpressionReponseAssistant(html, titre, date) {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(titre || 'Compte rendu')}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.45; color: #000; margin: 0; }
header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #6D2332; padding-bottom: 6pt; margin-bottom: 12pt; }
header strong { font-size: 13pt; color: #6D2332; }
header span { font-size: 9pt; color: #555; }
p { margin: 0 0 7pt; } ul { margin: 0 0 8pt 16pt; padding: 0; } li { margin: 0 0 3pt; }
b { font-weight: 700; }
button, .asst-citation { all: unset; }
</style></head><body><header><strong>${escapeHtml(titre || 'Compte rendu')}</strong><span>Office de Me Sophie GOSSART — ${escapeHtml(date || '')}</span></header>
<main>${html}</main></body></html>`;
  }

  function imprimerReponseAssistant(html) {
    const w = window.open('', '_blank');
    if (!w) { afficherToast('Fenêtre d’impression bloquée par le navigateur.'); return; }
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    w.document.open();
    w.document.write(htmlImpressionReponseAssistant(html, 'Compte rendu de CLAIRE', date));
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* fenêtre fermée */ } }, 250);
  }
