import { createLogger } from './logger';

const logger = createLogger('UTILS');

/**
 * Создает AbortController с автоматическим таймаутом
 */
export function createAbortControllerWithTimeout(
    timeoutMs: number,
): AbortController {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
        logger.debug('AbortController timeout triggered', { timeoutMs });
        controller.abort();
    }, timeoutMs);

    // Очищаем таймаут, если операция была отменена другим способом
    controller.signal.addEventListener(
        'abort',
        () => {
            clearTimeout(timeoutId);
        },
        { once: true },
    );

    return controller;
}

/**
 * Объединяет несколько AbortSignal в один
 * Возвращает signal, который срабатывает при отмене любого из входных signals
 */
export function combineAbortSignals(
    ...signals: (AbortSignal | undefined)[]
): AbortSignal {
    const validSignals = signals.filter(Boolean) as AbortSignal[];

    if (validSignals.length === 0) {
        return new AbortController().signal;
    }

    if (validSignals.length === 1) {
        return validSignals[0];
    }

    // Если какой-то signal уже отменен, возвращаем отмененный
    if (validSignals.some((signal) => signal.aborted)) {
        const controller = new AbortController();
        controller.abort();
        return controller.signal;
    }

    const controller = new AbortController();

    // Подписываемся на все signals
    validSignals.forEach((signal) => {
        signal.addEventListener(
            'abort',
            () => {
                logger.debug('Combined AbortSignal triggered');
                controller.abort();
            },
            { once: true },
        );
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
export function throwIfAborted(
    signal?: AbortSignal,
    message: string = 'Operation was aborted',
): void {
    if (isAborted(signal)) {
        throw new Error(message);
    }
}
