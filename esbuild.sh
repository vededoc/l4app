#!/bin/sh
npx esbuild dist/main.js --bundle --platform=node --banner:js="#!/usr/bin/env node" --outfile=outBin/lapp && chmod +x outBin/lapp