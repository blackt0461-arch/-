// 形づくりを手分けする作業員。build.js から呼ばれる。
import { parentPort, workerData } from 'node:worker_threads';
import { prepare, meshBone, meshMuscle } from './jobs.js';

const { opts, jobs } = workerData;
const { defs, mdefs } = prepare(opts);
const byId = new Map(defs.map((d) => [d.id, d]));
const mById = new Map(mdefs.map((m) => [m.id, m]));
const ctx = {
  boneDefs: defs.filter((d) => d.shape && (d.mat || 'bone') === 'bone'),
  organDefs: defs.filter((d) => d.shape && d.mat === 'organ'),
  carveDefs: defs.filter((d) => d.shape && ['bone', 'cartilage'].includes(d.mat || 'bone')),
};
for (const job of jobs) {
  if (job.type === 'bone') {
    const m = await meshBone(byId.get(job.id), opts);
    parentPort.postMessage({ ...job, m });
  } else {
    const r = await meshMuscle(mById.get(job.id), ctx, opts);
    parentPort.postMessage({ ...job, r });
  }
}
parentPort.postMessage({ done: true });
