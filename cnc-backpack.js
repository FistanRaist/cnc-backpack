/**
 * cnc-backpack.js
 * A module for Foundry VTT that enhances the Castles & Crusades game system with container support, encumbrance tracking,
 * equipped status for weapons/armor in the combat tab, and a roll dialog with global modifiers.
 */

// Import roll dialog
import "./roll-dialog.js";

// Module Initialization
Hooks.once("init", () => {
    // Debug: Log module initialization
    console.debug("cnc-backpack | Initializing module"); // Do not Delete: Logs module initialization

    // Register module settings
    game.settings.register("cnc-backpack", "encumbranceMode", {
        name: game.i18n.localize("cnc-backpack.EncumbranceMode"),
        hint: game.i18n.localize("cnc-backpack.EncumbranceModeHint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            "ev": game.i18n.localize("cnc-backpack.EncumbranceModeEV"),
            "lbs": game.i18n.localize("cnc-backpack.EncumbranceModeLbs")
        },
        default: "ev",
        onChange: value => {
            // Debug: Log encumbrance mode change
            console.debug(`cnc-backpack | Encumbrance mode changed to: ${value}`); // Do not Delete: Logs encumbrance mode setting change
            ui.players.render();
            Object.values(ui.windows).forEach(app => {
                if (app instanceof ActorSheet) app.render(true);
            });
        }
    });

    game.settings.register("cnc-backpack", "coinWeightEnabled", {
        name: game.i18n.localize("cnc-backpack.CoinWeightEnabled"),
        hint: game.i18n.localize("cnc-backpack.CoinWeightEnabledHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: value => {
            // Debug: Log coin weight toggle
            console.debug(`cnc-backpack | Coin weight enabled: ${value}`); // Do not Delete: Logs coin weight setting change
            ui.players.render();
            Object.values(ui.windows).forEach(app => {
                if (app instanceof ActorSheet) app.render(true);
            });
        }
    });

    game.settings.register("cnc-backpack", "fastForwardRolls", {
        name: game.i18n.localize("cnc-backpack.FastForwardRolls"),
        hint: game.i18n.localize("cnc-backpack.FastForwardRollsHint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    // Load CSS
    const cssPath = "modules/cnc-backpack/styles/cnc-backpack.css";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = cssPath;
    document.head.appendChild(link);
    // Debug: Log CSS loading
    console.debug(`cnc-backpack | Loaded CSS: ${cssPath}`); // Do not Delete: Logs CSS file loading

    // Extend Item class to ensure equipped field is initialized for weapons and armor
    class EnhancedTlgccItem extends CONFIG.Item.documentClass {
        prepareData() {
            super.prepareData();
            if (this.type === "weapon" || this.type === "armor") {
                this.system.equipped = this.system.equipped ?? false;
            }
        }
    }
    CONFIG.Item.documentClass = EnhancedTlgccItem;
    // Debug: Log Item class extension
    console.debug("cnc-backpack | Extended Item class for equipped field initialization"); // Do not Delete: Logs Item class extension
});

// Localization Setup
Hooks.once("i18nInit", () => {
    const translations = {
        "cnc-backpack.IsContainer": "Is Container?",
        "cnc-backpack.ItemCurrent": "Current Load",
        "cnc-backpack.ItemCapacity": "Max Capacity",
        "cnc-backpack.Equipped": "Equipped"
    };

    for (const [key, value] of Object.entries(translations)) {
        game.i18n.translations[key] = value;
    }
    // Debug: Log localization setup
    console.debug("cnc-backpack | Localization initialized with translations"); // Do not Delete: Logs localization setup
});

// Helper Functions

// Expose helper functions globally for reuse
globalThis["cnc-backpack"] = globalThis["cnc-backpack"] || {};
globalThis["cnc-backpack"].calculateCurrentEV = calculateCurrentEV;
globalThis["cnc-backpack"].calculateTotalWeight = calculateTotalWeight;
globalThis["cnc-backpack"].calculateCarriedEV = calculateCarriedEV;
globalThis["cnc-backpack"].calculateCarriedWeight = calculateCarriedWeight;
globalThis["cnc-backpack"].calculateEncumbranceRating = calculateEncumbranceRating;
globalThis["cnc-backpack"].determineEncumbranceCategory = determineEncumbranceCategory;
globalThis["cnc-backpack"].renderItemsList = renderItemsList;
globalThis["cnc-backpack"].updateItemContainerId = updateItemContainerId;
globalThis["cnc-backpack"].createNewItem = createNewItem;

// Calculate the current Encumbrance Value (EV) of items in a container
function calculateCurrentEV(item, actor) {
    let currentCapacity = 0;
    if (Array.isArray(item.system?.itemIds) && item.system.itemIds.length && actor) {
        currentCapacity = item.system.itemIds.reduce((total, id) => {
            const containedItem = actor.items.get(id);
            if (containedItem) {
                return total + (containedItem.system?.itemev?.value ?? 0) * (containedItem.system?.quantity?.value ?? 1);
            }
            return total;
        }, 0);
    }
    // Debug: Log EV calculation
    console.debug(`cnc-backpack | Calculated EV for item ${item.name} (${item._id}): ${currentCapacity}`); // Do not Delete: Logs EV calculation for container
    return currentCapacity;
}

// Calculate the total weight of items in a container
function calculateTotalWeight(item, actor) {
    let totalWeight = 0;
    if (Array.isArray(item.system?.itemIds) && item.system.itemIds.length && actor) {
        totalWeight = item.system.itemIds.reduce((total, id) => {
            const containedItem = actor.items.get(id);
            return total + (containedItem?.system?.weight?.value ?? 0) * (containedItem?.system?.quantity?.value ?? 1);
        }, 0);
    }
    // Debug: Log weight calculation
    console.debug(`cnc-backpack | Calculated weight for item ${item.name} (${item._id}): ${totalWeight}`); // Do not Delete: Logs weight calculation for container
    return totalWeight;
}

// Calculate the total carried EV for an actor, including gear, containers, and coins
function calculateCarriedEV(data, containers) {
    const coinWeightEnabled = game.settings.get("cnc-backpack", "coinWeightEnabled");
    const totalCoins = (data.system?.money?.pp?.value ?? 0) +
                       (data.system?.money?.gp?.value ?? 0) +
                       (data.system?.money?.sp?.value ?? 0) +
                       (data.system?.money?.cp?.value ?? 0);
    const moneyEV = coinWeightEnabled ? Math.floor(totalCoins / 160) : 0;

    const gearEV = data.items
        .filter(i => !(i.type === "item" && i.system?.isContainer) && !["spell", "feature"].includes(i.type) && !i.system?.containerId)
        .reduce((total, i) => total + (i.system?.itemev?.value ?? 0) * (i.system?.quantity?.value ?? 1), 0);

    const containerEV = containers.reduce((total, c) => total + (c.system?.itemev?.value ?? 0), 0);

    const totalEV = moneyEV + gearEV + containerEV;
    // Debug: Log carried EV calculation
    console.debug(`cnc-backpack | Calculated carried EV for actor ${data.name} (${data._id}): ${totalEV} (Money: ${moneyEV}, Gear: ${gearEV}, Containers: ${containerEV})`); // Do not Delete: Logs total carried EV calculation
    return totalEV;
}

// Calculate the total carried weight for an actor, including gear, containers, and coins
function calculateCarriedWeight(data, containers) {
    const encumbranceMode = game.settings.get("cnc-backpack", "encumbranceMode");
    const coinWeightEnabled = game.settings.get("cnc-backpack", "coinWeightEnabled");
    const totalCoins = (data.system?.money?.pp?.value ?? 0) +
                       (data.system?.money?.gp?.value ?? 0) +
                       (data.system?.money?.sp?.value ?? 0) +
                       (data.system?.money?.cp?.value ?? 0);
    const moneyWeight = coinWeightEnabled ? Math.floor(totalCoins / 160) * 10 : 0;

    const gearWeight = data.items
        .filter(i => !(i.type === "item" && i.system?.isContainer) && !["spell", "feature"].includes(i.type) && !i.system?.containerId)
        .reduce((total, i) => total + (i.system?.weight?.value ?? 0) * (i.system?.quantity?.value ?? 1), 0);

    const containerWeight = containers.reduce((total, c) => {
        let weight;
        if (encumbranceMode === "lbs" && c.system?.isContainer) {
            weight = (c.system?.itemev?.value ?? 0) * 10;
        } else {
            weight = (c.system?.weight?.value ?? 0);
        }
        return total + weight;
    }, 0);

    const totalWeight = Math.round(moneyWeight + gearWeight + containerWeight);
    // Debug: Log carried weight calculation
    console.debug(`cnc-backpack | Calculated carried weight for actor ${data.name} (${data._id}): ${totalWeight} (Money: ${moneyWeight}, Gear: ${gearWeight}, Containers: ${containerWeight})`); // Do not Delete: Logs total carried weight calculation
    return totalWeight;
}

// Calculate the encumbrance rating based on strength and prime attributes
function calculateEncumbranceRating(data) {
    const strengthScore = data.system?.abilities?.str?.value || 0;
    const strengthPrime = data.system?.abilities?.str?.ccprimary || false;
    const constitutionPrime = data.system?.abilities?.con?.ccprimary || false;

    let primeBonus = 0;
    if (strengthPrime && constitutionPrime) {
        primeBonus = 6;
    } else if (strengthPrime || constitutionPrime) {
        primeBonus = 3;
    }

    const rating = strengthScore + primeBonus;
    // Debug: Log encumbrance rating calculation
    console.debug(`cnc-backpack | Calculated encumbrance rating for actor ${data.name} (${data._id}): ${rating} (Strength: ${strengthScore}, Prime Bonus: ${primeBonus})`); // Do not Delete: Logs encumbrance rating calculation
    return rating;
}

// Determine the encumbrance category (Unburdened, Burdened, Overburdened) based on total EV and rating
function determineEncumbranceCategory(totalEV, rating) {
    const encumbranceMode = game.settings.get("cnc-backpack", "encumbranceMode");
    let totalValue = totalEV;
    let ratingValue = rating;

    if (encumbranceMode === "lbs") {
        totalValue = totalEV * 10;
        ratingValue = rating * 10;
    }

    let encumbrance;
    if (totalValue <= ratingValue) {
        encumbrance = { category: "UNBURDENED", tooltip: "No Effect", class: "unburdened" };
    } else if (totalValue > ratingValue && totalValue <= 3 * ratingValue) {
        encumbrance = {
            category: "BURDENED",
            tooltip: "-10 ft. to Move Score (Minimum 5 ft.) and +2 to Challenge Level of all Dexterity based checks.",
            class: "burdened"
        };
    } else {
        encumbrance = {
            category: "OVERBURDENED",
            tooltip: "Move reduced to 5 ft., Automatically fail all Dexterity based checks, Lose Dexterity bonus to AC.",
            class: "overburdened"
        };
    }
    // Debug: Log encumbrance category determination
    console.debug(`cnc-backpack | Determined encumbrance category: ${encumbrance.category} (Total: ${totalValue}, Rating: ${ratingValue})`); // Do not Delete: Logs encumbrance category determination
    return encumbrance;
}

// Render the items list for the actor sheet, including containers and gear
function renderItemsList(data, containers, gear, containerStates = new Map()) {
    const html = `
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
                                        <a class="quantity-decrement" data-item-id="${item._id}" title="Decrease Quantity"><i class="fas fa-minus"></i></a>
                                        <span class="quantity-value">${item.system?.quantity?.value ?? 1}</span>
                                        <a class="quantity-increment" data-item-id="${item._id}" title="Increase Quantity"><i class="fas fa-plus"></i></a>
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
                            `).join("")}
                        </ol>
                    </li>
                `;
            }).join("")}
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
                        <a class="quantity-decrement" data-item-id="${item._id}" title="Decrease Quantity"><i class="fas fa-minus"></i></a>
                        <span class="quantity-value">${item.system?.quantity?.value ?? 1}</span>
                        <a class="quantity-increment" data-item-id="${item._id}" title="Increase Quantity"><i class="fas fa-plus"></i></a>
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
            `).join("")}
        </ol>
    `;
    // Debug: Log items list rendering
    console.debug(`cnc-backpack | Rendered items list for actor ${data.name} (${data._id}) with ${containers.length} containers and ${gear.length} gear items`); // Do not Delete: Logs items list rendering
    return html;
}

// Update an item's container assignment and handle previous container cleanup
async function updateItemContainerId(item, containerId, itemIds, container) {
    // Debug: Log container update attempt
    console.debug(`cnc-backpack | Attempting to update container for item ${item.name} (${item._id}) to containerId: ${containerId}`); // Do not Delete: Logs container assignment update attempt

    if (!item.testUserPermission(game.user, "OWNER")) {
        ui.notifications.warn(game.i18n.localize("cnc-backpack.NoPermission"));
        // Debug: Log permission error
        console.debug(`cnc-backpack | Permission denied for updating item ${item.name} (${item._id})`); // Do not Delete: Logs permission error for item update
        return;
    }
    if (container && !container.testUserPermission(game.user, "OWNER")) {
        ui.notifications.warn(game.i18n.localize("cnc-backpack.NoPermission"));
        // Debug: Log container permission error
        console.debug(`cnc-backpack | Permission denied for updating container ${container.name} (${container._id})`); // Do not Delete: Logs permission error for container update
        return;
    }

    // Prevent weapons and armor from being marked as containers
    if (["weapon", "armor"].includes(item.type) && item.system?.isContainer) {
        ui.notifications.warn(game.i18n.localize("cnc-backpack.CannotNestContainer"));
        await item.update({ "system.isContainer": false });
        // Debug: Log invalid container correction
        console.debug(`cnc-backpack | Corrected invalid container flag for ${item.type} item ${item.name} (${item._id})`); // Do not Delete: Logs correction of invalid container flag
    }

    const previousContainerId = item.system?.containerId;
    if (previousContainerId && previousContainerId !== containerId) {
        const previousContainer = item.actor.items.get(previousContainerId);
        if (previousContainer) {
            const updatedItemIds = previousContainer.system.itemIds?.filter(id => id !== item.id) || [];
            await previousContainer.update({ "system.itemIds": updatedItemIds });
            // Debug: Log previous container cleanup
            console.debug(`cnc-backpack | Cleaned up item ${item._id} from previous container ${previousContainer.name} (${previousContainerId})`); // Do not Delete: Logs cleanup of previous container
        }
    }

    if (container && !itemIds.includes(item.id)) {
        itemIds.push(item.id);
        await container.update({ "system.itemIds": itemIds });
        // Debug: Log container item addition
        console.debug(`cnc-backpack | Added item ${item.name} (${item._id}) to container ${container.name} (${container._id})`); // Do not Delete: Logs item addition to container
    }

    await item.update({ "system.containerId": containerId });
    // Debug: Log container assignment update
    console.debug(`cnc-backpack | Updated item ${item.name} (${item._id}) with containerId: ${containerId}`); // Do not Delete: Logs successful container assignment update
}

// Create a new item on an actor and assign it to a container if specified
async function createNewItem(item, actor, containerId, itemIds, container) {
    // Debug: Log item creation attempt
    console.debug(`cnc-backpack | Attempting to create new item ${item.name} (type: ${item.type}) for actor ${actor.name} (${actor._id}) with containerId: ${containerId}`); // Do not Delete: Logs item creation attempt

    const itemData = item.toObject();
    delete itemData._id;
    itemData.system.quantity = { value: 1 };
    itemData.system.containerId = containerId;

    // Ensure only items can be containers; force isContainer to false for weapons and armor
    if (["weapon", "armor"].includes(itemData.type)) {
        itemData.system.isContainer = false;
        if (itemData.system.isContainer === true) {
            ui.notifications.warn(game.i18n.format("cnc-backpack.CannotCreateContainer", { name: itemData.name, type: itemData.type }));
            // Debug: Log invalid container creation attempt
            console.debug(`cnc-backpack | Prevented ${itemData.type} item ${itemData.name} from being created as a container`); // Do not Delete: Logs prevention of invalid container creation
        }
    } else {
        itemData.system.isContainer = itemData.system.isContainer || false;
    }

    const newItems = await actor.createEmbeddedDocuments("Item", [itemData]);
    const newItem = newItems[0];
    if (!newItem) {
        ui.notifications.error(`Failed to add ${item.name} to the ${containerId ? "container" : "main inventory"}.`);
        // Debug: Log item creation failure
        console.debug(`cnc-backpack | Failed to create item ${item.name} for actor ${actor.name} (${actor._id})`); // Do not Delete: Logs item creation failure
        return null;
    }

    if (container && itemIds) {
        itemIds.push(newItem.id);
        await container.update({ "system.itemIds": itemIds });
        // Debug: Log container item addition
        console.debug(`cnc-backpack | Added new item ${newItem.name} (${newItem._id}) to container ${container.name} (${container._id})`); // Do not Delete: Logs addition of new item to container
    }

    // Debug: Log successful item creation
    console.debug(`cnc-backpack | Created new item ${newItem.name} (${newItem._id}) for actor ${actor.name} (${actor._id})`); // Do not Delete: Logs successful item creation
    return newItem;
}

// Hooks

// Customize item sheet rendering for items, weapons, and armor
Hooks.on("renderItemSheet", (app, html, data) => {
    // Debug: Log item sheet rendering
    console.debug(`cnc-backpack | Rendering item sheet for ${app.item.name} (${app.item._id}, type: ${app.item.type})`); // Do not Delete: Logs item sheet rendering

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
                    <label class="resource-label container-label" for="system.isContainer">${game.i18n.localize("cnc-backpack.IsContainer")}</label>
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
                    <label class="resource-label">${game.i18n.localize("cnc-backpack.ItemCurrent")} / ${game.i18n.localize("cnc-backpack.ItemCapacity")}</label>
                    <div class="capacity-values">
                        <span class="current-capacity">${globalThis["cnc-backpack"].calculateCurrentEV(app.item, app.actor)}</span> /
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
                    title: game.i18n.localize("cnc-backpack.ConfirmContainerChange"),
                    content: game.i18n.localize("cnc-backpack.UncheckContainerWarning"),
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
                    // Debug: Log container status change
                    console.debug(`cnc-backpack | Changed container status for item ${app.item.name} (${app.item._id}) to false`); // Do not Delete: Logs container status change
                } else {
                    checkbox.checked = currentState;
                }
            } else {
                await app.item.update({ "system.isContainer": true, "system.quantity.value": 1, "system.itemIds": [] });
                setTimeout(() => app.render(true), 100);
                // Debug: Log container status change
                console.debug(`cnc-backpack | Changed container status for item ${app.item.name} (${app.item._id}) to true`); // Do not Delete: Logs container status change
            }
        });
    }

    if (["weapon", "armor"].includes(app.item.type)) {
        const headerFields = html.find(".header-fields");
        const grid = html.find(".grid");
        const equippedHtml = `
            <div class="resource">
                <label class="resource-label container-label" for="system.equipped">${game.i18n.localize("cnc-backpack.Equipped")}</label>
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

// Customize actor sheet rendering for equipment and combat tabs
Hooks.on("renderActorSheet", async (app, html, data) => {
    // Debug: Log actor sheet rendering
    console.debug(`cnc-backpack | Rendering actor sheet for ${app.actor.name} (${app.actor._id})`); // Do not Delete: Logs actor sheet rendering

    if (!app.actor || app.actor.type !== "character" || game.system.id !== "castles-and-crusades") return;

    app._containerStates = app._containerStates || new Map();

    // Debounce rendering to prevent excessive updates
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
        if (["weapon", "armor"].includes(item.type) && item.system?.isContainer) {
            itemUpdates.push({
                _id: item.id,
                "system.isContainer": undefined
            });
            // Debug: Log invalid container correction
            console.debug(`cnc-backpack | Queued correction for invalid container flag on ${item.type} item ${item.name} (${item._id})`); // Do not Delete: Logs correction of invalid container flag during actor sheet rendering
        }
    }

    for (const item of app.actor.items) {
        if (item.type === "item" && item.system?.isContainer) {
            const validItemIds = item.system.itemIds?.filter(id => app.actor.items.get(id)) || [];
            if (validItemIds.length !== item.system.itemIds.length) {
                containerUpdates.push({
                    _id: item.id,
                    "system.itemIds": validItemIds
                });
                // Debug: Log container item ID cleanup
                console.debug(`cnc-backpack | Queued cleanup of invalid item IDs for container ${item.name} (${item._id})`); // Do not Delete: Logs cleanup of invalid item IDs in container
            }
        }
    }

    if (itemUpdates.length > 0) {
        await app.actor.updateEmbeddedDocuments("Item", itemUpdates);
        // Debug: Log item updates
        console.debug(`cnc-backpack | Updated ${itemUpdates.length} items to correct invalid container flags`); // Do not Delete: Logs item updates for container corrections
    }
    if (containerUpdates.length > 0) {
        await app.actor.updateEmbeddedDocuments("Item", containerUpdates);
        // Debug: Log container updates
        console.debug(`cnc-backpack | Updated ${containerUpdates.length} containers to clean up invalid item IDs`); // Do not Delete: Logs container updates for item ID cleanup
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
        } else if (!["spell", "feature"].includes(item.type) && !item.system?.containerId) {
            gear.push(item);
            gearIds.add(item._id);
        }
    }

    for (const container of containers) {
        container.contents = data.items.filter(i => container.itemIds.includes(i._id));
        container.totalEV = globalThis["cnc-backpack"].calculateCurrentEV(container, app.actor);
    }

    const money = data.system?.money || { pp: { value: 0 }, gp: { value: 0 }, sp: { value: 0 }, cp: { value: 0 } };
    const carriedEV = globalThis["cnc-backpack"].calculateCarriedEV(data, containers);
    const carriedWeight = globalThis["cnc-backpack"].calculateCarriedWeight(data, containers);
    const rating = globalThis["cnc-backpack"].calculateEncumbranceRating(data);

    const encumbranceMode = game.settings.get("cnc-backpack", "encumbranceMode");
    const displayRating = encumbranceMode === "lbs" ? rating * 10 : rating;
    const displayCarried = encumbranceMode === "lbs" ? carriedWeight : carriedEV;
    const ratingLabel = encumbranceMode === "lbs" ? `${displayRating} lbs.` : `${displayRating} ER`;
    const carriedLabel = encumbranceMode === "lbs" ? `${displayCarried} lbs.` : `${displayCarried} EV`;
    const encumbrance = globalThis["cnc-backpack"].determineEncumbranceCategory(
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
            ${globalThis["cnc-backpack"].renderItemsList(data, containers, gear, app._containerStates)}
        `;
        itemsTab.html(customItemsHtml);
    }

    const combatTab = html.find(".tab[data-tab='combat']");
    if (combatTab.length) {
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

        // Calculate AC based on dexterity, all equipped items, and manual modifier
        const dexBonus = data.system.abilities?.dex?.bonus ?? 0;
        let armorBonus = 0;
        // Find all equipped items that contribute to AC (not in containers)
        const equippedACItems = data.items.filter(item => 
            item.system.equipped && 
            !item.system?.containerId && 
            item.system?.armorClass?.value !== undefined
        );
        // Sum their AC contributions
        armorBonus = equippedACItems.reduce((total, item) => {
            return total + (item.system.armorClass.value ?? 0);
        }, 0);
        const manualModifier = app.actor.getFlag("cnc-backpack", "globalAC") ?? 0;
        const calculatedAC = 10 + dexBonus + armorBonus + manualModifier;

        const acContainer = combatTab.find("div.resource:has(input[name='system.armorClass.value'])");
        if (acContainer.length) {
            const acInput = acContainer.find("input[name='system.armorClass.value']");
            acInput.val(calculatedAC).prop("readonly", true);

            if (data.system.armorClass.value !== calculatedAC) {
                await app.actor.update({ "system.armorClass.value": calculatedAC });
                // Debug: Log AC update
                console.debug(`cnc-backpack | Updated AC for actor ${app.actor.name} (${app.actor._id}) to ${calculatedAC}`); // Do not Delete: Logs AC update
            }
        }

        // Add settings icons to Weapon and Armor headers
        setTimeout(() => {
            const weaponHeader = combatTab.find(".items-list").eq(0).find(".items-header");
            if (weaponHeader.length) {
                const controls = weaponHeader.find(".item-controls");
                controls.find(".attack-damage-settings-toggle").remove();
                const attackDamageSettingsIcon = `
                    <a class="item-control attack-damage-settings-toggle" title="Attack/Damage Settings">
                        <i class="fas fa-cog"></i>
                    </a>`;
                controls.prepend(attackDamageSettingsIcon);
            }

            const armorHeader = combatTab.find(".items-list").eq(1).find(".items-header");
            if (armorHeader.length) {
                const controls = armorHeader.find(".item-controls");
                controls.find(".ac-settings-toggle").remove();
                const acSettingsIcon = `
                    <a class="item-control ac-settings-toggle" title="AC Settings">
                        <i class="fas fa-cog"></i>
                    </a>`;
                controls.prepend(acSettingsIcon);
            }
        }, 100);

        // Event listeners for settings toggles
        combatTab.off("click", ".ac-settings-toggle").on("click", ".ac-settings-toggle", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const dialogContent = `
                <div class="ac-settings">
                    <h2>Armor Class Calculation</h2>
                    <p>Formula: 10 + Dex Bonus + Equipped Items + Manual Modifier</p>
                    <ul>
                        <li>Base: 10</li>
                        <li>Dex Bonus: ${dexBonus}</li>
                        <li>Equipped Items: ${armorBonus}</li>
                        <li>Manual Modifier: <input type="number" id="globalAC" value="${manualModifier}" style="width: 50px;"></li>
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
                            const newModifier = parseInt(html.find("#globalAC").val()) || 0;
                            await app.actor.setFlag("cnc-backpack", "globalAC", newModifier);
                            debounceRender();
                            // Debug: Log AC modifier update
                            console.debug(`cnc-backpack | Updated global AC modifier for actor ${app.actor.name} (${app.actor._id}) to ${newModifier}`); // Do not Delete: Logs AC modifier update
                        }
                    },
                    cancel: {
                        label: "Cancel"
                    }
                },
                default: "save"
            }).render(true);
            // Debug: Log AC settings dialog
            console.debug(`cnc-backpack | Opened AC settings dialog for actor ${app.actor.name} (${app.actor._id})`); // Do not Delete: Logs AC settings dialog opening
        });

        combatTab.off("click", ".attack-damage-settings-toggle").on("click", ".attack-damage-settings-toggle", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const attackModifier = app.actor.getFlag("cnc-backpack", "globalAttack") ?? 0;
            const damageModifier = app.actor.getFlag("cnc-backpack", "globalDamage") ?? 0;

            const dialogContent = `
                <div class="attack-damage-settings">
                    <h2>Attack and Damage Modifiers</h2>
                    <p>Global modifiers applied to all attack and damage rolls.</p>
                    <ul>
                        <li>Attack Modifier: <input type="number" id="globalAttack" value="${attackModifier}" style="width: 50px;"></li>
                        <li>Damage Modifier: <input type="number" id="globalDamage" value="${damageModifier}" style="width: 50px;"></li>
                    </ul>
                </div>
            `;

            new Dialog({
                title: "Attack/Damage Settings",
                content: dialogContent,
                buttons: {
                    save: {
                        label: "Save",
                        callback: async (html) => {
                            const newAttackModifier = parseInt(html.find("#globalAttack").val()) || 0;
                            const newDamageModifier = parseInt(html.find("#globalDamage").val()) || 0;
                            await app.actor.setFlag("cnc-backpack", "globalAttack", newAttackModifier);
                            await app.actor.setFlag("cnc-backpack", "globalDamage", newDamageModifier);
                            debounceRender();
                            // Debug: Log attack/damage modifier update
                            console.debug(`cnc-backpack | Updated attack/damage modifiers for actor ${app.actor.name} (${app.actor._id}): Attack=${newAttackModifier}, Damage=${newDamageModifier}`); // Do not Delete: Logs attack/damage modifier update
                        }
                    },
                    cancel: {
                        label: "Cancel"
                    }
                },
                default: "save"
            }).render(true);
            // Debug: Log attack/damage settings dialog
            console.debug(`cnc-backpack | Opened attack/damage settings dialog for actor ${app.actor.name} (${app.actor._id})`); // Do not Delete: Logs attack/damage settings dialog opening
        });

        combatTab.find(".equip-toggle").click(async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const itemId = event.currentTarget.dataset.itemId;
            const item = app.actor.items.get(itemId);
            if (!item || (item.type !== "weapon" && item.type !== "armor")) return;

            if (item.system?.containerId) {
                ui.notifications.warn(game.i18n.localize("cnc-backpack.CannotEquipInContainer"));
                // Debug: Log equip in container error
                console.debug(`cnc-backpack | Cannot equip item ${item.name} (${item._id}) inside container ${item.system.containerId}`); // Do not Delete: Logs attempt to equip item in container
                return;
            }

            const isEquipped = item.system.equipped || false;
            await item.update({ "system.equipped": !isEquipped });
            debounceRender();
            // Debug: Log equip toggle
            console.debug(`cnc-backpack | Toggled equip status for item ${item.name} (${item._id}) to ${!isEquipped}`); // Do not Delete: Logs equip status toggle
        });
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
                        // Debug: Log drag start
                        console.debug(`cnc-backpack | Started drag for item ${item.name} (${item._id}), isContained: ${isContained}`); // Do not Delete: Logs drag start event
                    }
                },
                drop: async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const data = TextEditor.getDragEventData(event);
                    if (data.type !== "Item") return false;

                    const item = data.id ? app.actor.items.get(data.id) : await Item.fromDropData(data);
                    if (!item) return false;

                    // Debug: Log drop attempt
                    console.debug(`cnc-backpack | Dropped item ${item.name} (${item._id}) with type ${item.type} and isContainer: ${item.system?.isContainer}`); // Do not Delete: Logs drop attempt

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

                        if (item.type === "item" && item.system?.isContainer) {
                            ui.notifications.warn(game.i18n.localize("cnc-backpack.CannotNestContainer"));
                            // Debug: Log nested container attempt
                            console.debug(`cnc-backpack | Prevented nesting container item ${item.name} (${item._id}) in container ${container.name} (${container._id})`); // Do not Delete: Logs attempt to nest containers
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
                                await globalThis["cnc-backpack"].updateItemContainerId(item, container.id, itemIds, container);
                                if (["weapon", "armor"].includes(item.type) && item.system?.equipped) {
                                    await item.update({ "system.equipped": false });
                                    // Debug: Log equip status reset
                                    console.debug(`cnc-backpack | Reset equip status for ${item.type} item ${item.name} (${item._id}) in container`); // Do not Delete: Logs equip status reset for contained item
                                }
                            } else {
                                await globalThis["cnc-backpack"].createNewItem(item, app.actor, container.id, itemIds, container);
                            }
                            debounceRender();
                        } else {
                            const warningMessage = currentEV + itemEV > containerER
                                ? game.i18n.format("cnc-backpack.ExceedsContainerEV", { name: item.name, currentEV: currentEV + itemEV, capacity: containerER })
                                : game.i18n.format("cnc-backpack.ExceedsContainerItemCount", { name: item.name, currentCount: currentItemCount + 1, capacity: containerER });
                            if (data.id) {
                                await globalThis["cnc-backpack"].updateItemContainerId(item, "", [], null);
                            } else {
                                await globalThis["cnc-backpack"].createNewItem(item, app.actor, "", null, null);
                            }
                            ui.notifications.warn(`${warningMessage}${game.i18n.localize("cnc-backpack.MovedToMainInventory")}`);
                            // Debug: Log container capacity exceeded
                            console.debug(`cnc-backpack | Item ${item.name} (${item._id}) exceeded container ${container.name} (${container._id}) capacity: ${warningMessage}`); // Do not Delete: Logs container capacity exceeded
                            debounceRender();
                        }
                        return true;
                    }

                    if (containersSectionHeader) {
                        if (!data.id && ["armor", "weapon"].includes(item.type)) {
                            ui.notifications.warn(game.i18n.format("cnc-backpack.CannotCreateContainer", { name: item.name, type: item.type }));
                            // Debug: Log invalid container creation attempt
                            console.debug(`cnc-backpack | Prevented creating ${item.type} item ${item.name} (${item._id}) as a container`); // Do not Delete: Logs prevention of invalid container creation
                            return false;
                        }
                        if (data.id) {
                            await globalThis["cnc-backpack"].updateItemContainerId(item, "", [], null);
                            await item.update({ "system.isContainer": true, "system.itemIds": item.system?.itemIds || [] });
                            app._containerStates.delete(item.id);
                            debounceRender();
                            // Debug: Log container creation
                            console.debug(`cnc-backpack | Converted item ${item.name} (${item._id}) to container`); // Do not Delete: Logs conversion to container
                            return true;
                        }
                        const newItem = await globalThis["cnc-backpack"].createNewItem(item, app.actor, "", null, null);
                        if (newItem) {
                            await newItem.update({ "system.isContainer": true, "system.itemIds": [] });
                            debounceRender();
                            // Debug: Log new container creation
                            console.debug(`cnc-backpack | Created new container item ${newItem.name} (${newItem._id})`); // Do not Delete: Logs creation of new container
                        }
                        return true;
                    }

                    if (mainInventorySection || mainInventoryEl) {
                        if (data.isContained) {
                            await globalThis["cnc-backpack"].updateItemContainerId(item, "", [], null);
                            debounceRender();
                            // Debug: Log move to main inventory
                            console.debug(`cnc-backpack | Moved contained item ${item.name} (${item._id}) to main inventory`); // Do not Delete: Logs move to main inventory
                            return true;
                        }
                        await globalThis["cnc-backpack"].createNewItem(item, app.actor, "", null, null);
                        debounceRender();
                        // Debug: Log new item in main inventory
                        console.debug(`cnc-backpack | Created new item ${item.name} (${item._id}) in main inventory`); // Do not Delete: Logs creation of new item in main inventory
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
                    // Debug: Log dragover event
                    console.debug(`cnc-backpack | Dragover on ${containerEl ? `container ${containerEl.dataset.itemId}` : containersSection ? "containers section" : mainInventorySection ? "main inventory" : "unknown"}`); // Do not Delete: Logs dragover event
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
                    // Debug: Log dragleave event
                    console.debug(`cnc-backpack | Dragleave from ${containerEl ? `container ${containerEl.dataset.itemId}` : containersSection ? "containers section" : mainInventorySection ? "main inventory" : "unknown"}`); // Do not Delete: Logs dragleave event
                }
            }
        }).bind(itemsTab[0]);

        html.find(".item-create").click(async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const isContainer = event.currentTarget.dataset.isContainer === "true";
            const itemData = {
                name: isContainer ? game.i18n.localize("cnc-backpack.NewContainer") : game.i18n.localize("cnc-backpack.NewItem"),
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
                    newItem.sheet.render(true);
                    // Debug: Log item creation
                    console.debug(`cnc-backpack | Created new ${isContainer ? "container" : "item"} ${newItem.name} (${newItem._id}) for actor ${app.actor.name} (${app.actor._id})`); // Do not Delete: Logs item creation via UI
                } else {
                    ui.notifications.error(game.i18n.format("cnc-backpack.CreateItemFailed", { type: isContainer ? "container" : "item" }));
                    // Debug: Log item creation failure
                    console.debug(`cnc-backpack | Failed to create new ${isContainer ? "container" : "item"} for actor ${app.actor.name} (${app.actor._id})`); // Do not Delete: Logs item creation failure via UI
                }
            } catch (error) {
                ui.notifications.error(game.i18n.format("cnc-backpack.CreateItemError", { type: isContainer ? "container" : "item", error: error.message }));
                // Debug: Log item creation error
                console.debug(`cnc-backpack | Error creating new ${isContainer ? "container" : "item"} for actor ${app.actor.name} (${app.actor._id}): ${error.message}`); // Do not Delete: Logs item creation error via UI
            }
            debounceRender();
        });

        html.find(".quantity-increment").click(async (event) => {
            event.stopPropagation();
            const itemId = event.currentTarget.dataset.itemId;
            const item = app.actor.items.get(itemId);
            if (item) {
                if (!item.testUserPermission(game.user, "OWNER")) {
                    ui.notifications.warn(game.i18n.localize("cnc-backpack.NoPermission"));
                    // Debug: Log permission error
                    console.debug(`cnc-backpack | Permission denied for incrementing quantity of item ${item.name} (${item._id})`); // Do not Delete: Logs permission error for quantity increment
                    return;
                }
                const currentQuantity = item.system?.quantity?.value ?? 1;
                const newQuantity = currentQuantity + 1;
                const itemEV = (item.system?.itemev?.value ?? 0);

                const containerId = item.system?.containerId;
                if (containerId) {
                    const container = app.actor.items.get(containerId);
                    if (container && container.system?.isContainer) {
                        const currentContainerEV = globalThis["cnc-backpack"].calculateCurrentEV(container, app.actor);
                        const containerCapacity = container.system?.er?.value ?? 0;
                        const newContainerEV = currentContainerEV - (itemEV * currentQuantity) + (itemEV * newQuantity);

                        if (newContainerEV > containerCapacity) {
                            ui.notifications.warn(game.i18n.format("cnc-backpack.ExceedsEVCapacity", { name: item.name, currentEV: newContainerEV, capacity: containerCapacity }));
                            // Debug: Log container capacity exceeded
                            console.debug(`cnc-backpack | Quantity increment for item ${item.name} (${item._id}) exceeds container ${container.name} (${container._id}) capacity: ${newContainerEV}/${containerCapacity}`); // Do not Delete: Logs container capacity exceeded for quantity increment
                            return;
                        }
                    }
                }

                await item.update({ "system.quantity.value": newQuantity });
                const quantityEl = html.find(`.contained-item[data-item-id="${itemId}"] .quantity-value, .inventory-item[data-item-id="${itemId}"] .quantity-value`);
                if (quantityEl.length) {
                    quantityEl.text(newQuantity);
                }
                const containers = app.actor.items.filter(i => i.type === "item" && i.system?.isContainer).map(item => {
                    item.img = item.img || CONST.DEFAULT_TOKEN;
                    item.itemIds = item.system.itemIds || [];
                    item.contents = app.actor.items.filter(i => item.itemIds.includes(i._id));
                    item.totalEV = globalThis["cnc-backpack"].calculateCurrentEV(item, app.actor);
                    return item;
                });

                const carriedEV = globalThis["cnc-backpack"].calculateCarriedEV(app.actor, containers);
                const carriedWeight = globalThis["cnc-backpack"].calculateCarriedWeight(app.actor, containers);
                const encumbranceMode = game.settings.get("cnc-backpack", "encumbranceMode");
                const displayCarried = encumbranceMode === "lbs" ? carriedWeight : carriedEV;

                containers.forEach(container => {
                    const containerEl = html.find(`.container-item[data-item-id="${container.id}"]`);
                    if (containerEl.length) {
                        const evDisplay = containerEl.find(".flex-center.align-right");
                        evDisplay.text(`${container.totalEV ?? 0} / ${container.system?.er?.value ?? 0} EV`);
                    }
                });

                const carriedEl = html.find(".encumbrance .resource:contains('Carried') .encumbrance-input");
                if (carriedEl.length) {
                    carriedEl.val(encumbranceMode === "lbs" ? `${displayCarried} lbs.` : `${displayCarried} EV`);
                }
                // Debug: Log quantity increment
                console.debug(`cnc-backpack | Incremented quantity for item ${item.name} (${item._id}) to ${newQuantity}`); // Do not Delete: Logs quantity increment
            }
        });

        html.find(".quantity-decrement").click(async (event) => {
            event.stopPropagation();
            const itemId = event.currentTarget.dataset.itemId;
            const item = app.actor.items.get(itemId);
            if (item) {
                if (!item.testUserPermission(game.user, "OWNER")) {
                    ui.notifications.warn(game.i18n.localize("cnc-backpack.NoPermission"));
                    // Debug: Log permission error
                    console.debug(`cnc-backpack | Permission denied for decrementing quantity of item ${item.name} (${item._id})`); // Do not Delete: Logs permission error for quantity decrement
                    return;
                }
                const currentQuantity = item.system?.quantity?.value ?? 1;
                if (currentQuantity <= 1) {
                    ui.notifications.info(game.i18n.format("cnc-backpack.CannotDecreaseQuantity", { name: item.name }));
                    // Debug: Log quantity decrement limit
                    console.debug(`cnc-backpack | Cannot decrement quantity below 1 for item ${item.name} (${item._id})`); // Do not Delete: Logs quantity decrement limit reached
                    return;
                }
                const newQuantity = currentQuantity - 1;
                await item.update({ "system.quantity.value": newQuantity });
                const quantityEl = html.find(`.contained-item[data-item-id="${itemId}"] .quantity-value, .inventory-item[data-item-id="${itemId}"] .quantity-value`);
                if (quantityEl.length) {
                    quantityEl.text(newQuantity);
                }
                const containers = app.actor.items.filter(i => i.type === "item" && i.system?.isContainer).map(item => {
                    item.img = item.img || CONST.DEFAULT_TOKEN;
                    item.itemIds = item.system.itemIds || [];
                    item.contents = app.actor.items.filter(i => item.itemIds.includes(i._id));
                    item.totalEV = globalThis["cnc-backpack"].calculateCurrentEV(item, app.actor);
                    return item;
                });

                const carriedEV = globalThis["cnc-backpack"].calculateCarriedEV(app.actor, containers);
                const carriedWeight = globalThis["cnc-backpack"].calculateCarriedWeight(app.actor, containers);
                const encumbranceMode = game.settings.get("cnc-backpack", "encumbranceMode");
                const displayCarried = encumbranceMode === "lbs" ? carriedWeight : carriedEV;

                containers.forEach(container => {
                    const containerEl = html.find(`.container-item[data-item-id="${container.id}"]`);
                    if (containerEl.length) {
                        const evDisplay = containerEl.find(".flex-center.align-right");
                        evDisplay.text(`${container.totalEV ?? 0} / ${container.system?.er?.value ?? 0} EV`);
                    }
                });

                const carriedEl = html.find(".encumbrance .resource:contains('Carried') .encumbrance-input");
                if (carriedEl.length) {
                    carriedEl.val(encumbranceMode === "lbs" ? `${displayCarried} lbs.` : `${displayCarried} EV`);
                }
                // Debug: Log quantity decrement
                console.debug(`cnc-backpack | Decremented quantity for item ${item.name} (${item._id}) to ${newQuantity}`); // Do not Delete: Logs quantity decrement
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
            // Debug: Log container toggle
            console.debug(`cnc-backpack | Toggled container ${containerId} to ${isCurrentlyExpanded ? "collapsed" : "expanded"}`); // Do not Delete: Logs container toggle
        });

        html.find(".item-edit").click((event) => {
            event.stopPropagation();
            const itemId = event.currentTarget.closest(".item").dataset.itemId;
            const item = app.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
                // Debug: Log item edit
                console.debug(`cnc-backpack | Opened edit sheet for item ${item.name} (${item._id})`); // Do not Delete: Logs item edit action
            }
        });

        html.find(".item-delete").on("click", async (event) => {
            event.stopPropagation();
            event.preventDefault();

            const itemId = event.currentTarget.closest(".item").dataset.itemId;
            const item = app.actor.items.get(itemId);
            if (!item) return;

            if (item.type === "item" && item.system?.isContainer) {
                const confirmed = await Dialog.confirm({
                    title: game.i18n.localize("TLGCC.ItemDelete"),
                    content: game.i18n.localize("cnc-backpack.DeleteContainerWarning"),
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });

                if (confirmed) {
                    const validItemIds = item.system?.itemIds?.filter(id => app.actor.items.get(id)) || [];
                    if (validItemIds.length > 0) {
                        const containedItems = validItemIds.map(id => ({ _id: id, "system.containerId": "" }));
                        await app.actor.updateEmbeddedDocuments("Item", containedItems);
                        // Debug: Log contained items cleanup
                        console.debug(`cnc-backpack | Cleaned up ${validItemIds.length} contained items from container ${item.name} (${item._id})`); // Do not Delete: Logs cleanup of contained items before deletion
                    }
                    await item.delete();
                    app._containerStates.delete(itemId);
                    debounceRender();
                    // Debug: Log container deletion
                    console.debug(`cnc-backpack | Deleted container ${item.name} (${item._id})`); // Do not Delete: Logs container deletion
                }
            } else {
                const container = app.actor.items.get(item.system?.containerId);
                if (container) {
                    const itemIds = container.system?.itemIds?.filter(id => id !== item.id) || [];
                    await container.update({ "system.itemIds": itemIds });
                    // Debug: Log container item removal
                    console.debug(`cnc-backpack | Removed item ${item.name} (${item._id}) from container ${container.name} (${container._id})`); // Do not Delete: Logs item removal from container
                }
                await item.update({ "system.containerId": "" });
                await item.delete();
                debounceRender();
                // Debug: Log item deletion
                console.debug(`cnc-backpack | Deleted item ${item.name} (${item._id})`); // Do not Delete: Logs item deletion
            }
        });
    }
});