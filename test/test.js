console.info(process.argv[1])
const intervalMs = Number.parseInt( process.argv[2] ?? '1000' )

console.info('intervalMs:', intervalMs)
setInterval(()=>{
    console.info('normal log, ', new Date().toISOString())
}, intervalMs)

setInterval( ()=>{
    console.error('### error log, ', new Date().toISOString())
}, intervalMs)