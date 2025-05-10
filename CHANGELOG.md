# Update History for Castles & Crusades Backpack

This file contains the changelog for all versions of the `cnc-backpack` module.

## v1.0.1 (May 10, 2025)
- Verified compatibility with Foundry VTT v13.
- Added validation to prevent weapons and armor from being marked as containers during item creation and updates, fixing an issue that could cause infinite rendering loops and data corruption.
- Introduced comprehensive debug logging for major events (e.g., item creation, container updates, rendering, drag-and-drop) to aid in error tracking and debugging.
- Updated module manifest to align with Foundry VTT v13 requirements, replacing `dependencies` and `systems` with `relationships`.

## v1.0.0 (April 13, 2025)
- Initial release of the `cnc-backpack` module for Foundry VTT.
- Added container support with capacity tracking (EV or lbs) and drag-and-drop functionality for nested inventory management.
- Implemented encumbrance tracking with configurable EV or lbs display via settings.
- Added currency weight toggle to include/exclude coins in encumbrance calculations (160 coins = 1 EV or 10 lbs).
- Enabled quantity management with increment/decrement buttons for items.
- Introduced global attack and damage modifiers, configurable via the combat tab.
- Integrated an enhanced roll dialog for attack and damage rolls with global and manual modifiers (can be disabled in settings).
- Added automatic AC updates based on equipped armor, with manual modifier support via the AC settings dialog.
- Ensured styling consistency using the Castles & Crusades ruleset's fonts (`Signika`, `TexGyreAdventor`).