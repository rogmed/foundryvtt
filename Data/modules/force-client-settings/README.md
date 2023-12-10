# Force Client Settings

Allows to force chosen settings for all clients to the defaults provided by the GM.

## Overview

This module adds a lock icons next to the client settings in the settings configuration app. Clicking these icons changes the behavior of the settings:

- "Unlocked" icons mean that the settings are free to be changed by the individual clients.
- "Half-locked (with visible keyhole)" icons mean that the settings will be defaulted to those set by the GM, however any client may optionally "unlock" these settings and adjust them if necessary.
- "Locked (with no visible keyhole)" icons mean that the settings will be forced to those set by the GM and may not be changed by clients.

This allows the GM to either force chosen critical settings to ensure they will not be altered, or "soft-force" other settings that the GM finds helpful to be set to new defaults, but still let the players alter them if they choose to.
The GM may also choose to either leave the forced settings visible, or hide all of them away from the clients, in order to reduce clutter, via a global setting.

![Example](https://gitlab.com/kimitsu_desu/force-client-settings/-/raw/main/example.jpg?inline=true)

## Current Limitations

- The clients may be required to refresh their browser before any alterations to the forced settings made by the GM will take effect.
- The GM themselves may not opt-out and individually alter any of the "soft-forced" settings. That means whatever values the GM sets as "soft" defaults for other clients, they themselves must use these values.

## Compatibility and issues

#### Force Client Controls

- _Recomended:_ https://gitlab.com/kimitsu_desu/force-client-controls/

#### Module Management+

- _Fully compatible_

#### Tidy UI - Game Settings

- _Fully compatible_

#### Illandril's Tidy Module Settings

- _Fully compatible_

#### DF Settings Clarity

- _Issue:_ Lock icons will disappear when you use the settings filter.

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
