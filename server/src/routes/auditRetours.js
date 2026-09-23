'use strict';

// Commentaires de l'étude sur les rapports de relecture d'actes (Outil 2), recueillis par le
// « mode commentaires » de script.js. Demande de l'étude : « un mode où je pourrais pendant un
// temps mettre des commentaires, pour que tu puisses analyser les retours et ajuster pour les
// suivants et ne plus faire les mêmes erreurs. Parfois les commentaires peuvent être liés
// uniquement au dossier. Je pourrais justifier pourquoi. »
//
// Le serveur ne fait que CONSERVER ces retours (partagés entre les postes, voir parametresRepo) :
// leur effet immédiat sur les rapports suivants (constat replié pour ce dossier ou pour tous) est
// calculé côté client, et leur exploitation de fond — corriger une règle qui se trompe — passe par
// l'export JSON, relu à la main. Rien n'est « appris » automatiquement au-delà de ce repli.

const express = require('express');
const { assainirRetourAudit } = require('../parametresRepo');

function creerRouteurAuditRetours(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/audit-retours', (req, res) => {
    res.json({ retours: parametresRepo.lireRetoursAudit() });
  });

  routeur.post('/audit-retours', (req, res) => {
    const retour = assainirRetourAudit(req.body);
    if (!retour) {
      return res.status(400).json({ erreur: 'Commentaire incomplet : un verdict est requis, et un texte pour signaler un oubli.' });
    }
    // Un même constat ne porte qu'UN avis par portée : le redonner remplace le précédent (l'étude
    // change d'avis, elle ne cumule pas).
    const liste = parametresRepo.lireRetoursAudit().filter((r) => r.id !== retour.id);
    liste.push(retour);
    parametresRepo.ecrireRetoursAudit(liste);
    res.status(201).json({ retour });
  });

  routeur.delete('/audit-retours/:id', (req, res) => {
    const liste = parametresRepo.lireRetoursAudit();
    const restants = liste.filter((r) => r.id !== req.params.id);
    if (restants.length === liste.length) return res.status(404).json({ erreur: 'Commentaire introuvable.' });
    parametresRepo.ecrireRetoursAudit(restants);
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = { creerRouteurAuditRetours };
