import { has, set, get } from 'lodash';

import { QueueModel } from './queue/abstract_queue';
import { Worker } from './worker';
import { Message } from './message';
import { logger } from './logger';

class Manager {
    private workers: Worker[] = [];
    private workersMap: object = {};
    private queue: QueueModel;
    private runMultiple: boolean = false;
    private processing: boolean = false;
    private errorHandler: (error:Error) => void;

    constructor(queue: QueueModel,
        runMultiple: boolean = false) {
        // validate values
        if (queue instanceof QueueModel === false) {
            throw new Error('Invalid queue instance')
        }
        this.queue = queue;
        this.runMultiple = runMultiple;
        this.errorHandler = (error) => {
            logger.error(error);
        }
    }

    canRunMultiple() {
        return this.runMultiple;
    }

    getQueue() {
        return this.queue;
    }

    attachWorker(name: string, worker: Worker) {
        if (!has(this.workersMap, name)) {
            const index = (this.workers.push(worker) - 1);
            set(this.workersMap, name, index);
            logger.trace(`worker attached`, { name });
        }
    }

    retrieveWorker(name: string) {
        const workerIndex = get(this.workersMap, name, false);
        if (workerIndex !== false) {
            return this.workers[workerIndex];
        }
        return false;
    }

    async start(limit:number = 0) {
        logger.trace(`manager started`);
        let counter = 0;
        do {
            // check if something is being processed
            if (!this.processing) {
                try {
                    logger.trace(`pulling a message`);
                    // pull a job
                    const message:Message = await this.queue.pull();
                    logger.trace(`successully pulled a message`, { name: message.getName() });
                    if (!has(this.workersMap, message.getName())) {
                        // TODO: throw custom error with details so it wouldn't be retried
                        this.errorHandler(new Error(`handler "${message.getName()}" doesn't exists`));
                        // go to next message
                        continue;
                    }

                    const workerIndex = get(this.workersMap, message.getName(), false)
                    if (await this.workers[workerIndex].run(message.getData()) === false 
                    && this.workers[workerIndex].shouldRetry()) {
                        logger.trace(`processing failed. republishing message..`, { name: message.getName(), data: message.getData() })
                        await this.queue.push(message.getName(), message.getData());
                    }
                } catch (error) {
                    this.errorHandler(error);
                }
            }
        } while (limit === 0 || counter++ < limit);
    }

    async end() {
        // wait for processing to finish
    }
}

export { Manager };