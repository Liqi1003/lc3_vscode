.ORIG x3000

; TEST: RET in main code
RET

; TEST: HALT inside subroutine
; @SUBROUTINE
HALT_IN_SUBROUTINE
HALT

.END
