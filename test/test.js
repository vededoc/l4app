setInterval(()=>{
    console.info('normal log, ', new Date().toISOString())
}, 1000)

setInterval( ()=>{
    console.error('### error log, ', new Date().toISOString())
}, 3000)