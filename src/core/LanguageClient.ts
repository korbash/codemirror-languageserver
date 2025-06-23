/**
 * Ultra-minimal Language Server Protocol Client with Type-Safe Connection State
 * - WebSocket auto-connects on creation
 * - LSP initializes automatically on WebSocket open
 * - Type-safe connection state management with discriminated unions
 * - Only request/notification sending when connected
 */

import { createConnection, Connection } from 'vscode-languageserver/node.js';
import ReconnectingWebSocket from 'reconnecting-websocket';
import * as WS from 'ws';
import { BehaviorSubject, Subject, Observable, ReplaySubject } from 'rxjs';
import { timestamp, map } from 'rxjs/operators';

import { WebSocketMessageReader } from '../transport/WebSocketMessageReader.js';
import { WebSocketMessageWriter } from '../transport/WebSocketMessageWriter.js';
import { RequestManager } from './RequestManager.js';

import type {
    InitializeParams,
    InitializeResult,
    ServerCapabilities,
} from 'vscode-languageserver-protocol';

import {
    LSPError,
    LSPMethods,
    type LanguageServerOptions,
    type RequestOptions,
} from '../types/index.js';
import { Server } from 'tls';

export interface LanguageClientOptions extends LanguageServerOptions {
    wsUrl: string;
    maxRetries?: number;
    connectionTimeout?: number;
    debug?: boolean;
}

// Default LSP client capabilities constant
const DEFAULT_CLIENT_CAPABILITIES = {
    workspace: {
        applyEdit: false,
        workspaceEdit: {
            documentChanges: false,
            resourceOperations: [],
            failureHandling: 'abort' as any,
        },
        didChangeConfiguration: { dynamicRegistration: false },
        didChangeWatchedFiles: { dynamicRegistration: false },
        symbol: { dynamicRegistration: false },
        executeCommand: { dynamicRegistration: false },
        workspaceFolders: true,
        configuration: true,
    },
    textDocument: {
        synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
        },
        completion: {
            dynamicRegistration: false,
            completionItem: {
                snippetSupport: false,
                commitCharactersSupport: false,
                documentationFormat: ['plaintext'],
                deprecatedSupport: false,
                preselectSupport: false,
            },
            contextSupport: false,
        },
        hover: {
            dynamicRegistration: false,
            contentFormat: ['plaintext' as any],
        },
        signatureHelp: {
            dynamicRegistration: false,
            signatureInformation: {
                documentationFormat: ['plaintext' as any],
            },
        },
        definition: { dynamicRegistration: false },
        references: { dynamicRegistration: false },
        documentHighlight: { dynamicRegistration: false },
        documentSymbol: {
            dynamicRegistration: false,
            symbolKind: {
                valueSet: [
                    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
                    18, 19, 20, 21, 22, 23, 24, 25, 26,
                ],
            },
        },
        codeAction: { dynamicRegistration: false },
        codeLens: { dynamicRegistration: false },
        formatting: { dynamicRegistration: false },
        rangeFormatting: { dynamicRegistration: false },
        onTypeFormatting: { dynamicRegistration: false },
        rename: { dynamicRegistration: false },
        publishDiagnostics: {
            relatedInformation: false,
            versionSupport: false,
            tagSupport: { valueSet: [1, 2] },
        },
    },
    window: {
        showMessage: {
            messageActionItem: { additionalPropertiesSupport: false },
        },
        showDocument: { support: false },
        workDoneProgress: true,
    },
    general: {
        regularExpressions: { engine: 'ECMAScript', version: 'ES2020' },
        markdown: { parser: 'marked', version: '4.0.0' },
    },
};

// === Type-Safe Connection State ===

export interface ConnectedStatePayload {
    readonly state: 'running';
    readonly requestManager: RequestManager;
    readonly capabilities: ServerCapabilities;
}

export interface DisconnectedStatePayload {
    readonly state: 'connecting' | 'initializing' | 'stopping' | 'stopped';
}

export interface ErrorStatePayload {
    readonly state: 'error';
    readonly error: LSPError[];
}

export type ConnectionPayload =
    | ConnectedStatePayload
    | DisconnectedStatePayload
    | ErrorStatePayload;

// Добавляем time уже в итоговый тип
export type ConnectionState = ConnectionPayload & { time: Date };

export class LanguageClient {
    private readonly webSocket: ReconnectingWebSocket;
    private readonly abortController = new AbortController();

    // 1) Храним только “payload” без time
    private readonly stateSubject = new ReplaySubject<ConnectionPayload>();

    // 2) Собираем полный ConnectionState с time
    public readonly state$: Observable<ConnectionState> =
        this.stateSubject.pipe(
            timestamp(), // превращает в { value, timestamp }
            map(({ value, timestamp }) => ({
                ...value,
                time: new Date(timestamp), // здесь “timestamp” из RxJS
            })),
        );

    constructor(private readonly options: LanguageClientOptions) {
        // Теперь достаточно пушить только payload
        this.stateSubject.next({ state: 'stopped' });
        this.webSocket = new ReconnectingWebSocket(this.options.wsUrl, [], {
            WebSocket: WS,
            maxRetries: this.options.maxRetries ?? 5,
            connectionTimeout: this.options.connectionTimeout ?? 10000,
            debug: this.options.debug ?? false,
        });

        this.webSocket.addEventListener('open', () => this.onWebSocketOpen());
        this.webSocket.addEventListener('close', () => this.onWebSocketClose());
        this.webSocket.addEventListener('error', (e) =>
            this.onWebSocketError(e.error),
        );

        this.stateSubject.next({ state: 'connecting' });
        this.webSocket.reconnect();
    }

    /**
     * Symbol.dispose for using with `using` keyword
     */
    [Symbol.dispose](): void {
        this.abortController.abort('Client disposed');
        this.webSocket.close();
    }

    // === Private Methods ===

    /**
     * Handle WebSocket open event - perform LSP initialization and create connected state
     */
    private onWebSocketOpen(): void {
        // Create LSP connection
        const reader = new WebSocketMessageReader(this.webSocket as any);
        const writer = new WebSocketMessageWriter(this.webSocket as any);
        const lspConnection = createConnection(reader, writer);
        // Start listening
        lspConnection.listen();

        // Create new request manager for this connection
        const requestManager = new RequestManager(lspConnection);

        // Initialize LSP asynchronously
        this.stateSubject.next({ state: 'initializing' });
        const initializeParams: InitializeParams = {
            processId: null,
            rootUri: this.options.rootUri,
            workspaceFolders: this.options.workspaceFolders?.map(
                (uri: string) => ({
                    uri,
                    name: uri.split('/').pop() || uri,
                }),
            ),
            capabilities: DEFAULT_CLIENT_CAPABILITIES as any,
            initializationOptions: this.options.initializationOptions,
        };

        requestManager
            .sendRequest(LSPMethods.INITIALIZE, initializeParams)
            .map((response) => {
                this.stateSubject.next({
                    state: 'running',
                    requestManager: requestManager,
                    capabilities: response as ServerCapabilities, //нужно исправить временная заглушка
                });
            })
            .mapErr((error) => {
                this.stateSubject.next({
                    state: 'error',
                    error: error,
                });
            });
    }
    //ура всё что выше норм ниже не смотрел
    /**
     * Handle WebSocket close event - reset to disconnected state and cancel requests
     */
    private onWebSocketClose(): void {
        // Cancel all pending requests if we were connected
        if (this.isConnectedState(this._connection)) {
            this._connection.requestManager.cancelAll('Connection lost');
            this._connection.requestManager.dispose();

            // Dispose LSP connection
            try {
                this._connection.lspConnection.dispose();
            } catch (error) {
                // Ignore disposal errors
            }
        }

        // Reset to disconnected state
        this._connection = { state: 'disconnected' };
        this.capabilitiesSubject.next(null);
        this.stateSubject.next(ServerState.Stopped);
    }

    /**
     * Handle WebSocket error event
     */
    private onWebSocketError(event: any): void {
        const error = new Error(
            `WebSocket error: ${event.message || 'Unknown error'}`,
        );
        this.errorSubject.next(error);
    }
