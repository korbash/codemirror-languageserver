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
    setLogLevel,
} from 'codemirror-languageserver';
import { WebSocketTransport } from '@open-rpc/client-js';
import { python } from '@codemirror/lang-python';

// Optional: Enable debug logging
setLogLevel('DEBUG');

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

## Logging and Debugging

The plugin includes a comprehensive logging system to help with development and debugging:

```js
import {
    setLogLevel,
    getLogLevel,
    createLogger,
} from 'codemirror-languageserver';

// Set log level (TRACE, DEBUG, INFO, WARN, ERROR, SILENT)
setLogLevel('DEBUG');

// Get current log level
console.log('Current level:', getLogLevel());

// Create custom logger for your code
const logger = createLogger('CUSTOM');
logger.info('My component initialized');
```

### Available Log Levels

- **TRACE**: Extremely detailed information (performance impact)
- **DEBUG**: Detailed operational information
- **INFO**: General information about significant events
- **WARN**: Warning messages (production default)
- **ERROR**: Error messages only
- **SILENT**: No logging

### Module Prefixes

Logs are prefixed by module for easy filtering:

- `[LSP-Client]`: Language server client operations
- `[LSP-Plugin]`: Plugin lifecycle and coordination
- `[Completion]`: Code completion feature
- `[Hover]`: Hover tooltip feature
- `[Diagnostics]`: Error/warning diagnostics

For detailed logging documentation, see [docs/logging.md](docs/logging.md).

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
