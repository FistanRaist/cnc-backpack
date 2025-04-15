/**
 * roll-dialog.js
 * Enhances Castles & Crusades rolls with a dialog for applying global and manual modifiers.
 */

// Enhance roll dialog for Castles & Crusades system
Hooks.once("init", async () => {
    console.log("Roll Dialog: Initializing for system:", game.system.id);
    if (game.system.id !== "castles-and-crusades") {
        console.log("Roll Dialog: System is not Castles & Crusades, exiting.");
        return;
    }

    // Load templates for the roll dialog
    try {
        await loadTemplates([
            "modules/cnc-backpack/templates/roll-dialog.hbs"
        ]);
        console.log("Roll Dialog: Template loaded successfully.");
    } catch (err) {
        console.error("Roll Dialog: Failed to load template:", err);
        throw err;
    }

    // Inject CSS for roll dialog styling
    const style = document.createElement("style");
    style.textContent = `
        .cnc-roll-dialog {
            background-color: transparent;
            color: #333333;
            font-family: Signika, TexGyreAdventor, sans-serif;
            border: none;
            border-radius: 5px;
            width: 100%;
            min-height: 100px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 0;
            box-sizing: border-box;
        }
        .cnc-roll-dialog .content-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            padding: 10px;
        }
        .cnc-roll-dialog p {
            margin: 5px 0;
            font-size: 14px;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: transparent;
        }
        .cnc-roll-dialog div {
            padding: 5px;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .cnc-roll-dialog input[type="number"] {
            width: 50px;
            padding: 5px;
            margin: 5px 0;
            border: 1px solid #7a7971;
            background-color: rgba(0, 0, 0, 0.05);
            border-radius: 3px;
            font-family: Signika, TexGyreAdventor, sans-serif;
            font-size: 14px;
            text-align: center;
        }
    `;
    document.head.appendChild(style);
    console.log("Roll Dialog: CSS injected successfully.");

    // Store the original toMessage method
    const originalToMessage = Roll.prototype.toMessage;

    // Track processed actions to prevent duplicate dialogs
    const processedActions = new Map();

    // Override Roll.prototype.toMessage to show a dialog with modifiers
    Roll.prototype.toMessage = async function(message, options = {}) {
        console.log("Roll Dialog: Intercepted Roll.toMessage - Formula:", this.formula, "Message:", message, "Options:", options);

        if (options.skipModifiers || options.skipDialog) {
            console.log("Roll Dialog: Skipping due to options.skipModifiers or options.skipDialog.");
            return originalToMessage.call(this, message, options);
        }

        const flavor = message.flavor?.toLowerCase() || "";
        const formula = this.formula?.toLowerCase() || "";
        console.log("Roll Dialog: Flavor:", flavor, "Formula:", formula);

        const isAttackRoll = flavor.includes("attack") && formula.startsWith("1d20");
        const isDamageRoll = flavor.includes("damage") && !formula.startsWith("1d20") && formula.includes("d");
        console.log("Roll Dialog: isAttackRoll:", isAttackRoll, "isDamageRoll:", isDamageRoll);

        if (!isAttackRoll && !isDamageRoll) {
            console.log("Roll Dialog: Not an attack or damage roll, skipping dialog.");
            return originalToMessage.call(this, message, options);
        }

        if (this.formula.toLowerCase().includes("max(1,1d10)")) {
            console.log("Roll Dialog: Initiative roll detected, skipping dialog.");
            return originalToMessage.call(this, message, options);
        }

        const actor = message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
        console.log("Roll Dialog: Actor:", actor);
        if (!actor) {
            console.log("Roll Dialog: No actor found, skipping dialog.");
            return originalToMessage.call(this, message, options);
        }

        const globalAttack = actor.getFlag("cnc-backpack", "globalAttack") ?? 0;
        const globalDamage = actor.getFlag("cnc-backpack", "globalDamage") ?? 0;
        console.log("Roll Dialog: Global Modifiers - Attack:", globalAttack, "Damage:", globalDamage);

        let globalModifier = 0;
        if (isAttackRoll && globalAttack !== 0) {
            globalModifier = globalAttack;
        } else if (isDamageRoll && globalDamage !== 0) {
            globalModifier = globalDamage;
        }
        console.log("Roll Dialog: Global Modifier:", globalModifier);

        if (globalModifier === 0) {
            console.log("Roll Dialog: Global modifier is 0, skipping dialog.");
            return originalToMessage.call(this, message, options);
        }

        const fastForwardRolls = game.settings.get("cnc-backpack", "fastForwardRolls");
        console.log("Roll Dialog: Fast Forward Rolls setting:", fastForwardRolls);
        let showDialog = !fastForwardRolls;

        if (!this._evaluated) {
            console.log("Roll Dialog: Roll not evaluated, evaluating now.");
            try {
                await this.evaluate();
                console.log("Roll Dialog: Roll evaluated - Total:", this.total);
            } catch (err) {
                console.error("Roll Dialog: Failed to evaluate roll:", err);
                return originalToMessage.call(this, message, options);
            }
        } else {
            console.log("Roll Dialog: Roll already evaluated - Total:", this.total);
        }

        let baseFormula;
        if (isAttackRoll) {
            const dicePart = this.dice.length > 0 ? this.dice[0].expression : "1d20";
            const baseModifiers = this.total - (this.dice[0]?.total || 0);
            baseFormula = `${dicePart} + ${baseModifiers}`;
        } else {
            baseFormula = this.dice.length > 0 ? this.dice[0].expression : this.formula;
        }
        console.log("Roll Dialog: Base Formula:", baseFormula);

        const cleanFormula = baseFormula.replace(/\s*\(\)\s*$/, "");
        console.log("Roll Dialog: Clean Formula:", cleanFormula);

        if (!showDialog) {
            console.log("Roll Dialog: Fast Forward Rolls enabled, applying modifier directly.");
            const totalModifier = globalModifier;
            const sign = totalModifier >= 0 ? "+" : "";
            const newFormula = `${cleanFormula} ${sign} ${totalModifier}`;
            console.log("Roll Dialog: New Formula with Modifier:", newFormula);

            const newRoll = new Roll(newFormula, {});
            
            try {
                await newRoll.evaluate();
                console.log("Roll Dialog: New roll evaluated - Total:", newRoll.total);
            } catch (err) {
                console.error("Roll Dialog: Failed to evaluate new roll:", err);
                return originalToMessage.call(this, message, options);
            }

            const newMessage = foundry.utils.deepClone(message);
            newMessage.flavor += `<br>${game.i18n.localize("cnc-backpack.RollDialogGlobalModifier")}: ${totalModifier}, ${game.i18n.localize("cnc-backpack.RollDialogManualModifier")}: 0`;
            newMessage.rolls = [newRoll];

            const actionId = options.actionId || this.id || Date.now().toString(36);
            const actionKey = `${actionId}_modifier_${Date.now()}`;
            processedActions.set(actionKey, true);
            setTimeout(() => processedActions.delete(actionKey), 1000);

            options.skipModifiers = true;
            options.skipDialog = true;
            return await originalToMessage.call(newRoll, newMessage, options);
        }

        console.log("Roll Dialog: Preparing to show dialog.");
        const dialogData = {
            formula: cleanFormula,
            globalMod: globalModifier,
            manualMod: 0
        };

        let content;
        try {
            content = await renderTemplate("modules/cnc-backpack/templates/roll-dialog.hbs", dialogData);
            console.log("Roll Dialog: Template rendered successfully.");
        } catch (err) {
            console.error("Roll Dialog: Template rendering failed, using fallback:", err);
            content = `
                <div class="cnc-roll-dialog">
                    <div class="content-wrapper">
                        <p>Roll: ${cleanFormula}</p>
                        <div><label>${game.i18n.localize("cnc-backpack.RollDialogGlobalModifier")}: ${globalModifier}</label></div>
                        <div><label>${game.i18n.localize("cnc-backpack.RollDialogManualModifier")}: <input type="number" name="manualMod" value="0"></label></div>
                    </div>
                </div>
            `;
        }

        const dialogResult = await new Promise(resolve => {
            console.log("Roll Dialog: Rendering dialog.");
            new Dialog({
                title: game.i18n.localize("cnc-backpack.RollDialogTitle"),
                content: content,
                buttons: {
                    roll: {
                        label: game.i18n.localize("cnc-backpack.RollDialogRollButton"),
                        callback: html => {
                            const manualMod = parseInt(html.find("[name='manualMod']").val()) || 0;
                            resolve({ proceed: true, globalMod: globalModifier, manualMod });
                        }
                    },
                    cancel: {
                        label: game.i18n.localize("cnc-backpack.RollDialogCancelButton"),
                        callback: () => resolve({ proceed: false, globalMod: globalModifier, manualMod: 0 })
                    }
                },
                default: "roll"
            }).render(true);
        });

        console.log("Roll Dialog: Dialog result:", dialogResult);
        if (!dialogResult.proceed) {
            console.log("Roll Dialog: Roll canceled by user.");
            return null;
        }

        const totalModifier = dialogResult.globalMod + dialogResult.manualMod;
        console.log("Roll Dialog: Total Modifier:", totalModifier);
        if (totalModifier === 0) {
            console.log("Roll Dialog: Total modifier is 0, skipping.");
            return originalToMessage.call(this, message, options);
        }

        const sign = totalModifier >= 0 ? "+" : "";
        const newFormula = `${cleanFormula} ${sign} ${totalModifier}`;
        console.log("Roll Dialog: Final Formula with Modifier:", newFormula);

        const newRoll = new Roll(newFormula, {});
        
        try {
            await newRoll.evaluate();
            console.log("Roll Dialog: Final roll evaluated - Total:", newRoll.total);
        } catch (err) {
            console.error("Roll Dialog: Failed to evaluate final roll:", err);
            return originalToMessage.call(this, message, options);
        }

        const newMessage = foundry.utils.deepClone(message);
        newMessage.flavor += `<br>${game.i18n.localize("cnc-backpack.RollDialogGlobalModifier")}: ${dialogResult.globalMod}, ${game.i18n.localize("cnc-backpack.RollDialogManualModifier")}: ${dialogResult.manualMod}`;
        newMessage.rolls = [newRoll];

        const actionId = options.actionId || this.id || Date.now().toString(36);
        const actionKey = `${actionId}_modifier_${Date.now()}`;
        processedActions.set(actionKey, true);
        setTimeout(() => processedActions.delete(actionKey), 1000);

        options.skipModifiers = true;
        options.skipDialog = true;
        return await originalToMessage.call(newRoll, newMessage, options);
    };
});