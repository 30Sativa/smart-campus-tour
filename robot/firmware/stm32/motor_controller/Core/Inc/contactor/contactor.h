#ifndef CONTACTOR_H
#define CONTACTOR_H

#include <stdint.h>

void Contactor_Init(void);
void Contactor_On(void);
void Contactor_Off(void);
uint8_t Contactor_IsCommandedOn(void);

#endif
