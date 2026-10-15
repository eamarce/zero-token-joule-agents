import cds from '@sap/cds';
import { readFileSync } from 'node:fs';
import { analyze } from './lib/analyze.js';

const SAMPLES = {
  runlog: new URL('../samples/runs.sample.jsonl', import.meta.url),
  otel: new URL('../samples/otel.sample.json', import.meta.url),
};

export default class CalculatorService extends cds.ApplicationService {
  init() {
    this.on('analyze', (req) => {
      const { content, format, options } = req.data;
      if (!content) return req.error(400, 'content is empty: paste or upload a run log');
      let opts = {};
      try {
        opts = options ? JSON.parse(options) : {};
      } catch {
        return req.error(400, 'options must be JSON');
      }
      return JSON.stringify(analyze(content, { format: format || 'auto', ...opts }));
    });

    this.on('sample', (req) => readFileSync(SAMPLES[req.data.format === 'otel' ? 'otel' : 'runlog'], 'utf8'));

    return super.init();
  }
}
