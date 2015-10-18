/*
 * Ultimate Wolfgame
 * one of eta's few pitiful projects ;P
 */
"use strict";
var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var _ = require('lodash');
var log = require('winston');
var port = process.env.PORT || 9090;
var Engine = require('./wolfbridge');
var rooms = {};
var Hashids = require("hashids"),
hashids = new Hashids("this hash does not matter in the slightest", 5);

var Room = function(gid) {
    let self = this;
    this.engine = null;
    this.started = false;
    this.socks = [];
    this.gid = gid;
    this.closed = false;
    this.join = function(sock) {
        let conflict_name = false;
        self.socks.forEach(function(sck) {
            if (sck.name == sock.name) {
                conflict_name = true;
            }
        });
        if (self.started || self.socks.length >= 4 || conflict_name) {
            let reason = "too many players";
            if (self.started) reason = "game started";
            if (conflict_name) reason = "another person in this group has the same name as you";
            log.info(humanise(sock) + ' failed to join room ' + self.gid + ' (' + reason + ')', {
                sid: sock.id,
                gid: self.gid,
                reason: reason
            });
            sock.emit("badjoin", "Join failed: " + reason);
            return false;
        }
        sock.grp = gid;
        self.socks.push(sock);
        sock.join(gid);
        log.info(sock.name + ' joined room ' + self.gid, {sid: sock.id, gid: self.gid});
        sock.emit("join", self.gid);
        self._regenpl();
        return true;
    };
    this.leave = function(sock) {
        if (self.socks.indexOf(sock) == -1) {
            log.warn("tried to remove " + humanise(sock) + " from gid " + self.gid + ", of which they are not a member", {
                sid: sock.id,
                gid: sock.gid
            });
            return false;
        }
        self.socks.splice(self.socks.indexOf(sock, 1));
        sock.leave(gid);
        if (self.started && !self.closed) {
            self.engine.killPlayer(sock.id);
        }
        else {
            self._regenpl();
        }
        log.info(humanise(sock) + " left room " + self.gid, {
            sid: sock.id,
            gid: self.gid
        });
        if (self.socks.length === 0) {
            log.info("deleting now empty room " + self.gid, {
                gid: self.gid
            });
            if (self.started) self.engine.quit();
            delete rooms[self.gid]; /* suicide! */
        }
        return true;
    };
    this.start = function(sock) {
        if (self.socks.length < 4 || self.started) {
            let reason = "not enough players";
            if (self.started) reason = "game already started";
            log.info(humanise(sock) + ' failed to start gid ' + self.gid + ' (' + reason + ')', {
                sid: sock.id,
                gid: self.gid,
                reason: reason
            });
            sock.emit('nostart', 'Start failed: ' + reason);
            return;
        }
        let plist = {};
        self.socks.forEach(function(sock) {
            plist[sock.id] = sock.name;
        });
        self.started = true;
        self.engine = new Engine(sock.grp, plist);
        io.to(sock.grp).emit('startcnfrm');
        self.engine.on('ise', function() {
            log.error('engine error for gid ' + self.gid + ', disconnecting all players', {gid: self.gid});
            io.to(self.gid).emit('ise');
            self.disconnAll();
        });
        self.engine.on('destroyed', function() {
            log.info('engine for gid ' + self.gid + ' terminated nicely, disconnecting all players', {gid: self.gid});
            self.disconnAll();
        });
        self.socks.forEach(function(sock) {
            self._regSock(sock);
        });
        log.info(humanise(sock) + ' started game ' + self.gid, {sid: sock.id, gid: self.gid});
    };
    this._regSock = function(sock) {
        self.engine.on('state', function(state) {
            sock.emit('state', state);
        });
        self.engine.on('amsg', function(msg) {
            sock.emit('amsg', msg);
        });
        self.engine.on('lynch_now', function(num) {
            sock.emit('lynch_now', num);
        });
        self.engine.on('gameover', function(win) {
            sock.emit('gameover', win);
        });
        self.engine.on('nokill', function() {
            sock.emit('nokill');
        });
        self.engine.on('wtimeout', function() {
            sock.emit('wtimeout');
        });
        self.engine.on('death', function(who, role, why) {
            if (who == sock.name) sock.dead = true;
            sock.emit('death', who, role, why);
        });
        self.engine.on('lynchvote', function(from, to) {
            sock.emit('lynchvote', from, to);
        });
        self.engine.on('endstat', function(who, role, da) {
            sock.emit('endstat', who, role, da);
        });
        self.engine.on('msg', function(to, msg) {
            if (sock.id == to) {
                sock.emit('msg', msg);
            }
        });
        self.engine.on('reveal', function(to, who, role) {
            if (sock.id == to) {
                sock.emit('reveal', who, role);
            }
        });
        self.engine.on('rolemsg', function(to, role) {
            if (sock.id == to) {
                sock.emit('rolemsg', role);
            }
        });
        sock.on("roleclick", function(tgt) {
            log.info(humanise(sock) + " sent roleclick " + tgt, {sid: sock.id, gid: self.gid});
            self.engine.roleinput(sock.id, tgt);
        });
        sock.on("sendhint", function(to, player) {
            if (sock.dead) {
                log.info(humanise(sock) + " tried to send a hint, but they are dead!", {sid: sock.id, gid: self.gid});
                return;
            }
            self.socks.forEach(function(sck) {
                if (sck.name == to && !sck.dead) {
                    log.info(humanise(sock) + " sent hint to " + humanise(sck), {sid: sock.id, target: sck.id, gid: self.gid});
                    sck.emit("hint", sock.name);
                }
            });
        });
    };
    this.emitAll = function() {
        console.log('emitting: ' + arguments);
        console.dir(arguments);
        self.socks.forEach(function(sock) {
            sock.emit.apply(sock, arguments)();
        });
    };
    this.disconnAll = function() {
        self.closed = true;
        self.engine.removeAllListeners();
        self.socks.forEach(function(sock) {
            sock.grp = null;
            self.leave(sock);
            sock.removeAllListeners();
            sock.disconnect();
        });
        delete rooms[self.gid];
    };
    this._regenpl = function() {
        let plist = {};
        self.socks.forEach(function(sock) {
            plist[sock.id] = sock.name;
        });
        io.to(self.gid).emit("plist", {
            players: plist,
            mpl: 4
        });
    };
};


app.use(require('express').static(__dirname + '/static'));
server.listen(port);
log.info("server listening on port " + port);
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/wolf.html');
});
var humanise = function(sock) {
    if (sock.name && sock.grp) return sock.name + ' [grp ' + sock.grp + ']';
    else if (sock.name) return sock.name;
    else return "[SID " + sock.id + "]";
};
io.on('connection', function(sock) {
    sock.ip = sock.request.connection.remoteAddress;
    sock.name = null;
    sock.grp = null;
    sock.dead = false;
    log.info('new connection from IP ' + sock.ip + ' (id: ' + sock.id + ')', {
        sid: sock.id,
        ip: sock.ip
    });
    sock.on('setname', function(name) {
        if (!/^[a-z0-9]+$/i.test(name) || name.length > 15 || name.length < 3) {
            sock.emit('namefail');
            log.info('sid ' + sock.id + ' gave invalid name ' + name, {
                sid: sock.id
            });
        }
        else {
            sock.emit('nameset', name);
            sock.name = name;
            log.info('sid ' + sock.id + ' set name to ' + name, {
                sid: sock.id
            });
        }
    });
    sock.on('disconnect', function() {
        log.info(humanise(sock) + ' disconnected', {
            sid: sock.id
        });
        if (sock.grp) {
            if (rooms[sock.grp]) {
                if (rooms[sock.grp].leave(sock)) {
                    log.info(humanise(sock) + ' successfully left their room', {sid: sock.id});
                }
                else {
                    log.warn(humanise(sock) + ' failed to leave their room cleanly', {sid: sock.id});
                }
            }
            else {
                log.warn(humanise(sock) + ' has an invalid sock.grp value: ' + sock.grp, {sid: sock.id});
            }
        }
    });
    sock.on('create', function() {
        if (sock.grp) {
            log.info(humanise(sock) + ' attempted to create a room, but they are already in one!', {sid: sock.id});
            return;
        }
        if (!sock.name) {
            log.info(humanise(sock) + ' tried to create a room, but has no name', {sid: sock.id});
            return;
        }
        let tries = 0;
        let id = '';
        while (true) {
            id = hashids.encode(Number((Math.random() * 1000).toFixed(0)));
            id = id.toUpperCase();
            log.info('generated id ' + id + ' for new game (by ' + humanise(sock) + ')', {sid: sock.id});
            if (!rooms[id]) break;
            if (tries++ > 5) {
                log.error('tried more than 5 times to generate id for game, giving up', {sid: sock.id});
                sock.emit('ise');
                return;
            }
            log.warn('hit id collision, retrying', {sid: sock.id});
        }
        let room = new Room(id);
        rooms[id] = room;
        if (room.join(sock)) {
            log.info(humanise(sock) + " successfully created and joined group " + room.gid, {sid: sock.id, gid: room.gid});
        }
        else {
            log.error(humanise(sock) + " created group " + room.gid + ", but failed to join it", {sid: sock.id, gid: room.gid});
        }
    });
    sock.on('rjoin', function(id) {
        if (!sock.name) {
            log.info(humanise(sock) + ' tried to request a join, but has no name', {sid: sock.id});
            sock.emit('badjoin', 'No name registered');
            return;
        }
        if (!/^[a-z0-9]+$/i.test(id) || id.length > 10 || id.length < 2) {
            /* don't bother wasting CPU cycles for a clearly bogus group ;P */
            log.info(humanise(sock) + ' provided bad group code ' + id, {sid: sock.id});
            sock.emit('badjoin', 'Bad group code');
            return;
        }
        if (!rooms[id]) {
            log.info(humanise(sock) + ' failed to join ' + id + ', as it does not exist', {sid: sock.id});
            sock.emit('badjoin', 'No such group');
            return;
        }
        rooms[id].join(sock);
    });
    sock.on('start', function() {
        if (!sock.grp) {
            log.info(humanise(sock) + ' tries to start a group without being in one', {sid: sock.id});
            sock.emit('nostart', 'Not in a group');
            return;
        }
        if (!rooms[sock.grp]) {
            log.warn(humanise(sock) + ' tries to start gid ' + sock.grp + ', which does not exist', {sid: sock.id});
            sock.emit('nostart', 'No such group');
            return;
        }
        rooms[sock.grp].start(sock);
    });
});
