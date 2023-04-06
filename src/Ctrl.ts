import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as Stream from "stream";
import * as readline from "readline";

const IPC_FILE = '.l4app.sock'
class Ctrl {
    ctrlServer: net.Server
    // readable: Stream.Readable
    ctrlPath: string
    workDir: string
    onCmd: (cnn: net.Socket, cmd: any) => void


    constructor() {
        this.onCmd = () => {}
    }

    init(workDir: string) {
        this.workDir = workDir
        if(os.platform() === 'win32') {
            this.ctrlPath = path.join('\\\\.\\pipe\\', workDir, IPC_FILE)
        } else {
            this.ctrlPath = path.join(workDir, IPC_FILE)
        }
    }

    startServer() {
        if(this.ctrlServer) {
            console.info('*** server already started')
            return;
        }


        const server = net.createServer();
        try {
            fs.accessSync(this.ctrlPath, fs.constants.F_OK)
            fs.unlinkSync(this.ctrlPath)
        } catch (err) {

        }
        server.on('connection', cnn => {
            // console.info('on new connection')
            const readable = new Stream.Readable( {
                // read() 는 empty 함수로 라도 정의 해야 한다
                read() {}
            })

            const rl = readline.createInterface(readable)
            rl.on('line', line => {
                // process.stdout.write(line)
                const cmd = JSON.parse(line)
                if(cmd.workDir != this.workDir) {
                    console.info('*** workDir not match, this.workDir=%s, msg.workDir=%s', this.workDir, cmd.workDir)
                    this.response(cnn, {code: 'FAIL'})
                }
                this.onCmd(cnn, cmd)
            })
            rl.on('close', () => {
                // console.debug('on rl close')
            })

            cnn.on('data', data => {
                // console.info('on data:', data.toString())
                readable.push(data)
            })
            cnn.on('end', () => {
                // console.info('client disconnected')
                readable.push(null)
            })
        })

        console.info('listen:', this.ctrlPath)
        server.listen(this.ctrlPath)
        this.ctrlServer = server
    }


    async send(cmd: any): Promise<any> {
        return new Promise( (res, rej) => {
            // console.debug('connect to', this.ctrlPath)
            // const cnn = net.createConnection({path: this.ctrlPath})
            const cnn = net.createConnection({path: this.ctrlPath})
            cnn.on('connect', () => {
                // console.debug('connected')
                cnn.write(JSON.stringify(cmd) +'\n')
            })
            cnn.on('error', err => {
                rej(err)
            })
            cnn.on('data', data => {
                const readable = new Stream.Readable({
                    // read() 는 empty 함수로 라도 정의 해야 한다
                    read: ()=>{}
                })
                const rl = readline.createInterface(readable)
                rl.on('line', line => {
                    // console.info('on line:', line)
                    try {
                        const resp = JSON.parse(line)
                        cnn.destroy()
                        res(resp)
                    } catch (err) {
                        res(err)
                    }
                })
                readable.push(data)
            })
        })
    }

    response(sock: net.Socket, response: any) {
        sock.write( JSON.stringify(response)+'\n')
    }

}

export const gCtrl = new Ctrl()
