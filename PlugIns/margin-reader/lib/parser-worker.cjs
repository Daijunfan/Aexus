'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { parseDocument } = require('./parsers.cjs');
const { ReaderError } = require('./safety.cjs');
parseDocument(workerData).then(result => parentPort.postMessage({ result })).catch(error => parentPort.postMessage({ error: { code: error instanceof ReaderError ? error.code : 'INVALID_DOCUMENT', message: error.message || 'Document could not be parsed.' } }));
