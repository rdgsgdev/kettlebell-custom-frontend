# DESIGN.md — Spec graphique « Liquid Glass » (K&Z) pour KBC

> **Source de vérité unique** pour la refonte graphique. Tout agent/session DOIT lire ce
> fichier avant de toucher à l'UI. Les valeurs ci-dessous sont **figées** : ne pas improviser
> d'autres hex, opacités ou rayons. En cas de doute, la référence visuelle prime : captures
> dans `docs/design/` et shot Dribbble d'origine
> (https://dribbble.com/shots/26656802-Liquid-Glass-Gym-companion-App).

## 0. Références visuelles (docs/design/)

| Fichier | Contenu | Sert de référence pour |
|---|---|---|
| `88ebcb3471ccdbb3287044900f3633ca.jpg` | Style guide « SF Pro Rounded » (K&Z) : échelle typo + 5 pastilles palette | Typographie, couleurs |
| `51d2e6897f5b9aea65ea5ca3eb2d08ef.jpg` | Dashboard home (semaine 3) : carte Weekly Challenge, stats, tab bar | Dashboard, carte héro, stats |
| `d68dd72b947562fa98a14a960e6cddc4.jpg` | Dashboard home (Monday, May 27) : Weekly Challenge dégradé, Active goals, Latest achievements | Cartes objectifs, achievements, tab bar |
| `cc10dc54c10c0e1412621385bab76713.jpg` | Modal vitré « Start workout » sur écran « Active goals » | Glass sheets, modals, CTA |
| `ffe4cf44e39645ad53c9559e6945db32.jpg` | Compilation d'écrans secondaires (historique, détail séance, calculateur, création) | Listes, écrans de création |

## 1. Principes du langage visuel

1. **Dark quasi pur** — fonds noirs `#060504`, cartes `#1C1C1E` / `#2C2C2E`. Pas de gris bleutés.
2. **Chartreuse signature** — l'accent `#D7E724` (lime) est LE couleur de la marque : CTA,
   état actif, chiffres clés, dégradés héro. Il remplace l'orange historique partout.
3. **SF Pro Rounded** — toute la typo en arrondi natif iOS (`ui-rounded`), chiffres héro
   gigantesques (timer, stats) avec chiffres tabulaires.
4. **Liquid Glass** — le verre (blur + transparence + bord lumineux) est réservé aux
   éléments flottants : tab bar, bottom sheets, chips de filtre, contrôles overlay.
   Les cartes de contenu restent **opaques** (`#2C2C2E`).
5. **Grands rayons** — cartes 16–24, sheets 28, boutons pilules (full).
6. **Glow lime au lieu d'ombres noires** — les CTA « respirent » avec une ombre colorée douce.

## 2. Palette — mapping tokens (src/theme/index.ts)

Valeurs cibles **figées** pour `DarkColors` (et `LightColors` = copie identique, voir §7) :

| Token | Actuel | **Cible** |
|---|---|---|
| `background` | `#0D0D0F` | `#060504` |
| `surface` | `#1A1A1F` | `#1C1C1E` |
| `surfaceElevated` | `#242429` | `#2C2C2E` |
| `border` | `#2A2A32` | `#38383D` |
| `accent` | `#FF6B35` | `#D7E724` |
| `accentDim` | `rgba(255,107,53,0.15)` | `rgba(215,231,36,0.15)` |
| `accentBright` | `#FF8555` | `#F4FF5C` |
| `success` | `#4ADE80` | `#7BC98E` |
| `successDim` | `rgba(74,222,128,0.15)` | `rgba(123,201,142,0.15)` |
| `warning` | `#FBBF24` | `#E5C558` |
| `warningDim` | `rgba(251,191,36,0.15)` | `rgba(229,197,88,0.15)` |
| `danger` | `#F87171` | `#E47979` |
| `dangerDim` | `rgba(248,113,113,0.12)` | `rgba(228,121,121,0.12)` |
| `textPrimary` | `#FFFFFF` | `#FFFFFF` |
| `textSecondary` | `#9CA3AF` | `#9E9EA5` |
| `textTertiary` | `#4B5563` | `#6E6E73` |

### Nouveaux tokens à ajouter (DarkColors + type ThemeColors)

| Token | Valeur | Usage |
|---|---|---|
| `accentDeep` | `#8F9A22` | Variantes olive de l'accent (icônes secondaires, press states) |
| `glassBackground` | `rgba(44,44,46,0.55)` | Fond des surfaces vitrées (tint du BlurView) |
| `glassBorder` | `rgba(255,255,255,0.12)` | Bordure 1 px des surfaces vitrées |
| `glassHighlight` | `rgba(255,255,255,0.06)` | Liseré lumineux haut des surfaces vitrées |
| `glassFallback` | `rgba(28,28,30,0.85)` | Remplacement opaque du verre sur web |
| `onAccent` | `#060504` | Texte posé sur fond accent/CTA (toujours sombre) |

### Couleurs de blocs (badges starter/emom/finisher/mobility/stretching)

Famille olive/sauge/taupe du shot. Les tons officiels trop sombres (`#61633A`, `#8C745E`)
sont réservés aux **fills/illustrations**, pas au texte — versions éclaircies pour la lisibilité :

| Token | Actuel | **Cible** |
|---|---|---|
| `starterColor` / `starterDim` | `#60A5FA` / 0.15 | `#6B8E5E` (sauge) / `rgba(107,142,94,0.15)` |
| `emomColor` / `emomDim` | `#FF6B35` / 0.15 | `#D7E724` (lime) / `rgba(215,231,36,0.15)` |
| `finisherColor` / `finisherDim` | `#A78BFA` / 0.15 | `#8F9A22` (olive) / `rgba(143,154,34,0.15)` |
| `mobilityColor` / `mobilityDim` | `#2DD4BF` / 0.15 | `#C9A887` (taupe clair) / `rgba(201,168,135,0.15)` |
| `stretchingColor` / `stretchingDim` | `#F472B6` / 0.15 | `#AEB778` (olive clair) / `rgba(174,183,120,0.15)` |

## 3. Typographie

- **Police** : SF Pro Rounded natif iOS — `fontFamily: 'ui-rounded'` (aucun fichier de police,
  aucune lib). Fallback : `Platform.select({ ios: 'ui-rounded', default: 'system' })`.
- Ajouter `fontFamily` dans chaque entrée de `Typography` (src/theme/index.ts).
- Échelle : conserver les tailles actuelles. `hero` (56/800, letterSpacing -2) devient le style
  « chiffre héro » du timer et des stats clés.
- **Chiffres du timer/compteurs** : ajouter `fontVariant: ['tabular-nums']` pour éviter le
  « jitter » des secondes.
- Poids dominants à l'écran : 700–800 pour titres/valeurs, 500 pour labels, 400 corps.

## 4. Rayons, verre, dégradés, ombres

### Radius (tokens à mettre à jour)
- `sm: 10`, `md: 16`, `lg: 20`, `xl: 28`, `full: 9999` (les valeurs actuelles 8/12/16/24
  montent d'un cran partout via les tokens — ne pas écraser au cas par cas).
- Bottom sheets : `xl` (28). Boutons CTA : `full` (pilule). Cartes : `lg`–`xl`.

### Verre (« Liquid Glass ») — règles d'usage
- **Où** : tab bar flottante, bottom sheets/modals, chips de filtre, contrôles en overlay
  (play/pause pendant une séance), header sticky si besoin.
- **Où PAS** : cartes de contenu, listes, formulaires → surfaces opaques `surfaceElevated`.
- **Recette BlurView (expo-blur)** : `intensity 30`, `tint 'dark'`, `experimentalBlurMethod`
  si requis ; par-dessus : overlay `glassBackground`, bordure 1 px `glassBorder`, liseré haut
  `glassHighlight`, rayon du contexte.
- **Web** : pas de blur → fallback `glassFallback` + même bordure (dégradation acceptée).

### Dégradés (expo-linear-gradient)
- **Carte héro** (type « Weekly Challenge ») : `['#F4FF5C', '#D7E724']`, start
  `{x:0,y:0}` → end `{x:1,y:1}`, texte `onAccent`. Référence observée sur les captures :
  `#D4E157 → #C0CA33` (même famille, on normalise sur les tokens officiels).
- **CTA primaire** : fond plein `accent` (`#D7E724`), texte `onAccent`, poids 700 — pas de
  dégradé sur les boutons (le dégradé est réservé aux cartes héro).

### Ombres / glow
- Glow accent (CTA, état actif) : `shadowColor '#D7E724'`, `shadowOpacity 0.35`,
  `shadowRadius 20`, `shadowOffset {0,8}`, `elevation 8` (Android). Remplace tous les
  glows orange existants.
- Pas d'ombres noires sur cartes sombres (invisible et inutile) — la hiérarchie se fait par
  les niveaux de surface (`#060504` → `#1C1C1E` → `#2C2C2E`).

## 5. Tab bar

- Barre **custom flottante en verre** (prop `tabBar` du `Tab.Navigator`) : position absolute,
  marges horizontales 16, assise 8 px au-dessus du safe area, hauteur ~64, rayon `full`
  (pilule) ou `xl`.
- BlurView + recette verre du §4. 5 onglets conservés (Exercises, Workout, Execution,
  Progress, Profile), icônes Ionicons seules (pas de labels), actif `accent` + point/glow
  lime discret, inactif `textSecondary`.
- **Conséquence** : les écrans doivent prévoir un `paddingBottom` (~100) pour que le contenu
  ne passe pas sous la barre flottante — à traiter écran par écran dans chaque phase.

## 6. Primitives partagées (créées en Phase 0 dans src/components/common/)

| Composant | Rôle | Points clés |
|---|---|---|
| `GlassCard` | Conteneur vitré | BlurView + overlay + bordure + rayon paramétrables ; prop `fallbackOpaque` |
| `GlassSheet` | Bottom sheet vitré standard | Remplace les `<Modal>` opaques : poignée, titre, fond verre, rayon 28 en haut |
| `GradientCTA` | Bouton pilule primaire | Fond `accent` (ou dégradé héro si `variant="hero"`), texte `onAccent`, glow §4 |
| `SegmentControl` | Segmented control | Style K&Z : pill track `surface`, segment actif `accent`/texte `onAccent` |
| `ProgressRing` | Anneau de progression | `react-native-svg` (déjà installé), track `surfaceElevated`, progression `accent` |
| `ScreenHeader` | Header d'écran standardisé | SafeArea top + titre (h1, ui-rounded) + sous-titre `textSecondary` |

Les composants morts `Button.tsx` et `Card.tsx` (jamais importés) sont remplacés par ces
primitives. **Toute phase ultérieure DOIT réutiliser ces primitives** — interdiction de
réinventer un verre/dégradé local.

## 7. Décisions verrouillées

- **Dark-only** : le design K&Z est dark. `LightColors` reçoit les mêmes valeurs que
  `DarkColors` (l'app reste cohérente même si un réglage système force le clair).
  `app.json` a déjà `userInterfaceStyle: "dark"`.
- **iOS d'abord** : le build web/PWA peut se dégrader proprement (verre → fallback opaque,
  `ui-rounded` → system). Ne pas bloquer sur le web.
- **Refonte VISUELLE uniquement** : aucune logique (state, timers, haptique, audio, stockage,
  navigation fonctionnelle, props/export des composants existants) ne doit changer.

## 8. Règles d'or pour l'agent

1. **Zéro hex codé en dur** dans les écrans : tout passe par `useSettings().colors` ou les
   tokens du thème. Si une valeur manque, l'ajouter au thème, pas au composant.
2. **Réutiliser les primitives** du §6 — ne pas dupliquer.
3. **Ne pas renommer** de props, fonctions, fichiers existants ; ne créer que des fichiers
   nouveaux listés dans le prompt de phase.
4. **Rester dans le scope fichiers** du prompt de phase. Si un problème visuel est détecté
   hors scope : le signaler dans le rapport final, ne pas le corriger.
5. Vérifier `npx tsc --noEmit` avant de finir.
6. Cocher la phase dans le checklist ci-dessous (mettre à jour ce fichier).

## 9. Mapping écrans de l'app ↔ captures K&Z

| Écran KBC | Capture de référence | Intention |
|---|---|---|
| Execution (timer) | `cc10dc54` (modal Start workout) + `51d2e689` | Chiffre héro géant, contrôles verre, CTA pilule |
| Progress / Historique | `d68dd72b` (achievements) + `ffe4cf44` (history) | Cartes stats `#2C2C2E`, chips période vitrées, heatmap lime |
| Exercises | `ffe4cf44` | Liste, chips vitrées, fiche détail en GlassSheet |
| Workout | `ffe4cf44` (create workout) | Rangées larges, badges de blocs olive/sauge, édition en sheet |
| Profile / Goals / Coach | `cc10dc54` (Active goals) + `d68dd72b` | Cartes objectifs + ProgressRing, bulles chat vitrées |

## 10. Progression

- [ ] Phase 0 — Fondations : tokens, typo, deps (expo-blur, expo-linear-gradient), primitives, tab bar verre
- [ ] Phase 1 — Execution (timer héro + QuickTimerConfigModal + NumericInput)
- [ ] Phase 2 — Historique (HistoryScreen + LogCard + CalendarStrip + FrequencyHeatmap)
- [ ] Phase 3 — Exercices (ExercisesScreen + cards/modals/diagram)
- [ ] Phase 4 — Workout (éditeur + rangées + cartes)
- [ ] Phase 5 — Profil/Auth/Réglages/Coach
