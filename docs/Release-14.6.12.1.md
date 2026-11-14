# Midi QOL Enhanced 14.6.12.1

Merged upstream Midi QOL 14.6.12, commit `3711a1b9a259a5f184de02567bc13f8fffcbf739`, into the existing fork history. The module ID remains `midi-qol`.

## Preserved fork behavior

- Triggered OverTime activities become persistent controllers, with hit/save filtering and its opt-out setting.
- Controllers roll as the source actor, inherit source effect duration, follow source/concentration dependencies, and refresh instead of duplicating.
- Successful saves can remove the effects from the triggering activity.
- Grouped condition-change cards retain GM/player visibility settings and settings import/export.
- Activity configuration retains subtabs through upstream's implementation.

The upstream D&D 6 card renderer supersedes the old compatibility shims. Native card descriptions, structured buttons, damage icons, separate damage groups, and number alignment are retained and tested. Source-effect matching uses DAE's current origin API, and controller changes use Foundry v14's `system.changes` schema.

## Validation

Tested on Foundry 14.369, D&D 6.1.0, and DAE 14.6.9 in an isolated copy of the compatibility world on port 49170.

- TypeScript check and release build passed.
- Sample-item and Active Effect compendiums rebuilt successfully.
- Four automated behavioral regression tests passed.
- 195 rendered card checks passed across six activity types and light/dark themes, including contrast, descriptions, damage grouping, icons, labels, and centered totals.
- 16 live feature checks passed for controller creation/refresh, native effect data, inherited duration/dependencies, condition notifications and GM privacy, settings export, activity configuration, and native Region placement/acceptance.
- No browser errors or invalid world actors recorded during validation.

The previous Foundry 13 / D&D 5 support is superseded by the upstream D&D 6 branch. This release requires Foundry 14.369+ and D&D 6.0.6+, and is verified on D&D 6.1.0.

## Install

https://github.com/webmaster94/midi-qol-enhanced/releases/latest/download/module.json

The previous GitLab manifest remains available and points downloads to the GitHub release. Historical versions remain in Git history.
