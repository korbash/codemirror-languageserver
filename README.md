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
import { getLanguageServerClient, createAbortControllerWithTimeout } from 'codemirror-languageserver';

const client = getLanguageServerClient(view);

// Cancel with timeout
const controller = createAbortControllerWithTimeout(5000);
try {
    const result = await client.textDocumentHover({
        textDocument: { uri: 'file:///script.py' },
        position: { line: 5, character: 10 }
    }, controller.signal);
} catch (error) {
    if (error.code === -32800) { // RequestCancelled
        console.log('Request was cancelled');
    }
}

// Manual cancellation
const manualController = new AbortController();
setTimeout(() => manualController.abort(), 2000);

const completion = await client.textDocumentCompletion({
    textDocument: { uri: 'file:///script.py' },
    position: { line: 10, character: 0 }
}, manualController.signal);
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
        controller.signal
    );
}
```

**Client Methods:**
- `textDocumentHover(params, abortSignal?)`
- `textDocumentCompletion(params, abortSignal?)`
- `sendRequest(method, params, abortSignal?)`
- `cancelRequest(requestId, reason?)`
- `getPendingRequests()`

## Cancellation Utilities

```js
import { 
    createAbortControllerWithTimeout,
    combineAbortSignals,
    RequestCancellation 
} from 'codemirror-languageserver';

// Auto-cancel after timeout
const controller = createAbortControllerWithTimeout(5000);

// Combine multiple signals
const combined = combineAbortSignals(userSignal, timeoutSignal);

// Check if error is cancellation
if (RequestCancellation.isCancellationError(error)) {
    return null; // Ignore cancellation
}

// Different timeouts for different operations
const hoverResult = await client.textDocumentHover(params, 
    createAbortControllerWithTimeout(3000).signal);
const completion = await client.textDocumentCompletion(params, 
    createAbortControllerWithTimeout(10000).signal);
```

## Logging

```js
import { setLogLevel } from 'codemirror-languageserver';

setLogLevel('DEBUG'); // TRACE, DEBUG, INFO, WARN, ERROR, SILENT
```

## License

BSD-3-Clause