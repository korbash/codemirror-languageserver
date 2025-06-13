import { createLogger } from '../utils/logger';
import { CancelParams, ErrorCodes } from '../types/lsp';

export interface PendingRequest {
    id: string | number;
    method: string;
    abortController: AbortController;
    startTime: number;
}



export class RequestCancellation {
    private pendingRequests = new Map<string | number, PendingRequest>();
    private requestIdCounter = 0;
    private logger = createLogger('CLIENT');
    private serverCapabilities: any = null;

    constructor(
        private sendNotification: (method: string, params: any) => Promise<void>
    ) {
        this.logger.debug('RequestCancellation initialized');
    }

    /**
     * Создает новый запрос с поддержкой отмены
     */
    public createRequest(
        method: string,
        abortSignal?: AbortSignal
    ): PendingRequest {
        const id = this.generateRequestId();
        const abortController = new AbortController();

        this.logger.debug('Creating cancellable request', { id, method });

        // Создаем запрос
        const request: PendingRequest = {
            id,
            method,
            abortController,
            startTime: Date.now(),
        };

        // Если есть внешний AbortSignal, подписываемся на него
        if (abortSignal) {
            if (abortSignal.aborted) {
                this.logger.debug('External AbortSignal already aborted', { id, method });
                abortController.abort();
            } else {
                const abortHandler = () => {
                    this.logger.debug('External AbortSignal triggered', { id, method });
                    this.cancelRequest(id, 'External cancellation');
                };
                abortSignal.addEventListener('abort', abortHandler);

                // Очищаем обработчик при завершении запроса
                abortController.signal.addEventListener('abort', () => {
                    abortSignal.removeEventListener('abort', abortHandler);
                });
            }
        }

        this.pendingRequests.set(id, request);
        
        this.logger.debug('Request registered', {
            id,
            method,
            totalPendingRequests: this.pendingRequests.size,
        });

        return request;
    }

    /**
     * Отменяет запрос по ID
     */
    public async cancelRequest(id: string | number, reason: string = 'Request cancelled'): Promise<void> {
        const request = this.pendingRequests.get(id);
        if (!request) {
            this.logger.debug('Request not found for cancellation', { id });
            return;
        }

        this.logger.debug('Cancelling request', {
            id,
            method: request.method,
            reason,
            duration: Date.now() - request.startTime,
        });

        // Отменяем AbortController (это всегда нужно делать для разблокировки клиента)
        if (!request.abortController.signal.aborted) {
            request.abortController.abort();
        }

        // Отправляем LSP уведомление об отмене только если сервер поддерживает это
        if (this.serverSupportsCancellation()) {
            try {
                await this.sendNotification('$/cancelRequest', { id } as CancelParams);
                this.logger.debug('Sent $/cancelRequest notification', { id });
            } catch (error) {
                this.logger.warn('Failed to send cancel notification', { id, error });
            }
        } else {
            this.logger.debug('Server does not support cancellation, skipping $/cancelRequest', { id });
        }

        this.cleanupRequest(id);
    }

    /**
     * Завершает запрос (успешно или с ошибкой)
     */
    public completeRequest(id: string | number, success: boolean = true): void {
        const request = this.pendingRequests.get(id);
        if (!request) {
            this.logger.debug('Request not found for completion', { id });
            return;
        }

        this.logger.debug('Completing request', {
            id,
            method: request.method,
            success,
            duration: Date.now() - request.startTime,
        });

        this.cleanupRequest(id);
    }

    /**
     * Отменяет все активные запросы
     */
    public async cancelAllRequests(reason: string = 'Bulk cancellation'): Promise<void> {
        const requestIds = Array.from(this.pendingRequests.keys());
        
        this.logger.debug('Cancelling all requests', {
            count: requestIds.length,
            reason,
        });

        const cancelPromises = requestIds.map(id => this.cancelRequest(id, reason));
        await Promise.allSettled(cancelPromises);

        this.logger.debug('All requests cancelled', { count: requestIds.length });
    }

    /**
     * Получает информацию об активных запросах
     */
    public getPendingRequests(): ReadonlyMap<string | number, PendingRequest> {
        return this.pendingRequests;
    }

    /**
     * Проверяет, отменен ли запрос
     */
    public isRequestCancelled(id: string | number): boolean {
        const request = this.pendingRequests.get(id);
        return request?.abortController.signal.aborted ?? false;
    }

    /**
     * Получает AbortSignal для запроса
     */
    public getRequestAbortSignal(id: string | number): AbortSignal | undefined {
        const request = this.pendingRequests.get(id);
        return request?.abortController.signal;
    }

    /**
     * Проверяет, является ли ошибка результатом отмены
     */
    public static isCancellationError(error: any): boolean {
        if (!error) return false;
        
        // Проверяем LSP код ошибки
        if (error.code === ErrorCodes.RequestCancelled) {
            return true;
        }

        // Проверяем сообщение об ошибке
        const message = error.message || error.toString();
        return message.includes('cancelled') || 
               message.includes('aborted') || 
               message.includes('Request was aborted');
    }

    /**
     * Создает ошибку отмены запроса
     */
    public static createCancellationError(message: string = 'Request was cancelled'): Error {
        const error = new Error(message) as any;
        error.code = ErrorCodes.RequestCancelled;
        return error;
    }

    /**
     * Обновляет capabilities сервера
     */
    public updateServerCapabilities(capabilities: any): void {
        this.serverCapabilities = capabilities;
    }

    /**
     * Очищает ресурсы при уничтожении
     */
    public dispose(): void {
        this.logger.debug('Disposing RequestCancellation', {
            pendingRequests: this.pendingRequests.size,
        });

        // Отменяем все активные запросы
        this.cancelAllRequests('RequestCancellation disposed');
    }

    private generateRequestId(): string {
        return `req_${++this.requestIdCounter}_${Date.now()}`;
    }

    private cleanupRequest(id: string | number): void {
        const request = this.pendingRequests.get(id);
        if (!request) return;

        // Удаляем из карты
        this.pendingRequests.delete(id);

        this.logger.debug('Request cleaned up', {
            id,
            remainingRequests: this.pendingRequests.size,
        });
    }

    /**
     * Проверяет, поддерживает ли сервер отмену запросов
     */
    private serverSupportsCancellation(): boolean {
        return !!this.serverCapabilities;
    }
}