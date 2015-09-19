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
var redis = require('then-redis');
var db = redis.createClient();
var Hashids = require("hashids"),
hashids = new Hashids("ultimate wolfgame epic salt!", 5);

app.use(require('express').static(__dirname + '/static'));
server.listen(process.env.PORT || 9090);
console.log('listening on port ' + process.env.PORT || 9090);
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/wolf.html');
});

var group_gen_plist = co.wrap(function *(id) {
    var players = yield db.hgetall('games/' + id);
    if ((typeof players != 'object') || players == null) yield Promise.reject(new Error('No such group'));
    io.to('games/' + id).emit('plist', {
        players: _.values(players),
        npl: _.values(players).length,
        mpl: 4
    });
});
io.on('connection', function(sock) {
    sock.ip = sock.request.connection.remoteAddress;
    sock.name = 'namenotset';
    console.log('new connection from IP ' + sock.ip + ' (id: ' + sock.id + ')');
    sock.on('setname', function(name) {
        if (!/^[a-z0-9]+$/i.test(name) || name.length > 15 || name.length < 3) {
            sock.emit('namefail');
            console.log('socket ' + sock.id + ' is a filthy cheater and gave invalid name ' + name);
        }
        else {
            sock.emit('nameset', name);
            sock.name = name;
            console.log('sock ' + sock.id + ' set name ' + name);
        }
    });
    sock.on('create', function() {
        co(function *() {
            var tries = 0;
            var id = '';
            while (true) {
                id = hashids.encode(Number((Math.random() * 1000).toFixed(0)));
                id = id.toUpperCase();
                console.log('generated id ' + id + ' for new game from sock ' + sock.id);
                var exists = yield db.exists('games/' + id);
                if (exists == false) break;
                if (tries++ > 5) yield Promise.reject(new Error('too many tries'));
                console.log('id in use, retrying');
            }
            yield db.hset('games/' + id, sock.id, sock.name);
            sock.emit('join', id);
            sock.join('games/' + id);
            yield group_gen_plist(id);
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
                sock.emit('badjoin');
                console.log('sid ' + sock.id + ' provided bad group code ' + id);
            }
            else {
                var exists = yield db.exists('games/' + id);
                if (!exists) {
                    console.log('sid ' + sock.id + ' failed requesting join ' + id + ', as it does not exist');
                    sock.emit('badjoin');
                }
                else {
                    console.log('joining ' + sock.id + ' to gid ' + id);
                    yield db.hset('games/' + id, sock.id, sock.name);
                    sock.join('games/' + id);
                    sock.emit('join', id);
                    yield group_gen_plist(id);
                    console.log('sock ' + sock.id + ' (name ' + sock.name + ' joined gameid ' + id);
                }
            }
        }).then(function() {
            console.log('group join (sid ' + sock.id + ') executed succesfully');
        }, function(err) {
            console.error('error joining group for sid ' + sock.id);
            console.error(err.stack);
            sock.emit('ise');
        });
    });
});
