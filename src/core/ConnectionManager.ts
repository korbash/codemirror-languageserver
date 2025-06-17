/**
 * Connection Manager for LSP client using Microsoft's createConnection approach.
 *
 * This class wraps Microsoft's vscode-languageserver-protocol createConnection
 * with WebSocket transport and adds Zed-style improvements for monitoring,
 * error handling, and resource management.
 */

import {
    MessageReader,
    MessageWriter,
    Disposable,
    Logger,
} from 'vscode-languageserver-protocol';

import { createConnection, Connection } from 'vscode-languageserver/node.js';

import {
    WebSocketMessageReader,
    WebSocketMessageReaderOptions,
} from '../transport/WebSocketMessageReader.js';
import {
    WebSocketMessageWriter,
    WebSocketMessageWriterOptions,
} from '../transport/WebSocketMessageWriter.js';

import { ServerState as ConnectionState } from '../types/index.js';

/**
 * Reconnection configuration
 */
interface ReconnectOptions {
    enabled: boolean;
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}

/**
 * Connection Manager Options
 */
export interface ConnectionManagerOptions {
    /**
     * WebSocket URL for connection
     */
    wsUrl: string;

    /**
     * Message reader options
     */
    reader?: WebSocketMessageReaderOptions;

    /**
     * Message writer options
     */
    writer?: WebSocketMessageWriterOptions;

    /**
     * Enable performance monitoring
     */
    enableMonitoring?: boolean;

    /**
     * Custom logger
     */
    logger?: Logger;

    /**
     * Debug mode
     */
    debug?: boolean;

    /**
     * Connection timeout in milliseconds
     */
    connectionTimeout?: number;

    /**
     * Reconnection options
     */
    reconnectOptions?: ReconnectOptions;
}

/**
 * Connection Statistics
 */
interface ConnectionStats {
    connectionTime: number;
    messagesSent: number;
    messagesReceived: number;
    errors: number;
    reconnections: number;
}

/**
 * Connection Manager using Microsoft's createConnection with WebSocket transport
 */
export class ConnectionManager implements Disposable {
    private webSocket: WebSocket | null = null;
    private reader: WebSocketMessageReader | null = null;
    private writer: WebSocketMessageWriter | null = null;
    private connection: Connection | null = null;
    private disposed: boolean = false;

    // State management (Zed-style)
    private state: ConnectionState = ConnectionState.Initial;
    private connectStartTime: number = 0;
    private readonly subscriptions: Disposable[] = [];

    // Performance monitoring (Zed-style)
    private readonly stats: ConnectionStats = {
        connectionTime: 0,
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
        reconnections: 0,
    };

    // Reconnection management
    private reconnectAttempts: number = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;

    // Event handlers
    private readonly stateChangeHandlers: Array<
        (state: ConnectionState) => void
    > = [];
    private readonly errorHandlers: Array<(error: Error) => void> = [];
    private readonly statsHandlers: Array<(stats: ConnectionStats) => void> =
        [];

    constructor(private options: ConnectionManagerOptions) {
        this.validateOptions();
    }

    /**
     * Create and establish the LSP connection
     */
    async connect(): Promise<Connection> {
        if (this.connection) {
            throw new Error('Connection already exists');
        }

        if (this.disposed) {
            throw new Error('ConnectionManager has been disposed');
        }

        this.setState(ConnectionState.Connecting);
        this.connectStartTime = Date.now();

        try {
            // Create WebSocket connection
            await this.createWebSocket();

            // Create message reader/writer
            this.createMessageReaderWriter();

            // Create Microsoft's ProtocolConnection
            this.connection = this.createProtocolConnection();

            // Setup event handlers
            this.setupConnectionHandlers();

            // Setup monitoring if enabled
            if (this.options.enableMonitoring) {
                this.setupMonitoring();
            }

            this.setState(ConnectionState.Running);
            this.stats.connectionTime = Date.now() - this.connectStartTime;
            this.resetReconnectAttempts();

            this.log('INFO', 'LSP connection established');
            return this.connection;
        } catch (error) {
            this.setState(ConnectionState.Stopped);
            this.handleConnectionError(error);
            throw error;
        }
    }

    /**
     * Get the current connection (null if not connected)
     */
    getConnection(): Connection | null {
        return this.connection;
    }

    /**
     * Check if currently connected
     */
    isConnected(): boolean {
        return (
            this.connection !== null &&
            this.state === ConnectionState.Running &&
            this.webSocket?.readyState === WebSocket.OPEN
        );
    }

    /**
     * Get current connection state
     */
    getState(): ConnectionState {
        return this.state;
    }

    /**
     * Get connection statistics
     */
    getStats(): Readonly<ConnectionStats> {
        return { ...this.stats };
    }

    /**
     * Close the connection
     */
    async close(): Promise<void> {
        if (this.disposed) {
            return;
        }

        this.setState(ConnectionState.Stopping);
        this.clearReconnectTimer();

        try {
            // Close connection first
            if (this.connection) {
                this.connection.dispose();
                this.connection = null;
            }

            // Close WebSocket
            if (this.webSocket) {
                this.webSocket.close();
                this.webSocket = null;
            }

            // Clean up reader/writer
            this.reader?.dispose();
            this.writer?.dispose();
            this.reader = null;
            this.writer = null;

            this.setState(ConnectionState.Stopped);
            this.log('INFO', 'LSP connection closed');
        } catch (error) {
            this.handleConnectionError(error);
        }
    }

    /**
     * Register state change handler
     */
    onStateChange(handler: (state: ConnectionState) => void): Disposable {
        this.stateChangeHandlers.push(handler);
        return {
            dispose: () => {
                const index = this.stateChangeHandlers.indexOf(handler);
                if (index >= 0) {
                    this.stateChangeHandlers.splice(index, 1);
                }
            },
        };
    }

    /**
     * Register error handler
     */
    onError(handler: (error: Error) => void): Disposable {
        this.errorHandlers.push(handler);
        return {
            dispose: () => {
                const index = this.errorHandlers.indexOf(handler);
                if (index >= 0) {
                    this.errorHandlers.splice(index, 1);
                }
            },
        };
    }

    /**
     * Register stats handler
     */
    onStats(handler: (stats: ConnectionStats) => void): Disposable {
        this.statsHandlers.push(handler);
        return {
            dispose: () => {
                const index = this.statsHandlers.indexOf(handler);
                if (index >= 0) {
                    this.statsHandlers.splice(index, 1);
                }
            },
        };
    }

    /**
     * Dispose the connection manager
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.clearReconnectTimer();

        // Close connection
        this.close().catch((error) => {
            this.log('ERROR', `Error during disposal: ${error.message}`);
        });

        // Dispose all subscriptions
        this.subscriptions.forEach((sub) => {
            try {
                sub.dispose();
            } catch (error) {
                this.log('ERROR', `Error disposing subscription: ${error}`);
            }
        });
        this.subscriptions.length = 0;

        // Clear handlers
        this.stateChangeHandlers.length = 0;
        this.errorHandlers.length = 0;
        this.statsHandlers.length = 0;
    }

    /**
     * Create WebSocket connection
     */
    private async createWebSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.webSocket = new WebSocket(this.options.wsUrl);

                const timeout = setTimeout(() => {
                    this.webSocket?.close();
                    reject(
                        new Error(
                            `Connection timeout after ${this.options.connectionTimeout || 10000}ms`,
                        ),
                    );
                }, this.options.connectionTimeout || 10000);

                this.webSocket.onopen = () => {
                    clearTimeout(timeout);
                    this.log('INFO', 'WebSocket connection opened');
                    resolve();
                };

                this.webSocket.onerror = (event) => {
                    clearTimeout(timeout);
                    reject(new Error(`WebSocket error: ${event}`));
                };

                this.webSocket.onclose = (event) => {
                    clearTimeout(timeout);
                    if (event.code !== 1000) {
                        // Not a normal closure
                        this.handleConnectionClosed();
                    }
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Create message reader and writer
     */
    private createMessageReaderWriter(): void {
        if (!this.webSocket) {
            throw new Error('WebSocket not available');
        }

        this.reader = new WebSocketMessageReader(
            this.webSocket,
            this.options.reader,
        );
        this.writer = new WebSocketMessageWriter(
            this.webSocket,
            this.options.writer,
        );
    }

    /**
     * Create Microsoft Connection using createConnection
     */
    private createProtocolConnection(): Connection {
        if (!this.reader || !this.writer) {
            throw new Error('MessageReader/Writer not available');
        }

        // Use Microsoft's createConnection - this is the key integration point!
        const connection = createConnection(
            this.reader as MessageReader,
            this.writer as MessageWriter,
        );

        return connection;
    }

    /**
     * Setup connection event handlers
     */
    private setupConnectionHandlers(): void {
        if (!this.connection) {
            return;
        }

        // Handle connection errors and close via WebSocket events
        if (this.webSocket) {
            this.webSocket.addEventListener('error', (event) => {
                this.handleConnectionError(
                    new Error(`WebSocket error: ${event}`),
                );
            });

            this.webSocket.addEventListener('close', () => {
                this.handleConnectionClosed();
            });
        }

        // Listen for connection to be ready
        this.connection.listen();
    }

    /**
     * Setup performance monitoring
     */
    private setupMonitoring(): void {
        if (!this.connection) {
            return;
        }

        // Monitor outgoing messages
        const originalSendRequest = this.connection.sendRequest.bind(
            this.connection,
        );
        this.connection.sendRequest = (type: any, ...args: any[]) => {
            this.stats.messagesSent++;
            this.updateStats();
            return originalSendRequest(type, ...args);
        };

        // Note: Direct message monitoring not available on Connection interface
        // Monitoring will be handled at transport level if needed
    }

    /**
     * Handle connection errors
     */
    private handleConnectionError(error: any): void {
        this.stats.errors++;
        this.log('ERROR', `Connection error: ${error.message || error}`);

        this.errorHandlers.forEach((handler) => {
            try {
                handler(
                    error instanceof Error ? error : new Error(String(error)),
                );
            } catch (e) {
                this.log('ERROR', `Error in error handler: ${e}`);
            }
        });

        this.handleReconnection();
    }

    /**
     * Handle connection closed
     */
    private handleConnectionClosed(): void {
        this.setState(ConnectionState.Stopped);
        this.log('INFO', 'Connection closed');
        this.handleReconnection();
    }

    /**
     * Handle reconnection logic
     */
    private handleReconnection(): void {
        const reconnectOptions = this.options.reconnectOptions || {
            enabled: true,
            maxAttempts: 5,
            initialDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
        };

        if (
            !reconnectOptions.enabled ||
            this.disposed ||
            this.reconnectAttempts >= reconnectOptions.maxAttempts
        ) {
            return;
        }

        this.reconnectAttempts++;
        this.stats.reconnections++;

        const delay = Math.min(
            reconnectOptions.initialDelay *
                Math.pow(
                    reconnectOptions.backoffMultiplier,
                    this.reconnectAttempts - 1,
                ),
            reconnectOptions.maxDelay,
        );

        this.log(
            'INFO',
            `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
        );

        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.close();
                await this.connect();
            } catch (error) {
                this.log('ERROR', `Reconnection failed: ${error}`);
            }
        }, delay);
    }

    /**
     * Update and emit stats
     */
    private updateStats(): void {
        this.emitStats();
    }

    /**
     * Emit stats to handlers
     */
    private emitStats(): void {
        const stats = this.getStats();
        this.statsHandlers.forEach((handler) => {
            try {
                handler(stats);
            } catch (error) {
                this.log('ERROR', `Error in stats handler: ${error}`);
            }
        });
    }

    /**
     * Set connection state and notify handlers
     */
    private setState(newState: ConnectionState): void {
        if (this.state === newState) {
            return;
        }

        const oldState = this.state;
        this.state = newState;

        this.log('INFO', `State changed: ${oldState} -> ${newState}`);

        this.stateChangeHandlers.forEach((handler) => {
            try {
                handler(newState);
            } catch (error) {
                this.log('ERROR', `Error in state change handler: ${error}`);
            }
        });
    }

    /**
     * Reset reconnection attempts
     */
    private resetReconnectAttempts(): void {
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
    }

    /**
     * Clear reconnection timer
     */
    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * Validate connection options
     */
    private validateOptions(): void {
        if (!this.options.wsUrl) {
            throw new Error('wsUrl is required');
        }

        try {
            new URL(this.options.wsUrl);
        } catch {
            throw new Error('Invalid WebSocket URL');
        }
    }

    /**
     * Internal logging
     */
    private log(level: string, message: string): void {
        if (this.options.logger) {
            switch (level) {
                case 'ERROR':
                    this.options.logger.error(message);
                    break;
                case 'WARN':
                    this.options.logger.warn(message);
                    break;
                case 'INFO':
                    this.options.logger.info(message);
                    break;
                default:
                    this.options.logger.log(message);
            }
        } else {
            console.log(`[ConnectionManager:${level}] ${message}`);
        }
    }
}
