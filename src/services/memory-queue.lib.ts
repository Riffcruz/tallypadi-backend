import { EventEmitter } from 'events';

// Global registry to share state between Queue (producer) and Worker (consumer)
const globalQueues = new Map<string, MemoryQueue>();

export const getMemoryQueue = (name: string) => {
  if (!globalQueues.has(name)) {
    globalQueues.set(name, new MemoryQueue(name));
  }
  return globalQueues.get(name)!;
};

export class MemoryQueue extends EventEmitter {
  public name: string;
  private jobs: any[] = [];
  private processor: Function | null = null;
  private isProcessing = false;
  private concurrency = 1;
  private activeCount = 0;

  constructor(name: string, opts?: any) {
    super();
    this.name = name;
  }

  async add(name: string, data: any, opts?: any) {
    // Mimic BullMQ Job structure
    const job = { 
        name, // 'send-text', etc.
        data, 
        opts, 
        id: opts?.jobId || Date.now().toString() + Math.random().toString().slice(2),
        attemptsMade: 0
    };
    
    this.jobs.push(job);
    
    // Trigger processing on next tick
    setImmediate(() => this.processNext());
    
    return job; // Return job mimic
  }

  setHandler(handler: Function, opts?: any) {
    this.processor = handler;
    if (opts?.concurrency) {
        this.concurrency = opts.concurrency;
    }
    this.processNext();
  }

  private async processNext() {
    // Stop if no handler, no jobs, or max concurrency reached
    if (!this.processor || this.jobs.length === 0 || this.activeCount >= this.concurrency) {
        return;
    }

    const job = this.jobs.shift();
    if (!job) return;

    this.activeCount++;

    // Run async without blocking the loop
    (async () => {
        try {
            await this.processor!(job);
            this.emit('completed', job);
        } catch (err) {
            console.error(`[MemoryQueue:${this.name}] Job Failed:`, err);
            this.emit('failed', job, err);
        } finally {
            this.activeCount--;
            // Trigger next
            setImmediate(() => this.processNext());
        }
    })();
    
    // Try to spawn more if concurrency allows
    setImmediate(() => this.processNext());
  }
}

// Mimics BullMQ Worker class
export class Worker extends EventEmitter {
    constructor(queueName: string, processor: Function, opts?: any) {
        super();
        const queue = getMemoryQueue(queueName);
        
        // Attach processor
        queue.setHandler(processor, opts);

        // Proxy events from the shared queue instance to this worker instance
        queue.on('completed', (job) => this.emit('completed', job));
        queue.on('failed', (job, err) => this.emit('failed', job, err));
    }
}

// Mimics BullMQ Queue class
export class Queue {
    private internal: MemoryQueue;

    constructor(name: string, opts?: any) {
        this.internal = getMemoryQueue(name);
    }

    async add(name: string, data: any, opts?: any) {
        return this.internal.add(name, data, opts);
    }
}
