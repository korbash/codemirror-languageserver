import { Transport, WebSocketTransportOptions } from '../types/transport';

export class WebSocketTransport implements Transport {
    private ws: WebSocket | null = null;
    private messageHandler: ((message: string) => void) | null = null;
    private closeHandler: (() => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private options: WebSocketTransportOptions;
    private reconnectAttempts = 0;
    private reconnectTimer: number | null = null;

    constructor(private url: string, options: WebSocketTransportOptions = {}) {
        this.options = {
            timeout: 30000,
            reconnectAttempts: 3,
            reconnectDelay: 1000,
            ...options,
        };
    }

    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url, this.options.protocols);

                const timeout = setTimeout(() => {
                    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                        this.ws.close();
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, this.options.timeout);

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    if (this.messageHandler) {
                        this.messageHandler(event.data);
                    }
                };

                this.ws.onclose = () => {
                    clearTimeout(timeout);
                    if (this.closeHandler) {
                        this.closeHandler();
                    }
                    this.attemptReconnect();
                };

                this.ws.onerror = (event) => {
                    clearTimeout(timeout);
                    const error = new Error('WebSocket error');
                    if (this.errorHandler) {
                        this.errorHandler(error);
                    }
                    reject(error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    public send(payload: string): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(payload);
        } else {
            throw new Error('WebSocket is not connected');
        }
    }

    public onMessage(callback: (message: string) => void): void {
        this.messageHandler = callback;
    }

    public onClose(callback: () => void): void {
        this.closeHandler = callback;
    }

    public onError(callback: (error: Error) => void): void {
        this.errorHandler = callback;
    }

    public close(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts < (this.options.reconnectAttempts || 3)) {
            this.reconnectAttempts++;
            this.reconnectTimer = window.setTimeout(() => {
                this.connect().catch(() => {
                    // Reconnection failed, will try again or give up
                });
            }, this.options.reconnectDelay || 1000);
        }
    }

    public get connection(): WebSocket | null {
        return this.ws;
    }

    public get isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}
