.ORIG x3000

; TEST: Complicated condition code
START
	BRn LABEL
MIDDLE
	BRn IMPOSSIBLE
LABEL 
	BRnzp END

IMPOSSIBLE
	BRnp MIDDLE
	HALT
	
END
	HALT

.END
