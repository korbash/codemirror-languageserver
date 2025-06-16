/**
 * Type definitions for the LSP client.
 *
 * This module re-exports all Microsoft vscode-languageserver-protocol types
 * and adds our Zed-style extensions for better developer experience.
 */

// === Microsoft LSP Types (complete re-export) ===
export * from 'vscode-languageserver-protocol';

// === Our Extensions ===
export * from './LSPResult';
export * from './Subscription';

// === Convenience type aliases ===
import type {
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
    InitializeParams,
    InitializeResult,
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    PublishDiagnosticsParams,
    CancellationToken,
    MessageReader,
    MessageWriter,
    NotificationType,
    RequestType,
    ProtocolRequestType,
    ProtocolNotificationType,
} from 'vscode-languageserver-protocol';

import type { LSPResult, LSPResultPromise } from './LSPResult';
import type { Subscription, CompositeSubscription } from './Subscription';

// === Handler Types ===
export type NotificationHandler<T> = (params: T) => void | Promise<void>;
export type RequestHandler<P, R> = (params: P) => R | Promise<R>;
export type ProgressHandler = (params: any) => void;

// === Request/Response Type Map ===
export interface LSPRequestMap {
    initialize: [InitializeParams, InitializeResult];
    'textDocument/completion': [
        CompletionParams,
        CompletionList | CompletionItem[] | null,
    ];
    'textDocument/hover': [HoverParams, Hover | null];
    'textDocument/definition': [DefinitionParams, Definition | null];
    'textDocument/references': [ReferenceParams, Location[] | null];
    'textDocument/documentSymbol': [
        DocumentSymbolParams,
        DocumentSymbol[] | SymbolInformation[] | null,
    ];
}

// === Notification Type Map ===
export interface LSPNotificationMap {
    'textDocument/didOpen': DidOpenTextDocumentParams;
    'textDocument/didChange': DidChangeTextDocumentParams;
    'textDocument/didClose': DidCloseTextDocumentParams;
    'textDocument/publishDiagnostics': PublishDiagnosticsParams;
    '$/progress': any;
}

// === Options Types ===
export interface RequestOptions {
    timeout?: number;
    cancellationToken?: CancellationToken;
    retries?: number;
}

export interface LanguageServerOptions {
    name: string;
    rootUri: string | null;
    workspaceFolders?: string[];
    initializationOptions?: any;

    // Request options
    request?: {
        timeout?: number;
        retries?: number;
    };

    // Connection options
    connection?: {
        reconnectAttempts?: number;
        reconnectDelay?: number;
    };

    // Logging options
    logging?: {
        level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
        prefix?: string;
    };
}

// === Transport Types ===
export interface Transport {
    send(message: string): Promise<void>;
    onMessage(handler: (message: string) => void): Subscription;
    onError(handler: (error: Error) => void): Subscription;
    onClose(handler: () => void): Subscription;
    close(): Promise<void>;
    isConnected(): boolean;
}

// === Server State ===
export enum ServerState {
    Initial = 'initial',
    Connecting = 'connecting',
    Initializing = 'initializing',
    Running = 'running',
    Stopping = 'stopping',
    Stopped = 'stopped',
    Error = 'error',
}

// === Performance Monitoring ===
export interface PerformanceMetrics {
    method: string;
    duration: number;
    timestamp: number;
    success: boolean;
    error?: string;
}

// === Error Types ===
export interface LSPError {
    code: number;
    message: string;
    data?: any;
    method?: string;
    timestamp: number;
}

// === Type Guards ===
export function isLSPResult<T>(value: unknown): value is LSPResult<T> {
    return value instanceof Object && 'match' in value && 'isSuccess' in value;
}

export function isSubscription(value: unknown): value is Subscription {
    return value instanceof Object && 'dispose' in value && 'isActive' in value;
}

// === Utility Types ===
export type LSPMethod = keyof LSPRequestMap;
export type LSPNotificationMethod = keyof LSPNotificationMap;

export type ExtractParams<T extends LSPMethod> = LSPRequestMap[T][0];
export type ExtractResult<T extends LSPMethod> = LSPRequestMap[T][1];

export type ExtractNotificationParams<T extends LSPNotificationMethod> =
    LSPNotificationMap[T];

// === Advanced Types ===
export interface TypedConnection {
    sendTypedRequest<K extends LSPMethod>(
        method: K,
        params: ExtractParams<K>,
        token?: CancellationToken,
    ): Promise<ExtractResult<K>>;

    onTypedNotification<K extends LSPNotificationMethod>(
        method: K,
        handler: NotificationHandler<ExtractNotificationParams<K>>,
    ): Subscription;
}
