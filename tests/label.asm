.ORIG x3000

; TEST: Unusable label
X10
1LBL
LD R1, 1LBL

; TEST: Label at the same location and duplicated label
DUPLICATED_LABEL
DUPLICATED_LABEL
ADD R0, R0, R1

.END
