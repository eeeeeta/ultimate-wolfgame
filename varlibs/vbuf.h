#ifndef _ETA_VARLIB
#define _ETA_VARLIB
#define DPA_START_SIZE 4 /**< Default DPA start length */
#define DPA_REFILL_SIZE 1 /**< Default DPA refill length */
#define DPA_ENUMERATE(dpa) for (int DPA_N = 0; DPA_N < dpa->used; DPA_N++)
/**
 * \brief Dynamic Pointer Array: Used to store a set of pointers dynamically.
 */
typedef struct {
    void **keys; /**< Array of objects */
    int used; /**< Objects stored */
    int size; /**< Array size (in objects) */
} DPA;

extern DPA *DPA_init(void);
extern void *DPA_store(DPA *dpa, void *obj);
extern bool *DPA_rem(DPA *dpa, void *obj);
extern void DPA_free(DPA *dpa);

#endif
