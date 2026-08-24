# Prompt — Phase 5 : Profil, Auth, Réglages, Coach + polish final

## Contexte
App kettlebell React Native (Expo 51, RN 0.74, TypeScript, StyleSheet). Refonte graphique
« Liquid Glass » en cours. **La Phase 0 est terminée** : thème, primitives
(`GlassCard`, `GlassSheet`, `GradientCTA`, `SegmentControl`, `ProgressRing`, `ScreenHeader`)
et tab bar vitrée existent déjà. Phases 1–4 sont faites.

**Avant toute chose : lire `DESIGN.md` à la racine, puis regarder
`docs/design/cc10dc54c10c0e1412621385bab76713.jpg` (écran « Active goals » + modal vitré —
LA référence objectifs) et `docs/design/d68dd72b947562fa98a14a960e6cddc4.jpg`
(section « Latest achievements »).**

## Mission
Restyler le dernier onglet et les écrans annexes :

- **ProfileScreen** : `ScreenHeader` avec avatar/nom, cartes « objectifs actifs » façon
  « Active goals » de la capture : carte `surfaceElevated`, `ProgressRing` lime, valeur
  cible en chiffre ui-rounded, badge de statut (`success`/`warning`). Objectifs dans
  `ObjectiveCard` + `ProgressBar` recoloré (track `surfaceElevated`, fill `accent`).
- **AddObjectiveModal** : en `GlassSheet`, sélecteurs/chips en verre, validation en
  `GradientCTA`.
- **CoachChat** : interface de chat — bulles assistant en `surfaceElevated`, bulles user
  en `accentDim`/`accent` (texte lisible), champ de saisie en chip vitrée flottante au-dessus
  du clavier, `TemplatePreviewCard` en carte opaque avec CTA secondaire.
- **SettingsScreen / ImportScreen** : liste de réglages en cartes/groupes `surface`,
  toggles iOS recolorés (`accent`), import/export en boutons secondaires bordés — sobre,
  fond `#060504`.
- **AuthScreen** : écran d'accueil dark-only — logo/titre en ui-rounded 800, champs sur
  `surface`, boutons connexion/inscription en `GradientCTA`, fond éventuellement animé
  sobre (dégradé olive très sombre acceptable, pas de nouvelle dépendance).
- **Polish final** : passage rapide sur TOUTE l'app — vérifier qu'il ne reste aucun
  orange `#FF6B35` ni ancien hex (`#FF8555`, `#60A5FA`, `#A78BFA`, `#2DD4BF`, `#F472B6`,
   `#0D0D0F`, `#1A1A1F`, `#242429`…) hors thème : `grep -rn` sur `src/` et corriger via
  les tokens. Vérifier les paddings bas (tab bar flottante) sur les 5 onglets.

## Scope fichiers
- `src/screens/ProfileScreen.tsx` (~467) — embarque SettingsScreen et CoachChat
- `src/screens/SettingsScreen.tsx` (~433) — embarque ImportScreen
- `src/screens/ImportScreen.tsx` (~188)
- `src/screens/AuthScreen.tsx` (~134, hardcode aujourd'hui DarkColors → passer par le thème)
- `src/components/coach/CoachChat.tsx` (~438)
- `src/components/coach/TemplatePreviewCard.tsx` (~292)
- `src/components/profile/AddObjectiveModal.tsx` (~326)
- `src/components/profile/ObjectiveCard.tsx` (~128)
- `src/components/common/ProgressBar.tsx` (~48)
- + corrections grep polish final dans `src/` (couleurs résiduelles uniquement)

## Règles inviolables
- Aucune modification de : auth/sessions Supabase, réglages persistés, import/export,
  appels au coach IA, state, navigation, props publiques.
- Réutiliser les primitives Phase 0. Zéro hex en dur. Valeurs conformes à DESIGN.md.
- Vérifier `npx tsc --noEmit` avant de finir.

## Definition of done
- `npx tsc --noEmit` passe sans erreur.
- Connexion/déconnexion, objectifs (CRUD + progression), chat coach, import/export,
  réglages : comportement strictement identique.
- `grep` final propre : aucun ancien hex résiduel dans `src/`.
- Cocher « Phase 5 » dans le checklist §10 de DESIGN.md — la refonte est complète.

*Budget indicatif : ~150–230 k tokens.*
