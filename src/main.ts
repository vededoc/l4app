import {program} from "commander";
import * as process from "process";
import * as child_process from "child_process";
import * as fs from "fs";
import {LogRotate} from "./LogRotate";
import {DAY_MS, resolveDayTime, resolveSize, SIZE_KILO, splitSpace} from "@vededoc/sjsutils";
import * as path from "path";
import {gCtrl} from "./Ctrl";
const pkgjs = require('../package.json')

interface AppCfg {
    app: string
    maxSize: number
    appArgs: string[]
    workDir: string
    errorOnlyFile: boolean
    screen: boolean
    duration: number
    logs: number
    checkInterval: number
    zip: boolean
    nameProc: string
    prefix: string
    kill: boolean | string
    set: boolean
    get: boolean

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
let gOutLog: LogRotate
let gErrLog: LogRotate
let userProc

function ProcCmdArgs() {
    program
        .argument('[app]', 'application to run')
        .option('-w, --work-dir <working-dir>', 'working folder for logging')
        .option('-e, --error-only-file', 'make file for only error')
        .option('--max-size <size>', 'max log size, default: 10M')
        .option('--duration <duration>', 'keeping duration for log files. valid values => 1d, 24h, ...\n'
            +"ex) '--duration 30d' means keeping logs for 30 days")
        .option('--logs <max-log-num>', 'max log files, default is 30')
        .option('-z, --zip', 'compress backup logs')
        .option('-n, --name-proc <process-name>', 'change process name, just only valid for nodejs package\n'
            +'ex) l4app node -n testapp -- test.js')
        .option('-s, --screen', 'print out for screen')
        .option('--check-interval <time>', 'interval for checking duration, counts, size of log files\n'
            +"ex) '--check-interval=1m'")
        .option('-p, --prefix <prefx>', 'prefix for log file')
        .option('-k, --kill', 'kill app')
        .option('--set', 'change log setting on the fly and terminate')
        .option('--get', 'get current log settings')
        .option('--disable-zip', 'disable compress')
        .option('-- <arguments>', 'application arguments')
        .version(pkgjs.version)

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
    Cfg.logs = Number.parseInt((Cfg.logs ?? '30') as string)
    Cfg.duration = resolveDayTime((Cfg.duration ?? '30d') as string)
    Cfg.maxSize = resolveSize((Cfg.maxSize ?? '10M') as string)
    Cfg.checkInterval = resolveDayTime((Cfg.checkInterval ?? '1m') as string)

}

async function ProcCtrlCmd() {
    try {
        const opts = program.opts()
        const workDir = program.args[0] ? path.resolve(program.args[0]) : ( opts.workDir ? path.resolve(opts.workDir) : process.cwd())
        gCtrl.init(workDir)
        if(Cfg.kill) {
            // console.debug('command work-dir:', workDir)
            const resp = await gCtrl.send({cmd: 'kill', workDir})
            console.info(resp.code)
            if(resp.code !== 'OK') {
                process.exit(1)
            }
            process.exit(0)
        } else if(Cfg.set) {
            const opts = program.opts()
            // console.info('opts.app:', program.args[0])
            let maxSize: number
            let logs: number
            let duration: number
            let checkInterval: number
            let zip: boolean
            if(opts.maxSize) {
                maxSize = resolveSize(opts.maxSize)
            }
            if(opts.logs) {
                logs = Number.parseInt(opts.logs)
            }
            if(opts.duration) {
                duration = resolveDayTime(opts.duration)
            }
            if(opts.checkInterval) {
                checkInterval = resolveDayTime(opts.checkInterval)
            }
            if(opts.zip) {
                zip = true
            }
            if(opts.disableZip) {
                zip = false
            }

            const res = await gCtrl.send({cmd: 'set', workDir, logs, maxSize, checkInterval, duration, zip})
            console.info(res.code)
            process.exit(0)
        } else if(Cfg.get) {
            const res = await gCtrl.send({cmd: 'get', workDir})
            if(res?.code == 'OK') {
                console.info('maxSize=%s, logs=%s, duration=%s', res.maxSize, res.logs, res.duration)
            } else {
                console.error('FAIL')
            }
            process.exit(0)
        }
        else {
            console.error('UNKNOWN')
            process.exit(1)
        }
    } catch (err) {
        console.error('FAIL:', err.message)
        process.exit(1)
    }
}


async function Main() {
    ProcCmdArgs()

    if(Cfg.kill || Cfg.set || Cfg.get) {
        await ProcCtrlCmd() // process must be terminated in ProcCtrlCmd()
        process.exit(1)
    }

    if(!Cfg.app) {
        console.error('Error: application not specified')
        process.exit(1)
    }

    gCtrl.init(Cfg.workDir)
    gCtrl.startServer()
    gCtrl.onCmd = (cnn, req) => {
        console.info('recv cmd:', req.cmd)
        try {
            if (req.cmd === 'kill') {
                if (req.workDir != Cfg.workDir) {
                    cnn.write(JSON.stringify({code: 'FAIL'}) + '\n')
                    return
                }
                userProc.kill('SIGTERM')
                gCtrl.response(cnn, {code: 'OK'})
            } else if (req.cmd === 'set') {
                console.info('req:', JSON.stringify(req))
                if(req.logs !== undefined) {
                    gOutLog.setMaxLogs(req.logs)
                    if(gErrLog) gErrLog.setMaxLogs(req.logs)
                }
                if(req.maxSize !== undefined) {
                    console.info('--set maxSize, ', req.maxSize)
                    gOutLog.setMaxSize(req.maxSize)
                    if(gErrLog) gErrLog.setMaxSize(req.maxSize)
                }
                if(req.duration !== undefined) {
                    gOutLog.setDuration(req.duration)
                    if(gErrLog) gErrLog.setDuration(req.duration)
                }
                if(req.checkInterval !== undefined) {
                    gOutLog.setCheckIntervalMs(req.checkInterval)
                    if(gErrLog) gErrLog.setCheckIntervalMs(req.checkInterval)
                }
                if(req.zip !== undefined) {
                    console.debug('use zip:', req.zip)
                    gOutLog.setCompress(req.zip)
                    if(gErrLog) gErrLog.setCompress(req.zip)
                }
                gCtrl.response(cnn, {code: 'OK'})
            } else if(req.cmd == 'get') {
                const maxSize = (gOutLog.maxSize/SIZE_KILO).toFixed(1)+'k'
                const logs = gOutLog.logs
                const duration = (gOutLog.duration/DAY_MS).toFixed(1)+'d'
                gCtrl.response(cnn, {code:'OK', maxSize, logs, duration})
            }
            else {
                gCtrl.response(cnn, {code: 'FAIL'})
            }
        } catch (err) {
            gCtrl.response(cnn, {code: 'FAIL'})
        }
    }

    try {
        fs.accessSync(Cfg.workDir, fs.constants.W_OK)
    } catch (err){
        console.error(`### cannot access '${Cfg.workDir}', check permissions`)
        process.exit(1)
    }

    const output_name = Cfg.prefix ? `${Cfg.prefix}_output.log` : 'output.log'
    const error_name = Cfg.prefix ? `${Cfg.prefix}_error.log` : 'error.log'
    gOutLog = new LogRotate(Cfg.workDir, output_name, Cfg.maxSize, Cfg.duration, Cfg.logs, Cfg.zip)
    gErrLog = Cfg.errorOnlyFile ? new LogRotate(Cfg.workDir, error_name, Cfg.maxSize, Cfg.duration, Cfg.logs, Cfg.zip) : undefined
    gOutLog.setCheckIntervalMs(Cfg.checkInterval)
    if(gErrLog) gErrLog.setCheckIntervalMs(Cfg.checkInterval)

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
            const abs = fs.realpathSync(Cfg.appArgs[0])
            const script = `process.title='${Cfg.nameProc}'; require('${abs}')`
            Cfg.appArgs = ['-e', script, ...Cfg.appArgs]
        } catch (err) {
            console.warn('Fail: cannot change proc name, ', err.message)
            process.exit(1)
        }
    }

    // console.info('app:', Cfg.app, ', args:', Cfg.appArgs)
    const proc = await child_process.spawn(Cfg.app, Cfg.appArgs)
    proc.stdout.on('data', data => {
        gOutLog.writeLog(data)
        if(Cfg.screen) {
            process.stdout.write(data)
        }
    })
    proc.stderr.on('data', data => {
        if(gErrLog) {
            gErrLog.writeLog(data)
        }
        if (Cfg.screen) {
            process.stderr.write(data)
        }
    })

    proc.on('close',  code => {
        console.info('application closed, code:', code)
        if(gOutLog) {
            gOutLog.close()
        }
        if(gErrLog) {
            gErrLog.close()
        }
        process.exit(code)
    })
    userProc = proc
}

Main().catch( err => {
    console.trace(err)
})

process.on('SIGTERM', ()=> {
    console.info('on SIGTERM')
    if(userProc) {
        userProc.kill('SIGTERM')
    }
    process.exit(0)
})
process.on('SIGINT', ()=> {
    console.info('on SIGINT')
    if(userProc) {
        userProc.kill('SIGINT')
    }
    process.exit(0)
})

