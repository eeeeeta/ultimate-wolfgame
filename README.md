# Ultimate Wolfgame

![Ultimate Wolfgame](http://i.imgur.com/TMRKMsh.png)

## Ultimate *what?*

**Wolfgame.** It's also called *Werewolf*, and is a rather popular parlour game amongst technology circles. ([see Wired article](http://www.wired.co.uk/magazine/archive/2010/03/features/werewolf)).
It had its roots in a game called *Mafia* by Dimitry Davidoff, invented in the time of the Cold War.

Traditional versions of Werewolf have required a human moderator to administrate the game. This changes that, by allowing players to use their mobile phones & tablets instead.

## How is it played?

The players divide into villagers and wolves. Wolves are allowed to kill one player every night, while
villagers vote to lynch one of the players during the daytime, with the aid of some special players
(seer, harlot...).

The various roles (implemented in this edition) include:

- **Seer**: special villager who may discover another player's role at night
- **Wolf**: can choose one person to kill at night
- **Village drunk**: special villager with no powers
- **Cursed villager**: villager who the Seer sees as a wolf
- **Harlot**: may visit the house of anyone at night - is killed if they visit a wolf or the wolves' victim

## How is this edition played?

Players navigate to the website (hosted somewhere) and join together with other players. Play continues
as per regular Werewolf, but all actions previously done by a human moderator are performed by a computer
instead, with players receiving instructions and making choices on their devices.

## Technological details

### What's the software architecture like?

The core game engine is written in C, and is spawned by a Node.js webserver that helps organise the game
and connect everything together. The engine code is completely free of frontend-related things, and
thus can be adapted for use in other wolfgame implementations.

### Why did you write it like that?

For fun and profit. C is a fun language to program in (much more interesting than JS, anyway) and
provides an interesting challenge. I realise that the architecture may not be the best way of doing
things, but meh :P

### Can I contribute code?

Well, if it works, then sure!

### Can I steal the code?

It's licensed under the [MIT License](https://en.wikipedia.org/wiki/MIT_License). Some files in the static/ directory (external libraries such as jQuery, Animate.css, etc) may be licensed under other licenses and are included here only for convenience.
