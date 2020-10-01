; Regression test file for VScode extension

; ****************************************
; TEST: code before .ORIG
CODE_BEFORE_ORIG
ADD R0, R0, #0
; ****************************************

.ORIG x3000

; ****************************************
; TEST: Label at the same location and duplicated label
DUPLICATED_LABEL
DUPLICATED_LABEL
ADD R0, R0, #0
; ****************************************

; ****************************************
; TEST: Unusable label
X10
LD R0, X10
; ****************************************

; ****************************************
; TEST: ; in label
LABEL_SEMICOLON;
LD R0, LABEL_SEMICOLON
LD R0, LABEL_SEMICOLON;
; ****************************************

; ****************************************
; TEST: Unreachable instruction
BR SKIP_INSTRUCTION
ADD R0, R0, #0
SKIP_INSTRUCTION
ADD R0, R0, #0
; ****************************************

; ****************************************
; TEST: Incomplete/Illegal instructions
JMP_LABEL
ADD R1, #5
AND R1, R2
JMP JMP_LABEL
LEA R0
LD R0, R1
LDR R0, R1, 20
BR SKIP_DATA
.FILL 
.STRINGZ 
.BLKW
SKIP_DATA
; ****************************************

; ****************************************
; TEST: Unknown TRAP vector
; TRAP x25
TRAP #25
; ****************************************

; ****************************************
; TEST: Immediate value out of range
ADD R0, R0, #16
AND R0, R0, #16
ADD R0, R0, x1F
AND R0, R0, xFFFF
; ****************************************

; ****************************************
; TEST: Hardcoded PCoffset
; TODO: Uncomment to test - interferes with subsequent tests

; BR #5
; JSR x10
; LEA R0, xFFFE
; ****************************************

; ****************************************
; TEST: PCoffset out of range
; TODO: Uncomment to test - interferes with subsequent tests

; LABEL_FAR_ABOVE
; ADD R0, R0, #0
; RET

; BR LABEL_FAR_BELOW
; JSR LABEL_FAR_BELOW
; LEA R0, LABEL_FAR_BELOW

; .BLKW #2048

; LABEL_FAR_BELOW
; ADD R0, R0, #0
; RET

; BR LABEL_FAR_ABOVE
; JSR LABEL_FAR_ABOVE
; LEA R0, LABEL_FAR_ABOVE
; ****************************************

; ****************************************
; TEST: RET in main code
; TODO: Uncomment to test - interferes with subsequent tests

; RET
; ****************************************

; ****************************************
; TEST: HALT inside subroutine part 1
JSR HALT_IN_SUBROUTINE
; ****************************************

; ****************************************
; TEST: Jump to data & Running into data
; TODO: Uncomment to test - interferes with subsequent tests

; BRn DATA_INSIDE_CODE
; DATA_INSIDE_CODE 
; .FILL x0000
; .STRINGZ "STRING"
; ****************************************

; ****************************************
; TEST: Code overlap part1 (main)
JSR OVERLAP_TEST
JSR OVERLAP_TEST2
OVERLAP_MAIN_AND_SUB
ADD R0, R0, #0 ; TODO: failed now
; ****************************************

HALT

; ****************************************
; TEST: Code overlap part2 (subroutine1)
OVERLAP_TEST
ADD R0, R0, #0
BR OVERLAP_MAIN_AND_SUB
; ****************************************

; ****************************************
; TEST: Code overlap part3 (subroutine2)
OVERLAP_TEST2
ADD R0, R0, #0
BR OVERLAP_TEST
; ****************************************

; ****************************************
; TEST: HALT inside subroutine part2
HALT_IN_SUBROUTINE
HALT
; ****************************************

; ****************************************
; TEST: Uncalled subroutine
UNCALLED_SUBROUTINE
ADD R0, R0, #0
ADD R0, R0, #0
ADD R0, R0, #0
RET
; ****************************************

.END

; ****************************************
; TEST: code after .END
CODE_AFTER_END
ADD R0, R0, #0
; ****************************************
