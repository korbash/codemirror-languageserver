/**
 * Main LanguageServer class combining Microsoft LSP infrastructure with Zed architecture.
 *
 * This class provides a high-level API for LSP operations while leveraging
 * Microsoft's proven vscode-languageserver-protocol implementation underneath.
 * It adds Zed-style improvements for better error handling, resource management,
 * and developer experience.
 */

import {
    InitializeParams,
    InitializeResult,
    ServerCapabilities,
    ClientCapabilities,
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
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    DidSaveTextDocumentParams,
    PublishDiagnosticsParams,
    ShowMessageParams,
    LogMessageParams,
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
    ResponseError,
} from 'vscode-languageserver-protocol';

import { LSPResult, ConnectionResult } from '../types/LSPResult.js';
import { Connection } from 'vscode-languageserver';

import {
    ConnectionManager,
    ConnectionManagerOptions,
} from './ConnectionManager.js';
import { RequestManager } from './RequestManager.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import {
    wrapConnectionRequest,
    Subscription,
    CompositeSubscription,
    createSubscription,
    ServerState,
    LanguageServerOptions,
    RequestOptions,
    NotificationHandler,
    LSPMethod,
    ExtractParams,
    ExtractResult,
    LSPNotificationMethod,
    ExtractNotificationParams,
} from '../types/index.js';

/**
 * Main LanguageServer client with Zed architecture and Microsoft LSP integration
 */
export class LanguageServer implements Disposable {
    // Core components
    private readonly connectionManager: ConnectionManager;
    private readonly requestManager: RequestManager;
    private readonly subscriptionManager: SubscriptionManager;
    private readonly subscriptions: Disposable[] = [];

    // State
    private connection?: Connection;
    private state = ServerState.Initial;
    private capabilities?: ServerCapabilities;
    private disposed = false;

    // Events
    private readonly stateChangeHandlers = new Set<
        (state: ServerState) => void
    >();
    private readonly capabilitiesChangeHandlers = new Set<
        (capabilities: ServerCapabilities) => void
    >();
    private readonly errorHandlers = new Set<(error: Error) => void>();

    constructor(
        serverUri: string,
        private readonly options: LanguageServerOptions,
    ) {
        // Create connection manager with our options
        const connectionOptions: ConnectionManagerOptions = {
            wsUrl: serverUri,
            debug:
                this.options.logging?.level === 'debug' ||
                this.options.logging?.level === 'trace',
            connectionTimeout: 10000,
            enableMonitoring: true,
            reconnectOptions: {
                enabled: true,
                maxAttempts: this.options.connection?.reconnectAttempts ?? 3,
                initialDelay: this.options.connection?.reconnectDelay ?? 1000,
                maxDelay: 30000,
                backoffMultiplier: 1.5,
            },
        };

        this.connectionManager = new ConnectionManager(connectionOptions);
        this.requestManager = new RequestManager();
        this.subscriptionManager = new SubscriptionManager();

        this.setupConnectionManagerHandlers();
    }

    // === Lifecycle Methods ===

    /**
     * Initialize the language server
     */
    async initialize(
        params?: Partial<InitializeParams>,
    ): Promise<LSPResult<InitializeResult>> {
        if (this.state !== ServerState.Initial) {
            return LSPResult.error(
                new Error(`Cannot initialize server in state: ${this.state}`),
            );
        }

        try {
            this.setState(ServerState.Connecting);

            // Create Microsoft Connection
            this.connection = await this.connectionManager.connect();

            // Setup managers with the connection
            if (this.connection) {
                this.requestManager.setConnection(this.connection);
                this.subscriptionManager.setConnection(this.connection);
            } else {
                throw new Error('Failed to establish connection');
            }

            // Setup built-in handlers
            this.setupBuiltinNotificationHandlers();

            this.setState(ServerState.Initializing);

            // Send initialize request with default client capabilities
            const initParams: InitializeParams = {
                processId: null,
                rootUri: this.options.rootUri,
                capabilities: this.createDefaultClientCapabilities(),
                initializationOptions: this.options.initializationOptions,
                workspaceFolders: this.options.workspaceFolders?.map(
                    (uri: string) => ({
                        uri,
                        name: uri.split('/').pop() || 'workspace',
                    }),
                ),
                ...params,
            };

            const result = await this.requestManager.sendRequest(
                InitializeRequest.type,
                initParams,
                { timeout: 30000 },
            );

            result.match({
                success: (initResult: InitializeResult) => {
                    this.capabilities = initResult.capabilities;
                    this.setState(ServerState.Running);
                    this.emitCapabilitiesChange(initResult.capabilities);
                    this.log(
                        'info',
                        'Language server initialized successfully',
                    );
                },
                error: (error: Error) => {
                    this.setState(ServerState.Error);
                },
            });
            return result;
        } catch (error) {
            this.setState(ServerState.Error);
            return LSPResult.error(
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Shutdown the language server gracefully
     */
    async shutdown(): Promise<LSPResult<void>> {
        if (
            this.state === ServerState.Stopped ||
            this.state === ServerState.Stopping
        ) {
            return LSPResult.success(undefined);
        }

        this.setState(ServerState.Stopping);

        try {
            await this.connectionManager.close();
            this.setState(ServerState.Stopped);
            return LSPResult.success(undefined);
        } catch (error) {
            return LSPResult.error(
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    // === Typed LSP Request Methods ===

    /**
     * Send completion request
     */
    async completion(
        params: CompletionParams,
        options?: RequestOptions,
    ): Promise<LSPResult<CompletionList | CompletionItem[] | null>> {
        return this.requestManager.sendRequest(
            CompletionRequest.type,
            params,
            options,
        );
    }

    /**
     * Send hover request
     */
    async hover(
        params: HoverParams,
        options?: RequestOptions,
    ): Promise<LSPResult<Hover | null>> {
        return this.requestManager.sendRequest(
            HoverRequest.type,
            params,
            options,
        );
    }

    /**
     * Send definition request
     */
    async definition(
        params: DefinitionParams,
        options?: RequestOptions,
    ): Promise<
        LSPResult<
            | Definition
            | import('vscode-languageserver-protocol').LocationLink[]
            | null
        >
    > {
        return this.requestManager.sendRequest(
            DefinitionRequest.type,
            params,
            options,
        );
    }

    /**
     * Send references request
     */
    async references(
        params: ReferenceParams,
        options?: RequestOptions,
    ): Promise<LSPResult<Location[] | null>> {
        return this.requestManager.sendRequest(
            ReferencesRequest.type,
            params,
            options,
        );
    }

    /**
     * Send document symbol request
     */
    async documentSymbol(
        params: DocumentSymbolParams,
        options?: RequestOptions,
    ): Promise<LSPResult<DocumentSymbol[] | SymbolInformation[] | null>> {
        return this.requestManager.sendRequest(
            DocumentSymbolRequest.type,
            params,
            options,
        );
    }

    /**
     * Generic typed request method
     */
    async request<K extends LSPMethod>(
        method: K,
        params: ExtractParams<K>,
        options?: RequestOptions,
    ): Promise<LSPResult<ExtractResult<K>>> {
        if (!this.connection) {
            return LSPResult.error(new Error('No active connection'));
        }

        return this.requestManager.sendRequest(
            { method } as any,
            params,
            options,
        );
    }

    // === LSP Notification Methods ===

    /**
     * Send textDocument/didOpen notification
     */
    async notifyDidOpenTextDocument(
        params: DidOpenTextDocumentParams,
    ): Promise<void> {
        return this.sendNotification(
            DidOpenTextDocumentNotification.type,
            params,
        );
    }

    /**
     * Send textDocument/didChange notification
     */
    async notifyDidChangeTextDocument(
        params: DidChangeTextDocumentParams,
    ): Promise<void> {
        return this.sendNotification(
            DidChangeTextDocumentNotification.type,
            params,
        );
    }

    /**
     * Send textDocument/didClose notification
     */
    async notifyDidCloseTextDocument(
        params: DidCloseTextDocumentParams,
    ): Promise<void> {
        return this.sendNotification(
            DidCloseTextDocumentNotification.type,
            params,
        );
    }

    /**
     * Send textDocument/didSave notification
     */
    async notifyDidSaveTextDocument(
        params: DidSaveTextDocumentParams,
    ): Promise<void> {
        return this.sendNotification(
            DidSaveTextDocumentNotification.type,
            params,
        );
    }

    /**
     * Generic notification sender
     */
    async sendNotification<T>(
        notificationType: { method: string },
        params: T,
    ): Promise<void> {
        if (!this.connection) {
            throw new Error('No active connection');
        }

        return this.connection.sendNotification(
            notificationType.method,
            params,
        );
    }

    // === Event Subscription Methods (Zed-style) ===

    /**
     * Subscribe to diagnostics notifications
     */
    onDiagnostics(
        handler: NotificationHandler<PublishDiagnosticsParams>,
    ): Subscription {
        return this.subscriptionManager.onNotification(
            PublishDiagnosticsNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to show message notifications
     */
    onShowMessage(
        handler: NotificationHandler<ShowMessageParams>,
    ): Subscription {
        return this.subscriptionManager.onNotification(
            ShowMessageNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to log message notifications
     */
    onLogMessage(handler: NotificationHandler<LogMessageParams>): Subscription {
        return this.subscriptionManager.onNotification(
            LogMessageNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to progress notifications
     */
    onProgress(handler: NotificationHandler<any>): Subscription {
        // Create a custom notification type for progress since it may not be exported
        const progressNotificationType = { method: '$/progress' } as any;
        return this.subscriptionManager.onNotification(
            progressNotificationType,
            handler,
        );
    }

    /**
     * Generic typed notification subscription
     */
    onNotification<K extends LSPNotificationMethod>(
        method: K,
        handler: NotificationHandler<ExtractNotificationParams<K>>,
    ): Subscription {
        return this.subscriptionManager.onNotification(
            { method } as any,
            handler,
        );
    }

    // === State and Capabilities ===

    /**
     * Get current server state
     */
    getState(): ServerState {
        return this.state;
    }

    /**
     * Get server capabilities (available after initialization)
     */
    getCapabilities(): ServerCapabilities | undefined {
        return this.capabilities;
    }

    /**
     * Check if server is ready for requests
     */
    isReady(): boolean {
        return (
            this.state === ServerState.Running && this.connection !== undefined
        );
    }

    /**
     * Subscribe to state changes
     */
    onStateChange(handler: (state: ServerState) => void): Subscription {
        this.stateChangeHandlers.add(handler);
        return createSubscription(
            () => this.stateChangeHandlers.delete(handler),
            'state-change-handler',
        );
    }

    /**
     * Subscribe to capabilities changes
     */
    onCapabilitiesChange(
        handler: (capabilities: ServerCapabilities) => void,
    ): Subscription {
        this.capabilitiesChangeHandlers.add(handler);
        return createSubscription(
            () => this.capabilitiesChangeHandlers.delete(handler),
            'capabilities-change-handler',
        );
    }

    /**
     * Subscribe to errors
     */
    onError(handler: (error: Error) => void): Subscription {
        this.errorHandlers.add(handler);
        return createSubscription(
            () => this.errorHandlers.delete(handler),
            'error-handler',
        );
    }

    // === Microsoft Disposable Interface ===

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.setState(ServerState.Stopped);

        // Dispose all subscriptions
        this.subscriptions.forEach((sub) => {
            try {
                if ('dispose' in sub && typeof sub.dispose === 'function') {
                    sub.dispose();
                } else if (Symbol.dispose in sub) {
                    sub[Symbol.dispose]();
                }
            } catch (error) {
                // Ignore disposal errors
            }
        });
        this.subscriptions.length = 0;

        // Dispose managers
        this.subscriptionManager.dispose();
        this.requestManager.dispose();
        this.connectionManager.dispose();

        // Clear event handlers
        this.stateChangeHandlers.clear();
        this.capabilitiesChangeHandlers.clear();
        this.errorHandlers.clear();

        this.log('info', 'LanguageServer disposed');
    }

    // === TC39 Symbol.dispose support ===

    [Symbol.dispose](): void {
        this.dispose();
    }

    // === Factory Methods ===

    /**
     * Create a LanguageServer instance
     */
    static async create(
        serverUri: string,
        options: LanguageServerOptions,
    ): Promise<LanguageServer> {
        const server = new LanguageServer(serverUri, options);
        return server;
    }

    /**
     * Create and initialize a LanguageServer instance
     */
    static async createAndInitialize(
        serverUri: string,
        options: LanguageServerOptions,
        initParams?: Partial<InitializeParams>,
    ): Promise<LSPResult<LanguageServer>> {
        try {
            const server = new LanguageServer(serverUri, options);
            const initResult = await server.initialize(initParams);

            initResult.match({
                success: () => {
                    // Server is ready to use
                },
                error: (error: any) => {
                    server.dispose();
                },
            });

            // Transform LSPResult<InitializeResult> to LSPResult<LanguageServer>
            switch (initResult.getState()) {
                case ConnectionResult.Success:
                    return LSPResult.success(server);
                case ConnectionResult.Timeout:
                    return LSPResult.timeout('Server initialization timed out');
                case ConnectionResult.Cancelled:
                    return LSPResult.cancelled(
                        'Server initialization was cancelled',
                    );
                case ConnectionResult.ConnectionReset:
                    return LSPResult.connectionReset(
                        'Connection lost during initialization',
                    );
                case ConnectionResult.Error:
                    return LSPResult.error(
                        initResult.getError() || new Error('Unknown error'),
                    );
            }
        } catch (error) {
            return LSPResult.error(
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    // === Private Methods ===

    private setupConnectionManagerHandlers(): void {
        // Handle connection state changes
        const stateChangeDisposable = this.connectionManager.onStateChange(
            (state) => {
                this.setState(state);
            },
        );
        this.subscriptions.push({
            dispose: () => (stateChangeDisposable as any).dispose(),
            [Symbol.dispose]: () => (stateChangeDisposable as any).dispose(),
        } as any);

        // Handle connection errors
        const errorDisposable = this.connectionManager.onError((error) => {
            this.emitError(error);
        });
        this.subscriptions.push({
            dispose: () => (errorDisposable as any).dispose(),
            [Symbol.dispose]: () => (errorDisposable as any).dispose(),
        } as any);
    }

    private setupBuiltinNotificationHandlers(): void {
        // Setup handlers for common LSP notifications that might need special handling
        // Most notifications will be handled via the subscription system
    }

    private createDefaultClientCapabilities(): ClientCapabilities {
        return {
            workspace: {
                configuration: true,
                didChangeWatchedFiles: {
                    dynamicRegistration: true,
                },
                workspaceFolders: true,
                applyEdit: true,
            },
            textDocument: {
                synchronization: {
                    didSave: true,
                    dynamicRegistration: true,
                },
                completion: {
                    completionItem: {
                        snippetSupport: true,
                        resolveSupport: {
                            properties: [
                                'documentation',
                                'detail',
                                'additionalTextEdits',
                            ],
                        },
                    },
                    contextSupport: true,
                },
                hover: {
                    contentFormat: ['markdown', 'plaintext'],
                },
                definition: {
                    linkSupport: true,
                },
                references: {},
                documentSymbol: {
                    hierarchicalDocumentSymbolSupport: true,
                },
                publishDiagnostics: {
                    relatedInformation: true,
                    tagSupport: {
                        valueSet: [1, 2], // Unnecessary and Deprecated
                    },
                },
            },
        };
    }

    private setState(state: ServerState): void {
        if (this.state === state) {
            return;
        }

        const oldState = this.state;
        this.state = state;

        this.log('info', `State changed: ${oldState} -> ${state}`);

        for (const handler of this.stateChangeHandlers) {
            try {
                handler(state);
            } catch (error) {
                this.log('error', `Error in state change handler: ${error}`);
            }
        }
    }

    private emitCapabilitiesChange(capabilities: ServerCapabilities): void {
        for (const handler of this.capabilitiesChangeHandlers) {
            try {
                handler(capabilities);
            } catch (error) {
                this.log(
                    'error',
                    `Error in capabilities change handler: ${error}`,
                );
            }
        }
    }

    private emitError(error: Error): void {
        for (const handler of this.errorHandlers) {
            try {
                handler(error);
            } catch (error) {
                this.log('error', `Error in error handler: ${error}`);
            }
        }
    }

    private log(level: string, message: string, ...args: any[]): void {
        const shouldLog =
            this.options.logging?.level === 'debug' ||
            this.options.logging?.level === 'trace' ||
            level === 'error';

        if (shouldLog) {
            const prefix = this.options.logging?.prefix
                ? `[${this.options.logging.prefix}] `
                : '[LanguageServer] ';
            const logMethod = (console as any)[level];
            if (typeof logMethod === 'function') {
                logMethod(prefix + message, ...args);
            } else {
                console.log(
                    `${prefix}${level.toUpperCase()}: ${message}`,
                    ...args,
                );
            }
        }
    }
}
