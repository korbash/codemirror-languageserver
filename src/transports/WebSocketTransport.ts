import { Transport, WebSocketTransportOptions } from '../types/transport';

export class WebSocketTransport implements Transport {
    private ws: WebSocket | null = null;
    private messageHandler: ((message: string) => void) | null = null;
    private closeHandler: (() => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private abortSignal: AbortSignal | null = null;

    constructor(
        private url: string,
        options: WebSocketTransportOptions = {},
    ) {
        this.abortSignal = options.abortSignal || null;
    }

    public connect(abortSignal?: AbortSignal): Promise<void> {
        const signal = abortSignal || this.abortSignal;

        return new Promise((resolve, reject) => {
            // Check if already aborted
            if (signal?.aborted) {
                reject(new Error('Operation was aborted'));
                return;
            }

            try {
                this.ws = new WebSocket(this.url);

                const abortHandler = () => {
                    if (this.ws) {
                        this.ws.close();
                    }
                    reject(new Error('Operation was aborted'));
                };

                if (signal) {
                    signal.addEventListener('abort', abortHandler);
                }

                this.ws.onopen = () => {
                    if (signal) {
                        signal.removeEventListener('abort', abortHandler);
                    }
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    if (this.messageHandler) {
                        this.messageHandler(event.data);
                    }
                };

                this.ws.onclose = () => {
                    if (signal) {
                        signal.removeEventListener('abort', abortHandler);
                    }
                    if (this.closeHandler) {
                        this.closeHandler();
                    }
                };

                this.ws.onerror = (event) => {
                    if (signal) {
                        signal.removeEventListener('abort', abortHandler);
                    }
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
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    public get connection(): WebSocket | null {
        return this.ws;
    }

    public get isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}
