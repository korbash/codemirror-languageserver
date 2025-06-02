# CodeMirror 6 Language Server Plugin

A CodeMirror 6 extension that connects to any Language Server over WebSocket to provide:

- Auto-completion
- Hover tooltips
- Diagnostics and linting

## Installation

```bash
npm install github:korbash/codemirror-languageserver#full-python
```

## Usage

```js
import { EditorState, EditorView } from '@codemirror/basic-setup';
import { languageServer, setLogLevel } from 'codemirror-languageserver';
import { python } from '@codemirror/lang-python';

setLogLevel('DEBUG');

async function createEditor() {
    const lspExtension = await languageServer({
        serverUri: 'ws://localhost:3000',
        rootUri: 'file:///',
        documentUri: 'file:///script.py',
        languageId: 'python',
    });

    const view = new EditorView({
        state: EditorState.create({
            extensions: [python(), ...lspExtension],
        }),
        parent: document.body,
    });

    return view;
}

createEditor().catch(console.error);
```

## Error Handling

```js
async function createEditor() {
    try {
        const lspExtension = await languageServer({
            serverUri: 'ws://localhost:3000',
            rootUri: 'file:///',
            documentUri: 'file:///script.py',
            languageId: 'python',
        });

        return new EditorView({
            state: EditorState.create({
                extensions: [python(), ...lspExtension],
            }),
            parent: document.body,
        });
    } catch (error) {
        console.error('LSP failed:', error);
        
        return new EditorView({
            state: EditorState.create({
                extensions: [python()],
            }),
            parent: document.body,
        });
    }
}
```

## API

### `languageServer(options)`

Returns Promise that resolves when LSP is fully initialized.

### `languageServerWithTransport(options)`

Same as above but with custom transport.

### `getLanguageServerClient(view)`

Get LSP client from editor view for custom requests.

```js
import { getLanguageServerClient } from 'codemirror-languageserver';

const client = getLanguageServerClient(view);
if (client && client.ready) {
    const symbols = await client.sendRequest('textDocument/documentSymbol', params);
}
```

## Logging

```js
import { setLogLevel } from 'codemirror-languageserver';

setLogLevel('DEBUG'); // TRACE, DEBUG, INFO, WARN, ERROR, SILENT
```

## License

BSD-3-Clause