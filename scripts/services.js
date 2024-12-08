import { toCopper, fromCopper, adjustCost, handleTransaction } from "./currencyManager.js";

export default class ServicesManager {
  constructor(actor, html) {
    this.actor = actor; // The shop NPC actor
    this.html = html;   // The rendered HTML of the sheet
    this.services = []; // Placeholder for services, fetched dynamically
  }

  /**
   * Attach event listeners for service actions.
   */
  activateListeners() {
    console.log("ServicesManager | activateListeners called.");

    // Validate the HTML context
    if (!this.html || !this.html.length) {
      console.error("ServicesManager | HTML context is invalid. Cannot attach listeners.");
      return;
    }

    console.log("ServicesManager | Attaching delegated listener for .use-service-btn...");
    
    // Delegated listener for dynamically added buttons
    this.html.on("click", ".use-service-btn", async (event) => {
      console.log("ServicesManager | 'Use Service' button clicked."); // Log click event
      event.preventDefault();

      const button = event.currentTarget;
      const serviceIndex = button.dataset.serviceIndex;

      if (!serviceIndex) {
        console.warn("ServicesManager | No service index found for the button.");
        return;
      }

      console.log(`ServicesManager | Service index: ${serviceIndex}`);

      try {
        // Fetch services dynamically if not already loaded
        if (!this.services.length) {
          console.log("ServicesManager | Fetching services from actor flags...");
          this.services = this.actor.getFlag("world", "services") || [];
        }

        console.log("ServicesManager | Available services:", this.services);

        const service = this.services[serviceIndex];
        if (!service) {
          console.error(`ServicesManager | Service at index ${serviceIndex} not found.`);
          return;
        }

        console.log(`ServicesManager | Selected service: ${service.name}, Cost: ${service.cost}`);

        const customerActor = this.getCustomerActor();
        if (!customerActor) {
          ui.notifications.error("No customer selected.");
          console.error("ServicesManager | No customer actor selected.");
          return;
        }

        console.log(`ServicesManager | Customer actor: ${customerActor.name}`);

        const serviceCostInCopper = toCopper(service.cost, "cp");
        console.log(`ServicesManager | Service cost in copper: ${serviceCostInCopper}`);

        const success = await handleTransaction(customerActor, serviceCostInCopper);

        if (success) {
          console.log("ServicesManager | Transaction successful.");
          ui.notifications.info(`Successfully used service: ${service.name}`);
        } else {
          console.warn("ServicesManager | Insufficient funds for the service.");
          ui.notifications.error("Insufficient funds for this service.");
        }
      } catch (error) {
        console.error("ServicesManager | Error processing service:", error);
        ui.notifications.error("Failed to use service.");
      }
    });

    console.log("ServicesManager | Listeners attached successfully.");
  }

/**
 * Retrieve the currently interacting actor (customer).
 * @returns {Actor|null} - The customer actor or null if none is selected.
 */
getCustomerActor() {
  // Use the ID stored in the "currentCustomer" flag to retrieve the actor
  const selectedActorId = this.actor.getFlag("world", "currentCustomer");

  if (!selectedActorId) {
    console.warn("ServicesManager | No actor ID found in 'currentCustomer' flag.");
    return null;
  }

  // Fetch the actor using its ID
  const actor = game.actors.get(selectedActorId) || null;

  console.log("ServicesManager | Retrieved customer actor:", actor ? actor.name : "None");

  return actor;
}
}
