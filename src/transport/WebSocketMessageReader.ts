/**
 * Microsoft MessageReader implementation for WebSocket transport.
 *
 * This implements the vscode-languageserver-protocol MessageReader interface
 * to provide seamless integration with Microsoft's LSP infrastructure while
 * using WebSocket as the underlying transport.
 */

import {
    MessageReader,
    DataCallback,
    Disposable,
    Event as LSPEvent,
    Emitter,
} from 'vscode-languageserver-protocol';

import { Subscription, wrapDisposable } from '../types/Subscription.js';

/**
 * Options for WebSocket message reader configuration
 */
export interface WebSocketMessageReaderOptions {
    /**
     * Maximum message size in bytes (default: 16MB)
     */
    maxMessageSize?: number;

    /**
     * Encoding for text messages (default: 'utf-8')
     */
    encoding?: string;

    /**
     * Enable debug logging
     */
    debug?: boolean;

    /**
     * Custom logger function
     */
    logger?: (message: string, ...args: any[]) => void;
}

/**
 * WebSocket-based implementation of Microsoft's MessageReader interface
 */
export class WebSocketMessageReader implements MessageReader {
    private readonly onErrorEmitter = new Emitter<Error>();
    private readonly onCloseEmitter = new Emitter<void>();
    private readonly onPartialMessageEmitter = new Emitter<{
        messageToken: number;
        waitingTime: number;
    }>();

    private listening = false;
    private disposed = false;
    private messageCallback?: DataCallback;
    private readonly subscriptions = new Set<Subscription>();

    // Configuration
    private readonly maxMessageSize: number;
    private readonly encoding: string;
    private readonly debug: boolean;
    private readonly logger: (message: string, ...args: any[]) => void;

    constructor(
        private readonly webSocket: WebSocket,
        options: WebSocketMessageReaderOptions = {},
    ) {
        this.maxMessageSize = options.maxMessageSize ?? 16 * 1024 * 1024; // 16MB
        this.encoding = options.encoding ?? 'utf-8';
        this.debug = options.debug ?? false;
        this.logger = options.logger ?? (() => {});

        this.setupWebSocketHandlers();
    }

    /**
     * Microsoft MessageReader interface - error event
     */
    get onError(): LSPEvent<Error> {
        return this.onErrorEmitter.event;
    }

    /**
     * Microsoft MessageReader interface - close event
     */
    get onClose(): LSPEvent<void> {
        return this.onCloseEmitter.event;
    }

    /**
     * Microsoft MessageReader interface - partial message event
     */
    get onPartialMessage(): LSPEvent<{
        messageToken: number;
        waitingTime: number;
    }> {
        return this.onPartialMessageEmitter.event;
    }

    /**
     * Microsoft MessageReader interface - start listening for messages
     */
    listen(callback: DataCallback): Disposable {
        if (this.listening) {
            throw new Error('WebSocketMessageReader is already listening');
        }

        if (this.disposed) {
            throw new Error('WebSocketMessageReader has been disposed');
        }

        this.listening = true;
        this.messageCallback = callback;

        this.log('Started listening for messages');

        return {
            dispose: () => {
                this.listening = false;
                this.messageCallback = undefined;
                this.log('Stopped listening for messages');
            },
        };
    }

    /**
     * Microsoft MessageReader interface - dispose the reader
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.listening = false;
        this.messageCallback = undefined;

        // Dispose all subscriptions
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions.clear();

        // Dispose event emitters
        this.onErrorEmitter.dispose();
        this.onCloseEmitter.dispose();
        this.onPartialMessageEmitter.dispose();

        this.log('WebSocketMessageReader disposed');
    }

    /**
     * Set up WebSocket event handlers
     */
    private setupWebSocketHandlers(): void {
        // Handle incoming messages
        const messageHandler = (event: MessageEvent) => {
            this.handleWebSocketMessage(event);
        };

        // Handle WebSocket errors
        const errorHandler = (event: Event) => {
            const error = new Error(`WebSocket error: ${event.type}`);
            this.handleError(error);
        };

        // Handle WebSocket close
        const closeHandler = (event: CloseEvent) => {
            this.log(
                `WebSocket closed: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`,
            );
            this.onCloseEmitter.fire();
        };

        // Add event listeners
        this.webSocket.addEventListener('message', messageHandler);
        this.webSocket.addEventListener('error', errorHandler);
        this.webSocket.addEventListener('close', closeHandler);

        // Create subscriptions for cleanup
        const messageSubscription = new Subscription(
            () => this.webSocket.removeEventListener('message', messageHandler),
            'websocket-message-handler',
        );

        const errorSubscription = new Subscription(
            () => this.webSocket.removeEventListener('error', errorHandler),
            'websocket-error-handler',
        );

        const closeSubscription = new Subscription(
            () => this.webSocket.removeEventListener('close', closeHandler),
            'websocket-close-handler',
        );

        this.subscriptions.add(messageSubscription);
        this.subscriptions.add(errorSubscription);
        this.subscriptions.add(closeSubscription);
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleWebSocketMessage(event: MessageEvent): void {
        if (!this.listening || !this.messageCallback) {
            return;
        }

        try {
            const data = event.data;

            if (typeof data !== 'string') {
                throw new Error(
                    'WebSocket message must be a string for LSP protocol',
                );
            }

            // Check message size
            if (data.length > this.maxMessageSize) {
                throw new Error(
                    `Message size ${data.length} exceeds maximum ${this.maxMessageSize}`,
                );
            }

            this.log(`Received message: ${data.length} bytes`);

            // Parse LSP message format
            const message = this.parseLSPMessage(data);

            if (message) {
                this.messageCallback(message);
            }
        } catch (error) {
            this.handleError(
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Parse LSP message format (Content-Length header + JSON content)
     */
    private parseLSPMessage(data: string): any | null {
        try {
            // For WebSocket, we might receive either:
            // 1. Raw JSON (direct message)
            // 2. LSP format with headers (Content-Length: xxx\r\n\r\n{json})

            if (data.startsWith('Content-Length:')) {
                return this.parseLSPFormatMessage(data);
            } else {
                // Try parsing as direct JSON
                return JSON.parse(data);
            }
        } catch (error) {
            this.log(`Failed to parse message: ${error}`);
            throw new Error(`Invalid LSP message format: ${error}`);
        }
    }

    /**
     * Parse LSP format message with headers
     */
    private parseLSPFormatMessage(data: string): any {
        const headerEndIndex = data.indexOf('\r\n\r\n');
        if (headerEndIndex === -1) {
            throw new Error('Invalid LSP message: missing header separator');
        }

        const headers = data.substring(0, headerEndIndex);
        const content = data.substring(headerEndIndex + 4);

        // Parse Content-Length header
        const contentLengthMatch = headers.handleResult(/Content-Length:\s*(\d+)/i);
        if (!contentLengthMatch) {
            throw new Error(
                'Invalid LSP message: missing Content-Length header',
            );
        }

        const contentLength = parseInt(contentLengthMatch[1], 10);
        if (content.length !== contentLength) {
            this.log(
                `Content length mismatch: expected ${contentLength}, got ${content.length}`,
            );
            // Don't throw error, just log warning as some servers might have slight discrepancies
        }

        return JSON.parse(content);
    }

    /**
     * Handle errors
     */
    private handleError(error: Error): void {
        this.log(`Error: ${error.message}`);
        this.onErrorEmitter.fire(error);
    }

    /**
     * Debug logging
     */
    private log(message: string, ...args: any[]): void {
        if (this.debug) {
            this.logger(`[WebSocketMessageReader] ${message}`, ...args);
        }
    }

    /**
     * Get current WebSocket ready state
     */
    get readyState(): number {
        return this.webSocket.readyState;
    }

    /**
     * Check if reader is connected
     */
    get isConnected(): boolean {
        return this.webSocket.readyState === WebSocket.OPEN;
    }

    /**
     * Check if reader is listening
     */
    get isListening(): boolean {
        return this.listening;
    }

    /**
     * Check if reader is disposed
     */
    get isDisposed(): boolean {
        return this.disposed;
    }
}
