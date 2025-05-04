# Update History for Castles & Crusades Backpack

This file contains the changelog for all versions of the `cnc-backpack` module.

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

## v1.0.1 (May 3, 2025)
- Verified for Foundry VTT v13 update.
- Fixed a bug causing "Fast Forward" rolls to not add global modifiers.
- Known Issues
    - Deprecated v12 APIs. I will monitor C&C ruleset changes. If and when, the ruleset updates its use of APIs, then I will update for this add-on.