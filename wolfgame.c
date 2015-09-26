/*
 * wolfgame in c
 * 
 * this Jeremy Clarkson idea was brought to you by eta
 */
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <sys/poll.h>
#include <stdio.h>
#include <stdarg.h>
#include <time.h>
#include <sys/stat.h>
#include <assert.h>
#include "varlibs/vbuf.h"
#define WGP_ENUMERATE(wg) DPA_ENUMERATE(wg->players)
#define WGP_ENUMERATE_DEAD(wg) DPA_ENUMERATE(wg->dead)
#define KCHOICE_ENUMERATE(wg) DPA_ENUMERATE(wg->kchoices)
#define EWGP ((struct wg_player *) wolfgame->players->keys[DPA_N])
#define EDWGP ((struct wg_player *) wolfgame->dead->keys[DPA_N])
#define EKCHOICE ((struct wg_kchoice *) wolfgame->kchoices->keys[DPA_N])
#define MAX_ID_LEN 51
char *ONE = "one";
char *TWO = "two";
char *THREE = "three";
char *FOUR = "four";
enum wg_roles { VILLAGER, WOLF, SEER, NONE };
enum wg_roles conf_4p[2] = { SEER, WOLF };
enum wg_states { DAY, NIGHT };
struct wg_player {
    enum wg_roles role;
    char *id;
    int votes;
    bool free_my_id;
    bool acted;
    bool dead;
};
struct wg_kchoice {
    struct wg_player *actor;
    struct wg_player *tgt;
};
struct wolfgame {
    DPA *players;
    DPA *dead;
    DPA *kchoices;
    enum wg_states state;
};
struct wolfgame *wolfgame = NULL;
void wg_log(char *fmt, ...) {
    va_list va;
    va_start(va, fmt);
    vfprintf(stderr, fmt, va);
    va_end(va);
}
struct wg_player *wgp_init(void) {
    struct wg_player *pl = malloc(sizeof(struct wg_player));
    assert(pl != NULL);
    pl->role = NONE;
    pl->id = NULL;
    pl->acted = false;
    pl->dead = false;
    pl->free_my_id = false;
    return pl;
}
void wgp_msg(struct wg_player *wgp, char *msg) {
    printf("MSG %s %s\n", wgp->id, msg);
}
void wg_amsg(char *msg) {
    printf("AMSG %s\n", msg);
}
void wgp_msg_sprintf(struct wg_player *wgp, const char *format, ...) {
    va_list vali, valn;
    va_start(vali, format);
    va_copy(valn, vali);
    int len = 2; /* extra bytes, for safety */
    len += vsnprintf(NULL, 0, format, vali);
    char buf[len];
    vsnprintf(buf, len, format, valn);
    if (wgp != NULL) wgp_msg(wgp, buf);
    else wg_amsg(buf);
    va_end(vali);
    va_end(valn);
}
struct wg_player *wg_target(char *id) {
    WGP_ENUMERATE(wolfgame) {
        if (strcmp(EWGP->id, id) == 0) {
            return EWGP;
        }
    }
    return NULL;
}
bool wg_check_day(void) {
    bool ready = true;
    WGP_ENUMERATE(wolfgame) {
        if (EWGP->role != VILLAGER && EWGP->acted == false) ready = false;
    }
    return ready;
}
const char *wg_rtc(enum wg_roles role) {
    switch (role) {
        case SEER:
            return "seer";
            break;
        case WOLF:
            return "wolf";
            break;
        case VILLAGER:
            return "villager";
            break;
        default:
            return "glitch";
            break;
    }
}
void wg_kchoice_add(struct wg_player *actor, struct wg_player *tgt) {
    if (actor == tgt && wolfgame->state != DAY) {
        wgp_msg(actor, "Suicide is bad! Don't do it.");
        return;
    }
    struct wg_kchoice *wgk = malloc(sizeof(struct wg_kchoice));
    assert(wgk != NULL);
    KCHOICE_ENUMERATE(wolfgame) {
        if (EKCHOICE->actor == actor) {
            DPA_rem(wolfgame->kchoices, EKCHOICE); /* make sure one player
                                                      doesn't register 2 kchoices */
            break;
        }
    }
    wgk->actor = actor;
    wgk->tgt = tgt;
    DPA_store(wolfgame->kchoices, wgk);
    if (wolfgame->state == NIGHT) {
        actor->acted = true;
        wgp_msg_sprintf(actor, "You select {%s} to be killed tonight.", tgt->id);
    }
    else {
        wgp_msg_sprintf(NULL, "{%s} votes for {%s} to be lynched.", actor->id, tgt->id);
    }
}
void wg_role_act(struct wg_player *actr, struct wg_player *tgt) {
    switch (actr->role) {
        case SEER:
            if (actr->acted) return wgp_msg(actr, "You may not see more than one person per night.");
            wgp_msg_sprintf(actr, "You, through your magical powers, divine {%s} to be a %s!", tgt->id, wg_rtc(tgt->role));
            actr->acted = true;
            break;
        case WOLF:
            wg_kchoice_add(actr, tgt);
            break;
        default:
            wgp_msg_sprintf(actr, "You do not have a special ability.");
            break;
    }
}
void wgp_night(struct wg_player *wgp) {
    switch (wgp->role) {
        case SEER:
            printf("ROLEMSG %s seer\n", wgp->id);
            wgp->acted = false;
            break;
        case WOLF:
            printf("ROLEMSG %s wolf\n", wgp->id);
            wgp->acted = false;
            break;
        default:
            break;
    }
}
void wg_kchoice_cleanslate(void) {
    DPA *dpa = wolfgame->kchoices;
    DPA_ENUMERATE(dpa) {
        free(dpa->keys[DPA_N]);
    }
    DPA_free(dpa);
    wolfgame->kchoices = DPA_init();
    assert(wolfgame->kchoices != NULL);
}
int wg_calc_majority(void) {
    return (wolfgame->players->used / 2) + 1;
}
struct wg_player *wg_kchoice_analyse(bool majority) {
    /*
     * This function gets the Special Stupid Function Award(tm),
     * for being the function that I had to debug the most.
     */
    struct wg_player *wgp = NULL;
    int mvotes = 0;
    WGP_ENUMERATE(wolfgame) {
        EWGP->votes = 0;
        wgp = EWGP; /* DPA_N will get lost inside KCHOICE_ENUMERATE */
        KCHOICE_ENUMERATE(wolfgame) {
            if (EKCHOICE->tgt == wgp) {
                (wgp->votes)++; /* there's some weird rule about ++ and pointers, better
                                   to play it safe */
            }
            if (wgp->votes > mvotes && !majority) mvotes = wgp->votes;
        }
    }
    if (majority) mvotes = wg_calc_majority();
    if (mvotes == 0) return NULL;
    WGP_ENUMERATE(wolfgame) {
        if (EWGP->votes >= mvotes) {
            wg_kchoice_cleanslate();
            return EWGP;
        }
    }
    return NULL;
}
void wg_gameover(void) {
    WGP_ENUMERATE(wolfgame) {
        printf("ENDSTAT %s %s alive\n", EWGP->id, wg_rtc(EWGP->role));
    }
    WGP_ENUMERATE_DEAD(wolfgame) {
        printf("ENDSTAT %s %s dead\n", EDWGP->id, wg_rtc(EDWGP->role));
    }
    printf("BYE\n");
    exit(0);
}
void wg_check_endgame(void) {
    int villagers = 0;
    int wolves = 0;
    WGP_ENUMERATE(wolfgame) {
        switch (EWGP->role) {
            case WOLF:
                wolves++;
                break;
            case SEER:
                villagers++;
                break;
            case VILLAGER:
                villagers++;
                break;
            default:
                /* welp. */
                assert((2+2) != 4);
                break;
        }
    }
    if (wolves >= villagers) {
        /* outnumbered! */
        printf("GAMEOVER wolves\n"); /* oh no :( */
        wg_gameover();
    }
    if (wolves == 0) {
        printf("GAMEOVER villagers\n");
        wg_gameover();
    }
}
void wg_kill_player(struct wg_player *wgp, char cause) {
    /* Poor player :( */
    wgp->dead = true;
    DPA_rem(wolfgame->players, wgp);
    DPA_store(wolfgame->dead, wgp);
    char *dcause = "unknown";
    switch (cause) {
        case 'l':
            dcause = "lynch";
            break;
        case 'w':
            dcause = "wolf";
            break;
    }
    printf("DEATH %s %s %s\n", wgp->id, wg_rtc(wgp->role), dcause);
    wg_check_endgame();
}
bool wg_check_lynches(void) {
    struct wg_player *wgp = wg_kchoice_analyse(true);
    if (!wgp) return false;
    else {
        wg_log("[+] The villagers decide to lynch %s, a %s, by majority vote.\n", wgp->id, wg_rtc(wgp->role));
        wg_kill_player(wgp, 'l');
        return true;
    }
}
void wg_input(void) {
    unsigned long millis = 0UL;
    while (millis < 120000UL) {
        struct pollfd pfds[1];
        pfds[0].fd = fileno(stdin);
        pfds[0].events = POLLIN;
        int pollrv = -1;
        pollrv = poll(pfds, 1, 10000);
        if (pollrv == -1) {
            wg_log("[-] Error in poll() :(\n");
            perror("poll()");
            assert(pollrv != -1);
        }
        if (pollrv != 0 && pfds[0].revents & POLLIN) {
            char id[MAX_ID_LEN] = {0};
            char act[MAX_ID_LEN] = {0};
            struct wg_player *actor = NULL;
            struct wg_player *tgt = NULL;
            scanf("%s %s", id, act);
            if ((actor = wg_target(id)) != NULL) {
                if ((tgt = wg_target(act)) == NULL) {
                    wg_log("[-] Invalid target reported: %s\n", act);
                    printf("INVALIDTARGET\n");
                }
                else {
                    if (wolfgame->state == DAY) {
                        wg_log("[+] Executing action: %s lynches %s\n", actor->id, tgt->id);
                        wg_kchoice_add(actor, tgt);
                        bool ready = wg_check_lynches();
                        if (ready) {
                            wg_log("[+] Check returned true, starting transition!\n");
                            break;
                        }
                    }
                    else {
                        wg_log("[+] Executing action: %s (%s) acts upon %s (%s)\n", actor->id, wg_rtc(actor->role), tgt->id, wg_rtc(tgt->role));
                        wg_role_act(actor, tgt);
                        bool ready = wg_check_day();
                        if (ready) {
                            wg_log("[+] Check returned true, starting transition!\n");
                            break;
                        }
                    }
                }
            }
            else {
                wg_log("[-] Invalid actor reported: %s\n", id);
                printf("INVALIDPLAYER\n");
            }
        }
        millis += 10000UL;
        if (millis > 100000UL) printf("WTIMEOUT\n");
        if (millis > 120000UL) printf("ETIMEOUT\n");
    }
}
void wg_night(void);
void wg_day(void) {
    wg_log("[+] It is now day.\n");
    printf("STATE DAY\n");
    wolfgame->state = DAY;
    struct wg_player *wgp = wg_kchoice_analyse(false);
    wg_log("[+] The sun rises. The villagers, tired from the night before, get up and search the village...\n");
    if (wgp == NULL) {
        wg_log("[+] Traces of wolf blood and fur are found near the city hall. However, no casualties are present.\n");
        printf("NOKILL\n");
    }
    else {
        wg_log("[+] The corpse of %s is found. After further analysis, it is revealed that they were a %s.\n", wgp->id, wg_rtc(wgp->role));
        wg_kill_player(wgp, 'w');
    }
    wg_log("[+] The villagers must now decide who to lynch. (votes required: %d)\n", wg_calc_majority());
    printf("LYNCHINPUT %d\n", wg_calc_majority());
    wg_input();
    wg_night();
}
void wg_night(void) {
    wg_log("[+] It is now night.\n");
    printf("STATE NIGHT\n");
    wgp_msg_sprintf(NULL, "It is now night.");
    wolfgame->state = NIGHT;
    WGP_ENUMERATE(wolfgame) {
        wgp_night(EWGP);
    }
    printf("ROLEINPUT\n");
    wg_input();
    wg_day();
}
/*
 * credit: John Leehey, StackOverflow
 * https://stackoverflow.com/questions/6127503/shuffle-array-in-c#6127606
 */
static void arr_shuffle(void *array, size_t n, size_t size) {
    char tmp[size];
    char *arr = array;
    size_t stride = size * sizeof(char);

    if (n > 1) {
        size_t i;
        for (i = 0; i < n - 1; ++i) {
            size_t rnd = (size_t) rand();
            size_t j = i + rnd / (RAND_MAX / (n - i) + 1);

            memcpy(tmp, arr + j * stride, size);
            memcpy(arr + j * stride, arr + i * stride, size);
            memcpy(arr + i * stride, tmp, size);
        }
    }
}

void role_chooser(enum wg_roles cfg[], int nroles) {
    srand(time(NULL));
    wg_log("[+] Choosing roles...\n");
    enum wg_roles role_array[wolfgame->players->used];
    for (int x = 0; x < wolfgame->players->used; x++) {
        if ((nroles - 1) >= x) role_array[x] = cfg[x];
        else role_array[x] = VILLAGER;
    }
    arr_shuffle(role_array, wolfgame->players->used, sizeof(enum wg_roles));
    WGP_ENUMERATE(wolfgame) {
        enum wg_roles chosen = role_array[DPA_N];
        wg_log("[+] Player %s was assigned role %s.\n", EWGP->id, wg_rtc(chosen));
        EWGP->role = chosen;
    };
}
int main(int argc, char *argv[]) {
    wg_log("[#] Ultimate Wolfgame Engine, v0.0.1\n");
    wg_log("[#] a silly thing, by eta\n");
    wg_log("[+] Initialising memory structures...\n");
    wolfgame = malloc(sizeof(struct wolfgame));
    assert(wolfgame != NULL);
    wolfgame->players = DPA_init();
    wolfgame->kchoices = DPA_init();
    wolfgame->dead = DPA_init();
    assert(wolfgame->players != NULL && wolfgame->kchoices != NULL && wolfgame->dead != NULL);
    wg_log("[+] Switching stdio to unbuffered...\n");
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    wg_log("[+] Waiting for server to read us plist...\n");
    printf("PLIST\n");
    do {
        char *id = malloc(MAX_ID_LEN);
        fgets(id, (MAX_ID_LEN-1), stdin);
        strtok(id, "\n");
        if (strcmp(id, "*END") == 0) {
            wg_log("[+] All players added\n");
            free(id);
            break;
        }
        struct wg_player *wgp = wgp_init();
        wgp->id = id;
        assert(DPA_store(wolfgame->players, wgp) != NULL);
        wg_log("[+] Created entry for player %s\n", wgp->id);
    } while (true);
    role_chooser(conf_4p, 2);
    wg_night();
};
