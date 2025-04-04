/**
 * cnc-ckbackpack.js
 * A module for Foundry VTT that enhances the Castles & Crusades game system with container support, encumbrance tracking,
 * and equipped status for weapons/armor in the combat tab.
 */

// == Section 1: Module Initialization ==

Hooks.once("init", () => {
  console.log("DEBUG: Initializing cnc-ckbackpack module");

  // Register module settings
  game.settings.register("cnc-ckbackpack", "encumbranceMode", {
    name: "Encumbrance Mode",
    hint: "Choose whether to track encumbrance by Encumbrance Value (EV) or by weight in pounds (lbs).",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "ev": "Encumbrance Value (EV)",
      "lbs": "Weight in Pounds (lbs)"
    },
    default: "ev",
    onChange: value => {
      console.log("DEBUG: Encumbrance mode changed to:", value);
      ui.players.render();
    }
  });

  game.settings.register("cnc-ckbackpack", "coinWeightEnabled", {
    name: "Enable Coin Weight",
    hint: "If enabled, coins contribute to encumbrance (160 coins = 1 EV or 10 lbs).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: value => {
      console.log("DEBUG: Coin weight enabled changed to:", value);
      ui.players.render();
    }
  });

  // Load CSS
  const cssPath = "modules/cnc-ckbackpack/styles/cnc-ckbackpack.css";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = cssPath;
  document.head.appendChild(link);
  console.log("DEBUG: Loaded CSS file:", cssPath);

  // Extend the core Item class to ensure equipped field is initialized
  class EnhancedTlgccItem extends CONFIG.Item.documentClass {
    prepareData() {
      super.prepareData();
      if (this.type === "weapon" || this.type === "armor") {
        this.system.equipped = this.system.equipped ?? false; // Default to false if undefined
      }
    }
  }
  CONFIG.Item.documentClass = EnhancedTlgccItem;
});

// == Section 2: Localization ==

Hooks.once("i18nInit", () => {
  const translations = {
    "cnc-ckbackpack.IsContainer": "Is Container?",
    "cnc-ckbackpack.ItemCurrent": "Current",
    "cnc-ckbackpack.ItemCapacity": "Capacity"
  };

  for (const [key, value] of Object.entries(translations)) {
    game.i18n.translations[key] = value;
  }
});

// == Section 3: Helper Functions ==

globalThis["cnc-ckbackpack"] = globalThis["cnc-ckbackpack"] || {};
globalThis["cnc-ckbackpack"].calculateCurrentEV = calculateCurrentEV;
globalThis["cnc-ckbackpack"].calculateTotalWeight = calculateTotalWeight;
globalThis["cnc-ckbackpack"].calculateCarriedEV = calculateCarriedEV;
globalThis["cnc-ckbackpack"].calculateCarriedWeight = calculateCarriedWeight;
globalThis["cnc-ckbackpack"].calculateEncumbranceRating = calculateEncumbranceRating;
globalThis["cnc-ckbackpack"].determineEncumbranceCategory = determineEncumbranceCategory;
globalThis["cnc-ckbackpack"].renderItemsList = renderItemsList;
globalThis["cnc-ckbackpack"].updateItemContainerId = updateItemContainerId;
globalThis["cnc-ckbackpack"].createNewItem = createNewItem;

function calculateCurrentEV(item, actor) {
  let currentCapacity = 0;
  console.log("DEBUG: calculateCurrentEV - Item ID:", item._id, "Item Name:", item.name);
  console.log("DEBUG: calculateCurrentEV - Item IDs in container:", item.system?.itemIds);

  if (Array.isArray(item.system?.itemIds) && item.system.itemIds.length && actor) {
    console.log("DEBUG: calculateCurrentEV - Actor found:", actor.name);
    currentCapacity = item.system.itemIds.reduce((total, id) => {
      const containedItem = actor.items.get(id);
      if (containedItem) {
        const itemEV = (containedItem.system?.itemev?.value ?? 0) * (containedItem.system?.quantity?.value ?? 1);
        console.log(
          `DEBUG: calculateCurrentEV - Contained Item ID: ${id}, Name: ${containedItem.name}, ` +
          `EV: ${containedItem.system?.itemev?.value}, Quantity: ${containedItem.system?.quantity?.value}, ` +
          `Total EV for item: ${itemEV}`
        );
        return total + itemEV;
      }
      console.log(`DEBUG: calculateCurrentEV - Contained Item ID: ${id} not found in actor items`);
      return total;
    }, 0);
  } else if (!actor) {
    console.log("DEBUG: calculateCurrentEV - Actor not provided for item:", item._id);
  } else {
    console.log("DEBUG: calculateCurrentEV - No item IDs found in container or itemIds is undefined");
  }

  console.log("DEBUG: calculateCurrentEV - Total Current Capacity:", currentCapacity);
  return currentCapacity;
}

function calculateTotalWeight(item, actor) {
  let totalWeight = 0;
  if (Array.isArray(item.system?.itemIds) && item.system.itemIds.length && actor) {
    totalWeight = item.system.itemIds.reduce((total, id) => {
      const containedItem = actor.items.get(id);
      return total + (containedItem?.system?.weight?.value ?? 0) * (containedItem?.system?.quantity?.value ?? 1);
    }, 0);
  }
  return totalWeight;
}

function calculateCarriedEV(data, containers) {
  const coinWeightEnabled = game.settings.get("cnc-ckbackpack", "coinWeightEnabled");
  const totalCoins = (data.system?.money?.pp?.value ?? 0) +
                     (data.system?.money?.gp?.value ?? 0) +
                     (data.system?.money?.sp?.value ?? 0) +
                     (data.system?.money?.cp?.value ?? 0);
  const moneyEV = coinWeightEnabled ? Math.floor(totalCoins / 160) : 0;
  console.log("DEBUG: calculateCarriedEV - Money EV:", moneyEV, "Total Coins:", totalCoins);

  const gearEV = data.items
    .filter(i => !(i.type === "item" && i.system?.isContainer) && !["spell", "feature"].includes(i.type) && !i.system?.containerId)
    .reduce((total, i) => {
      const itemEV = (i.system?.itemev?.value ?? 0) * (i.system?.quantity?.value ?? 1);
      console.log(`DEBUG: calculateCarriedEV - Gear Item: ${i.name}, EV: ${itemEV}`);
      return total + itemEV;
    }, 0);
  console.log("DEBUG: calculateCarriedEV - Gear EV:", gearEV);

  const containerEV = containers.reduce((total, c) => {
    const ev = (c.system?.itemev?.value ?? 0);
    console.log(`DEBUG: calculateCarriedEV - Container: ${c.name}, EV: ${ev}`);
    return total + ev;
  }, 0);
  console.log("DEBUG: calculateCarriedEV - Container EV:", containerEV);

  const totalEV = moneyEV + gearEV + containerEV;
  console.log("DEBUG: calculateCarriedEV - Total EV:", totalEV);
  return totalEV;
}

function calculateCarriedWeight(data, containers) {
  const encumbranceMode = game.settings.get("cnc-ckbackpack", "encumbranceMode");
  const coinWeightEnabled = game.settings.get("cnc-ckbackpack", "coinWeightEnabled");
  const totalCoins = (data.system?.money?.pp?.value ?? 0) +
                     (data.system?.money?.gp?.value ?? 0) +
                     (data.system?.money?.sp?.value ?? 0) +
                     (data.system?.money?.cp?.value ?? 0);
  const moneyWeight = coinWeightEnabled ? Math.floor(totalCoins / 160) * 10 : 0;
  console.log("DEBUG: calculateCarriedWeight - Money Weight:", moneyWeight, "Total Coins:", totalCoins);

  const gearWeight = data.items
    .filter(i => !(i.type === "item" && i.system?.isContainer) && !["spell", "feature"].includes(i.type) && !i.system?.containerId)
    .reduce((total, i) => {
      const itemWeight = (i.system?.weight?.value ?? 0) * (i.system?.quantity?.value ?? 1);
      console.log(`DEBUG: calculateCarriedWeight - Gear Item: ${i.name}, Weight: ${itemWeight}`);
      return total + itemWeight;
    }, 0);
  console.log("DEBUG: calculateCarriedWeight - Gear Weight:", gearWeight);

  const containerWeight = containers.reduce((total, c) => {
    let weight;
    if (encumbranceMode === "lbs" && c.system?.isContainer) {
      weight = (c.system?.itemev?.value ?? 0) * 10;
      console.log(`DEBUG: calculateCarriedWeight - Container: ${c.name}, Using EV: ${c.system?.itemev?.value}, Converted Weight: ${weight} lbs`);
    } else {
      weight = (c.system?.weight?.value ?? 0);
      console.log(`DEBUG: calculateCarriedWeight - Container: ${c.name}, Weight: ${weight} lbs`);
    }
    return total + weight;
  }, 0);
  console.log("DEBUG: calculateCarriedWeight - Container Weight:", containerWeight);

  const totalWeight = moneyWeight + gearWeight + containerWeight;
  console.log("DEBUG: calculateCarriedWeight - Total Weight:", totalWeight);
  return Math.round(totalWeight);
}

function calculateEncumbranceRating(data) {
  const strengthScore = data.system?.abilities?.str?.value || 0;
  const strengthPrime = data.system?.abilities?.str?.ccprimary || false;
  const constitutionPrime = data.system?.abilities?.con?.ccprimary || false;

  console.log("DEBUG: calculateEncumbranceRating - Strength Score:", strengthScore);
  console.log("DEBUG: calculateEncumbranceRating - Strength Prime (ccprimary):", data.system?.abilities?.str?.ccprimary);
  console.log("DEBUG: calculateEncumbranceRating - Constitution Prime (ccprimary):", data.system?.abilities?.con?.ccprimary);
  console.log("DEBUG: calculateEncumbranceRating - Strength Prime (boolean):", strengthPrime);
  console.log("DEBUG: calculateEncumbranceRating - Constitution Prime (boolean):", constitutionPrime);

  let primeBonus = 0;
  if (strengthPrime && constitutionPrime) {
    primeBonus = 6;
    console.log("DEBUG: calculateEncumbranceRating - Both Strength and Constitution are Prime, adding 6");
  } else if (strengthPrime || constitutionPrime) {
    primeBonus = 3;
    console.log(`DEBUG: calculateEncumbranceRating - ${strengthPrime ? "Strength" : "Constitution"} is Prime, adding 3`);
  } else {
    console.log("DEBUG: calculateEncumbranceRating - Neither Strength nor Constitution is Prime, adding 0");
  }

  console.log("DEBUG: calculateEncumbranceRating - Prime Bonus:", primeBonus);
  const totalRating = strengthScore + primeBonus;
  console.log("DEBUG: calculateEncumbranceRating - Total Rating:", totalRating);

  return totalRating;
}

function determineEncumbranceCategory(totalEV, rating) {
  const encumbranceMode = game.settings.get("cnc-ckbackpack", "encumbranceMode");
  let totalValue = totalEV;
  let ratingValue = rating;

  if (encumbranceMode === "lbs") {
    totalValue = totalEV * 10;
    ratingValue = rating * 10;
    console.log(`DEBUG: determineEncumbranceCategory - encumbranceMode: lbs, totalValue: ${totalValue} lbs, ratingValue: ${ratingValue} lbs`);
  } else {
    console.log(`DEBUG: determineEncumbranceCategory - encumbranceMode: ev, totalValue: ${totalValue} EV, ratingValue: ${ratingValue} ER`);
  }

  if (totalValue <= ratingValue) {
    console.log("DEBUG: determineEncumbranceCategory - Result: UNBURDENED");
    return { category: "UNBURDENED", tooltip: "No Effect", class: "unburdened" };
  }
  if (totalValue > ratingValue && totalValue <= 3 * ratingValue) {
    console.log("DEBUG: determineEncumbranceCategory - Result: BURDENED");
    return {
      category: "BURDENED",
      tooltip: "-10 ft. to Move Score (Minimum 5 ft.) and +2 to Challenge Level of all Dexterity based checks.",
      class: "burdened"
    };
  }
  console.log("DEBUG: determineEncumbranceCategory - Result: OVERBURDENED");
  return {
    category: "OVERBURDENED",
    tooltip: "Move reduced to 5 ft., Automatically fail all Dexterity based checks, Lose Dexterity bonus to AC.",
    class: "overburdened"
  };
}

function renderItemsList(data, containers, gear, containerStates = new Map()) {
  return `
    <ol class="items-list containers-section">
      <li class="item flexrow items-header droppable">
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
        const isExpanded = containerStates.get(container._id) || false;
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
            <ol class="container-contents" style="display: ${isExpanded ? 'block' : 'none'};">
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
                      ${(item.system?.itemev?.value !== undefined ? item.system.itemev.value : 0) * (item.system?.quantity?.value ?? 1)} EV
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
              ${(item.system?.itemev?.value !== undefined ? item.system.itemev.value : 0) * (item.system?.quantity?.value ?? 1)} EV
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
}

async function updateItemContainerId(item, containerId, itemIds, container) {
  const previousContainerId = item.system?.containerId;
  if (previousContainerId && previousContainerId !== containerId) {
    const previousContainer = item.actor.items.get(previousContainerId);
    if (previousContainer) {
      const updatedItemIds = previousContainer.system.itemIds?.filter(id => id !== item.id) || [];
      await previousContainer.update({ "system.itemIds": updatedItemIds });
    }
  }

  if (item.type !== "item" && item.system?.isContainer) {
    await item.update({ "system.isContainer": undefined });
  }

  if (container && !itemIds.includes(item.id)) {
    itemIds.push(item.id);
    await container.update({ "system.itemIds": itemIds });
  }

  await item.update({ "system.containerId": containerId });
}

async function createNewItem(item, actor, containerId, itemIds, container) {
  const itemData = item.toObject();
  delete itemData._id;
  itemData.system.quantity = { value: 1 };
  itemData.system.containerId = containerId;
  itemData.system.isContainer = false;

  const newItems = await actor.createEmbeddedDocuments("Item", [itemData]);
  const newItem = newItems[0];
  if (!newItem) {
    console.error("DEBUG: Failed to create new item from sidebar drop");
    ui.notifications.error(`Failed to add ${item.name} to the ${containerId ? "container" : "main inventory"}.`);
    return null;
  }

  if (container && itemIds) {
    itemIds.push(newItem.id);
    await container.update({ "system.itemIds": itemIds });
  }
  return newItem;
}

// == Section 4: Hooks ==

Hooks.on("renderItemSheet", (app, html, data) => {
  if (app.item.type === "item") {
    const headerFields = html.find(".header-fields");
    const grid4col = html.find(".grid-4col");
    grid4col.remove();

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
            name="system.itemev.value"
            data-dtype="Number"
            value="${app.item.system.itemev?.value !== undefined ? app.item.system.itemev.value : ''}"
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

    if (app.item.system?.isContainer) {
      const sheetBody = html.find(".sheet-body");
      const capacityHtml = `
        <div class="capacity-display">
          <label class="resource-label">${game.i18n.localize("cnc-ckbackpack.ItemCurrent")} / ${game.i18n.localize("cnc-ckbackpack.ItemCapacity")}</label>
          <div class="capacity-values">
            <span class="current-capacity">${globalThis["cnc-ckbackpack"].calculateCurrentEV(app.item, app.actor)}</span> /
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

    html.find("input[name='system.isContainer']").on("click", async (event) => {
      event.preventDefault();
      const checkbox = event.target;
      const isContainer = checkbox.checked;
      const currentState = app.item.system?.isContainer || false;

      if (isContainer === currentState) return;

      if (!isContainer) {
        const confirmed = await Dialog.confirm({
          title: "Confirm Container Status Change",
          content: "Unchecking this will move all contained items to the main inventory. Are you sure?",
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
          setTimeout(() => app.render(true), 100);
        } else {
          checkbox.checked = currentState;
        }
      } else {
        await app.item.update({ "system.isContainer": true, "system.quantity.value": 1, "system.itemIds": [] });
        setTimeout(() => app.render(true), 100);
      }
    });
  }

  if (["weapon", "armor"].includes(app.item.type)) {
    const headerFields = html.find(".header-fields");
    const grid = html.find(".grid");
    const equippedHtml = `
      <div class="resource">
        <label class="resource-label container-label" for="system.equipped">${game.i18n.localize("cnc-ckbackpack.Equipped")}</label>
        <input
          type="checkbox"
          id="system.equipped"
          name="system.equipped"
          data-dtype="Boolean"
          ${app.item.system?.equipped ? "checked" : ""}
          class="checkbox-input"
        />
      </div>
    `;
    grid.append(equippedHtml);
  }
});

Hooks.on("renderActorSheet", async (app, html, data) => {
  if (!app.actor || app.actor.type !== "character" || game.system.id !== "castles-and-crusades") return;

  console.log("DEBUG: renderActorSheet - Starting to render tabs for actor:", app.actor.name);

  app._containerStates = app._containerStates || new Map();

  let renderTimeout = null;
  const debounceRender = () => {
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      app.render(true);
      renderTimeout = null;
    }, 100);
  };
  app.debounceRender = debounceRender;

  const containerUpdates = [];
  const itemUpdates = [];

  for (const item of app.actor.items) {
    if (["weapon", "armor"].includes(item.type) && item.system?.isContainer === true) {
      console.log("DEBUG: Fixing isContainer for item - Name:", item.name, "ID:", item._id);
      itemUpdates.push({
        _id: item.id,
        "system.isContainer": undefined
      });
    }
  }

  for (const item of app.actor.items) {
    if (item.type === "item" && item.system?.isContainer) {
      const validItemIds = item.system.itemIds?.filter(id => app.actor.items.get(id)) || [];
      if (validItemIds.length !== item.system.itemIds.length) {
        console.log("DEBUG: Cleaning up stale itemIds for container - Name:", item.name, "ID:", item._id, "Old itemIds:", item.system.itemIds, "New itemIds:", validItemIds);
        containerUpdates.push({
          _id: item.id,
          "system.itemIds": validItemIds
        });
      }
    }
  }

  if (itemUpdates.length > 0) {
    await app.actor.updateEmbeddedDocuments("Item", itemUpdates);
    console.log("DEBUG: Fixed isContainer for items:", itemUpdates);
  }
  if (containerUpdates.length > 0) {
    await app.actor.updateEmbeddedDocuments("Item", containerUpdates);
    console.log("DEBUG: Cleaned up stale itemIds in containers:", containerUpdates);
  }

  const gear = [];
  const containers = [];
  const containerIds = new Set();
  const gearIds = new Set();

  for (const item of data.items) {
    item.img = item.img || CONST.DEFAULT_TOKEN;
    if (item.type === "item" && item.system?.isContainer && !containerIds.has(item._id)) {
      item.itemIds = item.system.itemIds || [];
      containers.push(item);
      containerIds.add(item._id);
      console.log("DEBUG: Added container to render - Name:", item.name, "ID:", item._id);
    } else if (!["spell", "feature"].includes(item.type) && !item.system?.containerId) {
      gear.push(item);
      gearIds.add(item._id);
      console.log("DEBUG: Added gear to render - Name:", item.name, "ID:", item._id);
    }
  }

  for (const container of containers) {
    container.contents = data.items.filter(i => container.itemIds.includes(i._id));
    container.totalEV = globalThis["cnc-ckbackpack"].calculateCurrentEV(container, app.actor);
  }

  const money = data.system?.money || { pp: { value: 0 }, gp: { value: 0 }, sp: { value: 0 }, cp: { value: 0 } };
  const carriedEV = globalThis["cnc-ckbackpack"].calculateCarriedEV(data, containers);
  const carriedWeight = globalThis["cnc-ckbackpack"].calculateCarriedWeight(data, containers);
  const rating = globalThis["cnc-ckbackpack"].calculateEncumbranceRating(data);

  const encumbranceMode = game.settings.get("cnc-ckbackpack", "encumbranceMode");
  const displayRating = encumbranceMode === "lbs" ? rating * 10 : rating;
  const displayCarried = encumbranceMode === "lbs" ? carriedWeight : carriedEV;
  const ratingLabel = encumbranceMode === "lbs" ? `${displayRating} lbs.` : `${displayRating} ER`;
  const carriedLabel = encumbranceMode === "lbs" ? `${displayCarried} lbs.` : `${displayCarried} EV`;
  const encumbrance = globalThis["cnc-ckbackpack"].determineEncumbranceCategory(
    encumbranceMode === "lbs" ? carriedWeight / 10 : carriedEV,
    rating
  );

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
      ${globalThis["cnc-ckbackpack"].renderItemsList(data, containers, gear, app._containerStates)}
    `;
    itemsTab.html(customItemsHtml);
  }

  // Combat tab enhancements
  const combatTab = html.find(".tab[data-tab='combat']");
  if (combatTab.length) {
    console.log("DEBUG: Processing combat tab for actor:", app.actor.name);

    // Equip toggle for weapons and armor
    combatTab.find("li.item[data-item-id]").each((_, element) => {
      const itemId = element.dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (!item || (item.type !== "weapon" && item.type !== "armor")) return;

      const controls = $(element).find(".item-controls");
      const isEquipped = item.system.equipped || false;

      controls.find(".equip-toggle").remove();
      const equipIcon = `
        <a class="item-control equip-toggle ${isEquipped ? "equipped" : ""}"
           title="${isEquipped ? "Unequip" : "Equip"}"
           data-item-id="${itemId}">
          <i class="fas fa-e"></i>
        </a>`;
      controls.prepend(equipIcon);
    });

    // AC calculation and gear icon
    console.log("DEBUG: Calculating AC with data:", data.system);
    const dexBonus = data.system.abilities?.dex?.bonus ?? 0; // Pre-calculated in tlgccActor
    let armorBonus = 0;
    const equippedArmor = data.items.find(item => item.type === "armor" && item.system.equipped);
    if (equippedArmor) {
      armorBonus = equippedArmor.system.armorClass?.value ?? 0;
    }
    const manualModifier = app.actor.getFlag("cnc-ckbackpack", "acManualModifier") ?? 0;
    const calculatedAC = 10 + dexBonus + armorBonus + manualModifier;

    const acInput = combatTab.find("input[name='system.armorClass.value']");
    if (acInput.length) {
      console.log("DEBUG: Found AC input, updating to:", calculatedAC);
      acInput.val(calculatedAC).prop("readonly", true);
      const acContainer = acInput.parent();
      acContainer.css("position", "relative");

      acContainer.find(".ac-settings-toggle").remove();
      const gearIcon = `
        <a class="ac-settings-toggle" title="AC Settings" style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); font-size: 12px;">
          <i class="fas fa-cog"></i>
        </a>`;
      acContainer.append(gearIcon);

      // Persist AC to actor data
      if (data.system.armorClass.value !== calculatedAC) {
        console.log("DEBUG: Persisting AC update to actor:", calculatedAC);
        await app.actor.update({ "system.armorClass.value": calculatedAC });
      }
    } else {
      console.log("DEBUG: AC input not found in combat tab");
    }

    combatTab.find(".equip-toggle").click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const itemId = event.currentTarget.dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (!item || (item.type !== "weapon" && item.type !== "armor")) return;

      const isEquipped = item.system.equipped || false;
      await item.update({ "system.equipped": !isEquipped });
      debounceRender();
    });

    combatTab.find(".ac-settings-toggle").click(async (event) => {
      event.preventDefault();
      event.stopPropagation();

      console.log("DEBUG: AC settings toggle clicked");
      const dialogContent = `
        <div class="ac-settings">
          <h2>Armor Class Calculation</h2>
          <p>Formula: 10 + Dex Bonus + Equipped Armor + Manual Modifier</p>
          <ul>
            <li>Base: 10</li>
            <li>Dex Bonus: ${dexBonus}</li>
            <li>Equipped Armor: ${equippedArmor ? `${equippedArmor.name} (+${armorBonus})` : "None (0)"}</li>
            <li>Manual Modifier: <input type="number" id="acManualModifier" value="${manualModifier}" style="width: 50px;"></li>
          </ul>
          <p>Total AC: ${calculatedAC}</p>
        </div>
      `;

      new Dialog({
        title: "AC Settings",
        content: dialogContent,
        buttons: {
          save: {
            label: "Save",
            callback: async (html) => {
              const newModifier = parseInt(html.find("#acManualModifier").val()) || 0;
              await app.actor.setFlag("cnc-ckbackpack", "acManualModifier", newModifier);
              debounceRender();
            }
          },
          cancel: {
            label: "Cancel"
          }
        },
        default: "save"
      }).render(true);
    });
  } else {
    console.log("DEBUG: Combat tab not found for actor:", app.actor.name);
  }

  if (itemsTab.length) {
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
          event.stopPropagation();

          const data = TextEditor.getDragEventData(event);
          if (data.type !== "Item") return false;

          const item = data.id ? app.actor.items.get(data.id) : await Item.fromDropData(data);
          if (!item) {
            console.error("DEBUG: Failed to retrieve item for drop - Data:", data);
            return false;
          }
          console.log("DEBUG: Dropped item - Name:", item.name, "Type:", item.type, "ID:", item.id, "Is Contained:", data.isContained);

          let containerEl = null;
          let containersSectionHeader = null;
          let mainInventorySection = null;
          let mainInventoryEl = null;
          for (const el of event.composedPath()) {
            if (el.classList?.contains("container-item")) {
              containerEl = el;
              break;
            }
            if (el.classList?.contains("main-inventory")) {
              mainInventoryEl = el;
              break;
            }
            if (el.classList?.contains("items-header") && el.classList.contains("droppable")) {
              containersSectionHeader = el;
              break;
            }
            if (el.classList?.contains("items-list")) {
              if (el.classList.contains("main-inventory-section")) mainInventorySection = el;
              break;
            }
          }
          const targetContainerId = containerEl?.dataset.itemId;

          if (targetContainerId) {
            const container = app.actor.items.get(targetContainerId);
            if (!container || container.type !== "item" || !container.system?.isContainer) return false;

            console.log("DEBUG: Drop into container - Item Name:", item.name, "Type:", item.type, "isContainer:", item.system?.isContainer);
            if (item.type === "item" && item.system?.isContainer) {
              console.log("DEBUG: Item identified as a container - Preventing drop");
              ui.notifications.warn("Cannot place a container inside another container.");
              return false;
            }

            const itemIds = container.system.itemIds || [];
            const currentEV = itemIds.reduce((total, id) => {
              const containedItem = app.actor.items.get(id);
              return total + (containedItem?.system?.itemev?.value ?? 0) * (containedItem?.system?.quantity?.value ?? 1);
            }, 0);
            const itemEV = (item.system?.itemev?.value ?? 0) * (item.system?.quantity?.value ?? 1);
            const containerER = container.system?.er?.value ?? 0;
            const currentItemCount = itemIds.length;

            if (currentEV + itemEV <= containerER && currentItemCount < containerER) {
              if (data.id) {
                await globalThis["cnc-ckbackpack"].updateItemContainerId(item, container.id, itemIds, container);
              } else {
                await globalThis["cnc-ckbackpack"].createNewItem(item, app.actor, container.id, itemIds, container);
              }
              debounceRender();
            } else {
              const warningMessage = currentEV + itemEV > containerER
                ? `${item.name} exceeds the container's EV capacity (${currentEV + itemEV}/${containerER})`
                : `${item.name} exceeds the container's item count capacity (${currentItemCount + 1}/${containerER})`;
              if (data.id) {
                await globalThis["cnc-ckbackpack"].updateItemContainerId(item, "", [], null);
              } else {
                await globalThis["cnc-ckbackpack"].createNewItem(item, app.actor, "", null, null);
              }
              ui.notifications.warn(`${warningMessage} and has been placed in the main inventory.`);
              debounceRender();
            }
            return true;
          }

          if (containersSectionHeader) {
            if (!data.id && ["armor", "weapon"].includes(item.type)) {
              ui.notifications.warn(`Cannot create ${item.name} (type: ${item.type}) as a container. Only items can be containers.`);
              return false;
            }
            if (data.id) {
              await globalThis["cnc-ckbackpack"].updateItemContainerId(item, "", [], null);
              await item.update({ "system.isContainer": true, "system.itemIds": item.system?.itemIds || [] });
              app._containerStates.delete(item.id);
              debounceRender();
              return true;
            }
            const newItem = await globalThis["cnc-ckbackpack"].createNewItem(item, app.actor, "", null, null);
            if (newItem) {
              await newItem.update({ "system.isContainer": true, "system.itemIds": [] });
              debounceRender();
            }
            return true;
          }

          if (mainInventorySection || mainInventoryEl) {
            if (data.isContained) {
              await globalThis["cnc-ckbackpack"].updateItemContainerId(item, "", [], null);
              debounceRender();
              return true;
            }
            await globalThis["cnc-ckbackpack"].createNewItem(item, app.actor, "", null, null);
            debounceRender();
            return true;
          }

          if (data.isContained) return false;
          return false;
        },
        dragover: (event) => {
          event.preventDefault();
          const itemsList = event.currentTarget.closest(".items-list");
          if (itemsList) $(itemsList).find(".dragover").removeClass("dragover");

          let containerEl = null;
          let containersSection = null;
          let mainInventorySection = null;
          for (const el of event.composedPath()) {
            if (el.classList?.contains("container-item")) {
              containerEl = el;
              break;
            }
            if (el.classList?.contains("items-list")) {
              if (el.classList.contains("containers-section")) containersSection = el;
              else if (el.classList.contains("main-inventory-section")) mainInventorySection = el;
              break;
            }
          }
          if (containerEl) $(containerEl).addClass("dragover");
          else if (containersSection) $(containersSection).addClass("dragover");
          else if (mainInventorySection) $(mainInventorySection).addClass("dragover");
        },
        dragleave: (event) => {
          let containerEl = null;
          let containersSection = null;
          let mainInventorySection = null;
          for (const el of event.composedPath()) {
            if (el.classList?.contains("container-item")) {
              containerEl = el;
              break;
            }
            if (el.classList?.contains("items-list")) {
              if (el.classList.contains("containers-section")) containersSection = el;
              else if (el.classList.contains("main-inventory-section")) mainInventorySection = el;
              break;
            }
          }
          if (containerEl) $(containerEl).removeClass("dragover");
          if (containersSection) $(containersSection).removeClass("dragover");
          if (mainInventorySection) $(mainInventorySection).removeClass("dragover");
        }
      }
    }).bind(itemsTab[0]);

    html.find(".item-create").click(async (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log("DEBUG: item-create clicked");

      const isContainer = event.currentTarget.dataset.isContainer === "true";
      console.log("DEBUG: Creating new item - isContainer:", isContainer);

      const itemData = {
        name: isContainer ? "New Container" : "New Item",
        type: "item",
        system: {
          isContainer: isContainer,
          quantity: { value: 1 },
          price: { value: "" },
          itemev: { value: 0 },
          er: { value: isContainer ? 10 : 0 },
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
          newItem.sheet.render(true);
        } else {
          console.error("DEBUG: Failed to create new item");
          ui.notifications.error(`Failed to create new ${isContainer ? "container" : "item"}.`);
        }
      } catch (error) {
        console.error("DEBUG: Error creating new item:", error.message);
        ui.notifications.error(`Failed to create new ${isContainer ? "container" : "item"}: ${error.message}`);
      }
      debounceRender();
    });

    html.find(".quantity-increment").click(async (event) => {
      event.stopPropagation();
      const itemId = event.currentTarget.dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (item) {
        const currentQuantity = item.system?.quantity?.value ?? 1;
        const newQuantity = currentQuantity + 1;
        const itemEV = (item.system?.itemev?.value ?? 0);

        const containerId = item.system?.containerId;
        if (containerId) {
          const container = app.actor.items.get(containerId);
          if (container && container.system?.isContainer) {
            const currentContainerEV = globalThis["cnc-ckbackpack"].calculateCurrentEV(container, app.actor);
            const containerCapacity = container.system?.er?.value ?? 0;
            const newContainerEV = currentContainerEV - (itemEV * currentQuantity) + (itemEV * newQuantity);

            if (newContainerEV > containerCapacity) {
              ui.notifications.warn(`${item.name} would exceed the container's EV capacity (${newContainerEV}/${containerCapacity}). Quantity not increased.`);
              return;
            }
          }
        }

        await item.update({ "system.quantity.value": newQuantity });
        debounceRender();
      }
    });

    html.find(".quantity-decrement").click(async (event) => {
      event.stopPropagation();
      const itemId = event.currentTarget.dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (item) {
        const currentQuantity = item.system?.quantity?.value ?? 1;
        if (currentQuantity <= 1) {
          ui.notifications.info(`Quantity cannot be decreased below 1. Use the delete button to remove ${item.name}.`);
          return;
        }
        await item.update({ "system.quantity.value": currentQuantity - 1 });
        debounceRender();
      }
    });

    html.find(".container-toggle").click((event) => {
      event.stopPropagation();
      const containerId = event.currentTarget.dataset.itemId;
      const containerEl = event.currentTarget.closest(".item");
      const contentsEl = containerEl.querySelector(".container-contents");
      const isCurrentlyExpanded = contentsEl.style.display === "block";
      contentsEl.style.display = isCurrentlyExpanded ? "none" : "block";
      app._containerStates.set(containerId, !isCurrentlyExpanded);
      console.log(`DEBUG: Toggled container ${containerId} to ${!isCurrentlyExpanded ? "expanded" : "collapsed"}`);
    });

    html.find(".item-edit").click((event) => {
      event.stopPropagation();
      const itemId = event.currentTarget.closest(".item").dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    html.find(".item-delete").on("click", async (event) => {
      event.stopPropagation();
      event.preventDefault();

      const itemId = event.currentTarget.closest(".item").dataset.itemId;
      const item = app.actor.items.get(itemId);
      if (!item) {
        console.log("DEBUG: Item not found for ID:", itemId);
        return;
      }

      console.log("DEBUG: Item found - Name:", item.name, "Type:", item.type, "Is Container:", item.system?.isContainer);

      if (item.type === "item" && item.system?.isContainer) {
        const confirmed = await Dialog.confirm({
          title: game.i18n.localize("TLGCC.ItemDelete"),
          content: "Deleting this container will move all contained items to the main inventory. Are you sure?",
          yes: () => true,
          no: () => false,
          defaultYes: false
        });

        if (confirmed) {
          const validItemIds = item.system?.itemIds?.filter(id => app.actor.items.get(id)) || [];
          if (validItemIds.length > 0) {
            const containedItems = validItemIds.map(id => ({ _id: id, "system.containerId": "" }));
            await app.actor.updateEmbeddedDocuments("Item", containedItems);
          }
          await item.delete();
          app._containerStates.delete(itemId);
          debounceRender();
        }
      } else {
        const container = app.actor.items.get(item.system?.containerId);
        if (container) {
          const itemIds = container.system?.itemIds?.filter(id => id !== item.id) || [];
          await container.update({ "system.itemIds": itemIds });
        }
        await item.update({ "system.containerId": "" });
        await item.delete();
        debounceRender();
      }
    });
  }
});