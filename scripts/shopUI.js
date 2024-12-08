import { initializeTabs, restoreActiveTab } from "./shopTabs.js";
import GMManager from "./GM.js";
import { ForgeManager } from "./forge.js";
import { toCopper, fromCopper, adjustCost, handleTransaction } from "./currencyManager.js";
import ShopCore from "./shopCore.js";
import ServicesManager from "./services.js";

/**
 * Class definition for the NPC Shop Sheet.
 */
class NPCShopUI extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["npc-shop", "sheet", "actor"],
      template: "modules/2e-npc-shop/templates/npcShopSheet.hbs",
      width: 800,
      height: "auto",
      tabs: [{ navSelector: ".npcShop-tabs", contentSelector: ".sheet-body", initial: "shop" }], // Default to shop tab
    });
  }

  /** Default tab configuration */
  static get defaultTab() {
    return "shop"; // Default tab for the sheet
  }

  /** Constructor for NPCShopUI */
  constructor(...args) {
    super(...args);

    // Initialize ForgeManager with the actor, customer placeholder, and null element
    this.forgeManager = new ForgeManager(this.actor, {}, null);
  }

/** Fetch data for rendering the sheet */
async getData() {
  const data = await super.getData();

  // === GM and Tab Context ===
  data.isGM = game.user.isGM;

  // Default and Active Tabs
  const defaultTab = this.actor.getFlag("world", "defaultTab") || NPCShopUI.defaultTab;
  await this.actor.setFlag("world", "defaultTab", defaultTab);

  const activeTab = this.actor.getFlag("world", "activeTab") || defaultTab;
  await this.actor.setFlag("world", "activeTab", activeTab);

  data.defaultTab = defaultTab;
  data.activeTab = activeTab;

  // === Shop Name ===
  data.shopName = this.actor.getFlag("world", "shopName") ?? this.actor.name;

  // === Owned Character-Type Actors for Dropdown ===
  try {
    const allActors = game.actors?.contents || [];
    const characterActors = allActors.filter(actor =>
      actor.type === "character" && actor.testUserPermission(game.user, "OWNER")
    );

    data.actorOptions = characterActors.map(actor => ({ id: actor.id, name: actor.name }));
  } catch (error) {
    console.error("Failed to collect owned actors:", error);
    data.actorOptions = [];
  }

  data.currentActorId = this.customer?.actor?.id || null;

  // === Fetch All Items ===
  const allItems = this.actor.items.map(item => ({
    id: item.id,
    img: item.img,
    name: item.name,
    type: item.type,
    quantity: item.system.quantity || 0,
    weight: item.system.weight || 0,
    cost: item.system.cost?.value || 0,
    costType: item.system.cost?.currency || "cp",
    isMagic: item.system.attributes?.magic || false,
  }));

  // === Fetch Character Funds ===
  const funds = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  if (this.customer?.actor) {
    const currencyItems = this.customer.actor.items.filter(item => item.type === "currency");
    currencyItems.forEach(item => {
      const quantity = item.system.quantity || 0;
      switch (item.name) {
        case "Platinum Coins": funds.pp += quantity; break;
        case "Gold Coins": funds.gp += quantity; break;
        case "Electrum Coins": funds.ep += quantity; break;
        case "Silver Coins": funds.sp += quantity; break;
        case "Copper Coins": funds.cp += quantity; break;
        default: console.warn("Unknown currency item:", item.name);
      }
    });
  }
  data.funds = funds;

  // === Filter Items for Shop Display ===
  data.items = allItems.filter(item =>
    ["item", "weapon", "container", "armor", "potion"].includes(item.type)
  );

  // === Fetch Multipliers and Services ===
  if (!this.gmManager) this.gmManager = new GMManager(this.actor, this.element);

  try {
    const { multipliers, services } = await this.gmManager.fetchMultipliersAndServices();
    this.multipliers = multipliers || {};
    this.services = services || [];
  } catch (error) {
    console.error("Failed to fetch multipliers and services:", error);
    this.multipliers = {};
    this.services = [];
  }

  data.multipliers = this.multipliers;
  data.repairCosts = {
    metal: this.multipliers.repairMultiplierMetal || 0,
    leather: this.multipliers.repairMultiplierLeather || 0,
    other: this.multipliers.repairMultiplierOther || 0,
  };

  data.services = this.services.map((service, index) => ({
    ...service,
    displayCost: fromCopper(service.cost), // Convert the cost into currency breakdown
    index, // Track the index for editing and deletion
  }));

  // === Calculate Adjusted Costs for Shop Items ===
  data.items = data.items.map(item => {
    const baseCostInCopper = toCopper(item.cost, item.costType);
    const multiplier = item.isMagic
      ? this.multipliers.sellMultiplierMagic ?? 1.0
      : this.multipliers.sellMultiplierItems ?? 1.0;

    // Handle zero-multiplier case explicitly
    const adjustedCostInCopper = multiplier === 0 ? 0 : adjustCost(baseCostInCopper, multiplier);

    return {
      ...item,
      adjustedCost: fromCopper(adjustedCostInCopper), // Convert to currency breakdown
      originalCost: {
        value: item.cost || 0,
        currency: item.costType || "cp",
      },
      isSellable: adjustedCostInCopper > 0, // Filter out zero-cost items
    };
  });

  // Filter out items with zero cost for display
  data.items = data.items.filter(item => item.isSellable);

  // === Prepare Forge Data ===
  data.forgeItems = [];
  if (this.customer?.actor) {
    const forgeItems = this.customer.actor.items.filter(item => item.type.toLowerCase() === "armor");

    data.forgeItems = forgeItems
      .map(item => {
        let materialType = item.system.attributes.material?.toLowerCase() || "unknown";

        // Normalize material types
        if (materialType.includes("leather")) {
          materialType = "leather";
        } else if (!["metal", "leather"].includes(materialType)) {
          materialType = "other";
        }

        const maxDurability = item.system.protection?.points?.max || 0;
        const currentDurability = item.system.protection?.points?.value || 0;
        const damagePoints = maxDurability - currentDurability;

        // Fetch the repair multiplier
        const repairMultiplier =
          this.multipliers[`repairMultiplier${capitalizeFirstLetter(materialType)}`] || 0;

        // Calculate repair cost in copper
        const totalRepairCostInCopper = damagePoints * repairMultiplier;

        return {
          id: item.id,
          name: item.name,
          img: item.img,
          material: materialType,
          maxDurability,
          currentDurability,
          damagePoints,
          repairCost: fromCopper(totalRepairCostInCopper), // Convert to readable currency
          repairCostInCopper: totalRepairCostInCopper, // Raw copper value for filtering
        };
      })
      .filter(item => item.repairCostInCopper > 0); // Filter out items with zero cost
  }

  // === Prepare Sell Inventory Data ===
  const selectedActor = this.customer?.actor || game.actors.get(data.currentActorId);
  if (selectedActor) {
    const shopCore = new ShopCore(this.actor, this.multipliers);
    data.characterItems = shopCore.prepareSellableItems(selectedActor);
  } else {
    data.characterItems = [];
    console.warn("No interacting character selected for sell inventory.");
  }

  // === Process Services ===
  const services = this.actor.getFlag("world", "services") || [];
  data.services = services.map(service => ({
    name: service.name,
    cost: service.cost,
    adjustedCost: fromCopper(service.cost), // Convert to readable format
  }));

  return data;
}
  
/** Activate sheet listeners */
activateListeners(html) {
  super.activateListeners(html);

  // === Initialize Tab Functionality ===
  try {
    initializeTabs(html, this.actor, true);
  } catch (error) {
    console.error("Failed to initialize tabs:", error);
  }

  // === GM-Specific Functionality ===
  if (game.user.isGM) {
    const gmManager = new GMManager(this.actor, html);
    gmManager.activateListeners(); // Attaches updated event listeners
  }

    // Listener for "Identify All Items" button
    html.on("click", "#identify-all-items-btn", async () => {
      console.log("GM Action: Identify All Items in Inventory");
  
      const items = this.actor.items.filter(item => item.system?.attributes?.identified === false);
      if (items.length === 0) {
        ui.notifications.info("All items are already identified.");
        return;
      }
  
      const updates = items.map(item => ({
        _id: item.id,
        "system.attributes.identified": true,
      }));
  
      try {
        await this.actor.updateEmbeddedDocuments("Item", updates);
        ui.notifications.info(`${updates.length} items have been identified.`);
      } catch (error) {
        console.error("Failed to identify items:", error);
        ui.notifications.error("Failed to identify items.");
      }
    });

  // === Listener for Quantity Update ===
  html.on("change", ".quantityInput", async (event) => {
    const input = event.currentTarget;
    const itemId = input.dataset.itemId;
    const newQuantity = parseInt(input.value, 10);

    if (isNaN(newQuantity) || newQuantity < 0) {
      ui.notifications.warn("Quantity must be a valid non-negative number.");
      input.value = 0; // Reset to 0 if invalid input
      return;
    }

    try {
      const item = this.actor.items.get(itemId);
      if (item) {
        await item.update({ "system.quantity": newQuantity });
        ui.notifications.info(`Updated quantity of ${item.name} to ${newQuantity}.`);
      } else {
        throw new Error("Item not found.");
      }
    } catch (error) {
      console.error("Error updating item quantity:", error);
      ui.notifications.error("Failed to update item quantity.");
    }
  });

  // === Listener for Delete Shop Items ===
  html.on("click", ".item-delete-btn", async (event) => {
    const button = event.currentTarget;
    const itemId = button.dataset.itemId;

    if (!itemId) {
      console.warn("No item ID found for delete button.");
      return;
    }

    new Dialog({
      title: "Confirm Deletion",
      content: `<p>Are you sure you want to delete this item?</p>`,
      buttons: {
        yes: {
          icon: '<i class="fas fa-check"></i>',
          label: "Yes",
          callback: async () => {
            try {
              await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
              //ui.notifications.info("Item deleted successfully.");
              this.render(false); // Re-render the sheet to reflect changes
            } catch (error) {
              console.error("Error deleting item:", error);
              ui.notifications.error("Failed to delete item.");
            }
          },
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "No",
        },
      },
      default: "no",
    }).render(true);
  });

  // === Listener for Shop Name Change ===
  const shopNameInput = html.find("#shop-name-input");
  if (!shopNameInput.length) {
    console.error("Shop name input field not found. Listener not attached.");
    return;
  }

  shopNameInput.on("blur", async (event) => {
    const input = $(event.currentTarget);
    const newName = input.val()?.trim() || "";

    if (!newName) {
      ui.notifications.error("Shop name cannot be empty.");
      input.val(this.actor.name); // Revert to current name
      return;
    }

    const currentName = this.actor.name;
    if (newName !== currentName) {
      try {
        await this.actor.update({ name: newName });
        //ui.notifications.info(`Shop name updated to "${newName}".`);
        this.render(false); // Re-render to update header
      } catch (error) {
        console.error("Failed to update shop name:", error);
        input.val(currentName); // Revert on failure
      }
    }
  });

  // === Listener for Shop Portrait Update ===
  html.on("click", "[data-action='change-portrait']", async (event) => {
    const imgElement = event.currentTarget;
    const currentImage = this.actor.img;

    new FilePicker({
      type: "image",
      current: currentImage,
      callback: async (path) => {
        try {
          await this.actor.update({ img: path });
          imgElement.src = path;
          //ui.notifications.info("Shop portrait updated successfully.");
        } catch (error) {
          console.error("Failed to update the portrait:", error);
          ui.notifications.error("Failed to update the shop portrait.");
        }
      },
    }).render(true);
  });

  // === Listener for Editing Items in GM Tab ===
html.on("click", ".edit-item", async (event) => {
  event.preventDefault(); // Prevent default navigation
  event.stopPropagation(); // Stop bubbling

  const itemId = $(event.currentTarget).data("item-id");
  if (!itemId) {
    console.warn("Item ID not found for edit-item link.");
    return;
  }

  try {
    const item = this.actor.items.get(itemId);
    if (!item) {
      ui.notifications.warn("The selected item could not be found.");
      return;
    }

    // Open item sheet in editable mode
    await item.sheet.render(true, { editable: true });
  } catch (error) {
    console.error("Error opening item sheet in edit mode:", error);
  }
});


// === Listener for Interacting Actor Dropdown ===
html.on("change", "#interacting-actor-select", async (event) => {
  const selectedActorId = event.currentTarget.value;

  if (!this.customer) {
    this.customer = {};
  }

  if (!selectedActorId) {
    this.customer.actor = null;
    console.log("No interacting actor selected.");
    await this.actor.unsetFlag("world", "currentCustomer");
    this.render(false);
    return;
  }

  try {
    const selectedActor = game.actors.get(selectedActorId);
    if (!selectedActor) throw new Error(`Actor with ID ${selectedActorId} not found.`);

    this.customer.actor = selectedActor;
    console.log(`Selected interacting actor: ${selectedActor.name}`);

    // Log the actor's inventory
    console.log(`Logging inventory for interacting actor: ${selectedActor.name}`);
    selectedActor.items.forEach((item) => {
      console.log({
        id: item.id,
        name: item.name,
        type: item.type,
        quantity: item.system.quantity || 0,
        durability: item.system.protection?.points || null,
        cost: item.system.cost?.value || 0,
        currency: item.system.cost?.currency || "cp",
      });
    });

    // Set the current customer flag
    await this.actor.setFlag("world", "currentCustomer", selectedActorId);

    // Re-render the UI
    this.render(false);
  } catch (error) {
    console.error("Error setting interacting actor:", error);
    this.customer.actor = null;
    this.render(false);
  }
});

  // === Listener for Viewing Items ===
  html.on("click", ".view-item", async (event) => {
    event.preventDefault();

    const itemId = $(event.currentTarget).data("item-id");
    if (!itemId) {
      console.warn("Item ID not found for view-item link.");
      return;
    }

    try {
      const item = this.actor.items.get(itemId);
      if (!item) {
        ui.notifications.warn("The selected item could not be found.");
        return;
      }

      // Open item sheet in read-only mode
      await item.sheet.render(true, { editable: false });
    } catch (error) {
      console.error("Error opening item sheet:", error);
    }
  });

// === Listener for Buying Items ===
html.on("click", ".itemBuyButton", async (event) => {
  console.log("NPCShopUI | 'Buy Item' button clicked.");
  event.preventDefault();

  const button = event.currentTarget;
  const itemId = button.dataset.itemId;

  if (!itemId) {
    console.error("NPCShopUI | No item ID found on button.");
    ui.notifications.error("Unable to process purchase: item ID missing.");
    return;
  }

  if (!this.shopCore) {
    try {
      this.shopCore = new ShopCore(this.actor, this.multipliers || {});
      console.log("NPCShopUI | ShopCore initialized successfully.");
    } catch (error) {
      console.error("NPCShopUI | Failed to initialize ShopCore:", error);
      ui.notifications.error("Failed to initialize the shop system.");
      return;
    }
  }

  const customerActor = this.shopCore.getInteractingActor();
  if (!customerActor) {
    ui.notifications.error("No interacting actor selected.");
    console.error("NPCShopUI | Failed to retrieve interacting actor.");
    return;
  }

  const shopItem = this.actor.items.get(itemId);
  if (!shopItem) {
    console.error(`NPCShopUI | Item with ID ${itemId} not found in shop inventory.`);
    ui.notifications.error("The selected item could not be found in the shop.");
    return;
  }

  const maxQuantity = shopItem.system.quantity || 0;
  if (maxQuantity <= 0) {
    console.warn(`NPCShopUI | Item ${shopItem.name} is out of stock.`);
    ui.notifications.warn(`${shopItem.name} is out of stock.`);
    return;
  }

  // Apply multipliers to determine the adjusted cost
  const baseCostInCopper = toCopper(shopItem.system.cost?.value || 0, shopItem.system.cost?.currency || "cp");
  const isMagic = shopItem.system.attributes?.magic || false;
  const multiplier = isMagic
    ? this.multipliers.sellMultiplierMagic || 1.0
    : this.multipliers.sellMultiplierItems || 1.0;
  const adjustedCostPerItem = adjustCost(baseCostInCopper, multiplier);

  const costBreakdown = fromCopper(adjustedCostPerItem);
  const costDisplay = Object.entries(costBreakdown)
    .map(([currency, amount]) => `${amount}${currency}`)
    .join(", "); // e.g., "5gp, 2sp, 3cp"

  new Dialog({
    title: `Buy ${shopItem.name}`,
    content: `
      <p>${shopItem.name} costs ${costDisplay} each (adjusted).</p>
      <form>
        <div class="form-group">
          <label for="purchase-quantity">Enter Quantity (Max: ${maxQuantity}):</label>
          <input type="number" id="purchase-quantity" name="quantity" value="1" min="1" max="${maxQuantity}" autofocus>
        </div>
      </form>
    `,
    buttons: {
      buy: {
        icon: '<i class="fas fa-shopping-cart"></i>',
        label: "Buy",
        callback: async (html) => {
          const quantity = parseInt(html.find("#purchase-quantity").val(), 10);

          if (isNaN(quantity) || quantity < 1 || quantity > maxQuantity) {
            ui.notifications.error("Invalid purchase quantity.");
            return;
          }

          const totalCost = adjustedCostPerItem * quantity;
          const totalCostBreakdown = fromCopper(totalCost);
          const totalCostDisplay = Object.entries(totalCostBreakdown)
            .map(([currency, amount]) => `${amount}${currency}`)
            .join(", ");

          // Call handleTransaction to deduct funds
          const success = await handleTransaction(customerActor, totalCost);

          if (!success) {
            ui.notifications.error("Transaction failed. Insufficient funds.");
            return;
          }

          try {
            // Update shop inventory
            await shopItem.update({ "system.quantity": maxQuantity - quantity });

            // Clone and transfer the item to the customer's inventory
            const clonedItemData = duplicate(shopItem.toObject());
            clonedItemData.system.quantity = quantity;

            await customerActor.createEmbeddedDocuments("Item", [clonedItemData]);

            ui.notifications.info(
              `Successfully purchased ${quantity} ${shopItem.name}(s) for ${totalCostDisplay}.`
            );
          } catch (error) {
            console.error("Error processing purchase:", error);
            ui.notifications.error("Failed to complete purchase.");
          }
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
      },
    },
    default: "buy",
  }).render(true);
});

  

  // === Listener for Services ===
  html.on("click", ".delete-service-btn", async (event) => {
    const button = event.currentTarget;
    const serviceIndex = button.dataset.serviceIndex;

    if (serviceIndex === undefined) {
      console.warn("No service index found for delete button.");
      return;
    }

    try {
      const services = this.actor.getFlag("world", "services") || [];
      services.splice(Number(serviceIndex), 1);

      await this.actor.setFlag("world", "services", services);
      //ui.notifications.info("Service deleted successfully.");
      this.render(false); // Re-render the sheet
    } catch (error) {
      console.error("Error deleting service:", error);
      ui.notifications.error("Failed to delete service.");
    }
  });

  html.on("click", "#add-service-btn", async (event) => {
    event.preventDefault();

    new Dialog({
      title: "Add New Service",
      content: `
        <form>
          <div class="form-group">
            <label for="service-name">Service Name:</label>
            <input type="text" id="service-name" placeholder="Enter service name" />
          </div>
          <div class="form-group">
            <label for="service-cost">Cost (in copper):</label>
            <input type="number" id="service-cost" min="0" step="1" placeholder="Enter cost in copper" />
          </div>
        </form>
      `,
      buttons: {
        add: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Add",
          callback: async (html) => {
            const name = html.find("#service-name").val()?.trim();
            const cost = parseInt(html.find("#service-cost").val(), 10);

            if (!name || isNaN(cost) || cost < 0) {
              ui.notifications.error("Invalid service name or cost.");
              return;
            }

            try {
              const services = this.actor.getFlag("world", "services") || [];
              services.push({ name, cost });
              await this.actor.setFlag("world", "services", services);

              //ui.notifications.info("New service added successfully.");
              this.render(false); // Re-render the sheet
            } catch (error) {
              console.error("Error adding service:", error);
              ui.notifications.error("Failed to add service.");
            }
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
        },
      },
      default: "add",
    }).render(true);
  });

  html.on("blur", ".service-name-input, .service-cost-input", async (event) => {
    const input = event.currentTarget;
    const serviceIndex = input.dataset.serviceIndex;

    if (serviceIndex === undefined) {
      console.warn("Service index not found for input field.");
      return;
    }

    try {
      const services = this.actor.getFlag("world", "services") || [];
      const newValue = input.value.trim();

      if (input.classList.contains("service-name-input")) {
        if (!newValue) {
          ui.notifications.error("Service name cannot be empty.");
          input.value = services[serviceIndex]?.name || "";
          return;
        }
        services[serviceIndex].name = newValue;
      } else if (input.classList.contains("service-cost-input")) {
        const newCost = parseInt(newValue, 10);
        if (isNaN(newCost) || newCost < 0) {
          ui.notifications.error("Cost must be a valid non-negative number.");
          input.value = services[serviceIndex]?.cost || 0;
          return;
        }
        services[serviceIndex].cost = newCost;
      }

      await this.actor.setFlag("world", "services", services);
      //ui.notifications.info("Service updated successfully.");
    } catch (error) {
      console.error("Error updating service:", error);
      ui.notifications.error("Failed to update service.");
    }
  });

  // Initialize ServicesManager if not already initialized
  if (!this.servicesManager) {
    console.log("Initializing ServicesManager...");
    this.servicesManager = new ServicesManager(this.actor, html);
  } else {
    this.servicesManager.html = html; // Update reference
  }

  this.servicesManager.activateListeners();


  //Sell Items Button
  html.on("click", ".sellButton", async (event) => {
    console.log("NPCShopUI | 'Sell Item' button clicked.");
    event.preventDefault();
  
    const button = event.currentTarget;
    const itemId = button.dataset.itemId;
  
    if (!itemId) {
      console.error("NPCShopUI | No item ID found on button.");
      ui.notifications.error("Unable to process sale: item ID missing.");
      return;
    }
  
    // Ensure ShopCore is initialized
    if (!this.shopCore) {
      try {
        this.shopCore = new ShopCore(this.actor, this.multipliers || {});
        console.log("NPCShopUI | ShopCore initialized successfully.");
      } catch (error) {
        console.error("NPCShopUI | Failed to initialize ShopCore:", error);
        ui.notifications.error("Failed to initialize the shop system.");
        return;
      }
    }
  
    const customerActor = this.shopCore.getInteractingActor();
    if (!customerActor) {
      ui.notifications.error("No interacting actor selected.");
      console.error("NPCShopUI | Failed to retrieve interacting actor.");
      return;
    }
  
    const playerItem = customerActor.items.get(itemId);
    if (!playerItem) {
      console.error(`NPCShopUI | Item with ID ${itemId} not found in player's inventory.`);
      ui.notifications.error("The selected item could not be found in your inventory.");
      return;
    }
  
    const maxQuantity = playerItem.system.quantity || 0;
    if (maxQuantity <= 0) {
      console.warn(`NPCShopUI | Player does not have any of ${playerItem.name} to sell.`);
      ui.notifications.warn(`You have no ${playerItem.name} to sell.`);
      return;
    }
  
// Fetch item attributes to determine multiplier
const baseCost = toCopper(playerItem.system.cost?.value || 0, playerItem.system.cost?.currency || "cp");
const isMagic = playerItem.system.attributes?.magic || false;
const isTreasure = playerItem.system.attributes?.type === "Gem";

// Determine appropriate multiplier
let multiplier = this.multipliers.buyMultiplierItems; // Do not use fallback
if (multiplier === undefined || multiplier === null) multiplier = 0.5; // Explicit fallback only for undefined/null

if (isMagic) {
  multiplier = this.multipliers.buyMultiplierMagic;
  if (multiplier === undefined || multiplier === null) multiplier = 0.3;
} else if (isTreasure) {
  multiplier = this.multipliers.buyMultiplierTreasure;
  if (multiplier === undefined || multiplier === null) multiplier = 1.0;
}

// Apply the multiplier
const sellPricePerItem = adjustCost(baseCost, multiplier);

// Convert to readable format
const costBreakdown = fromCopper(sellPricePerItem);
const costDisplay = Object.entries(costBreakdown)
  .map(([currency, amount]) => `${amount}${currency}`)
  .join(", "); // e.g., "5gp, 2sp, 3cp"

// Debugging logs
console.log({
  item: playerItem.name,
  baseCost,
  multiplier,
  sellPricePerItem,
  costBreakdown,
  costDisplay,
});

  
    new Dialog({
      title: `Sell ${playerItem.name}`,
      content: `
        <p>You can sell ${playerItem.name} for ${costDisplay} each.</p>
        <form>
          <div class="form-group">
            <label for="sell-quantity">Enter Quantity (Max: ${maxQuantity}):</label>
            <input type="number" id="sell-quantity" name="quantity" value="1" min="1" max="${maxQuantity}" autofocus>
          </div>
        </form>
      `,
      buttons: {
        sell: {
          icon: '<i class="fas fa-coins"></i>',
          label: "Sell",
          callback: async (html) => {
            const quantity = parseInt(html.find("#sell-quantity").val(), 10);
  
            if (isNaN(quantity) || quantity < 1 || quantity > maxQuantity) {
              ui.notifications.error("Invalid sell quantity.");
              return;
            }
  
            const totalEarned = sellPricePerItem * quantity;
            const totalEarnedBreakdown = fromCopper(totalEarned);
            const totalEarnedDisplay = Object.entries(totalEarnedBreakdown)
              .map(([currency, amount]) => `${amount}${currency}`)
              .join(", ");
  
            // Give money to the player
            const success = await handleTransaction(customerActor, -totalEarned); // Negative for adding funds
            if (!success) {
              console.error("NPCShopUI | Failed to update player's currency.");
              ui.notifications.error("Failed to process sale. Please try again.");
              return;
            }
  
            try {
              // Clone and transfer the item to the shop's inventory
              const clonedItemData = duplicate(playerItem.toObject());
              clonedItemData.system.quantity = quantity;
              await this.actor.createEmbeddedDocuments("Item", [clonedItemData]);
  
              console.log(
                `NPCShopUI | Transferred ${quantity} ${playerItem.name}(s) to ${this.actor.name}'s inventory.`
              );
  
              // Update or remove the player's item
              if (maxQuantity === quantity) {
                await playerItem.delete(); // Remove the item entirely
                console.log(`NPCShopUI | Removed ${playerItem.name} from ${customerActor.name}'s inventory.`);
              } else {
                await playerItem.update({ "system.quantity": maxQuantity - quantity }); // Decrement quantity
                console.log(
                  `NPCShopUI | Updated ${playerItem.name} quantity to ${
                    maxQuantity - quantity
                  } in ${customerActor.name}'s inventory.`
                );
              }
  
              //ui.notifications.info(`Successfully sold ${quantity} ${playerItem.name}(s) for ${totalEarnedDisplay}.`);
            } catch (error) {
              console.error("NPCShopUI | Error processing sale:", error);
              ui.notifications.error("Failed to complete sale.");
            }
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
        },
      },
      default: "sell",
    }).render(true);
  });
  
// Listener for Repair Button
html.on("click", ".repair-item-btn", async (event) => {
  console.log("ForgeManager | Repair Armor button clicked.");
  event.preventDefault();

  const button = event.currentTarget;
  const itemId = button.dataset.itemId;

  if (!itemId) {
    console.error("ForgeManager | No data-item-id found for the repair button.");
    ui.notifications.error("Unable to repair: Item ID is missing.");
    return;
  }

  if (!this.customer?.actor) {
    console.error("ForgeManager | No interacting actor selected.");
    ui.notifications.error("No interacting actor found. Select a character first.");
    return;
  }

  const itemToRepair = this.customer.actor.items.get(itemId);
  if (!itemToRepair) {
    console.error(`ForgeManager | Item with ID ${itemId} not found in interacting actor's inventory.`);
    return;
  }

  const repairCostResult = this.forgeManager.calculateRepairCost(itemToRepair);
  const { totalCostInCopper } = repairCostResult;

  const success = await handleTransaction(this.customer.actor, totalCostInCopper);
  if (!success) {
    ui.notifications.error("Insufficient funds to repair this item.");
    return;
  }

  const maxDurability = itemToRepair.system.protection?.points?.max || 0;
  await itemToRepair.update({ "system.protection.points.value": maxDurability });

  //ui.notifications.info(`Successfully repaired ${itemToRepair.name}.`);
  this.forgeManager.updateForgeUI();
});
  console.log("Listeners attached successfully.");
}
  /** Hook into rendering to restore the active tab */
  async _render(force = false, options = {}) {
    const isFirstRender = !this.actor.getFlag("world", "hasRenderedOnce"); // Detect first render

    await super._render(force, options);

    const defaultTab = this.actor.getFlag("world", "defaultTab") || NPCShopUI.defaultTab;

    if (isFirstRender) {
      //console.log(`First render detected. Forcing default tab: ${defaultTab}`);

      // Enforce defaultTab on first render
      initializeTabs(this.element, this.actor, true);

      // Update activeTab to match defaultTab for subsequent renders
      await this.actor.setFlag("world", "activeTab", defaultTab);

      // Mark the first render as complete
      //console.log("Marking first render as complete by setting `hasRenderedOnce` to true.");
      await this.actor.setFlag("world", "hasRenderedOnce", true);
    } else {
      const activeTab = this.actor.getFlag("world", "activeTab") || defaultTab;

      //console.log(`Maintaining active tab on re-render: ${activeTab}`);
      restoreActiveTab(this.element, activeTab);
      //console.log("Render cycle complete. Current active tab:", this.actor.getFlag("world", "activeTab"));
    }
  }

/** Hook into closing to reset the active tab */
async close(options) {
  const defaultTab = this.actor.getFlag("world", "defaultTab") || NPCShopUI.defaultTab;

  try {
    // Call the parent close method first to ensure the sheet is properly closed
    await super.close(options);

    // After the sheet is closed, reset the activeTab to the defaultTab
    await this.actor.setFlag("world", "activeTab", defaultTab);

    console.log(`Sheet closed. Reset activeTab to defaultTab: ${defaultTab}`);
  } catch (error) {
    console.error("Error during sheet close:", error);
  }
}

}

// Place this function outside of the class declaration
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Register custom Handlebars helpers
Handlebars.registerHelper("capitalizeFirstLetter", function (string) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
});


/**
 * Register custom Handlebars helpers
 */
Handlebars.registerHelper("ifEquals", function (arg1, arg2, options) {
  return arg1 === arg2 ? options.fn(this) : options.inverse(this);
});

/**
 * Register the NPC Shop Sheet and make it available for NPCs.
 */
Actors.registerSheet("core", NPCShopUI, {
  types: ["npc"], // Ensure the sheet type is explicitly set for NPCs
  makeDefault: false, // Do not make it the default for all NPCs, only for NPC Shops
});

/**
 * Add the "Create NPC Shop" button to the Actor Directory.
 */
Hooks.on("renderActorDirectory", (app, html, data) => {
  const button = $(`
    <button class="npcShop-button">
      <i class="fas fa-store"></i> Create NPC Shop
    </button>`);

  button.on("click", async () => {
    await createShopActor();
  });

  html.find(".header-actions").prepend(button);
});

/**
 * Function to create a new NPC Shop actor and set its sheet.
 */
async function createShopActor() {
  const actorData = {
    name: "New NPC Shop",
    type: "npc",
    flags: {
      world: {
        shopName: "Default Shop Name",
        shopType: "General Store",
      },
    },
  };

  const newShopActor = await Actor.create(actorData);

  if (newShopActor) {
    // Explicitly set the sheet class to NPCShopUI
    await newShopActor.setFlag("core", "sheetClass", "core.NPCShopUI");

    //ui.notifications.info(`Created a new NPC Shop: ${newShopActor.name}`);
    newShopActor.sheet.render(true);
  } else {
    ui.notifications.error("Failed to create NPC Shop.");
  }
  
}

export { NPCShopUI };