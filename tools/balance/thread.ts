import { parentPort } from 'node:worker_threads';
import { playJob, type Job } from './jobs';

// Plays each Run the main thread posts and posts back its summary.

parentPort!.on('message', (job: Job) => {
  parentPort!.postMessage(playJob(job));
});
