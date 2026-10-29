// CLAIRE dans Authentic, côté poste (client/131) : qui entre dans la demande d'état civil, quand la demande de casier se prépare ici.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('Comedec : les parties que l’étude représente ; mariés d’après la situation du couple ou la fiche d’Authentic ; jamais une société', () => {
  const d = { id: 'd1', nom: 'MARTIN / DURAND', situationVendeur: 'marie', parties: [
    { role: 'VENDEUR', nom: 'MARTIN', prenom: 'Paul' }, { role: 'VENDEUR', nom: 'MARTIN', prenom: 'Léa' },
    { role: 'ACQUEREUR', nom: 'DURAND', prenom: 'Claire' }, { role: 'ACQUEREUR', nom: 'SCI DES LICES', qualitePersonne: 'morale' }],
    authentic: { fichesClients: { 'claire durand': { nom: 'Claire DURAND', situationMatrimoniale: { situation: 'Marié(e)' } } } } };
  const p = app.partiesComedecDossier(d);
  // Le mariage d'un couple de parties n'est demandé qu'UNE fois (même acte) : pour le premier des deux époux.
  assert.equal(p.map((x) => `${x.prenom} ${x.nom}:${x.marie}`).join('|'), 'Paul MARTIN:true|Léa MARTIN:false|Claire DURAND:true');
});

test('Comedec : mariage d’un couple de parties demandé une fois ; deux co-vendeurs mariés chacun ailleurs : chacun garde le sien', () => {
  const frereSoeur = { id: 'd1', nom: 'X', situationVendeur: '', parties: [{ role: 'VENDEUR', nom: 'EXEMPLE', prenom: 'Ana' }, { role: 'VENDEUR', nom: 'ESSAI', prenom: 'Lou' }],
    authentic: { fichesClients: { 'ana exemple': { nom: 'Ana EXEMPLE', situationMatrimoniale: { situation: 'Marié(e)' } }, 'lou essai': { nom: 'Lou ESSAI', situationMatrimoniale: { situation: 'Marié(e)' } } } } };
  assert.equal(app.partiesComedecDossier(frereSoeur).map((x) => x.marie).join(','), 'true,true');
  assert.equal(app.neALEtrangerAuthentic({ authentic: { fichesClients: { 'ana exemple': { nom: 'Ana EXEMPLE', paysNaissance: 'La Réunion' } } } }, { prenom: 'Ana', nom: 'EXEMPLE' }), false, 'département d’outre-mer : demandée');
});

test('Comedec : une personne née à l’étranger n’a pas de demande de naissance (Comedec ne la délivre pas) ; née en France : demandée', () => {
  const d = { id: 'd1', nom: 'X', parties: [{ role: 'VENDEUR', nom: 'EXEMPLE', prenom: 'Ana' }, { role: 'ACQUEREUR', nom: 'ESSAI', prenom: 'Lou' }],
    authentic: { fichesClients: { 'ana exemple': { nom: 'Ana EXEMPLE', paysNaissance: 'PORTUGAL', nationalite: 'Portugaise' }, 'lou essai': { nom: 'Lou ESSAI', paysNaissance: 'France' } } } };
  assert.equal(app.partiesComedecDossier(d).map((x) => `${x.prenom}:${x.naissance}`).join('|'), 'Ana:false|Lou:true');
  // Née à l'étranger mais de nationalité française : la naissance est demandée (acte transcrit) ; nationalité inconnue : demandée aussi.
  const fiche = (nationalite) => ({ authentic: { fichesClients: { 'ana exemple': { nom: 'Ana EXEMPLE', paysNaissance: 'ALGÉRIE', nationalite } } } });
  assert.equal(app.neALEtrangerAuthentic(fiche('Française'), { prenom: 'Ana', nom: 'EXEMPLE' }), false);
  assert.equal(app.neALEtrangerAuthentic(fiche('Algérienne'), { prenom: 'Ana', nom: 'EXEMPLE' }), true);
  assert.equal(app.neALEtrangerAuthentic(fiche(''), { prenom: 'Ana', nom: 'EXEMPLE' }), false, 'nationalité inconnue : demandée');
  assert.equal(app.neALEtrangerAuthentic({ authentic: { fichesClients: {} } }, { nom: 'X', prenom: 'Y' }), false, 'pays inconnu : demandée');
});

test('CJN : pas pour une succession, ni en participation, ni sans acquéreur personne physique', () => {
  const vente = { id: 'd1', parties: [{ role: 'ACQUEREUR', nom: 'DURAND' }] };
  assert.equal(app.raisonSansCjn(vente), '');
  assert.match(app.raisonSansCjn(Object.assign({}, vente, { roleNotaire: 'participant' })), /notaire qui reçoit/);
  assert.match(app.raisonSansCjn({ id: 'd2', parties: [] }), /aucun acquéreur/);
  assert.match(app.raisonSansCjn({ id: 'd3', parties: [{ role: 'ACQUEREUR', nom: 'SCI', qualitePersonne: 'morale' }] }), /société/);
});

test('Comedec et CJN : ce qui est déjà demandé dans Authentic (acte vu sur la page, état autre que « négatif ») n’est pas redemandé', async () => {
  const d = { id: 'd1', nom: 'X', parties: [{ role: 'VENDEUR', nom: 'EXEMPLE', prenom: 'Ana' }, { role: 'ACQUEREUR', nom: 'ESSAI', prenom: 'Lou' }],
    authentic: { fichesClients: {}, etatsCivils: {
      a: { label: 'Acte de naissance EXEMPLE Ana', etat: 'attente' },
      b: { label: 'Acte de naissance ESSAI Lou', etat: 'negatif' },
      c: { label: 'Casier judiciaire ESSAI Lou', etat: 'positif', casier: true } } } };
  const deja = app.etatsCivilsDejaDemandes(d);
  assert.equal(deja.naissance.length, 1, 'le « négatif » n’y est pas');
  assert.equal(deja.casier.length, 1);
  const p = app.partiesComedecDossier(d);
  assert.equal(p.map((x) => `${x.prenom}:${x.dejaNaissance}`).join('|'), 'Ana:true|Lou:false', 'un « négatif » (rien délivré) peut être redemandé');
  assert.equal(app.libelleDitPersonne(['acte de naissance exemple ana'], { prenom: 'Ana', nom: 'EXEMPLE' }), true);
  assert.equal(app.libelleDitPersonne(['acte de naissance exemple ana'], { prenom: 'Zoe', nom: 'EXEMPLE' }), false, 'le nom seul ne suffit pas');
  // Rien à redemander : la réponse le dit, sans carte ni navigateur.
  const tout = { id: 'd2', nom: 'Y', parties: [{ role: 'VENDEUR', nom: 'EXEMPLE', prenom: 'Ana' }], authentic: { etatsCivils: { a: { label: 'Acte de naissance EXEMPLE Ana', etat: 'positif' }, b: { label: 'Acte de mariage EXEMPLE Ana', etat: 'attente' } } } };
  const r = await app.preparerFormaliteAuthentic(tout, 'comedec', { agent: true });
  assert.equal(r.statut, 'fait');
  assert.match(r.resultat, /Déjà demandé/);
});

test('déjà demandé : mots entiers seulement, un casier non délivré se redemande', () => {
  assert.equal(app.libelleDitPersonne(['acte de naissance royer anne'], { prenom: 'Ann', nom: 'ROY' }), false, '« Ann ROY » n’est pas « ROYER Anne »');
  assert.equal(app.libelleDitPersonne(['acte de naissance roy ann'], { prenom: 'Ann', nom: 'ROY' }), true);
  const d = { authentic: { etatsCivils: { a: { label: 'Casier judiciaire ESSAI Lou', etat: 'positif', casier: true, statut: 'Non délivré' }, b: { label: 'Casier judiciaire EXEMPLE Ana', etat: 'positif', casier: true, statut: 'Reçu' } } } };
  assert.equal(app.etatsCivilsDejaDemandes(d).casier.length, 1, 'seul le casier reçu compte');
});

test('Comedec ciblé : un type de personne (vendeurs / acquéreurs) ou une seule personne par son nom', () => {
  const d = { id: 'd1', nom: 'X', situationVendeur: 'marie', parties: [
    { role: 'VENDEUR', nom: 'MARTIN', prenom: 'Paul' }, { role: 'VENDEUR', nom: 'MARTIN', prenom: 'Léa' },
    { role: 'ACQUEREUR', nom: 'DURAND', prenom: 'Claire' }, { role: 'ACQUEREUR', nom: 'LEROY', prenom: 'Marc' }],
    authentic: { fichesClients: { 'paul martin': { nom: 'Paul MARTIN', situationMatrimoniale: { situation: 'Marié(e)' } }, 'lea martin': { nom: 'Léa MARTIN', situationMatrimoniale: { situation: 'Marié(e)' } } } } };
  const toutes = app.partiesComedecDossier(d);
  assert.equal(app.ciblerPartiesComedec(toutes, 'vendeurs', '').parties.map((p) => p.prenom).join(','), 'Paul,Léa');
  assert.equal(app.ciblerPartiesComedec(toutes, 'acquéreurs', '').parties.map((p) => p.prenom).join(','), 'Claire,Marc');
  assert.equal(app.ciblerPartiesComedec(toutes, '', 'Claire DURAND').parties.length, 1);
  assert.match(app.ciblerPartiesComedec(toutes, '', 'MARTIN').erreur, /plusieurs/, 'deux MARTIN : préciser le prénom');
  assert.equal(app.ciblerPartiesComedec(toutes, '', 'Léa Martin').parties[0].prenom, 'Léa');
  assert.match(app.ciblerPartiesComedec(toutes, '', 'Zoé ESSAI').erreur, /aucune partie/);
  assert.doesNotMatch(app.ciblerPartiesComedec(toutes, '', 'Zoé ESSAI').erreur, /Zoé|ESSAI/, 'jamais un nom dans l’erreur');
  assert.match(app.ciblerPartiesComedec(toutes, 'tiers', '').erreur, /role inconnu/);
  // Une seule personne mariée : elle garde SON mariage (le dédoublonnage du couple ne s'applique pas quand on ne demande que pour elle).
  assert.equal(toutes.find((p) => p.prenom === 'Léa').marie, false, 'couple : le mariage n’est demandé que pour le premier');
  const seule = app.partiesComedecDossier(d, { sansDedoublonnage: true });
  assert.equal(seule.find((p) => p.prenom === 'Léa').marie, true);
});

test('Comedec ciblé : un nom inexploitable est refusé ; le mariage déjà demandé pour un époux vaut pour le couple, même ciblé sur l’autre', () => {
  const d = { id: 'd1', nom: 'X', situationVendeur: 'marie', parties: [{ role: 'VENDEUR', nom: 'MARTIN', prenom: 'Paul' }, { role: 'VENDEUR', nom: 'MARTIN', prenom: 'Léa' }],
    authentic: { fichesClients: { 'paul martin': { nom: 'Paul MARTIN', situationMatrimoniale: { situation: 'Marié(e)' } }, 'lea martin': { nom: 'Léa MARTIN', situationMatrimoniale: { situation: 'Marié(e)' } } },
      etatsCivils: { m: { label: 'Acte de mariage MARTIN Paul', etat: 'attente' } } } };
  const toutes = app.partiesComedecDossier(d, { sansDedoublonnage: true });
  assert.equal(toutes.find((p) => p.prenom === 'Léa').dejaMariage, true, 'le mariage du couple est déjà demandé (sous le nom de Paul)');
  assert.match(app.ciblerPartiesComedec(toutes, '', 'J.').erreur, /inexploitable/);
  assert.match(app.ciblerPartiesComedec(toutes, '', '?').erreur, /inexploitable/);
});
