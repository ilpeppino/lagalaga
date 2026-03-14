# Header Typography And Sessions Actions

## Top header titles

- App-level navigation headers use `BitcountSingle-Regular` via a shared `AppHeaderTitle` component.
- Header titles are constrained so they stay visually balanced between back buttons and right-side actions.
- Title behavior is single-line with automatic shrink:
  - `numberOfLines={1}`
  - `adjustsFontSizeToFit`
  - `minimumFontScale={0.8}`
- Header title containers use constrained max width and horizontal padding to avoid crowding navigation controls.

## Sessions custom header

- The Sessions page title uses the same Bitcount Single typeface.
- The title is width-constrained and auto-fits on one line to avoid overlap with the avatar action.

## Sessions bottom action buttons

- `Quick Play` uses a fast-play icon (`bolt.fill`).
- `Create` uses an add icon (`plus`).
- Question-mark icon fallbacks are removed for these actions by mapping the symbols in `IconSymbol`.
