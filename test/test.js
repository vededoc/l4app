const {format} = require('util')
console.info('all arg', process.argv)
console.info(process.argv[2])
const intervalMs = Number.parseInt( process.argv[2] ?? '1000' )

console.info('intervalMs:', intervalMs)
setInterval(()=>{
    const ct = new Date()
    console.info('normal log, ', format('%d-%d %d:%d:%d.%d', ct.getMonth()+1, ct.getDate(), ct.getHours(), ct.getMinutes(), ct.getSeconds(), ct.getMilliseconds()))
}, intervalMs)

setInterval( ()=>{
    const ct = new Date()
    console.error('### error log, ', format('%d-%d %d:%d:%d.%d', ct.getMonth()+1, ct.getDate(), ct.getHours(), ct.getMinutes(), ct.getSeconds(), ct.getMilliseconds()))
}, intervalMs)