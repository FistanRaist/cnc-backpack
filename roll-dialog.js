/**
 * roll-dialog.js
 * Enhances Castles & Crusades rolls with a dialog for applying global and manual modifiers.
 */

// Enhance roll dialog for Castles & Crusades system
Hooks.once("init", async () => {
    if (game.system.id !== "castles-and-crusades") return;

    // Load templates for the roll dialog
    try {
        await loadTemplates([
            "modules/cnc-backpack/templates/roll-dialog.hbs"
        ]);
    } catch (err) {
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

    // Store the original toMessage method
    const originalToMessage = Roll.prototype.toMessage;

    // Track processed actions to prevent duplicate dialogs
    const processedActions = new Map();

    // Override Roll.prototype.toMessage to show a dialog with modifiers
    Roll.prototype.toMessage = async function(message, options = {}) {
        if (options.skipModifiers || options.skipDialog) {
            return originalToMessage.call(this, message, options);
        }

        // Skip initiative rolls (e.g., max(1,1d10))
        if (this.formula.toLowerCase().includes("max(1,1d10)")) {
            return originalToMessage.call(this, message, options);
        }

        const actor = message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
        if (!actor) {
            return originalToMessage.call(this, message, options);
        }

        const fastForwardRolls = game.settings.get("cnc-backpack", "fastForwardRolls");
        let showDialog = !fastForwardRolls;
        if (!showDialog) {
            return originalToMessage.call(this, message, options);
        }

        const flavor = message.flavor?.toLowerCase() || "";
        const formula = this.formula?.toLowerCase() || "";
        // Determine roll type for applying global modifiers
        const isDamageRoll = flavor.includes("damage") && !formula.startsWith("1d20") && formula.includes("d");
        const isAttackRoll = formula.startsWith("1d20") && !isDamageRoll;

        const globalAttack = actor.getFlag("cnc-backpack", "globalAttack") ?? 0;
        const globalDamage = actor.getFlag("cnc-backpack", "globalDamage") ?? 0;

        let globalModifier = 0;
        if (isAttackRoll && globalAttack !== 0) {
            globalModifier = globalAttack;
        } else if (isDamageRoll && globalDamage !== 0) {
            globalModifier = globalDamage;
        }

        if (!this._evaluated) {
            try {
                await this.evaluate();
            } catch (err) {
                return originalToMessage.call(this, message, options);
            }
        }

        let baseFormula;
        if (isAttackRoll) {
            const dicePart = this.dice.length > 0 ? this.dice[0].expression : "1d20";
            const baseModifiers = this.total - (this.dice[0]?.total || 0);
            baseFormula = `${dicePart} + ${baseModifiers}`;
        } else {
            baseFormula = this.dice.length > 0 ? this.dice[0].expression : this.formula;
        }

        const cleanFormula = baseFormula.replace(/\s*\(\)\s*$/, "");

        const dialogData = {
            formula: cleanFormula,
            globalMod: globalModifier,
            manualMod: 0
        };

        let content;
        try {
            content = await renderTemplate("modules/cnc-backpack/templates/roll-dialog.hbs", dialogData);
        } catch (err) {
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

        if (!dialogResult.proceed) {
            return null;
        }

        const totalModifier = dialogResult.globalMod + dialogResult.manualMod;
        if (totalModifier === 0) {
            return originalToMessage.call(this, message, options);
        }

        const sign = totalModifier >= 0 ? "+" : "";
        const newFormula = `${cleanFormula} ${sign} ${totalModifier}`;
        const newRoll = new Roll(newFormula, {});
        
        try {
            await newRoll.evaluate();
        } catch (err) {
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