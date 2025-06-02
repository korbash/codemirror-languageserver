# Logging System

The CodeMirror Language Server plugin includes a comprehensive logging system built on top of [loglevel](https://github.com/pimterry/loglevel) to help developers understand what's happening inside the plugin and debug issues.

## Overview

The logging system provides detailed information about:

- Language Server Client operations (connection, initialization, requests/responses)
- Plugin lifecycle events (creation, updates, destruction)
- Feature providers (hover, completion, diagnostics)
- Transport layer communications
- Performance metrics with timing information

## Log Levels

The following log levels are available (from most verbose to least):

- **TRACE**: Extremely detailed information, including method entry/exit and data transformations
- **DEBUG**: Detailed information about operations and state changes
- **INFO**: General information about significant events
- **WARN**: Warning messages about potentially problematic situations
- **ERROR**: Error messages for failed operations
- **SILENT**: Disables all logging

## Configuration

### Setting Log Level

```javascript
import { setLogLevel } from 'codemirror-languageserver';

// Set log level programmatically
setLogLevel('DEBUG');

// Get current log level
import { getLogLevel } from 'codemirror-languageserver';
console.log('Current log level:', getLogLevel());
```

### Browser Storage

The plugin automatically saves the log level to `localStorage` (if available) under the key `codemirror-languageserver-log-level`. This allows the log level to persist across browser sessions.

### Environment-Based Configuration

```javascript
// Enable debug logging in development
if (process.env.NODE_ENV === 'development') {
    setLogLevel('DEBUG');
} else {
    setLogLevel('WARN'); // Production default
}
```

### Complete Enable/Disable

```javascript
import { enableAll, disableAll } from 'codemirror-languageserver';

// Enable all logging (equivalent to TRACE level)
enableAll();

// Disable all logging (equivalent to SILENT level)
disableAll();
```

## Module-Specific Loggers

The logging system uses module prefixes to help identify the source of log messages:

- `[LSP-Client]`: Language Server Client operations
- `[LSP-Plugin]`: Main plugin lifecycle and coordination
- `[Transport]`: WebSocket and transport layer communications
- `[Completion]`: Code completion feature
- `[Hover]`: Hover tooltip feature
- `[Diagnostics]`: Error/warning diagnostics feature
- `[Features]`: General feature-related operations
- `[Utils]`: Utility functions and helpers

## Usage Examples

### Basic Setup

```javascript
import { EditorState, EditorView } from '@codemirror/basic-setup';
import { languageServer, setLogLevel } from 'codemirror-languageserver';
import { python } from '@codemirror/lang-python';

// Enable debug logging
setLogLevel('DEBUG');

const ls = languageServer({
    serverUri: 'ws://localhost:3000',
    rootUri: 'file:///',
    documentUri: 'file:///script.py',
    languageId: 'python',
});

const view = new EditorView({
    state: EditorState.create({
        extensions: [python(), ls],
    }),
    parent: document.body,
});
```

### Custom Logger for Your Code

```javascript
import { createLogger } from 'codemirror-languageserver';

const logger = createLogger('CUSTOM');

logger.info('My custom component initialized');
logger.debug('Processing data:', someData);
logger.error('Something went wrong:', error);
```

### Performance Monitoring

```javascript
import { logAsyncMethodCall, createLogger } from 'codemirror-languageserver';

const logger = createLogger('CUSTOM');

// Wrap async functions to log timing automatically
const timedFunction = logAsyncMethodCall(
    logger,
    'myAsyncOperation',
    async (data) => {
        // Your async operation here
        return processData(data);
    },
);

// Usage logs start time, end time, and duration automatically
await timedFunction(myData);
```

## Common Log Patterns

### Client Initialization

```
[LSP-Client] Creating LanguageServerClient {"rootUri":"file:///","autoClose":false,"hasTransport":true}
[LSP-Client] Starting LSP server initialization
[LSP-Client] Initialize result received {"capabilities":{...}}
[LSP-Client] LSP server initialization completed successfully
```

### Document Operations

```
[LSP-Plugin] Document changed {"newVersion":2,"docLength":150,"changeCount":1}
[LSP-Client] textDocumentDidChange called {"uri":"file:///script.py","version":2,"changesCount":1}
```

### Feature Requests

```
[LSP-Plugin] requestCompletion called {"position":{"line":5,"character":10},"triggerKind":1}
[COMPLETION] provideCompletion called {"uri":"file:///script.py","position":{"line":5,"character":10}}
[COMPLETION] Completion response received {"hasResult":true,"isArray":false}
[COMPLETION] Creating completion result {"itemsCount":15,"completionStart":85}
```

### Error Scenarios

```
[LSP-Client] WebSocket connection error: [Error details]
[LSP-Client] LSP server initialization failed: [Error details]
[HOVER] Hover request failed: [Error details]
```

## Debugging Tips

### Network Issues

Set log level to `DEBUG` and look for WebSocket connection messages:

```javascript
setLogLevel('DEBUG');
// Look for [LSP-Client] WebSocket connection opened/closed/error messages
```

### Completion Not Working

Enable `TRACE` level to see detailed completion flow:

```javascript
setLogLevel('TRACE');
// Type something and check for [COMPLETION] messages
```

### Server Capabilities

Check what features the server supports:

```javascript
setLogLevel('DEBUG');
// Look for "Server capabilities set" message after initialization
```

### Performance Issues

Use timing logs to identify slow operations:

```javascript
setLogLevel('DEBUG');
// Look for method timing in format: "methodName completed in XXXms"
```

## Production Considerations

### Log Level Management

```javascript
// Recommended production setup
const isDevelopment = process.env.NODE_ENV === 'development';
const isDebugMode = localStorage.getItem('debug-mode') === 'true';

if (isDevelopment || isDebugMode) {
    setLogLevel('DEBUG');
} else {
    setLogLevel('WARN'); // Only show warnings and errors
}
```

### Performance Impact

- `TRACE` and `DEBUG` levels can impact performance due to verbose logging
- `INFO` and above have minimal performance impact
- Consider using `WARN` or `ERROR` in production unless debugging

### Log Filtering

Use browser dev tools to filter logs by module:

```
// Show only client logs
[LSP-Client]

// Show only errors
ERROR

// Show completion-related logs
[COMPLETION]
```

## Troubleshooting

### Common Issues

1. **No logs appearing**: Check that log level is set above `SILENT`
2. **Too many logs**: Reduce log level from `TRACE`/`DEBUG` to `INFO` or `WARN`
3. **Missing module logs**: Ensure the feature is actually being used (e.g., hover requires hovering over code)

### Browser Console Commands

```javascript
// Quick debug commands for browser console
window.cmLSDebug = {
    setLevel: (level) => setLogLevel(level),
    getLevel: () => getLogLevel(),
    enableAll: () => enableAll(),
    disableAll: () => disableAll(),
};

// Usage: cmLSDebug.setLevel('DEBUG')
```

This logging system provides comprehensive visibility into the plugin's operation, making it easier to debug issues, understand performance characteristics, and monitor the health of Language Server connections.
