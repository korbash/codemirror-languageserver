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

## Request Cancellation

The library supports cancelling long-running LSP operations using both the standard LSP `$/cancelRequest` mechanism and browser `AbortSignal` API.

### Basic Cancellation

```js
import {
    getLanguageServerClient,
    createAbortControllerWithTimeout,
} from 'codemirror-languageserver';

const client = getLanguageServerClient(view);

// Cancel with timeout
const controller = createAbortControllerWithTimeout(5000);
try {
    const result = await client.textDocumentHover(
        {
            textDocument: { uri: 'file:///script.py' },
            position: { line: 5, character: 10 },
        },
        controller.signal,
    );
} catch (error) {
    if (error.code === -32800) {
        // RequestCancelled
        console.log('Request was cancelled');
    }
}

// Manual cancellation
const manualController = new AbortController();
setTimeout(() => manualController.abort(), 2000);

const completion = await client.textDocumentCompletion(
    {
        textDocument: { uri: 'file:///script.py' },
        position: { line: 10, character: 0 },
    },
    manualController.signal,
);
```

### Session-wide Cancellation

```js
// Create AbortController for entire LSP session
const sessionController = createAbortControllerWithTimeout(300000); // 5 minutes

const lspExtension = await languageServer({
    serverUri: 'ws://localhost:3000',
    rootUri: 'file:///',
    documentUri: 'file:///script.py',
    languageId: 'python',
    abortSignal: sessionController.signal,
});

// Or manual cancellation on page close
const manualController = new AbortController();
window.addEventListener('beforeunload', () => {
    manualController.abort();
});
```

### Managing Active Requests

```js
const client = getLanguageServerClient(view);

// Get all pending requests
const pendingRequests = client.getPendingRequests();
console.log(`Active requests: ${pendingRequests.size}`);

// Cancel specific request
await client.cancelRequest('req_123', 'User cancelled');

// Cancel all requests
for (const [id] of pendingRequests) {
    await client.cancelRequest(id, 'Bulk cancellation');
}
```

## API

### `languageServer(options)`

Returns Promise that resolves when LSP is fully initialized.

**Options:**

- `abortSignal?: AbortSignal` - Signal to cancel the entire LSP session

### `languageServerWithTransport(options)`

Same as above but with custom transport.

### `getLanguageServerClient(view)`

Get LSP client from editor view for custom requests.

```js
import { getLanguageServerClient } from 'codemirror-languageserver';

const client = getLanguageServerClient(view);
if (client && client.ready) {
    // Send request with cancellation support
    const controller = createAbortControllerWithTimeout(10000);
    const symbols = await client.sendRequest(
        'textDocument/documentSymbol',
        params,
        controller.signal,
    );
}
```

**Client Methods:**

- `textDocumentHover(params, abortSignal?)`
- `textDocumentCompletion(params, abortSignal?)`
- `sendRequest(method, params, abortSignal?)`
- `cancelRequest(requestId, reason?)`
- `getPendingRequests()`

## Timeout Management

All timeouts are managed through `AbortSignal`. The library does not use internal timeouts - all cancellation logic is controlled by the user:

```js
import {
    createAbortControllerWithTimeout,
    combineAbortSignals,
    RequestCancellation,
} from 'codemirror-languageserver';

// Different timeouts for different types of operations
const client = getLanguageServerClient(view);

// Fast operations - short timeout
const hoverResult = await client.textDocumentHover(
    params,
    createAbortControllerWithTimeout(3000).signal, // 3 seconds
);

// Auto-completion - medium timeout
const completion = await client.textDocumentCompletion(
    params,
    createAbortControllerWithTimeout(10000).signal, // 10 seconds
);

// Complex operations - long timeout
const symbols = await client.sendRequest(
    'textDocument/documentSymbol',
    params,
    createAbortControllerWithTimeout(30000).signal, // 30 seconds
);

// Combine multiple signals
const userController = new AbortController();
const timeoutController = createAbortControllerWithTimeout(30000);
const combined = combineAbortSignals(
    userController.signal,
    timeoutController.signal,
);
const result = await client.textDocumentHover(params, combined);

// Check if error is cancellation
if (RequestCancellation.isCancellationError(error)) {
    return null; // Ignore cancellation
}
```

### Smart Cancellation of Outdated Requests

```js
class HoverProvider {
    constructor() {
        this.currentController = null;
    }

    async provideHover(params) {
        // Cancel previous request
        this.currentController?.abort();

        // Create new one with timeout
        this.currentController = createAbortControllerWithTimeout(3000);

        try {
            const result = await client.textDocumentHover(
                params,
                this.currentController.signal,
            );
            return result;
        } finally {
            this.currentController = null;
        }
    }
}
```

## Timeout Principles

The library follows these principles for timeout management:

- **No internal timeouts**: The library does not impose any default timeouts
- **User-controlled**: All timeout logic is managed through `AbortSignal`
- **Flexible**: Different operations can have different timeout strategies
- **Composable**: Multiple signals can be combined using `combineAbortSignals`

```js
// If no AbortSignal is provided, operations run until completion or error
const result = await client.textDocumentHover(params); // No timeout

// User controls timeout per operation
const quickResult = await client.textDocumentHover(
    params,
    createAbortControllerWithTimeout(1000).signal,
);

// Session-wide timeout combined with operation-specific timeout
const sessionSignal = createAbortControllerWithTimeout(300000).signal;
const operationSignal = createAbortControllerWithTimeout(5000).signal;
const combined = combineAbortSignals(sessionSignal, operationSignal);
const result = await client.textDocumentCompletion(params, combined);
```

## Cancellation Utilities

## Logging

```js
import { setLogLevel } from 'codemirror-languageserver';

setLogLevel('DEBUG'); // TRACE, DEBUG, INFO, WARN, ERROR, SILENT
```

## License

BSD-3-Clause
