/**
 * Simplified Connection Manager using ReconnectingWebSocket
 */

import { createConnection, Connection } from 'vscode-languageserver/node.js';
import ReconnectingWebSocket from 'reconnecting-websocket';
import * as WS from 'ws';

import { WebSocketMessageReader } from '../transport/WebSocketMessageReader.js';
import { WebSocketMessageWriter } from '../transport/WebSocketMessageWriter.js';

export interface ConnectionManagerOptions {
    wsUrl: string;
    maxRetries?: number;
    connectionTimeout?: number;
    debug?: boolean;
}

export class ConnectionManager {
    private webSocket: ReconnectingWebSocket | null = null;
    private connection: Connection | null = null;

    constructor(private options: ConnectionManagerOptions) {}

    async connect(): Promise<Connection> {
        if (this.connection) {
            return this.connection;
        }

        // Create ReconnectingWebSocket
        this.webSocket = new ReconnectingWebSocket(this.options.wsUrl, [], {
            WebSocket: WS,
            maxRetries: this.options.maxRetries ?? 10,
            connectionTimeout: this.options.connectionTimeout ?? 10000,
            debug: this.options.debug ?? false,
        });

        // Wait for connection
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error('Connection timeout')),
                this.options.connectionTimeout ?? 10000,
            );

            this.webSocket!.addEventListener('open', () => {
                clearTimeout(timeout);
                resolve(undefined);
            });

            this.webSocket!.addEventListener('error', (event) => {
                clearTimeout(timeout);
                reject(new Error(`Connection failed: ${event.message}`));
            });
        });

        // Create LSP connection
        const reader = new WebSocketMessageReader(this.webSocket as any);
        const writer = new WebSocketMessageWriter(this.webSocket as any);
        this.connection = createConnection(reader, writer);
        this.connection.listen();

        return this.connection;
    }

    getConnection(): Connection | null {
        return this.connection;
    }

    isConnected(): boolean {
        return this.webSocket?.readyState === ReconnectingWebSocket.OPEN;
    }

    close(): void {
        this.connection?.dispose();
        this.webSocket?.close();
        this.connection = null;
        this.webSocket = null;
    }

    dispose(): void {
        this.close();
    }
}
