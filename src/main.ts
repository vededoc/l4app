import {program} from "commander";
import * as process from "process";
import * as child_process from "child_process";
import * as fs from "fs";
import {LogRotate} from "./LogRotate";
import {resolveDayTime, resolveSize, runCmd, splitSpace} from "@vededoc/sjsutils";
import * as path from "path";

interface AppCfg {
    app: string
    maxSize: number
    appArgs: string[]
    workDir: string
    out: string
    err: string
    screen: boolean
    duration: number
    logs: number
    checkInterval: number
    zip: boolean
    nameProc: string

    outWst: fs.WriteStream
    errWst: fs.WriteStream
}

function resolveFile(file: string): string {
    const pfn = path.parse(file);
    if(pfn.ext == '.js' || pfn.ext == '.cjs' || pfn.ext == 'mjs') {
        return 'js'
    }
    let hf;
    let res: string;
    try {
        hf = fs.openSync(file, 'r')
        const buf = new Uint8Array(64)
        const rc = fs.readSync(hf, buf)
        if(rc > 4 && buf[0]==0x7f && buf[1]==0x45 && buf[2]==0x4c && buf[3]==0x46) { // ELF check
            res = 'exe'
        }

        const shebang = new TextDecoder().decode(buf);
        if(shebang.slice(0,1)=='#') {
            const vs = splitSpace(shebang.split('\n')[0])
            if(vs[1]=='node' || vs[1]=='nodejs') {
                res = 'js'
            }
        }
    } catch (err) {
        // console.error(err)
    } finally {
        if(hf) {
            fs.closeSync(hf)
        }
    }

    return res
}

const Cfg = {} as AppCfg

function ProcCmdArgs() {
    program
        .argument('<app>', 'application to run')
        // .option('--app <application>', 'application to start')
        .option('--out <file-for-stdout>', 'stdout file')
        .option('--err <file-for-stderr>', 'stderr file')
        .option('-w, --work-dir <working-dir>', 'stderr file')
        .option('-s, --screen', 'print out for screen')
        .option('--max-size <size>', 'max log size, default: 10M')
        .option('--duration <duration>', 'ex) 1d, 24h, default 30d')
        .option('--logs <max-log-num>', 'max log files, default:30')
        .option('-z, --zip', 'zip backup logs')
        .option('--check-interval <time>', 'log file check interval\n'
            +'Example: --check-interval=1m')
        .option('-n, --name-proc <process-name>', 'change process name, just only valid for nodejs package\n'
            +'Example: l4app node -n testapp -- test.js')
        .option('-- <arguments>', 'application arguments')
        .version('0.0.1')

    const sepIdx = process.argv.indexOf('--')
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
    Cfg.logs =  Number.parseInt( (Cfg.logs??'30') as string )
    Cfg.duration =  resolveDayTime( (Cfg.duration??'30d') as string )
    Cfg.maxSize = resolveSize( (Cfg.maxSize??'10M') as string )
    Cfg.checkInterval = resolveDayTime( (Cfg.checkInterval??'1m') as string)
}

(async ()=>{
    ProcCmdArgs()
    fs.mkdirSync(Cfg.workDir, {recursive: true})
    if(!Cfg.out) {
        Cfg.out = 'out.log'
    }
    const outLog = new LogRotate(Cfg.workDir, Cfg.out, Cfg.maxSize, Cfg.duration, Cfg.logs, Cfg.zip)
    const errLog = Cfg.err ? new LogRotate(Cfg.workDir, Cfg.err, Cfg.maxSize, Cfg.duration, Cfg.logs, Cfg.zip) : undefined
    outLog.setBackupIntervalMs(Cfg.checkInterval)
    if(errLog) errLog.setBackupIntervalMs(Cfg.checkInterval)

    if(Cfg.nameProc) {
        try {
            if(Cfg.app != 'node' && Cfg.app != 'nodejs') {
                throw Error('programs must be node for changing process name')
            }
            if(!Cfg.appArgs.length) {
                throw Error('script must be provided')
            }

            if(resolveFile(Cfg.appArgs[0]) != 'js') {
                throw Error('first argument must be script file')
            }

            const script = `process.title='${Cfg.nameProc}'; require('${Cfg.appArgs[0]}')`
            const args = ['-e', script, ...Cfg.appArgs.slice(1)]
            Cfg.appArgs = args;
        } catch (err) {
            console.warn('Fail: cannot change proc name, ', err.message)
            process.exit(1)
        }
    }

    // console.info('app:', Cfg.app, ', args:', Cfg.appArgs)
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
        if(errLog) {
            errLog.writeLog(ds)
        }
        if (Cfg.screen) {
            process.stderr.write(ds)
        }
    })

    proc.on('close',  code => {
        console.info('application closed, code:', code)
        if(outLog) {
            outLog.close()
        }
        if(errLog) {
            errLog.close()
        }
        process.exit(code)
    })
})()