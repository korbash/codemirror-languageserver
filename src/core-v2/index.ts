/**
 * CodeMirror LSP Client - Core v2
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

// === Core Classes ===
export { LanguageServer } from './core/LanguageServer';
export { ConnectionManager } from './core/ConnectionManager';
export { RequestManager } from './core/RequestManager';
export { SubscriptionManager } from './core/SubscriptionManager';

// === Transport Layer ===
export { WebSocketMessageReader } from './transport/WebSocketMessageReader';
export { WebSocketMessageWriter } from './transport/WebSocketMessageWriter';

// === Types and Results ===
export * from './types';

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
} from 'vscode-languageserver-protocol';

// === Convenience Factory Functions ===

/**
 * Create a new LanguageServer instance
 */
export async function createLanguageServer(
    serverUri: string,
    options: import('./types').LanguageServerOptions,
): Promise<import('./core/LanguageServer').LanguageServer> {
    const { LanguageServer } = await import('./core/LanguageServer');
    return LanguageServer.create(serverUri, options);
}

/**
 * Create and initialize a LanguageServer instance
 */
export async function createAndInitializeLanguageServer(
    serverUri: string,
    options: import('./types').LanguageServerOptions,
    initParams?: Partial<
        import('vscode-languageserver-protocol').InitializeParams
    >,
): Promise<
    import('./types').LSPResult<import('./core/LanguageServer').LanguageServer>
> {
    const { LanguageServer } = await import('./core/LanguageServer');
    return LanguageServer.createAndInitialize(serverUri, options, initParams);
}

/**
 * Create a WebSocket-based connection manager
 */
export async function createConnectionManager(
    options: import('./core/ConnectionManager').ConnectionManagerOptions,
): Promise<import('./core/ConnectionManager').ConnectionManager> {
    const { ConnectionManager } = await import('./core/ConnectionManager');
    return new ConnectionManager(options);
}

// === Utility Functions ===

/**
 * Check if a value is an LSPResult
 */
export function isLSPResult<T>(
    value: unknown,
): value is import('./types').LSPResult<T> {
    return value instanceof Object && 'match' in value && 'isSuccess' in value;
}

/**
 * Wrap a Promise to return an LSPResult
 */
export function wrapPromiseAsLSPResult<T>(
    promise: Promise<T>,
): Promise<import('./types').LSPResult<T>> {
    const { LSPResult } = require('./types/LSPResult');
    return promise
        .then((result) => LSPResult.success(result))
        .catch((error) => {
            if (error && typeof error === 'object' && 'code' in error) {
                return LSPResult.fromResponseError(error);
            }
            return LSPResult.error(
                error instanceof Error ? error : new Error(String(error)),
            );
        });
}

/**
 * Create a subscription with automatic cleanup
 */
export function createManagedSubscription(
    cleanup: () => void,
    resource: string,
    method?: string,
): import('./types').Subscription {
    const { createSubscription } = require('./types/Subscription');
    return createSubscription(cleanup, resource, method);
}

// === Example Usage ===

/**
 * Example: Basic LSP client setup
 *
 * ```typescript
 * import { createAndInitializeLanguageServer, LSPResult } from 'codemirror-languageserver/core-v2';
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
 *   return serverResult.match({
 *     success: (server) => {
 *       console.log('LSP server ready!');
 *
 *       // Subscribe to diagnostics
 *       using diagnosticsSubscription = server.onDiagnostics((params) => {
 *         console.log('Diagnostics:', params.diagnostics);
 *       });
 *
 *       return server;
 *     },
 *     timeout: () => {
 *       console.error('LSP server initialization timed out');
 *       return null;
 *     },
 *     error: (error) => {
 *       console.error('LSP server initialization failed:', error);
 *       return null;
 *     },
 *     cancelled: () => {
 *       console.log('LSP server initialization was cancelled');
 *       return null;
 *     },
 *     connectionReset: () => {
 *       console.error('Connection lost during initialization');
 *       return null;
 *     }
 *   });
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
 *   });
 *
 *   completionResult.match({
 *     success: (completion) => {
 *       if (Array.isArray(completion)) {
 *         completion.forEach(item => console.log(item.label));
 *       } else if (completion) {
 *         completion.items.forEach(item => console.log(item.label));
 *       }
 *     },
 *     error: (error) => console.error('Completion failed:', error),
 *     timeout: () => console.warn('Completion timed out'),
 *     cancelled: () => console.log('Completion was cancelled'),
 *     connectionReset: () => console.error('Connection lost during completion')
 *   });
 * }
 * ```
 */

// === Version Information ===
export const VERSION = '2.0.0-alpha';
export const ARCHITECTURE = 'Zed + Microsoft LSP';

// === Development and Debugging ===
export { SubscriptionTracker } from './types/Subscription';

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
    const tracker =
        require('./types/Subscription').SubscriptionTracker.getInstance();
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
