.ORIG x3000

; TEST: Dead code
LD R0, MEM
ADD R0, R1, R2

; TEST: Longer dead code
LD R0, MEM
AND R1, R0, R2
LD R0, MEM
LD R1, MEM

HALT

MEM .BLKW 1

.END
