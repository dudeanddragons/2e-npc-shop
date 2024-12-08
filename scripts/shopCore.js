import { toCopper, fromCopper, adjustCost } from "./currencyManager.js";

class ShopCore {
  constructor(actor, multipliers) {
    this.actor = actor; // The NPC shop actor
    this.multipliers = multipliers; // Fetch multipliers from GM configuration
  }

  /**
   * Retrieve the currently interacting actor (customer).
   * @returns {Actor|null} - The interacting actor or null if none is selected.
   */
  getInteractingActor() {
    const selectedActorId = this.actor.getFlag("world", "currentCustomer");

    if (!selectedActorId) {
      console.warn("ShopCore | No actor ID found in 'currentCustomer' flag.");
      return null;
    }

    const actor = game.actors.get(selectedActorId) || null;

    if (actor) {
      console.log(`ShopCore | Retrieved interacting actor: ${actor.name} (ID: ${actor.id})`);
      console.log("ShopCore | Actor Relationships:", actor);

      // Log all inventory items
      const inventory = actor.items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        quantity: item.system.quantity || 0,
        cost: item.system.cost?.value || 0,
        currency: item.system.cost?.currency || "cp",
        weight: item.system.weight || 0,
      }));

      console.log(`ShopCore | Inventory items for ${actor.name}:`, inventory);
    } else {
      console.error(`ShopCore | Failed to retrieve actor with ID: ${selectedActorId}`);
    }

    return actor;
  }

  /**
   * Prepare the list of sellable items from the player's inventory.
   * @param {Actor} playerActor - The player's actor whose inventory is being evaluated.
   * @returns {Array} - List of items with adjusted costs and sell eligibility.
   */
  prepareSellableItems(playerActor) {
    if (!playerActor) {
      console.warn("ShopCore | No player actor selected.");
      return [];
    }

    console.log(`ShopCore | Preparing sellable items for ${playerActor.name}.`);

    return playerActor.items
      .map((item) => {
        const baseCostInCopper = toCopper(item.system.cost?.value || 0, item.system.cost?.currency || "cp");
        const isMagic = item.system.attributes?.magic || false;
        const isTreasure = item.system.attributes?.type === "Gem";

        // Determine the appropriate multiplier
        let multiplier = this.multipliers.buyMultiplierItems ?? 0.5; // Default for non-magic items
        if (isMagic) multiplier = this.multipliers.buyMultiplierMagic ?? 0.3;
        if (isTreasure) multiplier = this.multipliers.buyMultiplierTreasure ?? 1.0;

        // Apply the multiplier
        const adjustedCostInCopper = multiplier === 0 ? 0 : adjustCost(baseCostInCopper, multiplier);
        console.log(`Preparing Item: ${item.name}`, {
          baseCostInCopper,
          multiplier,
          adjustedCostInCopper,
        });

        // Convert to display currency
        const displayAdjustedCost = fromCopper(adjustedCostInCopper);

        return {
          id: item.id,
          name: item.name,
          img: item.img,
          type: item.type,
          quantity: item.system.quantity || 0,
          weight: item.system.weight || 0,
          adjustedCost: displayAdjustedCost,
          baseCost: { value: item.system.cost?.value || 0, currency: item.system.cost?.currency || "cp" },
          multiplier,
          isSellable: multiplier > 0 && adjustedCostInCopper > 0, // Sellable only if multiplier > 0 and cost > 0
        };
      })
      .filter((item) => {
        // Ensure the item is sellable and has a valid adjusted cost
        const visible = item.isSellable && Object.values(item.adjustedCost || {}).some((val) => val > 0);
        if (!visible) {
          console.log(`Filtered Out Item: ${item.name}`);
        }
        return visible;
      });
  }
}

export default ShopCore;
