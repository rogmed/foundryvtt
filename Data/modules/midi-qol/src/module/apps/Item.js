export class OnUseMacros {
	constructor(onUseMacros = null) {
		if (typeof onUseMacros === "string") {
			this.items = onUseMacros?.split(',')?.filter((value) => value.trim().length > 0)?.map((macro) => new OnUseMacro(macro));
		}
		else {
			this.items = [];
		}
	}
	static parseParts(parts) {
		const macros = new OnUseMacros();
		parts.items?.forEach(x => macros.items.push(OnUseMacro.parsePart(x)));
		return macros;
	}
	getMacros(currentOption) {
		return this.items.filter(x => x.macroName?.length > 0 && (x.option === currentOption || x.option === "all")).map(x => x.macroName).toString();
	}
	toString() {
		return this.items.map(m => m.toString()).join(',');
	}
	get selectListOptions() {
		return this.items.reduce((value, macro, index) => value += macro.toListItem(index, OnUseMacroOptions.getOptions), "");
	}
}
export class OnUseMacro {
	constructor(macro = undefined) {
		if (macro === undefined) {
			this.macroName = "";
		}
		else {
			const pattern = new RegExp('(?:\\[(?<option>.*?)\\])?(?<macroName>.*)', '');
			let data = macro.match(pattern)?.groups;
			this.macroName = data["macroName"].trim();
			this.option = data["option"];
		}
		if (this.option === undefined)
			this.option = "postActiveEffects";
	}
	static parsePart(parts) {
		const m = new OnUseMacro();
		m.macroName = parts.macroName;
		m.option = parts.option ?? m.option;
		return m;
	}
	toString() {
		return `[${this.option}]${this.macroName}`;
	}
	toListItem(index, macroOptions) {
		const options = OnUseMacroOptions.getOptions?.reduce((opts, x) => opts += `<option value="${x.option}" ${x.option === this.option ? 'selected' : ''}>${x.label}</option>`, "");
		return `<li class="damage-part flexrow" data-midiqol-macro-part="${index}">
	<input type="text" name="flags.midi-qol.onUseMacroParts.items.${index}.macroName" value="${this.macroName}">
	<select name="flags.midi-qol.onUseMacroParts.items.${index}.option">
	${options}
	</select>

	<a class="macro-control damage-control delete-macro"><i class="fas fa-minus"></i></a>
</li>`;
	}
}
export class OnUseMacroOptions {
	static setOptions(options) {
		this.options = [];
		for (let option of Object.keys(options)) {
			this.options.push({ option, label: options[option] });
		}
	}
	static get getOptions() {
		return this.options;
	}
}
export function activateMacroListeners(app, html) {
	//@ts-ignore
	if (app.isEditable) {
		html.find(".macro-control").click(_onMacroControl.bind(app));
	}
}
async function _onMacroControl(event) {
	event.preventDefault();
	const a = event.currentTarget;
	// Add new macro component
	if (a.classList.contains("add-macro")) {
		const macros = getCurrentSourceMacros(this.object);
		await this._onSubmit(event); // Submit any unsaved changes
		macros.items.push(new OnUseMacro());
		return this.object.update({ "flags.midi-qol.onUseMacroName": macros.toString() });
	}
	// Remove a macro component
	if (a.classList.contains("delete-macro")) {
		const macros = getCurrentSourceMacros(this.object);
		await this._onSubmit(event); // Submit any unsaved changes
		const li = a.closest(".damage-part");
		macros.items.splice(Number(li.dataset.midiqolMacroPart), 1);
		return this.object.update({ "flags.midi-qol.onUseMacroName": macros.toString() });
	}
}
export function getCurrentMacros(object) {
	const macroField = getProperty(object, "flags.midi-qol.onUseMacroParts");
	return macroField;
}
export function getCurrentSourceMacros(object) {
	const macroField = new OnUseMacros(getProperty(object, "_source.flags.midi-qol.onUseMacroName") ?? null);
	// const macroField = getProperty(object, "_source.flags.midi-qol.onUseMacroParts");
	return macroField;
}
