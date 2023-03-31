import {program, OptionValues} from "commander";
import * as process from "process";
import * as child_process from "child_process";
import * as fs from "fs";
import {LogRotate} from "./LogRotate";
import * as path from "path";
import {resolveSize} from "@vededoc/sjsutils";


interface AppCfg {
    app: string
    maxSize: string | number
    appArgs: string[]
    workDir: string
    out: string
    err: string
    screen: boolean

    outWst: fs.WriteStream
    errWst: fs.WriteStream
}

const Cfg = {} as AppCfg

function ProcCmdArgs() {
    const sepIdx = process.argv.indexOf('--')

    program
        .argument('<app>', 'application to run')
        // .option('--app <application>', 'application to start')
        .option('--out <file-for-stdout>', 'stdout file')
        .option('--err <file-for-stderr>', 'stderr file')
        .option('-w, --work-dir <working-dir>', 'stderr file')
        .option('-s, --screen', 'print out for screen')
        .option('--max-size <size>', 'max log size')
        .version('0.0.1')
    let launcherArgs: string[]
    let appArgs: string[]
    if(sepIdx<0) {
        launcherArgs = process.argv
        appArgs = []
    } else {
        launcherArgs = process.argv.slice(0, sepIdx)
        appArgs = process.argv.slice(sepIdx+1)
    }

    program.parse(launcherArgs)
    Object.assign(Cfg, program.opts())
    Cfg.appArgs = appArgs
    Cfg.workDir = Cfg.workDir ?? process.cwd()
    Cfg.app = program.args[0]
    Cfg.maxSize = Cfg.maxSize ?? '1M'
    Cfg.maxSize = resolveSize(Cfg.maxSize as string)
}



(async ()=>{
    ProcCmdArgs()
    fs.mkdirSync(Cfg.workDir, {recursive: true})
    if(!Cfg.out) {
        Cfg.out = 'out.log'
    }
    const outLog = new LogRotate(Cfg.workDir, Cfg.out)
    const errLog = Cfg.err ? new LogRotate(Cfg.workDir, Cfg.err) : undefined

    const proc = await child_process.spawn(Cfg.app, Cfg.appArgs)
    proc.stdout.on('data', data => {
        const ds = data.toString()
        outLog.writeLog(ds)
        if(Cfg.screen) {
            process.stdout.write(ds)
        }
    })
    proc.stderr.on('data', data => {
        const ds = data.toString()
        outLog.writeLog(ds)
        if(errLog) {
            errLog.writeLog(ds)
        }
        if(Cfg.screen) {
            process.stderr.write(ds)
        }
    })

    proc.on('close',  async code => {
        console.info('application closed, code:', code)
        if(outLog) {
            await outLog.close()
        }
        if(errLog) {
            await errLog.close()
        }
        process.exit(code)
    })
})()