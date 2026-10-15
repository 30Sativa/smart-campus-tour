"""Offline check of the 50 kHz step ISR (see docs/MOTOR_ISR_BUDGET.md).

Runs the LINKED TIM2_IRQHandler of two firmware ELFs in the Unicorn CPU
emulator through identical scenarios and compares every GPIOA->BSRR write
(tick index, value) and the step counters. Prints instructions and an
estimated Cortex-M4 cycle range per tick (exception entry/exit included,
flash 0 wait states at 16 MHz) and the resulting CPU share at 50 kHz.
If the candidate has the ISR watchdog, also checks it stops stepping.

Not part of verify.sh (needs extra Python packages):
    pip install unicorn capstone pyelftools
Usage:
    python3 scripts/isr_emulate.py <baseline.elf> <candidate.elf>
Exit code 0 = pulse trains identical (and watchdog OK).
"""
import sys, struct
from elftools.elf.elffile import ELFFile
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS, UC_HOOK_CODE, UC_HOOK_MEM_WRITE
from unicorn.arm_const import UC_ARM_REG_SP, UC_ARM_REG_LR
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB, CS_MODE_MCLASS

TIM2, GPIOA, BSRR = 0x40000000, 0x48000000, 0x18
RET = 0x0803FF00
md = Cs(CS_ARCH_ARM, CS_MODE_THUMB | CS_MODE_MCLASS)

def cyc(ins):
    m = ins.mnemonic.split('.')[0]
    if m in ('push', 'pop', 'stmdb', 'ldm', 'ldmia', 'stm', 'stmia'):
        n = ins.op_str.count(',') + 1
        return (1 + n + (2 if m == 'pop' and 'pc' in ins.op_str else 0),) * 2
    if m.startswith('ldr'): return 2, 2
    if m.startswith('str'): return 1, 2
    if m in ('bl', 'blx', 'bx'): return 3, 4
    if m in ('b', 'cbz', 'cbnz') or (m[:1] == 'b' and len(m) == 3 and m not in ('bic', 'bfi', 'bfc')):
        return 1, 3
    return 1, 1

class Fw:
    def __init__(self, path):
        ef = ELFFile(open(path, 'rb'))
        self.sym = {s.name: s['st_value'] for s in ef.get_section_by_name('.symtab').iter_symbols() if s.name}
        mu = self.mu = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
        mu.mem_map(0x08000000, 0x40000); mu.mem_map(0x20000000, 0x10000)
        mu.mem_map(TIM2, 0x1000); mu.mem_map(GPIOA, 0x1000)
        for seg in ef.iter_segments():
            if seg['p_type'] == 'PT_LOAD' and seg['p_filesz']:
                mu.mem_write(seg['p_paddr'], seg.data())
                if 0x20000000 <= seg['p_vaddr'] < 0x20010000:
                    mu.mem_write(seg['p_vaddr'], seg.data())
        mu.mem_write(self.sym['htim2'], struct.pack('<I', TIM2))
        self.cache = {}; self.n = 0; self.lo = 0; self.hi = 0; self.writes = []; self.tick_i = 0
        mu.hook_add(UC_HOOK_CODE, self._code)
        mu.hook_add(UC_HOOK_MEM_WRITE, self._mw, begin=GPIOA + BSRR, end=GPIOA + BSRR + 3)
    def _code(self, uc, a, sz, _):
        k = (a, sz)
        if k not in self.cache:
            self.cache[k] = cyc(next(md.disasm(bytes(uc.mem_read(a, sz)), a)))
        lo, hi = self.cache[k]; self.n += 1; self.lo += lo; self.hi += hi
    def _mw(self, uc, access, addr, size, value, _):
        self.writes.append((self.tick_i, value & 0xFFFFFFFF))
    def motor(self, i, hz=None, running=None, direction=None, phase=None):
        base = self.sym['motors'] + i * 36
        self.mu.mem_write(base + 0, struct.pack('<I', GPIOA))
        self.mu.mem_write(base + 4, struct.pack('<H', 1 << (0 if i == 0 else 2)))
        if running is not None: self.mu.mem_write(base + 16, bytes([running]))
        if direction is not None: self.mu.mem_write(base + 18, struct.pack('<b', direction))
        if phase is not None: self.mu.mem_write(base + 20, struct.pack('<I', phase))
        if hz is not None:
            self.mu.mem_write(base + 24, struct.pack('<I', int(hz * 4294967296.0 / 50000.0 + 0.5)))
    def feed(self, ticks):
        if 'watchdog_ticks_left' in self.sym:
            self.mu.mem_write(self.sym['watchdog_ticks_left'], struct.pack('<I', ticks))
    def count(self, i):
        return struct.unpack('<i', bytes(self.mu.mem_read(self.sym['motors'] + i * 36 + 28, 4)))[0]
    def tick(self):
        mu = self.mu
        mu.mem_write(TIM2 + 0x10, struct.pack('<I', 1)); mu.mem_write(TIM2 + 0x0C, struct.pack('<I', 1))
        mu.reg_write(UC_ARM_REG_SP, 0x2000F000); mu.reg_write(UC_ARM_REG_LR, RET | 1)
        mu.emu_start(self.sym['TIM2_IRQHandler'] | 1, RET, count=4000)
        self.tick_i += 1

SCEN = [
    ('stopped', [dict(i=0, hz=0, running=0, direction=1, phase=0), dict(i=1, hz=0, running=0, direction=1, phase=0)], 5000, []),
    ('2 kHz both fwd', [dict(i=0, hz=2000, running=1, direction=1, phase=0), dict(i=1, hz=2000, running=1, direction=1, phase=0)], 5000, []),
    ('6.5 kHz fwd / 4.1 kHz rev', [dict(i=0, hz=6546, running=1, direction=1, phase=0), dict(i=1, hz=4100, running=1, direction=-1, phase=123456)], 5000, []),
    ('max 12 kHz both', [dict(i=0, hz=12000, running=1, direction=1, phase=0), dict(i=1, hz=12000, running=1, direction=-1, phase=0)], 5000, []),
    ('stop mid-pulse', [dict(i=0, hz=6546, running=1, direction=1, phase=0), dict(i=1, hz=6546, running=1, direction=1, phase=0)], 2000,
        [(1237, dict(i=0, running=0)), (1555, dict(i=1, running=0))]),
]
base, cand = Fw(sys.argv[1]), Fw(sys.argv[2])
ok = True
print(f'{"scenario":28s} | {"baseline instr  cycles  CPU%":30s} | {"candidate instr  cycles  CPU%":31s} | pulses identical')
for name, init, N, events in SCEN:
    res = []
    for fw in (base, cand):
        for m in init: fw.motor(**m)
        fw.mu.mem_write(fw.sym['motors'] + 28, struct.pack('<i', 0)); fw.mu.mem_write(fw.sym['motors'] + 36 + 28, struct.pack('<i', 0))
        fw.n = fw.lo = fw.hi = 0; fw.writes = []; fw.tick_i = 0
        fw.feed(10**9)                     # candidate's ISR watchdog: keep armed
        ev = dict(events)
        for k in range(N):
            if k in ev: fw.motor(**ev[k])
            fw.tick()
        lo = fw.lo / N + 24; hi = fw.hi / N + 24
        res.append((fw.n / N, lo, hi, fw.writes, fw.count(0), fw.count(1)))
    same = res[0][3] == res[1][3] and res[0][4:] == res[1][4:]
    ok &= same
    f = lambda r: f'{r[0]:6.1f}  {r[1]:3.0f}-{r[2]:3.0f}  {r[1]*5e4/16e6*100:3.0f}-{r[2]*5e4/16e6*100:3.0f}%'
    print(f'{name:28s} | {f(res[0]):30s} | {f(res[1]):31s} | {same}  (BSRR writes {len(res[0][3])}, counts {res[0][4]},{res[0][5]})')
print('ALL PULSE TRAINS IDENTICAL' if ok else 'PULSE TRAIN MISMATCH')

if 'watchdog_ticks_left' in cand.sym:
    # Backstop: armed for 300 ticks, never fed again -> stepping must stop after
    # exactly 300 ticks; a pulse that is high at that moment must still go low.
    fw = cand
    for i in (0, 1): fw.motor(i, hz=12000, running=1, direction=1, phase=0)
    fw.mu.mem_write(fw.sym['motors'] + 28, struct.pack('<i', 0)); fw.mu.mem_write(fw.sym['motors'] + 36 + 28, struct.pack('<i', 0))
    fw.writes = []; fw.tick_i = 0; fw.feed(300)
    for _ in range(1000): fw.tick()
    last_high = max((t for t, v in fw.writes if v & 0xFFFF), default=-1)
    last_any = max((t for t, v in fw.writes), default=-1)
    gpio_low = all(v >> 16 for t, v in fw.writes if t == last_any)
    run = [bytes(fw.mu.mem_read(fw.sym['motors'] + i * 36 + 16, 1))[0] for i in (0, 1)]
    wd_ok = last_high < 301 and last_any <= last_high + 1 and gpio_low and run == [0, 0]
    print(f'ISR watchdog: armed 300 ticks -> last STEP high at tick {last_high}, last write {last_any} (low={gpio_low}), '
          f'running={run}, steps {fw.count(0)} -> {"OK" if wd_ok else "FAIL"}')
    ok &= wd_ok
print('RESULT', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
