# Force Client Settings

Allows to force chosen settings for all clients to the defaults provided by the GM.

## Overview

This module adds a lock icons next to the client settings in the settings configuration app. Clicking these icons changes the behavior of the settings:

- "Unlocked" icons mean that the settings are free to be changed by the individual clients.
- "Locked" icons mean that the settings will be forced to those set by the GM.
- "Half-locked" icons mean that the settings will be defaulted to those set by the GM, however any client may optionally "unlock" these settings and adjust them if necessary.

This allows the GM to either force chosen critical settings to ensure they will not be altered, or "soft-force" other settings that the GM finds helpful to be set to new defaults, but still let the players alter them if they choose to.
The GM may also choose to either leave the forced settings visible, or hide all of them away from the clients, in order to reduce clutter, via a global setting.

![Example](https://gitlab.com/kimitsu_desu/force-client-settings/-/raw/main/example.jpg?inline=true)

## Current Limitations

- The clients may be required to refresh their browser before any alterations to the forced settings made by the GM will take effect.
- Neither the GM, nor any client with the permission to modify world settings, would be able to opt-out and individually alter any of the "soft-forced" settings.

## Compatibility and issues

#### Force Client Controls

- _Recomended:_ https://gitlab.com/kimitsu_desu/force-client-controls/

#### Module Management+

- _Fully compatible_

#### Tidy UI - Game Settings

- _Fully compatible_

#### Illandril's Tidy Module Settings

- _Annoyance:_ All settings sections will collapse when you click on a lock icon. This happens because Illandril's Tidy Module Settings does not store the state of collapsable sections between renderings.

#### DF Settings Clarity

- _Recent change:_ Force Client Settings no longer changes the actual scope of the settings, so the "Per World"/"Per Player" icons and tooltips provided by DF Settings Clarity would not change when you toggle the locks. The settings should still be forced properly.
- _Micro issue:_ Lock icons will not show up when you use this module's search bar. The changes to the settings will still be applied (or ignored) correctly.

#### SocketSettings by Blitz

- _Compatible_ Can be used to immediately apply forced settings to all connected clients.

### Troubleshooting

#### Migration to 2.0.0

There was an issue where not all settings were properly migrated from 1.0.x to 2.0.0. That was fixed in 2.0.1. If you've experienced the issue and wish to redo the migration, please enter the following into the console (F12) and refresh your browser:

`game.settings.set('force-client-settings', 'versionWorld', '1.0.0')`

#### Settings fail to be forced properly

Some settings may be loaded before Force Client Settings is initialized. These settings may not be properly forced for the clients. Force Client Settings will produce a warning in the console if such settings are attempted to be forced. If such situation happens, the following might help:

- Try prioritizing Force Client Settings to the top of the list in the libWrapper priority settings window.

#### Settings not meant to be forced

Forcing certain settings may result in unpredictable behavior, proceed on your own risk. This is unlikely to cause problems for the GM, so they may unlock the problematic settings at any time, however in a tiny chance that the GM would somehow be locked-out from the settings menu, the folowing might help:

- Launch the game as the GM and open the developer's tools (F12), go to console and type:
  `game.settings.set("force-client-settings", "forced", {})`
  This will unlock all settings for all clients.

If nothing helps, please file an issue to let me know of the problem!
https://gitlab.com/kimitsu_desu/force-client-settings/-/issues

## License

MIT License (c) 2021 kimitsu
