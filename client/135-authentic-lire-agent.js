// Outil `authentic_lire` de « Demander à CLAIRE » (étape 8 du plan Authen.TIC, 27/10) : ce qu'Authentic montre, tel que CLAIRE l'a déjà
// relevé — le sous-dossier d'un dossier (instantané du serveur, commun/authentic-modele.js) ou les écrans de suivi de l'étude. LECTURE SEULE :
// rien n'est ouvert dans Authentic, rien n'est écrit ; le résultat passe par le serveur, qui le MASQUE comme tout résultat d'outil (noms des
// formalités, des pièces jointes, des lignes de suivi).

// Ce que le serveur a gardé (sa route ne lance jamais de lecture dans Authentic) ; un chargement du widget en cours est attendu.
async function suivisAuthenticPourAgent() {
  for (let i = 0; i < 20 && suivisAuthentic.enCours; i++) await new Promise(ok => setTimeout(ok, 250));
  await chargerSuivisAuthentic(true);
  return suivisAuthentic.etat;
}

// Ce qui part vers l'IA est masqué par le serveur, mais un nom de famille en TÊTE d'un texte court passe ce masquage (limite connue) :
// on n'envoie donc que des mots sûrs (audit 0.383.0). Le type d'une formalité en mots (« ACT », « MIC »… étaient codés comme des noms).
var TYPES_FORMALITE_AGENT = { APR: 'courrier ou demande', ECV: 'état civil (Comedec)', 'T@': 'Télé@ctes', ACT: 'acte', MIC: 'copie MICEN', SPR: 'publicité foncière', BRI: 'base des références immobilières', CJN: 'casier judiciaire' };
// Pure : un état d'Authentic reconnu (« Réponse positive », « Envoyé », « Non préemption SAFER », « Prêt »…), sinon « autre état ».
function etatSurPourAgent(t) {
  const x = String(t || '').trim();
  if (!x) return '';
  return /^(r[ée]ponse (positive|n[ée]gative)|envoy[ée]e?s?|re[çc]ue?s?|pris(e)? en compte|non[- ]?pr[ée]emption( safer)?|pr[ée]emption exerc[ée]e|pr[êe]t|sign[ée]e?( le .*)?|non r[ée]dig[ée]|en cours|en attente|[àa] signer|retour le .*|d[ée]pos[ée]e?|archiv[ée]e?|termin[ée]e?|refus[ée]?e?|rejet[ée]?e?|cr[ée]{1,2}e?)$/i.test(x) ? x : 'autre état';
}
// Pure : un dossier de la GED au nom connu (Non classé, Annexes MICEN, Parapheur…), sinon ''.
function dossierGedPourAgent(t) {
  return /^(non class[ée]|annexes?( micen)?|parapheur|pi[eè]ces?( jointes?)?|courriers?( re[çc]us?)?|actes?|identit[ée]|urbanisme|diagnostics?|copropri[ée]t[ée]|comptabilit[ée]|[ée]tat civil|safer|dia|mails?)$/i.test(String(t || '').trim()) ? String(t).trim() : '';
}

// Pure : le sous-dossier d'un instantané, réduit à ce que l'agent lit (sans identifiant technique d'Authentic).
function sousDossierPourAgent(inst, d) {
  const sd = inst && inst.sousDossier;
  if (!sd) return null;
  const formalite = (f) => {
    const o = { type: TYPES_FORMALITE_AGENT[f.badge] || 'autre', libelle: f.libelle, etat: etatSurPourAgent(f.statut), dates: f.dates || [] };
    ['creeLe', 'envoyeLe', 'recuLe', 'signeLe', 'numeroRepertoire', 'numeroChrono'].forEach(k => { if (f[k]) o[k] = f[k]; });
    ['situation', 'reponse'].forEach(k => { if (f[k]) o[k] = etatSurPourAgent(f[k]); });
    return o;
  };
  const checklist = typeof checklistPieces === 'function' && d ? checklistPieces(d.typeVente, d) : [];
  return {
    statut: sd.statut || '', statut_le: sd.statutLe || '',
    formalites_prealables: (sd.formalitesPrealables || []).map(formalite),
    actes: (sd.actes || []).map(formalite),
    formalites_posterieures: (sd.formalitesPosterieures || []).map(formalite),
    pieces_jointes: (sd.pieces || []).slice(0, 120).map(p => {
      const c = d ? correspondancePieceAuthenticAT(d, p.nom, checklist) : { piece: null, nas: false };
      return { nom: p.nom, dossier_ged: dossierGedPourAgent(p.dossierGed), piece_de_claire: c.piece ? c.piece.label : '', recue_dans_claire: !!(c.piece && c.piece.recue), aussi_sur_le_nas: c.nas };
    })
  };
}

async function authenticLireAgent(e) {
  if (e && e.vue === 'suivis') {
    const etat = await suivisAuthenticPourAgent();
    if (!etat) return { erreur: 'suivis d’Authentic non disponibles : ' + (suivisAuthentic.erreur || 'pas de réponse du serveur') };
    // Le libellé d'une ligne n'est donné que pour un dossier de CLAIRE (ses noms sont dans les fiches, donc masqués) ; une ligne d'un
    // dossier qui n'est pas dans CLAIRE ne dit que son écran, son état et ses dates (audit 0.383.0 : un nom absent des fiches passait).
    const lignes = lignesSuivisAuthenticEnAttente(etat).slice(0, 80).map(l => ({ ecran: l.titre, ...(l.dossierId ? { libelle: l.libelle, dossier_id: l.dossierId } : { dossier_id: '' }), situation: etatSurPourAgent(l.situation), dates: l.dates || [] }));
    return { lu_le: etat.luLe || '', lecture_en_cours: !!etat.enCoursDeLecture, connexion_allumee: !!etat.actif, compteurs: etat.compteurs || {}, lignes_en_attente: lignes,
      ...(etat.luLe ? {} : { note: 'jamais lus : la lecture se lance depuis le widget « Suivis d’Authentic » (Relire maintenant) ; rien n’est lu seul' }) };
  }
  const d = dossiers.find(x => x.id === (e && e.dossier_id));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  let inst = null;
  try {
    const r = await fetchAvecAuth(`/api/authentic/dossier/${encodeURIComponent(d.id)}/instantane`);
    if (!r.ok) return { erreur: 'instantané refusé par le serveur (' + r.status + ')' };
    inst = (await r.json()).instantane || null;
  } catch (err) { return { erreur: 'serveur injoignable' }; }
  const etat = await suivisAuthenticPourAgent();
  const suivis = etat && d.referenceAuthentic ? suivisDuDossierAT(etat.ecrans || {}, d.referenceAuthentic).map(l => ({ ecran: l.titre, libelle: l.libelle, situation: etatSurPourAgent(l.situation), dates: l.dates || [], en_attente: !!l.enAttente })) : [];
  const sd = sousDossierPourAgent(inst, d);
  return {
    dossier_id: d.id, lu_le: (inst && inst.luLe) || '', pages_relevees: (inst && inst.pages) || 0,
    sous_dossier: sd, dans_les_suivis: suivis,
    ...(sd ? {} : { note: 'aucune page d’Authentic relevée pour ce dossier : authentic_claire (mode lire) la relève' })
  };
}
