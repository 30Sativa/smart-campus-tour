# Giu nut: huong quay lien tuc cua tung truc, moi truong -1, 0 hoac 1.
# PAN 1 = quay trai, -1 = quay phai. TILT 1 = ngoc len, -1 = cui xuong.
# Phai publish lai deu (>= 5 Hz, nen 10 Hz) trong luc giu nut. Ngung publish
# qua head_jog_timeout (0.25 s) thi bridge gui JOG,0,0; firmware co them
# deadman rieng 300 ms. Nha nut: publish 0,0 mot lan.
int8 pan
int8 tilt
