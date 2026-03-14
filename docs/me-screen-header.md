# Me Screen Header

The Me screen header shows a single primary username label under the avatar.

## Username presentation

- Only the large primary username is rendered.
- The secondary `@username` line is intentionally not displayed.
- Username is centered and constrained to the avatar-aligned width area (112 px max).

## Long username behavior

- The primary username is forced to one line (`numberOfLines={1}`).
- Dynamic fitting is enabled (`adjustsFontSizeToFit`).
- `minimumFontScale` is set to `0.72` to keep text readable while preventing wraps.
- Truncation is a last resort after the minimum scale is reached.

## Layout stability

- Header height remains stable across short and long usernames.
- Vertical spacing between avatar, username, and settings cards remains unchanged.
