# Package Peek

Package Peek adds npm package information to Nova while you edit `package.json`.

## Features

- Hover a dependency name or version to see:
  - the latest npm release
  - the version currently in `package.json`
  - description, weekly downloads, license, Node requirement, and maintainer
  - npm, homepage, and repository links when available
- Use Nova's code-action lightbulb to replace the version with the latest release.
- Or place the cursor on a dependency line and choose **Editor → Update Package Under Cursor to Latest**.
- Keeps a leading `^` or `~` when updating. Other registry version ranges become the exact latest version.
- Leaves workspace, local, Git, URL, and npm-alias specs unchanged.

Supported sections are `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`.

## Requirements

- Nova 10 or newer
- Node.js available on the environment `PATH` Nova receives from your login shell
- Network access to `registry.npmjs.org` and `api.npmjs.org`

## Install

Double-click the **Package Peek.novaextension** bundle and confirm installation in Nova.

For development, open the bundle as a Nova project and choose **Extensions → Activate Project as Extension**.

## Notes

- Package information is cached for 10 minutes.
- The extension uses the public npm registry and does not read npm authentication tokens, so private packages are not supported.
- Changes are applied to the open editor buffer and are undoable; the extension does not save the file automatically.

## Privacy

Package Peek sends the package name under the pointer to `registry.npmjs.org` and `api.npmjs.org` to retrieve public package metadata and download counts. It does not collect telemetry, read npm authentication tokens, or send the contents of `package.json`.

## Troubleshooting

If hover information does not appear:

1. Confirm the file is named `package.json` and uses Nova's JSON syntax.
2. Confirm Node.js is available in Nova's environment.
3. Close and reopen `package.json` after installing or updating the extension.
4. Check Nova's Extension Console for messages from Package Peek.
