/*
 * wolfgame bridge: the hacky link between the C part and the JS part
 * this is going to be... fun :p
 * - eta
 */
"use strict";
var cp = require('child_process');
var readline = require('readline');
var EventEmitter = require('events').EventEmitter;
var Engine = function(rid) {
    let self = this;
    this.rid = rid;
    this.proc = cp.execFile(__dirname + '/wolf_engine');
    this.rli = readline.createInterface({
        input: proc.stdin,
        output: proc.stdout
    });
    this.proc.on('exit', function(code) {
        if (code != 0) {
            console.log('WARN: engine for ' + self.rid + ' exited with code ' + code);
            self.emit('ise');
        }
        else {
            self.emit('gameover');
        }
    });
    this.rli.on('line', function(line) {
        line = line.split(' ');
        
    });
};
