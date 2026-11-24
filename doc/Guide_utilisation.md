# Suivi de chantier NRGYS — Guide d'utilisation

Prototype v0.1 — 24/11/2026

## 1. À quoi sert l'outil

Application pour tablette Android qui sert à mener une visite de chantier MOE et à produire le compte rendu (CR) :

- fiche affaire et liste des intervenants (MOA, entreprises par lot, bureau de contrôle…) ;
- pour chaque visite : présences, diffusion, avancement par lot, remarques générales, date de la prochaine visite ;
- observations par entreprise, avec localisation, échéance, mention « urgent » et photos annotées ;
- **reprise automatique** : chaque visite reprend les observations non levées des visites précédentes ;
- exports : CR en PDF, CR en Word (.docx) modifiable, observations en Excel, registre complet de l'affaire en Excel.

L'appli fonctionne **sans réseau**. Les données restent **dans la tablette**, sans serveur ni abonnement.

## 2. Déroulé d'une visite

1. **Accueil** → ouvrir l'affaire (ou « + Nouvelle affaire »).
2. Sur la fiche affaire, renseigner les **intervenants** une fois pour toutes. L'ordre de la liste donne l'ordre des lots dans le CR (bouton ↑).
3. **« + Nouvelle visite »** : la visite reprend le rédacteur, la diffusion et les pourcentages d'avancement de la visite précédente.
4. Onglet **Présences** : toucher Présent / Absent / Excusé pour chaque intervenant ; cocher ou décocher Diffusion.
5. Onglet **Avancement** : curseur de pourcentage et commentaire pour chaque entreprise.
6. Onglet **Observations** :
   - les observations des visites précédentes apparaissent « En cours » ; le bouton **Lever** les passe en « Levée » ;
   - **« + Observation »** pour en créer une : entreprise, localisation, texte (le micro du clavier Android permet de dicter), échéance, urgent ;
   - **📷 Prendre une photo** ouvre l'appareil photo ; toucher la photo pour l'annoter (flèche, cercle, cadre, stylo, texte, 6 couleurs, annulation) ;
   - un commentaire de suivi peut être ajouté à chaque visite (« reprise partielle », etc.).
7. Onglet **Général** : remarques générales, prochaine visite.
8. Onglet **CR / Exports** : générer le CR.

Tout est enregistré automatiquement à chaque saisie : pas de bouton « Enregistrer ».

## 3. Les exports

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
- observations par lot : n°, visite d'émission, localisation, texte, échéance, statut (Nouvelle / En cours / Levée), commentaire de suivi et photos ;
- remarques générales et prochaine visite.

Une observation levée figure une dernière fois au CR de sa levée, sans photo, puis disparaît des CR suivants.

## 4. Sauvegarde — à faire régulièrement

Les données ne sont **que dans la tablette**. Si on efface les données du navigateur, si on désinstalle l'appli ou si la tablette casse, tout est perdu.

- Accueil → **Sauvegarder** : crée un fichier `AAAAMMJJ_Sauvegarde_suivi_chantier.json` (avec les photos) à ranger sur OneDrive.
- **Restaurer un fichier** : recharge une sauvegarde sur la même tablette ou sur une autre. Les éléments existants de même identifiant sont remplacés ; les autres sont conservés.
- Un bandeau orange s'affiche quand la dernière sauvegarde date de plus de 7 jours.

Pour passer une affaire à un collègue : il restaure votre sauvegarde sur sa tablette.

## 5. Installation sur les tablettes

L'appli doit être publiée sur une adresse **HTTPS** pour être installable et fonctionner hors ligne. Seul le code est publié : les données de chantier ne quittent jamais la tablette.

**À décider avec l'informatique de NRGYS :**

- **Option A — Azure Static Web Apps** (offre gratuite) : dans l'environnement Microsoft de NRGYS. C'est mon option recommandée.
- **Option B — GitHub Pages** (gratuit) : plus simple, mais le code est public. Aucune donnée client n'y figure.

Une fois l'appli publiée, sur chaque tablette :

1. ouvrir l'adresse dans **Chrome** ;
2. menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil ») ;
3. ouvrir l'appli une fois avec du réseau. Elle fonctionne ensuite sans réseau.

**Essai sur PC** (sans publication) : `node serve.js` dans le dossier `C:\00_Dev\suivi-chantier`, puis ouvrir http://localhost:8080 dans Chrome ou Edge. En mode tablette (F12 → icône tablette), l'affichage est proche du rendu réel.

## 6. Limites du prototype et points à valider

| Point | État | À faire |
|---|---|---|
| Format du CR | Proposé sans modèle NRGYS | **À fournir :** un CR de visite actuel pour aligner rubriques et formulations |
| Liste des lots | Libre (saisie par intervenant) | **À fournir :** liste standard des lots et codes, si elle existe |
| Mention en fin de CR | Vide par défaut, réglable | **À fournir :** texte type, par exemple le délai de contestation du CR |
| Tests sur tablette réelle | Testé sur PC, dans un navigateur au format tablette, et hors ligne dans Edge | **À tester :** appareil photo, dictée et impression PDF sur la tablette Android de l'équipe |
| Hébergement | Non publié | **Décision :** Azure ou GitHub (voir § 5) |
| Synchronisation entre tablettes | Non prévue (sauvegarde manuelle) | Version 2 possible (SharePoint ou OneDrive) |
| Diagnostic de l'existant | Hors périmètre v0.1 | Version 2 : relevé des équipements |
| Plans | Non gérés | Version 2 possible : placer les observations sur un plan PDF |
| Volume | Sauvegarde en un seul fichier | Au-delà de quelques centaines de photos, le fichier devient lourd |

## 7. Maintenance (pour qui reprendra le code)

- Code dans `C:\00_Dev\suivi-chantier\app\`. HTML, CSS et JavaScript simples, **sans aucune dépendance** ni étape de compilation.
- `js/model.js` : règles métier (numérotation, statut des observations à une visite donnée).
- `js/export-docx.js`, `js/export-xlsx.js` : génération Word et Excel (fichiers Office construits directement).
- `js/export-pdf.js` + fin de `css/app.css` : mise en page du CR PDF.
- `js/annot.js` : éditeur d'annotation des photos.
- **À chaque mise à jour publiée**, changer `VERSION` dans `sw.js` (v1 → v2…) pour que les tablettes récupèrent la nouvelle version.
