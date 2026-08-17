import { StateStore } from '../src/state.js';

const [dataDir, workerName, countText] = process.argv.slice(2);
const count = Number.parseInt(countText, 10);
const state = new StateStore(dataDir);
for (let index = 0; index < count; index += 1) await state.add('queue', { title: `${workerName}-${index}` });
