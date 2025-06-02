# CodeMirror 6 Language Server Plugin (Full Python)

A CodeMirror 6 extension that connects to any Language Server over WebSocket to provide full Python support:

- Auto-completion
- Hover tooltips
- Diagnostics and linting

## Installation

Install directly from the GitHub branch:

```bash
npm install github:korbash/codemirror-languageserver#full-python
```

## Usage

```js
import { EditorState, EditorView } from '@codemirror/basic-setup';
import {
    languageServer,
    LanguageServerClient,
} from 'codemirror-languageserver';
import { WebSocketTransport } from '@open-rpc/client-js';
import { python } from '@codemirror/lang-python';

// Configure the Language Server plugin for Python
const options = {
    serverUri: 'ws://localhost:3000',
    rootUri: 'file:///',
    documentUri: 'file:///path/to/script.py',
    languageId: 'python',
    // Optional: reuse a client across editors
    // client: new LanguageServerClient({ serverUri, rootUri })
};
const ls = languageServer(options);

// Create the editor
const view = new EditorView({
    state: EditorState.create({
        extensions: [python(), ls],
    }),
    parent: document.body,
});
```

## Features

- Hover tooltips via `hoverTooltip`
- Inline completions via `autocompletion`
- Real-time diagnostics via `linter`

## Exports

- `languageServer(options)`
- `languageServerWithTransport(options)`
- `LanguageServerClient`
- Facets: `client`, `documentUri`, `languageId`
- Providers: `DefaultHoverProvider`, `DefaultCompletionProvider`, `DefaultDiagnosticsProvider`
- Plugin: `LanguageServerPlugin`

## License

BSD-3-Clause
