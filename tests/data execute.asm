.ORIG x3000

; TEST: Jump to data & Running into data
BRn DATA_INSIDE_CODE

ADD R0, R1, #0
DATA_INSIDE_CODE 
.FILL x0000
.STRINGZ "STRING"

.END
