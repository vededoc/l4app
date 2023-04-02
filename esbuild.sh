#!/bin/sh
npx esbuild dist/main.js --bundle --platform=node --banner:js="#!/usr/bin/env node" --outfile=outBin/l4app && chmod +x outBin/l4app

