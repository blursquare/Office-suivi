// @ts-check
'use strict';
// Constitution de dossier (étude 15/10) : les adresses de destinataires que l'étude a saisies à la main (l'intercommunalité du Grand
// Chambord, une banque, un EHPAD…) sont retenues pour la prochaine fois — jamais celles d'un client, seulement celles d'organismes.
// Clé `constitution-adresses` : { [cle]: { lignes: string[], courriel, par, le } }.

const express = require('express');
const { baseDepotDia, depotPourCommune, ficheMairie, lireCorrections } = require('../depotDia');
const { communesDuCodePostal } = require('../urbanisme');
const { noterVerification } = require('../verificationsTerrain');
const Constitution = require('../../../commun/constitution');

const CLE = 'constitution-adresses';
const MAX_ADRESSES = 300;
const CLE_VALIDE = /^[a-z0-9][a-z0-9-]{1,59}$/;

/** Pure : une adresse assainie (6 lignes de 120 caractères au plus, courriel simple). @param {any} e */
function assainirAdresse(e) {
  const x = e && typeof e === 'object' ? e : {};
  const lignes = (Array.isArray(x.lignes) ? x.lignes : []).map((l) => String(l == null ? '' : l).replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 6);
  const courriel = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(String(x.courriel || '').trim()) ? String(x.courriel).trim().toLowerCase().slice(0, 120) : '';
  return { lignes, courriel };
}

/** Pure : un nom de commune sans accent, majuscule ni ponctuation (« SAINT SULPICE DE POMMERAY » = « Saint-Sulpice-de-Pommeray »). @param {unknown} t */
function nomCommuneNormalise(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bsaint(e?)\b/g, 'st$1').trim();
}

/**
 * Pure : les communes de la base du dépôt DIA qui portent ce nom (une seule dans le département donné, sinon la liste).
 * @param {any} base
 * @param {string} nom
 * @param {string} [departement]
 * @returns {Array<{ insee: string, nom: string }>}
 */
function communesDeLaBaseParNom(base, nom, departement) {
  const cible = nomCommuneNormalise(nom);
  if (!cible) return [];
  const dep = String(departement || '');
  return Object.entries((base && base.communes) || {})
    .filter(([insee, c]) => nomCommuneNormalise(/** @type {any} */ (c).nom) === cible && (!dep || insee.startsWith(dep)))
    .map(([insee, c]) => ({ insee, nom: String(/** @type {any} */ (c).nom) }));
}

/** @param {any} parametresRepo @param {any} [injections] */
function creerRouteurConstitution(parametresRepo, injections = {}) {
  const routeur = express.Router();

  // Une commune de la vente : son code INSEE (par le code postal, sinon par son nom dans la base), son intercommunalité, le guichet
  // du CU et de la DIA, la fiche de la mairie (annuaire du service public). Ne partent que le code postal ou le nom d'une commune.
  routeur.get('/constitution/commune', async (req, res) => {
    const nom = String(req.query.nom || '').slice(0, 80);
    const cp = String(req.query.cp || '').trim();
    const departement = /^\d{5}$/.test(cp) ? (cp.startsWith('97') ? cp.slice(0, 3) : cp.slice(0, 2)) : '';
    if (!nom && !cp) { res.status(400).json({ erreur: 'Commune ou code postal attendu.' }); return; }
    const base = baseDepotDia();
    let candidats = communesDeLaBaseParNom(base, nom, departement);
    if (candidats.length !== 1 && /^\d{5}$/.test(cp)) {
      try {
        const duCp = await communesDuCodePostal(cp, injections);
        const parNom = duCp.filter((c) => nomCommuneNormalise(c.nom) === nomCommuneNormalise(nom));
        candidats = parNom.length ? parNom : (duCp.length === 1 ? duCp : candidats);
      } catch (_) { /* annuaire du code postal injoignable : on garde ce que la base a donné */ }
    }
    if (candidats.length !== 1) { res.json({ trouvee: false, ambigu: candidats.slice(0, 6) }); return; }
    const insee = candidats[0].insee;
    const r = depotPourCommune(base, lireCorrections(parametresRepo), insee);
    let mairie = null; let mairieLue = true;
    // Paris : la fiche de la MAIRIE D'ARRONDISSEMENT (courrier de péril), lue d'après le code postal ; le dépôt reste celui de Paris.
    const inseeMairie = (Constitution.estParis(insee) && Constitution.inseeArrondissementParis(cp)) || insee;
    try { mairie = await ficheMairie(inseeMairie, injections); } catch (_) { mairieLue = false; }
    noterVerification(parametresRepo, 'constitution-commune', mairieLue ? { detail: mairie ? 'mairie lue' : 'mairie absente de l’annuaire' } : { ok: false, message: 'annuaire injoignable' });
    res.json({ trouvee: true, insee, commune: r.connue ? r.commune : candidats[0].nom, epci: r.epci, depot: r.depot, mairie, mairieLue });
  });
  const lire = () => {
    const brut = parametresRepo.lireJsonBrut(CLE, {});
    return brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  };

  routeur.get('/constitution/adresses', (req, res) => { res.json({ adresses: lire() }); });

  routeur.put('/constitution/adresses/:cle', (req, res) => {
    const cle = String(req.params.cle || '');
    if (!CLE_VALIDE.test(cle)) { res.status(400).json({ erreur: 'Clé invalide.' }); return; }
    const a = assainirAdresse(req.body);
    if (!a.lignes.length && !a.courriel) { res.status(400).json({ erreur: 'Adresse vide.' }); return; }
    const toutes = Object.assign({}, lire());
    if (!toutes[cle] && Object.keys(toutes).length >= MAX_ADRESSES) { res.status(400).json({ erreur: 'Trop d’adresses retenues.' }); return; }
    toutes[cle] = Object.assign(a, { par: String((req.body && req.body.par) || '').slice(0, 60), le: new Date().toISOString() });
    parametresRepo.ecrireJsonBrut(CLE, toutes);
    res.json({ ok: true });
  });

  routeur.delete('/constitution/adresses/:cle', (req, res) => {
    const cle = String(req.params.cle || '');
    if (!CLE_VALIDE.test(cle)) { res.status(400).json({ erreur: 'Clé invalide.' }); return; }
    const toutes = Object.assign({}, lire());
    delete toutes[cle];
    parametresRepo.ecrireJsonBrut(CLE, toutes);
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = { creerRouteurConstitution, assainirAdresse, nomCommuneNormalise, communesDeLaBaseParNom, CLE_ADRESSES: CLE };
