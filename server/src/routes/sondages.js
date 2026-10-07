'use strict';

// Routes du sondage de créneaux de signature (voir sondagesCreneaux.js). Les emails aux
// participants sont préparés par le poste (.eml) ; le serveur tient le sondage, pose et retire les
// options dans l'agenda partagé et relit les réponses dans la boîte du compte Exchange.
//
//   GET  /sondages                    liste (avec la synthèse par créneau)
//   POST /sondages                    crée un sondage (et ses options si demandé)
//   POST /sondages/:id/relire         relit la boîte tout de suite
//   POST /sondages/:id/placer         { n } : clôt le sondage, retire les options
//   POST /sondages/:id/annuler        clôt le sondage, retire les options
//   POST /sondages/:id/relance        note une relance (le poste prépare les emails)

const express = require('express');
const crypto = require('node:crypto');
const {
  MAX_CRENEAUX, MAX_PARTICIPANTS, JOURS_OUVRES_OPTION, codeSondage, joursOuvresApres, assainirSondage, attribuerCles,
  syntheseSondage, executerTourSondages, clore, dateDuJourParis, connexionPrete, adresseValide
} = require('../sondagesCreneaux');
const { creerRendezVousExchange } = require('../exchange/ews');

function heureFin(heure, duree) {
  const [h, m] = String(heure).split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + (Number(duree) || 60));
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function avecSynthese(s) {
  return { ...s, synthese: syntheseSondage(s), creneaux: s.creneaux.map((c) => ({ ...c, option: c.option ? { itemId: c.option.itemId } : null })) };
}

function creerRouteurSondages(parametresRepo, injections = {}) {
  const routeur = express.Router();

  routeur.get('/sondages', (req, res) => {
    const dossierId = String((req.query || {}).dossierId || '');
    const liste = parametresRepo.lireSondagesCreneaux().filter((s) => !dossierId || s.dossierId === dossierId);
    res.json({ ok: true, sondages: liste.map(avecSynthese) });
  });

  routeur.post('/sondages', async (req, res) => {
    const b = req.body || {};
    const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
    if (!connexionPrete(reglages) || !adresseValide(reglages.email)) {
      return res.status(400).json({ ok: false, message: 'La connexion Exchange doit être configurée (Réglages › Rappels et agenda) : c’est sa boîte qui reçoit les réponses.' });
    }
    const dossierId = String(b.dossierId || '').trim().slice(0, 80);
    // Sans dossier, le titre du rendez-vous est obligatoire (il nomme les options et le rendez-vous placé).
    const titre = String(b.titre || '').replace(/[?\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!dossierId && !titre) return res.status(400).json({ ok: false, message: 'Donnez un titre au rendez-vous, ou choisissez un dossier.' });
    const creneauxBruts = Array.isArray(b.creneaux) ? b.creneaux : [];
    const participantsBruts = Array.isArray(b.participants) ? b.participants : [];
    if (!creneauxBruts.length || creneauxBruts.length > MAX_CRENEAUX) {
      return res.status(400).json({ ok: false, message: `Proposez entre 1 et ${MAX_CRENEAUX} créneaux.` });
    }
    // Options seules (étude 07/10) : aucun destinataire, rien n'est envoyé — les créneaux sont seulement posés en option.
    const optionsSeules = b.optionsSeules === true;
    if ((!optionsSeules && !participantsBruts.length) || participantsBruts.length > MAX_PARTICIPANTS) {
      return res.status(400).json({ ok: false, message: 'Aucun destinataire avec une adresse email.' });
    }
    const sondages = parametresRepo.lireSondagesCreneaux();
    if (dossierId && sondages.some((s) => s.dossierId === dossierId && s.statut === 'ouvert')) {
      return res.status(409).json({ ok: false, message: 'Un sondage est déjà ouvert pour ce dossier : placez-le ou annulez-le d’abord.' });
    }
    const aujourdHui = dateDuJourParis();
    const brouillon = assainirSondage({
      id: crypto.randomUUID(),
      code: codeSondage(injections.aleatoire),
      dossierId,
      dossierNom: dossierId ? b.dossierNom : '',
      titre: dossierId ? '' : titre,
      statut: 'ouvert',
      creeLe: new Date().toISOString(),
      creePar: b.creePar,
      expireLe: joursOuvresApres(aujourdHui, JOURS_OUVRES_OPTION),
      adresseReponse: reglages.email,
      typeRdv: b.typeRdv,
      optionsSeules,
      creneaux: creneauxBruts.map((c, i) => ({ n: i + 1, date: c && c.date, heure: c && c.heure, dureeMinutes: c && c.dureeMinutes })),
      participants: attribuerCles(participantsBruts.map((p) => ({ ...(p || {}), cle: '' })), injections.aleatoire),
      reponses: []
    });
    if (!brouillon || brouillon.creneaux.length !== creneauxBruts.length) {
      return res.status(400).json({ ok: false, message: 'Un créneau proposé n’a pas de date ou d’heure valide.' });
    }
    if (brouillon.participants.length !== participantsBruts.length) {
      return res.status(400).json({ ok: false, message: 'Une adresse email de destinataire n’est pas valide.' });
    }
    // Les créneaux en option dans l'agenda partagé : un essai par créneau, arrêt au premier échec.
    let avertissement = '';
    if (b.poserOptions === true || optionsSeules) {
      const libelle = String(b.libelle || brouillon.dossierNom || brouillon.titre || '').replace(/[?\r\n]/g, ' ').trim().slice(0, 120) || 'VTE';
      const total = brouillon.creneaux.length;
      for (const c of brouillon.creneaux) {
        const sujet = `${libelle} ? — option CLAIRE, créneau ${c.n}/${total}`;
        const r = await creerRendezVousExchange({
          url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse,
          rendezVous: {
            sujet, dateStr: c.date, heureStr: c.heure, dureeMinutes: c.dureeMinutes,
            corps: optionsSeules
              ? `Option posée depuis CLAIRE (sans email aux parties). Retirée d’elle-même au placement du rendez-vous, ou sans décision le ${brouillon.expireLe.split('-').reverse().join('/')}.`
              : `Option posée par le sondage de créneaux de CLAIRE (réponses attendues avant le ${brouillon.expireLe.split('-').reverse().join('/')}). Retirée d’elle-même au placement du rendez-vous ou sans décision.`,
            mailbox: reglages.calendrierPartage, provisoire: true
          }
        }, injections);
        if (!r.ok) { avertissement = `Options posées : ${c.n - 1}/${total} — ${r.message}`; break; }
        c.option = { itemId: r.itemId || '', changeKey: r.changeKey || '' };
        if (r.itemId && typeof parametresRepo.ajouterEvenementAgendaOffice === 'function') {
          parametresRepo.ajouterEvenementAgendaOffice({
            itemId: r.itemId, changeKey: r.changeKey || '', sujet, lieu: '', date: c.date, heure: c.heure,
            heureFin: heureFin(c.heure, c.dureeMinutes), categories: [], signature: false, option: true,
            dossierId: dossierId || null, dossierNom: brouillon.dossierNom || null, creeDansClaire: true
          });
        }
      }
    }
    // Options seules dont aucune n'a pu être posée : rien à suivre, rien n'est gardé.
    if (optionsSeules && !brouillon.creneaux.some((c) => c.option)) {
      return res.json({ ok: false, message: avertissement || 'Aucune option n’a pu être posée dans l’agenda.' });
    }
    sondages.push(brouillon);
    parametresRepo.ecrireSondagesCreneaux(sondages);
    res.json({ ok: true, sondage: avecSynthese(brouillon), avertissement });
  });

  const trouver = (req, res) => {
    const sondages = parametresRepo.lireSondagesCreneaux();
    const s = sondages.find((x) => x.id === req.params.id);
    if (!s) { res.status(404).json({ ok: false, message: 'Sondage introuvable.' }); return null; }
    return { sondages, s };
  };

  routeur.post('/sondages/:id/relire', async (req, res) => {
    if (!trouver(req, res)) return;
    const tour = await executerTourSondages(parametresRepo, injections, true);
    const s = parametresRepo.lireSondagesCreneaux().find((x) => x.id === req.params.id);
    res.json({ ok: tour.ok, message: tour.erreur || '', lus: tour.lus, sondage: s ? avecSynthese(s) : null });
  });

  const cloture = (statut) => async (req, res) => {
    const t = trouver(req, res);
    if (!t) return;
    if (t.s.statut !== 'ouvert') return res.status(409).json({ ok: false, message: 'Ce sondage est déjà clos.' });
    const n = Number.parseInt((req.body || {}).n, 10);
    if (statut === 'place' && !t.s.creneaux.some((c) => c.n === n)) return res.status(400).json({ ok: false, message: 'Créneau inconnu.' });
    const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
    await clore(t.s, statut, reglages, parametresRepo, injections, statut === 'place' ? n : null);
    parametresRepo.ecrireSondagesCreneaux(t.sondages);
    const restantes = (t.s.optionsARetirer || []).length;
    res.json({
      ok: true, sondage: avecSynthese(t.s),
      message: restantes ? `${restantes} option(s) n’ont pas pu être retirées de l’agenda : nouvel essai dans quelques minutes.` : ''
    });
  };
  routeur.post('/sondages/:id/placer', cloture('place'));
  routeur.post('/sondages/:id/annuler', cloture('annule'));

  routeur.post('/sondages/:id/relance', (req, res) => {
    const t = trouver(req, res);
    if (!t) return;
    t.s.relances = [...(t.s.relances || []), new Date().toISOString()].slice(-10);
    parametresRepo.ecrireSondagesCreneaux(t.sondages);
    res.json({ ok: true, sondage: avecSynthese(t.s) });
  });

  return routeur;
}

module.exports = { creerRouteurSondages };
