/**
 * CurrencyManager: Handles currency conversions, cost adjustments, and transactions.
 * Provides utility functions for converting between currencies, applying multipliers, and managing transactions.
 */

// Conversion rates for all currencies to copper pieces
const conversionRates = {
  pp: 500, // 1 platinum piece = 500 copper pieces
  gp: 100, // 1 gold piece = 100 copper pieces
  ep: 50,  // 1 electrum piece = 50 copper pieces
  sp: 10,  // 1 silver piece = 10 copper pieces
  cp: 1    // 1 copper piece = 1 copper piece
};

// Predefined currency item UUIDs for adding missing currencies
const currencyUUIDs = {
  pp: "Compendium.2e-npc-shop.npc-shops-items.Item.XcnopOr2m994pkYG",
  gp: "Compendium.2e-npc-shop.npc-shops-items.Item.Z9oTbZSrPym8zmbV",
  ep: "Compendium.2e-npc-shop.npc-shops-items.Item.CUbUm9yFcQ18gHTT",
  sp: "Compendium.2e-npc-shop.npc-shops-items.Item.juasvGaPN9jgZpTk",
  cp: "Compendium.2e-npc-shop.npc-shops-items.Item.VVdlEeupS7Zg54Pa",
};


/**
* Converts a value from any currency to copper pieces.
* @param {number} value - The amount of the currency.
* @param {string} currency - The type of currency (pp, gp, ep, sp, cp).
* @returns {number} - The equivalent value in copper pieces.
* @throws {Error} - Throws an error for invalid currency types or negative values.
*/
function toCopper(value, currency) {
  if (!conversionRates[currency]) {
      throw new Error(`Invalid currency type: ${currency}`);
  }
  if (value < 0) {
      throw new Error(`Currency value cannot be negative: ${value}`);
  }
  return value * conversionRates[currency];
}

/**
* Converts a value in copper pieces back to the most appropriate currency.
* Prioritizes higher denominations (pp > gp > ep > sp > cp).
* @param {number} valueInCopper - The value in copper pieces.
* @returns {object} - An object with the converted currency breakdown, excluding zero-value denominations.
* @throws {Error} - Throws an error if the value in copper is negative.
*/
function fromCopper(valueInCopper) {
  if (valueInCopper < 0) {
      throw new Error(`Value in copper cannot be negative: ${valueInCopper}`);
  }

  const breakdown = {};
  for (const [currency, rate] of Object.entries(conversionRates)) {
      breakdown[currency] = Math.floor(valueInCopper / rate);
      valueInCopper %= rate;
  }

  return Object.fromEntries(
      Object.entries(breakdown).filter(([_, amount]) => amount > 0)
  );
}

/**
 * Adjusts the cost of an item based on a multiplier.
 * @param {number} baseValue - The base cost of the item in copper pieces.
 * @param {number} multiplier - The multiplier to apply.
 * @returns {number} - The adjusted cost in copper pieces, or 0 if the multiplier is 0.
 */
function adjustCost(baseValue, multiplier) {
    if (baseValue < 0) {
      throw new Error(`Base value cannot be negative: ${baseValue}`);
    }
    if (multiplier < 0) {
      throw new Error(`Multiplier cannot be negative: ${multiplier}`);
    }
  
    // If the multiplier is 0, return 0 regardless of the base value
    if (multiplier === 0) {
      return 0;
    }
  
    return Math.round(baseValue * multiplier);
  }
  
  
  

/**
 * Handles transactions for purchasing items, services, or repairs.
 * @param {Actor} actor - The actor making the transaction.
 * @param {number} costInCopper - The cost of the item in copper.
 * @returns {Promise<boolean>} - Returns true if the transaction was successful, false otherwise.
 */
async function handleTransaction(actor, costInCopper) {
    if (!actor) {
        console.error("handleTransaction | Actor not found.");
        return false;
    }

    // Fetch inventory and calculate totals
    const inventory = actor.items.filter((item) => item.type === "currency");
    const currencyTotals = {};
    let totalCopper = 0;

    for (const [currency, rate] of Object.entries(conversionRates)) {
        const currencyName = capitalizeCurrencyName(currency);
        const currencyItem = inventory.find((item) => item.name === currencyName);
        const quantity = currencyItem?.system.quantity || 0;

        currencyTotals[currency] = quantity;
        totalCopper += quantity * rate;

        console.log(
            `handleTransaction | Fetched ${quantity} ${currencyName} (${quantity * rate} copper total)`
        );
    }

    if (totalCopper < costInCopper) {
        ui.notifications.error(`${actor.name} cannot afford this transaction.`);
        console.error(
            `handleTransaction | ${actor.name} only has ${totalCopper} copper, but needs ${costInCopper}.`
        );
        return false;
    }

    console.log(`handleTransaction | Total copper available: ${totalCopper}`);
    console.log(`handleTransaction | Cost in copper: ${costInCopper}`);

    let remainingCost = costInCopper;

    // Deduct from smallest denominations first
    console.log(`handleTransaction | Starting deduction process. Remaining cost: ${remainingCost}`);
    for (const [currency, rate] of Object.entries(conversionRates).sort((a, b) => a[1] - b[1])) {
        if (remainingCost <= 0) break;
        const coinsAvailable = currencyTotals[currency];
        if (coinsAvailable > 0) {
            const coinsToDeduct = Math.min(Math.ceil(remainingCost / rate), coinsAvailable);
            currencyTotals[currency] -= coinsToDeduct;
            remainingCost -= coinsToDeduct * rate;

            console.log(
                `handleTransaction | Deducted ${coinsToDeduct} ${currency}. Remaining cost: ${remainingCost}`
            );
        }
    }


    
    // Avoid unnecessary conversions if the cost has already been fully handled
    if (remainingCost > 0) {
        console.log("handleTransaction | Attempting to convert higher denominations.");
        for (const [currency, rate] of Object.entries(conversionRates).sort((a, b) => b[1] - a[1])) {
            if (remainingCost <= 0) break;
            const coinsAvailable = currencyTotals[currency];
            if (coinsAvailable > 0) {
                // Use one larger denomination coin at a time
                currencyTotals[currency] -= 1;
                remainingCost -= rate;

                console.log(
                    `handleTransaction | Converted 1 ${currency} (${rate} copper). Remaining cost: ${remainingCost}`
                );

                // Break down the larger coin into smaller denominations
                for (const [smallCurrency, smallRate] of Object.entries(conversionRates).sort(
                    (a, b) => a[1] - b[1]
                )) {
                    if (remainingCost <= 0 || rate < smallRate) break;
                    const smallerCoins = Math.floor(rate / smallRate);
                    currencyTotals[smallCurrency] += smallerCoins;
                    rate -= smallerCoins * smallRate;

                    console.log(
                        `handleTransaction | Broke 1 ${currency} into ${smallerCoins} ${smallCurrency}.`
                    );
                }
            }
        }
    }

    // Calculate and give change in the highest denominations first
    let remainingChange = -remainingCost; // If negative, this is the change due
    if (remainingChange > 0) {
        console.log(`handleTransaction | Calculating change. Remaining change: ${remainingChange}`);
        for (const [currency, rate] of Object.entries(conversionRates).sort((a, b) => b[1] - a[1])) {
            if (remainingChange <= 0) break;
            const coinsToAdd = Math.floor(remainingChange / rate);
            if (coinsToAdd > 0) {
                currencyTotals[currency] += coinsToAdd;
                remainingChange -= coinsToAdd * rate;

                console.log(
                    `handleTransaction | Added ${coinsToAdd} ${currency} as change. Remaining change: ${remainingChange}`
                );
            }
        }
    }

    if (remainingCost > 0 || remainingChange > 0) {
        console.error(
            "handleTransaction | Error in transaction logic. Remaining cost or change not settled.",
            { remainingCost, remainingChange }
        );
        return false;
    }

    // Update actor's inventory
    console.log("handleTransaction | Final currency totals after transaction:", currencyTotals);
    await Promise.all(
        Object.entries(conversionRates).map(async ([currency]) => {
            const currencyName = capitalizeCurrencyName(currency);
            const existingItem = inventory.find((item) => item.name === currencyName);
            const newQuantity = currencyTotals[currency];

            if (existingItem) {
                await existingItem.update({ "system.quantity": newQuantity });
                console.log(
                    `handleTransaction | Updated ${currencyName} to new quantity: ${newQuantity}`
                );
            } else if (newQuantity > 0) {
                const uuid = currencyUUIDs[currency];
                const templateItem = await fromUuid(uuid);
                const newItemData = duplicate(templateItem.toObject());
                newItemData.system.quantity = newQuantity;
                await actor.createEmbeddedDocuments("Item", [newItemData]);
            }
        })
    );

    //ui.notifications.info(`${actor.name} successfully completed the transaction.`);
    return true;
}


























/**
* Capitalizes currency names for consistent naming in items.
* @param {string} currency - The lowercase currency abbreviation (pp, gp, etc.).
* @returns {string} - The properly formatted currency name.
*/
function capitalizeCurrencyName(currency) {
  const names = {
      pp: "Platinum Coins",
      gp: "Gold Coins",
      ep: "Electrum Coins",
      sp: "Silver Coins",
      cp: "Copper Coins",
  };
  return names[currency] || "Unknown Currency";
}

export { toCopper, fromCopper, adjustCost, handleTransaction };
export default {
  toCopper,
  fromCopper,
  adjustCost,
  handleTransaction,
};
