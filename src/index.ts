/**
 * Minimal CodeMirror LSP Client
 *
 * Essential LSP client implementation with integrated WebSocket management.
 */

// === Core Classes ===
export { LanguageClient } from './core/LanguageClient.js';
export { RequestManager } from './core/RequestManager.js';

// === Transport Layer ===
export { WebSocketMessageReader } from './transport/WebSocketMessageReader.js';
export { WebSocketMessageWriter } from './transport/WebSocketMessageWriter.js';

// === Types ===
export * from './types/index.js';

// === RxJS Types ===
export type { Observable, BehaviorSubject, Subject } from 'rxjs';

// === Microsoft LSP Types (essential only) ===
export type {
    // Core protocol types
    InitializeParams,
    InitializeResult,
    ServerCapabilities,
    ClientCapabilities,

    // Common request types
    CompletionParams,
    CompletionList,
    CompletionItem,
    HoverParams,
    Hover,
    DefinitionParams,
    Definition,

    // Notification types
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    PublishDiagnosticsParams,

    // Utility types
    CancellationToken,
    Disposable,
} from 'vscode-languageserver-protocol';

export {
    // Error types
    ResponseError,
    LSPErrorCodes,
    ErrorCodes,
} from 'vscode-languageserver-protocol';

// === Convenience Factory Functions ===

/**
 * Create a LanguageClient instance (auto-connects on creation)
 */
export function createLanguageClient(
    options: import('./core/LanguageClient.js').LanguageClientOptions,
): import('./core/LanguageClient.js').LanguageClient {
    return new (require('./core/LanguageClient.js').LanguageClient)(options);
}

// === Version Information ===
export const VERSION = '2.0.0-ultra-minimal';
export const ARCHITECTURE = 'Auto-connecting WebSocket + Microsoft LSP';
