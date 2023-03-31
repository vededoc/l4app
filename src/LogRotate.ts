import * as path from "path";
import {ParsedPath} from "path";
import * as fs from "fs";
const fspro = require('fs/promises')
import {WriteStream} from "fs";
import {DAY_MS, MIN_MS} from "@vededoc/sjsutils";

export class LogRotate {
    // outFile: string
    wst: WriteStream
    fullPath: string
    maxSize: number
    maxDuration: number
    maxFiles: number
    workDir: string
    parsedPath: ParsedPath
    startDate: Date

    constructor(workDir: string, fn: string, maxSize: number=1024*1024, maxDuration: number=DAY_MS*30, maxFiles: number=100) {
        this.workDir = workDir
        this.parsedPath = path.parse(fn)
        this.fullPath = `${workDir}/${fn}`
        try {
            this.wst = fs.createWriteStream(this.fullPath, {flags: 'a'})
        } catch (err) {
            console.trace(err)
        }

        this.maxSize = maxSize
        this.maxFiles = maxFiles
        // this.outFile = fn
        this.maxDuration = maxDuration
        this.startDate = new Date()
        this.startCheckTime()
    }

    async writeLog(msg: string) {
        this.wst.write(msg)

        if(this.wst.bytesWritten > this.maxSize) {
            await this.newLogFile()
        }
    }

    async close() {
        this.wst.close()
    }

    private startCheckTime() {
        setInterval(async ()=>{
            const ct = new Date()
            if(ct.getDate() != this.startDate.getDate()) {
                console.info('date changed, new log file, ', ct.toLocaleString())
                await this.newLogFile()
            }
            
            // 오래된 파일들을 지운다
            const remains = await this.deleteExpired()

            const dels = remains.length - this.maxFiles
            if(dels > 0) { // 최대 파일 개수 초과시 오래된 것 순으로 지운다
                remains.sort( (a, b) =>  ( a.bt.getTime() - b.bt.getTime() ) )
                for(let i=0;i<dels;i++) {
                    const t = remains.shift()
                    try {
                        await fspro.unlink(t.name)
                    } catch (err) {
                        console.trace(err)
                    }
                }
            }

        }, MIN_MS * 10)
    }

    private async newLogFile() {
        const ct = new Date()
        const dn = (this.startDate.getFullYear()%100).toString().padStart(2,'0')+this.startDate.getMonth().toString().padStart(2,'0')
            +this.startDate.getDate().toString().padStart(2,'0')
        let idx=0
        for(;;) {
            let bf = `${this.workDir}/${this.parsedPath.name}_${dn}` + (idx!==0 ? `_${idx.toString()}`:'')
            // console.info('rename %s to %s:', this.fullPath, bf)
            try {
                // 파일이 존재 하는지 체크
                await fspro.stat()
                idx++;
            } catch (err) {
                if(err.code === 'ENOENT') {
                    try {
                        if(this.wst) {
                            this.wst.close()
                            this.wst = null;
                        }
                        await fspro.rename(this.fullPath, bf)
                        this.wst = fs.createWriteStream(this.fullPath, {flags:'a'})
                        this.startDate = ct;
                    } catch (err) {
                        console.trace(err)
                    }
                } else {
                    console.trace(err)
                }
                break;
            }
        }
    }

    private async stateFile(fn: string) {
        try {
            return await fspro.stat(fn)
        } catch (err) {
            return null
        }
    }
    private async deleteExpired() {
        const ct = new Date()
        const files = await fspro.readdir(this.workDir)
        const remains: {name: string, bt: Date}[] = []
        for(const f of files) {
            try {
                const fn = `${this.workDir}/${f}`
                const st = await fspro.stat(fn)
                if(ct.getTime() - st.birthtime.getTime() > this.maxDuration) {
                    await fspro.unlink(fn)
                } else {
                    remains.push({name: fn, bt: st.birthtime})
                }
            } catch (err) {

            }
        }
        return remains
    }

    async deleteMaxOld() {
        const files = await fspro.readdir(this.parsedPath.dir)
        let mostOld: number = Number.MAX_VALUE
        let mostOldFile: string
        for(let f of files) {
            if(f.endsWith('.log')) {
                const st = await fspro.stat(f)
                if(st.atimeMs < mostOld) {
                    mostOldFile = f
                    mostOld = st.atimeMs
                }
            }
        }
        if(mostOldFile) {
            await fspro.unlink(mostOldFile)
        }
    }
}