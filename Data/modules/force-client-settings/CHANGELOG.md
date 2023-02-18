# Force Client Settings

## Release 2.3.2

- Fix minor UI garbage

## Release 2.3.1

- Update for v10 compatibility

## Release 2.3.0

- Fix hidden forced settings not showing up for GM users
- Change only GM user is allowed to control the forced settings now

## Release 2.2.0

- Add Spanish translation (thanks https://gitlab.com/HonzoNebro)

## Release 2.1.0

- Add option to hide forced settings from clients

## Release 2.0.5

- Fix missing await when submitting form data

## Release 2.0.4

- Add unlisted settings only filter to the editor
- Add save all pending edits to the settings upon toggling a lock

## Release 2.0.3

- Add compatibility with Module Management+

## Release 2.0.2

- Fix internal settings storage visible in configuration app immediately after forcing
- Fix exception when forcing settings that were registered with incorrect scope
- Fix minor issues

## Release 2.0.1

- Fix migration not working properly
  Please enter the following into the console (F12) and refresh if you wish to redo the migration:
  ```game.settings.set('force-client-settings', 'versionWorld', '1.0.0')```
- Fix missing awaits in ClientSettings.prototype.set wrapper
- DF Settings Clarity icons and tooltips are no longer changed by Force Client Settings lock modes (the tooltip will always say "Per Player")

## Release 2.0.0

- Complete code rewrite
- Remove hacky method of forcing the client settings by altering their scope
- Add storing forced values for the client settings in separate world settings
- Add soft-force mode that allows clients to optionally unlock and alter the settings
- Add forced client settings editor that allows the GM to force certain unlisted settings

## Release 1.0.4

- Replace the unlock symbol with a more distinctly looking one

## Release 1.0.3

- Update documentation

## Release 1.0.2

- Fix settings saving issue

## Release 1.0.1

- Verified for Foundry VTT 0.8.9

## Release 1.0.0

- Initial Release
