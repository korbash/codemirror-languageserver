import {
    MessageReader,
    MessageWriter,
    DataCallback,
    Message,
    AbstractMessageReader,
    AbstractMessageWriter,
    Disposable,
    Event,
    PartialMessageInfo,
} from 'vscode-jsonrpc';

/**
 * WebSocket-based MessageReader for ProtocolConnection
 */
export class WebSocketMessageReader
    extends AbstractMessageReader
    implements MessageReader
{
    private ws: WebSocket;
    private _callback: DataCallback | undefined = undefined;
    private listening = false;
    private disposed = false;

    constructor(ws: WebSocket) {
        super();
        this.ws = ws;
        this.setupWebSocketHandlers();
    }

    private setupWebSocketHandlers(): void {
        this.ws.onmessage = (event) => {
            if (this.disposed || !this.listening) return;

            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                this.fireError(error);
            }
        };

        this.ws.onclose = (event) => {
            if (!this.disposed) {
                this.fireClose();
            }
        };

        this.ws.onerror = () => {
            if (!this.disposed) {
                this.fireError(new Error('WebSocket MessageReader error'));
            }
        };
    }

    private get callback(): DataCallback {
        if (!this._callback) {
            throw new Error('MessageReader callback is not set');
        }
        return this._callback;
    }

    get onPartialMessage(): Event<PartialMessageInfo> {
        throw new Error(
            'WebSocketMessageReader does not support partial messages',
        );
    }

    /**
     * Обрабатывает полученное сообщение через WebSocket.
     * Использует геттер callback для безопасного получения callback'а с автоматической проверкой.
     */
    private handleMessage(message: Message): void {
        if (!this.listening) {
            throw new Error('MessageReader is not listening');
        }
        this.callback(message);
    }

    listen(callback: DataCallback): Disposable {
        if (this.disposed) {
            throw new Error('MessageReader is disposed');
        }

        if (this.listening) {
            throw new Error('MessageReader is already listening');
        }

        this._callback = callback;
        this.listening = true;

        return {
            dispose: () => {
                this.listening = false;
                this._callback = undefined;
            },
        };
    }

    dispose(): void {
        if (this.disposed) return;

        this.disposed = true;
        this.listening = false;
        this._callback = undefined;
        super.dispose();

        // Don't close the WebSocket here - let the transport manage it
    }
}

/**
 * WebSocket-based MessageWriter for ProtocolConnection
 */
export class WebSocketMessageWriter
    extends AbstractMessageWriter
    implements MessageWriter
{
    private ws: WebSocket;
    private disposed = false;

    constructor(ws: WebSocket) {
        super();
        this.ws = ws;
        this.setupWebSocketHandlers();
    }

    private setupWebSocketHandlers(): void {
        this.ws.onclose = () => {
            if (!this.disposed) {
                this.fireClose();
            }
        };

        this.ws.onerror = () => {
            if (!this.disposed) {
                this.fireError(new Error('WebSocket MessageWriter error'));
            }
        };
    }

    async write(msg: Message): Promise<void> {
        if (this.disposed) {
            throw new Error('MessageWriter is disposed');
        }

        if (this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }

        try {
            const data = JSON.stringify(msg);
            this.ws.send(data);
        } catch (error) {
            this.fireError(error);
            throw error;
        }
    }

    end(): void {
        if (this.disposed) return;

        this.disposed = true;

        // Don't close the WebSocket here - let the transport manage it
    }

    dispose(): void {
        if (this.disposed) return;

        this.disposed = true;
        super.dispose();
    }
}
