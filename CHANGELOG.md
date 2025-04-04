# Update History for Castles & Crusades - CK's Backpack

This file contains the changelog for all versions of the `cnc-ckbackpack` module.

## v1.0.2 (March 30, 2025)
- Added automatic cleanup in `renderActorSheet` hook to remove stale `itemIds` from containers when referenced items no longer exist in the actor's inventory.
- Automatically corrects `isContainer` values for non-"item" types (e.g., weapons, armor) by setting them to `undefined` if incorrectly set to `true`.
- Resolves issue where dragging items out of containers could leave stale references, and deleting items could cause rendering errors due to outdated container `itemIds`.

## v1.0.1 (March 28, 2025)
- Improved drag-and-drop to prevent duplicates and enhance error handling.
- Optimized encumbrance updates to reduce full sheet re-renders.
- Added permission checks for item deletion.
- Introduced module-specific localization keys.
- Included README for better documentation.
- Cleaned up code for better readability and maintainability.
- Organized JavaScript into sections with helper functions.
- Improved CSS and localization file organization.
- Updated README with new version information.
- Removed unused SVG and font files from the `styles` directory (`damage.svg`, `melee.svg`, `ranged.svg`, `soutane-*`, `texgyreadventor-*`).
- Confirmed that the add-on uses fonts from the Castles & Crusades ruleset (`Signika`, `TexGyreAdventor`) by default.
- Moved changelog to `UPDATE.md` and updated `README.md` for better clarity and structure.

## v1.0.0
- Initial release of the `cnc-ckbackpack` module for Foundry VTT.
- Added support for container management in the Castles & Crusades system.
- Implemented encumbrance tracking with EV (Encumbrance Value) and weight (lbs) modes.
- Enabled drag-and-drop functionality for moving items between containers and main inventory.
- Added quantity management for items with increment/decrement buttons.
- Introduced coin weight toggle setting to include/exclude coins in encumbrance calculations.