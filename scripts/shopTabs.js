/**
 * Initializes tab functionality for the NPC Shop UI.
 * @param {jQuery} html - The HTML content of the NPC Shop UI.
 * @param {Actor} actor - The actor associated with the shop sheet.
 * @param {boolean} isFirstRender - Whether this is the first render of the sheet.
 */
export function initializeTabs(html, actor, isFirstRender = false) {
  const isGM = game.user.isGM;

  html.find(".sheet-tabs .tab-item").off("click").on("click", async (event) => {
    const tabName = event.currentTarget.dataset.tab;
    console.log(`Switching to tab: ${tabName}`);

    html.find(".sheet-tabs .tab-item").removeClass("active");
    $(event.currentTarget).addClass("active");

    html.find(".sheet-body").hide();
    const targetTab = html.find(`.sheet-body[data-tab="${tabName}"]`);
    if (targetTab.length) {
      targetTab.show();
    } else {
      console.warn(`Tab content for "${tabName}" not found.`);
    }

    if (actor && actor.setFlag) {
      try {
        await actor.setFlag("world", "activeTab", tabName);
        console.log(`Saved active tab "${tabName}" to actor flags.`);
      } catch (error) {
        console.error(`Failed to save active tab "${tabName}" to actor flags:`, error);
      }
    }
  });

  // Handle GM tab validation
  if (isGM) {
    const gmTab = html.find(`.sheet-tabs .tab-item[data-tab="gm-settings"]`);
    if (!gmTab.length) {
      console.error("GM tab not found in DOM, but user is a GM.");
    }
  }

  const defaultTab = actor?.getFlag("world", "defaultTab") || "shop";
  const activeTab = actor?.getFlag("world", "activeTab");
  const initialTab = isFirstRender ? defaultTab : activeTab || defaultTab;

  console.log(`Initializing tab: ${initialTab}`);
  html.find(".sheet-body").hide();
  html.find(`.sheet-body[data-tab="${initialTab}"]`).show();
  html.find(`.sheet-tabs .tab-item[data-tab="${initialTab}"]`).addClass("active");
}


/**
 * Restores the active tab state after an external action or render.
 * @param {jQuery} html - The HTML content of the sheet.
 * @param {string} activeTab - The tab to restore.
 */
export function restoreActiveTab(html, activeTab) {
  if (!activeTab) {
    console.error("No active tab to restore.");
    return;
  }

  console.log(`Restoring tab: ${activeTab}`);

  // Clear and reapply active tab state
  const tabItem = html.find(`.sheet-tabs .tab-item[data-tab="${activeTab}"]`);
  if (!tabItem.length) {
    console.error(`Tab "${activeTab}" not found. Unable to restore.`);
    return;
  }
  html.find(".sheet-tabs .tab-item").removeClass("active");
  tabItem.addClass("active");

  // Update content visibility
  const tabContent = html.find(`.sheet-body[data-tab="${activeTab}"]`);
  if (!tabContent.length) {
    console.error(`Content for tab "${activeTab}" not found.`);
    return;
  }
  html.find(".sheet-body").hide();
  tabContent.show();

  //console.log(`Successfully restored tab: ${activeTab}`);
}

