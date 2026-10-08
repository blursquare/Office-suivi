  // ===== Contrôle de l'urbanisme dans la relecture d'actes (étude 08/10 : « intègre cela à l'outil droit de préemption, appelle
  // cela contrôle de l'urbanisme, et dans un second temps à l'outil relecture d'actes »). Quand la relecture est liée à un
  // dossier, ce que l'outil « Contrôle de l'urbanisme » a gardé sur la fiche (d.preemption : droits de préemption, monuments
  // historiques et sites protégés) est confronté au texte relu : un droit à purger dont l'acte ne parle pas, un bien en zone
  // protégée que l'acte ne signale pas, des travaux extérieurs déclarés en zone protégée sans accord de l'architecte des
  // bâtiments de France. Sans dossier lié, ou sans analyse sur la fiche, rien n'est dit (pas de bruit).

  // Ce que l'acte doit citer pour qu'un droit soit regardé comme traité (purge, renonciation, notification, réponse).
  var MENTIONS_DROITS_URBANISME = {
    dpu: /droit\s+de\s+pr[ée]emption\s+urbain|\bDPU\b|d[ée]claration\s+d.intention\s+d.ali[ée]ner|\bDIA\b/i,
    safer: /\bSAFER\b|soci[ée]t[ée]\s+d.am[ée]nagement\s+foncier/i,
    foret: /droit\s+de\s+pr[ée]f[ée]rence|pr[ée]emption[^.]{0,60}(?:bois|for[êe]t)|(?:bois|for[êe]ts?)[^.]{0,60}pr[ée]emption|L\.?\s*331-(?:19|2[0-4])/i
  };
  var RE_PATRIMOINE_DANS_ACTE = /monuments?\s+historiques?|abords\s+(?:d.un|des?)\s+monument|p[ée]rim[èe]tre\s+d[ée]limit[ée]\s+des\s+abords|sites?\s+(?:inscrits?|class[ée]s?)|site\s+patrimonial\s+remarquable|architecte\s+des\s+b[âa]timents\s+de\s+France|\bABF\b|\bAC\s*[124]\b/i;
  var RE_ACCORD_ABF = /architecte\s+des\s+b[âa]timents\s+de\s+France|\bABF\b|accord\s+de\s+l.architecte/i;

  // Pure : les constats du contrôle de l'urbanisme. mode = 'acte' (projet de vente) ou 'compromis'.
  function constatsControleUrbanisme(entree) {
    const e = entree || {};
    const p = e.preemption;
    if (!p || typeof p !== 'object' || !Array.isArray(p.droits)) return [];
    const texte = String(e.texte || '');
    const acte = e.mode === 'acte';
    const constats = [];
    const droits = droitsPreemptionFiche(p).filter(dr => dr && (dr.statut === 'oui' || dr.statut === 'probable'));
    for (const dr of droits) {
      const re = MENTIONS_DROITS_URBANISME[dr.cle];
      if (!re || re.test(texte)) continue;
      constats.push({
        categorie: 'CONTROLE_URBANISME',
        gravite: acte ? 'IMPORTANT' : 'A_VERIFIER',
        titre: `${dr.titre} à purger : non mentionné dans ${acte ? "l'acte" : "l'avant-contrat"}`,
        description: `Le contrôle de l'urbanisme de la fiche retient ce droit${dr.motif ? ' (' + dr.motif + ')' : ''}. ${acte ? "L'acte doit relater la purge (notification et renonciation ou délai expiré)." : "L'avant-contrat doit le prévoir (condition de non-exercice)."}${dr.formalite ? ' Formalité : ' + dr.formalite : ''}`
      });
    }
    const patrimoine = lignePatrimoinePreemption(p.patrimoine);
    if (patrimoine && patrimoine.statut === 'oui') {
      const exterieurs = (e.travaux || []).filter(t => t && (t.exterieur || t.grosOeuvre) && !RE_ACCORD_ABF.test(t.phrase || ''));
      // Un seul point, quel que soit le nombre de clauses : la même déclaration est souvent reprise de l'avant-contrat au projet.
      if (exterieurs.length) {
        const t = exterieurs[0];
        constats.push({
          categorie: 'CONTROLE_URBANISME', gravite: 'IMPORTANT',
          titre: `Travaux en zone protégée (${patrimoine.titre.toLowerCase()}) : accord de l'architecte des bâtiments de France non mentionné`,
          description: `${patrimoine.motif}. Des travaux extérieurs ou de gros œuvre y exigent l'accord de l'architecte des bâtiments de France : le réclamer avec l'autorisation d'urbanisme.${exterieurs.length > 1 ? ` ${exterieurs.length} clauses de travaux concernées.` : ''}`,
          phrase: t.phrase, page: t.page
        });
      }
      if (!RE_PATRIMOINE_DANS_ACTE.test(texte)) {
        constats.push({
          categorie: 'CONTROLE_URBANISME', gravite: 'A_VERIFIER',
          titre: `Bien en zone protégée (${patrimoine.titre.toLowerCase()}) : non signalé dans ${acte ? "l'acte" : "l'avant-contrat"}`,
          description: `${patrimoine.motif}. ${patrimoine.conseil}`
        });
      }
    }
    return constats;
  }
