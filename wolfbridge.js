/*
 * wolfgame bridge: the hacky link between the C part and the JS part
 * this is going to be... fun :p
 * - eta
 */
"use strict";
var cp = require('child_process');
var util = require('util');
var readline = require('readline');
var EventEmitter = require('events').EventEmitter;

function subMsg(msg, plist) {
    Object.keys(plist).forEach(function(key) {
        msg.replace('{' + key + '}', plist[key]);
    });
    return msg;
}
var Engine = function(rid, plist) {
    let self = this;
    this.rid = rid;
    this.plist = plist;
    this.proc = cp.execFile(__dirname + '/wolf_engine');
    this._pwrite = function(msg) {
        console.log('[engine ' + self.rid + '] TX: ' + msg);
        this.proc.stdin.write(msg + '\n');
    };
    this.rli = readline.createInterface({
        input: this.proc.stdout,
        output: this.proc.stdin
    });
    this.lrli = readline.createInterface({
        input: this.proc.stderr,
        output: this.proc.stdin
    });
    this.proc.on('exit', function(code, signal) {
        console.log('[engine ' + self.rid + '] Exited (code ' + code + ')');
        if (code !== 0 && !signal) {
            console.log('WARN: engine for ' + self.rid + ' exited with code ' + code);
            self.emit('ise');
        }
        else {
            self.emit('destroyed');
        }
    });
    this.quit = function() {
        console.log('[engine ' + self.rid + '] Killing...');
        self.proc.kill();
    };
    this.rli.on('line', function(line) {
        line = line.split(' ');
        console.log('[engine ' + self.rid + '] RX: ' + line);
        let cmd = line.shift();
        if (cmd == 'PLIST') {
            Object.keys(self.plist).forEach(function(pl) {
                self._pwrite(pl);
            });
            self._pwrite('*END');
        }
        if (cmd == 'STATE') {
            self.emit('state', line[0].toLowerCase() == 'night' ? true : false);
        }
        if (cmd == 'AMSG') {
            line = line.join(' ');
            self.emit('amsg', subMsg(line, plist));
        }
        if (cmd == 'MSG') {
            let tgt = line.shift();
            line = line.join(' ');
            self.emit('msg', tgt, subMsg(line, plist));
        }
        if (cmd == 'ROLEMSG') {
            self.emit('rolemsg', line[0], line[1]);
        }
        if (cmd == 'DEATH') {
            self.emit('death', line[0], line[1], line[2]);
        }
        if (cmd == 'ROLEINPUT') {
            self.emit('input_now');
        }
    });
    this.lrli.on('line', function(line) {
        console.log('[engine ' + self.rid + '] ' + line);
        self.emit('dbg', line);
    });
};
util.inherits(Engine, EventEmitter);
module.exports = Engine;
