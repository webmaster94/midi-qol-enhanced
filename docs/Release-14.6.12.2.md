# Midi QOL Enhanced 14.6.12.2

Fixes the two findings in the [CPR/GPS integration report](https://github.com/webmaster94/chris-premades/blob/release-v14/docs/midi-14.6.12.1-integration.md).

- A successful attack or failed enemy save can trigger an OverTime controller on the caster. The triggering outcome and the controller recipient are evaluated separately. Original target recipients still filter out misses and successful saves.
- Retargeted OverTime opens the native target confirmation dialog. Cancelling it or failing the triggering hit/save requirements creates no controller.
- Target macro scope preserves the token supplied by the caller. Two linked tokens for one actor remain distinct; an off-canvas TokenDocument stays available to the macro. Calls without a token keep the actor-based fallback.

Regression coverage includes attacks, saves, combined attack/save outcomes, self and retarget recipients, first-target roll modes, cancellation, the ignore-trigger setting, both token modes, and off-canvas documents. The tests extract the actual Workflow methods and use Midi's TokenDocumentSet implementation.

Validation: TypeScript, 17 automated regression tests, 195 card checks, 16 existing live feature checks, and 8 live integration checks in Foundry 14.369 / D&D 6.1.0 / DAE 14.6.9.

Install: https://github.com/webmaster94/midi-qol-enhanced/releases/latest/download/module.json
