# Suivi de chantier NRGYS — Guide d'utilisation

Prototype v0.2 — 24/11/2026 (ajout des plans de repérage)

## 1. À quoi sert l'outil

Application pour tablette Android qui sert à mener une visite de chantier MOE et à produire le compte rendu (CR) :

- fiche affaire et liste des intervenants (MOA, entreprises par lot, bureau de contrôle…) ;
- pour chaque visite : présences, diffusion, avancement par lot, remarques générales, date de la prochaine visite ;
- observations par entreprise, avec localisation, échéance, mention « urgent » et photos annotées ;
- **plans de repérage** : fonds de plans en PDF ou en image, avec une puce numérotée par observation ;
- **reprise automatique** : chaque visite reprend les observations non levées des visites précédentes ;
- exports : CR en PDF, CR en Word (.docx) modifiable, observations en Excel, registre complet de l'affaire en Excel.

L'appli fonctionne **sans réseau**. Les données restent **dans la tablette**, sans serveur ni abonnement.

## 2. Déroulé d'une visite

1. **Accueil** → ouvrir l'affaire (ou « + Nouvelle affaire »).
2. Sur la fiche affaire, renseigner les **intervenants** une fois pour toutes. L'ordre de la liste donne l'ordre des lots dans le CR (bouton ↑). Ajouter si besoin les **plans** (voir § 3).
3. **« + Nouvelle visite »** : la visite reprend le rédacteur, la diffusion et les pourcentages d'avancement de la visite précédente.
4. Onglet **Présences** : toucher Présent / Absent / Excusé pour chaque intervenant ; cocher ou décocher Diffusion.
5. Onglet **Avancement** : curseur de pourcentage et commentaire pour chaque entreprise.
6. Onglet **Observations** :
   - les observations des visites précédentes apparaissent « En cours » ; le bouton **Lever** les passe en « Levée » ;
   - **« + Observation »** pour en créer une : entreprise, localisation, texte (le micro du clavier Android permet de dicter), échéance, urgent ;
   - **📷 Prendre une photo** ouvre l'appareil photo ; toucher la photo pour l'annoter (flèche, cercle, cadre, stylo, texte, 6 couleurs, annulation) ;
   - un commentaire de suivi peut être ajouté à chaque visite (« reprise partielle », etc.).
7. Onglet **Plans** : ouvrir un plan et toucher l'endroit d'un constat pour créer l'observation directement à cet emplacement (voir § 3).
8. Onglet **Général** : remarques générales, prochaine visite.
9. Onglet **CR / Exports** : générer le CR.

Tout est enregistré automatiquement à chaque saisie : pas de bouton « Enregistrer ».

## 3. Plans de repérage

**Ajouter des plans** : fiche affaire → section **Plans** → « + Ajouter des plans (PDF ou image) ».

- Un PDF de plusieurs pages donne un plan par page.
- Chaque plan peut être renommé (par exemple « RDC – CVC ») et classé avec le bouton ↑.
- Les plans sont importés en image, avec un grand côté de 6 000 pixels au plus. Un plan A0 très détaillé peut perdre en finesse : préférer un PDF par niveau et par lot.

**Placer des puces** :

- Onglet **Plans** de la visite → ouvrir un plan. On zoome avec deux doigts et on se déplace avec un doigt ; les boutons − / + / « Tout voir » font de même.
- **Toucher le plan** à l'endroit voulu → « Créer l'observation » : la fiche s'ouvre et la puce porte le numéro de l'observation.
- **Toucher une puce** affiche l'observation (entreprise, texte, suivi) : « Ouvrir la fiche » ou « Déplacer ».
- Une observation existante se place depuis sa fiche : section **Repérage sur plan** → choisir le plan, puis toucher l'emplacement. Depuis la fiche, on peut aussi voir, déplacer ou retirer la puce.
- Couleur des puces : **bleu** = nouvelle, **orange** = en cours, **vert** = levée. Les observations levées lors d'une visite précédente n'apparaissent plus.

**Dans les exports** :

- le CR (PDF et Word) comporte une partie « Plans de repérage » avec chaque plan qui porte au moins une puce ;
- la colonne Localisation du CR indique le plan ;
- les fichiers Excel ont une colonne « Plan ».

Supprimer un plan conserve les observations : elles perdent seulement leur puce.

## 4. Les exports

| Export | Usage | Comment |
|---|---|---|
| CR en PDF | Diffusion directe | Aperçu d'impression Android → « Enregistrer au format PDF » |
| CR en Word | Relecture et retouches sur PC | Menu de partage : OneDrive, Outlook, Teams… |
| Observations de la visite (Excel) | Suivi, tri, filtres | Menu de partage |
| Registre des observations (Excel) | Historique complet de l'affaire | Depuis la fiche affaire |

Contenu du CR :

- en-tête NRGYS ;
- identité de l'affaire ;
- présences et diffusion ;
- avancement ;
- observations par lot : n°, visite d'émission, localisation et plan, texte, échéance, statut (Nouvelle / En cours / Levée), commentaire de suivi et photos ;
- plans de repérage avec les puces (s'il y en a) ;
- remarques générales et prochaine visite.

Une observation levée figure une dernière fois au CR de sa levée, sans photo, puis disparaît des CR suivants.

## 5. Sauvegarde — à faire régulièrement

Les données ne sont **que dans la tablette**. Si on efface les données du navigateur, si on désinstalle l'appli ou si la tablette casse, tout est perdu.

- Accueil → **Sauvegarder** : crée un fichier `AAAAMMJJ_Sauvegarde_suivi_chantier.json` (avec les photos et les plans) à ranger sur OneDrive.
- **Restaurer un fichier** : recharge une sauvegarde sur la même tablette ou sur une autre. Les éléments existants de même identifiant sont remplacés ; les autres sont conservés.
- Un bandeau orange s'affiche quand la dernière sauvegarde date de plus de 7 jours.

Pour passer une affaire à un collègue : il restaure votre sauvegarde sur sa tablette.

## 6. Installation sur les tablettes

L'appli doit être publiée sur une adresse **HTTPS** pour être installable et fonctionner hors ligne. Seul le code est publié : les données de chantier ne quittent jamais la tablette.

**Adresse de l'appli : https://bph-nrgys.github.io/suivi-chantier/**

L'appli est publiée sur **GitHub Pages** (gratuit), depuis le dépôt https://github.com/BPH-NRGYS/suivi-chantier. Le code y est public ; aucune donnée client n'y figure. Chaque envoi de code sur la branche `main` remet l'appli en ligne en une à deux minutes.

Une fois l'appli publiée, sur chaque tablette :

1. ouvrir l'adresse dans **Chrome** ;
2. menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil ») ;
3. ouvrir l'appli une fois avec du réseau. Elle fonctionne ensuite sans réseau.

**Essai sur PC** (sans publication) : `node serve.js` dans le dossier `C:\00_Dev\suivi-chantier`, puis ouvrir http://localhost:8080 dans Chrome ou Edge. En mode tablette (F12 → icône tablette), l'affichage est proche du rendu réel.

## 7. Limites du prototype et points à valider

| Point | État | À faire |
|---|---|---|
| Format du CR | Proposé sans modèle NRGYS | **À fournir :** un CR de visite actuel pour aligner rubriques et formulations |
| Liste des lots | Libre (saisie par intervenant) | **À fournir :** liste standard des lots et codes, si elle existe |
| Mention en fin de CR | Vide par défaut, réglable | **À fournir :** texte type, par exemple le délai de contestation du CR |
| Tests sur tablette réelle | Testé sur PC, dans un navigateur au format tablette, et hors ligne dans Edge | **À tester :** appareil photo, dictée et impression PDF sur la tablette Android de l'équipe |
| Hébergement | Publié sur GitHub Pages (voir § 6) | Passage sur Azure possible plus tard, si l'informatique le demande |
| Synchronisation entre tablettes | Non prévue (sauvegarde manuelle) | Version 2 possible (SharePoint ou OneDrive) |
| Diagnostic de l'existant | Hors périmètre v0.1 | Version 2 : relevé des équipements |
| Plans | Puces d'observations sur plans PDF ou image (v0.2) | **À tester** sur de vrais plans d'affaire (lisibilité après import, poids) |
| Volume | Sauvegarde en un seul fichier | Au-delà de quelques centaines de photos, le fichier devient lourd |

## 8. Maintenance (pour qui reprendra le code)

- Code dans `C:\00_Dev\suivi-chantier\app\`. HTML, CSS et JavaScript simples, sans étape de compilation. Seule dépendance : **PDF.js 4.10.38** (Mozilla, licence Apache 2.0), copiée dans `lib/pdfjs/` pour la lecture des plans PDF.
- `js/model.js` : règles métier (numérotation, statut des observations à une visite donnée).
- `js/export-docx.js`, `js/export-xlsx.js` : génération Word et Excel (fichiers Office construits directement).
- `js/export-pdf.js` + fin de `css/app.css` : mise en page du CR PDF.
- `js/annot.js` : éditeur d'annotation des photos.
- `js/plans.js` : import des plans, visionneuse avec zoom et puces, image des plans pour les CR.
- **À chaque mise à jour publiée**, changer `VERSION` dans `sw.js` (actuellement v2) pour que les tablettes récupèrent la nouvelle version.
