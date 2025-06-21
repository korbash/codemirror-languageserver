/**
 * Simple WebSocket Transport for LSP communication.
 *
 * This is a basic WebSocket transport implementation for testing and simple use cases.
 * For production use, consider using the full ConnectionManager with Microsoft's
 * vscode-languageserver-protocol infrastructure.
 */

export class WebSocketTransport {
    private _websocket: WebSocket | null = null;
    private _url: string;
    private _isConnected: boolean = false;
    private _connectPromise: Promise<void> | null = null;

    constructor(url: string) {
        this._url = url;
    }

    /**
     * Connect to the WebSocket server
     */
    async connect(): Promise<void> {
        if (this._connectPromise) {
            return this._connectPromise;
        }

        if (this._isConnected && this._websocket) {
            return Promise.resolve();
        }

        this._connectPromise = new Promise((resolve, reject) => {
            try {
                this._websocket = new WebSocket(this._url);

                this._websocket.onopen = () => {
                    this._isConnected = true;
                    this._connectPromise = null;
                    resolve();
                };

                this._websocket.onerror = (event) => {
                    this._isConnected = false;
                    this._connectPromise = null;

                    // Create a proper error message for connection refused
                    const error = new Error(
                        `ECONNREFUSED: Connection refused to ${this._url}`,
                    );
                    reject(error);
                };

                this._websocket.onclose = () => {
                    this._isConnected = false;
                    this._websocket = null;
                };

                // Set a timeout for connection
                setTimeout(() => {
                    if (!this._isConnected) {
                        this._websocket?.close();
                        this._connectPromise = null;
                        reject(new Error(`Connection timeout to ${this._url}`));
                    }
                }, 10000); // 10 second timeout
            } catch (error) {
                this._connectPromise = null;
                reject(error);
            }
        });

        return this._connectPromise;
    }

    /**
     * Get the connection status
     */
    get isConnected(): boolean {
        return this._isConnected && this._websocket !== null;
    }

    /**
     * Get the underlying WebSocket connection
     * Throws an error if not connected
     */
    get connection(): WebSocket {
        if (!this._isConnected || !this._websocket) {
            throw new Error(
                'WebSocket is not connected. Call connect() first.',
            );
        }
        return this._websocket;
    }

    /**
     * Close the WebSocket connection
     */
    close(): void {
        if (this._websocket) {
            this._websocket.close();
            this._websocket = null;
        }
        this._isConnected = false;
        this._connectPromise = null;
    }

    /**
     * Send a message through the WebSocket
     */
    send(message: string): void {
        if (!this._isConnected || !this._websocket) {
            throw new Error(
                'WebSocket is not connected. Call connect() first.',
            );
        }
        this._websocket.send(message);
    }

    /**
     * Set up message handler
     */
    onMessage(handler: (data: string) => void): () => void {
        if (!this._websocket) {
            throw new Error(
                'WebSocket is not connected. Call connect() first.',
            );
        }

        const messageHandler = (event: MessageEvent) => {
            handler(event.data);
        };

        this._websocket.addEventListener('message', messageHandler);

        // Return cleanup function
        return () => {
            this._websocket?.removeEventListener('message', messageHandler);
        };
    }

    /**
     * Set up error handler
     */
    onError(handler: (error: Error) => void): () => void {
        if (!this._websocket) {
            throw new Error(
                'WebSocket is not connected. Call connect() first.',
            );
        }

        const errorHandler = (event: Event) => {
            handler(new Error('WebSocket error occurred'));
        };

        this._websocket.addEventListener('error', errorHandler);

        // Return cleanup function
        return () => {
            this._websocket?.removeEventListener('error', errorHandler);
        };
    }

    /**
     * Set up close handler
     */
    onClose(handler: () => void): () => void {
        if (!this._websocket) {
            throw new Error(
                'WebSocket is not connected. Call connect() first.',
            );
        }

        const closeHandler = () => {
            this._isConnected = false;
            handler();
        };

        this._websocket.addEventListener('close', closeHandler);

        // Return cleanup function
        return () => {
            this._websocket?.removeEventListener('close', closeHandler);
        };
    }
}
