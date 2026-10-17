# Design System

## Direction

Gronify uses a dark operational workbench: dense enough for experienced engineers, calm enough to read during incident work, and structured around real commands instead of decorative product mockups. The visual language takes its precision, restrained indigo accent, and layered surfaces from Linear without copying its page composition.

## Color

- Canvas: near-black violet `oklch(0.145 0.012 281)`.
- Raised surfaces: two closely spaced violet-black levels.
- Text: cool white with blue-violet secondary text.
- Accent: indigo `oklch(0.632 0.199 275)` reserved for primary actions, focus, and meaningful state.
- Borders are low-contrast separators, never decorative outlines.

## Typography

- Geist is the interface and display face.
- Geist Mono is used only for commands, JSON paths, flags, and compact technical labels.
- Headlines are compact, upright, and tightly tracked without gradient text.
- Body copy stays within a readable measure and uses strong contrast.

## Components

- Buttons use 8px radii, clear focus rings, and high-contrast action labels.
- Panels use 12px radii and either a border or shadow, not both.
- Code surfaces are real content panels without fake browser or terminal chrome.
- Information groups vary in composition; repeated equal-size icon cards are avoided.

## Motion

Use a single soft hero reveal and restrained hover/focus transitions. Content remains visible without animation. Respect `prefers-reduced-motion`.

## Responsive Behavior

The layout must work without horizontal page scrolling at 320, 375, 414, and 768px. Dense tables become stacked command records, navigation simplifies, and all headings can wrap safely.
