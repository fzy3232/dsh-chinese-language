# Changelog

## 0.2.0

- Register the rule as a **runtime-context contribution** as well as a
  system-prompt section, so a long or resumed session reads it next to the live
  conversation instead of only at session start. The snapshot is static, so the
  harness persists it once rather than re-writing it every step.
- Shorten the default text from four lines (~148 characters) to two lines plus a
  one-line reminder (~99 characters), and add a test that fails if that
  steady-state budget grows.
- Derive both orders from `getSectionOrder` / `getContextOrder` when the harness
  exposes them, falling back to the historical constants on older releases.
- Skip the runtime-context registration on harnesses without that API instead of
  failing the loader entry.
- `section` accepts `false` to disable a channel (a string still names it); add
  `sectionName`, `context`, `contextName`, `contextOrder` and `contextText`.
- Tests: contract coverage for both channels, the older-harness path and the
  token budget; a real-harness suite that skips when `@deepseek-ai/*` is not
  installed; a packaging test running `npm pack --dry-run`.

## 0.1.0

- First release: one late system-prompt section (`user:chinese-language`,
  order `10300`) appended after `deployment:persona-suffix`, mounted through
  `dsh.bundle.patch`.
