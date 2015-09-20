/*
 * varlib: tiny variable memory-management structures
 */
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include "vbuf.h"

/**
 * Initialises a dynamic pointer array object.
 * Returns a pointer to said object, or NULL if there was an error.
 */
extern DPA *DPA_init(void) {
    DPA *dpa = malloc(sizeof(DPA));
    if (dpa == NULL) return NULL;
    dpa->keys = calloc(DPA_START_SIZE, sizeof(void *));
    if (dpa->keys == NULL) return NULL;
    dpa->used = 0;
    dpa->size = DPA_START_SIZE;
    return dpa;
}
/**
 * Removes obj from dpa, by swapping the last object of dpa->keys into the slot where
 * obj was, and setting that object to NULL whilst decrementing dpa->used.
 *
 * Does NOT make any attempt to free() obj, do this yourself. Returns false if object
 * does not exist.
 */
extern bool *DPA_rem(DPA *dpa, void *obj) {
    int i = 0, j = -1;
    for (void *tbr = dpa->keys[i]; i < dpa->used; tbr = dpa->keys[++i])
        if (tbr == obj) j = i;
    if (j == -1) return false;
    dpa->keys[j] = dpa->keys[i - 1];
    dpa->keys[i - 1] = NULL;
    dpa->used--;
    return true;
}
/**
 * Stores obj in dpa. Returns a pointer to obj if successful, or NULL if there was an error.
 */
extern void *DPA_store(DPA *dpa, void *obj) {
    if ((dpa->size - dpa->used) < 2) {
        // allocate more space
        void **ptr = realloc(dpa->keys, sizeof(void *) * (dpa->size + DPA_REFILL_SIZE));
        if (ptr == NULL) return NULL;
        dpa->keys = ptr;
        dpa->size += DPA_REFILL_SIZE;
    }
    (dpa->keys)[(dpa->used++)] = obj;
    return obj;
}

extern void DPA_free(DPA *dpa) {
    free(dpa->keys);
    free(dpa);
}

