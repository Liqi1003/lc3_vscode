.ORIG x3000

; TEST: Incomplete/Illegal instructions
LABEL
ADD R1, #5
AND R1, R2
JMP LABEL
LEA R0
LD R0, R1

.END
