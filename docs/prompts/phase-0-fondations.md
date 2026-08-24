# Prompt — Phase 0 : Fondations (le socle)

## Contexte
App kettlebell React Native : Expo 51 (prebuild, dossier `ios/` natif), RN 0.74.5,
TypeScript strict, StyleSheet uniquement. Thème centralisé dans `src/theme/index.ts`,
consommé via `useSettings().colors` (src/context/SettingsContext.tsx). Navigation :
`createBottomTabNavigator`, 5 onglets, `src/navigation/TabNavigator.tsx`.

Refonte graphique « Liquid Glass » (design K&Z, dark + accent chartreuse + SF Pro Rounded).

**Avant toute chose : lire `DESIGN.md` à la racine (spec figée) et regarder les captures
`docs/design/88ebcb3471ccdbb3287044900f3633ca.jpg` (style guide typo/palette) et
`docs/design/51d2e6897f5b9aea65ea5ca3eb2d08ef.jpg` (dashboard + tab bar).**

## Mission
Poser les fondations pour que les phases suivantes ne fassent que consommer :

1. **Dépendances** : installer `expo-blur` et `expo-linear-gradient` (`npx expo install ...`),
   puis `pod install` (dossier `ios/`) et rebuild `npx expo run:ios`. Prévenir l'utilisateur
   qu'un rebuild natif est requis.
2. **`src/theme/index.ts`** : appliquer TOUT le mapping §2 de DESIGN.md (DarkColors et
   LightColors = mêmes valeurs, nouveaux tokens glass/gradient/onAccent, couleurs de blocs),
   typo §3 (`fontFamily` ui-rounded + `tabular-nums` pour hero), Radius §4 (10/16/20/28/full).
   Mettre à jour le type `ThemeColors` du côté SettingsContext si nécessaire.
3. **Primitives** dans `src/components/common/` (spec complète §6 de DESIGN.md) :
   `GlassCard`, `GlassSheet`, `GradientCTA`, `SegmentControl`, `ProgressRing`,
   `ScreenHeader`. Remplacer/supprimer les composants morts `Button.tsx` et `Card.tsx`
   (vérifier au préalable qu'ils ne sont importés nulle part).
4. **Tab bar vitrée** : `TabNavigator.tsx` — barre custom flottante (prop `tabBar`), spec §5
   de DESIGN.md. 5 onglets, routes et icônes inchangés. Vérifier que le contenu des écrans
   ne passe pas sous la barre (paddingBottom temporaire global acceptable en attendant les
   phases par écran — le préciser dans le rapport).
5. **Glow lime** : remplacer les anciens glows orange codés en dur par le glow token §4
   (Concerne ExecutionScreen/ExercisesScreen/WorkoutScreen/ProfileScreen : ne toucher QUE
   les lignes de shadow, rien d'autre — le restylage complet vient dans les phases suivantes.)

## Scope fichiers
- `src/theme/index.ts`, `src/context/SettingsContext.tsx`, `src/navigation/TabNavigator.tsx`
- Nouveaux : `src/components/common/{GlassCard,GlassSheet,GradientCTA,SegmentControl,ProgressRing,ScreenHeader}.tsx`
- Suppression : `src/components/common/Button.tsx`, `src/components/common/Card.tsx`
- Lignes de shadow uniquement dans : `ExecutionScreen.tsx`, `ExercisesScreen.tsx`,
  `WorkoutScreen.tsx`, `ProfileScreen.tsx`
- `package.json` (deps)

## Règles inviolables
- Aucune logique modifiée. Aucune fonctionnalité modifiée. Routes/icônes/noms d'onglets inchangés.
- Zéro hex codé en dur dans les composants : tout vient du thème.
- Valeurs strictement conformes à DESIGN.md (§2, §3, §4, §5, §6).

## Definition of done
- `npx tsc --noEmit` passe sans erreur.
- L'app build sur iOS et lance : les 5 onglets fonctionnent, palette lime visible partout
  (le swap de tokens re-skinne déjà ~80 % de l'app).
- Primitives exportées et utilisables (storybook non requis : un exemple d'usage suffit
  dans chaque fichier en commentaire).
- Cocher « Phase 0 » dans le checklist §10 de DESIGN.md.

*Budget indicatif : ~60–100 k tokens.*
