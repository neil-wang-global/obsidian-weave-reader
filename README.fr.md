# Weave EPUB Reader

[中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [English](./README.md#english-documentation) | [Español](./README.es.md) | [Français](./README.fr.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md)

<div align="center">

![QQ_1784327250240](https://github.com/user-attachments/assets/dc88b393-76ec-413c-b226-31ab01a7e82a)

![QQ20260718-070731-HD](https://github.com/user-attachments/assets/c1850008-aa57-48e1-b63f-d34a01326a53)

![QQ20260718-064929-HD](https://github.com/user-attachments/assets/5fc7ff83-b8e3-498f-8233-90fbcc94198b)

![QQ_1784328028569](https://github.com/user-attachments/assets/1185b662-3f91-4dee-b552-e53e3ebcb25d)

![QQ_1785812351950](https://github.com/user-attachments/assets/5c33039e-7ca4-461b-b258-972561f9789d)

</div>

---

## Introduction

**Weave Epub Reader** est un plugin de lecture de la **série de plugins Obsidian Weave**, conçu entièrement pour Obsidian et disponible sur toutes les plateformes Obsidian. Il prend en charge gratuitement la lecture d’EPUB, TXT, FB2/FBZ, MOBI, AZW3, CBZ, PDF et d’autres formats, ainsi que des extraits annotés de plusieurs types. Les extraits peuvent être enregistrés dans des fichiers **Markdown**, **Canvas** et **paquets Weave**, avec des liens sources bidirectionnels pour sauter au passage correspondant, et les données restent entièrement locales.

En plus des besoins essentiels et de l’expérience de base, les utilisateurs avancés disposent de la **lecture immersive**, de la **lecture par paragraphes**, du **marquage de vocabulaire**, des **résumés d’extraits en chronologie**, des **listes de citations d’extraits** et de **davantage de fonctions**—pour utiliser les outils dans Obsidian, favoriser la réflexion, affûter le jugement et donner du sens à la lecture.

> Astuce : pour toute question, n’hésitez pas à écrire à tutaoyuan8@outlook.com

## Liste des fonctions principales

### Lecture et étagère

- Lecture sur toutes les plateformes : bureau et mobile
- Lecture EPUB, TXT, FB2/FBZ, MOBI, AZW3, CBZ et PDF
- Mon étagère : import, couvertures, progression, recherche/filtre, statut de lecture
- Pagination / défilement continu, une / deux colonnes, contrôles de largeur et de typographie
- Progression de lecture persistante, signets, estimation du temps restant
- Points de lecture de référence (enregistrer / mettre à jour / aller)
- Dégradé translucide de lecture (Premium)
- Mode de lecture par paragraphes, plein écran immersif (Premium)
- Listes de lecture de l’étagère (Premium)

### Extraits et annotations

- Cinq couleurs de surlignage plus souligné / barré / souligné ondulé
- Bulles de pensée (`---div---`)
- Mode automatique : insérer dans les notes / copier dans le presse-papiers
- Rendu dans le corps et synchronisation pour Markdown / Canvas / paquets Weave
- Extraits par capture d’écran (peuvent continuer sur plusieurs pages)

### Résumés d’extraits

- Liste de cartes d’extraits (filtrer, trier, aller à la source)
- Vue chronologique des extraits (revoir par date, aller à la source ; Premium)
- Sélection par lots : exporter / supprimer
- Barre de densité de la carte du livre dans la barre latérale de la table des matières (Premium)
- Marques de chapitre dans la table des matières (important / question / maîtrisé ; Premium)

### Traçage et intégrations

- Liens profonds vers le livre écrits dans les extraits
- Traçage bidirectionnel précis : notes ↔ livre (Premium)
- Liaison Canvas, création automatique de nœuds et rendu
- Création de cartes / lecture incrémentale / IA (nécessite Weave ; ne consomme pas la licence Premium du lecteur)

### API publique

- Obtenir le contexte de lecture actuel (titre du livre, titre / index du chapitre actuel, etc.)
- Obtenir le corps du chapitre actuel, ou le corps d’une section TOC donnée (texte / markdown)
- Obtenir les extraits surlignés du chapitre actuel, ou lister tous les extraits du livre actuel / d’un livre donné
- Lire la structure de la table des matières, lister les lecteurs ouverts ; éventuellement retirer un extrait par localisateur
- Pas de recherche / RAG sur le corps de tout le livre ; pour les longs chapitres, privilégier les sections TOC

### Exportation et aides

- Exporter le chapitre actuel en Markdown (Essential)
- Exporter les extraits de tout le livre / du chapitre et les chapitres marqués (Premium)
- Studio de modèles d’exportation avec préréglages intégrés
- Aperçu des notes de bas de page au survol (Premium)
- Interface multilingue (简体中文、繁體中文、English、日本語、한국어、Русский、Deutsch、Español、العربية) + tutoriel dans l’application

Voir [Expérience essentielle et support Premium](#expérience-essentielle-et-support-premium) pour le regroupement des capacités.

Version minimale d’Obsidian : **1.8.7**

## Expérience essentielle et support Premium

| Capacité | Expérience essentielle | Support Premium |
|----------|:----------------------:|:---------------:|
| Lecture sur **toutes les plateformes** (bureau et mobile) | ✅ | ✅ |
| Lire **EPUB**, TOC, modes paginé/défilement, typographie et thèmes | ✅ | ✅ |
| Lire des livres texte brut **TXT** | ✅ | ✅ |
| Lire **FB2 / FBZ** | ✅ | ✅ |
| Lire **MOBI / AZW3 / CBZ** | ✅ | ✅ |
| **Cinq couleurs de surlignage**, annotations, extraits et **rendu dans le corps** | ✅ | ✅ |
| Styles **souligné / barré / souligné ondulé** | ✅ | ✅ |
| Vue **liste de cartes** des extraits | ✅ | ✅ |
| Vue **chronologie** des extraits | 🔒 | ✅ |
| **Barre de densité de la carte du livre** dans la barre latérale TOC | 🔒 | ✅ |
| **Marques de chapitre** dans la table des matières (important / question / maîtrisé) | 🔒 | ✅ |
| **Listes de lecture** de l’étagère | 🔒 | ✅ |
| **Traçage bidirectionnel** (sauts d’ancre, notes ↔ emplacement dans le livre) | 🔒 | ✅ |
| **Points de lecture de référence** (enregistrer / mettre à jour / aller) | ✅ | ✅ |
| **Dégradé translucide de lecture** | 🔒 | ✅ |
| **Mode de lecture par paragraphes**, plein écran immersif | 🔒 | ✅ |
| **Progression de lecture**, progression sur l’étagère, dernier emplacement, estimation du temps restant | ✅ | ✅ |
| **Signets de la page actuelle**, dossier de signets et navigation dans la liste de signets | ✅ | ✅ |
| Liaison **Canvas** et création automatique de nœuds | ✅ | ✅ |
| Aperçu des notes de bas de page au survol | 🔒 | ✅ |
| Exporter le chapitre actuel en Markdown | ✅ | ✅ |
| **API publique** (corps du chapitre actuel / d’une section TOC, extraits du chapitre ou de tout le livre, etc.) | ✅ | ✅ |

> Légende : ✅ inclus · 🔒 nécessite le support Premium

- **Activer le support Premium** : utilisez un code d’activation EPUB uniquement dans les réglages du lecteur ; si un plugin principal **Weave** activé est installé, l’autorisation peut être héritée sans ressaisir de code.
- **Création de cartes / lecture incrémentale / IA** : ne consomment pas une licence Premium distincte du lecteur, mais nécessitent Weave ; l’IA nécessite aussi votre propre clé API.

Répartition officielle : [Expérience essentielle et support Premium](#expérience-essentielle-et-support-premium) ci-dessus. Activez dans les réglages du lecteur. Conditions : [PREMIUM_TERMS.md](./PREMIUM_TERMS.md).

## Installation

### Option 1 : Plugins communautaires (recommandé)

1. Ouvrez **Réglages → Plugins communautaires → Parcourir**
2. Recherchez **Weave EPUB Reader**, installez et activez

### Option 2 : Installation manuelle

1. Téléchargez une [version GitHub](https://github.com/zhuzhige123/obsidian-weave-reader/releases) correspondant à la version de `manifest.json` :
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Copiez-les dans `.obsidian/plugins/weave-epub-reader/`
3. Redémarrez Obsidian et activez **Weave EPUB Reader** sous **Réglages → Plugins communautaires**

## Démarrage rapide

1. Après avoir activé le plugin, ouvrez l’**étagère** depuis le ruban ou la palette de commandes, puis importez ou ouvrez un livre de votre vault.
2. Créez ou ouvrez un fichier Markdown et placez le curseur où les extraits doivent aller ; activez **Extrait automatique** dans le lecteur. Sélectionnez du texte pour créer des surlignages, extraits ou signets—ils sont insérés à ce curseur.
3. Cliquez sur un surlignage dans le livre pour aller à sa note source depuis la barre d’outils ; dans le Markdown / Canvas qui contient l’extrait, cliquez sur l’icône livre à côté pour revenir au passage correspondant.
4. Menu du lecteur → **Aide** → **Tutoriel** pour le guide dans l’application.

## Données et synchronisation

**Bon à synchroniser (dans le vault)** : fichiers de livres, extraits Markdown, fichiers Canvas, données de paquets Weave et notes de progression/signets par livre (par défaut `Weave EPUB Reader/data_*.md`).

**Généralement local (dossier du plugin)** : cache du lecteur, index, liaisons Canvas, points de lecture de référence et état local similaire. Préférez synchroniser le contenu du vault entre appareils plutôt que les fichiers de cache sous `.obsidian/plugins/weave-epub-reader/`.

## Confidentialité et réseau

- La lecture, le rendu, les extraits et les backlinks sont **locaux par défaut** ; le contenu du vault n’est pas téléversé de façon proactive.
- Les fonctions d’étagère, de backlinks et de localisation de source énumèrent les chemins de fichiers du vault localement ; la copie d’extraits ou de codes d’activation utilise le presse-papiers. Voir [PRIVACY.md](./PRIVACY.md).
- L’**activation du support Premium** peut contacter le service de licences (code d’activation, e-mail, résumé d’empreinte de l’appareil, etc.). Voir [PRIVACY.md](./PRIVACY.md).
- Les **fonctions d’IA** appellent les services tiers que vous configurez.

## FAQ

### Comment capturer correctement les extraits de lecture ?

Les extraits sont enregistrés à des emplacements concrets dans les fichiers Markdown, Canvas ou paquets Weave que vous choisissez. Le lecteur agrège les liens source de ces captures et affiche des surlignages dans le livre. Les sélections non enregistrées de cette façon ne font que clignoter brièvement et ne laissent aucune donnée durable. La bannière du tutoriel dans le lecteur l’explique plus en détail.

### Quel est le lien avec Weave ?

**Weave EPUB Reader fonctionne seul** : sans le plugin principal [Weave](https://github.com/zhuzhige123/anki-obsidian-plugin), vous pouvez toujours lire des EPUB, utiliser l’étagère et capturer des extraits avec rendu dans le corps. Avec Weave installé, vous pouvez aussi connecter les cartes de répétition espacée, le calendrier de lecture incrémentale, les actions d’IA, et hériter de la licence Weave pour le support Premium. Ce sont des **compagnons optionnels**, pas une dépendance obligatoire.

### Les extraits et notes peuvent-ils se synchroniser entre plateformes ?

**Oui.** Les captures vivent dans Markdown, Canvas, fichiers de paquets et autre contenu du vault, donc elles suivent la synchronisation Obsidian que vous utilisez déjà (Obsidian Sync, iCloud, vaults synchronisés dans le cloud, etc.) entre bureau et mobile. Synchronisez le contenu du vault ; le cache du lecteur sous le dossier du plugin n’a en général pas besoin de synchronisation entre appareils (voir [Données et synchronisation](#données-et-synchronisation) ci-dessus).

### Puis-je exporter mes notes ?

**Oui.** Les données d’extraits et de surlignages restent dans votre vault—vous pouvez lire, modifier et exporter le Markdown dans Obsidian, et le lecteur propose l’exportation de chapitres et des outils associés. **Les données sont locales par défaut** ; votre vault n’est pas téléversé de façon proactive.

### Pourquoi le support Premium est-il payant ?

Le support Premium **finance le développement continu** pour que le lecteur et le flux d’extraits continuent de s’améliorer. L’**expérience essentielle est gratuite**—la lecture quotidienne, cinq couleurs de surlignage, annotations, extraits et rendu dans le corps sont pleinement utilisables sans payer. Activez le support Premium seulement lorsque vous souhaitez la chronologie des extraits, le traçage bidirectionnel, le mode de lecture par paragraphes et d’autres capacités avancées.

### Abonnement ou achat unique ?

Le support Premium est un **achat unique** (activez une fois, utilisez à long terme ; voir [conditions du support Premium](./PREMIUM_TERMS.md)), pas un abonnement mensuel.

### Impossible d’ouvrir des formats autres qu’EPUB ?

**EPUB, TXT, FB2/FBZ, MOBI, AZW3, CBZ et PDF** sont inclus dans l’expérience essentielle. Voir [Expérience essentielle et support Premium](#expérience-essentielle-et-support-premium) ci-dessus.

## Plus de documentation

- [Introduction (chinois simplifié)](./README.md#中文文档)
- [Introduction (chinois traditionnel)](./README.zh-TW.md)
- [Español](./README.es.md) · [Français](./README.fr.md) · [العربية](./README.ar.md)
- [Confidentialité](./PRIVACY.md) · [Conditions du support Premium](./PREMIUM_TERMS.md) · [Support](./SUPPORT.md) · [Sécurité](./SECURITY.md)

## Licence et auteur

Le code source est publié sous [GPL-3.0-or-later](LICENSE).

- Author: Rabbit (zhuzhige)
- GitHub: https://github.com/zhuzhige123
