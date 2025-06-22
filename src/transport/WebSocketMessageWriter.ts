/**
 * Microsoft MessageWriter implementation for WebSocket transport.
 *
 * This implements the vscode-languageserver-protocol MessageWriter interface
 * to provide seamless integration with Microsoft's LSP infrastructure while
 * using WebSocket as the underlying transport.
 */

import {
    MessageWriter,
    Message,
    Disposable,
    Event as LSPEvent,
    Emitter,
} from 'vscode-languageserver-protocol';

/**
 * Options for WebSocket message writer configuration
 */
export interface WebSocketMessageWriterOptions {
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

    /**
     * Use LSP message format with Content-Length headers
     */
    useLSPFormat?: boolean;

    /**
     * Queue messages when WebSocket is not ready
     */
    queueWhenNotReady?: boolean;
}

/**
 * Message queue entry
 */
interface QueuedMessage {
    message: Message;
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
}

/**
 * WebSocket-based implementation of Microsoft's MessageWriter interface
 */
export class WebSocketMessageWriter implements MessageWriter {
    private readonly onErrorEmitter = new Emitter<
        [Error, Message | undefined, number | undefined]
    >();
    private readonly onCloseEmitter = new Emitter<void>();

    private disposed = false;
    private writeMessageCount = 0;
    private readonly messageQueue: QueuedMessage[] = [];
    private readonly cleanupFunctions = new Set<() => void>();

    // Configuration
    private readonly maxMessageSize: number;
    private readonly encoding: string;
    private readonly debug: boolean;
    private readonly logger: (message: string, ...args: any[]) => void;
    private readonly useLSPFormat: boolean;
    private readonly queueWhenNotReady: boolean;

    constructor(
        private readonly webSocket: WebSocket,
        options: WebSocketMessageWriterOptions = {},
    ) {
        this.maxMessageSize = options.maxMessageSize ?? 16 * 1024 * 1024; // 16MB
        this.encoding = options.encoding ?? 'utf-8';
        this.debug = options.debug ?? false;
        this.logger = options.logger ?? (() => {});
        this.useLSPFormat = options.useLSPFormat ?? false;
        this.queueWhenNotReady = options.queueWhenNotReady ?? true;

        this.setupWebSocketHandlers();
    }

    /**
     * Microsoft MessageWriter interface - error event
     */
    get onError(): LSPEvent<[Error, Message | undefined, number | undefined]> {
        return this.onErrorEmitter.event;
    }

    /**
     * Microsoft MessageWriter interface - close event
     */
    get onClose(): LSPEvent<void> {
        return this.onCloseEmitter.event;
    }

    /**
     * Microsoft MessageWriter interface - write a message
     */
    write(msg: Message): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.disposed) {
                reject(new Error('WebSocketMessageWriter has been disposed'));
                return;
            }

            try {
                // Validate message size
                const serialized = JSON.stringify(msg);
                if (serialized.length > this.maxMessageSize) {
                    throw new Error(
                        `Message size ${serialized.length} exceeds maximum ${this.maxMessageSize}`,
                    );
                }

                const method = (msg as any).method || 'unknown';
                this.log(
                    `Writing message: ${method} (${serialized.length} bytes)`,
                );

                // Handle different WebSocket states
                if (this.webSocket.readyState === WebSocket.OPEN) {
                    this.sendMessage(msg, resolve, reject);
                } else if (
                    this.queueWhenNotReady &&
                    this.webSocket.readyState === WebSocket.CONNECTING
                ) {
                    // Queue message if WebSocket is connecting
                    this.queueMessage(msg, resolve, reject);
                } else {
                    reject(
                        new Error(
                            `WebSocket is not ready (state: ${this.webSocket.readyState})`,
                        ),
                    );
                }
            } catch (error) {
                this.handleError(
                    error instanceof Error ? error : new Error(String(error)),
                    msg,
                );
                reject(error);
            }
        });
    }

    /**
     * Microsoft MessageWriter interface - end the writer
     */
    end(): void {
        this.log('Ending WebSocketMessageWriter');
        this.dispose();
    }

    /**
     * Microsoft MessageWriter interface - dispose the writer
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;

        // Reject all queued messages
        for (const queuedMessage of this.messageQueue) {
            queuedMessage.reject(
                new Error(
                    'WebSocketMessageWriter disposed while message was queued',
                ),
            );
        }
        this.messageQueue.length = 0;

        // Run all cleanup functions
        for (const cleanup of Array.from(this.cleanupFunctions)) {
            try {
                cleanup();
            } catch (error) {
                // Ignore cleanup errors
            }
        }
        this.cleanupFunctions.clear();

        // Dispose event emitters
        this.onErrorEmitter.dispose();
        this.onCloseEmitter.dispose();

        this.log('WebSocketMessageWriter disposed');
    }

    /**
     * Send a message immediately
     */
    private sendMessage(
        message: Message,
        resolve: () => void,
        reject: (error: Error) => void,
    ): void {
        try {
            const data = this.formatMessage(message);
            this.webSocket.send(data);
            this.writeMessageCount++;
            const method = (message as any).method || 'unknown';
            this.log(`Message sent: ${method} (#${this.writeMessageCount})`);
            resolve();
        } catch (error) {
            this.handleError(
                error instanceof Error ? error : new Error(String(error)),
                message,
            );
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Queue a message for later sending
     */
    private queueMessage(
        message: Message,
        resolve: () => void,
        reject: (error: Error) => void,
    ): void {
        this.messageQueue.push({
            message,
            resolve,
            reject,
            timestamp: Date.now(),
        });

        const method = (message as any).method || 'unknown';
        this.log(
            `Message queued: ${method} (queue size: ${this.messageQueue.length})`,
        );
    }

    /**
     * Process queued messages when WebSocket becomes ready
     */
    private processQueuedMessages(): void {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.log(`Processing ${this.messageQueue.length} queued messages`);

        while (
            this.messageQueue.length > 0 &&
            this.webSocket.readyState === WebSocket.OPEN
        ) {
            const queuedMessage = this.messageQueue.shift()!;
            this.sendMessage(
                queuedMessage.message,
                queuedMessage.resolve,
                queuedMessage.reject,
            );
        }
    }

    /**
     * Format message according to LSP protocol or as direct JSON
     */
    private formatMessage(message: Message): string {
        const content = JSON.stringify(message);

        if (this.useLSPFormat) {
            // LSP format: Content-Length header + JSON content
            const contentLength = Buffer.byteLength(
                content,
                this.encoding as BufferEncoding,
            );
            return `Content-Length: ${contentLength}\r\n\r\n${content}`;
        } else {
            // Direct JSON format
            return content;
        }
    }

    /**
     * Set up WebSocket event handlers
     */
    private setupWebSocketHandlers(): void {
        // Handle WebSocket open
        const openHandler = () => {
            this.log('WebSocket opened, processing queued messages');
            this.processQueuedMessages();
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

            // Reject all queued messages
            for (const queuedMessage of this.messageQueue) {
                queuedMessage.reject(
                    new Error(
                        `WebSocket closed: ${event.reason || 'Unknown reason'}`,
                    ),
                );
            }
            this.messageQueue.length = 0;

            this.onCloseEmitter.fire();
        };

        // Add event listeners
        this.webSocket.addEventListener('open', openHandler);
        this.webSocket.addEventListener('error', errorHandler);
        this.webSocket.addEventListener('close', closeHandler);

        // Add cleanup functions
        this.cleanupFunctions.add(() =>
            this.webSocket.removeEventListener('open', openHandler),
        );
        this.cleanupFunctions.add(() =>
            this.webSocket.removeEventListener('error', errorHandler),
        );
        this.cleanupFunctions.add(() =>
            this.webSocket.removeEventListener('close', closeHandler),
        );
    }

    /**
     * Handle errors
     */
    private handleError(error: Error, message?: Message): void {
        this.log(`Error: ${error.message}`);
        this.onErrorEmitter.fire([error, message, this.writeMessageCount]);
    }

    /**
     * Debug logging
     */
    private log(message: string, ...args: any[]): void {
        if (this.debug) {
            this.logger(`[WebSocketMessageWriter] ${message}`, ...args);
        }
    }

    /**
     * Get current WebSocket ready state
     */
    get readyState(): number {
        return this.webSocket.readyState;
    }

    /**
     * Check if writer is connected
     */
    get isConnected(): boolean {
        return this.webSocket.readyState === WebSocket.OPEN;
    }

    /**
     * Check if writer is disposed
     */
    get isDisposed(): boolean {
        return this.disposed;
    }

    /**
     * Get number of messages written
     */
    get messageCount(): number {
        return this.writeMessageCount;
    }

    /**
     * Get number of queued messages
     */
    get queuedMessageCount(): number {
        return this.messageQueue.length;
    }

    /**
     * Clear message queue (reject all)
     */
    clearQueue(): void {
        for (const queuedMessage of this.messageQueue) {
            queuedMessage.reject(new Error('Message queue cleared'));
        }
        this.messageQueue.length = 0;
        this.log('Message queue cleared');
    }
}
