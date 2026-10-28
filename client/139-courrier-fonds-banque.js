// ==== Courrier de déblocage ou de transfert des fonds à la banque (étude 28/10) ====
//
// « Voici les courriers de déblocage et de transfert des fonds pour les envoyer aux banques. Il faut pouvoir le faire en cliquant depuis les
// cartes, relances, CLAIRE… Permettre de changer la banque et récupérer les pièces jointes sur le NAS. C'est envoyé par email. »
// Le courrier (commun/courriers-succession.js, modèles `fonds-deblocage` / `fonds-transfert`, texte de l'étude mot pour mot) est composé en
// PDF/A comme les courriers de la Constitution de dossier ; la banque se choisit dans le Répertoire (adresse et email), les pièces jointes
// (acte de décès, attestation de dévolution, RIB de l'étude, autorisations des héritiers) sont proposées depuis le dossier du NAS ; la
// fenêtre d'email s'ouvre ensuite — rien ne part sans « Envoyer ». Un email PARTI de CLAIRE coche l'étape (déblocage ou transfert) et
// termine la routine des autorisations ; un email parti d'Outlook est retrouvé par le serveur dans les emails envoyés (clotureComptesEmail.js).

let cfbEtat = null;

// Pure : la sorte du courrier selon la succession — transfert des comptes au conjoint survivant, sinon déblocage auprès des banques.
function sorteFondsBanqueDossier(d) {
  return d && typeof conjointSurvivant === 'function' && conjointSurvivant(d) ? 'transfert' : 'deblocage';
}

// Pure : l'étape de la fiche que ce courrier fait avancer.
function etapeFondsBanque(sorte) { return sorte === 'transfert' ? 'transfertComptes' : 'deblocageFonds'; }

// Pièces proposées depuis le dossier du NAS, reconnues par le NOM du fichier (jamais par le contenu, règle des pièces).
var PIECES_FONDS_BANQUE = [
  { cle: 'deces', libelle: 'Acte de décès', re: /(?:acte|extrait|copie|certificat).{0,20}d[ée]\s?c[èe]s|^d[ée]\s?c[èe]s/i, sauf: /d[ée]claration de succession|au jour du d[ée]c[èe]s|projet/i },
  { cle: 'devolution', libelle: 'Attestation de dévolution', re: /d[ée]volution|notori[ée]t[ée]/i, sauf: /projet/i },
  { cle: 'rib', libelle: 'RIB de l’étude', re: /(?:^|[^a-z])rib(?:[^a-z]|$).*(?:office|[ée]tude|gossart|notaire|cdc|caisse des d[ée]p[oô]ts)|(?:office|[ée]tude|gossart|notaire|cdc).*(?:^|[^a-z])rib(?:[^a-z]|$)/i },
  { cle: 'autorisations', libelle: 'Autorisations des héritiers', re: /autorisation/i }
];

// Pure : les PDF du dossier, rangés : chaque pièce attendue reconnue (la plus récente d'abord, cochée), puis les autres (non cochées).
// `fichiers` : [{ chemin, nom, date? }].
function piecesNasFondsBanque(fichiers) {
  const liste = (Array.isArray(fichiers) ? fichiers : []).filter(f => f && f.chemin && /\.pdf$/i.test(String(f.nom || f.chemin)));
  // Le NOM du fichier seul (jamais ses sous-dossiers ; « \\ » sur le serveur Windows, audit 0.388.0).
  const nomDe = (f) => String(f.nom || String(f.chemin).split(/[\\/]/).pop() || '');
  const parDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
  const prises = new Set();
  const sortie = [];
  PIECES_FONDS_BANQUE.forEach(p => {
    const trouves = liste.filter(f => !prises.has(f.chemin) && p.re.test(nomDe(f)) && !(p.sauf && p.sauf.test(nomDe(f)))).sort(parDate);
    // Plusieurs autorisations (une par héritier) : toutes jointes ; une seule pièce pour les autres.
    (p.cle === 'autorisations' ? trouves : trouves.slice(0, 1)).forEach(f => { prises.add(f.chemin); sortie.push({ chemin: f.chemin, nom: nomDe(f), piece: p.libelle, coche: true }); });
  });
  liste.filter(f => !prises.has(f.chemin)).sort(parDate).forEach(f => sortie.push({ chemin: f.chemin, nom: nomDe(f), piece: '', coche: false }));
  return sortie;
}

// Pure : les pièces attendues qui manquent parmi celles cochées.
function piecesManquantesFondsBanque(pieces) {
  const cochees = new Set((pieces || []).filter(p => p.coche && p.piece).map(p => p.piece));
  return PIECES_FONDS_BANQUE.map(p => p.libelle).filter(l => !cochees.has(l));
}

// Pure : l'objet de l'email (nomme le défunt par son nom de famille : le serveur retrouve l'envoi parti d'Outlook par lui).
function objetEmailFondsBanque(sorte, defunt, d) {
  const qui = [defunt && defunt.civilite, defunt && defunt.prenoms, defunt && defunt.nom].filter(Boolean).join(' ');
  const ref = d && d.referenceAuthentic ? ` — Réf. ${d.referenceAuthentic}` : '';
  return `Succession de ${qui || 'à compléter'} — ${sorte === 'transfert' ? 'Transfert des fonds' : 'Déblocage des fonds'}${ref}`;
}

// Pure : le courrier ligne à ligne pour cette banque.
function documentFondsBanque(sorte, lignesBanque, defunt, dateIso) {
  return documentCourrierSuccession('fonds-' + (sorte === 'transfert' ? 'transfert' : 'deblocage'), { destinataire: lignesBanque, envoiParMail: true, dateIso, defunt });
}

async function ouvrirCourrierFondsBanque(id, sorte, banqueCherchee) {
  const d = dossiers.find(x => x && x.id === id);
  if (!d) return { ok: false, erreur: 'dossier introuvable' };
  if (!estSuccession(d)) { afficherToast('Ce courrier ne concerne qu’une succession.', 'OK', null); return { ok: false, erreur: 'pas une succession' }; }
  if (typeof autorisationsFondsSuccession === 'function' && !autorisationsFondsSuccession(d)) {
    afficherToast('Notoriété seule : pas de déblocage ni de transfert des fonds dans ce dossier.', 'OK', null);
    return { ok: false, erreur: 'notoriété seule' };
  }
  if ((!Array.isArray(repertoireContacts) || !repertoireContacts.length) && typeof chargerRepertoire === 'function') await chargerRepertoire();
  const s = sorte === 'transfert' || sorte === 'deblocage' ? sorte : sorteFondsBanqueDossier(d);
  cfbEtat = { id, sorte: s, contact: null, lignes: [], email: '', pieces: [], chargement: !!d.nasDossier, recherche: String(banqueCherchee || ''), envoi: false };
  // Une seule banque du répertoire pour la recherche donnée : retenue d'office (« Demander à CLAIRE » : « à la Caisse d'Épargne »).
  if (cfbEtat.recherche) {
    const t = rechercheRepertoireConstitution(cfbEtat.recherche, repertoireContacts, 'succession');
    if (t.length === 1) choisirContactFondsBanque(t[0].id, true);
  }
  renderCourrierFondsBanque();
  const overlay = document.getElementById('fonds-banque-overlay');
  if (overlay) overlay.style.display = 'flex';
  if (d.nasDossier) {
    const e = cfbEtat;
    try {
      const r = await fetchAvecAuth('/api/nas/fichiers?recents=300&dossier=' + encodeURIComponent(d.nasDossier));
      const j = r.ok ? await r.json() : { fichiers: [] };
      const base = String(j.base || '');
      const fichiers = (j.fichiers || []).map(f => typeof f === 'string' ? { chemin: f } : f).map(f => ({ chemin: (base ? base + '/' : '') + String(f.chemin || f.nom || ''), nom: String(f.nom || String(f.chemin || '').split(/[\\/]/).pop()), date: f.modifieLe || '' }));
      if (cfbEtat === e) { e.pieces = piecesNasFondsBanque(fichiers); e.chargement = false; renderCourrierFondsBanque(); }
    } catch (err) { if (cfbEtat === e) { e.chargement = false; renderCourrierFondsBanque(); } }
  }
  return { ok: true, sorte: s };
}

function fermerCourrierFondsBanque() {
  const overlay = document.getElementById('fonds-banque-overlay');
  if (overlay) overlay.style.display = 'none';
  cfbEtat = null;
}

function choisirContactFondsBanque(contactId, sansRendu) {
  if (!cfbEtat) return;
  const c = (repertoireContacts || []).find(x => x && x.id === contactId);
  if (!c) return;
  cfbEtat.contact = c;
  cfbEtat.lignes = adresseCourrierContact(c);
  const emails = emailsContactConstitution(c);
  cfbEtat.email = emails.length ? emails[0].adresse : '';
  cfbEtat.recherche = '';
  if (!sansRendu) renderCourrierFondsBanque();
}

function cfbChanger(champ, valeur) {
  if (!cfbEtat) return;
  if (champ === 'sorte') { cfbEtat.sorte = valeur === 'transfert' ? 'transfert' : 'deblocage'; renderCourrierFondsBanque(); return; }
  if (champ === 'lignes') { cfbEtat.lignes = String(valeur || '').split('\n').map(l => l.trim()).filter(Boolean); return; }
  if (champ === 'email') { cfbEtat.email = String(valeur || '').trim(); return; }
  if (champ === 'recherche') {
    cfbEtat.recherche = String(valeur || '');
    const boite = document.getElementById('cfb-resultats');
    if (boite) boite.innerHTML = lignesBanquesFondsBanque();
  }
}

function cfbCocherPiece(i, oui) {
  if (!cfbEtat || !cfbEtat.pieces[i]) return;
  cfbEtat.pieces[i].coche = !!oui;
  const m = document.getElementById('cfb-manquantes');
  if (m) m.innerHTML = htmlManquantesFondsBanque();
}

function lignesBanquesFondsBanque() {
  const q = String((cfbEtat && cfbEtat.recherche) || '').trim();
  const liste = q ? rechercheRepertoireConstitution(q, repertoireContacts, 'succession') : candidatsRepertoireConstitution('banque', repertoireContacts).slice(0, 6);
  if (!liste.length) return `<p class="cfb-vide">${q ? 'Aucune banque de ce nom dans le Répertoire : saisissez l’adresse ci-dessous.' : 'Cherchez la banque dans le Répertoire.'}</p>`;
  return liste.map(c => `<button type="button" class="dash-recherche-ligne" onclick="choisirContactFondsBanque('${escapeOnclickArg(c.id)}')">
    <span class="dash-recherche-nom">${escapeHtml([c.organisme, c.service].filter(Boolean).join(' — ') || (c.personnes || [])[0] || '')}</span>
    <span class="dash-recherche-resp">${escapeHtml(String(c.adresse || '').split(/\n|,/).slice(-1)[0] || '')}</span></button>`).join('');
}

function htmlManquantesFondsBanque() {
  const manque = piecesManquantesFondsBanque(cfbEtat ? cfbEtat.pieces : []);
  return manque.length ? `<span class="dot-label dl-alerte"><span class="dot"></span>À joindre dans la fenêtre d’email : ${escapeHtml(manque.join(', '))}</span>`
    : '<span class="dot-label dl-complet"><span class="dot"></span>Toutes les pièces du courrier sont jointes</span>';
}

function renderCourrierFondsBanque() {
  const contenu = document.getElementById('fonds-banque-contenu');
  const e = cfbEtat;
  if (!contenu || !e) return;
  const d = dossiers.find(x => x && x.id === e.id);
  if (!d) return;
  const deja = ((d.succession || {}).courriersFonds || []).filter(c => c && c.sorte === e.sorte);
  const pieces = e.chargement ? '<p class="cfb-vide">Lecture du dossier du NAS…</p>'
    : !d.nasDossier ? '<p class="cfb-vide">Dossier non relié au NAS : joignez les pièces dans la fenêtre d’email.</p>'
    : !e.pieces.length ? '<p class="cfb-vide">Aucun PDF dans le dossier du NAS.</p>'
    : `<ul class="cfb-pieces">${e.pieces.map((p, i) => `<li><label><input type="checkbox"${p.coche ? ' checked' : ''} onchange="cfbCocherPiece(${i}, this.checked)"> <span class="cfb-nom">${escapeHtml(p.nom)}</span>${p.piece ? ` <span class="cfb-piece">${escapeHtml(p.piece)}</span>` : ''}</label></li>`).join('')}</ul>`;
  contenu.innerHTML = `
    <div class="cfb-tete">
      <h2 class="veille-titre">${icone('mail')}Courrier à la banque</h2>
      <p class="veille-intro">${escapeHtml(libelleDossierAffiche(d))}${deja.length ? ` · déjà préparé pour ${escapeHtml(deja.map(c => c.banque || 'une banque').join(', '))}` : ''}</p>
    </div>
    <div class="cfb-corps">
      <div class="reglages-champ"><label for="cfb-sorte">Courrier</label>
        <select id="cfb-sorte" onchange="cfbChanger('sorte', this.value)">
          <option value="deblocage"${e.sorte === 'deblocage' ? ' selected' : ''}>Déblocage des fonds</option>
          <option value="transfert"${e.sorte === 'transfert' ? ' selected' : ''}>Transfert des fonds</option>
        </select></div>
      <div class="reglages-champ"><label for="cfb-recherche">Banque</label>
        <input type="search" id="cfb-recherche" placeholder="Chercher dans le Répertoire (nom, ville)…" value="${escapeAttr(e.recherche)}" oninput="cfbChanger('recherche', this.value)">
        <div id="cfb-resultats" class="cfb-resultats">${lignesBanquesFondsBanque()}</div></div>
      <div class="reglages-champ"><label for="cfb-lignes">Adresse du courrier</label>
        <textarea id="cfb-lignes" rows="4" placeholder="Nom de la banque&#10;Adresse&#10;Code postal VILLE" oninput="cfbChanger('lignes', this.value)">${escapeHtml(e.lignes.join('\n'))}</textarea></div>
      <div class="reglages-champ"><label for="cfb-email">Email de la banque</label>
        <input type="email" id="cfb-email" value="${escapeAttr(e.email)}" placeholder="service.successions@banque.fr" oninput="cfbChanger('email', this.value)"></div>
      <div class="reglages-champ"><span class="reglages-option-titre">Pièces jointes du dossier du NAS ${infoBulle('Le courrier en PDF est toujours joint. Les pièces reconnues par leur nom sont cochées ; ajoutez ou retirez à la main.')}</span>
        ${pieces}
        <div id="cfb-manquantes" class="cfb-manquantes">${htmlManquantesFondsBanque()}</div></div>
    </div>
    <div class="confirm-actions">
      <wa-button appearance="outlined" onclick="fermerCourrierFondsBanque()">Fermer</wa-button>
      <wa-button appearance="outlined" onclick="telechargerCourrierFondsBanque()">${icone('download')}Télécharger le courrier</wa-button>
      <wa-button variant="brand" onclick="preparerEmailFondsBanque()"${e.envoi ? ' loading' : ''}>${icone('mail')}Préparer l’email</wa-button>
    </div>`;
}

async function pdfCourrierFondsBanque(d) {
  const defunt = defuntConstitution(d).champs;
  const doc = documentFondsBanque(cfbEtat.sorte, cfbEtat.lignes, defunt, isoAujourdhuiLocal());
  const nom = nomFichierCourrierSuccession('fonds-' + cfbEtat.sorte, libelleDossierAffiche(d)) + (cfbEtat.lignes[0] ? ' - ' + cfbEtat.lignes[0].replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 40) : '');
  const { blob } = await genererPdfAAppelFonds(null, nom + '.docx', { fidele: doc, refLignes: refLignesCourrier(d), ref: d.nom || '', signe: true });
  return { blob, nom: nom + '.pdf', doc, defunt };
}

async function telechargerCourrierFondsBanque() {
  const d = cfbEtat && dossiers.find(x => x && x.id === cfbEtat.id);
  if (!d) return;
  if (!cfbEtat.lignes.length) { afficherToast('Choisissez la banque (ou saisissez son adresse).', 'OK', null); return; }
  try {
    const { blob, nom } = await pdfCourrierFondsBanque(d);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (err) { afficherToast('Courrier impossible à produire : ' + (err && err.message ? err.message : 'erreur'), 'OK', null); }
}

async function preparerEmailFondsBanque() {
  const e = cfbEtat;
  const d = e && dossiers.find(x => x && x.id === e.id);
  if (!d || e.envoi) return;
  if (!e.lignes.length) { afficherToast('Choisissez la banque (ou saisissez son adresse).', 'OK', null); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email)) { afficherToast('Adresse email de la banque à saisir.', 'OK', null); return; }
  e.envoi = true;
  renderCourrierFondsBanque();
  try {
    const { blob, nom, doc, defunt } = await pdfCourrierFondsBanque(d);
    const pieces = [{ nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(blob) }];
    for (const p of e.pieces.filter(x => x.coche)) {
      const r = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(p.chemin));
      if (!r.ok) throw new Error(`pièce « ${p.nom} » illisible sur le NAS`);
      pieces.push({ nom: p.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(await r.blob()) });
    }
    if (cfbEtat !== e) return;
    const banque = e.contact ? [e.contact.organisme, e.contact.service].filter(Boolean).join(' — ') : e.lignes[0];
    const sorte = e.sorte;
    fermerCourrierFondsBanque();
    const r = await livrerEmailDossier({ destinataire: e.email, sujet: objetEmailFondsBanque(sorte, defunt, d), corps: texteCorpsDocument(doc), pieces,
      responsableSignature: d.responsable, dossierId: d.id, geste: 'fondsBanque:' + sorte });
    // Messagerie du poste (mailto) : les pièces ne peuvent pas suivre — le dire, et télécharger le courrier.
    if (r && r.ok && r.piecesNonJointes) {
      afficherToast('Votre messagerie ne reçoit pas les pièces jointes : le courrier est téléchargé, joignez-le avec les pièces du NAS.', 'OK', null);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    if (r && r.ok) { noterCourrierFondsBanque(d, sorte, banque, r.mode); noterVerificationPoste('fonds-banque-email', { detail: r.mode === 'envoye' ? 'envoyé depuis CLAIRE' : 'préparé' }); }
    return r;
  } catch (err) {
    console.error(err);
    afficherToast('Email impossible à préparer : ' + (err && err.message ? err.message : 'erreur'), 'OK', null);
    if (cfbEtat === e) { e.envoi = false; renderCourrierFondsBanque(); }
    return { ok: false };
  }
}

// Le courrier préparé est noté sur la fiche ; parti de CLAIRE (Exchange), l'étape est cochée et la routine des autorisations terminée.
// Ouvert dans Outlook, le serveur le retrouve dans les emails envoyés.
function noterCourrierFondsBanque(d, sorte, banque, mode) {
  d.succession = d.succession || {};
  d.succession.courriersFonds = (Array.isArray(d.succession.courriersFonds) ? d.succession.courriersFonds : []).concat({ sorte, banque: String(banque || '').slice(0, 120), le: isoAujourdhuiLocal(), envoye: mode === 'envoye' }).slice(-30);
  const quoi = sorte === 'transfert' ? 'transfert' : 'déblocage';
  ajouterHistorique(d, `Courrier de ${quoi} des fonds ${mode === 'envoye' ? 'envoyé' : 'préparé'} par email${banque ? ' à ' + banque : ''}`);
  // L'étape DE LA FICHE (une seule selon le conjoint survivant, jamais celle de la sorte choisie), et seulement si elle est ouverte (notoriété
  // signée) ; `detectionsEmails.clotureComptes` posé : le serveur ne la recoche jamais après une décoche à la main (audit 0.388.0).
  const etape = etapeFondsBanque(sorteFondsBanqueDossier(d));
  const etapeFiche = etapesSuccession(d, isoAujourdhuiLocal()).find(x => x.type === etape);
  if (mode === 'envoye' && etapeFiche && etapeFiche.active && !etapeFiche.fait) {
    d.echeancesValidees = Object.assign({}, d.echeancesValidees, { [etape]: true });
    d.detectionsEmails = Object.assign({}, d.detectionsEmails, { clotureComptes: isoAujourdhuiLocal() });
    ajouterHistorique(d, `${etape === 'transfertComptes' ? 'Transfert des comptes au profit du conjoint survivant' : 'Déblocage des fonds auprès des banques'} marqué fait (courrier envoyé depuis CLAIRE)`);
    if (typeof terminerRoutineDossier === 'function') terminerRoutineDossier(d.id, 'autorisations-notoriete');
  }
  sauvegarder(d);
  render();
}

// « Demander à CLAIRE » (outil `courrier_fonds_banque`) : ce qui est fait, et la fenêtre préparée sur demande — jamais un envoi.
// Le nom de la banque ne part pas à l'IA s'il n'est pas dans le Répertoire (texte libre) ; les banques du Répertoire sont des organismes.
async function courrierFondsBanqueAgent(e) {
  const d = dossiers.find(x => x && x.id === String((e && e.dossier_id) || ''));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  if (!estSuccession(d)) return { erreur: 'pas une succession : ce courrier ne concerne que les successions' };
  if (typeof autorisationsFondsSuccession === 'function' && !autorisationsFondsSuccession(d)) return { erreur: 'notoriété seule : ni déblocage ni transfert des fonds dans ce dossier' };
  const sorte = e.sorte === 'transfert' || e.sorte === 'deblocage' ? e.sorte : sorteFondsBanqueDossier(d);
  const etape = etapeFondsBanque(sorte);
  const etapeFiche = etapesSuccession(d, isoAujourdhuiLocal()).find(x => x.type === etape);
  const sortie = {
    dossier_id: d.id, sorte, etape: etapeFiche ? etapeFiche.label : '', etape_faite: !!(etapeFiche && etapeFiche.fait), etape_active: !!(etapeFiche && etapeFiche.active),
    courriers_deja: ((d.succession || {}).courriersFonds || []).map(c => ({ sorte: c.sorte, banque_du_repertoire: (repertoireContacts || []).some(r => [r.organisme, r.service].filter(Boolean).join(' — ') === c.banque) ? c.banque : 'une banque', le: c.le, envoye_depuis_claire: !!c.envoye })),
    detecte_dans_les_emails_envoyes: !!(d.detectionsEmails && d.detectionsEmails.clotureComptes)
  };
  if (e.ouvrir) {
    const r = await ouvrirCourrierFondsBanque(d.id, sorte, String(e.banque || '').slice(0, 80));
    sortie.fenetre_ouverte = !!(r && r.ok);
    sortie.consigne = 'Fenêtre ouverte sur le poste : l’utilisateur choisit ou vérifie la banque, les pièces jointes, puis « Préparer l’email » ; rien ne part sans « Envoyer ».';
  }
  return sortie;
}
