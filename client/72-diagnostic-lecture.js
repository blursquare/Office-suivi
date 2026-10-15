  // ---- Diagnostic de la lecture d'un compromis (15/10) : « Copier le texte lu (anonymisé) » ----
  // Quand une donnée (prix, agence…) ne sort pas, le développeur n'a que la description du testeur. Ce bouton copie les passages utiles
  // du texte lu, anonymisés sur le poste avant de sortir : emails, téléphones, IBAN retirés ; tout mot en capitales ou à majuscule
  // (noms, communes, agences) remplacé par sa FORME (« Aaaa », « AAAA ») sauf un vocabulaire d'acte ; montants et dates gardés.

  var MOTS_GARDES_DIAGNOSTIC = /^(?:le|la|les|un|une|des|du|de|d|l|au|aux|et|ou|en|sur|sous|par|pour|dans|vente|prix|principal|mandataire|mandant|vendeur|vendeurs|acqu[ée]reur|acqu[ée]reurs|promettant|b[ée]n[ée]ficiaire|promesse|compromis|avant|contrat|localisation|d[ée]signation|adresse|bien|biens|immeuble|signature|signatures|fait|lieu|agence|immobili[èe]re|honoraires|charge|montant|euros?|eur|pr[êe]t|obtention|condition|suspensive|r[ée]alisation|r[ée]it[ée]ration|acte|authentique|notaire|office|notarial|cadastre|section|mobilier|mobiliers|immobiliers?|concurrence|garantie|financi[èe]re|carte|professionnelle|titre|article|page|annexe|annexes)$/i;

  // Pure : les passages utiles d'un texte lu, anonymisés. Rend '' si le texte est vide.
  function diagnosticTexteLuAnonymise(texte) {
    const source = String(texte || '');
    if (!source.trim()) return '';
    const masquer = (t) => t
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
      .replace(/(?:\+33|0033|\b0)[\s.]?[1-9](?:[\s.]?\d{2}){4}\b/g, '[tel]')
      .replace(/\bFR\d{2}(?:[\s]?[A-Z0-9]{4}){4,7}[\s]?[A-Z0-9]{1,4}\b/g, '[iban]')
      .replace(/[A-Za-zÀ-ÿ]{3,}/g, (mot, pos, tout) => {
        if (MOTS_GARDES_DIAGNOSTIC.test(mot)) return mot;
        const majuscule = mot[0] === mot[0].toUpperCase() && mot[0] !== mot[0].toLowerCase();
        if (!majuscule) return mot;
        if (mot === mot.toUpperCase()) return 'A'.repeat(mot.length);
        // Début de phrase ou de ligne : un mot ordinaire à majuscule (« La », « Ce ») n'est pas un nom.
        const avant = tout.slice(Math.max(0, pos - 3), pos);
        if (pos === 0 || /(?:^|[\n.:;]\s*)$/.test(avant) || /[\n.]\s*$/.test(tout.slice(Math.max(0, pos - 3), pos))) return mot;
        return mot[0] + 'a'.repeat(mot.length - 1);
      });
    const re = /prix|mandataire|localisation|adresse\s+des?\s+biens?|r[ée]alis|fait\s+[àa]|signature|obtention|pr[êe]t\b|agence|garantie\s+financi/gi;
    const fenetres = [[0, 1200]];
    let m;
    while ((m = re.exec(source)) !== null) fenetres.push([Math.max(0, m.index - 350), Math.min(source.length, m.index + 450)]);
    fenetres.sort((a, b) => a[0] - b[0]);
    const fusion = [];
    for (const f of fenetres) {
      const dernier = fusion[fusion.length - 1];
      if (dernier && f[0] <= dernier[1]) dernier[1] = Math.max(dernier[1], f[1]); else fusion.push(f.slice());
    }
    let sortie = '';
    for (const f of fusion) {
      sortie += `----- [${f[0]}–${f[1]} / ${source.length}] -----\n${masquer(source.slice(f[0], f[1]))}\n`;
      if (sortie.length > 14000) { sortie += '… (coupé)\n'; break; }
    }
    return sortie;
  }

  function copierDiagnosticTexteLu() {
    const texte = diagnosticTexteLuAnonymise(dernierTexteTraite);
    if (!texte) { afficherToast('Aucun texte lu pour le moment : déposez d’abord un compromis.'); return; }
    const fini = () => afficherToast('Texte lu copié (anonymisé) : à coller dans la conversation.');
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(texte).then(fini, () => copierParZoneAssistant(texte, fini)); return; }
    copierParZoneAssistant(texte, fini);
  }
