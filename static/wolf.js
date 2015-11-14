/*
 * Ultimate Wolfgame, JavaScript source
 *
 * FANTASTICALLY EXCITING VERSION II
 * =================================
 * including:
 *     - FSM-based logic
 *     - 75% less spaghetti code
 *     - easily-updatable role defs
 *     - less edge cases (hopefully)
 * =================================
 *
 * an eta thing <http://theta.eu.org>
 */
$(document).ready(function() {
    jQuery.fn.extend({
        disabled: function(state) {
            return this.each(function() {
                $(this).removeClass('disabled');
                this.disabled = state;
            });
        }
    });
    var Wolfgame = new machina.Fsm({
        initialize: function(opts) {
            console.log("Ultimate Wolfgame client, version II");
            console.log("====================================");
            console.log("github: eeeeeta/ultimate-wolfgame");
            console.log("an eta thing <http://theta.eu.org>"); // yes, I *shall* implement pervasive advertising!
        },
        name: null,
        socket: null,
        gid: null,
        _msgQ: [],
        _msgReady: true,
        role: null,
        endstats: {},
        plist: {},
        votes: {},
        namespace: "wolfgame",
        initialState: "connecting",
        roles: {
            seer: {
                act_imp: "See",
                act_btn_clr: "btn-primary",
                acts: true,
                icon_class: 'glyphicon-eye-open',
                name: 'seer',
                message: "You are a <b>seer</b>!</br><small>You may have one vision per night, in which you discover another player's role.</small>"
            },
            wolf: {
                act_imp: "Kill",
                act_btn_clr: "btn-danger",
                acts: true,
                icon_class: 'glyphicon-warning-sign',
                name: 'wolf',
                message: "You are a <b>werewolf</b>!</br><small>You may kill one player per night.</small>"
            },
            "village drunk": {
                acts: false,
                icon_class: 'glyphicon-glass',
                name: 'village drunk',
                message: "You have been drinking too much! You are the <b>village drunk</b>!"
            },
            "harlot": {
                act_imp: "Visit",
                act_btn_clr: "btn-success",
                icon_class: 'glyphicon-heart',
                acts: true,
                name: 'harlot',
                message: "You are a <b>harlot</b>!</br><small>You may visit one person by night. You will die if you visit a wolf, or the wolves' selected victim.</small>"
            },
            "villager": {
                acts: false,
                name: 'villager',
                icon_class: 'glyphicon-ok',
                message: "You are a <b>villager</b>!</br><small>Your job is to lynch all the wolves.</small>"
            },
            "cursed villager": {
                icon_class: 'glyphicon-ok uw-icon-cursed',
                name: 'cursed villager'
            }
        },
        death_msgs: {
            wolf: [
                "The corpse of <b>%a</b>, a <b>%b</b>, is found. Those remaining mourn the tragedy.",
                "The half-eaten remains of the late <b>%a</b>, a <b>%b</b>, are found in the village square. How disgusting."
            ],
            lynch: [
                "The villagers drag the protesting <b>%a</b> to a tree, hang them up, and lynch them. The village has lost a <b>%b</b>.",
                "The villagers, after a heated debate, decide to lynch <b>%a</b>... a <b>%b</b>.",
                "An angry mob descends on <b>%a</b> and takes them to the gallows. After a rather painful execution, it is revealed that they were a <b>%b</b>."
            ],
            harlot: [
                "<b>%a</b>, a <b>%b</b>, slept with a wolf last night and is now dead."
            ],
            harlot_double: [
                "The villagers also find the corpse of <b>%a</b>, a <b>%b</b>, who slept with the victim last night."
            ],
            disconnect: [
                "A disgruntled <b>%a</b>, most likely fed up with being a <b>%b</b>, takes a cyanide pill.",
                "<b>%a</b> walks off a cliff. As they fall, they reveal that they were a <b>%b</b>"
            ]
        },
        states: {
            "connecting": {
                _onEnter: function() {
                    var self = this;
                    this.socket = io(undefined, {reconnection: false});
                    this.socket.once('connect', function() {
                        self.transition('nameinput');
                    });
                    this.socket.on('disconnect', function() {
                        self.transition('disconnected');
                    });
                    this.socket.on('ise', function() {
                        self.transition('ised');
                    });
                }
            },
            "nameinput": {
                _onEnter: function() {
                    $('.init-conn').hide();
                    $('.group-join-input').hide();
                    $('.init-btns').show();
                    $('.group-join-waiting').hide();
                    this.handle('reset');
                },
                create: function() {
                    var self = this;
                    this.name = $("#name").val();
                    $('#group-create').disabled(true);
                    $('#group-join').disabled(true);
                    $('.group-join-waiting').show();
                    this.setupJoinListeners();
                    this.socket.emit("create", this.name);
                },
                join: function() {
                    var self = this;
                    this.name = $("#name").val();
                    $('#group-join').disabled(true);
                    $('#group-create').disabled(true);
                    this.socket.emit("setname", this.name);
                    var timeout = setTimeout(function() {
                        self.socket.removeListener("nameset",nsListener);
                        self.socket.removeListener("namefail",nfListener);
                        alert("Request timed out. Please try again.");
                        self.handle("reset");
                        clearTimeout(timeout);
                    }, 4500);
                    var nsListener = function() {
                        self.socket.removeListener("nameset",nsListener);
                        self.socket.removeListener("namefail",nfListener);
                        self.transition("grpinput");
                        clearTimeout(timeout);
                    };
                    var nfListener = function() {
                        self.socket.removeListener("nameset",nsListener);
                        self.socket.removeListener("namefail",nfListener);
                        alert("Invalid name given.");
                        self.handle("reset");
                        clearTimeout(timeout);
                    };
                    this.socket.on("nameset", nsListener);
                    this.socket.on("namefail", nfListener);
                },
                reset: function() {
                    $('#group-create').disabled(false);
                    $('#group-join').disabled(false);
                    $('.group-join-waiting').hide();
                },
                joined: function() {
                    this.transition("lobby");
                },
                _onExit: function() {
                    $('.init-btns').hide();
                }
            },
            grpinput: {
                _onEnter: function() {
                    $('.group-join-input').show();
                    this.handle('reset');
                },
                join: function() {
                    var self = this;
                    this.gid = $("#group-code").val();
                    this.gid = this.gid.toUpperCase();
                    if (!/^[a-z0-9]+$/i.test(this.gid) || this.gid.length > 10 || this.gid.length < 2) {
                        return alert("Invalid Group ID - check you entered it correctly!");
                    }
                    $('#group-join-confirm').disabled(true);
                    $('#group-join-welp').disabled(true);
                    $('.group-join-waiting').show();
                    this.setupJoinListeners();
                    this.socket.emit("rjoin", this.gid);
                },
                back: function() {
                    this.transition("nameinput");
                },
                joined: function() {
                    this.transition("lobby");
                },
                reset: function() {
                    $('#group-join-confirm').disabled(false);
                    $('#group-join-welp').disabled(false);
                    $('.group-join-waiting').hide();
                }
            },
            lobby: {
                _onEnter: function() {
                    $('.uw-welcome').hide();
                    $('.uw-lobby').show();
                    $('#grpcode').html(this.gid);
                    this.lobby_plist_handler = function(obj) {
                        Wolfgame.update_plist(obj.players, obj.mpl);
                    };
                    this.socket.on("plist", this.lobby_plist_handler);
                    this.socket.on("startcnfrm", this.startListener);
                },
                create_act_handler: function(pname, pli, btn) {
                    var self = this;
                    return function handler(ev) {
                        ev.stopPropagation();
                        ev.preventDefault();
                        pli.css("animation-name", "");
                        if (btn.hasClass("disabled")) return;
                        if (pli.hasClass("pli-dead")) return alert("That person's dead!");
                        btn.addClass("disabled");
                        setTimeout(function() {
                            btn.removeClass("disabled");
                        }, 500);
                        console.log("[INPUT] Handling roleinput for " + pname);
                        self.handle('roleinput', pname);
                    };
                },
                start: function() {
                    $('.uw-lobby-waiting').hide();
                    $('.uw-lobby-starting').show();
                    this.setupStartListeners();
                    this.socket.emit("start");
                },
                reset: function() {
                    $('.uw-lobby-starting').hide();
                    $('.uw-lobby-waiting').show();
                },
                started: function() {
                    this.transition("started");
                },
                _onExit: function() {
                    this.socket.removeListener("plist", this.lobby_plist_handler);
                    this.socket.removeListener("startcnfrm", this.startListener);
                }
            },
            started: {
                _onEnter: function() {
                    console.log("[HUMOUR] We made it into the game phase. That's good, I think.");
                    $('.uwl-item').hide();
                    $('.uwg-item').show();
                    this.game_state(true);
                    this.disp_msg("Welcome to Ultimate Wolfgame!");
                    var s = this.socket;
                    this._disp_msg_handler = function(msg) {
                        Wolfgame.disp_msg(msg);
                    };
                    s.on('msg', this._disp_msg_handler);
                    s.on('amsg', this._disp_msg_handler);
                    s.on('wtimeout', this._fnizeHandler('wtimeout'));
                    s.on('state', function state_handler(state) {
                        console.log("[RT] State handler:", state);
                        if (!Wolfgame.handle("state", state))
                            Wolfgame.state_handler(state);
                    });
                    s.on('death', function death_handler(who, role, why) {
                        console.log("[RT] Death handler:", who, role, why);
                        var text = "<b>" + who + "</b> died inexplicably.";
                        if (Wolfgame.death_msgs[why]) {
                            text = Wolfgame.death_msgs[why][Math.floor(Math.random() * Wolfgame.death_msgs[why].length)];
                            text = text.replace('%a', who);
                            text = text.replace('%b', role);
                        }
                        Wolfgame.disp_msg(text, undefined, function() {
                            this.onDeath(who, role, why);
                            this.handle("death", who, role, why);
                        });
                    });
                    s.on('nokill', function nokill_handler(why) {
                        console.log("[RT] Nokill handler:", why);
                        if (why == "harlot") Wolfgame.disp_msg("The wolves' selected victim was a harlot, who was not home last night.");
                        else Wolfgame.disp_msg("Traces of blood are found outside the city hall. However, all the villagers are fine.");
                    });
                    s.on('vote', this._fnizeHandler("vote"));
                    s.on('rolemsg', this._fnizeHandler("rolemsg"));
                    s.on('reveal', function(who, role) {
                        console.log("[RT] Reveal handler:", who, role);
                        Wolfgame.disp_msg(undefined, undefined, function() {
                            Wolfgame.role_reveal(who, role);
                        });
                    });
                    s.on('lynch_now', this._fnizeHandler("lynchnow"));
                    s.on('gameover', function gameover_handler(winner) {
                        console.log('[RT] Game over, winner:', winner);
                        var text = "Game over! All the wolves are dead! The villagers chop them up, cook them, and have a nice dinner.";
                        if (winner == "wolves") text = "Game over! The wolves overpower the villagers and win.";
                        Wolfgame.winner = winner;
                        Wolfgame.disp_msg(text, undefined, function() {
                            Wolfgame.transition("gameover");
                        });
                    });
                    s.on('endstat', function(who, role, da) {
                        console.log('[RT] End stat:', who, role, da);
                        Wolfgame.endstats[who] = role;
                    });
                }
            },
            night: {
                _onEnter: function() {
                    this.disp_msg("It is now nighttime.", undefined, function() {
                        this.game_state(true);
                    });
                    this.disp_msg("Non-villagers will receive instructions shortly.");
                    this.disp_msg("If you do not get anything, simply sit back, relax, and wait for morning.");
                    $('#uw-loading-waittext').html("Sleeping...");
                },
                rolemsg: function(role) {
                    console.log("[RT] Rolemsg handler:", role);
                    if (!this.roles[role]) {
                        return this.derp("I don't know anything about the role of '" + role + "' - refresh the page?");
                    }
                    this.role = this.roles[role];
                    this.disp_msg(this.role.message, undefined, function() {
                        $('.uw-role').html(this.role.name);
                        $('.uw-role-text').show();
                        this.role_reveal(this.name, this.role.name);
                        if (this.role.acts) {
                            this.transition("night_acting");
                        }
                    });
                }
            },
            night_acting: {
                _onEnter: function() {
                    $('.uw-pi-btn-act')
                        .removeClass("btn-danger btn-primary btn-success btn-default")
                        .disabled(false)
                        .addClass(this.role.act_btn_clr)
                        .html(this.role.act_imp);
                    this.votes = {};
                    $('#uw-loading-waittext').html("Tap or click on your target below.");
                },
                roleinput: function(pname) {
                    console.log("[INPUT] Submitting action for", pname);
                    $('#uw-loading-waittext').html("Waiting for others...");
                    this.socket.emit("roleclick", pname);
                },
                vote: function(from, to) {
                    console.log("[RT] Wolf vote:", from, to);
                    this.votes[from] = to;
                    this.update_votes(true);
                    if (from != this.name) Wolfgame.disp_msg("<b>" + from + "</b> votes to kill <b>" + to + "</b>.");
                    else Wolfgame.disp_msg("You select <b>" + to + "</b> to be killed tonight.");
                },
                _onExit: function() {
                    $('.uw-pi-btn-act').disabled(true);
                    this.votes = {};
                    this.update_votes(true);
                }
            },
            day: {
                _onEnter: function() {
                    $('#uw-loading-waittext').html("Waiting...");
                    this.disp_msg("The sun rises.", undefined, function() {
                        this.game_state(false);
                    });
                    this.disp_msg("The villagers get up and search the village...");
                },
                lynchnow: function(num) {
                    this.lynch_num = num;
                    this.disp_msg("The villagers must now decide who to lynch.</br><small>At least <b>" + num + "</b> players must vote for the same person; no votes or an even split will not result in a lynching.", undefined, function() {
                        console.log("[DBG] Transitioning to day_lynching mode");
                        this.transition("day_lynching");
                    });
                }
            },
            day_lynching: {
                _onEnter: function() {
                    $('#uw-loading-waittext').html("Tap or click on your target below.");
                    $('.uw-pi-btn-act')
                        .removeClass("btn-danger btn-primary btn-success btn-default")
                        .disabled(false)
                        .addClass("btn-danger")
                        .html("Lynch");
                },
                vote: function(from, to) {
                    console.log("[RT] Lynch vote:", from, to);
                    this.votes[from] = to;
                    this.update_votes(false);
                    $('#uw-loading-waittext').html("Waiting for majority...");
                },
                roleinput: function(pname) {
                    console.log("[INPUT] Submitting lynch for", pname);
                    this.socket.emit("roleclick", pname);
                },
                _onExit: function() {
                    this.votes = {};
                    this.update_votes(false);
                }
            },
            gameover: {
                _onEnter: function() {
                    console.log("[UI] Changing to game finished UI");
                    this.game_state(true);
                    $('.uw-game').hide();
                    $('.uw-loading').hide();
                    $('.uw-dead-ui').hide();
                    $('.uw-loading').html(""); 
                    $('.winners').html(this.winner);
                    $('.winners').css('background', (this.winner == "wolves" ? 'red' : 'green'));
                    $('.uw-gameover').fadeIn();
                    $(".uw-dn-text").html("Game over");
                    $(".uw-gstatus").html("thanks for playing &middot; hopefully it wasn't too buggy");
                    Object.keys(this.endstats).forEach(function(who) {
                        Wolfgame.role_reveal(who, Wolfgame.endstats[who]);
                    });
                    this.socket.removeAllListeners();
                    this.socket.disconnect();
                }
            },
            dead: {
                _onEnter: function() {
                    console.log("[UI] Switching to dead UI");
                    $('.uw-dead-ui').show();
                    $('#uw-loading-waittext').hide();
                },
                state: function(state) {
                    this.votes = {};
                    this.update_votes(false);
                    if (state) {
                        Wolfgame.disp_msg("It is now nighttime.", function() {
                            game_state(true);
                        });
                        Wolfgame.disp_msg("Those other alive people will be doing stuff now. But you won't.");
                        Wolfgame.disp_msg("Because, of course, you're dead.");
                    }
                    else {
                        Wolfgame.disp_msg("The sun rises.", function() {
                            game_state(false);
                        });
                        Wolfgame.disp_msg("Oooh, somebody's probably about to die now!");
                    }
                },
                lynchnow: function() {
                    Wolfgame.disp_msg("If you were alive, you might be panicking about being lynched.</br><small>But since you're dead, you have nothing to worry about!</small>");
                },
                vote: function(from, to) {
                    console.log("[RT] Lynch vote:", from, to);
                    this.votes[from] = to;
                    this.update_votes(false);
                }
            },
            disconnected: {
                _onEnter: function() {
                    console.log("[UI] Switching to disconnected UI");
                    $('.uwn').hide();
                    $('.uw-disconn').show();
                    this._msgQ = [];
                }
            },
            ised: {
                _onEnter: function() {
                    console.log("[UI] Switching to ISE UI");
                    $('.uwn').hide();
                    $('.uw-ise').show();
                    this._msgQ = [];
                }
            }
        },
        derp: function(why) {
            alert("Fatal error: " + why);
            throw new Error(why);
        },
        onDeath: function(who, role, why) {
            Object.keys(Wolfgame.plist).forEach(function(key) {
                if (Wolfgame.plist[key] == who) {
                    delete Wolfgame.plist[key];
                }
            });
            if (who == this.name) {
                this._msgQ.forEach(function(obj, idx) {
                    if (obj.msg && obj.msg.indexOf('who to lynch') != -1) {
                        Wolfgame._msgQ.splice(idx, 1);
                    }
                });
                this.transition('dead');
            }
            $('#uw-pleft').html(Object.keys(this.plist).length);
            $('.uw-plist-item[uw-player-name="' + who + '"]').addClass('pli-dead');
            $('.uw-player-info[uw-player-name="' + who + '"] .uw-pi-lgi-dead').html('this player has died');
            $('.uw-player-info[uw-player-name="' + who + '"] .uw-pi-btns').hide();
            this.role_reveal(who, role);
        },
        state_handler: function(state) {
            Wolfgame.transition(state ? "night" : "day");
        },
        create_act_handler: function(pname, pli, btn) {
            return this.handle('create_act_handler', pname, pli, btn);
        },
        _remListeners: function() {
            this.socket.removeListener("join", this.joinListener);
            this.socket.removeListener("badjoin", this.badJoinListener);
            this.socket.removeListener("nostart", this.startFailListener);
            clearTimeout(this._evTimeout);
        },
        joinListener: function(code) {
            Wolfgame._remListeners();
            Wolfgame.gid = code;
            Wolfgame.handle("joined");
        },
        failListener: function(why) {
            Wolfgame._remListeners();
            alert(why);
            Wolfgame.handle("reset");
        },
        timeoutFunc: function() {
            Wolfgame._remListeners();
            alert("Request timed out.");
            Wolfgame.handle("reset");
        },
        setupJoinListeners: function() {
            this._evTimeout = setTimeout(this.timeoutFunc, 3000);
            this.socket.on("join", this.joinListener);
            this.socket.on("badjoin", this.failListener);
        },
        setupStartListeners: function() {
            this._evTimeout = setTimeout(this.timeoutFunc, 3000);
            this.socket.on("nostart", this.failListener);
        },
        startListener: function() {
            Wolfgame._remListeners();
            Wolfgame.handle("started");
        },
        _fnizeHandler: function(hdlr) {
            return function functionised_handler() {
                var args = Array.prototype.slice.call(arguments);
                args.splice(0, 0, hdlr);
                return Wolfgame.handle.apply(Wolfgame, args);
            };
        },
        _displayFunc: function(msg, time, callback) {
            this._continueQ = function() {
                $('#msgs').hide();
                if (callback) callback.apply(Wolfgame);
                if (Wolfgame._msgQ.length > 0) {
                    var next = Wolfgame._msgQ.shift();
                    Wolfgame._displayFunc(next.msg, next.time, next.cb);
                    Wolfgame._msgReady = true;
                }
                else {
                    Wolfgame._msgReady = true;
                    $('.uw-loading').show();
                }
            };
            if (!msg) {
                /* messageless action, i.e. an action must happen at a relevant point in time */
                console.log("[MESSAGE] Running messageless action.");
                return this._continueQ();
            }
            console.log("[MESSAGE] \"" + msg + "\"");
            this._msgReady = false;
            $('#msgs').html(msg);
            $('#msgs').removeClass("flipOutX");
            $('#msgs').addClass("flipInX");
            $('#msgs').show();
            $('.uw-loading').hide();
            this._displayTimeoutFunc = function() {
                clearTimeout(Wolfgame._displayTimeout);
                $('#msgs').addClass("flipOutX");
                $('#msgs').removeClass("flipInX");
                setTimeout(function() {
                    Wolfgame._continueQ();
                }, 1200);
            };
            this.displayTimeout = setTimeout(Wolfgame._displayTimeoutFunc, (time || 1300 + (1000 * (msg.split(' ').length * (1 / 4.167)))));
        },
        disp_msg: function(msg, time, cb) {
            if (!this._msgReady) {
                this._msgQ.push({msg: msg, time: time, cb: cb});
            }
            else {
                this._displayFunc(msg, time, cb);
            }

        },
        update_plist: function(list, mpl) {
            this.plist = list;
            $('.uw-plist').show();
            $('.uw-plist-int').html('');
            $('.uw-player-info-real').remove();
            Object.keys(list).forEach(function(player) {
                player = list[player];
                var pli = $(document.createElement('div'));
                pli.addClass("uw-plist-item");
                pli.html("<span class='pli-votes'></span><div class='pli-text'><i class='glyphicon pli-icon glyphicon-user'></i>&nbsp;" + player + "</div>");
                pli.attr('uw-player-name', player);
                if (Wolfgame.name == player) pli.addClass('pli-me');
                var infobox = $('.uw-player-info-template').clone();
                infobox.removeClass('uw-player-info-template');
                infobox.addClass('uw-player-info-real');
                infobox.attr('uw-player-name', player);
                infobox.find('.uw-pi-name').html(player);
                var btn = infobox.find('.uw-pi-btn-act');
                var act_handler = Wolfgame.create_act_handler(player, pli, btn); 
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
                if (Wolfgame.name == player) {
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
            var percent = Object.keys(list).length / 4;
            percent = percent * 100;
            if (percent > 100) percent = 100;
            $('#lobby-progress').css('width', percent.toFixed(0) + '%');
            $('#lobby-progress').html(Object.keys(list).length + ' of 4 players');
            if (percent >= 100) {
                $('#start-btn').removeClass('btn-danger');
                $('#start-btn').disabled(false);
                $('#start-btn').addClass('btn-success');
            }
            else {
                $('#start-btn').addClass('btn-danger');
                $('#start-btn').disabled(true);
                $('#start-btn').removeClass('btn-success');
            }
        },
        game_state: function(st) {
            var ctr = (st ? "uwg-day" : "uwg-night");
            var cta = (st ? "uwg-night" : "uwg-day");
            $(".uwh-ingame").removeClass(ctr);
            $("body").removeClass(ctr);
            $("body").addClass(cta);
            $(".uw-dn-text").html(st ? "Nighttime" : "Daytime");
            $(".uwh-ingame").addClass(cta);
        },
        role_reveal: function(name, role) {
            if (!this.roles[role]) {
                return this.derp("role_reveal called with invalid role name");
            }
            var pelem = $('.uw-plist-item[uw-player-name="' + name + '"] .pli-icon');
            var ielem = $('.uw-player-info[uw-player-name="' + name + '"] .uw-pi-lgi-role');
            console.log('[UI] revealing ' + name + ' as ' + role);
            pelem.removeClass('glyphicon-user glyphicon-warning-sign'); /* for cursed */
            pelem.addClass(this.roles[role].icon_class);
            ielem.html('<i class="' + this.roles[role].icon_class + ' glyphicon"></i>&nbsp;this person is a <b>' + this.roles[role].name + '</b>');
        },
        update_votes: function(wolves) {
            var self = this;
            $('.uw-pi-lgi-votes').html("");
            $('.pli-votes').html("");
            $('.votelist').html("");
            $('.votetext').html("");
            var reverse_votes = {};
            Object.keys(this.votes).forEach(function(key) {
                if (!self.votes[key]) return;
                var elem = $('.uw-player-info[uw-player-name="' + key + '"] .uw-pi-lgi-votes-cast');
                var vote = self.votes[key];
                $('.votetext').html(wolves ? "Wolfteam selections" : "Votes so far");
                $('.votelist').append("<li><b>" + key + "</b> for <b>" + vote + "</b></li>");
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
    });
    window.Wolfgame = Wolfgame;
});
