import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from './suite.js';

register(test, assert);
