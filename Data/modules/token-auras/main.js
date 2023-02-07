const Auras = {
	PERMISSIONS: ['all', 'limited', 'observer', 'owner', 'gm'],

	getAllAuras: function (doc) {
		return Auras.getManualAuras(doc).concat(doc.getFlag('token-auras', 'auras') || []);
	},

	getManualAuras: function (doc) {
		let aura1 = doc.getFlag('token-auras', 'aura1');
		let aura2 = doc.getFlag('token-auras', 'aura2');
		return [aura1 || Auras.newAura(), aura2 || Auras.newAura()];
	},

	newAura: function () {
		return {
			distance: null,
			colour: '#ffffff',
			opacity: .5,
			square: false,
			permission: 'all',
			uuid: Auras.uuid()
		};
	},

	onConfigRender: function (config, html) {
		const auras = Auras.getManualAuras(config.token);

		// Expand the width
		config.position.width = 540;
		config.setPosition(config.position);

		const nav = html.find('nav.sheet-tabs.tabs[data-group="main"]');
		nav.append($(`
			<a class="item" data-tab="auras">
				<i class="far fa-dot-circle"></i>
				${game.i18n.localize('AURAS.Auras')}
			</a>
		`));

		const permissions = Auras.PERMISSIONS.map(perm => {
			let i18n = `PERMISSION.${perm.toUpperCase()}`;
			if (perm === 'all') {
				i18n = 'AURAS.All';
			}

			if (perm === 'gm') {
				i18n = 'USER.RoleGamemaster';
			}

			return {key: perm, label: game.i18n.localize(i18n)};
		});

		const auraConfig = auras.map((aura, idx) => `
			<div class="form-group">
				<label>${game.i18n.localize('AURAS.ShowTo')}</label>
				<select name="flags.token-auras.aura${idx + 1}.permission">
					${permissions.map(option => `
						<option value="${option.key}"
						        ${aura.permission === option.key ? 'selected' : ''}>
							${option.label}
						</option>
					`)}
				</select>
			</div>
			<div class="form-group">
				<label>${game.i18n.localize('AURAS.AuraColour')}</label>
				<div class="form-fields">
					<input class="color" type="text" value="${aura.colour}"
					       name="flags.token-auras.aura${idx + 1}.colour">
					<input type="color" value="${aura.colour}"
					       data-edit="flags.token-auras.aura${idx + 1}.colour">
				</div>
			</div>
			<div class="form-group">
				<label>
					${game.i18n.localize('AURAS.Opacity')}
					<span class="units">(0 &mdash; 1)</span>
				</label>
				<input type="number" value="${aura.opacity}" step="any" min="0" max="1"
				       name="flags.token-auras.aura${idx + 1}.opacity">
			</div>
			<div class="form-group">
				<label>
					${game.i18n.localize('SCENES.GridDistance')}
					<span class="units">(${game.i18n.localize('GridUnits')})</span>
				</label>
				<input type="number" value="${aura.distance ? aura.distance : ''}" step="any"
				       name="flags.token-auras.aura${idx + 1}.distance" min="0">
			</div>
			<div class="form-group">
				<label>${game.i18n.localize('SCENES.GridSquare')}</label>
				<input type="checkbox" name="flags.token-auras.aura${idx + 1}.square"
                       ${aura.square ? 'checked' : ''}>
			</div>
		`);

		nav.parent().find('footer').before($(`
			<div class="tab" data-tab="auras">
				${auraConfig[0]}
				<hr>
				${auraConfig[1]}
			</div>
		`));

		nav.parent()
			.find('.tab[data-tab="auras"] input[type="color"][data-edit]')
			.change(config._onChangeInput.bind(config));
	},

	uuid: function () {
		return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11)
			.replace(/[018]/g, c =>
				(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
	}
};

Hooks.on('renderTokenConfig', Auras.onConfigRender);
Hooks.on('canvasReady', () => canvas.tokens.placeables.forEach(t => {
	// Some systems have special classes for auras, if we can't add children then we're going
	// to use the token's children and thus don't need to force an initial draw.
	if (t.auras.addChildren) {
		t.draw();
	}
}));

Token.prototype.draw = (function () {
	const cached = Token.prototype.draw;
	return function () {
		const p = cached.apply(this, arguments);
		this.auras = this.addChildAt(new PIXI.Container(), 0);
		this.drawAuras();
		return p;
	};
})();

Token.prototype.drawAuras = function () {

	// Some systems have special classes for auras, if we can't removeChildren,
	// then use the token's children and make sure to only remove the ones we created

	if (this.auras.removeChildren) {
		this.auras.removeChildren().forEach(c => c.destroy());
	} else if (this.removeChildren) {
		this.children.forEach(c => {
			if (c.source === 'token-auras') {
				c.destroy();
			}
		});
	}

	const auras = Auras.getAllAuras(this.document).filter(a => {
		if (!a.distance) {
			return false;
		}

		if (!a.permission || a.permission === 'all' || (a.permission === 'gm' && game.user.isGM)) {
			return true;
		}

		return !!this.document?.actor?.testUserPermission(game.user, a.permission.toUpperCase());
	});

	if (auras.length) {
		const gfx = new PIXI.Graphics();

		// If we cannot create an aura as a child of the token through auras field,
		// then do it through direct token's children while keeping track of which children we created

		if (this.auras.addChild) {
			this.auras.addChild(gfx);
		} else if (this.addChild) {
			gfx.source = 'token-auras';
			this.addChild(gfx);
		}

		if (canvas.interface.reverseMaskfilter) {
			gfx.filters = [canvas.interface.reverseMaskfilter];
		}
		const squareGrid = canvas.scene.grid.type === 1;
		const dim = canvas.dimensions;
		const unit = dim.size / dim.distance;
		const [cx, cy] = [this.w / 2, this.h / 2];
		const {width, height} = this.document;

		auras.forEach(aura => {
			let w, h;

			if (aura.square) {
				w = aura.distance * 2 + (width * dim.distance);
				h = aura.distance * 2 + (height * dim.distance);
			} else {
				[w, h] = [aura.distance, aura.distance];

				if (squareGrid) {
					w += width * dim.distance / 2;
					h += height * dim.distance / 2;
				} else {
					w += (width - 1) * dim.distance / 2;
					h += (height - 1) * dim.distance / 2;
				}
			}

			w *= unit;
			h *= unit;
			gfx.beginFill(Color.from(aura.colour), aura.opacity);

			if (aura.square) {
				const [x, y] = [cx - w / 2, cy - h / 2];
				gfx.drawRect(x, y, w, h);
			} else {
				gfx.drawEllipse(cx, cy, w, h);
			}

			gfx.endFill();
		});
	}
};

Token.prototype._onUpdate = (function () {
	const cached = Token.prototype._onUpdate;
	return function (data) {
		cached.apply(this, arguments);
		const aurasUpdated =
			data.flags && data.flags['token-auras']
			&& ['aura1', 'aura2', 'auras']
				.some(k => typeof data.flags['token-auras'][k] === 'object');

		if (aurasUpdated) {
			this.drawAuras();
		}
	};
})();
