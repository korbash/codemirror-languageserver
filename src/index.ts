/**
 * CodeMirror LSP Client
 *
 * Modern LSP client implementation combining Microsoft's vscode-languageserver-protocol
 * with Zed-style architecture for better performance, type safety, and developer experience.
 *
 * This module provides:
 * - Type-safe LSP operations with comprehensive error handling
 * - RAII-style resource management with automatic cleanup
 * - Performance monitoring and request/response tracking
 * - WebSocket transport optimized for browser environments
 * - Full integration with Microsoft's LSP infrastructure
 */

// === Import ErrorConverter utilities ===
import { LSPError } from './types/ErrorConverter.js';
import { ErrorCodes } from 'vscode-languageserver-protocol';

// === Core Classes ===
export { LanguageServer } from './core/LanguageServer.js';
export { ConnectionManager } from './core/ConnectionManager.js';
export { RequestManager } from './core/RequestManager.js';
export { SubscriptionManager } from './core/SubscriptionManager.js';

// === Transport Layer ===
export { WebSocketMessageReader } from './transport/WebSocketMessageReader.js';
export { WebSocketMessageWriter } from './transport/WebSocketMessageWriter.js';

// === Types and Results ===
export * from './types/index.js';

// === Internal imports for factory functions ===
import { LanguageServer } from './core/LanguageServer.js';
import { ConnectionManager } from './core/ConnectionManager.js';
import { Result, Ok, Err, AsyncResult } from 'ts-results-es';
import { createSubscription } from './types/Subscription.js';
import { SubscriptionTracker } from './types/Subscription.js';

// === Microsoft LSP Types (re-exported for convenience) ===
export {
    // Core protocol types
    InitializeParams,
    InitializeResult,
    ServerCapabilities,
    ClientCapabilities,

    // Request types
    CompletionParams,
    CompletionList,
    CompletionItem,
    HoverParams,
    Hover,
    DefinitionParams,
    Definition,
    ReferenceParams,
    Location,
    DocumentSymbolParams,
    DocumentSymbol,
    SymbolInformation,

    // Notification types
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    DidSaveTextDocumentParams,
    PublishDiagnosticsParams,
    ShowMessageParams,
    LogMessageParams,

    // Request/Notification type constants
    InitializeRequest,
    CompletionRequest,
    HoverRequest,
    DefinitionRequest,
    ReferencesRequest,
    DocumentSymbolRequest,
    DidOpenTextDocumentNotification,
    DidChangeTextDocumentNotification,
    DidCloseTextDocumentNotification,
    DidSaveTextDocumentNotification,
    PublishDiagnosticsNotification,
    ShowMessageNotification,
    LogMessageNotification,

    // Error types
    ResponseError,
    LSPErrorCodes,

    // Utility types
    CancellationToken,
    CancellationTokenSource,
    Disposable,
    MessageType,
    DiagnosticSeverity,
    CompletionItemKind,
    SymbolKind,
    ErrorCodes,
} from 'vscode-languageserver-protocol';

// === Error Handling Utilities ===
export { LSPError };

// === Convenience Factory Functions ===

/**
 * Create a new LanguageServer instance
 */
export async function createLanguageServer(
    serverUri: string,
    options: import('./types').LanguageServerOptions,
): Promise<import('./core/LanguageServer').LanguageServer> {
    return LanguageServer.create(serverUri, options);
}

/**
 * Create and initialize a LanguageServer instance
 */
export function createAndInitializeLanguageServer(
    serverUri: string,
    options: import('./types').LanguageServerOptions,
    initParams?: Partial<
        import('vscode-languageserver-protocol').InitializeParams
    >,
): AsyncResult<
    import('./core/LanguageServer').LanguageServer,
    import('./types').LSPError[]
> {
    return LanguageServer.createAndInitialize(serverUri, options, initParams);
}

/**
 * Create a WebSocket-based connection manager
 */
export function createConnectionManager(
    options: import('./core/ConnectionManager').ConnectionManagerOptions,
): import('./core/ConnectionManager').ConnectionManager {
    return new ConnectionManager(options);
}

// === Utility Functions ===

/**
 * Check if a value is a Result
 */
export function isResult<T, E>(value: unknown): value is Result<T, E> {
    return value instanceof Object && 'isOk' in value && 'isErr' in value;
}

/**
 * Wrap a Promise to return AsyncResult
 */
export function wrapPromiseAsAsyncResult<T>(
    promise: Promise<T>,
): AsyncResult<T, import('./types').LSPError[]> {
    const resultPromise = promise
        .then((result) => Ok(result))
        .catch((error) => {
            const lspError =
                error instanceof LSPError
                    ? error
                    : new LSPError(
                          error instanceof Error
                              ? error.message
                              : String(error),
                          ErrorCodes.InternalError,
                          'wrapPromiseAsAsyncResult',
                      );
            return Err([lspError]);
        });
    return new AsyncResult(resultPromise);
}

/**
 * Create a subscription with automatic cleanup
 */
export function createManagedSubscription(
    cleanup: () => void,
    resource: string,
    method?: string,
): import('./types').Subscription {
    return createSubscription(cleanup, resource, method);
}

// === Example Usage ===

/**
 * Example: Basic LSP client setup
 *
 * ```typescript
 * import { createAndInitializeLanguageServer, LSPResult } from 'codemirror-languageserver';
 *
 * async function setupLSP() {
 *   const serverResult = await createAndInitializeLanguageServer(
 *     'ws://localhost:3000',
 *     {
 *       name: 'TypeScript LSP',
 *       rootUri: 'file:///workspace',
 *       logging: { level: 'info' }
 *     }
 *   );
 *
 *   const result = await serverResult.promise;
 *   if (result.isOk()) {
 *     const server = result.unwrap();
 *     console.log('LSP server ready!');
 *
 *     // Subscribe to diagnostics
 *     using diagnosticsSubscription = server.onDiagnostics((params) => {
 *       console.log('Diagnostics:', params.diagnostics);
 *     });
 *
 *     return server;
 *   } else {
 *     const errors = result.unwrapErr();
 *     console.error('LSP server initialization failed:', errors);
 *     return null;
 *   }
 * }
 *
 * // Usage with CodeMirror
 * async function setupCodeMirrorWithLSP() {
 *   const server = await setupLSP();
 *   if (!server) return;
 *
 *   // Send completion request
 *   const completionResult = await server.completion({
 *     textDocument: { uri: 'file:///workspace/test.ts' },
 *     position: { line: 10, character: 5 }
 *   }).promise;
 *
 *   if (completionResult.isOk()) {
 *     const completion = completionResult.unwrap();
 *     if (Array.isArray(completion)) {
 *       completion.forEach(item => console.log(item.label));
 *     } else if (completion) {
 *       completion.items.forEach(item => console.log(item.label));
 *     }
 *   } else {
 *     const errors = completionResult.unwrapErr();
 *     console.error('Completion failed:', errors);
 *   }
 * }
 * ```
 */

// === Version Information ===
export const VERSION = '2.0.0-alpha';
export const ARCHITECTURE = 'Zed + Microsoft LSP';

// === Development and Debugging ===
export { SubscriptionTracker } from './types/Subscription.js';

/**
 * Enable debug mode for all components
 */
export function enableDebugMode(): void {
    if (typeof window !== 'undefined') {
        (window as any).__LSP_DEBUG__ = true;
    } else if (typeof global !== 'undefined') {
        (global as any).__LSP_DEBUG__ = true;
    }
}

/**
 * Get debug information about the LSP client
 */
export function getDebugInfo(): {
    version: string;
    architecture: string;
    subscriptionTracker: {
        activeCount: number;
        resourceCount: number;
        report: Record<string, number>;
    };
} {
    const tracker = SubscriptionTracker.getInstance();
    return {
        version: VERSION,
        architecture: ARCHITECTURE,
        subscriptionTracker: {
            activeCount: tracker.getActiveCount(),
            resourceCount: tracker.getResourceCount(),
            report: tracker.getReport(),
        },
    };
}
