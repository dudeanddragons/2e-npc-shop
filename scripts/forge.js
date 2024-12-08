import { toCopper, fromCopper, handleTransaction } from "./currencyManager.js";

class ForgeManager {
  constructor(actor, customer, element) {
    this.actor = actor; // The NPC Shop actor
    this.customer = customer; // The interacting character
    this.element = element; // The HTML element for updating UI
  }

  /** Fetch armor items from the customer's inventory */
  fetchArmorItems() {
    if (!this.customer?.actor) {
      console.warn("ForgeManager | No interacting character selected.");
      return [];
    }

    console.log("ForgeManager | Fetching inventory for actor:", this.customer.actor);

    const allItems = this.customer.actor.items || [];
    const armorItems = allItems.filter(item => item.type?.toLowerCase() === "armor");
    console.log("ForgeManager | Filtered armor items:", armorItems);

    return armorItems;
  }

  /** Calculate repair cost for a single armor item */
  calculateRepairCost(item) {
    if (!item?.system?.attributes?.material) {
      console.warn(`ForgeManager | Missing material type for item: ${item.name}`);
      return { totalCost: "N/A", totalCostInCopper: 0 };
    }

    let materialType = item.system.attributes.material.toLowerCase();
    if (materialType.includes("leather")) {
      materialType = "leather";
    } else if (!["metal", "leather"].includes(materialType)) {
      materialType = "other";
    }

    const costPerPoint = this.actor.getFlag("world", `repairMultiplier${capitalizeFirstLetter(materialType)}`) || 0;
    const maxDurability = item.system.protection?.points?.max || 0;
    const currentDurability = item.system.protection?.points?.value || 0;
    const pointsToRepair = maxDurability - currentDurability;

    const totalRepairCostInCopper = pointsToRepair * costPerPoint;

    console.log(`ForgeManager | Calculated repair cost for ${item.name}: ${totalRepairCostInCopper} cp (Material: ${materialType})`);

    return {
      totalCost: fromCopper(totalRepairCostInCopper),
      totalCostInCopper: totalRepairCostInCopper,
    };
  }

  /** Perform repair on a single armor item */
  async repairArmor(itemId) {
    const item = this.customer.actor.items.get(itemId);
    if (!item) {
      console.warn(`ForgeManager | Item not found: ${itemId}`);
      return;
    }

    const { totalCostInCopper } = this.calculateRepairCost(item);

    // Use handleTransaction from currencyManager
    const transactionSuccess = await handleTransaction(this.customer.actor, totalCostInCopper);
    if (!transactionSuccess) {
      ui.notifications.error("Insufficient funds to repair this item.");
      return;
    }

    const maxDurability = item.system.protection?.points?.max || 0;
    await item.update({ "system.protection.points.value": maxDurability });

    ui.notifications.info(`Repaired ${item.name} for ${Object.entries(fromCopper(totalCostInCopper))
      .map(([key, val]) => `${val} ${key}`)
      .join(", ")}.`);
  }

  /** Generate forge data for the UI */
  generateForgeData() {
    const armorItems = this.fetchArmorItems();
    return armorItems.map((item) => {
      const { totalCost, totalCostInCopper } = this.calculateRepairCost(item);
      const maxDurability = item.system.protection?.points?.max || 0;
      const currentDurability = item.system.protection?.points?.value || 0;

      return {
        id: item.id,
        name: item.name,
        img: item.img,
        material: item.system.attributes.material || "unknown",
        maxDurability,
        currentDurability,
        damagePoints: maxDurability - currentDurability,
        repairCost: fromCopper(totalCostInCopper),
        repairCostInCopper: totalCostInCopper,
      };
    });
  }

  /** Update the forge UI */
  updateForgeUI() {
    console.log("ForgeManager | Updating forge UI...");
    const forgeData = this.generateForgeData();
    forgeData.forEach(data => {
      const row = this.element.find(`.forge-item[data-item-id="${data.id}"]`);
      row.find(".repair-cost").text(`Cost: ${Object.entries(data.repairCost)
        .map(([key, val]) => `${val} ${key}`)
        .join(", ")}`);
      row.find(".durability-column").text(`${data.currentDurability} / ${data.maxDurability}`);
      row.find(".damage-points-column").text(data.damagePoints);
    });
  }
}

// Utility function
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export { ForgeManager };
