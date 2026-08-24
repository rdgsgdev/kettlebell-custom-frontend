# Prompt — Phase 2 : Historique / Progress

## Contexte
App kettlebell React Native (Expo 51, RN 0.74, TypeScript, StyleSheet). Refonte graphique
« Liquid Glass » en cours. **La Phase 0 est terminée** : thème, primitives
(`GlassCard`, `GlassSheet`, `GradientCTA`, `SegmentControl`, `ProgressRing`, `ScreenHeader`)
et tab bar vitrée existent déjà. La Phase 1 (Execution) est faite.

**Avant toute chose : lire `DESIGN.md` à la racine, puis regarder
`docs/design/d68dd72b947562fa98a14a960e6cddc4.jpg` (dashboard : cartes stats, section
achievements) et `docs/design/ffe4cf44e39645ad53c9559e6945db32.jpg` (liste d'historique
groupée par période).**

## Mission
Transformer l'onglet « Progress » en dashboard K&Z :

- **Header** : `ScreenHeader` standardisé (titre + sous-titre période).
- **Carte héro** : carte « résumé de semaine » en dégradé lime (`GradientCTA variant="hero"`
  ou LinearGradient direct selon les primitives) : volume/séances de la semaine, chiffre
  héro, texte `onAccent`. Inspirée de la carte « Weekly Challenge » de la capture.
- **Chips de période** : filtres (semaine/mois/tout) en `SegmentControl` ou chips vitrées.
- **Cartes stats** : `surfaceElevated`, rayon lg–xl, valeurs en ui-rounded 700–800,
  labels `textSecondary`.
- **CalendarStrip** : jour actif = pastille lime, sélection = anneau lime, reste discret
  sur `surface`.
- **FrequencyHeatmap** : intensités en dégradé olive → lime (tokens `accentDeep` → `accent`),
  pas de bleu/orange résiduel.
- **LogCard** : carte opaque `surfaceElevated`, badges de blocs (tokens), actions en
  `GlassCard`/icônes, éventuel détail en `GlassSheet` si modal il y a.
- Veiller au paddingBottom (tab bar flottante).

## Scope fichiers
- `src/screens/HistoryScreen.tsx` (~1 069 lignes, 5 blocs StyleSheet)
- `src/components/history/LogCard.tsx` (~518)
- `src/components/history/CalendarStrip.tsx` (~173)
- `src/components/history/FrequencyHeatmap.tsx` (~148)

Hors scope : tout le reste (SwipeableRow partagé sera traité en Phase 4 — si LogCard
l'utilise, adapter uniquement ses props de style, pas le composant).

## Règles inviolables
- Aucune modification de : requêtes/calculs de stats, agrégations, state, navigation,
  props publiques des composants.
- Réutiliser les primitives Phase 0. Zéro hex en dur. Valeurs conformes à DESIGN.md.
- Vérifier `npx tsc --noEmit` avant de finir.

## Definition of done
- `npx tsc --noEmit` passe sans erreur.
- Données, filtres, navigation vers détail de séance, suppression/édition : comportement
  strictement identique.
- Dashboard visuellement proche de `d68dd72b947562fa98a14a960e6cddc4.jpg`.
- Cocher « Phase 2 » dans le checklist §10 de DESIGN.md.

*Budget indicatif : ~120–200 k tokens.*
