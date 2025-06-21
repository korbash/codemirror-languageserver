# LSP Error Codes Reference

This document explains the error codes used in the CodeMirror Language Server extension and their origins.

## Overview

The Language Server Protocol (LSP) error handling system is built on top of JSON-RPC 2.0, which defines a standardized error code system. Our implementation uses two main categories of error codes:

1. **JSON-RPC 2.0 Standard Codes** (`ErrorCodes`) - Universal RPC protocol errors
2. **LSP-Specific Codes** (`LSPErrorCodes`) - Language Server Protocol specific errors

## Error Code Hierarchy

### JSON-RPC 2.0 Standard Error Codes (`ErrorCodes`)

These codes are defined by the [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification) and are used across all JSON-RPC implementations, not just LSP.

| Code             | Constant                    | Description                                  |
| ---------------- | --------------------------- | -------------------------------------------- |
| -32700           | `ErrorCodes.ParseError`     | Invalid JSON was received by the server      |
| -32600           | `ErrorCodes.InvalidRequest` | The JSON sent is not a valid Request object  |
| -32601           | `ErrorCodes.MethodNotFound` | The method does not exist / is not available |
| -32602           | `ErrorCodes.InvalidParams`  | Invalid method parameter(s)                  |
| -32603           | `ErrorCodes.InternalError`  | Internal JSON-RPC error                      |
| -32099 to -32000 | Reserved range              | Implementation-defined server errors         |

**Additional Microsoft Implementation Codes:**
| Code | Constant | Description |
|------|----------|-------------|
| -32002 | `ErrorCodes.ServerNotInitialized` | Server not initialized |
| -32001 | `ErrorCodes.UnknownErrorCode` | Unknown error code |
| -32099 | `ErrorCodes.MessageWriteError` | Message write error |
| -32098 | `ErrorCodes.MessageReadError` | Message read error |
| -32097 | `ErrorCodes.PendingResponseRejected` | Pending response rejected |
| -32096 | `ErrorCodes.ConnectionInactive` | Connection inactive |

### LSP-Specific Error Codes (`LSPErrorCodes`)

These codes are specific to the Language Server Protocol and are defined by Microsoft's `vscode-languageserver-protocol`.

| Code   | Constant                         | Description                                      |
| ------ | -------------------------------- | ------------------------------------------------ |
| -32800 | `LSPErrorCodes.RequestCancelled` | Request was cancelled by the client              |
| -32801 | `LSPErrorCodes.ContentModified`  | Content was modified, making the request invalid |
| -32802 | `LSPErrorCodes.ServerCancelled`  | Request was cancelled by the server              |
| -32803 | `LSPErrorCodes.RequestFailed`    | Request failed to execute                        |

**Reserved Range:** -32899 to -32800 (LSP reserved error range)

## Why Two Different Systems?

### Historical Context

1. **JSON-RPC 2.0 (2010)** - Established the foundation protocol with standard error codes for common RPC scenarios
2. **Language Server Protocol (2016)** - Microsoft extended JSON-RPC with domain-specific error codes for language services

### Different Purposes

**JSON-RPC Codes (`ErrorCodes`)** handle:

- Protocol-level errors (malformed JSON, invalid requests)
- Transport-level errors (connection issues, serialization problems)
- Generic RPC errors (method not found, invalid parameters)

**LSP Codes (`LSPErrorCodes`)** handle:

- Language service specific scenarios (content modification during processing)
- Request lifecycle management (client/server cancellation)
- LSP workflow errors (initialization failures, capability mismatches)

## Usage in Our Implementation

### Error Conversion Process

```typescript
// Raw ResponseError from LSP server
const responseError = new ResponseError(-32601, 'Method not found');

// Converted to our enhanced LSPError
const lspError = convertResponseError(responseError, 'textDocument/hover');

// Now has both standard Error interface AND LSP-specific information
console.log(lspError.message); // "Method not found"
console.log(lspError.code); // -32601
console.log(lspError.getErrorType()); // "Method Not Found"
console.log(lspError.method); // "textDocument/hover"
```

### Error Type Recognition

```typescript
function handleLSPError(error: Error) {
    if (isLSPError(error)) {
        // Has LSP-specific properties
        switch (error.code) {
            case ErrorCodes.MethodNotFound:
                return "This LSP server doesn't support this feature";
            case LSPErrorCodes.RequestCancelled:
                return 'Request was cancelled';
            case ErrorCodes.ServerNotInitialized:
                return 'Server needs to be initialized first';
        }
    }

    // Fallback for regular errors
    return error.message;
}
```

### Retry Logic

Different error codes have different retry behaviors:

```typescript
function shouldRetryRequest(error: Error): boolean {
    if (isLSPError(error)) {
        // Never retry these LSP/JSON-RPC errors
        const noRetryErrors = [
            LSPErrorCodes.RequestCancelled, // Client cancelled
            LSPErrorCodes.ServerCancelled, // Server cancelled
            ErrorCodes.MethodNotFound, // Method doesn't exist
            ErrorCodes.InvalidParams, // Bad parameters
            ErrorCodes.ServerNotInitialized, // Server state issue
        ];

        return !noRetryErrors.includes(error.code);
    }

    // Regular JavaScript errors - check message
    return !error.message.toLowerCase().includes('cancel');
}
```

## Error Code Ranges Summary

| Range            | Purpose                         | Examples                       |
| ---------------- | ------------------------------- | ------------------------------ |
| -32768 to -32000 | JSON-RPC 2.0 reserved           | Parse errors, invalid requests |
| -32099 to -32000 | JSON-RPC implementation-defined | Microsoft's connection errors  |
| -32899 to -32800 | LSP reserved range              | LSP-specific errors            |
| 1 to ∞           | Application-specific            | Custom application errors      |

## Best Practices

### When to Use Each Type

**Use `ErrorCodes` constants for:**

- JSON/RPC protocol violations
- Method availability issues
- Parameter validation errors
- Server state problems

**Use `LSPErrorCodes` constants for:**

- Request cancellation scenarios
- Content modification during processing
- LSP-specific workflow errors

**Use raw numbers for:**

- Custom application-specific errors (positive numbers)
- Vendor-specific extensions (documented ranges)

### Error Message Design

```typescript
// Good: Specific, actionable error messages
const error = new LSPError(
    'Method "textDocument/semanticTokens" not supported by Python LSP server',
    ErrorCodes.MethodNotFound,
    { supportedMethods: ['textDocument/completion', 'textDocument/hover'] },
    'textDocument/semanticTokens',
);

// Bad: Generic, unhelpful message
const error = new LSPError('Error occurred', ErrorCodes.InternalError);
```

## Migration Guide

If you're updating from the old dual-error system:

### Before (ResponseError + Error)

```typescript
if (error instanceof ResponseError) {
    switch (error.code) {
        case LSPErrorCodes.RequestCancelled:
            return LSPResult.cancelled(error.message);
        // Handle LSP errors...
    }
} else if (error instanceof Error) {
    // Handle JavaScript errors...
}
```

### After (Unified Error with LSPError)

```typescript
const normalizedError = normalizeError(error, methodName);
if (isLSPError(normalizedError)) {
    if (normalizedError.isCancellation()) {
        return LSPResult.cancelled(normalizedError.message);
    }
    // Handle all errors uniformly...
}
```

## References

- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [Microsoft vscode-languageserver-protocol](https://github.com/microsoft/vscode-languageserver-node)
