# zmk-keymap-editor

A personal, browser based editor for ZMK keymaps.

It is a fresh implementation, not a fork of [keymap-editor](https://github.com/nickcoutsos/keymap-editor),
but it borrows the good parts of it (the keycap grid, the searchable picker,
the behaviour parameter model) and replaces the parts that do not fit a real
repository:

| | upstream keymap-editor | this editor |
|---|---|---|
| Source of truth | `config/keymap.json` + `config/info.json` | the `.keymap` file itself |
| Local `#include "..."` | not supported | supported, resolved recursively |
| Custom behaviours | not seen (hardcoded list of 19) | discovered from the keymap |
| Macros, combos | not shown | listed in the sidebar |
| Saving | regenerates the file from a template, which drops combos, macros and custom behaviours | writes back only the bytes that changed |
| Keymaps per repo | the first `*.keymap` in `config/` | every keyboard in `config/keyboards.yaml` |
| Backend | Express server + GitHub App | none, plain HTTPS to api.github.com with a PAT |

## How it works

1. `config/keyboards.yaml` lists the keyboards and their keymaps.
2. The keymap file is fetched and parsed as devicetree with
   [tree-sitter-devicetree](https://github.com/joelspadin/tree-sitter-devicetree)
   (compiled to wasm, loaded by `web-tree-sitter`).
3. Local `#include "..."` files are fetched as well and parsed separately, so
   a shared behaviour library such as `config/lib/keymap-behaviors.dtsi` works.
4. Every binding keeps the byte range it came from, so an edit is a surgical
   replacement: comments, formatting and everything else stay untouched.
5. Saving commits the changed files with the git database API, so a keymap
   and the library it includes always land in the same commit.

## Using it

```bash
npm install
npm run dev      # http://localhost:5173
```

Then enter:

* **owner / repo / branch** of the repository, for example `vkhoilq/zmk-keyboards` on `main`
* a **token** with `Contents: Read and write` for that repository
  (a fine grained personal access token is enough)

Press **Load**, pick a keyboard and a layer, click a key and choose a new
binding. **Save** commits the change.

The token is kept in `localStorage` of the browser and is only ever sent to
`api.github.com`.

## The keyboard manifest

```yaml
# config/keyboards.yaml
corne:
  keymap: config/corne.keymap
  layout: corne_6col
sofle:
  keymap: config/sofle.keymap
  layout: sofle
```

`layout` refers to a physical layout bundled in `src/layouts/`. They are
generated from ZMK's own physical layout definitions, which are in the same
order as the keymap positions:

```bash
npm run gen:layouts   # src/layouts/*.json from ZMK
npm run gen:keycodes # src/zmk/keycodes.json from ZMK's dt-bindings
```

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` | type check and production build into `dist/` |
| `npm test` | unit tests (parser, patching, editing) |
| `npm run gen:layouts` | regenerate the physical layouts from ZMK |
| `npm run gen:keycodes` | regenerate the keycode list from ZMK |

### Live tests

The tests that talk to GitHub are opt in and only ever read:

```bash
GITHUB_TOKEN=$(gh auth token) npx vitest run test/github.live.test.ts test/pipeline.live.test.ts
```

They load the real repository, resolve the include, parse the keymap and
check that editing one binding keeps everything else intact.

## Deployment

The build output is a static site, so it can be hosted anywhere. The included
workflow publishes it to GitHub Pages.

## Credits

* The keycap grid, the picker and the general interaction model follow
  [keymap-editor](https://github.com/nickcoutsos/keymap-editor) by Nick
  Coutsos (MIT).
* The devicetree grammar is
  [tree-sitter-devicetree](https://github.com/joelspadin/tree-sitter-devicetree).
* Keycodes and physical layouts are generated from
  [ZMK](https://github.com/zmkfirmware/zmk).
