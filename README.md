# Castles & Crusades - CK's Backpack

A Foundry VTT module for enhanced inventory management in the Castles & Crusades system.

## Features
- Adds container items with capacity tracking (EV or lbs).
- Drag-and-drop support for organizing items between containers and main inventory.
- Configurable encumbrance display (EV or lbs) via settings.
- Integrates with the Castles & Crusades system for seamless inventory management.
- Uses fonts from the Castles & Crusades ruleset for consistent styling.

## Installation
1. Install via the Foundry VTT module browser using the manifest URL: `https://github.com/yourusername/cnc-ckbackpack/releases/latest/download/module.json`.
2. Alternatively, download the latest release (`module.zip`) from `https://github.com/yourusername/cnc-ckbackpack/releases/download/v1.0.3/module.zip` and extract it to your Foundry VTT `Data/modules` folder.
3. Enable the module in your world.
4. Ensure the `castles-and-crusades` system is active in your world.

## Usage
- Open an actor sheet and navigate to the **Equipment** tab.
- Create a container by clicking "+Add" under the **Containers** section.
- Drag items into containers or the main inventory to organize them.
- Toggle the "Is Container?" checkbox on an item sheet to convert an item into a container.
- Adjust encumbrance mode in **Game Settings > Configure Settings > cnc-ckbackpack** to switch between EV and lbs.

## Requirements
- Foundry VTT v12 (minimum version 12, verified with 12.331).
- Castles & Crusades system (`castles-and-crusades`) installed and active.

## Known Issues
- Dropping items from the sidebar may fail to add if the actor lacks permission to create items.
- Performance may lag slightly with very large inventories due to sheet re-rendering (optimization in progress).
- Edge cases with malformed item data (e.g., missing `ev` or `weight`) are handled with fallbacks but may not reflect intended rules.

## Contributing
Feel free to submit issues or pull requests on the [GitHub repository](https://github.com/yourusername/cnc-ckbackpack). Feedback from Castles & Crusades players is especially welcome! 

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/G2G71CMBSL)

## Support
For issues, questions, or feature requests, please open an issue on the [GitHub repository](https://github.com/yourusername/cnc-ckbackpack/issues) or contact the author via the Foundry VTT Discord community.

## Version History
See the [UPDATE.md](UPDATE.md) file for a detailed changelog of all versions and updates.

## License
This module is released under the MIT License. See the `LICENSE` file (if included) for details.
