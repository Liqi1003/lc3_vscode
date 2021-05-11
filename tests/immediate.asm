.ORIG x3000

; TEST: Immediate value out of range
ADD R0, R0, #32
AND R1, R1, #16
ADD R2, R2, x1F

.END
