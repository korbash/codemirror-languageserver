import { createLogger } from './logger';

const logger = createLogger('UTILS');

/**
 * Создает AbortController с автоматическим таймаутом
 */
export function createAbortControllerWithTimeout(timeoutMs: number): AbortController {
    const controller = new AbortController();
    
    const timeoutId = setTimeout(() => {
        logger.debug('AbortController timeout triggered', { timeoutMs });
        controller.abort();
    }, timeoutMs);

    // Очищаем таймаут, если операция была отменена другим способом
    controller.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
    });

    return controller;
}

/**
 * Объединяет несколько AbortSignal в один
 * Возвращает signal, который срабатывает при отмене любого из входных signals
 */
export function combineAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
    const validSignals = signals.filter((signal): signal is AbortSignal => !!signal);
    
    if (validSignals.length === 0) {
        // Возвращаем signal, который никогда не отменяется
        return new AbortController().signal;
    }
    
    if (validSignals.length === 1) {
        return validSignals[0];
    }

    // Проверяем, если какой-то signal уже отменен
    const abortedSignal = validSignals.find(signal => signal.aborted);
    if (abortedSignal) {
        const controller = new AbortController();
        controller.abort();
        return controller.signal;
    }

    const controller = new AbortController();
    
    const abortHandler = () => {
        logger.debug('Combined AbortSignal triggered');
        controller.abort();
    };

    // Подписываемся на все signals
    validSignals.forEach(signal => {
        signal.addEventListener('abort', abortHandler);
    });

    // Очищаем обработчики при отмене
    controller.signal.addEventListener('abort', () => {
        validSignals.forEach(signal => {
            signal.removeEventListener('abort', abortHandler);
        });
    });

    return controller.signal;
}

/**
 * Создает AbortSignal, который отменяется при разрешении Promise
 */
export function createAbortSignalFromPromise<T>(promise: Promise<T>): AbortSignal {
    const controller = new AbortController();
    
    promise
        .then(() => {
            logger.debug('Promise resolved, aborting signal');
            controller.abort();
        })
        .catch(() => {
            logger.debug('Promise rejected, aborting signal');
            controller.abort();
        });

    return controller.signal;
}

/**
 * Проверяет, отменен ли AbortSignal
 */
export function isAborted(signal?: AbortSignal): boolean {
    return signal?.aborted ?? false;
}

/**
 * Бросает ошибку, если AbortSignal отменен
 */
export function throwIfAborted(signal?: AbortSignal, message: string = 'Operation was aborted'): void {
    if (isAborted(signal)) {
        throw new Error(message);
    }
}

/**
 * Создает Promise, который отклоняется при отмене AbortSignal
 */
export function createAbortablePromise<T>(
    executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
    signal?: AbortSignal
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        // Проверяем начальное состояние
        if (isAborted(signal)) {
            reject(new Error('Operation was aborted'));
            return;
        }

        let isResolved = false;

        const abortHandler = () => {
            if (!isResolved) {
                isResolved = true;
                reject(new Error('Operation was aborted'));
            }
        };

        if (signal) {
            signal.addEventListener('abort', abortHandler);
        }

        const cleanup = () => {
            if (signal) {
                signal.removeEventListener('abort', abortHandler);
            }
        };

        const wrappedResolve = (value: T) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve(value);
            }
        };

        const wrappedReject = (reason?: any) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                reject(reason);
            }
        };

        try {
            executor(wrappedResolve, wrappedReject);
        } catch (error) {
            wrappedReject(error);
        }
    });
}

/**
 * Добавляет поддержку AbortSignal к существующему Promise
 */
export function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
        return promise;
    }

    if (isAborted(signal)) {
        return Promise.reject(new Error('Operation was aborted'));
    }

    return new Promise<T>((resolve, reject) => {
        let isResolved = false;

        const abortHandler = () => {
            if (!isResolved) {
                isResolved = true;
                reject(new Error('Operation was aborted'));
            }
        };

        signal.addEventListener('abort', abortHandler);

        promise
            .then((value) => {
                if (!isResolved) {
                    isResolved = true;
                    signal.removeEventListener('abort', abortHandler);
                    resolve(value);
                }
            })
            .catch((error) => {
                if (!isResolved) {
                    isResolved = true;
                    signal.removeEventListener('abort', abortHandler);
                    reject(error);
                }
            });
    });
}

/**
 * Создает задержку с поддержкой AbortSignal
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
    return createAbortablePromise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, ms);
        
        if (signal) {
            signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
            });
        }
    }, signal);
}