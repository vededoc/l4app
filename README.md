# l4app

logging utility for applications.  

## Features

* simple, lightweight logging utility 
* capture stdout and stderr of application, save them to files.
* daily log rotation
* limit max file size, count, duration
* compress logs as gzip format for backup 
* change shown process name


## Installation
```shell
$ sudo npm i -g @vededoc/l4app
```

## Usage
After '--', pass over your application arguments.  
For example, 'ls -al' is  
$ l4app **ls** -- **-al**

```shell
# max log files is 10, duration for keeping log files is 30day, max file size is 1mega 
$ l4app your_app -w working_folder --duration 30d --max-size 1M --max-logs 10 -- arg1 arg2

# for nodejs application
$ l4app node -w working_folder -- your_app.js

# run in background
$ nohup l4app node -- your_app > /dev/null &

# changing log setting on the fly, default working_folder is current folder
$ l4app --set --max-size 10M --logs 10 [working_folder]

# get current log setting on working-folder
$ l4app --get [working_folder]

# kill l4app instance, default working_folder is current folder
$ l4app -k [working_folder]
```


## Log file naming rule

```text
{prefix}_output_{START_DATE}_{END_DATE}_{INDEX}.log
```

`prefix` is from commaind line option ( `--prefix`, default is none )  
`START_DATE` is date-time of logging start date-time. format is 'MMDD'   
`END_DATE` is date-time of logging last date-time. format is 'MMHHMM'  
`INDEX` is 1,2,3,... for the same date-time


## Options
```text
Options:
  -w, --work-dir <working-dir>    working folder for logging
  --no-error-file                 do not make error.log
  --max-size <size>               max log size, default: 10M
  --duration <duration>           keeping duration for log files. valid values
                                  => 1d, 24h, ...
                                  ex) '--duration 30d' means keeping logs for
                                  30 days
  --logs <max-log-num>            max log files, default is 30
  -z, --zip                       compress backup logs
  -n, --name-proc <process-name>  change process name, just only valid for
                                  nodejs package
                                  ex) l4app node -n testapp -- test.js
  -s, --screen                    print out for screen
  --check-interval <time>         interval for checking duration, counts, size
                                  of log files
                                  ex) '--check-interval=1m'
  -p, --prefix <prefx>            prefix for log file
  -k, --kill                      kill app
  --set                           change log setting on the fly and terminate
  --get                           get current log settings
  --disable-zip                   disable compress
  -- <arguments>                  application arguments
  -V, --version                   output the version number
  -h, --help                      display help for command
```