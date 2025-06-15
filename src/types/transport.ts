import * as LSP from 'vscode-languageserver-protocol';
import { CancellationToken, Disposable } from 'vscode-jsonrpc';

/**
 * Basic transport interface for LSP communication
 */
export interface Transport {
    /**
     * Connect to the LSP server
     */
    connect(abortSignal?: AbortSignal): Promise<void>;

    /**
     * Close the transport connection
     */
    close(): void;

    /**
     * Check if transport is connected
     */
    readonly isConnected: boolean;

    /**
     * Check if there are pending responses
     */
    hasPendingResponse(): boolean;
}

/**
 * Extended LSP transport interface with typed LSP methods
 */
export interface LSPTransport extends Transport {
    // ===== LSP REQUEST METHODS =====

    initialize(
        params: LSP.InitializeParams,
        token?: CancellationToken,
    ): Promise<LSP.InitializeResult>;
    textDocumentHover(
        params: LSP.HoverParams,
        token?: CancellationToken,
    ): Promise<LSP.Hover | null>;
    textDocumentCompletion(
        params: LSP.CompletionParams,
        token?: CancellationToken,
    ): Promise<LSP.CompletionItem[] | LSP.CompletionList | null>;
    textDocumentDefinition(
        params: LSP.DefinitionParams,
        token?: CancellationToken,
    ): Promise<LSP.Definition | null>;
    textDocumentReferences(
        params: LSP.ReferenceParams,
        token?: CancellationToken,
    ): Promise<LSP.Location[] | null>;
    textDocumentDocumentSymbol(
        params: LSP.DocumentSymbolParams,
        token?: CancellationToken,
    ): Promise<LSP.DocumentSymbol[] | LSP.SymbolInformation[] | null>;
    textDocumentFormatting(
        params: LSP.DocumentFormattingParams,
        token?: CancellationToken,
    ): Promise<LSP.TextEdit[] | null>;
    textDocumentCodeAction(
        params: LSP.CodeActionParams,
        token?: CancellationToken,
    ): Promise<(LSP.Command | LSP.CodeAction)[] | null>;
    workspaceSymbol(
        params: LSP.WorkspaceSymbolParams,
        token?: CancellationToken,
    ): Promise<LSP.SymbolInformation[] | LSP.WorkspaceSymbol[] | null>;
    shutdown(token?: CancellationToken): Promise<void>;

    // ===== LSP NOTIFICATION METHODS =====

    initialized(params: LSP.InitializedParams): Promise<void>;
    textDocumentDidOpen(params: LSP.DidOpenTextDocumentParams): Promise<void>;
    textDocumentDidChange(
        params: LSP.DidChangeTextDocumentParams,
    ): Promise<void>;
    textDocumentDidSave(params: LSP.DidSaveTextDocumentParams): Promise<void>;
    textDocumentDidClose(params: LSP.DidCloseTextDocumentParams): Promise<void>;
    workspaceDidChangeConfiguration(
        params: LSP.DidChangeConfigurationParams,
    ): Promise<void>;
    exit(): Promise<void>;

    // ===== EVENT HANDLERS =====

    onPublishDiagnostics(
        handler: (params: LSP.PublishDiagnosticsParams) => void,
    ): Disposable;
    onShowMessage(handler: (params: LSP.ShowMessageParams) => void): Disposable;
    onLogMessage(handler: (params: LSP.LogMessageParams) => void): Disposable;
    onConfiguration(
        handler: (params: LSP.ConfigurationParams) => Promise<any[]> | any[],
    ): Disposable;
    onWorkspaceFolders(
        handler: () =>
            | Promise<LSP.WorkspaceFolder[] | null>
            | LSP.WorkspaceFolder[]
            | null,
    ): Disposable;
    onRegisterCapability(
        handler: (params: LSP.RegistrationParams) => Promise<void> | void,
    ): Disposable;
    onError(handler: (error: Error) => void): Disposable;
    onClose(handler: () => void): Disposable;

    // ===== GENERIC METHODS =====

    sendRequest<P, R>(
        method: string,
        params: P,
        token?: CancellationToken,
    ): Promise<R>;
    sendNotification(method: string, params?: any): Promise<void>;
    onRequest<P, R>(
        method: string,
        handler: (params: P) => Promise<R> | R,
    ): Disposable;
    onNotification<P>(method: string, handler: (params: P) => void): Disposable;

    // ===== UTILITY METHODS =====

    createCancellationToken(): import('vscode-jsonrpc').CancellationTokenSource;
}

/**
 * Transport configuration options
 */
export interface TransportOptions {
    /**
     * AbortSignal to cancel the entire transport session
     */
    abortSignal?: AbortSignal;

    /**
     * Custom logger for debugging
     */
    logger?: any;

    /**
     * Connection timeout in milliseconds
     */
    timeout?: number;

    /**
     * Number of reconnection attempts
     */
    reconnectAttempts?: number;

    /**
     * Delay between reconnection attempts in milliseconds
     */
    reconnectDelay?: number;
}

/**
 * WebSocket transport specific options
 */
export interface WebSocketTransportOptions extends TransportOptions {
    /**
     * WebSocket protocols
     */
    protocols?: string | string[];

    /**
     * Custom WebSocket headers
     */
    headers?: Record<string, string>;
}

/**
 * Legacy transport options for backward compatibility
 */
export interface FetchTransportOptions extends TransportOptions {
    /**
     * HTTP headers
     */
    headers?: Record<string, string>;

    /**
     * HTTP method
     */
    method?: string;
}
