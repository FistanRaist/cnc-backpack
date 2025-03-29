// Define the schema for the container item type (used for items with isContainer: true)
class ContainerDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      price: new fields.SchemaField({
        value: new fields.StringField({ initial: "" })
      }),
      ev: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, integer: true })
      }),
      er: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, integer: true })
      }),
      itemIds: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      description: new fields.HTMLField({ initial: "" }),
      quantity: new fields.SchemaField({
        value: new fields.NumberField({ initial: 1, integer: true })
      }),
      isContainer: new fields.BooleanField({ initial: false }),
      weight: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, integer: true })
      })
    };
  }
}

// Make ContainerDataModel globally accessible
globalThis["cnc-ckbackpack"] = { ContainerDataModel };

// Initialize the module and load the CSS
Hooks.once("init", () => {
  const cncSystem = game.system?.id === "castles-and-crusades";
  if (!cncSystem) {
    throw new Error("cnc-ckbackpack requires the Castles & Crusades system to be active.");
  }

  // Register the module's CSS file
  const cssPath = "modules/cnc-ckbackpack/styles/cnc-ckbackpack.css";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = cssPath;
  document.head.appendChild(link);
  console.log("DEBUG: Loaded CSS file:", cssPath);

  // Register the setting for choosing between Load in lbs. or Encumbrance Value
  game.settings.register("cnc-ckbackpack", "encumbranceMode", {
    name: "Encumbrance Mode",
    hint: "Choose whether to display encumbrance in Load (lbs.) or Encumbrance Value (EV).",
    scope: "client",
    config: true,
    type: String,
    choices: {
      "ev": "Encumbrance Value (EV)",
      "lbs": "Load in lbs."
    },
    default: "ev",
    onChange: value => {
      console.log("DEBUG: Encumbrance Mode changed to:", value);
      ui.windows?.forEach(window => {
        if (window instanceof ActorSheet) window.render(true);
      });
    }
  });

  // Register the setting for enabling/disabling coin weight
  game.settings.register("cnc-ckbackpack", "coinWeightEnabled", {
    name: "Enable Coin Weight",
    hint: "When enabled, coins contribute to EV and weight (160 coins = 1 EV or 10 lbs). When disabled, coins contribute 0 EV and 0 lbs.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: value => {
      console.log("DEBUG: Coin Weight Enabled changed to:", value);
      ui.windows?.forEach(window => {
        if (window instanceof ActorSheet) window.render(true);
      });
    }
  });
});

// Patch the default equipment sheet to include a "Container?" toggle and container fields
Hooks.on("renderItemSheet", (app, html, data) => {
  if (app.item.type !== "item") return;

  // Find the header fields section
  const headerFields = html.find(".header-fields");

  // Replace the existing grid-4col with a custom grid
  const grid4col = html.find(".grid-4col");
  grid4col.remove();

  // Always display the default fields (Quantity, Price, Weight, EV, Container?)
  const fieldsHtml = `
    <div class="fields-grid grid grid-5col">
      <div class="resource">
        <label class="resource-label">${game.i18n.localize("TLGCC.Quantity")}</label>
        <input
          type="text"
          name="system.quantity.value"
          data-dtype="Number"
          value="${app.item.system?.isContainer ? 1 : app.item.system.quantity?.value ?? 1}"
          ${app.item.system?.isContainer ? "readonly" : ""}
        />
      </div>
      <div class="resource">
        <label class="resource-label">${game.i18n.localize("TLGCC.Price")}</label>
        <input
          type="text"
          name="system.price.value"
          data-dtype="String"
          value="${app.item.system.price?.value ?? ''}"
        />
      </div>
      <div class="resource">
        <label class="resource-label">${game.i18n.localize("TLGCC.Weight")}</label>
        <input
          type="text"
          name="system.weight.value"
          data-dtype="Number"
          value="${app.item.system.weight?.value ?? 0}"
        />
      </div>
      <div class="resource">
        <label class="resource-label">${game.i18n.localize("TLGCC.ItemEV")}</label>
        <input
          type="text"
          name="system.ev.value"
          data-dtype="Number"
          value="${app.item.system.ev?.value ?? 0}"
        />
      </div>
      <div class="resource">
        <label class="resource-label container-label" for="system.isContainer">${game.i18n.localize("cnc-ckbackpack.IsContainer")}</label>
        <input
          type="checkbox"
          name="system.isContainer"
          data-dtype="Boolean"
          ${app.item.system?.isContainer ? "checked" : ""}
          class="checkbox-input"
        />
      </div>
    </div>
  `;
  headerFields.append(fieldsHtml);

  // If in container mode, add the Current Capacity / Capacity line in the sheet body
  if (app.item.system?.isContainer) {
    const sheetBody = html.find(".sheet-body");
    const capacityHtml = `
      <div class="capacity-display">
        <label class="resource-label">${game.i18n.localize("cnc-ckbackpack.ItemCurrent")} / ${game.i18n.localize("cnc-ckbackpack.ItemCapacity")}</label>
        <div class="capacity-values">
          <span class="current-capacity">${calculateCurrentEV(app.item, app.actor)}</span> / 
          <input
            type="text"
            name="system.er.value"
            data-dtype="Number"
            value="${app.item.system.er?.value ?? 0}"
            class="capacity-input"
          />
        </div>
      </div>
    `;
    sheetBody.prepend(capacityHtml);
  }

  // Add listener for the "Container?" checkbox with confirmation dialog (only for unchecking)
  html.find("input[name='system.isContainer']").on("click", async (event) => {
    event.preventDefault();

    const checkbox = event.target;
    const isContainer = checkbox.checked;
    const currentState = app.item.system?.isContainer || false;

    // If the state hasn't changed, skip
    if (isContainer === currentState) return;

    // If checking the box (Container: True), proceed without confirmation
    if (!isContainer) {
      const confirmMessage = "Unchecking this will move all contained items to the main inventory. Are you sure?";
      const confirmed = await Dialog.confirm({
        title: "Confirm Container Status Change",
        content: confirmMessage,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (confirmed) {
        if (app.item.system?.itemIds?.length > 0) {
          const containedItems = app.item.system.itemIds.map(id => ({
            _id: id,
            "system.containerId": ""
          }));
          await app.actor.updateEmbeddedDocuments("Item", containedItems);
          await app.item.update({ "system.isContainer": false, "system.itemIds": [] });
        } else {
          await app.item.update({ "system.isContainer": false });
        }
        app.render(true);
      } else {
        checkbox.checked = currentState;
      }
    } else {
      await app.item.update({ "system.isContainer": true, "system.quantity.value": 1 });
      app.render(true);
    }
  });
});

// Helper function to calculate Current Capacity (EV or weight, depending on system)
function calculateCurrentEV(item, actor) {
  let currentCapacity = 0;
  console.log("DEBUG: calculateCurrentEV - Item ID:", item._id, "Item Name:", item.name);
  console.log("DEBUG: calculateCurrentEV - Item IDs in container:", item.system?.itemIds);

  if (item.system?.itemIds && item.system.itemIds.length > 0) {
    if (actor) {
      console.log("DEBUG: calculateCurrentEV - Actor found:", actor.name);
      currentCapacity = item.system.itemIds.reduce((total, id) => {
        const containedItem = actor.items.get(id);
        if (containedItem) {
          const itemEV = (containedItem.system?.ev?.value ?? 0) * (containedItem.system?.quantity?.value ?? 1);
          console.log(`DEBUG: calculateCurrentEV - Contained Item ID: ${id}, Name: ${containedItem.name}, EV: ${containedItem.system?.ev?.value}, Quantity: ${containedItem.system?.quantity?.value}, Total EV for item: ${itemEV}`);
          return total + itemEV;
        } else {
          console.log(`DEBUG: calculateCurrentEV - Contained Item ID: ${id} not found in actor items`);
          return total;
        }
      }, 0);
    } else {
      console.log("DEBUG: calculateCurrentEV - Actor not provided for item:", item._id);
    }
  } else {
    console.log("DEBUG: calculateCurrentEV - No item IDs found in container");
  }

  console.log("DEBUG: calculateCurrentEV - Total Current Capacity:", currentCapacity);
  return currentCapacity;
}

// Helper function to calculate Total Weight of contained items
function calculateTotalWeight(item, actor) {
  let totalWeight = 0;
  if (item.system?.itemIds && item.system.itemIds.length > 0) {
    if (actor) {
      totalWeight = item.system.itemIds.reduce((total, id) => {
        const containedItem = actor.items.get(id);
        return total + (containedItem?.system?.weight?.value ?? 0) * (containedItem?.system?.quantity?.value ?? 1);
      }, 0);
    }
  }
  return totalWeight;
}

// Calculate carried encumbrance value (for non-contained items)
function calculateCarriedEV(data, containers) {
  // Check if coin weight is enabled
  const coinWeightEnabled = game.settings.get("cnc-ckbackpack", "coinWeightEnabled");
  const totalCoins = (data.system?.money?.pp?.value ?? 0) +
                     (data.system?.money?.gp?.value ?? 0) +
                     (data.system?.money?.sp?.value ?? 0) +
                     (data.system?.money?.cp?.value ?? 0);
  const moneyEV = coinWeightEnabled ? Math.floor(totalCoins / 160) : 0; // 160 coins = 1 EV, round down

  const gearEV = data.items
    .filter(i => !(i.type === "item" && i.system?.isContainer) && !["weapon", "armor", "spell", "feature"].includes(i.type) && !i.system?.containerId)
    .reduce((total, i) => total + (i.system?.ev?.value ?? 0) * (i.system?.quantity?.value ?? 1), 0);
  const containerEV = containers.reduce((total, c) => total + (c.system?.ev?.value ?? 0), 0);
  return moneyEV + gearEV + containerEV;
}

// Calculate total weight of non-contained items (gear, containers, and money)
function calculateCarriedWeight(data, containers) {
  // Check if coin weight is enabled
  const coinWeightEnabled = game.settings.get("cnc-ckbackpack", "coinWeightEnabled");
  const totalCoins = (data.system?.money?.pp?.value ?? 0) +
                     (data.system?.money?.gp?.value ?? 0) +
                     (data.system?.money?.sp?.value ?? 0) +
                     (data.system?.money?.cp?.value ?? 0);
  const moneyWeight = coinWeightEnabled ? Math.floor(totalCoins / 160) * 10 : 0; // 160 coins = 10 lbs, round down

  const gearWeight = data.items
    .filter(i => !(i.type === "item" && i.system?.isContainer) && !["weapon", "armor", "spell", "feature"].includes(i.type) && !i.system?.containerId)
    .reduce((total, i) => total + (i.system?.weight?.value ?? 0) * (i.system?.quantity?.value ?? 1), 0);
  const containerWeight = containers.reduce((total, c) => total + (c.system?.weight?.value ?? 0), 0);
  const totalWeight = moneyWeight + gearWeight + containerWeight;
  // Return as a whole number (no decimal) for Load in lbs. mode
  return Math.round(totalWeight);
}

// Calculate encumbrance rating based on Strength score and Prime attributes
function calculateEncumbranceRating(data) {
  const strengthScore = data.system?.abilities?.str?.value || 0;
  const strengthPrime = data.system?.abilities?.str?.ccprimary || false;
  const constitutionPrime = data.system?.abilities?.con?.ccprimary || false;
  
  // Log the raw values for debugging
  console.log("DEBUG: calculateEncumbranceRating - Strength Score:", strengthScore);
  console.log("DEBUG: calculateEncumbranceRating - Strength Prime (ccprimary):", data.system?.abilities?.str?.ccprimary);
  console.log("DEBUG: calculateEncumbranceRating - Constitution Prime (ccprimary):", data.system?.abilities?.con?.ccprimary);
  console.log("DEBUG: calculateEncumbranceRating - Strength Prime (boolean):", strengthPrime);
  console.log("DEBUG: calculateEncumbranceRating - Constitution Prime (boolean):", constitutionPrime);

  // Calculate bonuses based on Prime attributes using if-else
  let primeBonus = 0;
  if (strengthPrime && constitutionPrime) {
    primeBonus = 6; // Both Strength and Constitution are Prime
    console.log("DEBUG: calculateEncumbranceRating - Both Strength and Constitution are Prime, adding 6");
  } else if (strengthPrime) {
    primeBonus = 3; // Only Strength is Prime
    console.log("DEBUG: calculateEncumbranceRating - Strength is Prime, adding 3");
  } else if (constitutionPrime) {
    primeBonus = 3; // Only Constitution is Prime
    console.log("DEBUG: calculateEncumbranceRating - Constitution is Prime, adding 3");
  } else {
    primeBonus = 0; // Neither is Prime
    console.log("DEBUG: calculateEncumbranceRating - Neither Strength nor Constitution is Prime, adding 0");
  }
  
  console.log("DEBUG: calculateEncumbranceRating - Prime Bonus:", primeBonus);
  
  const totalRating = strengthScore + primeBonus;
  console.log("DEBUG: calculateEncumbranceRating - Total Rating:", totalRating);
  
  return totalRating;
}

// Determine encumbrance category based on Total EV and Rating
function determineEncumbranceCategory(totalEV, rating) {
  if (totalEV <= rating) {
    return { category: "UNBURDENED", tooltip: "No Effect", class: "unburdened" };
  } else if (totalEV <= 3 * rating) {
    return { category: "BURDENED", tooltip: "-10 ft. to Move Score (Minimum 5 ft.) and +2 to Challenge Level of all Dexterity based checks.", class: "burdened" };
  } else {
    return { category: "OVERBURDENED", tooltip: "Move reduced to 5 ft., Automatically fail all Dexterity based checks, Lose Dexterity bonus to AC.", class: "overburdened" };
  }
}

// Enhance the actor sheet's Equipment tab
Hooks.on("renderActorSheet", (app, html, data) => {
  if (app.actor.type !== "character" || game.system.id !== "castles-and-crusades") return;

  console.log("DEBUG: renderActorSheet - Starting to render Equipment tab for actor:", app.actor.name);

  const gear = [];
  const containers = [];
  const actor = app.actor;
  const items = actor.items.filter(item => !(item.type === "item" && item.system?.isContainer));

  // Use Sets to avoid duplicates in containers and gear, but allow duplicates in gear
  const containerIds = new Set();
  const gearIds = new Set();

  // Do not deduplicate items to preserve default system behavior
  const uniqueItems = data.items;

  for (let i of uniqueItems) {
    i.img = i.img || CONST.DEFAULT_TOKEN;
    if (i.type === "item" && i.system?.isContainer && !containerIds.has(i._id)) {
      i.itemIds = i.system.itemIds || [];
      containers.push(i);
      containerIds.add(i._id);
      console.log("DEBUG: Added container to render - Name:", i.name, "ID:", i._id);
    } else if (!["weapon", "armor", "spell", "feature"].includes(i.type) && !i.system?.containerId) {
      gear.push(i);
      gearIds.add(i._id);
      console.log("DEBUG: Added gear to render - Name:", i.name, "ID:", i._id);
    }
  }

  for (let container of containers) {
    container.contents = data.items.filter(i => container.itemIds.includes(i._id));
    container.totalEV = calculateCurrentEV(container, app.actor);
  }

  const money = data.system?.money || { pp: { value: 0 }, gp: { value: 0 }, sp: { value: 0 }, cp: { value: 0 } };
  const carriedEV = calculateCarriedEV(data, containers);
  const carriedWeight = calculateCarriedWeight(data, containers);
  const rating = calculateEncumbranceRating(data);

  // Determine encumbrance mode and adjust Rating and Carried values
  const encumbranceMode = game.settings.get("cnc-ckbackpack", "encumbranceMode");
  let displayRating, displayCarried, ratingLabel, carriedLabel;
  if (encumbranceMode === "lbs") {
    displayRating = rating * 10; // Convert ER to lbs.
    displayCarried = carriedWeight; // Total weight in lbs. (whole number)
    ratingLabel = `${displayRating} lbs.`;
    carriedLabel = `${displayCarried} lbs.`;
  } else {
    displayRating = rating;
    displayCarried = carriedEV;
    ratingLabel = `${displayRating} ER`;
    carriedLabel = `${displayCarried} EV`;
  }

  const encumbrance = determineEncumbranceCategory(carriedEV, rating);

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
            <input type="text" name="system.valuables.value" value="${data.system?.valuables?.value ?? ''}" data-dtype="String" placeholder="${game.i18n.localize("TLGCC.ValuablesPlaceholder")}" class="valuables-input"/>
          </div>
        </div>
      </section>

      <section class="section encumbrance grid grid-3col">
        <div class="resource flex-group-center">
          <strong>Rating</strong>
          <div class="resource-content flexrow flex-center flex-between">
            <input type="text" value="${ratingLabel}" readonly class="encumbrance-input"/>
          </div>
        </div>
        <div class="resource flex-group-center">
          <strong>Carried</strong>
          <div class="resource-content flexrow flex-center flex-between">
            <input type="text" value="${carriedLabel}" readonly class="encumbrance-input"/>
          </div>
        </div>
        <div class="resource flex-group-center">
          <strong>Category</strong>
          <div class="resource-content flexrow flex-center flex-between">
            <input type="text" value="${encumbrance.category}" readonly class="encumbrance-input ${encumbrance.class}" title="${encumbrance.tooltip}"/>
          </div>
        </div>
      </section>

      <ol class="items-list containers-section">
        <li class="item flexrow items-header">
          <div class="item-name">Containers</div>
          <div class="item-detail"></div>
          <div class="item-controls">
            <a class="item-control item-create" data-type="item" data-is-container="true" title="${game.i18n.localize("TLGCC.ItemCreate")}">
              <i class="fas fa-plus"></i> ${game.i18n.localize("TLGCC.Add")}
            </a>
          </div>
        </li>

        ${containers.map(container => {
          const contents = data.items.filter(i => container.itemIds.includes(i._id));
          return `
            <li class="item container-item droppable" data-item-id="${container._id}" draggable="true">
              <div class="container-header-wrapper">
                <div class="item-name">
                  <div class="item-image">
                    <img src="${container.img}" title="${container.name}" width="24" height="24"/>
                  </div>
                  <h4 class="container-toggle" data-item-id="${container._id}">${container.name}</h4>
                </div>
                <div class="item-prop grid grid-2col">
                  <div class="flex-center align-right">
                    ${container.totalEV ?? 0} / ${container.system?.er?.value ?? 0} EV
                  </div>
                  <div class="flex-right">
                    ${container.system?.price?.value ?? 0}
                  </div>
                </div>
                <div class="item-controls">
                  <a class="item-control item-edit" title="${game.i18n.localize("TLGCC.ItemEdit")}"><i class="fas fa-edit"></i></a>
                  <a class="item-control item-delete" title="${game.i18n.localize("TLGCC.ItemDelete")}"><i class="fas fa-trash"></i></a>
                </div>
              </div>
              <ol class="container-contents" style="display: none;">
                ${contents.map(item => `
                  <li class="item contained-item" data-item-id="${item._id}" draggable="true">
                    <div class="item-name">
                      <div class="item-image">
                        <a class="rollable" data-roll-type="item">
                          <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                        </a>
                      </div>
                      <a class="quantity-decrement" data-item-id="${item._id}" title="Decrease Quantity">
                        <img src="modules/cnc-ckbackpack/assets/caret-left.png" width="16" height="16" alt="Decrease Quantity"/>
                      </a>
                      <span class="quantity-value">${item.system?.quantity?.value ?? 1}</span>
                      <a class="quantity-increment" data-item-id="${item._id}" title="Increase Quantity">
                        <img src="modules/cnc-ckbackpack/assets/caret-right.png" width="16" height="16" alt="Increase Quantity"/>
                      </a>
                      <h4>${item.name}</h4>
                    </div>
                    <div class="item-prop grid grid-2col">
                      <div class="flex-center align-right">
                        ${(item.system?.ev?.value ?? 0) * (item.system?.quantity?.value ?? 1)} EV
                      </div>
                      <div class="flex-right">
                        ${item.system?.price?.value ?? 0}
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

        <li class="item flexrow items-header main-inventory droppable">
          <div class="item-name">${game.i18n.localize("TYPES.Item.item")}</div>
          <div class="item-detail"></div>
          <div class="item-controls">
            <a class="item-control item-create" data-type="item" data-is-container="false" title="${game.i18n.localize("TLGCC.ItemCreate")}">
              <i class="fas fa-plus"></i> ${game.i18n.localize("TLGCC.Add")}
            </a>
          </div>
        </li>

        ${gear.map(item => `
          <li class="item flexrow inventory-item droppable" data-item-id="${item._id}" draggable="true">
            <div class="item-name">
              <div class="item-image">
                <a class="rollable" data-roll-type="item">
                  <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                </a>
              </div>
              <a class="quantity-decrement" data-item-id="${item._id}" title="Decrease Quantity">
                <img src="modules/cnc-ckbackpack/assets/caret-left.png" width="16" height="16" alt="Decrease Quantity"/>
              </a>
              <span class="quantity-value">${item.system?.quantity?.value ?? 1}</span>
              <a class="quantity-increment" data-item-id="${item._id}" title="Increase Quantity">
                <img src="modules/cnc-ckbackpack/assets/caret-right.png" width="16" height="16" alt="Increase Quantity"/>
              </a>
              <h4>${item.name}</h4>
            </div>
            <div class="item-prop grid grid-3col">
              <div class="flex-left align-right">
                ${(item.system?.weight?.value ?? 0) * (item.system?.quantity?.value ?? 1)} lbs.
              </div>
              <div class="flex-center align-right">
                ${(item.system?.ev?.value ?? 0) * (item.system?.quantity?.value ?? 1)} EV
              </div>
              <div class="flex-right">
                ${item.system?.price?.value ?? 0}
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

    const dragDrop = new DragDrop({
      dragSelector: ".item",
      dropSelector: ".items-list",
      callbacks: {
        dragstart: (event) => {
          const liElement = event.currentTarget.closest("li.item");
          const itemId = liElement.dataset.itemId;
          const item = app.actor.items.get(itemId);
          if (item) {
            const isContained = liElement.classList.contains("contained-item");
            event.dataTransfer.setData("text/plain", JSON.stringify({
              type: "Item",
              uuid: item.uuid,
              id: item.id,
              isContained: isContained,
              isSidebar: false
            }));
            console.log("DEBUG: Dragstart - Item:", item.name, "ID:", itemId, "Is Contained:", isContained);
          }
        },
        drop: async (event) => {
          event.preventDefault();
          event.stopPropagation(); // Stop propagation to ensure the drop event isn't consumed by child elements
          console.log("DEBUG: Drop event triggered on target:", event.target);
          console.log("DEBUG: Drop event path:", event.composedPath().map(el => el.className || el.tagName));

          const data = TextEditor.getDragEventData(event);
          if (data.type !== "Item") {
            console.log("DEBUG: Dropped data is not an Item, skipping");
            return false;
          }
          const item = await Item.fromDropData(data);
          console.log("DEBUG: Dropped item - Name:", item.name, "Type:", item.type, "ID:", item.id, "Is Contained:", data.isContained);

          // Find the closest items-list to determine the section
          let target = event.target;
          let containerEl = null;
          let containersSection = null;
          let mainInventorySection = null;
          let mainInventoryEl = null;
          for (let el of event.composedPath()) {
            if (el.classList && el.classList.contains("container-item")) {
              containerEl = el;
              break;
            }
            if (el.classList && el.classList.contains("main-inventory")) {
              mainInventoryEl = el;
              break;
            }
            if (el.classList && el.classList.contains("items-list")) {
              if (el.classList.contains("containers-section")) {
                containersSection = el;
              } else if (el.classList.contains("main-inventory-section")) {
                mainInventorySection = el;
              }
              break;
            }
          }
          const targetContainerId = containerEl?.dataset.itemId;

          console.log("DEBUG: Container element found:", containerEl?.dataset.itemId || "none");
          console.log("DEBUG: Main inventory element found:", mainInventoryEl ? "yes" : "no");
          console.log("DEBUG: Containers section found:", containersSection ? "yes" : "no");
          console.log("DEBUG: Main inventory section found:", mainInventorySection ? "yes" : "no");

          // Case 1: Dropped into a container (from actor or sidebar)
          if (targetContainerId) {
            console.log("DEBUG: Dropped into container with ID:", targetContainerId);
            const container = app.actor.items.get(targetContainerId);
            if (container && container.type === "item" && container.system?.isContainer) {
              // Allow any item to be placed in a container, except another container
              if (item.system?.isContainer) {
                ui.notifications.warn("Cannot place a container inside another container.");
                return false;
              }

              const itemIds = container.system.itemIds || [];
              const currentEV = itemIds.reduce((total, id) => {
                const containedItem = app.actor.items.get(id);
                return total + (containedItem?.system?.ev?.value ?? 0) * (containedItem?.system?.quantity?.value ?? 1);
              }, 0);
              const itemEV = (item.system?.ev?.value ?? 0) * (item.system?.quantity?.value ?? 1);
              const containerER = container.system?.er?.value ?? 0;
              const currentItemCount = itemIds.length;

              // Check both EV and item count against the container's capacity
              if (currentEV + itemEV <= containerER && currentItemCount < containerER) {
                if (data.id) {
                  // If dragged from actor, just update the containerId
                  if (!itemIds.includes(item.id)) {
                    itemIds.push(item.id);
                    await container.update({ "system.itemIds": itemIds });
                    await item.update({ "system.containerId": container.id });
                  }
                } else {
                  // If dragged from sidebar, create a new item
                  const itemData = item.toObject();
                  delete itemData._id; // Remove the ID to create a new item
                  itemData.system.quantity = { value: 1 };
                  itemData.system.containerId = container.id;
                  const newItems = await app.actor.createEmbeddedDocuments("Item", [itemData]);
                  const newItem = newItems[0];
                  if (newItem) {
                    itemIds.push(newItem.id);
                    await container.update({ "system.itemIds": itemIds });
                  } else {
                    console.error("DEBUG: Failed to create new item from sidebar drop");
                    ui.notifications.error(`Failed to add ${item.name} to the container.`);
                    return false;
                  }
                }
                app.render(true);
              } else {
                let warningMessage = "";
                if (currentEV + itemEV > containerER) {
                  warningMessage = `${item.name} exceeds the container's EV capacity (${currentEV + itemEV}/${containerER})`;
                } else {
                  warningMessage = `${item.name} exceeds the container's item count capacity (${currentItemCount + 1}/${containerER})`;
                }
                if (data.id) {
                  // If dragged from actor, move it back to the main inventory
                  await item.update({ "system.containerId": "" });
                } else {
                  // If dragged from sidebar, the item should already be created; ensure it's in the main inventory
                  const itemData = item.toObject();
                  delete itemData._id;
                  itemData.system.quantity = { value: 1 };
                  itemData.system.containerId = "";
                  itemData.system.isContainer = false;
                  const newItems = await app.actor.createEmbeddedDocuments("Item", [itemData]);
                  const newItem = newItems[0];
                  if (!newItem) {
                    console.error("DEBUG: Failed to create new item in main inventory after overcapacity");
                    ui.notifications.error(`Failed to add ${item.name} to the main inventory.`);
                    return false;
                  }
                  await newItem.update({ "system.containerId": "" });
                }
                ui.notifications.warn(`${warningMessage} and has been placed in the main inventory.`);
                app.render(true);
              }
              return true;
            }
          }

          // Case 2: Dropped into the containers section (from sidebar)
          if (containersSection) {
            console.log("DEBUG: Dropped into containers section");
            if (data.id) {
              // If dragged from actor, update the isContainer flag
              await item.update({ "system.isContainer": true, "system.containerId": "" });
              app.render(true);
              return true;
            } else {
              // If dragged from sidebar, create a new container item
              const itemData = item.toObject();
              delete itemData._id; // Remove the ID to create a new item
              itemData.system.quantity = { value: 1 };
              itemData.system.isContainer = true;
              itemData.system.containerId = "";
              const newItems = await app.actor.createEmbeddedDocuments("Item", [itemData]);
              const newItem = newItems[0];
              if (!newItem) {
                console.error("DEBUG: Failed to create new container item from sidebar drop");
                ui.notifications.error(`Failed to add ${item.name} to the containers section.`);
                return false;
              }
              app.render(true);
              return true;
            }
          }

          // Case 3: Dropped into the main inventory (remove from container or from sidebar)
          if (mainInventorySection || mainInventoryEl) {
            if (data.isContained) {
              console.log("DEBUG: Dropped into main inventory, removing from container");
              const containerId = item.system?.containerId;
              if (containerId) {
                const container = app.actor.items.get(containerId);
                if (container) {
                  const itemIds = container.system?.itemIds?.filter(id => id !== item.id) || [];
                  await container.update({ "system.itemIds": itemIds });
                }
                await item.update({ "system.containerId": "" });
                app.render(true);
              }
              return true;
            } else {
              // Let the default system handle sidebar drops into the main inventory
              console.log("DEBUG: Letting default system handle drop into main inventory");
              const itemData = item.toObject();
              delete itemData._id; // Remove the ID to create a new item
              itemData.system.quantity = { value: 1 };
              itemData.system.isContainer = false; // Ensure it's not a container
              itemData.system.containerId = "";
              const newItems = await app.actor.createEmbeddedDocuments("Item", [itemData]);
              const newItem = newItems[0];
              if (!newItem) {
                console.error("DEBUG: Failed to create new item in main inventory from sidebar drop");
                ui.notifications.error(`Failed to add ${item.name} to the main inventory.`);
                return false;
              }
              app.render(true);
              return true;
            }
          }

          // Case 4: Dropped outside a container or main inventory (do nothing)
          if (data.isContained) {
            console.log("DEBUG: Dropped outside a container or main inventory, doing nothing");
            return false;
          }

          // Case 5: Let the default system handle the drop (e.g., sidebar drops elsewhere)
          console.log("DEBUG: Letting default system handle drop");
          return false; // Return false to allow other drop handlers (e.g., the system's default) to process the event
        },
        dragover: (event) => {
          event.preventDefault(); // Ensure the dragover event allows dropping
          // Remove dragover class from all elements first
          const itemsList = event.currentTarget.closest(".items-list");
          if (itemsList) {
            $(itemsList).find(".dragover").removeClass("dragover");
          }
          // Add dragover class to the deepest matching element
          let containerEl = null;
          let containersSection = null;
          let mainInventorySection = null;
          for (let el of event.composedPath()) {
            if (el.classList && el.classList.contains("container-item")) {
              containerEl = el;
              break;
            }
            if (el.classList && el.classList.contains("items-list")) {
              if (el.classList.contains("containers-section")) {
                containersSection = el;
              } else if (el.classList.contains("main-inventory-section")) {
                mainInventorySection = el;
              }
              break;
            }
          }
          if (containerEl) {
            $(containerEl).addClass("dragover");
            console.log("DEBUG: Dragover on container:", containerEl.dataset.itemId);
          } else if (containersSection) {
            $(containersSection).addClass("dragover");
            console.log("DEBUG: Dragover on containers section");
          } else if (mainInventorySection) {
            $(mainInventorySection).addClass("dragover");
            console.log("DEBUG: Dragover on main inventory section");
          }
        },
        dragleave: (event) => {
          let containerEl = null;
          let containersSection = null;
          let mainInventorySection = null;
          for (let el of event.composedPath()) {
            if (el.classList && el.classList.contains("container-item")) {
              containerEl = el;
              break;
            }
            if (el.classList && el.classList.contains("items-list")) {
              if (el.classList.contains("containers-section")) {
                containersSection = el;
              } else if (el.classList.contains("main-inventory-section")) {
                mainInventorySection = el;
              }
              break;
            }
          }
          if (containerEl) {
            $(containerEl).removeClass("dragover");
            console.log("DEBUG: Dragleave on container:", containerEl.dataset.itemId);
          }
          if (containersSection) {
            $(containersSection).removeClass("dragover");
            console.log("DEBUG: Dragleave on containers section");
          }
          if (mainInventorySection) {
            $(mainInventorySection).removeClass("dragover");
            console.log("DEBUG: Dragleave on main inventory section");
          }
        }
      }
    }).bind(itemsTab[0]);

    // Add click event listener for "+Add" buttons
    html.find(".item-create").click(async (event) => {
      event.preventDefault();
      event.stopPropagation(); // Prevent the click from interfering with drag-and-drop
      console.log("DEBUG: item-create clicked");

      const isContainer = event.currentTarget.dataset.isContainer === "true";
      console.log("DEBUG: Creating new item - isContainer:", isContainer);

      // Create a new item with the appropriate isContainer value
      const itemData = {
        name: isContainer ? "New Container" : "New Item",
        type: "item",
        system: {
          isContainer: isContainer,
          quantity: { value: 1 },
          price: { value: "" },
          ev: { value: 0 },
          er: { value: isContainer ? 10 : 0 }, // Default capacity for containers
          itemIds: isContainer ? [] : undefined,
          containerId: "",
          weight: { value: 0 }
        }
      };

      try {
        const newItems = await app.actor.createEmbeddedDocuments("Item", [itemData]);
        const newItem = newItems[0];
        if (newItem) {
          console.log("DEBUG: New item created - Name:", newItem.name, "ID:", newItem.id, "isContainer:", isContainer);
          newItem.sheet.render(true); // Open the item sheet for editing
        } else {
          console.error("DEBUG: Failed to create new item");
          ui.notifications.error(`Failed to create new ${isContainer ? "container" : "item"}.`);
        }
      } catch (error) {
        console.error("DEBUG: Error creating new item:", error.message);
        ui.notifications.error(`Failed to create new ${isContainer ? "container" : "item"}: ${error.message}`);
      }
    });

    // Add click event listener for quantity increment/decrement buttons
    html.find(".quantity-increment").click(async (event) => {
      event.stopPropagation();
      const itemId = event.currentTarget.dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (item) {
        const currentQuantity = item.system?.quantity?.value ?? 1;
        await item.update({ "system.quantity.value": currentQuantity + 1 });
        app.render(true);
      }
    });

    html.find(".quantity-decrement").click(async (event) => {
      event.stopPropagation();
      const itemId = event.currentTarget.dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (item) {
        const currentQuantity = item.system?.quantity?.value ?? 1;
        if (currentQuantity > 1) {
          await item.update({ "system.quantity.value": currentQuantity - 1 });
          app.render(true);
        } else {
          // Optionally, delete the item if quantity reaches 0
          await item.delete();
          app.render(true);
        }
      }
    });

    html.find(".container-toggle").click(event => {
      event.stopPropagation(); // Prevent the click from interfering with drag-and-drop
      console.log("DEBUG: container-toggle clicked, toggling contents for container ID:", event.currentTarget.dataset.itemId);
      const containerId = event.currentTarget.dataset.itemId;
      const containerEl = event.currentTarget.closest(".item");
      const contentsEl = containerEl.querySelector(".container-contents");
      $(contentsEl).toggle();
    });

    html.find(".item-edit").click(event => {
      event.stopPropagation(); // Prevent edit click from interfering with drag-and-drop
      console.log("DEBUG: item-edit clicked for item ID:", event.currentTarget.closest(".item").dataset.itemId);
      const itemId = event.currentTarget.closest(".item").dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    html.find(".item-delete").on("click", async (event) => {
      event.stopPropagation(); // Prevent delete click from interfering with drag-and-drop
      console.log("DEBUG: item-delete clicked for item ID:", event.currentTarget.closest(".item").dataset.itemId);
      event.preventDefault();

      const itemId = event.currentTarget.closest(".item").dataset.itemId;
      const item = app.actor.items.get(itemId);

      if (!item) {
        console.log("DEBUG: Item not found for ID:", itemId);
        return;
      }

      console.log("DEBUG: Item found - Name:", item.name, "Type:", item.type, "Is Container:", item.system?.isContainer);

      if (item.type === "item" && item.system?.isContainer) {
        console.log("DEBUG: Item is a container, showing confirmation dialog. Contained items:", item.system?.itemIds?.length || 0);
        const confirmMessage = "Deleting this container will move all contained items to the main inventory. Are you sure?";
        const confirmed = await Dialog.confirm({
          title: game.i18n.localize("TLGCC.ItemDelete"),
          content: confirmMessage,
          yes: () => true,
          no: () => false,
          defaultYes: false
        });

        console.log("DEBUG: Dialog confirmation result:", confirmed);

        if (confirmed) {
          console.log("DEBUG: User confirmed deletion, proceeding to delete container:", item.name);
          try {
            const validItemIds = item.system?.itemIds?.filter(id => app.actor.items.get(id)) || [];
            console.log("DEBUG: Valid contained item IDs:", validItemIds);
            if (validItemIds.length > 0) {
              const containedItems = validItemIds.map(id => ({ _id: id, "system.containerId": "" }));
              console.log("DEBUG: Moving contained items to main inventory:", containedItems);
              await app.actor.updateEmbeddedDocuments("Item", containedItems);
            }
            console.log("DEBUG: Deleting container:", item.name);
            await item.delete();
            console.log("DEBUG: Container deleted successfully, re-rendering sheet");
            app.render(true);
          } catch (error) {
            console.error("DEBUG: Error during container deletion:", error.message);
            ui.notifications.error(`Failed to delete container ${item.name}: ${error.message}`);
          }
        } else {
          console.log("DEBUG: User canceled deletion, no action taken");
        }
      } else {
        console.log("DEBUG: Item is not a container, proceeding with immediate deletion:", item.name);
        try {
          const container = app.actor.items.get(item.system?.containerId);
          if (container) {
            const itemIds = container.system?.itemIds?.filter(id => id !== item.id) || [];
            console.log("DEBUG: Removing item from container:", container.name, "Updated item IDs:", itemIds);
            await container.update({ "system.itemIds": itemIds });
          }
          console.log("DEBUG: Clearing containerId for item:", item.name);
          await item.update({ "system.containerId": "" });
          console.log("DEBUG: Deleting item:", item.name);
          await item.delete();
          console.log("DEBUG: Item deleted successfully, re-rendering sheet");
          app.render(true);
        } catch (error) {
          console.error("DEBUG: Error during item deletion:", error.message);
          ui.notifications.error(`Failed to delete item ${item.name}: ${error.message}`);
        }
      }
    });
  }
});