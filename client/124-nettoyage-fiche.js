// Nettoyage de la fiche (étude 26/10 : « de quoi supprimer des parties ou des biens, partout dans la fiche, pour nettoyer, et que la partie ou le
// bien puisse se remettre correctement depuis Authentic »). Retirer une partie, un bien ou une parcelle efface AUSSI ce qu'Authentic en avait retenu
// sur le dossier (fiches client, emails et téléphones repris, personnes d'un côté, biens retirés) : à la prochaine page relevée — ou tout de suite,
// si le dossier d'Authentic est déjà relevé — la fiche se remplit comme à la première fois. À la différence de « Retirer ce bien du dossier » (qui
// garde le bien parmi les biens retirés pour qu'Authentic ne le remette JAMAIS), rien n'est bloqué ici.

// Pure : un nom réduit à ses mots rangés (« Paul MOREAU » = « MOREAU Paul »), pour reconnaître la même personne.
function motsNettoyageFiche(nom) {
  return normaliserPourRecherche(String(nom || '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
}

// Modifie d : retire la partie d'index `index` et tout ce qu'Authentic en avait retenu POUR ELLE. Le côté (vendeur / acquéreur) compte : une
// personne homonyme de l'autre côté garde sa fiche d'Authentic et sa mémoire. Rend son nom (« Prénom NOM »), '' si rien.
function retirerPartieDuDossier(d, index) {
  const parties = d && Array.isArray(d.parties) ? d.parties : [];
  const p = parties[index];
  if (!p) return '';
  const nom = [p.prenom, p.nom].map(x => String(x || '').trim()).filter(Boolean).join(' ');
  const cle = motsNettoyageFiche(nom);
  const role = String(p.role || '').toUpperCase();
  d.parties = parties.filter((x, i) => i !== index);
  // Une autre partie du même nom (autre côté) : la fiche client d'Authentic, qui est celle de la personne, reste.
  const homonyme = d.parties.some(x => x && motsNettoyageFiche([x.prenom, x.nom].join(' ')) === cle);
  const a = d.authentic;
  if (a && typeof a === 'object' && cle) {
    const autre = Object.assign({}, a);
    if (!homonyme && a.fichesClients && typeof a.fichesClients === 'object') {
      autre.fichesClients = Object.fromEntries(Object.entries(a.fichesClients).filter(([k]) => motsNettoyageFiche(k) !== cle));
    }
    // Registre des contacts repris : clés « RÔLE|mots du nom » ; la fiche porte son rôle et son nom.
    if (a.fichesAuthentic && typeof a.fichesAuthentic === 'object') {
      autre.fichesAuthentic = Object.fromEntries(Object.entries(a.fichesAuthentic).filter(([k, f]) => !(f && String(f.role || '').toUpperCase() === role && motsNettoyageFiche(f.nom || String(k).split('|').slice(1).join(' ')) === cle)));
    }
    if (a.valeurs && typeof a.valeurs === 'object' && role) {
      const k = 'parties:' + role;
      if (Array.isArray(a.valeurs[k])) autre.valeurs = Object.assign({}, a.valeurs, { [k]: a.valeurs[k].filter(n => motsNettoyageFiche(n) !== cle) });
    }
    if (a.majEnAttente && typeof a.majEnAttente === 'object' && role) {
      autre.majEnAttente = Object.fromEntries(Object.entries(a.majEnAttente).filter(([k]) => k !== 'parties:' + role));
    }
    d.authentic = autre;
  }
  return nom;
}

// Modifie d : retire une parcelle (section + numéro, la commune départage si elle est donnée) de la fiche ET des immeubles d'Authentic.
// Rend le nombre de retraits.
function retirerParcelleDuDossier(d, section, numero, commune) {
  const cle = cleParcelle(section, numero);
  if (!d || !cle) return 0;
  const memeCommuneParcelle = (p) => !commune || !p.commune || motsNettoyageFiche(p.commune) === motsNettoyageFiche(commune);
  const garde = (p) => !(p && cleParcelle(p.section, p.numero) === cle && memeCommuneParcelle(p));
  let retires = 0;
  const cad = d.bien && d.bien.cadastre;
  if (cad && typeof cad === 'object') {
    const avant = Array.isArray(cad.parcelles) ? cad.parcelles : [];
    const restantes = avant.filter(garde);
    retires += avant.length - restantes.length;
    const nouveau = Object.assign({}, cad, { parcelles: restantes });
    if (restantes.length) { nouveau.section = restantes[0].section; nouveau.numero = restantes[0].numero; }
    else if (cleParcelle(cad.section, cad.numero) === cle) { delete nouveau.section; delete nouveau.numero; retires += avant.length ? 0 : 1; }
    d.bien = Object.assign({}, d.bien, { cadastre: nouveau });
  }
  const im = d.authentic && Array.isArray(d.authentic.immeubles) ? d.authentic.immeubles : null;
  if (im) {
    d.authentic = Object.assign({}, d.authentic, { immeubles: im.map(x => {
      if (!x || !Array.isArray(x.parcelles)) return x;
      const restantes = x.parcelles.filter(garde);
      retires += x.parcelles.length - restantes.length;
      return restantes.length === x.parcelles.length ? x : Object.assign({}, x, { parcelles: restantes });
    }) });
  }
  return retires;
}

// Modifie d : retire un bien d'Authentic (par sa signature) SANS le garder parmi les biens retirés, et lève un éventuel blocage antérieur
// sur ce bien. Rend le bien retiré, ou null.
function retirerImmeubleSansBlocage(d, signature) {
  const brut = d && d.authentic && Array.isArray(d.authentic.immeubles) ? d.authentic.immeubles.filter(x => x && typeof x === 'object') : [];
  const i = brut.findIndex(x => signatureBienVente(x) === signature);
  if (i < 0) return null;
  const bien = brut[i];
  const k = typeof clesBienSuccession === 'function' ? clesBienSuccession(bien) : null;
  const retires = Array.isArray(d.authentic.biensRetires) ? d.authentic.biensRetires : [];
  d.authentic = Object.assign({}, d.authentic, {
    immeubles: brut.filter((x, j) => j !== i),
    biensRetires: k && typeof memeBienSuccession === 'function' ? retires.filter(r => !memeBienSuccession(r, k)) : retires
  });
  return bien;
}

// Modifie d : vide le bien principal d'une vente (adresse, parcelles, lots) et ce qu'Authentic en avait repris — son immeuble et sa valeur
// d'adresse. Les AUTRES biens d'Authentic, les biens retirés pour toujours, le type de vente, le prix, les parties et les pièces ne bougent pas.
function viderBienPrincipalDuDossier(d) {
  if (!d) return;
  const cle = (a) => normaliserPourRecherche(normaliserAdresse(a || '')).replace(/[^a-z0-9]+/g, ' ').trim();
  const principal = cle(d.adresseBien);
  const cad = d.bien && d.bien.cadastre;
  const clesFiche = new Set(((cad && Array.isArray(cad.parcelles)) ? cad.parcelles : []).map(p => cleParcelle(p.section, p.numero)).filter(Boolean));
  const estPrincipal = (im) => !!im && ((principal && cle(im.adresse) === principal) || (im.parcelles || []).some(p => clesFiche.has(cleParcelle(p.section, p.numero))));
  d.adresseBien = '';
  d.bien = {};
  const a = d.authentic;
  if (a && typeof a === 'object') {
    const autre = Object.assign({}, a);
    if (Array.isArray(a.immeubles)) autre.immeubles = a.immeubles.filter(im => !estPrincipal(im));
    if (a.valeurs && typeof a.valeurs === 'object') autre.valeurs = Object.fromEntries(Object.entries(a.valeurs).filter(([k]) => !/^(adresse|adresseBien)$/i.test(k)));
    if (a.majEnAttente && typeof a.majEnAttente === 'object') autre.majEnAttente = Object.fromEntries(Object.entries(a.majEnAttente).filter(([k]) => !/^(adresse|adresseBien)$/i.test(k)));
    d.authentic = autre;
  }
}

// Après un retrait : ce qu'Authentic a déjà montré pour ce dossier (pages relevées ces 24 h) est repris tout de suite ; sinon ce sera à la
// prochaine page relevée. Rend vrai si quelque chose a été remis.
async function reprendreDepuisAuthenticApresNettoyage(d) {
  try {
    const avant = JSON.stringify([d.parties, d.adresseBien, d.bien, d.authentic && d.authentic.immeubles]);
    if (typeof completerDossierDepuisRelevesRecents === 'function') await completerDossierDepuisRelevesRecents(d);
    return JSON.stringify([d.parties, d.adresseBien, d.bien, d.authentic && d.authentic.immeubles]) !== avant;
  } catch (e) { return false; }
}

async function apresNettoyageFiche(d, texte) {
  ajouterHistorique(d, texte);
  const remis = await reprendreDepuisAuthenticApresNettoyage(d);
  await sauvegarder(d);
  render();
  afficherToast(remis ? `${texte} — Authentic l’a remis à jour.` : `${texte} — Authentic le remettra à la prochaine page relevée.`, 'OK', null);
}

// ---- Les gestes de la fiche ----

function demanderRetirerPartie(id, index) {
  const d = dossiers.find(x => x.id === id);
  const p = d && Array.isArray(d.parties) ? d.parties[index] : null;
  if (!p) return;
  const nom = [p.prenom, p.nom].map(x => String(x || '').trim()).filter(Boolean).join(' ') || 'cette personne';
  demanderConfirmation(`Retirer ${nom} de la fiche ? Ce qu’Authentic en avait repris (fiche client, emails, téléphones) est effacé aussi : elle se remettra depuis Authentic.`, async () => {
    const dd = dossiers.find(x => x.id === id);
    const courante = dd && Array.isArray(dd.parties) ? dd.parties[index] : null;
    if (!courante || motsNettoyageFiche([courante.prenom, courante.nom].join(' ')) !== motsNettoyageFiche([p.prenom, p.nom].join(' '))) {
      afficherToast('La fiche a changé : rouvrez-la.', 'OK', null);
      return;
    }
    const retiree = retirerPartieDuDossier(dd, index);
    await apresNettoyageFiche(dd, `Partie retirée : ${retiree || nom}`);
  }, { bouton: 'Retirer', ton: 'danger' });
}

function demanderRetirerParcelle(id, section, numero, commune) {
  const d = dossiers.find(x => x.id === id);
  if (!d) return;
  const ref = `${String(section || '').toUpperCase()} ${numero}`;
  demanderConfirmation(`Retirer la parcelle ${ref} de la fiche ? Si Authentic la porte, elle se remettra à sa prochaine lecture.`, async () => {
    const dd = dossiers.find(x => x.id === id);
    if (!dd || !retirerParcelleDuDossier(dd, section, numero, commune)) { afficherToast('Cette parcelle n’est plus sur la fiche.', 'OK', null); render(); return; }
    await apresNettoyageFiche(dd, `Parcelle retirée : ${ref}`);
  }, { bouton: 'Retirer', ton: 'danger' });
}

function demanderViderBien(id) {
  const d = dossiers.find(x => x.id === id);
  if (!d) return;
  demanderConfirmation('Vider le bien de la fiche (adresse, parcelles, lots) et effacer ce qu’Authentic en avait repris ? Le prix, les parties et les pièces ne bougent pas. Le bien se remettra depuis Authentic.', async () => {
    const dd = dossiers.find(x => x.id === id);
    if (!dd) return;
    viderBienPrincipalDuDossier(dd);
    await apresNettoyageFiche(dd, 'Bien vidé');
  }, { bouton: 'Vider le bien', ton: 'danger' });
}

// Retrait d'un bien d'Authentic (vente ou succession) SANS le bloquer : proposé à côté de « Retirer » dans les deux fenêtres de confirmation.
async function retirerBienPourReprise(id, signature) {
  const d = dossiers.find(x => x.id === id);
  if (!d) return;
  const bien = retirerImmeubleSansBlocage(d, signature);
  if (!bien) { afficherToast('Ce bien n’est plus dans la liste : rouvrez la fiche.', 'OK', null); return; }
  // Ses parcelles quittent aussi la fiche, sauf celles d'un bien gardé.
  const cleCommune = (p) => cleParcelle(p.section, p.numero) + '|' + motsNettoyageFiche(p.commune || '');
  const gardees = new Set(((d.authentic && d.authentic.immeubles) || []).flatMap(x => (x.parcelles || []).map(cleCommune)));
  (bien.parcelles || []).filter(p => !gardees.has(cleCommune(p))).forEach(p => retirerParcelleDuDossier(d, p.section, p.numero, p.commune));
  await apresNettoyageFiche(d, `Bien retiré : ${bien.adresse ? normaliserAdresse(bien.adresse) : (bien.parcelles || []).map(p => `${p.section} ${p.numero}`).join(', ') || 'sans adresse'}`);
}
