// @ts-check
'use strict';

// Prénoms et mots du droit pour la pseudonymisation (étude 30/10 : « liste de prénoms + mots du droit », plutôt qu'un modèle local).
// - PRENOMS : prénoms courants en France, écrits sans accent et en minuscules (comparés après `normaliserDemande`). Un prénom de cette
//   liste suivi d'un mot à majuscule (« Marie Dupont ») désigne une personne : les deux mots sont codés, même absents des fiches ; un
//   prénom en tête de phrase aussi. Sont RETIRÉS les prénoms qui sont aussi un mot courant ou un nom de CLAIRE (Claire, Rose, France,
//   Pierre — la pierre —, Marine — la marine —, Olive, Prudence, Constance, Clémence, Aurore, Avril, Margaux…) et les prénoms des collaborateurs (gardés en
//   clair par choix de l'étude).
// - MOTS_DROIT : mots du droit et du notariat écrits avec une majuscule au milieu d'une phrase (« la Cour de cassation », « le Code civil »,
//   « le Vendeur ») : gardés en clair seulement APRÈS UN ARTICLE (« Paul Juge », « Jean Lot » restent des noms) ; dans un document, un titre devant un
//   NOM (« le Vendeur DUPONT ») reste lisible et le NOM est codé ; jamais pour un mot des fiches (les mots des fiches passent avant).

const PRENOMS = new Set(`
aaron abel adam adele adeline adrien agathe agnes aicha alain alban albert alexandra alexandre alexis alfred alice alicia aline alix
amandine amaury ambre amelie anais andre andrea angelique annabelle anne annick annie antoine antonin apolline arnaud arthur astrid
audrey augustin aurelie aurelien axel axelle baptiste beatrice benedicte benjamin benoit bernadette bernard bertrand blanche brigitte
bruno camille capucine carine carole caroline cassandre catherine cecile celine charlene charles charlotte chloe christelle christian
christiane christine christophe claude clement clementine colette coline corentin corinne cyril cyrille damien daniel daniele danielle
david delphine denis denise didier dominique dorian dorothee edith edouard elena eliane elisa elisabeth elise eloise elodie eloi emile
emilie emma emmanuel emmanuelle enzo eric erwan estelle ethan etienne eugenie eva evelyne fabien fabienne fabrice fanny florence florent
florian francis francine franck francois francoise frederic frederique gabriel gabrielle gael gaelle gaetan gautier genevieve geoffrey
georges gerald gerard gilbert gilles ginette gisele guillaume guy gwenael gwendoline hector helene henri henriette herve hugo hugues
ines irene isabelle jacqueline jacques jade janine jean jeanne jeannine jerome jessica joel joelle jonathan joseph josette josiane jules
julia julien juliette justine karine kevin laetitia lea leane leila leo leon leonie liam lilian liliane lina lionel lisa loic lola
lorraine louis louise luc lucas lucie lucien lucienne ludovic lydie madeleine maelle maeva manon marc marcel marcelle marguerite
maria marianne marie marielle marion marius martine mathias mathieu mathilde matthieu maurice maxence maxime melanie melissa michel
michele micheline mickael monique morgane muriel mylene nadege nadia nadine natacha nathalie nathan nicolas nicole noemie noel noelle
odette odile olivier oscar pascal pascale patrice patricia patrick paul paule pauline philippe quentin raphael raphaelle raymond regine
remi remy renaud renee richard robert rodolphe roger roland romain romane rosalie roselyne sabine sacha samuel sandra sandrine sarah
sebastien serge severine simon simone solange solene sonia stephane stephanie suzanne sylvain sylvie tanguy theo thibault thierry thomas
timothee tiphaine tristan valentin valentine valerie vanessa veronique victor victoire vincent virginie vivien vivienne xavier yann
yannick yolande yves yvette yvonne zoe
`.trim().split(/\s+/));

const MOTS_DROIT = new Set(`
Article Articles Alinéa Chapitre Titre Section Annexe Annexes Paragraphe Livre Code Codes Civil Civile Pénal Commerce Consommation Urbanisme
Construction Habitation Environnement Rural Forestier Général Impôts Procédure Loi Lois Décret Décrets Ordonnance Arrêté Arrêtés Circulaire
Constitution République Cour Cours Cassation Appel Conseil Constitutionnel Tribunal Tribunaux Judiciaire Administratif Commerciale Chambre
Chambres Plénière Mixte Assemblée Juge Juges Procureur Greffe Greffier Préfet Préfecture Département Région Commune Mairie Maire État Etat
Trésor Trésorerie Service Services Publicité Foncière Foncier Hypothèques Conservation Cadastre Cadastral Domaine Domaines Finances
Vendeur Vendeurs Venderesse Acquéreur Acquéreurs Promettant Promettants Bénéficiaire Bénéficiaires Cédant Cessionnaire Donateur Donataire
Donataires Défunt Défunte Héritier Héritiers Légataire Légataires Usufruitier Usufruitière Nu-propriétaire Nus-propriétaires Indivisaire
Indivisaires Mandant Mandataire Prêteur Emprunteur Emprunteurs Caution Garant Créancier Débiteur Bailleur Preneur Locataire Syndicat
Syndic Copropriétaires Copropriété Règlement Lot Lots Parcelle Parcelles Notaire Notaires Notariat Office Étude Chambre Conseil
Supérieur Interdépartemental Banque Crédit Prêt Offre Hypothèque Privilège Servitude Servitudes Bail Promesse Compromis Vente Acte Actes
Jurisprudence Doctrine Réponse Ministérielle Bulletin Officiel Journal Pièce Pièces Partie Parties Comparant Comparants Intervenant
`.trim().split(/\s+/));

module.exports = { PRENOMS, MOTS_DROIT };
