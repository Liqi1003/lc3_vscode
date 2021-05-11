.ORIG x3000

; TEST: Condition code
	BRn CC_N
	BRzp CC_NP
CC_N 
	BRnz LABLE
CC_NP
	HALT
LABLE
	HALT

.END
