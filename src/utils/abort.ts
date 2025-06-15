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

/**
 * Простой менеджер для централизованной работы с AbortSignal
 */
export class AbortSignalManager {
    private globalController: AbortController | null = null;
    private externalGlobalSignal: AbortSignal | null = null;
    private defaultTimeoutMs: number = 10000;

    /**
     * Устанавливает внешний AbortSignal как глобальный
     */
    public setGlobalSignal(signal: AbortSignal): void {
        logger.debug('External global AbortSignal set');
        this.externalGlobalSignal = signal;

        // Очищаем внутренний контроллер, если есть
        if (this.globalController) {
            this.globalController.abort();
            this.globalController = null;
        }
    }

    /**
     * Создает глобальный AbortSignal для всего проекта
     */
    public createGlobalSignal(timeoutMs?: number): AbortSignal {
        if (this.globalController) {
            this.globalController.abort();
        }

        this.globalController = timeoutMs
            ? createAbortControllerWithTimeout(timeoutMs)
            : new AbortController();

        // Очищаем внешний сигнал
        this.externalGlobalSignal = null;

        logger.debug('Global AbortSignal created', { timeoutMs });
        return this.globalController.signal;
    }

    /**
     * Получает текущий глобальный сигнал или создает новый с дефолтным таймаутом
     */
    public getGlobalSignal(): AbortSignal {
        // Приоритет внешнему сигналу
        if (this.externalGlobalSignal) {
            return this.externalGlobalSignal;
        }

        // Если есть внутренний контроллер, используем его
        if (this.globalController) {
            return this.globalController.signal;
        }

        // Создаем новый с дефолтным таймаутом
        this.globalController = createAbortControllerWithTimeout(
            this.defaultTimeoutMs,
        );
        logger.debug('Global AbortSignal created with default timeout', {
            timeoutMs: this.defaultTimeoutMs,
        });
        return this.globalController.signal;
    }

    /**
     * Создает сигнал, комбинированный с глобальным
     */
    public createSignal(localSignal?: AbortSignal): AbortSignal {
        // Если есть локальный сигнал, объединяем с глобальным
        if (localSignal) {
            const globalSignal = this.getGlobalSignal();
            return combineAbortSignals(globalSignal, localSignal);
        }

        // Если нет локального сигнала, возвращаем глобальный
        return this.getGlobalSignal();
    }

    /**
     * Отменяет глобальный сигнал (только если это внутренний контроллер)
     */
    public abort(): void {
        if (this.globalController) {
            logger.debug('Aborting global signal');
            this.globalController.abort();
        }
        // Внешние сигналы не отменяем - это ответственность внешнего кода
    }

    /**
     * Устанавливает дефолтный таймаут
     */
    public setDefaultTimeout(timeoutMs: number): void {
        this.defaultTimeoutMs = timeoutMs;
    }
}

// Глобальный экземпляр менеджера
export const globalAbortManager = new AbortSignalManager();
