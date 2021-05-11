.ORIG x3000

HALT

; TEST: Uncalled subroutine
UNCALLED_SUBROUTINE
ADD R0, R0, #0
ADD R0, R0, #0
ADD R0, R0, #0
RET

.END
