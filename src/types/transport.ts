export interface Transport {
    send(payload: string): void;
    onMessage(callback: (message: string) => void): void;
    onClose?(callback: () => void): void;
    onError?(callback: (error: Error) => void): void;
    close?(): void;
}

export interface TransportOptions {
    timeout?: number;
    reconnectAttempts?: number;
    reconnectDelay?: number;
}

export interface WebSocketTransportOptions extends TransportOptions {
    protocols?: string | string[];
}

export interface FetchTransportOptions extends TransportOptions {
    headers?: Record<string, string>;
    method?: string;
}
