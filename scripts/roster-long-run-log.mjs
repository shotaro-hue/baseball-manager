import assert from 'node:assert/strict';
import {stripVTControlCharacters} from 'node:util';

export function assertCompletedVitestLog(log,expectedFiles=1){
 log=stripVTControlCharacters(log);
 assert.match(log,new RegExp(`Test Files\\s+${expectedFiles} passed \\(${expectedFiles}\\)`));
 assert.match(log,new RegExp(`Tests\\s+${expectedFiles} passed \\(${expectedFiles}\\)`));
 assert.doesNotMatch(log,/Unhandled Errors|Worker exited unexpectedly|FATAL ERROR|Failed Tests/);
}
