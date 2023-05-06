import * as path from "path";
import {ParsedPath} from "path";
import * as fs from "fs";
import {DAY_MS, MIN_MS, randomStr, toDateNums} from "@vededoc/sjsutils";
const { createGzip } = require('zlib');
const {promisify} = require('util')
const { pipeline } = require('stream');
const {
    createReadStream,
    createWriteStream,
} = require('fs');
const pipe = promisify(pipeline);


export class LogRotate {
    // wst: WriteStream
    wfd: number
    wpos: number
    fullPath: string
    maxSize: number
    duration: number
    logs: number
    workDir: string
    parsedPath: ParsedPath
    startDate: Date
    // dateIdx: number
    zip: boolean
    checkIntervalMs: number
    backupTimer: NodeJS.Timer
    lastCheckMs = 0;

    constructor(workDir: string, fn: string, maxSize: number=1024*1024, duration: number=DAY_MS*30, logs: number=100, zip:boolean = false) {
        this.wfd = -1;
        this.wpos = 0;
        this.zip = zip
        this.checkIntervalMs = MIN_MS * 10;
        this.workDir = workDir
        this.parsedPath = path.parse(fn)
        this.fullPath = `${workDir}/${fn}`


        this.maxSize = maxSize
        this.logs = logs
        this.duration = duration

        this.startDate = new Date()

        try {
            this.openFile()
        } catch (err) {
            console.trace(err)
        }

        this.startCheckTime()
    }


    setCompress(enable: boolean) {
        this.zip = enable
    }
    setMaxLogs(cnt: number) {
        this.logs = cnt
    }
    setMaxSize(size: number) {
        this.maxSize = size
    }

    setDuration(dur: number) {
        this.duration = dur
    }

    setCheckIntervalMs(ms: number) {
        this.checkIntervalMs = ms
        this.startCheckTime()
    }

    writeLog(msg: string) {

        try {
            if(this.wfd < 0 || this.wpos+msg.length > this.maxSize) {
                this.closeFile()
                this.newLogFile()
            }

            if(this.wfd > 0) {
                const ct = Date.now();
                const t = ct - this.lastCheckMs
                if(t > 1000*5) {
                    this.lastCheckMs = ct
                    if(!fs.existsSync(this.fullPath)) {
                        console.error('### file not exists');
                        this.closeFile()
                        this.openFile()
                    }
                }
                const rc = fs.writeSync(this.wfd, msg)
                if(rc>0) {
                    this.wpos += rc
                }
            }
        } catch (err) {
            console.trace(err)
        }
    }


    close() {
        this.closeFile()
        if(this.backupTimer) {
            clearInterval(this.backupTimer)
            this.backupTimer = null;
        }
    }

    private closeFile() {
        if(this.wfd > 0) {
            fs.closeSync(this.wfd)
            this.wfd = -1;
            this.wpos = 0;

        }
    }

    public reopenFile() {
        if(this.wfd) {
            fs.closeSync(this.wfd)
            this.wfd = -1;
        }
        this.openFile();
    }
    private openFile() {
        try {
            if(this.wfd > 0) {
                fs.closeSync(this.wfd);
                this.wfd = -1;
            }
            let startTime
            let fpos
            try {
                const st = fs.statSync(this.fullPath)
                // In some os, birthtime is newer than atime ( ex: centos )
                startTime = st.birthtime.getTime() > st.atime.getTime() ? st.atime: st.birthtime
                fpos = st.size
            } catch (err) {
                startTime = new Date()
                fpos = 0
            }

            this.wfd = fs.openSync(this.fullPath, 'a', 0o644)
            this.wpos = fpos;
            this.startDate = startTime
            console.info('open %s, wpos=%d, birthTime=%s', this.fullPath, this.wpos, this.startDate)
        } catch (err) {
            console.trace(err)
        }

    }

    private startCheckTime() {
        if(this.backupTimer) {
            clearInterval(this.checkIntervalMs)
            this.backupTimer = null;
        }
        this.backupTimer = setInterval(()=>{
            // console.info('on check timer, ', new Date().toISOString())
            try {
                if(!fs.existsSync(this.fullPath)) {
                    this.closeFile()
                    this.openFile()
                }
                const ct = new Date()
                if(ct.getDate() != this.startDate.getDate()) {
                    console.info('date changed, new log file, ', ct.toLocaleString())
                    this.closeFile()
                    this.newLogFile()
                }
            } catch (err) {
                console.error(err)
            }

            // 오래된 파일들을 지운다
            try {
                const remains = this.deleteExpired()
                const dels = remains.length - this.logs
                if(dels > 0) { // 최대 파일 개수 초과시 오래된 것 순으로 지운다
                    // console.info('max log file count exceed, count=%d', dels)
                    remains.sort( (a, b) =>  ( a.bt.getTime() - b.bt.getTime() ) )
                    for(let i=0;i<dels;i++) {
                        const t = remains.shift()
                        try {
                            if(t.name != this.fullPath) {
                                console.info('delete log file early, %s', t.name)
                                fs.unlinkSync(t.name)
                            }
                        } catch (err) {
                            console.trace(err)
                        }
                    }
                }
            } catch (err) {
                console.error(err)
            }


        }, this.checkIntervalMs)
    }

    private isBaseExists(baseName) {
        if(!fs.existsSync(this.workDir+'/'+baseName+'.log') && !fs.existsSync(this.workDir+'/'+baseName+'.log.gz')) {
            return false
        } else {
            return true
        }
    }

    private getBackupName() {
        const dn = toDateNums(this.startDate).slice(4,8) // date -> MMDD
        let baseName = `${this.parsedPath.name}_${dn}`
        // if(!this.isBaseExists(baseName)) {
        //     return baseName
        // }

        baseName = baseName + '_' + toDateNums(new Date()).slice(6, 12); // date -> DDHHMMSS
        let cn: string
        for(let i=1;;i++) {
            cn = baseName+'_'+i.toString()
            // console.info('idx fn:', baseName)
            if(!this.isBaseExists(cn)) {
                break;
            }
        }
        return cn
    }

    private newLogFile() {
        const backupName = this.workDir+'/'+this.getBackupName()
        try {
            if(!this.zip) {
                console.info(`${this.fullPath} backup to ${backupName}.log`)
                fs.renameSync(this.fullPath, backupName+'.log')
            } else {
                const tmpName = backupName+'.log'
                fs.renameSync(this.fullPath, tmpName)
                console.info(`${this.fullPath} backup to ${tmpName}`)
                this.compressFileSync(tmpName, backupName+'.log.gz')
            }
        } catch (err) {
            console.trace(err)
        }
        this.openFile()
    }

    private compressFileSync(inFile:string, outFile: string) {
        const gzip = createGzip();
        const source = createReadStream(inFile)
        const destination = createWriteStream(outFile)
        pipe(source, gzip, destination).then( res => {
          fs.unlinkSync(inFile)
        }).catch(err => {
            console.error(err)
        })

    }

    private deleteExpired() {
        const ct = new Date()
        const files= fs.readdirSync(this.workDir)
        const remains: {name: string, bt: Date}[] = []
        for(const f of files) {
            if(f.startsWith(this.parsedPath.name)) {
                try {
                    const fullPath = `${this.workDir}/${f}`
                    if(this.fullPath != fullPath && (fullPath.endsWith('.log') || fullPath.endsWith('.log.gz'))) {
                        const st = fs.statSync(fullPath)
                        if (ct.getTime() - st.birthtime.getTime() > this.duration) {
                            console.info('delete log, %s, duration=%d', fullPath, this.duration)
                            fs.unlinkSync(fullPath)
                        } else {
                            remains.push({name: fullPath, bt: st.birthtime})
                        }
                    }
                } catch (err) {
                    console.trace(err)
                }
            }
        }
        return remains
    }
}