// Custom Container Item Sheet
class CncCkBackpackItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["tlgcc", "sheet", "item", "cnc-ckbackpack"],
      template: "modules/cnc-ckbackpack/templates/item-container-sheet.html",
      width: 520,
      height: 480
    });
  }

  async getData() {
    const context = await super.getData();
    console.log("getData - Initial Context:", JSON.stringify(context, null, 2));

    // Pre-localize labels for the template
    context.labels = {
      price: game.i18n.localize("TLGCC.Price"),
      ev: game.i18n.localize("TLGCC.ItemEV"), // Updated to use TLGCC.ItemEV
      er: game.i18n.localize("TLGCC.ER")
    };

    console.log("Labels:", JSON.stringify(context.labels, null, 2));
    console.log("getData - Final Context:", JSON.stringify(context, null, 2));
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Submit form on input change
    html.find('input, textarea').on('change', () => {
      this.submit({ preventClose: true });
    });
  }

  async _updateObject(event, formData) {
    console.log("Form Data (Raw):", JSON.stringify(formData, null, 2));
    const expandedData = foundry.utils.expandObject(formData);
    console.log("Form Data (Expanded):", JSON.stringify(expandedData, null, 2));

    // Log the current item data before the update
    console.log("Item Data Before Update:", JSON.stringify(this.object.system, null, 2));

    // Update the item via the parent actor's updateEmbeddedDocuments
    if (this.object.parent) {
      // Merge the expanded data with the current system data to preserve all properties
      const currentSystem = foundry.utils.deepClone(this.object.system);
      const updatedSystem = foundry.utils.mergeObject(currentSystem, expandedData.system || {});
      const updateData = { _id: this.object.id, system: updatedSystem };

      const updateResult = await this.object.parent.updateEmbeddedDocuments("Item", [updateData]);
      console.log("Update Result:", JSON.stringify(updateResult, null, 2));

      // Fetch the item directly from the parent actor to confirm the update
      const updatedItem = this.object.parent.items.get(this.object.id);
      console.log("Item Data After Update (Fetched from Actor):", JSON.stringify(updatedItem.system, null, 2));

      // Fetch the parent actor's data directly from the database to confirm persistence
      const actorFromDb = await game.actors.get(this.object.parent.id);
      const itemFromDb = actorFromDb.items.get(this.object.id);
      console.log("Item Data After Update (Fetched from DB):", JSON.stringify(itemFromDb.system, null, 2));
    } else {
      // Fallback to direct update if there's no parent (shouldn't happen)
      await this.object.update(expandedData);
      console.log("Fallback Update Result:", "No parent actor found");
    }

    // Force re-render to update UI
    this.render(true);
  }
}

// Register Item Sheet and Enhance Actor Sheet
Hooks.once("init", () => {
  const cncSystem = game.system?.id === "castles-and-crusades";
  if (!cncSystem) {
    console.error("cnc-ckbackpack requires the Castles & Crusades system to be active.");
    return;
  }

  Items.registerSheet("castles-and-crusades", CncCkBackpackItemSheet, {
    types: ["container"],
    makeDefault: true,
    label: "CncCkBackpack Container Sheet"
  });
  console.log("cnc-ckbackpack: Container item sheet registered.");

  // Add a preUpdate hook to debug server-side rejection
  Hooks.on("preUpdateItem", (item, updateData, options, userId) => {
    console.log("preUpdateItem Hook - Item:", item.name, "Update Data:", JSON.stringify(updateData, null, 2));
    return true; // Allow the update to proceed
  });
});

// Ensure new container items have the correct data structure
Hooks.on("createItem", async (item, options, userId) => {
  if (item.type === "container") {
    const updateData = {
      "system.price": { value: item.system.price?.value || "" },
      "system.ev": { value: item.system.ev?.value || 0 },
      "system.er": { value: item.system.er?.value || 0 },
      "system.itemIds": item.system.itemIds || []
    };
    await item.update(updateData);
  }
});

// One-time migration to fix existing container items
Hooks.once("ready", async () => {
  for (let actor of game.actors) {
    for (let item of actor.items.filter(i => i.type === "container")) {
      const updateData = {};
      if (typeof item.system.price !== "object" || item.system.price === null || !("value" in item.system.price)) {
        updateData["system.price"] = { value: item.system.price?.value || "" };
      }
      if (typeof item.system.ev !== "object" || item.system.ev === null || !("value" in item.system.ev)) {
        updateData["system.ev"] = { value: item.system.ev?.value || 0 };
      }
      if (typeof item.system.er !== "object" || item.system.er === null || !("value" in item.system.er)) {
        updateData["system.er"] = { value: item.system.er?.value || 0 };
      }
      if (Object.keys(updateData).length > 0) {
        await actor.updateEmbeddedDocuments("Item", [
          { _id: item.id, ...updateData }
        ]);
        console.log(`Migrated container item ${item.name} on actor ${actor.name}`);
      }
    }
  }
});

// Enhance the C&C actor sheet's Items tab
Hooks.on("renderActorSheet", (app, html, data) => {
  if (app.actor.type !== "character" || game.system.id !== "castles-and-crusades") return;

  // Prepare custom items data
  const gear = [];
  const containers = [];
  const actor = app.actor;
  const items = actor.items.filter(item => item.type !== "container");

  for (let i of data.items) {
    i.img = i.img || CONST.DEFAULT_TOKEN;
    if (i.type === "container") {
      i.itemIds = i.system.itemIds || [];
      containers.push(i);
    } else if (!["weapon", "armor", "spell", "feature"].includes(i.type) && !i.system.containerId) {
      gear.push(i);
    }
  }

  for (let container of containers) {
    container.contents = data.items.filter(i => container.itemIds.includes(i._id));
    // Calculate total EV of contents
    container.totalEV = container.contents.reduce((total, item) => {
      return total + (item.system.ev?.value ?? 0) * (item.system.quantity?.value ?? 1);
    }, 0);
  }

  const money = data.system.money || { pp: { value: 0 }, gp: { value: 0 }, sp: { value: 0 }, cp: { value: 0 } };
  const carriedEV = calculateCarriedEV(data, containers);

  // Replace Items tab content
  const itemsTab = html.find(".tab[data-tab='items']");
  if (itemsTab.length) {
    const customItemsHtml = `
      <section class="section resources grid grid-7col">
        <div class="resource flex-group-center" style="max-width: 80px;">
          <strong>${game.i18n.localize("TLGCC.Platinum")}</strong>
          <div class="resource-content flexrow flex-center flex-between">
            <input type="number" name="system.money.pp.value" value="${money.pp?.value ?? 0}" class="money-input"/>
          </div>
        </div>
        <div class="resource flex-group-center" style="max-width: 80px;">
          <strong>${game.i18n.localize("TLGCC.Gold")}</strong>
          <div class="resource-content flexrow flex-center flex-between">
            <input type="number" name="system.money.gp.value" value="${money.gp?.value ?? 0}" class="money-input"/>
          </div>
        </div>
        <div class="resource flex-group-center" style="max-width: 80px;">
          <strong>${game.i18n.localize("TLGCC.Silver")}</strong>
          <div class="resource-content flexrow flex-center flex-between">
            <input type="number" name="system.money.sp.value" value="${money.sp?.value ?? 0}" class="money-input"/>
          </div>
        </div>
        <div class="resource flex-group-center" style="max-width: 80px;">
          <strong>${game.i18n.localize("TLGCC.Copper")}</strong>
          <div class="resource-content flexrow flex-center flex-between">
            <input type="number" name="system.money.cp.value" value="${money.cp?.value ?? 0}" class="money-input"/>
          </div>
        </div>
        <div class="resource flex-group-center grid-span-3">
          <strong>${game.i18n.localize("TLGCC.Valuables")}</strong>
          <div class="resource-content flexrow flex-center flex-between">
            <input type="text" name="system.valuables.value" value="${data.system.valuables?.value ?? ''}" data-dtype="String" placeholder="${game.i18n.localize("TLGCC.ValuablesPlaceholder")}" class="valuables-input"/>
          </div>
        </div>
      </section>

      <ol class="items-list">
        <li class="item flexrow items-header">
          <div class="item-name">Containers</div>
          <div class="item-detail"></div>
          <div class="item-controls">
            <a class="item-control item-create" data-type="container" title="${game.i18n.localize("TLGCC.ItemCreate")}">
              <i class="fas fa-plus"></i> ${game.i18n.localize("TLGCC.Add")}
            </a>
          </div>
        </li>

        ${containers.map(container => {
          const contents = items.filter(item => item.system.containerId === container._id);
          return `
            <li class="item flexrow container-item droppable" data-item-id="${container._id}" draggable="true">
              <div class="item-name">
                <div class="item-image">
                  <img src="${container.img}" title="${container.name}" width="24" height="24"/>
                </div>
                <h4 class="container-toggle" data-item-id="${container._id}">${container.name}</h4>
              </div>
              <div class="item-prop grid grid-2col">
                <div class="flex-left align-right">
                  ${container.system.ev?.value ?? 0} / ${container.system.er?.value ?? 0} EV
                </div>
                <div class="flex-right">
                  ${container.system.price?.value ?? 0}
                </div>
              </div>
              <div class="item-controls">
                <a class="item-control item-edit" title="${game.i18n.localize("TLGCC.ItemEdit")}"><i class="fas fa-edit"></i></a>
                <a class="item-control item-delete" title="${game.i18n.localize("TLGCC.ItemDelete")}"><i class="fas fa-trash"></i></a>
              </div>
              <ol class="container-contents" style="display: none;">
                ${contents.map(item => `
                  <li class="item flexrow" data-item-id="${item._id}" draggable="true">
                    <div class="item-name">
                      <div class="item-image">
                        <a class="rollable" data-roll-type="item">
                          <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                        </a>
                      </div>
                      <h4>${item.system.quantity?.value ?? 1} ${item.name}</h4>
                    </div>
                    <div class="item-prop grid grid-2col">
                      <div class="flex-left align-right">
                        ${(item.system.ev?.value ?? 0) * (item.system.quantity?.value ?? 1)} EV
                      </div>
                      <div class="flex-right">
                        ${item.system.price?.value ?? 0}
                      </div>
                    </div>
                    <div class="item-controls">
                      <a class="item-control item-edit" title="${game.i18n.localize("TLGCC.ItemEdit")}"><i class="fas fa-edit"></i></a>
                      <a class="item-control item-delete" title="${game.i18n.localize("TLGCC.ItemDelete")}"><i class="fas fa-trash"></i></a>
                    </div>
                  </li>
                `).join('')}
              </ol>
            </li>
          `;
        }).join('')}

        <li class="item flexrow items-header">
          <div class="item-name">${game.i18n.localize("TYPES.Item.item")}</div>
          <div class="item-detail">
            Total EV: ${carriedEV}
          </div>
          <div class="item-controls">
            <a class="item-control item-create" data-type="item" title="${game.i18n.localize("TLGCC.ItemCreate")}">
              <i class="fas fa-plus"></i> ${game.i18n.localize("TLGCC.Add")}
            </a>
          </div>
        </li>

        ${gear.map(item => `
          <li class="item flexrow" data-item-id="${item._id}" draggable="true">
            <div class="item-name">
              <div class="item-image">
                <a class="rollable" data-roll-type="item">
                  <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                </a>
              </div>
              <h4>${item.system.quantity?.value ?? 1} ${item.name}</h4>
            </div>
            <div class="item-prop grid grid-2col">
              <div class="flex-left align-right">
                ${item.system.ev?.value ?? 0} EV
              </div>
              <div class="flex-right">
                ${item.system.price?.value ?? 0}
              </div>
            </div>
            <div class="item-controls">
              <a class="item-control item-edit" title="${game.i18n.localize("TLGCC.ItemEdit")}"><i class="fas fa-edit"></i></a>
              <a class="item-control item-delete" title="${game.i18n.localize("TLGCC.ItemDelete")}"><i class="fas fa-trash"></i></a>
            </div>
          </li>
        `).join('')}
      </ol>
    `;
    itemsTab.html(customItemsHtml);

    // Initialize drag-and-drop for the Items tab
    const dragDrop = new DragDrop({
      dragSelector: ".item",
      dropSelector: ".items-list",
      callbacks: {
        dragstart: (event) => {
          const itemId = event.currentTarget.dataset.itemId;
          const item = app.actor.items.get(itemId);
          if (item) {
            event.dataTransfer.setData("text/plain", JSON.stringify({
              type: "Item",
              uuid: item.uuid,
              id: item.id
            }));
          }
        },
        drop: async (event) => {
          const data = TextEditor.getDragEventData(event);
          if (data.type !== "Item") return false;
          const item = await Item.fromDropData(data);
          const containerEl = event.target.closest(".container-item");
          const targetContainerId = containerEl?.dataset.itemId;

          // Only allow adding to a container if the container is in the inventory
          if (targetContainerId) {
            const container = app.actor.items.get(targetContainerId);
            if (container && container.type === "container" && item.type !== "container") {
              const itemIds = container.system.itemIds || [];
              const currentEV = itemIds.reduce((total, id) => {
                const containedItem = app.actor.items.get(id);
                return total + (containedItem?.system.ev?.value ?? 0) * (containedItem?.system.quantity?.value ?? 1);
              }, 0);
              const itemEV = (item.system.ev?.value ?? 0) * (item.system.quantity?.value ?? 1);
              const containerER = container.system.er?.value ?? 0;

              if (currentEV + itemEV <= containerER) {
                // Add to container if within capacity
                if (!itemIds.includes(item.id)) {
                  itemIds.push(item.id);
                  await container.update({ "system.itemIds": itemIds });
                  await item.update({ "system.containerId": container.id });
                  // Re-render the actor sheet to update the inventory
                  app.render(true); // Force re-render
                }
              } else {
                // Spill over to main inventory
                await item.update({ "system.containerId": "" });
                ui.notifications.warn(`${item.name} exceeds the container's capacity and has been placed in the main inventory.`);
              }
              return true;
            }
          }
          // Add to inventory if not dropped on a container
          if (!app.actor.items.get(item.id)) {
            await app.actor.createEmbeddedDocuments("Item", [item.toObject()]);
            app.render(true); // Force re-render
          } else if (item.system.containerId) {
            // If the item was in a container, remove it from the container
            const previousContainer = app.actor.items.get(item.system.containerId);
            if (previousContainer) {
              const itemIds = previousContainer.system.itemIds.filter(id => id !== item.id);
              await previousContainer.update({ "system.itemIds": itemIds });
              await item.update({ "system.containerId": "" });
              app.render(true); // Force re-render
            }
          }
          return true;
        },
        dragover: (event) => {
          const containerEl = event.target.closest(".container-item");
          if (containerEl) {
            $(containerEl).addClass("dragover");
          }
        },
        dragleave: (event) => {
          const containerEl = event.target.closest(".container-item");
          if (containerEl) {
            $(containerEl).removeClass("dragover");
          }
        }
      }
    }).bind(itemsTab[0]);

    // Reattach listeners
    html.find(".container-toggle").click(event => {
      const containerId = event.currentTarget.dataset.itemId;
      const containerEl = event.currentTarget.closest(".item");
      const contentsEl = containerEl.querySelector(".container-contents");
      $(contentsEl).toggle();
    });

    html.find(".item-edit").click(event => {
      const itemId = event.currentTarget.closest(".item").dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    html.find(".item-delete").click(async event => {
      const itemId = event.currentTarget.closest(".item").dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (item) {
        if (item.type === "container" && item.system.itemIds?.length > 0) {
          Dialog.confirm({
            title: game.i18n.localize("TLGCC.ItemDelete"),
            content: game.i18n.localize("TLGCC.ConfirmDeleteContainer"),
            yes: async () => {
              const containedItems = item.system.itemIds.map(id => ({ _id: id, "system.containerId": "" }));
              await app.actor.updateEmbeddedDocuments("Item", containedItems);
              await item.delete();
              app.render(true); // Force re-render
            },
            defaultYes: false
          });
        } else {
          const container = app.actor.items.get(item.system.containerId);
          if (container) {
            const itemIds = container.system.itemIds.filter(id => id !== item.id);
            await container.update({ "system.itemIds": itemIds });
          }
          await item.update({ "system.containerId": "" });
          await item.delete();
          app.render(true); // Force re-render
        }
      }
    });
  }
});

// Helper function for carried EV
function calculateCarriedEV(data, containers) {
  let totalEV = 0;
  const money = data.system.money || { pp: { value: 0 }, gp: { value: 0 }, sp: { value: 0 }, cp: { value: 0 } };
  const coins = (money.pp?.value || 0) + (money.gp?.value || 0) + (money.sp?.value || 0) + (money.cp?.value || 0);
  totalEV += Math.floor(coins / 10);

  // Add EV of items not in containers
  for (let i of data.items) {
    if (i.type !== "container" && !i.system.containerId) {
      totalEV += (i.system.ev?.value || 0) * (i.system.quantity?.value || 1);
    }
  }

  // Add base EV of containers
  for (let container of containers) {
    totalEV += container.system.ev?.value ?? 0;
  }

  return totalEV;
}