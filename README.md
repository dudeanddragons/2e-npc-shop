
# NPC Shop Module for Foundry VTT

## Overview

This module provides an interactive NPC Shop system for Foundry Virtual Tabletop (VTT). It allows players to engage with shop features, including inventory transactions, services, and repairs, while enabling GMs to manage shop settings and inventory.

## Key Features

- **Tab-Based Interface**: Organized sections for "Shop," "Services," and "Forge."
- **Player and GM Separation**: Players can interact with the shop; GMs manage inventory and settings.
- **Currency and Inventory Management**: Handles transactions, currency conversion, and inventory updates.
- **Modular Code**: Improved maintainability with separate files for UI, logic, and settings.

## File Structure

The module consists of the following key files:

### Script Files
- **shopUI.js**: Manages UI rendering and player interactions.
- **shopTabs.js**: Handles tab-switching logic for the shop interface.
- **GM.js**: Centralized GM-only operations, including inventory management and multiplier settings.
- **currencyManager.js**: (Planned) Centralized currency calculations and conversions.
- **shopCore.js**: (Planned) Core shop functionality for transactions.
- **services.js**: (Planned) Logic for purchasing services like repairs or enhancements.
- **forge.js**: (Planned) Handles forge-specific operations like armor repair.

### Supporting Files
- **npcShop.css**: Defines the module's styling.
- **npcShopSheet.hbs**: Template for the shop interface.
- **module.json**: Module metadata and configuration.

## Contributing

Contributions and feedback are welcome! Please submit issues or pull requests to the module's repository.

## Authors
- Original Developer: DudeandDragons
