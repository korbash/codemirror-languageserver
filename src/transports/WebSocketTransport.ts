import {
    createConnection,
    Connection,
    ProposedFeatures,
} from 'vscode-languageserver/node.js';
import { createLogger } from '../utils/logger.js';
import {
    WebSocketMessageReader,
    WebSocketMessageWriter,
} from './WebSocketMessage.js';

export interface WebSocketTransportOptions {
    /**
     * Connection timeout in milliseconds (default: 10000)
     */
    timeout?: number;
}

/**
 * WebSocket transport using Microsoft's high-level createConnection approach.
 *
 * This follows Microsoft's intended pattern:
 * 1. Create MessageReader/Writer from transport
 * 2. Use createConnection() from vscode-languageserver (high-level API)
 * 3. Connection automatically handles listen() and protocol details
 * 4. Direct usage of Microsoft's Connection interface
 *
 * This is the official Microsoft approach, not the low-level createProtocolConnection.
 */
export class WebSocketTransport {
    private ws: WebSocket | null = null;
    private _connection: Connection | null = null;
    private reader: WebSocketMessageReader | null = null;
    private writer: WebSocketMessageWriter | null = null;
    private logger = createLogger('TRANSPORT');
    private _connected = false;

    constructor(
        private url: string,
        private options: WebSocketTransportOptions = {},
    ) {
        // Aggressive validation
        if (!url) {
            throw new Error('WebSocket URL is required');
        }
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
            throw new Error(
                `Invalid WebSocket URL format: ${url}. Must start with ws:// or wss://`,
            );
        }
    }

    /**
     * Connect to WebSocket and create Connection using Microsoft's high-level API
     */
    async connect(): Promise<void> {
        if (this._connected) {
            throw new Error('Already connected');
        }
        if (this.ws) {
            throw new Error(
                'Connection in progress or not properly cleaned up',
            );
        }

        this.logger.info('Connecting to WebSocket:', this.url);

        try {
            await this.createWebSocketConnection();
            this.createConnection();
            this._connected = true;
            this.logger.info('WebSocket transport connected and ready');
        } catch (error) {
            this.cleanup();
            throw new Error(
                `Failed to connect to ${this.url}: ${error instanceof Error ? error.message : error}`,
            );
        }
    }

    /**
     * Get Microsoft's high-level Connection for all LSP operations.
     *
     * Use this exactly like Microsoft's examples:
     * - connection.sendRequest(LSP.InitializeRequest.type, params)
     * - connection.onNotification(LSP.PublishDiagnosticsNotification.type, handler)
     * - connection.onRequest(LSP.ConfigurationRequest.type, handler)
     * - connection.listen() - called automatically
     */
    get connection(): Connection {
        if (!this._connection) {
            throw new Error('Transport not connected. Call connect() first.');
        }
        if (!this._connected) {
            throw new Error('Transport is not in connected state');
        }
        return this._connection;
    }

    /**
     * Check if transport is connected and ready for LSP operations
     */
    get isConnected(): boolean {
        return (
            this._connected &&
            this.ws?.readyState === WebSocket.OPEN &&
            this._connection !== null
        );
    }

    /**
     * Close the transport and cleanup all resources
     */
    close(): void {
        this.logger.info('Closing WebSocket transport');
        this._connected = false;

        // Dispose the connection first (Microsoft pattern)
        if (this._connection) {
            try {
                this._connection.dispose();
            } catch (error) {
                this.logger.error('Error disposing Connection:', error);
            }
        }

        this.cleanup();
    }

    /**
     * Create WebSocket connection with proper error handling
     */
    private async createWebSocketConnection(): Promise<void> {
        if (this.ws) {
            throw new Error('WebSocket already exists');
        }

        this.ws = new WebSocket(this.url);
        const timeout = this.options.timeout || 10000;

        return new Promise<void>((resolve, reject) => {
            if (!this.ws) {
                reject(new Error('WebSocket creation failed'));
                return;
            }

            let timeoutId: NodeJS.Timeout | undefined;
            let resolved = false;

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            };

            const resolveOnce = () => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve();
                }
            };

            const rejectOnce = (error: Error) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(error);
                }
            };

            // Set timeout
            timeoutId = setTimeout(() => {
                this.ws?.close();
                rejectOnce(
                    new Error(
                        `WebSocket connection timeout after ${timeout}ms`,
                    ),
                );
            }, timeout);

            this.ws.onopen = () => {
                this.logger.info('WebSocket opened');
                resolveOnce();
            };

            this.ws.onclose = (event) => {
                this.logger.info('WebSocket closed during connection', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                });
                this.handleConnectionLost();
                rejectOnce(
                    new Error(
                        `WebSocket closed during connection: ${event.code} ${event.reason}`,
                    ),
                );
            };

            this.ws.onerror = () => {
                const error = new Error(
                    `WebSocket connection to ${this.url} failed`,
                );
                this.logger.error('WebSocket error during connection:', error);
                rejectOnce(error);
            };
        });
    }

    /**
     * Create Connection using Microsoft's high-level createConnection API
     */
    private createConnection(): void {
        if (!this.ws) {
            throw new Error('WebSocket not available for Connection creation');
        }
        if (this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket must be OPEN to create Connection');
        }
        if (this._connection) {
            throw new Error('Connection already exists');
        }

        try {
            // Create MessageReader and MessageWriter (Microsoft pattern)
            this.reader = new WebSocketMessageReader(this.ws);
            this.writer = new WebSocketMessageWriter(this.ws);

            // Use Microsoft's high-level createConnection API
            this._connection = createConnection(this.reader, this.writer);

            // Microsoft's high-level Connection starts listening
            this._connection.listen();

            this.logger.info('Microsoft Connection created and listening');
        } catch (error) {
            // Cleanup on failure
            this.reader?.dispose();
            this.writer?.dispose();
            this.reader = null;
            this.writer = null;
            throw new Error(
                `Failed to create Connection: ${error instanceof Error ? error.message : error}`,
            );
        }
    }

    /**
     * Handle connection loss (WebSocket closed/errored)
     */
    private handleConnectionLost(): void {
        if (this._connected) {
            this._connected = false;
            this.logger.warn('Connection lost');
            // Don't auto-reconnect - let user handle reconnection
        }
    }

    /**
     * Cleanup all resources
     */
    private cleanup(): void {
        // Dispose Connection
        if (this._connection) {
            try {
                this._connection.dispose();
            } catch (error) {
                this.logger.error('Error disposing Connection:', error);
            }
            this._connection = null;
        }

        // Dispose MessageReader/Writer
        if (this.reader) {
            try {
                this.reader.dispose();
            } catch (error) {
                this.logger.error('Error disposing MessageReader:', error);
            }
            this.reader = null;
        }

        if (this.writer) {
            try {
                this.writer.dispose();
            } catch (error) {
                this.logger.error('Error disposing MessageWriter:', error);
            }
            this.writer = null;
        }

        // Close WebSocket
        if (this.ws) {
            if (
                this.ws.readyState === WebSocket.OPEN ||
                this.ws.readyState === WebSocket.CONNECTING
            ) {
                try {
                    this.ws.close();
                } catch (error) {
                    this.logger.error('Error closing WebSocket:', error);
                }
            }
            this.ws = null;
        }
    }

    /**
     * Get debug information for troubleshooting
     */
    get debugInfo() {
        return {
            url: this.url,
            connected: this._connected,
            wsState: this.ws?.readyState,
            wsStateString: this.ws ? this.getWebSocketStateString() : 'null',
            hasConnection: !!this._connection,
            hasReader: !!this.reader,
            hasWriter: !!this.writer,
        };
    }

    private getWebSocketStateString(): string {
        if (!this.ws) return 'null';
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'CONNECTING';
            case WebSocket.OPEN:
                return 'OPEN';
            case WebSocket.CLOSING:
                return 'CLOSING';
            case WebSocket.CLOSED:
                return 'CLOSED';
            default:
                return 'UNKNOWN';
        }
    }
}
