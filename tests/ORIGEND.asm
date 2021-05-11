; TEST: code before .ORIG
CODE_BEFORE_ORIG
ADD R0, R0, #0

.ORIG x3000

.END

; TEST: code after .END
CODE_AFTER_END
ADD R0, R0, #0