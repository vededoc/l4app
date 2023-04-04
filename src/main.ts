import {program} from "commander";
import * as process from "process";
import * as child_process from "child_process";
import * as fs from "fs";
import {LogRotate} from "./LogRotate";
import {resolveDayTime, resolveSize, splitSpace} from "@vededoc/sjsutils";
import * as path from "path";
import * as net from "net";
import * as stream from "stream";
import * as os from "os";
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

function getCtrlPath() {
    if(os.platform() == 'win32') {
        return path.join('\\\\.\\pipe\\', Cfg.workDir, '.l4appctl')
    } else {
        return path.join(Cfg.workDir, '.l4appctl')
    }
}

const Cfg = {} as AppCfg
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
        .option('-k, --kill [working-folder]', 'kill app')
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
    Cfg.logs =  Number.parseInt( (Cfg.logs??'30') as string )
    Cfg.duration =  resolveDayTime( (Cfg.duration??'30d') as string )
    Cfg.maxSize = resolveSize( (Cfg.maxSize??'10M') as string )
    Cfg.checkInterval = resolveDayTime( (Cfg.checkInterval??'1m') as string)
}

function startCtrlServer() {
    const ctrl = getCtrlPath()
    const cnn = net.connect(ctrl ,() => {
        console.info('connected')

    })
    cnn.on('data', () => {

    })
}

async function sendCtrlCmd(cmd: string, args?: string[]) {
    const pm = new Promise((res, rej) => {
        const ctrl = getCtrlPath()
        const cnn = net.connect(ctrl ,() => {
            console.info('connected')
            cnn.write(JSON.stringify({cmd}).toString())
        })
        cnn.on('data', data => {
            const res = JSON.parse( data.toString())
            if(res.code === 'OK') {
                res(res.code)
            } else {
                throw Error(res.code)
            }
        })
    })

    const res = await pm
    console.info(res)
}

(async ()=>{
    ProcCmdArgs()
    gCtrl.init(Cfg.workDir)

    if(Cfg.kill) {
        const workDir = Cfg.kill === true ? Cfg.workDir : Cfg.kill
        console.info('command work-dir:', workDir)
        const resp = await gCtrl.send({cmd: 'kill', workDir})
        console.info(resp.code)
        if(resp.code !== 'OK') {
            process.exit(1)
        }
        process.exit(0)
    }

    gCtrl.startServer()
    gCtrl.onCmd = (cnn, req) => {
        console.info('recv cmd:', req.cmd)
        if(req.cmd == 'kill') {
            if(req.workDir != Cfg.workDir) {
                cnn.write(JSON.stringify({code: 'FAIL'})+'\n')
                return
            }
            userProc.kill('SIGTERM')
            gCtrl.response(cnn, {code: 'OK'})
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
    const outLog = new LogRotate(Cfg.workDir, output_name, Cfg.maxSize, Cfg.duration, Cfg.logs, Cfg.zip)
    const errLog = Cfg.errorOnlyFile ? new LogRotate(Cfg.workDir, error_name, Cfg.maxSize, Cfg.duration, Cfg.logs, Cfg.zip) : undefined
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
            const abs = fs.realpathSync(Cfg.appArgs[0])
            // const script = `process.title='${Cfg.nameProc}'; require('${Cfg.appArgs[0]}')`
            const script = `process.title='${Cfg.nameProc}'; require('${abs}')`
            // Cfg.appArgs = ['-e', script, ...Cfg.appArgs.slice(1)]
            Cfg.appArgs = ['-e', script, ...Cfg.appArgs]
        } catch (err) {
            console.warn('Fail: cannot change proc name, ', err.message)
            process.exit(1)
        }
    }

    // console.info('app:', Cfg.app, ', args:', Cfg.appArgs)
    const proc = await child_process.spawn(Cfg.app, Cfg.appArgs)
    proc.stdout.on('data', data => {
        outLog.writeLog(data)
        if(Cfg.screen) {
            process.stdout.write(data)
        }
    })
    proc.stderr.on('data', data => {
        if(errLog) {
            errLog.writeLog(data)
        }
        if (Cfg.screen) {
            process.stderr.write(data)
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
    userProc = proc
})()

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
