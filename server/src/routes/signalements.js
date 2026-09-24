'use strict';

// Signalements de problèmes par les collaborateurs — demande de l'étude après la présentation de
// CLAIRE aux équipes : « comment organiser la remontée des bugs qu'ils peuvent me donner ? », puis
// « tout passe par moi ». D'où deux rôles bien séparés :
//   - n'importe quel poste connecté peut CRÉER un signalement (bouton « Signaler un problème ») ;
//   - le tri (statut, doublon, note), l'export et la suppression se font depuis les Réglages, par
//     l'étude, qui transmet ensuite un lot à Claude Code sous forme d'un fichier JSON.
// Il n'y a pas de compte par collaborateur (mot de passe partagé, voir auth.js) : cette séparation
// est une affaire d'écran, pas de droits — dit tel quel dans l'écran Réglages.
//
// Un signalement BLOQUANT prévient l'étude tout de suite, par la même chaîne que les rappels
// (email → boîte-passerelle → Teams, voir envoiEmail.js), à l'adresse de copie de l'étude
// (reglages.copieEmail) : c'est l'adresse qui reçoit déjà un double de tout, et la seule qui ne
// dépende pas d'un nom de collaborateur écrit en dur ici.

const express = require('express');
const crypto = require('node:crypto');
const { envoyerEmail, envoiConfigure } = require('../envoiEmail');
const { mettreCopiesEnAttente } = require('../nettoyageGmail');

const GRAVITES = ['bloquant', 'genant', 'idee'];
const STATUTS = ['nouveau', 'transmis', 'corrige', 'doublon', 'ecarte'];
const LIBELLES_GRAVITE = { bloquant: 'Bloquant', genant: 'Gênant', idee: "Idée d'amélioration" };

// Une capture d'écran réduite côté client (voir reduireCaptureSignalement dans script.js) pèse
// quelques centaines de Ko ; au-delà de ce plafond, c'est une image non réduite qu'on refuse
// plutôt que d'alourdir la base et chaque export.
const MAX_CAPTURE = 4 * 1024 * 1024;
const MAX_CONTEXTE = 20000;
const MAX_LISTE = 500;

function texte(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Contexte ajouté automatiquement par le client (version, onglet, dossier ouvert, navigateur,
// dernières erreurs JavaScript). Gardé tel quel mais borné : ce n'est qu'une aide au diagnostic.
function assainirContexte(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return {};
  let json;
  try { json = JSON.stringify(c); } catch (e) { return {}; }
  if (json.length <= MAX_CONTEXTE) return JSON.parse(json);
  // Trop long : les erreurs JS sont la partie qui grossit, on la tronque en premier.
  const copie = JSON.parse(json);
  if (Array.isArray(copie.erreurs)) copie.erreurs = copie.erreurs.slice(-5);
  const re = JSON.stringify(copie);
  return re.length <= MAX_CONTEXTE ? copie : { tronque: true, version: texte(copie.version, 40) };
}

function capturePermise(v) {
  return typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_CAPTURE;
}

// Validation d'un nouveau signalement : pure, testable. Renvoie {erreur} ou {valeur}.
function validerSignalement(corps) {
  const c = corps && typeof corps === 'object' ? corps : {};
  const gravite = GRAVITES.indexOf(c.gravite) >= 0 ? c.gravite : '';
  if (!gravite) return { erreur: 'Choisissez la gravité du problème.' };
  const action = texte(c.action, 4000);
  const constat = texte(c.constat, 4000);
  if (!action && !constat) return { erreur: 'Décrivez ce que vous faisiez ou ce qui s’est passé.' };
  if (c.capture != null && c.capture !== '' && !capturePermise(c.capture)) {
    return { erreur: 'Capture d’écran refusée (image trop lourde ou format non reconnu).' };
  }
  return {
    valeur: {
      gravite, action, constat,
      auteur: texte(c.auteur, 120),
      contexte: assainirContexte(c.contexte),
      capture: capturePermise(c.capture) ? c.capture : ''
    }
  };
}

function texteNotificationSignalement(s) {
  const ctx = s.contexte || {};
  const lignes = [`🚨 CLAIRE — Problème BLOQUANT signalé${s.auteur ? ` par ${s.auteur}` : ''}.`];
  if (s.action) lignes.push(`Ce qu'il faisait : ${s.action}`);
  if (s.constat) lignes.push(`Ce qui s'est passé : ${s.constat}`);
  const lieu = [ctx.onglet && `écran ${ctx.onglet}`, ctx.dossierNom && `dossier ${ctx.dossierNom}`, ctx.version && `version ${ctx.version}`]
    .filter(Boolean).join(' · ');
  if (lieu) lignes.push(lieu);
  lignes.push('Détail et capture dans CLAIRE : Réglages › Signalements.');
  return lignes.join('\n');
}

function ligneVersSignalement(l, avecCapture) {
  let contexte = {};
  try { contexte = JSON.parse(l.contexte || '{}'); } catch (e) { contexte = {}; }
  const s = {
    id: l.id, createdAt: l.created_at, updatedAt: l.updated_at, gravite: l.gravite, statut: l.statut,
    auteur: l.auteur || '', action: l.action || '', constat: l.constat || '', contexte,
    note: l.note || '', versionCorrige: l.version_corrige || '', doublonDe: l.doublon_de || '',
    notifie: !!l.notifie, aCapture: !!l.capture
  };
  if (avecCapture) s.capture = l.capture || '';
  return s;
}

function creerRouteurSignalements(db, parametresRepo, envoyerFn) {
  const routeur = express.Router();
  const envoyer = envoyerFn || envoyerEmail;

  routeur.post('/signalements', async (req, res) => {
    const v = validerSignalement(req.body);
    if (v.erreur) return res.status(400).json({ erreur: v.erreur });
    const s = v.valeur;
    const id = crypto.randomUUID();
    const maintenant = new Date().toISOString();
    db.prepare(`INSERT INTO signalements (id, created_at, updated_at, gravite, statut, auteur, action, constat, contexte, capture)
      VALUES (?, ?, ?, ?, 'nouveau', ?, ?, ?, ?, ?)`)
      .run(id, maintenant, maintenant, s.gravite, s.auteur, s.action, s.constat, JSON.stringify(s.contexte), s.capture);

    // Seul un bloquant prévient l'étude sur le moment ; le reste attend le tri dans les Réglages.
    // Un échec d'envoi ne fait jamais perdre le signalement, déjà enregistré.
    let notifie = false;
    let avertissement = '';
    if (s.gravite === 'bloquant' && parametresRepo) {
      const reglages = parametresRepo.lireReglages();
      if (envoiConfigure(reglages) && reglages.copieEmail) {
        const envoi = await envoyer(reglages, reglages.copieEmail, texteNotificationSignalement(s));
        notifie = !!envoi.ok;
        if (envoi.ok && envoi.messageId && typeof parametresRepo.lireCopiesEnAttente === 'function') {
          mettreCopiesEnAttente(parametresRepo, reglages, [envoi.messageId]);
        }
        if (!envoi.ok) avertissement = envoi.erreur || 'Envoi impossible.';
      }
      if (notifie) db.prepare('UPDATE signalements SET notifie = 1 WHERE id = ?').run(id);
    }
    res.status(201).json({ id, createdAt: maintenant, notifie, avertissement });
  });

  // Liste sans les captures (lourdes) : elles se chargent une à une au clic.
  routeur.get('/signalements', (req, res) => {
    const lignes = db.prepare(`SELECT * FROM signalements ORDER BY created_at DESC LIMIT ${MAX_LISTE}`).all();
    res.json({ signalements: lignes.map((l) => ligneVersSignalement(l, false)) });
  });

  // Fichier à transmettre à Claude Code : les signalements d'un statut donné (par défaut ceux qui
  // n'ont pas encore été transmis), captures comprises.
  routeur.get('/signalements/export', (req, res) => {
    const statut = STATUTS.indexOf(req.query.statut) >= 0 ? req.query.statut : 'nouveau';
    const lignes = req.query.statut === 'tous'
      ? db.prepare('SELECT * FROM signalements ORDER BY created_at ASC').all()
      : db.prepare('SELECT * FROM signalements WHERE statut = ? ORDER BY created_at ASC').all(statut);
    res.json({ exporteLe: new Date().toISOString(), signalements: lignes.map((l) => ligneVersSignalement(l, true)) });
  });

  routeur.get('/signalements/:id', (req, res) => {
    const l = db.prepare('SELECT * FROM signalements WHERE id = ?').get(req.params.id);
    if (!l) return res.status(404).json({ erreur: 'Signalement introuvable.' });
    res.json({ signalement: ligneVersSignalement(l, true) });
  });

  // Tri par l'étude : statut, note, version du correctif, doublon. Seuls les champs présents dans
  // la requête changent.
  routeur.patch('/signalements/:id', (req, res) => {
    const l = db.prepare('SELECT * FROM signalements WHERE id = ?').get(req.params.id);
    if (!l) return res.status(404).json({ erreur: 'Signalement introuvable.' });
    const c = req.body && typeof req.body === 'object' ? req.body : {};
    if (c.statut !== undefined && STATUTS.indexOf(c.statut) < 0) return res.status(400).json({ erreur: 'Statut inconnu.' });
    const doublonDe = c.doublonDe !== undefined ? texte(c.doublonDe, 80) : (l.doublon_de || '');
    if (doublonDe && doublonDe === l.id) return res.status(400).json({ erreur: 'Un signalement ne peut pas être son propre doublon.' });
    if (doublonDe && !db.prepare('SELECT 1 FROM signalements WHERE id = ?').get(doublonDe)) {
      return res.status(400).json({ erreur: 'Le signalement d’origine est introuvable.' });
    }
    const statut = c.statut !== undefined ? c.statut : (doublonDe && c.doublonDe !== undefined ? 'doublon' : l.statut);
    db.prepare('UPDATE signalements SET updated_at = ?, statut = ?, note = ?, version_corrige = ?, doublon_de = ? WHERE id = ?')
      .run(new Date().toISOString(), statut,
        c.note !== undefined ? texte(c.note, 2000) : (l.note || ''),
        c.versionCorrige !== undefined ? texte(c.versionCorrige, 40) : (l.version_corrige || ''),
        statut === 'doublon' ? doublonDe : '', l.id);
    res.json({ signalement: ligneVersSignalement(db.prepare('SELECT * FROM signalements WHERE id = ?').get(l.id), false) });
  });

  routeur.delete('/signalements/:id', (req, res) => {
    const r = db.prepare('DELETE FROM signalements WHERE id = ?').run(req.params.id);
    if (!r.changes) return res.status(404).json({ erreur: 'Signalement introuvable.' });
    // Un doublon qui pointait vers le signalement supprimé redevient un signalement à trier.
    db.prepare("UPDATE signalements SET doublon_de = '', statut = 'nouveau' WHERE doublon_de = ?").run(req.params.id);
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = {
  creerRouteurSignalements, validerSignalement, texteNotificationSignalement,
  GRAVITES, STATUTS, LIBELLES_GRAVITE
};
