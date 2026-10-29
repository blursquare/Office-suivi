'use strict';

// Claude pilote Authentic (étude 29/10, authenticPilote.js) : la boucle, les refus de la garde, l'allègement de l'historique. Faux navigateur, faux client Claude :
// aucune connexion réelle.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/authenticPilote');

/** Faux navigateur : `sous` = ce que la page montre sous le pointeur, `envoi` = l'état des « Envoi immédiat », `champ` = le champ actif. */
function fauxNavigateur(o = {}) {
  const faits = { clics: [], touches: [], textes: [] };
  const s = {
    faits,
    capture: async () => 'JPEGBASE64',
    attendreStable: async () => {},
    ongletActif: () => ({ session: 'x' }),
    cliquerPosition: async (x, y) => { faits.clics.push([x, y]); },
    cdp: { envoyer: async (m, p) => { if (m === 'Input.insertText') faits.textes.push(p.text); if (m === 'Input.dispatchKeyEvent' && p.type === 'keyDown') faits.touches.push(p.key); } },
    evaluer: async (expr) => {
      if (/interactifSel/.test(expr)) {
        const base = o.sous || { vide: false, bouton: 'Naissance', texte: '', motDePasse: false, controle: true, lisible: true, opaque: false, estBascule: false };
        // Un interrupteur sous le pointeur : le relevé de la page dit « c'est un interrupteur » (la liste des interrupteurs dit lequel).
        const rep = Object.assign({}, base, base.bascule ? { estBascule: true } : {});
        if (o.changeApres && (o.lectures = (o.lectures || 0) + 1) % 2 === 0) rep.bouton = 'autre chose';
        return rep;
      }
      // Les interrupteurs de la page (mêmes lectures que les parcours écrits) : les « Envoi immédiat » demandés, plus l'interrupteur sous le pointeur (5, 5).
      if (/ui-toggleswitch/.test(expr)) {
        const e = o.envoi || { nombre: 1, tousEteints: true };
        const liste = Array.from({ length: e.nombre }, (_, k) => ({ libelle: 'Envoi immédiat :', coche: !e.tousEteints, x: 600 + k * 50, y: 600, l: 40, h: 20 }));
        if (o.sous && o.sous.bascule) liste.push({ libelle: o.sous.bascule.libelle, coche: o.sous.bascule.coche, x: 5, y: 5, l: 40, h: 20 });
        return liste;
      }
      if (/activeElement/.test(expr)) return o.champ || { saisie: true, motDePasse: false, recherche: true };
      return null;
    }
  };
  return s;
}

/** Faux client Claude : rend les appels prévus dans l'ordre et garde chaque requête. */
function fauxClient(appels) {
  const requetes = [];
  return { requetes, messages: { create: async (req) => {
    requetes.push(JSON.parse(JSON.stringify(req)));
    const a = appels.shift();
    return { content: a ? [{ type: 'tool_use', id: 'u' + requetes.length, name: a[0], input: a[1] }] : [{ type: 'text', text: 'rien' }], usage: { input_tokens: 1000 } };
  } } };
}

const base = (s, client, extra = {}) => ({ s, client, consigne: 'Coche la naissance de la première personne.', etape: () => {}, annule: () => false, attendre: async () => {}, ...extra });

test('la boucle : clic, écriture, terminer — le compte rendu revient, une capture suit chaque geste', async () => {
  const s = fauxNavigateur();
  const client = fauxClient([['cliquer', { x: 400, y: 300 }], ['ecrire', { texte: '123' }], ['terminer', { etat: 'fait', compte_rendu: 'Coché.' }]]);
  const r = await P.piloter(base(s, client));
  assert.deepEqual([r.etat, r.compte, r.pas], ['fait', 'Coché.', 3]);
  assert.deepEqual(s.faits.clics, [[400, 300]]);
  assert.deepEqual(s.faits.textes, ['123']);
  const second = client.requetes[1].messages;
  assert.equal(second[second.length - 1].content[0].content.some((x) => x.type === 'image'), true, 'la capture revient après le geste');
  assert.equal(client.requetes[0].tool_choice.type, 'auto', 'Opus 5.5 refuse « any » et « tool » (400 du 29/10)');
});

test('« Valider » est refusé tant qu’« Envoi immédiat » n’est pas lu éteint ; permis dès qu’il l’est', async () => {
  const sous = { vide: false, bouton: 'Valider', texte: 'Valider', motDePasse: false, bascule: null };
  const s1 = fauxNavigateur({ sous, envoi: { nombre: 1, tousEteints: false } });
  const c1 = fauxClient([['cliquer', { x: 10, y: 10 }], ['terminer', { etat: 'partiel', compte_rendu: 'Arrêté.' }]]);
  await P.piloter(base(s1, c1));
  assert.deepEqual(s1.faits.clics, [], 'aucun clic fait');
  assert.match(JSON.stringify(c1.requetes[1].messages), /REFUSÉ par le contrôle de CLAIRE/);
  const s2 = fauxNavigateur({ sous, envoi: { nombre: 1, tousEteints: true } });
  await P.piloter(base(s2, fauxClient([['cliquer', { x: 10, y: 10 }], ['terminer', { etat: 'fait', compte_rendu: 'ok' }]])));
  assert.deepEqual(s2.faits.clics, [[10, 10]]);
  const s3 = fauxNavigateur({ sous, envoi: { nombre: 0, tousEteints: false } });
  await P.piloter(base(s3, fauxClient([['cliquer', { x: 10, y: 10 }], ['terminer', { etat: 'partiel', compte_rendu: 'x' }]])));
  assert.deepEqual(s3.faits.clics, [], 'sans « Envoi immédiat » visible, jamais de Valider');
});

test('jamais envoyer, signer, supprimer ; jamais allumer « Envoi immédiat » ; l’éteindre est permis', async () => {
  for (const bouton of ['Envoyer', 'Signer', 'Supprimer le dossier', 'Archiver', 'Télécharger']) {
    const s = fauxNavigateur({ sous: { vide: false, bouton, texte: bouton, motDePasse: false, bascule: null } });
    await P.piloter(base(s, fauxClient([['cliquer', { x: 5, y: 5 }], ['terminer', { etat: 'partiel', compte_rendu: 'x' }]])));
    assert.deepEqual(s.faits.clics, [], bouton + ' refusé');
  }
  const allume = fauxNavigateur({ sous: { vide: false, bouton: '', texte: '', motDePasse: false, bascule: { libelle: 'Envoi immédiat', coche: false } } });
  await P.piloter(base(allume, fauxClient([['cliquer', { x: 5, y: 5 }], ['terminer', { etat: 'partiel', compte_rendu: 'x' }]])));
  assert.deepEqual(allume.faits.clics, [], 'allumer l’envoi est refusé');
  const eteint = fauxNavigateur({ sous: { vide: false, bouton: '', texte: '', motDePasse: false, bascule: { libelle: 'Envoi immédiat', coche: true } } });
  await P.piloter(base(eteint, fauxClient([['cliquer', { x: 5, y: 5 }], ['terminer', { etat: 'fait', compte_rendu: 'x' }]])));
  assert.deepEqual(eteint.faits.clics, [[5, 5]], 'l’éteindre est permis');
});

test('jamais de saisie dans un mot de passe ni hors champ ; Entrée seulement dans un champ et sans envoi allumé', async () => {
  const mdp = fauxNavigateur({ champ: { saisie: false, motDePasse: true } });
  await P.piloter(base(mdp, fauxClient([['ecrire', { texte: 'secret' }], ['terminer', { etat: 'partiel', compte_rendu: 'x' }]])));
  assert.deepEqual(mdp.faits.textes, []);
  const envoi = fauxNavigateur({ envoi: { nombre: 1, tousEteints: false } });
  await P.piloter(base(envoi, fauxClient([['touche', { nom: 'Entree' }], ['terminer', { etat: 'partiel', compte_rendu: 'x' }]])));
  assert.deepEqual(envoi.faits.touches, [], 'Entrée refusée avec un envoi allumé');
  const ok = fauxNavigateur();
  await P.piloter(base(ok, fauxClient([['touche', { nom: 'Entree' }], ['touche', { nom: 'Echap' }], ['terminer', { etat: 'fait', compte_rendu: 'x' }]])));
  assert.deepEqual(ok.faits.touches, ['Enter', 'Escape']);
  const mdpClic = fauxNavigateur({ sous: { vide: false, bouton: '', texte: '', motDePasse: true, bascule: null } });
  await P.piloter(base(mdpClic, fauxClient([['cliquer', { x: 1, y: 1 }], ['terminer', { etat: 'partiel', compte_rendu: 'x' }]])));
  assert.deepEqual(mdpClic.faits.clics, []);
});

test('limites : arrêt demandé, pas au-delà du maximum, historique allégé (captures anciennes retirées), coordonnées bornées', async () => {
  const s = fauxNavigateur();
  const arret = await P.piloter(base(s, fauxClient([['cliquer', { x: 1, y: 1 }]]), { annule: () => true }));
  assert.equal(arret.etat, 'impossible');
  const infini = fauxClient(Array.from({ length: 60 }, () => ['attendre', { secondes: 1 }]));
  const r = await P.piloter(base(fauxNavigateur(), infini));
  assert.equal(r.pas, P.MAX_PAS);
  assert.equal(r.etat, 'partiel');
  const derniere = infini.requetes[infini.requetes.length - 1].messages;
  const images = JSON.stringify(derniere).match(/"type":"image"/g) || [];
  assert.ok(images.length <= 3, 'au plus quelques captures dans l’historique : ' + images.length);
  assert.equal(P.borner(5000, 1280), 1279);
  assert.equal(P.borner(-4, 800), 0);
  const s2 = fauxNavigateur();
  await P.piloter(base(s2, fauxClient([['cliquer', { x: 99999, y: -5 }], ['terminer', { etat: 'fait', compte_rendu: 'x' }]])));
  assert.deepEqual(s2.faits.clics, [[1279, 0]]);
});

test('le prompt dit les règles et les outils ne portent ni envoi ni validation propres', () => {
  assert.match(P.SYSTEME, /JAMAIS un bouton qui envoie, signe/);
  assert.match(P.SYSTEME, /Envoi immédiat/);
  assert.deepEqual(P.OUTILS.map((o) => o.name), ['cliquer', 'ecrire', 'touche', 'defiler', 'attendre', 'consulter_wiki', 'terminer']);
});

test('audit 0.397.0 : un contrôle sans libellé, un cadre, un interrupteur non identifié, une page qui change sous le pointeur sont refusés ; Entrée seulement en recherche', async () => {
  const essai = async (o, appels) => { const s = fauxNavigateur(o); await P.piloter(base(s, fauxClient([...appels, ['terminer', { etat: 'partiel', compte_rendu: 'x' }]]))); return s; };
  const sansLibelle = await essai({ sous: { vide: false, bouton: '', texte: '', motDePasse: false, controle: true, lisible: false, opaque: false, estBascule: false } }, [['cliquer', { x: 9, y: 9 }]]);
  assert.deepEqual(sansLibelle.faits.clics, [], 'H1 : bouton sans aucun libellé lisible = refusé');
  const cadre = await essai({ sous: { vide: false, bouton: 'Naissance', texte: '', motDePasse: false, controle: true, lisible: true, opaque: true, estBascule: false } }, [['cliquer', { x: 9, y: 9 }]]);
  assert.deepEqual(cadre.faits.clics, [], 'H1 : cadre / canevas = refusé');
  const inconnu = await essai({ sous: { vide: false, bouton: '', texte: '', motDePasse: false, controle: false, lisible: false, opaque: false, estBascule: true } }, [['cliquer', { x: 300, y: 300 }]]);
  assert.deepEqual(inconnu.faits.clics, [], 'H2 : interrupteur que la page ne sait pas identifier = refusé');
  // H3 : un « Valider » collé à un interrupteur n'est pas pris pour l'interrupteur (seul l'intérieur de sa boîte compte).
  const voisin = fauxNavigateur({ sous: { vide: false, bouton: 'Valider', texte: 'Valider', motDePasse: false, controle: true, lisible: true, opaque: false, estBascule: false }, envoi: { nombre: 1, tousEteints: false } });
  await P.piloter(base(voisin, fauxClient([['cliquer', { x: 600, y: 600 }], ['terminer', { etat: 'partiel', compte_rendu: 'x' }]])));
  assert.deepEqual(voisin.faits.clics, [], 'H3 : Valider refusé même sur la position de l’interrupteur voisin');
  const changeant = await essai({ changeApres: true }, [['cliquer', { x: 9, y: 9 }]]);
  assert.deepEqual(changeant.faits.clics, [], 'M2 : la page change entre la lecture et le clic = refusé');
  // H4 : Entrée refusée hors champ de recherche.
  const enter = await essai({ champ: { saisie: true, motDePasse: false, recherche: false } }, [['touche', { nom: 'Entree' }]]);
  assert.deepEqual(enter.faits.touches, [], 'H4 : Entrée refusée hors champ de recherche');
  const enterOk = await essai({ champ: { saisie: true, motDePasse: false, recherche: true } }, [['touche', { nom: 'Entree' }]]);
  assert.deepEqual(enterOk.faits.touches, ['Enter']);
  const confirmer = await essai({ sous: { vide: false, bouton: 'Confirmer', texte: 'Confirmer', motDePasse: false, controle: true, lisible: true, opaque: false, estBascule: false }, envoi: { nombre: 0, tousEteints: false } }, [['cliquer', { x: 9, y: 9 }]]);
  assert.deepEqual(confirmer.faits.clics, [], 'M1 : « Confirmer » traité comme « Valider »');
});

test('une réponse sans outil est relancée une fois (tool_choice auto), puis la boucle s’arrête', async () => {
  const s = fauxNavigateur();
  const client = fauxClient([]);   // le faux client ne rend que du texte
  const r = await P.piloter(base(s, client));
  assert.equal(r.etat, 'partiel');
  assert.equal(client.requetes.length, 2, 'un seul rappel');
  assert.match(JSON.stringify(client.requetes[1].messages), /Réponds par un outil/);
});
