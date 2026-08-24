# Prompt — Phase 3 : Exercices

## Contexte
App kettlebell React Native (Expo 51, RN 0.74, TypeScript, StyleSheet). Refonte graphique
« Liquid Glass » en cours. **La Phase 0 est terminée** : thème, primitives
(`GlassCard`, `GlassSheet`, `GradientCTA`, `SegmentControl`, `ProgressRing`, `ScreenHeader`)
et tab bar vitrée existent déjà. Phases 1 (Execution) et 2 (Historique) sont faites.

**Avant toute chose : lire `DESIGN.md` à la racine, puis regarder
`docs/design/ffe4cf44e39645ad53c9559e6945db32.jpg` (écrans liste/détail/création d'exercice)
et `docs/design/88ebcb3471ccdbb3287044900f3633ca.jpg` (style guide typo/palette).**

## Mission
Restyler l'onglet « Exercises » en style K&Z :

- **Header + recherche** : `ScreenHeader`, champ de recherche en chip vitrée (`GlassCard`
  stylée input : fond verre, bordure `glassBorder`, icône loupe `textSecondary`).
- **Filtres** : chips de filtres (groupe musculaire, favoris…) en verre, actif = fond
  `accentDim` + texte `accent` + bordure accent.
- **ExerciseCard** : carte opaque `surfaceElevated` rayon lg, nom en ui-rounded 600,
  méta (groupes musculaires, favori) en `textSecondary`, pastilles de groupes musculaires
  en tokens olive/sauge/taupe.
- **ExerciseDetailModal** : transformation en `GlassSheet` (référence : modal
  « Start workout » de `cc10dc54c10c0e1412621385bab76713.jpg`) — poignée, titre h2,
  contenu scrollable, `MuscleDiagram` recoloré (muscles ciblés en `accent`, corps en
  `surfaceElevated`), `YoutubePlayer` avec coins arrondis xl et bordure `glassBorder`.
- **ExercisePickerModal** : même traitement `GlassSheet` (utilisé aussi par d'autres
  écrans — ne changer que le visuel, jamais les props).
- Veiller au paddingBottom (tab bar flottante).

## Scope fichiers
- `src/screens/ExercisesScreen.tsx` (~1 039 lignes, filtres/modals internes, 2 glows)
- `src/components/exercises/ExerciseCard.tsx` (~100)
- `src/components/exercises/ExerciseDetailModal.tsx` (~213)
- `src/components/exercises/ExercisePickerModal.tsx` (~326)
- `src/components/exercises/MuscleDiagram.tsx` (~98, SVG)
- `src/components/exercises/YoutubePlayer.tsx` (~95, WebView)

Hors scope : tout le reste.

## Règles inviolables
- Aucune modification de : logique de filtres/recherche, données, WebView (uniquement son
  conteneur visuel), props publiques, navigation.
- Réutiliser les primitives Phase 0. Zéro hex en dur. Valeurs conformes à DESIGN.md.
- Vérifier `npx tsc --noEmit` avant de finir.

## Definition of done
- `npx tsc --noEmit` passe sans erreur.
- Recherche, filtres, favoris, fiche détail, lecture vidéo, sélection via picker :
  comportement strictement identique.
- Cocher « Phase 3 » dans le checklist §10 de DESIGN.md.

*Budget indicatif : ~120–200 k tokens.*
