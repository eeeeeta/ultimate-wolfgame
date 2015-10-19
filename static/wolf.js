/*
 * Ultimate Wolfgame, JavaScript source
 *
 * very jQuery
 * such terrible
 * much spaghetti
 * many souldestroy
 * wow
 *
 * - eta
 */

var state = {
    name: null,
    night: true,
    started: false,
    finished: false,
    sock: null,
    endstats: {},
    plist: null,
    dead: false,
    votes: {},
    hints: [],
    role: "villager"
};
var death_msgs = {
    wolf: [
        "The corpse of <b>%a</b>, a <b>%b</b>, is found. Those remaining mourn the tragedy.",
        "The half-eaten remains of the late <b>%a</b>, a <b>%b</b>, are found in the village square. How disgusting."
    ],
    lynch: [
        "The villagers drag the protesting <b>%a</b> to a tree, hang them up, and lynch them. The village has lost a <b>%b</b>.",
        "The villagers, after a heated debate, decide to lynch <b>%a</b>... a <b>%b</b>.",
        "An angry mob descends on <b>%a</b> and takes them to the gallows. After a rather painful execution, it is revealed that they were a <b>%b</b>"
    ],
    disconnect: [
        "A disgruntled <b>%a</b>, most likely fed up with being a <b>%b</b>, takes a cyanide pill."
    ]
};
var role_msgs = {
    "seer": "You are a <b>seer</b>!</br><small>You may have one vision per night, in which you discover another player's role.</small>",
    "wolf": "You are a <b>werewolf</b>!</br><small>You may kill one player per night.</small>",
    "village drunk": "You have been drinking too much! You are the <b>village drunk</b>!"
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
    if (state.started) return;
    $('.uw-plist').show();
    $('.uw-plist-int').html('');
    $('.uw-player-info-real').remove();
    Object.keys(list).forEach(function(player) {
        player = list[player];
        var pli = $(document.createElement('div'));
        pli.addClass("uw-plist-item");
        pli.html("<span class='pli-votes'></span><div class='pli-text'><i class='glyphicon pli-icon glyphicon-user'></i>&nbsp;" + player + "</div>");
        pli.attr('uw-player-name', player);
        if (state.name == player) pli.addClass('pli-me');
        var infobox = $('.uw-player-info-template').clone();
        infobox.removeClass('uw-player-info-template');
        infobox.addClass('uw-player-info-real');
        infobox.attr('uw-player-name', player);
        infobox.find('.uw-pi-name').html(player);
        var btn = infobox.find('.uw-pi-btn-act');
        var act_handler = function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            pli.css("animation-name", "");
            if (state.dead || !state.started) return console.log("ignored click");
            if (btn.hasClass("disabled")) return;
            if (pli.hasClass("pli-dead")) return alert("That person's dead!");
            btn.addClass("disabled");
            setTimeout(function() {
                btn.removeClass("disabled");
            }, 500);
            console.log("registered click: " + pli.attr('uw-player-name'));
            if (state.sock) state.sock.emit('roleclick', pli.attr('uw-player-name'));
        };
        btn.click(act_handler);
        btn.addClass('disabled');
        infobox.find('.uw-pi-btn-close').click(function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            infobox.hide();
        });
        infobox.find('.uw-pi-btn-hint').click(function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            if (infobox.find('.uw-pi-btn-hint').hasClass("disabled")) return;
            infobox.find('.uw-pi-btn-hint').addClass("disabled");
            send_hint(pli.attr('uw-player-name'));
        });
        infobox.find('.uw-pi-btn-hint').addClass('disabled');
        infobox.find('.uw-pi-lgi-role').html("you don't know this person's role");
        if (state.name == player) {
            infobox.find('.uw-pi-lgi-me').html('this is you!');
        }
        pli.on("taphold", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            pli.css("animation-name", "");
            infobox.show();
        });
        pli.on("vmousedown", function(ev) {
            pli.css("animation-name", "holddown");
        });
        pli.on("vmouseup", function(ev) {
            pli.css("animation-name", "");
        });
        pli.on("vmousecancel", function(ev) {
            pli.css("animation-name", "");
        });
        pli.on("click", act_handler);
        infobox.hide();
        $('.uw-plist-int').append(pli);
        $('.uw-player-info-boxes').append(infobox);
    });
    $('#uw-pleft').html(Object.keys(list).length);
    if (!state.started) {
        var percent = Object.keys(list).length / 4;
        percent = percent * 100;
        if (percent > 100) percent = 100;
        $('#lobby-progress').css('width', percent.toFixed(0) + '%');
        $('#lobby-progress').html(Object.keys(list).length + ' of 4 players');
        if (percent >= 100) {
            $('#start-btn').removeClass('disabled btn-danger');
            $('#start-btn').addClass('btn-success');
        }
        else {
            $('#start-btn').addClass('disabled btn-danger');
            $('#start-btn').removeClass('btn-success');
        }
    }
}
function send_hint(name) {
    disp_msg("Hint sent.");
    state.sock.emit('sendhint', name);
    $('.uw-player-info[uw-player-name="' + name + '"] .uw-pi-lgi-hint').html("<i class='glyphicon glyphicon-asterisk'></i>&nbsp;you have sent a hint to this person");
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
        }, (time || 1300 + (1000 * (msg.split(' ').length * (1 / 4.167)))));
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
    state.votes = {};
    update_votes();
}
function role_reveal(name, role) {
    var pelem = $('.uw-plist-item[uw-player-name="' + name + '"] .pli-icon');
    var ielem = $('.uw-player-info[uw-player-name="' + name + '"] .uw-pi-lgi-role');
    console.log('revealing ' + name + ' as ' + role);
    pelem.removeClass('glyphicon-user glyphicon-warning-sign'); /* for cursed */
    switch (role) {
        case "villager":
            pelem.addClass('glyphicon-ok');
        ielem.html('<i class="glyphicon glyphicon-ok"></i>&nbsp;this person is a villager');
        break;
        case "wolf":
            pelem.addClass('glyphicon-warning-sign');
        ielem.html('<i class="glyphicon glyphicon-warning-sign"></i>&nbsp;this person is a wolf');
        break;
        case "seer":
            pelem.addClass('glyphicon-eye-open');
        ielem.html('<i class="glyphicon glyphicon-eye-open"></i>&nbsp;this person is a seer');
        break;
        case "village drunk":
            pelem.addClass('glyphicon-glass');
        ielem.html('<i class="glyphicon glyphicon-glass"></i>&nbsp;this person is a village drunk!');
        break;
        case "cursed villager":
            pelem.addClass('glyphicon-ok uw-icon-cursed');
        ielem.html('<i class="glyphicon glyphicon-ok uw-icon-cursed"></i>&nbsp;this person is a cursed villager');
        break;
        default:
            pelem.addClass('glyphicon-user');
        ielem.html('<b>Role:</b>&nbsp' + role);
        break;
    }
}
function update_votes(wolves) {
    $('.uw-pi-lgi-votes').html("");
    $('.pli-votes').html("");
    var reverse_votes = {};
    Object.keys(state.votes).forEach(function(key) {
        if (!state.votes[key]) return;
        var elem = $('.uw-player-info[uw-player-name="' + key + '"] .uw-pi-lgi-votes-cast');
        var vote = state.votes[key];
        elem.html('<b>' + (wolves ? 'Voting to kill': 'Voting to lynch') + ':</b>&nbsp;' + vote);
        if (!reverse_votes[vote]) reverse_votes[vote] = [key];
        else reverse_votes[vote].push(key);
    });
    Object.keys(reverse_votes).forEach(function(key) {
        if (!reverse_votes[key]) return;
        var elem = $('.uw-player-info[uw-player-name="' + key + '"] .uw-pi-lgi-votes-recv');
        var pliv = $('.uw-plist-item[uw-player-name="' + key + '"] .pli-votes');
        var votes = reverse_votes[key];
        pliv.html(votes.length);
        elem.html('<b>' + (wolves ? 'Targeted' : 'Voted for') + ' by:</b>&nbsp;' + votes.join(', '));
    });
}
function game_begin(sock) {
    $('.uwl-item').hide();
    $('.uwg-item').show();
    $('.uw-pi-btn-hint').removeClass('disabled');
    state.started = true;
    game_state(true);
    disp_msg("Welcome to Ultimate Wolfgame (beta)!");
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
            disp_msg("The sun rises.", undefined, function() {
                game_state(st);
            });
            disp_msg("The villagers get up and search the village...");
        }
    });
    sock.on('msg', function(msg) {
        disp_msg(msg);
    });
    sock.on('amsg', function(msg) {
        disp_msg(msg);
    });
    sock.on('wtimeout', function() {
        $('.uw-dn-text').html("Twilight");
        if (state.night) {
            disp_msg("<b>As the sky begins to lighten, the wolves are reminded that they do not have much time to make a decision.</b>");
        }
        else {
            disp_msg("<b>As the sun approaches the horizon, the villagers are reminded that they must make a choice soon!</b>");
            disp_msg("If there is no majority in <b>2 minutes' time</b>, the player with the <b>most amount</b> of votes will be lynched.");
            disp_msg("A random player will be lynched if there is an even split.");
        }
    });
    sock.on('hint', function(from) {
        if (state.hints.indexOf(from) != -1) return;
        state.hints.push(from);
        disp_msg("<b>" + from + "</b> sent you a hint!");
        $('.uw-player-info[uw-player-name="' + from + '"] .uw-pi-lgi-hint-recv').html("<i class='glyphicon glyphicon-asterisk'></i>&nbsp;this person sent you a hint!</i>");
        var elem = $(document.createElement('i'));
        elem.addClass('glyphicon glyphicon-asterisk uw-hint');
        $('.uw-plist-item[uw-player-name="' + from + '"]').append(elem);
    });
    sock.on('death', function(who, role, why) {
        if (why != 'disconnect') $('.uw-pi-btn-act').addClass('disabled');
        var text = "<b>" + who + "</b> died inexplicably.";
        if (death_msgs[why]) {
            text = death_msgs[why][Math.floor(Math.random() * death_msgs[why].length)];
            text = text.replace('%a', who);
            text = text.replace('%b', role);
        }
        disp_msg(text, undefined, function() {
            Object.keys(state.plist).forEach(function(key) {
                if (state.plist[key] == who) {
                    delete state.plist[key];
                }
            });
            if (who == state.name) {
                state.dead = true;
                $('.uw-dead-text').show();
                var buf = toDisplay;
                toDisplay = [];
                disp_msg("You died! :(");
                disp_msg("Please make sure you <b>do not</b> give any information away to other players; doing so can massively ruin the game!</br><small>You may continue to spectate and watch the game progress, as long as you are careful to not divulge any information.</small>", undefined, function() {
                        toDisplay = buf;
                });
            }
            $('#uw-pleft').html(Object.keys(state.plist).length);
            $('.uw-plist-item[uw-player-name="' + who + '"]').addClass('pli-dead');
            $('.uw-player-info[uw-player-name="' + who + '"] .uw-pi-lgi-dead').html('this player has died');
            $('.uw-player-info[uw-player-name="' + who + '"] .uw-pi-btns').hide();
            role_reveal(who, role);
        });
    });
    sock.on('wolftgt', function(from, to) {
        state.votes[from] = to;
        update_votes(true);
        disp_msg("<b>" + from + "</b> selects <b>" + to + "</b> to be killed tonight.");
    });
    sock.on('nokill', function() {
        disp_msg("Wolf markings are found outside the city hall. However, no casualties are present.");
    });
    sock.on('rolemsg', function(role) {
        console.log('rolemsg: ' + role);
        var role_msg = "You are a <b>" + role + "!";
        state.role = role;
        if (role_msgs[role]) role_msg = role_msgs[role];
        disp_msg(role_msg, undefined, function() {
            $('.uw-role').html(role);
            $('.uw-role-text').show();
            role_reveal(state.name, role);
            if (role == "village drunk") return;
            var roleact = "Target";
            if (role == "wolf") {
                roleact = "Kill";
                $('.uw-pi-btn-act').removeClass('btn-danger btn-primary').addClass('btn-danger');
            }
            if (role == "seer") {
                roleact = "See";
                $('.uw-pi-btn-act').removeClass('btn-danger btn-primary').addClass('btn-primary');
            }
            $('.uw-pi-btn-act').removeClass('disabled');
            $('.uw-pi-btn-act').html(roleact);
        });
        if (role != "village drunk") disp_msg("Tap or click on your target below.");
    });
    sock.on('lynchvote', function(from, to) {
        disp_msg("<b>" + from + "</b> votes for <b>" + to + "</b>.", undefined, function() {
            state.votes[from] = to;
            update_votes();
        });
    });
    sock.on('reveal', function(who, role) {
        console.log('reveal', who, role);
        role_reveal(who, role);
    });
    sock.on('lynch_now', function(num) {
        console.log('lynch now');
        disp_msg("The villagers must now decide who to lynch.</br><small>At least <b>" + num + "</b> players must vote for the same person; no votes or an even split will not result in a lynching.</small>", undefined, function() {
            $('.uw-pi-btn-act').removeClass('btn-danger disabled btn-primary').addClass('btn-danger');
            $('.uw-pi-btn-act').html('Lynch');
        });
        if (state.dead) return;
        disp_msg("Tap or click on your target below.");
    });
    sock.on('gameover', function(winner) {
        console.log('gameover', winner);
        state.finished = true;
        var text = "Game over! All the wolves are dead! The villagers chop them up, cook them, and have a nice dinner.";
        if (winner == "wolves") text = "Game over! The wolves overpower the villagers and win.";
        disp_msg(text, undefined, function() {
            game_state(true);
            $('.uw-game').hide();
            $('.uw-loading').hide();
            $('.uw-loading').html(""); /* KILL IT DEAD */
            $('.winners').html(winner);
            $('.winners').css('background', (winner == "wolves" ? 'red' : 'green'));
            $('.uw-gameover').fadeIn();
            $(".uw-dn-text").html("Game over");
            $(".uw-gstatus").html("thanks for playing &middot; hopefully it wasn't too buggy");
            Object.keys(state.endstats).forEach(function(who) {
                role_reveal(who, state.endstats[who]);
            });
            sock.disconnect();
        });
    });
    sock.on('endstat', function(who, role, da) {
        console.log('endstat', who, role, da);
        state.endstats[who] = role;
    });
}
$(document).ready(function ready_cb() {
    if (!io) {
        alert('oh dear, socket.io failed to load - we pretty much are unusable now');
        return;
    }
    var sock = io(undefined, {reconnection: false});
    window.ios = sock;
    state.sock = sock;
    sock.on('connect', function connect_cb() {
        $('.init-conn').hide();
        $('.init-btns').show();
        sock.on('ise', function() {
            $('.uwn').hide();
            $('.uw-ise').show();
        });
        sock.on('disconnect', function() {
            if (state.finished) return;
            $('.uwn').hide();
            $('.uw-disconn').show();
        });
        $('.uw-btn-refresh').click(function() {
            location.reload();
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
