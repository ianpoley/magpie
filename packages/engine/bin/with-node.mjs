#!/usr/bin/env bun

import { chooseNode, runUnderNode } from './setup.mjs';

const [script, ...args] = process.argv.slice(2);
const chosen = await chooseNode();
process.exit(chosen ? runUnderNode(chosen, script, args) : 1);
