# Prompt — Phase 4 : Workout (programmes)

## Contexte
App kettlebell React Native (Expo 51, RN 0.74, TypeScript, StyleSheet). Refonte graphique
« Liquid Glass » en cours. **La Phase 0 est terminée** : thème, primitives
(`GlassCard`, `GlassSheet`, `GradientCTA`, `SegmentControl`, `ProgressRing`, `ScreenHeader`)
et tab bar vitrée existent déjà. Phases 1–3 sont faites.

**Avant toute chose : lire `DESIGN.md` à la racine, puis regarder
`docs/design/ffe4cf44e39645ad53c9559e6945db32.jpg` (écrans « Create new workout », détail
de séance, saisie de charges).**

## Mission
Restyler l'onglet « Workout » en style K&Z :

- **WorkoutScreen** : `ScreenHeader`, liste de `WorkoutCard` opaques (`surfaceElevated`,
  rayon lg–xl), stats du programme en méta `textSecondary`, CTA « nouveau programme » en
  `GradientCTA` (glow lime), empty state en carte discrète.
- **WorkoutCard** : titre ui-rounded 700, résumé (blocs, durée, volume) en `textSecondary`,
  badges de blocs avec les tokens starter/emom/finisher/mobility/stretching (fond Dim,
  texte Color).
- **WorkoutEditor** : header d'édition dans une carte `surfaceElevated` ; champs
  (nom, notes) en inputs sur `surface` avec bordure `border` ; actions destructrices en
  `danger`/`dangerDim` discrètes.
- **BlockSection** : section par bloc — titre avec pastille du token de bloc, contenu
  en sous-carte `surface`, chips d'ajout en verre.
- **WorkoutItemRow** : rangée d'exercice opaque, badge de bloc, valeurs (reps/kg/temps)
  en ui-rounded `tabular-nums`, actions glide (SwipeableRow) aux coins arrondis — recolorer
  l'action destructive en `danger`, l'éditive en `accent`.
- **SwipeableRow** (partagé) : recolorer les fonds d'actions avec les tokens ; ne pas
  toucher la mécanique gesture-handler ni l'Animated existant.
- **EmptyState** : illustration/icône `textTertiary`, texte `textSecondary`, éventuel CTA
  secondaire.
- Modals/édition en `GlassSheet` si présents. Veiller au paddingBottom (tab bar flottante).

## Scope fichiers
- `src/screens/WorkoutScreen.tsx` (~228)
- `src/components/workout/WorkoutEditor.tsx` (~499)
- `src/components/workout/WorkoutItemRow.tsx` (~474, contient un Animated maison — visuel seul)
- `src/components/workout/BlockSection.tsx` (~193)
- `src/components/workout/WorkoutCard.tsx` (~186)
- `src/components/common/SwipeableRow.tsx` (~109)
- `src/components/common/EmptyState.tsx` (~50)

Hors scope : tout le reste (ExercisePickerModal et NumericInput déjà traités en phases
1 et 3 — simplement vérifier leur rendu ici).

## Règles inviolables
- Aucune modification de : CRUD programmes/blocs/exercices, réordonnancement, gestures,
  state, navigation, props publiques.
- Réutiliser les primitives Phase 0. Zéro hex en dur. Valeurs conformes à DESIGN.md.
- Vérifier `npx tsc --noEmit` avant de finir.

## Definition of done
- `npx tsc --noEmit` passe sans erreur.
- Création/édition/suppression de programmes, blocs, exercices, swipe actions :
  comportement strictement identique.
- Cocher « Phase 4 » dans le checklist §10 de DESIGN.md.

*Budget indicatif : ~150–250 k tokens.*
