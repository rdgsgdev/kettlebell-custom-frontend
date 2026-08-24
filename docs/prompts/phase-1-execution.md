# Prompt — Phase 1 : Exécution (écran timer)

## Contexte
App kettlebell React Native (Expo 51, RN 0.74, TypeScript, StyleSheet). Refonte graphique
« Liquid Glass » en cours. **La Phase 0 est terminée** : thème, primitives
(`GlassCard`, `GlassSheet`, `GradientCTA`, `SegmentControl`, `ProgressRing`, `ScreenHeader`)
et tab bar vitrée existent déjà.

**Avant toute chose : lire `DESIGN.md` à la racine, puis regarder
`docs/design/cc10dc54c10c0e1412621385bab76713.jpg` (modal « Start workout » — LA référence
de cette phase) et `docs/design/51d2e6897f5b9aea65ea5ca3eb2d08ef.jpg` (chiffres héro).**

## Mission
Restyler l'écran d'exécution (route « Execution », écran initial) en style K&Z :

- **Timer héro** : chiffre géant `Typography.hero` (ui-rounded, `tabular-nums`), phase
  courante en surtitre, anneau de progression `ProgressRing` autour ou à côté.
- **Contrôles** : play/pause/skip en `GlassCard` ronds en overlay, CTA principal en
  `GradientCTA` (dégradé héro si carte de lancement, plein sinon).
- **Config rapide** : `QuickTimerConfigModal` devient un `GlassSheet` vitré (référence :
  le modal « Start workout » de la capture — poignée, fond verre, rayon 28).
- **Listes d'exercices en cours** : rangées opaques `surfaceElevated`, badges de blocs
  (tokens starter/emom/finisher/mobility/stretching), `NumericInput` restylé (chips vitrées
  si utilisé en overlay).
- Veiller au paddingBottom (tab bar flottante, DESIGN.md §5).

⚠️ **FICHIER CRITIQUE — `ExecutionScreen.tsx` fait 2 751 lignes** (timer, haptique expo-haptics,
audio expo-av, state complexe, ~10 sous-composants internes, 3 blocs StyleSheet +
factories `makeStyles(colors)`). **Ne toucher NI la logique, NI le state, NI les handlers.**
Uniquement : blocs de styles, JSX de présentation (View/Text/style props), et remplacement
des wrappers visuels par les primitives. Si un doute existe sur un bout de JSX (mélange
logique/présentation), le laisser tel quel et le signaler dans le rapport.

## Scope fichiers
- `src/screens/ExecutionScreen.tsx` (~2 751 lignes)
- `src/components/execution/QuickTimerConfigModal.tsx` (~305)
- `src/components/common/NumericInput.tsx` (~67)

Hors scope : tout le reste. `ExerciseDetailModal` (utilisé par cet écran) sera traité en
Phase 3 — ne pas le restyler ici.

## Règles inviolables
- Aucune modification de : state, timers/intervals, haptique, audio, navigation, props des
  composants existants, noms de fonctions.
- Réutiliser les primitives de la Phase 0. Zéro hex en dur. Valeurs conformes à DESIGN.md.
- Vérifier `npx tsc --noEmit` avant de finir.

## Definition of done
- `npx tsc --noEmit` passe sans erreur.
- Séance complète testable : start/pause/skip, sons, vibrations, fin de séance — comportement
  strictement identique à avant.
- Le timer s'affiche en chiffre héro lime sur fond `#060504`, modaux en verre.
- Cocher « Phase 1 » dans le checklist §10 de DESIGN.md.

*Budget indicatif : ~150–250 k tokens.*
