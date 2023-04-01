const intervalMs = process.argv[1] ?? 1000
setInterval(()=>{
    console.info('normal log, ', new Date().toISOString())
}, intervalMs)

setInterval( ()=>{
    console.error('### error log, ', new Date().toISOString())
}, intervalMs)