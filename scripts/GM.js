import { restoreActiveTab } from "./shopTabs.js";
import { toCopper, fromCopper, adjustCost } from "./currencyManager.js";

class GMManager {
  constructor(actor, html) {
    this.actor = actor;
    this.html = html;
    this.services = this.actor.getFlag("world", "services") || [];
  }

  /** Fetch and store currency items */
  async fetchCurrencyItems() {
    const currencyNames = ["platinum coins", "gold coins", "electrum coins", "silver coins", "copper coins"];
    const currencyItems = this.actor.items.filter(item => currencyNames.includes(item.name.toLowerCase()));
    this.currencyContainer = currencyItems.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.system.quantity || 0,
    }));
    console.log("Currency Items Fetched:", this.currencyContainer);
    return this.currencyContainer;
  }

  async fetchMultipliersAndServices() {
    const defaults = {
      sellMultiplierItems: 1.0,
      sellMultiplierMagic: 1.0,
      buyMultiplierItems: 0.5,
      buyMultiplierMagic: 0.5,
      buyMultiplierTreasure: 1.0,
      repairMultiplierMetal: 75,
      repairMultiplierLeather: 5,
      repairMultiplierOther: 500,
    };
  
    const multipliers = {};
    for (const [key, defaultValue] of Object.entries(defaults)) {
      const currentValue = this.actor.getFlag("world", key);
      if (currentValue === undefined) {
        // Initialize the flag to the default value if it doesn't exist
        await this.actor.setFlag("world", key, defaultValue);
        multipliers[key] = defaultValue;
      } else {
        // Parse the value as a float to ensure correctness
        multipliers[key] = parseFloat(currentValue) || 0; // Default to 0 if the value is invalid
      }
  
      // Populate the UI input fields
      this.html.find(`input[name='${key}']`).val(multipliers[key]);
    }
  
    console.log("Multipliers fetched:", multipliers);
  
    // Fetch services from actor flags
    const services = this.actor.getFlag("world", "services") || [];
    console.log("Services fetched:", services);
  
    return { multipliers, services };
  }


  /** Save updated multipliers */
  async saveMultipliers(multipliers) {
    const activeTab = this.html.find(".sheet-tabs .tab-item.active").data("tab");
    console.log(`Saving multipliers. Active tab is "${activeTab}".`);

    const updates = {};
    for (const [key, value] of Object.entries(multipliers)) {
      if (isNaN(value) || value < 0) {
        ui.notifications.error(`Invalid value for ${key}. Must be a non-negative number.`);
        continue;
      }
      updates[`flags.world.${key}`] = value;
    }

    await this.actor.update(updates, { diff: false, render: false });
    ui.notifications.info("All multipliers have been saved.");
    restoreActiveTab(this.html, activeTab);
  }

  
  /** Save updated services */
  async saveServices(services) {
    try {
      await this.actor.setFlag("world", "services", services);
      this.services = services;
      ui.notifications.info("Services updated successfully.");
    } catch (error) {
      console.error("Error saving services:", error);
      ui.notifications.error("Failed to save services.");
    }
  }

  /** Add a new service */
  async addService(name, costInCopper) {
    const services = this.services || [];
    services.push({ name, cost: costInCopper });
    await this.saveServices(services);
    console.log(`Service added: ${name} - Cost: ${fromCopper(costInCopper)}`);
  }

  /** Edit an existing service */
  async editService(index, newName, newCostInCopper) {
    if (index < 0 || index >= this.services.length) {
      console.warn("Invalid service index:", index);
      return;
    }

    this.services[index] = { name: newName, cost: newCostInCopper };
    await this.saveServices(this.services);
    console.log(`Service updated: ${newName} - Cost: ${fromCopper(newCostInCopper)}`);
  }

  /** Delete a service */
  async deleteService(index) {
    if (index < 0 || index >= this.services.length) {
      console.warn("Invalid service index:", index);
      return;
    }

    const removed = this.services.splice(index, 1);
    await this.saveServices(this.services);
    console.log(`Service removed: ${removed[0]?.name}`);
  }

  /** Handle item drops */
  async _onDropItem(event) {
    event.preventDefault();

    const activeTab = this.actor.getFlag("world", "activeTab") || "shop";
    console.log(`Captured active tab before drop: ${activeTab}`);

    try {
      const dataTransfer = event.dataTransfer || event.originalEvent?.dataTransfer;
      if (!dataTransfer) throw new Error("DataTransfer object is missing.");

      const rawData = dataTransfer.getData("text/plain");
      if (!rawData) throw new Error("No drop data found.");

      const data = JSON.parse(rawData);
      if (!data || !data.uuid) throw new Error("Invalid drop data or missing UUID.");

      const droppedItem = await fromUuid(data.uuid);
      if (!droppedItem) throw new Error("Failed to retrieve the dropped item.");

      const droppedItemData = droppedItem.toObject();
      console.log("Dropped Item Data:", droppedItemData);

      const existingItem = this.actor.items.find(
        (i) =>
          i.name === droppedItemData.name &&
          i.type === droppedItemData.type &&
          i.system?.quantity !== undefined
      );

      if (existingItem) {
        const currentQuantity = existingItem.system.quantity || 0;
        const addedQuantity = droppedItemData.system.quantity || 1;
        const newQuantity = currentQuantity + addedQuantity;

        console.log(`Updating quantity for "${existingItem.name}": ${currentQuantity} + ${addedQuantity} = ${newQuantity}`);
        await existingItem.update({ "system.quantity": newQuantity });
        ui.notifications.info(`${existingItem.name} quantity updated to ${newQuantity}.`);
      } else {
        console.log(`Adding new item to inventory: ${droppedItemData.name}`);
        droppedItemData.system.quantity = droppedItemData.system.quantity || 1;
        await this.actor.createEmbeddedDocuments("Item", [droppedItemData]);
        ui.notifications.info(`New item "${droppedItemData.name}" added to inventory.`);
      }
    } catch (error) {
      console.error("Error handling item drop:", error);
      ui.notifications.error(error.message || "Failed to handle item drop.");
    } finally {
      console.log(`Restoring active tab: ${activeTab}`);
      restoreActiveTab(this.html, activeTab);
    }
  }

/** Update UI to display adjusted costs */
renderAdjustedCosts() {
  if (!this.adjustedCosts) return;

  this.adjustedCosts
    .filter((costData) => Object.values(costData.adjustedCost).some((val) => val > 0)) // Only include items with non-zero costs
    .forEach((costData) => {
      const itemRow = this.html.find(`.inventory-item[data-item-id='${costData.id}']`);
      if (!itemRow.length) return;

      itemRow.find(".cost-column").html(`
        <span title="Original: ${costData.originalCost.value} ${costData.originalCost.currency}">
          ${costData.adjustedCost.pp > 0 ? `${costData.adjustedCost.pp} pp` : ""}
          ${costData.adjustedCost.gp > 0 ? `${costData.adjustedCost.gp} gp` : ""}
          ${costData.adjustedCost.ep > 0 ? `${costData.adjustedCost.ep} ep` : ""}
          ${costData.adjustedCost.sp > 0 ? `${costData.adjustedCost.sp} sp` : ""}
          ${costData.adjustedCost.cp > 0 ? `${costData.adjustedCost.cp} cp` : ""}
        </span>
      `);
    });
}

calculateAdjustedCosts(items, multipliers) {
  return items.map(item => {
    const baseCostInCopper = toCopper(item.system.cost?.value || 0, item.system.cost?.currency || "cp");

    // Check for magic items and apply the appropriate multiplier
    const isMagic = item.system.attributes?.magic || false;
    const multiplier = isMagic ? multipliers.sellMultiplierMagic : multipliers.sellMultiplierItems;

    // If the multiplier is explicitly 0, set adjusted cost to 0
    const adjustedCostInCopper = multiplier === 0 ? 0 : adjustCost(baseCostInCopper, multiplier);

    // Convert back to displayable format
    const displayCost = adjustedCostInCopper === 0 ? {} : fromCopper(adjustedCostInCopper);

    return {
      id: item._id, // Ensure the `id` field is included
      name: item.name,
      type: item.type,
      isMagic, // Include the magic flag for debugging or additional UI display
      adjustedCost: displayCost,
      originalCost: {
        value: item.system.cost?.value || 0,
        currency: item.system.cost?.currency || "cp",
      },
    };
  });
}

  /** Attach event listeners for GM interactions */
  activateListeners() {
    // Listener for updating multipliers on blur
    this.html.on("blur", ".gm-multipliers input", async (event) => {
      const input = $(event.currentTarget);
      const key = input.attr("name");
      const value = parseFloat(input.val());
    
      if (isNaN(value) || value < 0) {
        ui.notifications.warn(`Invalid value for ${key}. Must be a non-negative number.`);
        input.val(this.actor.getFlag("world", key) || 0); // Revert to saved value
        return;
      }
    
      try {
        // Update the multiplier
        await this.actor.setFlag("world", key, value);
        ui.notifications.info(`Updated ${key} to ${value}.`);
    
        // Recalculate and re-render costs
        const { multipliers } = await this.fetchMultipliersAndServices();
        const items = this.actor.items.map((item) => item.toObject());
        const adjustedCosts = this.calculateAdjustedCosts(items, multipliers);
        this.adjustedCosts = adjustedCosts;
        this.renderAdjustedCosts(); // Trigger re-render
      } catch (error) {
        console.error(`Error updating ${key}:`, error);
        ui.notifications.error(`Failed to update ${key}.`);
        input.val(this.actor.getFlag("world", key) || 0); // Revert on failure
      }
    });
    
    
    console.log("GM-specific listeners activated.");
  }
}

export default GMManager;
