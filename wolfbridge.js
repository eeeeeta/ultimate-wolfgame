/*
 * wolfgame bridge: the hacky link between the C part and the JS part
 * this is going to be... fun :p
 * - eta
 */
"use strict";
var cp = require('child_process');
var util = require('util');
var _ = require('lodash');
var readline = require('readline');
var EventEmitter = require('events').EventEmitter;

function subMsg(msg, plist) {
    Object.keys(plist).forEach(function(key) {
        msg = msg.replace(new RegExp('{' + key + '}', 'g'), plist[key]);
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
    this._idton = function(id) {
        if (!self.plist[id]) {
            console.error('[engine ' + self.rid + '] idton() called on unknown id ' + id);
            return false;
        }
        return self.plist[id];
    };
    this._inputnow = false;
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
        self.emit('destroyed');
        self._pwrite = function() {};
        self.roleinput = function() {};
        self.killPlayer = function() {};
        self.quit = function() {};
    });
    this.quit = function() {
        console.log('[engine ' + self.rid + '] Killing...');
        self.proc.kill();
    };
    this.rli.on('line', function(line) {
        line = line.split('/');
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
        if (cmd == 'LYNCHVOTE') {
            if (!(line[0] = self._idton(line[0])) || !(line[1] = self._idton(line[1]))) return;
            self.emit('lynchvote', line[0], line[1]);
        }
        if (cmd == 'WOLFTGT') {
            if (!(line[1] = self._idton(line[1])) || !(line[2] = self._idton(line[2]))) return;
            self.emit('wolftgt', line[0], line[1], line[2]);
        }
        if (cmd == 'REVEAL') {
            if (!(line[1] = self._idton(line[1]))) return;
            self.emit('reveal', line[0], line[1], line[2]);
        }
        if (cmd == 'DEATH') {
            if (!(line[0] = self._idton(line[0]))) return;
            self.emit('death', line[0], line[1], line[2]);
        }
        if (cmd == 'ROLEINPUT') {
            self.emit('input_now');
            self._inputnow = true;
        }
        if (cmd == 'LYNCHINPUT') {
            self.emit('lynch_now', line[0]);
            self._inputnow = true;
        }
        if (cmd == 'NOINPUT') {
            self._inputnow = false;
        }
        if (cmd == 'GAMEOVER') {
            self.emit('gameover', line[0]);
            self._inputnow = false;
        }
        if (cmd == 'NOKILL') {
            self.emit('nokill');
        }
        if (cmd == 'WTIMEOUT') {
            self.emit('wtimeout');
        }
        if (cmd == 'ENDSTAT') {
            if (!(line[0] = self._idton(line[0]))) return;
            self.emit('endstat', line[0], line[1], line[2]);
        }
    });
    this.killPlayer = function(tgt) {
        console.log('[engine ' + self.rid + '] killing player ' + tgt);
        self._pwrite('*DEATH ' + tgt);
    };
    this.roleinput = function(actr, tgt) {
        var target = null;
        Object.keys(self.plist).forEach(function(tid) {
            if (self.plist[tid] == tgt) target = tid;
        });
        if (!target) {
            console.log('[engine ' + self.rid + '] invalid role input (target not found) (by ' + actr + ' to unknown target ' + tgt + ')');
            return false;
        }
        tgt = target;
        if (!self._inputnow) {
            console.log('[engine ' + self.rid + '] unexpected role input (by ' + actr + ' to ' + tgt + ')');
            return false;
        }
        console.log('[engine ' + self.rid + '] sending role input (by ' + actr + ' to ' + tgt + ')');
        self._pwrite(actr + ' ' + tgt);
        return true;
    };
    this.lrli.on('line', function(line) {
        console.log('[engine ' + self.rid + '] ' + line);
        self.emit('dbg', line);
    });
};
util.inherits(Engine, EventEmitter);
module.exports = Engine;
