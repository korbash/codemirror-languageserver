export interface Transport {
    connect?(abortSignal?: AbortSignal): Promise<void>;
    send(payload: string): void;
    onMessage(callback: (message: string) => void): void;
    onClose?(callback: () => void): void;
    onError?(callback: (error: Error) => void): void;
    close?(): void;
}

export interface TransportOptions {
    reconnectAttempts?: number;
    reconnectDelay?: number;
    abortSignal?: AbortSignal;
}

export interface WebSocketTransportOptions extends TransportOptions {
    protocols?: string | string[];
}

export interface FetchTransportOptions extends TransportOptions {
    headers?: Record<string, string>;
    method?: string;
}
