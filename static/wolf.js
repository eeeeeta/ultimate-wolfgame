/*
 * Ultimate Wolfgame, JavaScript source
 * by eta
 */

var state = {
    name: null,
    night: true,
    started: false,
    sock: null,
    plist: null,
    dead: false,
    role: "villager"
};
function on_lobby_join(id) {
    $('.uw-welcome').hide();
    $('.uw-lobby').show();
    $('#grpcode').html(id);
}
function validate_name(sock) {
    return new Promise(function(resolve, reject) {
        var name = $('#name').val();
        if (!/^[a-z0-9]+$/i.test(name) || name.length > 15 || name.length < 3) {
            reject(new Error('Name must be alphanumeric and between 3-15 characters long.'));
        }
        sock.emit('setname', name);
        var nfListener = function() {
            reject(new Error('Error setting name.'));
        };
        var nsListener = function nsListener(setname) {
            sock.removeListener('namefail', nfListener);
            state.name = setname;
            resolve(setname);
        };
        var timeout = setTimeout(function namesetTimeout() {
            sock.removeListener('nameset', nsListener);
            sock.removeListener('namefail', nfListener);
            reject(new Error('Request timed out.'));
        }, 2500);
        sock.once('nameset', nsListener);
        sock.on('namefail', nfListener);
    });
}
function update_plist(list, mpl) {
    state.plist = list;
    $('.l-plist').html('');
    $('.g-plist').html('');
    Object.keys(list).forEach(function(player) {
        player = list[player];
        $('.l-plist').append("<li class=\"lgi-lobby-" + player + " list-group-item" + (state.name == player ? " lgi-mine" : "") + "\"><i class=\"glyphicon glyphicon-user\"></i>&nbsp;" + player + "</li>\n");
        $('.g-plist').append("<li class=\"list-group-item" + (state.name == player ? " lgi-mine" : "") + (state.started ? " lgi-clickable" : "") + "\" id=\"lgi-" + player + "\"><i class=\"glyphicon glyphicon-user\"></i>&nbsp;" + player + "<button class=\"btn btn-primary lgi-btn\"" + (!state.started ? " style=\"display: none;\" " : "") + "id=\"lbtn-" + player + "\"></button>" + "</li>\n");
        $('.lgi-btn').each(function(idx) {
            var obj = $('.lgi-btn')[idx];
            if (state.dead) $(obj).addClass('disabled');
            if (idx % 2 === 0) $(obj).addClass('lgi-btn-left');
            $(obj).click(function(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                if ($(obj).hasClass('disabled')) return;
                $(obj).addClass('disabled');
                setTimeout(function() {
                    $(obj).removeClass('disabled');
                }, 500);
                if (state.dead) return;
                console.log("registered click: " + ev.target.id.replace("lbtn-", ""));
                if (state.sock) state.sock.emit("roleclick", ev.target.id.replace("lbtn-", ""));
            });
        });
    });
    $('#uw-pleft').html(Object.keys(list).length);
    if (!state.started) {
        var percent = Object.keys(list).length / mpl;
        percent = percent * 100;
        $('#lobby-progress').css('width', percent.toFixed(0) + '%');
        $('#lobby-progress').html(Object.keys(list).length + ' of ' + mpl + ' players');
        if (percent == 100) {
            $('#start-btn').removeClass('disabled btn-danger');
            $('#start-btn').addClass('btn-success');
        }
        else {
            $('#start-btn').addClass('disabled btn-danger');
            $('#start-btn').removeClass('btn-success');
        }
    }
}
function create_grp(sock) {
    return new Promise(function(resolve, reject) {
        sock.emit('create');
        var list = function grp_create_join_listener(id) {
            resolve(id);
        };
        var timeout = setTimeout(function grp_create_timeout() {
            sock.removeListener('join', list);
            reject(new Error('Request timed out.'));
        }, 2500);
        sock.on('plist', function(obj) {
            update_plist(obj.players, obj.mpl);
        });
        sock.once('join', list);
    });
}
function join_grp(sock) {
    return new Promise(function(resolve, reject) {
        var gid = $('#group-code').val();
        gid = gid.toUpperCase();
        if (!/^[a-z0-9]+$/i.test(gid) || gid.length > 10 || gid.length < 2) {
            reject(new Error('Bad Group ID - did you enter it correctly?'));
        }
        sock.emit('rjoin', gid);
        var bjL = function bad_join(err) {
            reject(new Error('Error from server: ' + err));
            $('.uw-lobby-starting').hide();
            $('.uw-lobby-waiting').show();
        };
        var sjL = function good_join(id) {
            sock.removeListener('badjoin', bjL);
            resolve(id);
        };
        var timeout = setTimeout(function join_timeout() {
            sock.removeListener('join', sjL);
            sock.removeListener('badjoin', bjL);
            reject(new Error('Request timed out.'));
        }, 2500);
        sock.once('join', sjL);
        sock.once('badjoin', bjL);
    });
}
function start(sock) {
    sock.emit('start');
    var bjL = function bad_start(err) {
        alert('Error from server: ' + err);
    };
    var sjL = function good_start(id) {
        sock.removeListener('nostart', bjL);
    };
    sock.once('startcnfrm', sjL);
    sock.once('nostart', bjL);
}
var toDisplay = [];
var disp_running = false;
function r_disp_msg(msg, time, cb) {
    return new Promise(function(reso, rej) {
        disp_running = true;
        $('.uw-loading').hide();
        $('#msgs').html(msg);
        $('#msgs').removeClass("flipOutX");
        $('#msgs').addClass("flipInX");
        $('#msgs').show();
        setTimeout(function() {
            $('#msgs').addClass("flipOutX");
            $('#msgs').removeClass("flipInX");
            setTimeout(function() {
                $('#msgs').hide();
                if (cb) cb();
                if (toDisplay.length > 0) {
                    var next = toDisplay.shift();
                    r_disp_msg(next.msg, next.time, next.cb).then(function() {
                        disp_running = false;
                        reso();
                    });
                }
                else {
                    disp_running = false;
                    $('.uw-loading').show();
                    reso();
                }
            }, 1200);
        }, (time || 700 + (1000 * (msg.split(' ').length * (1 / 4.167)))));
    });
}
function disp_msg(msg, time, cb) {
    if (disp_running) {
        toDisplay.push({msg: msg, time: time, cb: cb});
    }
    else {
        r_disp_msg(msg, time, cb);
    }
}
function game_state(st) {
    var ctr = (st ? "uwg-day" : "uwg-night");
    var cta = (st ? "uwg-night" : "uwg-day");
    $(".uwh-ingame").removeClass(ctr);
    $("body").removeClass(ctr);
    $("body").addClass(cta);
    $(".uw-dn-text").html(st ? "Nighttime" : "Daytime");
    $(".uwh-ingame").addClass(cta);
}
function game_begin(sock) {
    $('.uwl-item').hide();
    $('.uwg-item').show();
    state.started = true;
    game_state(true);
    disp_msg("Welcome to Ultimate Wolfgame (beta), by eta!");
    sock.on('state', function(st) {
        state.night = st;
        console.log('state: ' + st);
        if (st) {
            disp_msg("It is now nighttime.", undefined, function() {
                game_state(st);
            });
            disp_msg("Non-villagers will recieve instructions shortly on what to do.");
            disp_msg("If you do not get anything, simply sit back, relax, & wait for the day.");
        }
        else {
            disp_msg("It is now daytime.", undefined, function() {
                game_state(st);
            });
            disp_msg("The villagers get up and search the village..");
        }
    });
    sock.on('msg', function(msg) {
        disp_msg(msg);
    });
    sock.on('amsg', function(msg) {
        disp_msg(msg);
    });
    sock.on('death', function(who, role, why) {
        if (why != "disconnect") $('.lgi-btn').fadeOut();
        var text = who + "died inexplicably.";
        if (why == "wolf") text = "The corpse of " + who + " is found. Those remaining mourn the tragedy.";
        else if (why == "lynch") text = "The villagers drag " + who + " to a tree, hang them up, and leave them to die.";
        else if (why == "disconnect") text = who + ", fed up with the world, jumps off a nearby cliff.";
        disp_msg(text, undefined, function() {
            Object.keys(state.plist).forEach(function(pid) {
                if (state.plist[pid] == who)
                    delete state.plist[pid];
            });
            if (who == state.name) {
                state.dead = true;
                var buf = toDisplay;
                toDisplay = [];
                disp_msg("You died! :(");
                disp_msg("Please take yourself out of the room to avoid sharing information.", undefined, function() {
                        toDisplay = buf;
                });
            }
            $('#uw-pleft').html(Object.keys(state.plist).length);
            $('#lgi-' + who).addClass('lgi-dead');
        });
        disp_msg("After further investigation, it is revealed that they were a <b>" + role + "</b>.");
    });
    sock.on('rolemsg', function(role) {
        console.log('rolemsg: ' + role);
        state.role = role;
        disp_msg("You are a <b>" + role + "!", undefined, function() {
            $('.uw-role').html(role);
            $('.uw-role-text').show();
        });
        if (role == "wolf") disp_msg("You may choose one person to kill per night.");
        else if (role == "seer") disp_msg("You may divine the role of one person per night.");
        else disp_msg("I AM ERROR. SOMEBODY SCREWED UP.");
        disp_msg("Choose your desired player below.", undefined, function() {
            $('.lgi-btn').fadeIn();
        });
    });
    sock.on('lynch_now', function(num) {
        console.log('lynch now');
        disp_msg("The villagers must now decide who to lynch.");
        if (state.dead) return;
        disp_msg("A majority vote is required: at least " + num + " players must vote for the same person.");
            disp_msg("Please make a selection below.", undefined, function() {
                $('.lgi-btn').fadeIn();
            });
    });
    sock.on('gameover', function(winner) {
        console.log('gameover', winner);
        disp_msg("Game over!", undefined, function() {
            game_state(true);
        $('.uw-game').hide();
        $('.uw-loading').hide();
        $('.uw-loading').html(""); /* KILL IT DEAD */
        $('.winners').html(winner);
        $('.winners').css('background', (winner == "wolves" ? 'red' : 'lightgreen'));
        $('.uw-gameover').fadeIn();
        $(".uw-dn-text").html("Game over");
        $(".uw-gstatus").html("thanks for playing &middot; hopefully it wasn't too buggy");
        update_plist = function() {};
        });
    });
    sock.on('endstat', function(who, role, da) {
        console.log('endstat', who, role, da);
        $('.lgi-lobby-' + who).html('<i class=\"glyphicon glyphicon-user\"></i>&nbsp;' + who + ' - a <b>' + role + '</b>');
    });
}
$(document).ready(function ready_cb() {
    if (!io) {
        alert('oh dear, socket.io failed to load - we pretty much are unusable now');
        return;
    }
    var sock = io();
    window.ios = sock;
    state.sock = sock;
    sock.on('connect', function connect_cb() {
        $('.init-conn').hide();
        $('.init-btns').show();
        sock.on('ise', function() {
            $('.uwn').hide();
            $('.uw-ise').show();
        });
        sock.on('plist', function(obj) {
            update_plist(obj.players, obj.mpl);
        });
        sock.on('startcnfrm', function() {
            game_begin(sock);
        });
        $('.name-val').click(function(ev) {
            if ($('.name-val').hasClass('disabled')) return;
            $('.name-val').addClass('disabled');
            validate_name(sock).then(function() {
                $('.init-btns').hide();
                if ($(ev.target).attr('id') == 'group-join') $('.group-join-input').show();
                if ($(ev.target).attr('id') == 'group-create') {
                    create_grp(sock).then(function(id) {
                        on_lobby_join(id);
                    }, function(err) {
                        alert(err.message);
                    });
                }
                $('.name-val').removeClass('disabled');
            }, function(err) {
                alert(err.message);
                $('.name-val').removeClass('disabled');
            });
        });
        $('#group-join-welp').click(function() {
            $('.init-btns').show();
            $('.group-join-input').hide();
        });
        $('#group-join-confirm').click(function() {
            $('.group-join-input').hide();
            $('.group-join-waiting').show();
            join_grp(sock).then(function(id) {
                on_lobby_join(id);
            }, function(err) {
                alert(err.message);
                $('.group-join-input').show();
                $('.group-join-waiting').hide();
            });
        });
        $('#start-btn').click(function() {
            if ($('#start-btn').hasClass('disabled')) return;
            $('.uw-lobby-waiting').hide();
            $('.uw-lobby-starting').show();
            start(sock);
        });
    });
});
