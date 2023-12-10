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
			let i18n = `OWNERSHIP.${perm.toUpperCase()}`;
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
	},

	onRefreshToken: function (token) {
		if ( token.tokenAuras ) {
			const { x, y } = token.document;
			token.tokenAuras.position.set(x, y);
		}
	},

	onUpdateToken: function (token, data) {
		const aurasUpdated =
			data.flags?.['token-auras']
			&& ['aura1', 'aura2', 'auras'].some(k => typeof data.flags['token-auras'][k] === 'object');

		const hiddenUpdated = "hidden" in data;
		const sizeUpdated = "width" in data || "height" in data;

		if ( aurasUpdated || hiddenUpdated || sizeUpdated ) Auras.drawAuras(token.object);
	},

	drawAuras: function (token) {
		if ( token.tokenAuras?.removeChildren ) token.tokenAuras.removeChildren().forEach(c => c.destroy());
		if ( token.document.hidden && !game.user.isGM ) return;

		const auras = Auras.getAllAuras(token.document).filter(a => {
			if ( !a.distance || (a.permission === 'gm' && !game.user.isGM) ) return false;
			if ( !a.permission || a.permission === 'all' || (a.permission === 'gm' && game.user.isGM) ) return true;
			return !!token.document?.actor?.testUserPermission(game.user, a.permission.toUpperCase());
		});

		if ( !auras.length ) return;

		token.tokenAuras ??= canvas.grid.tokenAuras.addChild(new PIXI.Container());
		const gfx = token.tokenAuras.addChild(new PIXI.Graphics());
		const squareGrid = canvas.scene.grid.type === 1;
		const dim = canvas.dimensions;
		const unit = dim.size / dim.distance;
		const [cx, cy] = [token.w / 2, token.h / 2];
		const { width, height } = token.document;

		auras.forEach(aura => {
			let w, h;

			if ( aura.square ) {
				w = aura.distance * 2 + (width * dim.distance);
				h = aura.distance * 2 + (height * dim.distance);
			} else {
				[w, h] = [aura.distance, aura.distance];

				if ( squareGrid ) {
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

			if ( aura.square ) {
				const [x, y] = [cx - w / 2, cy - h / 2];
				gfx.drawRect(x, y, w, h);
			} else {
				gfx.drawEllipse(cx, cy, w, h);
			}

			gfx.endFill();
		});
	}
};

Hooks.on('renderTokenConfig', Auras.onConfigRender);
Hooks.on('drawToken', Auras.drawAuras);
Hooks.on('refreshToken', Auras.onRefreshToken);
Hooks.on('updateToken', Auras.onUpdateToken);
Hooks.on('drawGridLayer', layer => {
	layer.tokenAuras = layer.addChildAt(new PIXI.Container(), layer.getChildIndex(layer.borders));
});
Hooks.on('destroyToken', token => token.tokenAuras?.destroy());
