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

In Nova, choose **Extensions → Extension Library**, search for **Package Peek**, and click **Install**.

## Notes

- Package information is cached for 10 minutes.
- The extension uses the public npm registry and does not read npm authentication tokens, so private packages are not supported.
- Changes are applied to the open editor buffer and are undoable; the extension does not save the file automatically.

## Privacy

Package Peek sends the package name under the pointer to `registry.npmjs.org` and `api.npmjs.org` to retrieve public package metadata and download counts. It does not collect telemetry, read npm authentication tokens, or send the contents of `package.json`.

## Disclaimer

Package Peek is an independent project and is not affiliated with, endorsed by, or sponsored by npm or its owners. All product names and trademarks belong to their respective owners.
