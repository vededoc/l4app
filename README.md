# l4app

logging utility for an application

## Features

* simple, lightweight logging utility 
* capture stdout and stderr of application, save them to files.
* daily log rotation
* limit max file size, count, duration
* zip logs for backup 


## Installation
```shell
$ sudo npm i -g @vededoc/l4app
```

## Usage
```shell
$ l4app your_app -w log_folder --max-duration 30d --max-size 1M --max-logs 10 -- arg1 arg2
```

## Options
```text
  --out <file-for-stdout>       stdout file
  --err <file-for-stderr>       stderr file
  -w, --work-dir <working-dir>  stderr file
  -s, --screen                  print out for screen
  --max-size <size>             max log size, default: 10M
  --duration <duration>         ex) 1d, 24h, default 30d
  --logs <max-log-num>          max log files, default:30
  --backup-interval <minutes>   application arguments
  -- <arguments>                application arguments
  -V, --version                 output the version number
  -h, --help                    display help for command
```