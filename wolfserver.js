/*
 *
 * ultimate wolfgame, server code
 * by eta
 */

var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var co = require('co');
var _ = require('lodash');
var port = process.env.PORT || 9090;
var Engine = require('./wolfbridge');
var Room = function(gid) {
    this.engine = null;
    this.started = false;
    this.plist = {};
    this.socks = [];
    this.sgid = 'games/' + gid;
};
var rooms = {};
var Hashids = require("hashids"),
hashids = new Hashids("ultimate wolfgame epic salt!", 5);

app.use(require('express').static(__dirname + '/static'));
server.listen(port);
console.log('listening on port ' + port);
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/wolf.html');
});

var group_gen_plist = co.wrap(function *(id) {
    if (!rooms[id]) yield Promise.reject(new Error("No such group"));
    io.to('games/' + id).emit('plist', {
        players: rooms[id].plist,
        mpl: 4
    });
});
var group_create = co.wrap(function *(sock, gid) {
    if (rooms[gid]) yield Promise.reject(new Error('Group already exists'));
    rooms[gid] = new Room(gid);
    rooms[gid].plist[sock.id] = sock.name;
    sock.join('games/' + gid);
    sock.emit('join', gid);
    sock.grp = gid;
    rooms[gid].socks.push(sock);
    yield group_gen_plist(gid);
    console.log('sid ' + sock.id + ' (' + sock.name + ') creates group ' + gid);
});
var group_join = co.wrap(function *(sock, gid) {
    if (!rooms[gid]) yield Promise.reject(new Error('No such group'));
    if (Object.keys(rooms[gid].plist).length >= 4) yield Promise.reject(new Error('Too many players in group'));
    rooms[gid].plist[sock.id] = sock.name;
    sock.join('games/' + gid);
    sock.emit('join', gid);
    rooms[gid].socks.push(sock);
    sock.grp = gid;
    yield group_gen_plist(gid);
    console.log('sid ' + sock.id + ' (' + sock.name + ') joins group ' + gid);
});
var group_leave = co.wrap(function *(sock, gid) {
    if (!rooms[gid]) return console.log('warn: sid ' + sock.id + ' tried to leave nonexistent gid ' + gid);
    if (!rooms[gid].plist[sock.id]) yield Promise.reject(new Error('Player not in group'));
    delete rooms[gid].plist[sock.id];
    if (rooms[gid].socks.indexOf(sock)) rooms.socks.splice(rooms[gid].socks.indexOf(sock), 1);
    console.log('sid ' + sock.id + ' (' + sock.name + ') leaves group ' + gid);
    var len = Object.keys(rooms[gid].plist);
    if (len === 0) {
        console.log('gid ' + gid + ' is now empty, deleting');
        delete rooms[gid];
        if (rooms[gid].engine) {
            rooms[gid].engine.quit();
        }
    }
    yield group_gen_plist(gid);

});
io.on('connection', function(sock) {
    sock.ip = sock.request.connection.remoteAddress;
    sock.name = 'namenotset';
    console.log('new connection from IP ' + sock.ip + ' (id: ' + sock.id + ')');
    sock.on('setname', function(name) {
        if (!/^[a-z0-9]+$/i.test(name) || name.length > 15 || name.length < 3) {
            sock.emit('namefail');
            console.log('socket ' + sock.id + ' gave invalid name ' + name);
        }
        else {
            sock.emit('nameset', name);
            sock.name = name;
            console.log('sock ' + sock.id + ' set name ' + name);
        }
    });
    sock.on('disconnect', function() {
        console.log('sid ' + sock.id + ' disconnected, removing rooms');
        co(function *() {
            if (sock.grp) yield group_leave(sock, sock.grp);
        }).then(function() {
            console.log('cleanup of sid ' + sock.id + ' completed');
        }, function(err) {
            console.error('error while cleaning up ' + sock.id);
            console.error(err.stack);
        });
    });
    sock.on('create', function() {
        co(function *() {
            var tries = 0;
            var id = '';
            while (true) {
                id = hashids.encode(Number((Math.random() * 1000).toFixed(0)));
                id = id.toUpperCase();
                console.log('generated id ' + id + ' for new game from sock ' + sock.id);
                if (!rooms[id]) break;
                if (tries++ > 5) yield Promise.reject(new Error('too many tries'));
                console.log('id in use, retrying');
            }
            yield group_create(sock, id);
            console.log('sock ' + sock.id + ' (name ' + sock.name + ') created and joined gameid ' + id);
        }).then(function() {
            console.log('group creation (sid ' + sock.id + ') executed successfully');
        }, function(err) {
            console.error('error creating group for sid ' + sock.id);
            console.error(err.stack);
            sock.emit('ise');
        });
    });
    sock.on('rjoin', function(id) {
        co(function *() {
            if (!/^[a-z0-9]+$/i.test(id) || id.length > 10 || id.length < 2) {
                console.log('sid ' + sock.id + ' provided bad group code ' + id);
                sock.emit('badjoin', 'Bad group code');
                return;
            }
            if (!rooms[id]) {
                console.log('sid ' + sock.id + ' failed requesting join ' + id + ', as it does not exist');
                sock.emit('badjoin', 'No such group');
                return;
            }
            if (Object.keys(rooms[id].plist) >= 4) {
                console.log('sid ' + sock.id + ' failed requesting join ' + id + ', as players >= 4');
                sock.emit('badjoin', 'Too many players');
                return;
            }
            if (rooms[id].started) {
                console.log('sid ' + sock.id + ' failed requesting start ' + id + ', as already started');
                sock.emit('badjoin', 'Game started');
                return;
            }
            console.log('joining ' + sock.id + ' to gid ' + id);
            yield group_join(sock, id);
            console.log('sock ' + sock.id + ' (name ' + sock.name + ') joined gameid ' + id);
        }).then(function() {
            console.log('group join (sid ' + sock.id + ') executed succesfully');
        }, function(err) {
            console.error('error joining group for sid ' + sock.id);
            console.error(err.stack);
            sock.emit('ise');
        });
    });
    sock.on('start', function() {
        if (!sock.grp) {
            console.log('sid ' + sock.id + ' tries to start a group without being in one');
            sock.emit('nostart', 'Not in a group');
            return;
        }
        if (!rooms[sock.grp]) {
            console.log('sid ' + sock.id + ' tries to start nonexistent gid ' + sock.grp);
            sock.emit('nostart', 'No such group');
            return;
        }
        if (rooms[sock.grp].started) {
            console.log('sid ' + sock.id + ' tries to start already started gid ' + sock.grp);
            sock.emit('nostart', 'Already running');
            return;
        }
        if (Object.keys(rooms[sock.grp].plist).length < 4) {
            console.log('sid ' + sock.id + ' failed starting game, as players < 4');
            sock.emit('nostart', 'Not enough players');
            return;
        }
        console.log('starting game ' + sock.grp + ' after req from sid ' + sock.id);
        rooms[sock.grp].started = true;
        console.log('initialising game engine...');
        rooms[sock.grp].engine = new Engine(sock.grp, rooms[sock.grp].plist);
        io.to('games/' + sock.grp).emit('startcnfrm');
        rooms[sock.grp].engine.on('ise', function() {
            console.log('engine for ' + sock.grp + ' suffered ise');
            io.to('games/' + sock.grp).emit('ise');
        });
        rooms[sock.grp].engine.on('state', function(state) {
            io.to('games/' + sock.grp).emit('state', state);
        });
        rooms[sock.grp].engine.on('amsg', function(msg) {
            io.to('games/' + sock.grp).emit('amsg', msg);
        });
        rooms[sock.grp].engine.on('msg', function(to, msg) {
            rooms[sock.grp].socks.forEach(function(cli) {
                if (cli.id == to) {
                    cli.emit('msg', msg);
                }
            });
        });
        rooms[sock.grp].engine.on('rolemsg', function(to, role) {
            rooms[sock.grp].socks.forEach(function(cli) {
                if (cli.id == to) {
                    cli.emit('rolemsg', role);
                }
            });
        });
    });
});
