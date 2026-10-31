# Trang thai dau quay camera PAN/TILT, do stm32_bridge publish tu khung FB
# cua STM32 (robot/docs/PROTOCOL_FB.md, truong 19-23).
#
# Vi tri la VONG HO: tinh tu so xung firmware da phat ke tu lan HOME/ZERO,
# khong co encoder. state=IDLE nghia la "da phat du xung", khong phai da xac
# nhan bang cam bien.

uint8 STATE_OFF=0      # driver tat, khong giu luc, khong co moc
uint8 STATE_IDLE=1     # driver bat, co moc, ca hai truc dung o dich
uint8 STATE_MOVING=2
uint8 STATE_HOMING=3   # dang tim vat can / chay ve 0
uint8 STATE_NO_REF=4   # driver bat (giu luc) nhung khong co moc: phai HOME lai

std_msgs/Header header
uint8 state
bool referenced        # co moc vi tri (state IDLE hoac MOVING)
float32 pan_deg        # duong = quay trai (REP-103), 0 = phia truoc
float32 tilt_deg       # duong = ngoc len
uint32 last_head_seq   # seq lenh HEAD cuoi firmware da chap nhan
