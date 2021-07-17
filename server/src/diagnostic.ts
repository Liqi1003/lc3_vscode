import {
	Diagnostic,
	DiagnosticTag,
	DiagnosticSeverity,
} from 'vscode-languageserver';

import {
	DiagnosticInfo,
} from './server';

import {
	Code,
} from './code';

import {
	TRAPVEC,
	Instruction,
	Label,
	isLc3Num,
	isLc3Reg,
	INSTFLAG,
	CC,
} from './instruction'

import {
	BasicBlock,
	BBFLAG,
	REGFLAG,
	REGSTAT,
} from "./basicBlock";

enum MATCHPATTERN {
	NONE = 0x0,
	IMM_EQDIFF = 0x1,
	IMM_DOUBLE = 0x2,
	IMM_HALF = 0x4,
	MEM_EQDIFF = 0x8,
}

// For code action
export const MESSAGE_POSSIBLE_SUBROUTINE = "Label is never used.";

export function generateDiagnostics(diagnosticInfo: DiagnosticInfo, code: Code) {
	let instruction: Instruction;
	if (code.instructions.length == 0) {
		return;
	}
	/** Global checking */
	// Check for labels
	checkLabels(diagnosticInfo, code);

	// Check for unreachable instructions
	checkUnreachableInstructions(diagnosticInfo, code);
	if (diagnosticInfo.settings.enableSubroutineChecking) {
		checkUncalledSubroutines(diagnosticInfo, code);
	}

	// Check for code before/after .ORIG/.END
	checkORIGandEND(diagnosticInfo, code);

	// Check for running into data
	checkRunningIntoData(diagnosticInfo, code);

	// Check for unrolled loop
	if (diagnosticInfo.settings.enableUnrolledLoopChecking) {
		checkUnrolledLoop(diagnosticInfo, code);
	}

	/** Block checking */
	if (diagnosticInfo.settings.enableSubroutineChecking) {
		for (let idx = 0; idx < code.basicBlocks.length; idx++) {
			// Check for code overlap between subroutines and/or main code
			checkCodeOverlapBB(code.basicBlocks[idx], diagnosticInfo, code);
			if (code.basicBlocks[idx].subroutineNum != code.startAddr) {
				// Check for caller/callee saved registers
				checkCalleeSavedRegs(code.basicBlocks[idx], diagnosticInfo, code);
			}
		}
	}

	/** Single line of code checking */
	for (let idx = 0; idx < code.instructions.length; idx++) {
		instruction = code.instructions[idx];

		// Check for validity of FILL
		if (instruction.optype == ".FILL" && instruction.mem) {
			checkFill(diagnosticInfo, code, instruction);
		}

		// Skip the instruction if it is not found
		if (!(instruction.flags & INSTFLAG.isFound)) {
			continue;
		}

		// Check for incomplete/illegal instructions
		if (diagnosticInfo.settings.showIllegalInstructions && (instruction.flags & INSTFLAG.isIncomplete)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Illegal or incomplete instruction.", instruction.line,
				instruction.rawString + " is incomplete/illegal");
			continue;
		}

		// Check for dead code
		if ((instruction.flags & INSTFLAG.isDead)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Hint, [DiagnosticTag.Unnecessary], "Dead code.", instruction.line,
				"Overwriting the value in R" + instruction.dest + " without using it.");
		}

		// Checking each line of code based on operation type
		switch (instruction.optype) {
			case "ADD":
			case "AND":
				if (instruction.immVal >= 32 || instruction.immVal < -16) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Immediate value is out of range.", instruction.line, "");
				} else if (instruction.immValType == '#' && instruction.immVal >= 16) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Immediate value is out of range.", instruction.line,
						"The maximum positive immediate value allowed is 15 (x000F). The number you put here will be interpreted as a negative number.");
				}
				break;
			case "BR":
				if (instruction.mem) {
					checkBRpossibility(diagnosticInfo, instruction);
					let labelID = checkPCoffset(diagnosticInfo, instruction, code, 9);
					if (labelID >= 0) {
						checkJumpToData(diagnosticInfo, instruction, code, labelID);
					}
				}
				break;
			case "JSR":
				if (instruction.mem) {
					let labelID = checkPCoffset(diagnosticInfo, instruction, code, 11);
					if (labelID >= 0) {
						checkJumpToData(diagnosticInfo, instruction, code, labelID);
					}
				}
				break;
			case "LEA":
				if (instruction.mem) {
					checkPCoffset(diagnosticInfo, instruction, code, 9);
				}
				break;
			case "LD":
			case "ST":
			case "LDI":
			case "STI":
				if (instruction.mem) {
					checkPCoffset(diagnosticInfo, instruction, code, 9);
				}
				break;
			case "LDR":
			case "STR":
				if (instruction.immVal >= 32 || instruction.immVal < -32) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "TRAP":
				switch (instruction.immVal) {
					case TRAPVEC.INVALID:
						// Removed
						// generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Unknown TRAP vector.", instruction.line, "");
						break;
					case TRAPVEC.HALT:
						if (instruction.subroutineNum != code.startAddr) {
							generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "HALT inside subroutine.", instruction.line,
								"You should not let the machine HALT inside a subroutine.");
						}
						break;
				}
				break;
			case "RET":
				if (instruction.subroutineNum == code.startAddr) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "RET outside of subroutine.", instruction.line,
						"You are executing RET outside of a subroutine. Use \'HALT\' to halt the machine, or \'JMP R7\' if you really meant it.");
				}
				break;
			default:
				break;
		}
	}
}

// Check for whether the data filled is legal (Error/Warning)
function checkFill(diagnosticInfo: DiagnosticInfo, code: Code, instruction: Instruction) {
	let i: number;
	if (isLc3Num(instruction.mem)) {
		return 0;
	}

	// Check if offset is within range
	for (i = 0; i < code.labels.length; i++) {
		if (code.labels[i].name == instruction.mem) {
			break;
		}
	}
	// Label not found
	if (i == code.labels.length) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Label not defined.", instruction.line,
			"The label " + instruction.mem + " is not defined.");
		return -1;
	}
	return 0;
}

// Check for unrolled loops
function checkUnrolledLoop(diagnosticInfo: DiagnosticInfo, code: Code) {
	for (let idx = 0; idx < code.instructions.length; idx++) {
		for (let stride = 3; stride < 50 && stride < code.instructions.length; stride++) {
			if (idx > code.instructions.length - stride ||
				code.instructions[idx].isData() ||
				(code.instructions[idx].flags & INSTFLAG.warnedUnrolledLoop)) {
				continue;
			}
			let insts: Instruction[] = [];
			for (let i = 0; i < stride; i++) {
				insts.push(code.instructions[idx + i]);
			}
			let repeatedTimes = checkForSimilarInst(insts, idx, code);
			// Judge whether writing a loop can bring benefit in code length
			if (repeatedTimes >= 2 && stride * repeatedTimes > stride + 6) {
				let str = "These " + stride + " instructions are repeated for " + repeatedTimes + " times in a similar way. Consider writing a loop \
or a subroutine instead." + "\n" + "Repeated instructions:\n";
				for (let i = 0; i < stride; i++) {
					str += insts[i].rawString + "\n";
				}
				generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Unrolled loop.", code.instructions[idx].line, str);
				for (let i = 1; i < repeatedTimes; i++) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Unrolled loop (iteration " + (i + 1) + "/" + repeatedTimes + ").",
						code.instructions[idx + i * stride].line, "");
				}
				for (let i = 0; i < stride * repeatedTimes; i++) {
					code.instructions[idx + i].flags |= INSTFLAG.warnedUnrolledLoop;
				}
				idx += stride * repeatedTimes;
			}
		}
	}
}

// Walk the whole code for repetitive code with stride = insts.length, starting with the idx th instruction.
function checkForSimilarInst(insts: Instruction[], idx: number, code: Code): number {
	const MAX_COUNT = 20; // Analyze at most MAX_COUNT iterations
	let repeatedTimes = MAX_COUNT;
	let stride = insts.length;
	let inst1: Instruction, inst2: Instruction;
	if (insts.length <= 0) {
		return -1;
	}

	for (let i = 0; i < insts.length; i++) {
		let type: string = insts[i].optype;
		let endloop: boolean = false;
		let count: number;
		let pattern: MATCHPATTERN = MATCHPATTERN.NONE;
		let diffval: number = NaN;
		// Analyze at most MAX_COUNT iterations
		for (count = 1; count <= MAX_COUNT; count++) {
			if (idx + i + count * stride >= code.instructions.length) {
				break;
			}
			inst1 = code.instructions[idx + i + (count - 1) * stride];
			inst2 = code.instructions[idx + i + count * stride];

			if (mismatchInInstruction(inst1, inst2)) {
				endloop = true;
			}
			switch (type) {
				case "ADD":
				case "AND":
					// Look for equal difference OR power of 2
					// Already asserted, skip
					if (!isNaN(inst1.src2)) {
						break;
					}
					// First time, determine pattern
					if (pattern == MATCHPATTERN.NONE) {
						if (inst1.immVal != 0 && inst2.immVal != 0) {
							let ratio = inst2.immVal / inst1.immVal;
							if (ratio == 2) {
								pattern = MATCHPATTERN.IMM_DOUBLE;
							}
							if (ratio == 1 / 2) {
								pattern = MATCHPATTERN.IMM_HALF;
							}
						}
						pattern |= MATCHPATTERN.IMM_EQDIFF;
						diffval = inst2.immVal - inst1.immVal;
						break;
					}
					// Not first time, examine if pattern is conserved
					if (inst1.immVal != 0 && inst2.immVal != 0) {
						let ratio = inst2.immVal / inst1.immVal;
						if (ratio == 2 && (pattern | MATCHPATTERN.IMM_DOUBLE)) {
							break;
						}
						if ((ratio == 1 / 2) && (pattern | MATCHPATTERN.IMM_HALF)) {
							break;
						}
					}
					if (diffval == (inst2.immVal - inst1.immVal)) {
						break;
					}
					// None matched, end here
					endloop = true;
					break;
				case "LD":
				case "ST":
				case "LDI":
				case "STI":
				case "BR":
					// Look for equal difference of memory reference
					break;
				case "LDR":
				case "STR":
					// Look for equal difference
					if (pattern == MATCHPATTERN.NONE) {
						pattern = MATCHPATTERN.IMM_EQDIFF;
						diffval = inst2.immVal - inst1.immVal;
						break;
					}
					// Not first time, examine if pattern is conserved
					if (diffval == (inst2.immVal - inst1.immVal)) {
						break;
					}
					// None matched, end here
					endloop = true;
					break;
				case "JSR":
					// Must call the same subroutine
					if (inst1.jsrTarget != inst2.jsrTarget) {
						endloop = true;
					}
					break;
				case "NOT":
				case "JMP":
				case "JSRR":
					// Already asserted
					break;
				case "TRAP":
					// Must be the same trap vector
					if (inst1.immVal != inst2.immVal) {
						endloop = true;
					}
					break;
			}
			if (endloop) {
				break;
			}
		}
		if (repeatedTimes > count) {
			repeatedTimes = count;
		}
	}

	return repeatedTimes;
}

// Return whether there is an absolute mismatch between two instructions
function mismatchInInstruction(inst1: Instruction, inst2: Instruction) {
	if (inst1.optype != inst2.optype) {
		return true;
	}
	if (!isNaN(inst1.src) && (inst1.src != inst2.src)) {
		return true;
	}
	if (!isNaN(inst1.src2) && (inst1.src2 != inst2.src2)) {
		return true;
	}
	if (!isNaN(inst1.dest) && (inst1.dest != inst2.dest)) {
		return true;
	}
	return false;
}

// Check for always BR and redundant conditions (Warning)
function checkBRpossibility(diagnosticInfo: DiagnosticInfo, instruction: Instruction) {
	if ((instruction.cc != CC.nzp) && (instruction.flags & INSTFLAG.isAlwaysBR)) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Branch always taken.", instruction.line,
			"The condition of this branch is always true, use BR/BRnzp for better readability.");
	} else if (instruction.flags & INSTFLAG.isNeverBR) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Branch never taken.", instruction.line,
			"The condition of this branch is always false.");
	} else if (instruction.flags & INSTFLAG.hasRedundantCC) {
		let str: string = "";
		if (instruction.redundantCC & CC.n) {
			str += "n";
		}
		if (instruction.redundantCC & CC.z) {
			str += "z";
		}
		if (instruction.redundantCC & CC.p) {
			str += "p";
		}
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Redundant condition.", instruction.line,
			"The condition " + str + " of this branch is always false, remove them for better readability.");
	}
}


// Check for code before .ORIG (Error) and code after .END (Warning)
function checkORIGandEND(diagnosticInfo: DiagnosticInfo, code: Code) {
	let label: Label;
	let instruction: Instruction;
	let firstLine: number = 0;
	let lastLine: number = 0;

	// No instruction present, give up
	if (!code.instructions.length) {
		return ;
	}
	firstLine = code.instructions[0].line;
	lastLine = code.instructions[code.instructions.length - 1].line;

	if (code.labels.length){
		firstLine = Math.min(firstLine, code.labels[0].line);
		lastLine = Math.max(lastLine, code.labels[code.labels.length - 1].line);
	}
	if (isNaN(code.ORIGline)) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Code before .ORIG directive.", firstLine,
			"Code before .ORIG is not allowed. Are you missing the .ORIG directive?", lastLine - firstLine + 1);
	}
	else {
		for (let i = 0; i < code.instructions.length; i++) {
			instruction = code.instructions[i];
			if (instruction.line < code.ORIGline && code.instructions[i + 1].line > code.ORIGline) {
				generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Code before .ORIG directive.", firstLine,
					"Code before .ORIG is not allowed. Are you missing the .ORIG directive?", instruction.line - firstLine + 1);
			}
		}
		for (let i = 0; i < code.labels.length; i++) {
			label = code.labels[i];
			if (label.line < code.ORIGline && code.labels[i + 1].line > code.ORIGline) {
				generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Code before .ORIG directive.", firstLine,
					"Label before .ORIG is not allowed. Are you missing the .ORIG directive?", label.line - firstLine + 1);
			}
		}
	}

	if (isNaN(code.ENDline)) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [DiagnosticTag.Unnecessary], "Code after .END directive.", firstLine,
			"Code after .END will be ignored.", lastLine - firstLine + 1);
	} else {
		for (let i = 0; i < code.instructions.length; i++) {
			instruction = code.instructions[i];
			if (instruction.line > code.ENDline && (i == 0 || code.instructions[i - 1].line < code.ENDline)) {
				generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [DiagnosticTag.Unnecessary], "Code after .END directive.", lastLine + 1,
					"Code after .END will be ignored.", instruction.line - lastLine - 1);
			}
		}
		for (let i = 0; i < code.labels.length; i++) {
			label = code.labels[i];
			if (label.line > code.ENDline && (i == 0 || code.labels[i - 1].line < code.ENDline)) {
				generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [DiagnosticTag.Unnecessary], "Code after .END directive.", lastLine + 1,
					"Label after .END will be ignored.", label.line - lastLine - 1);
			}
		}
	}
}

// Check for unusable label name (e.g. X123) (Warning), multiple labels at the same memory address (Warning, optional),
// duplicated labels (Error) and ; after labels without a space (Warning)
function checkLabels(diagnosticInfo: DiagnosticInfo, code: Code) {
	let label: Label, label2: Label;
	for (let idx = 0; idx < code.labels.length; idx++) {
		label = code.labels[idx];
		// Check for unusable label name
		if (isLc3Num(label.name) || isLc3Reg(label.name) || !label.name.match(/^[a-zA-Z_][0-9a-zA-Z_]*$/)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Illegal label name.", label.line,
				"Label name is illegal. For example, starts with a number or contains special chatacters.");
			label.flags |= INSTFLAG.isIncomplete;
		}
		// Check for multiple labels at the same line
		if (idx + 1 < code.labels.length && label.memAddr == code.labels[idx + 1].memAddr) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Hint, [DiagnosticTag.Unnecessary], "Multiple label at the same memory location.", label.line,
				"Label " + label.name + " and " + code.labels[idx + 1].name + " are at the same memory location.");
		}
		// Check for duplicated labels
		for (let i = idx + 1; i < code.labels.length; i++) {
			label2 = code.labels[i];
			if (label.name == label2.name) {
				generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Duplicated labels.", label2.line,
					"The label " + label2.name + " has already appeared in line " + (label.line + 1) + " .");
			}
		}
	}
}

// Helper function for checking overlap, recursive (Warning)
function checkCodeOverlapBB(bb: BasicBlock, diagnosticInfo: DiagnosticInfo, code: Code) {
	// Only explore once for each basic block
	if (bb.flags & BBFLAG.hasExplored) {
		return;
	}
	bb.flags |= BBFLAG.hasExplored;

	if (!isNaN(bb.overlapNumber)) {
		if (bb.subroutineNum == code.startAddr) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Code overlap between subroutine and main code.", bb.instructions[0].line,
				"This instruction is shared by subroutine " + code.findLabelByAddress(bb.overlapNumber).name + " and main code.");
		} else if (bb.overlapNumber == code.startAddr) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Code overlap between subroutine and main code.", bb.instructions[0].line,
				"This instruction is shared by subroutine " + code.findLabelByAddress(bb.subroutineNum).name + " and main code.");
		} else {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Code overlap between subroutines.", bb.instructions[0].line,
				"This instruction is shared by subroutine " + code.findLabelByAddress(bb.overlapNumber).name + " and subroutine " +
				code.findLabelByAddress(bb.instructions[0].memAddr).name + ".");
		}
	}

	if (bb.nextBlock) {
		checkCodeOverlapBB(bb.nextBlock, diagnosticInfo, code);
	}
	if (bb.brBlock) {
		checkCodeOverlapBB(bb.brBlock, diagnosticInfo, code);
	}
}

// Check for callee-saved registers (Hint) and mismatch (Warning)
function checkCalleeSavedRegs(bb: BasicBlock, diagnosticInfo: DiagnosticInfo, code: Code) {
	let instruction: Instruction, ret: Instruction;
	let exit: BasicBlock;
	let label: Label;
	let saved: string, input: string, nouse: string, result: string;

	let flags = bb.registers.getFlags();
	let status = bb.registers.getStats();
	let savedMem = bb.registers.getMem();
	// Scan through the entry block
	for (let idx = 0; idx < bb.instructions.length; idx++) {
		instruction = bb.instructions[idx];
		// Not a store operation, give up. Only support ST/LD pairs
		if (instruction.optype != "ST") {
			break;
		}

		// Generate warning according to the save instructions
		if (flags[instruction.src] & REGFLAG.S) {
			// Saved twice, warning
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Register is saved multiple times",
				instruction.line, "You are saving R" + instruction.src + " multiple times. Is this a typo?");
		}
		for (let i = 0; i < 8; i++) {
			if (savedMem[i] == instruction.mem) {
				// Saved twice, warning
				generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "The same memory location is used multiple times",
					instruction.line, "You are saving multiple values into the same memory location " + instruction.mem + ". Is this a typo?");
			}
		}

		// Record saved registers
		if (~(flags[instruction.src] & REGFLAG.S)) {
			flags[instruction.src] |= REGFLAG.S;
			savedMem[instruction.src] = instruction.mem;
		}
	}

	// Assume all registers are restored
	for (let i = 0; i < 8; i++) {
		flags[i] |= REGFLAG.R;
	}

	// Scan through all exit blocks and get restoration status
	for (let idx = 0; idx < bb.exitBlock.length; idx++) {
		exit = bb.exitBlock[idx];
		let exitflags = exit.registers.getFlags();
		for (let i = 0; i < 8; i++) {
			// Not restored
			if (!(exitflags[i] & REGFLAG.R)) {
				flags[i] &= ~REGFLAG.R;
			}
		}
	}

	// Generate saved register string
	saved = "";
	// R7 is always caller-saved
	for (let i = 0; i < 7; i++) {
		if (flags[i] == REGFLAG.SR || status[i] == REGSTAT.none) {
			saved = saved + "R" + i + " ";
		}
	}
	if (saved == "") {
		saved = "None"
	}

	// Generate input registers string
	input = "";
	for (let i = 0; i < 7; i++) {
		if (flags[i] == REGFLAG.INPUT) {
			input = input + "R" + i + " ";
		}
	}

	// Generate not used register string
	nouse = "";
	for (let i = 0; i < 7; i++) {
		if (status[i] == REGSTAT.none) {
			nouse = nouse + "R" + i + " ";
		}
	}

	result = "Callee-saved Registers: " + saved;
	// if (input) {
	// 	result += "\nInput registers: " + input;
	// }
	// if (nouse) {
	// 	result += "\nRegisters not used: " + nouse;
	// }

	label = code.findLabelByAddress(bb.subroutineNum);
	// Check for R7
	// if (bb.regflag[7] != REGFLAG.SR && bb.regstat[7] != REGSTAT.none) {
	// 	generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Not saving R7",
	// 		label.line, "R7 is potentially modified in this subroutine, but you didn't save and restore it correctly.");
	// }

	// Send subroutine callee-saved registers info
	generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Information, [], "Subroutine " + label.name,
		label.line, result);

	// Check for each exit block
	for (let idx = 0; idx < bb.exitBlock.length; idx++) {
		exit = bb.exitBlock[idx];
		let exitMem = exit.registers.getMem();

		ret = exit.instructions[exit.instructions.length - 1];
		// Mismatch in registers
		for (let i = 0; i < 8; i++) {
			if (savedMem[i] != exitMem[i]) {
				if (savedMem[i] == "") {
					// Not saved
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Mismatch in save-restore of registers.",
						ret.line, "R" + i + " is not saved in the beginning of the subroutine, but restored from " + exitMem[i]);
				} else if (exitMem[i] == "") {
					// Not restored
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Mismatch in save-restore of registers.",
						ret.line, "R" + i + " is saved to " + savedMem[i] + ", but not restored at the end of the subroutine.");
				} else {
					// Restoring from a different memory location
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Mismatch in save-restore of registers.",
						ret.line, "R" + i + " is saved to " + savedMem[i] + ", but you are restoring it from " + exitMem[i]);
				}
			}
		}
	}
}

// Check for unreachable code (Hint)
function checkUnreachableInstructions(diagnosticInfo: DiagnosticInfo, code: Code) {
	let instruction: Instruction;

	// Check for unreachable code
	for (let i = 0; i < code.instructions.length; i++) {
		instruction = code.instructions[i];
		if (!instruction.isData() && !(instruction.flags & INSTFLAG.isFound)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Hint, [DiagnosticTag.Unnecessary], "Code never got executed.", instruction.line, "");
		}
	}
}

// Check for uncalled subroutines (Warning, provide fix)
function checkUncalledSubroutines(diagnosticInfo: DiagnosticInfo, code: Code) {
	let label: Label;
	for (let i = 0; i < code.labels.length; i++) {
		label = code.labels[i];
		if (label.instruction && !label.instruction.isData() && !(label.instruction.flags & INSTFLAG.isFound)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Hint, [DiagnosticTag.Unnecessary], MESSAGE_POSSIBLE_SUBROUTINE, label.line,
				"The code after this label is unreachable. Is this label a subroutine?");
		}
	}
}

// Check for oversized PCoffset(Error)
// Return: the label index in code.labels array. -1 if not found, -2 if hardcoded offset.
function checkPCoffset(diagnosticInfo: DiagnosticInfo, instruction: Instruction, code: Code, offsetnumber: number): number {
	let i: number;
	let max = 1 << (offsetnumber - 1);
	// Label name is number
	if (isLc3Num(instruction.mem)) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Hardcoded PCoffset.", instruction.line,
			"Hardcoding the relative offset is error-prone and not recommended. Try to add labels and use label names instead.");
		return -2;
	} else if (diagnosticInfo.settings.version == 'v2' && (instruction.flags & INSTFLAG.endsWithSemicolon)) {
		// Check if the label name contains ; at the end
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Label name ends with ;.", instruction.line,
			"The assembler recognizes trailing ; as part of the label in current version. This is a bug of the assembler, but it will cause your code \
not able to compile");
		return -3;
	} else {
		// Check if offset is within range
		for (i = 0; i < code.labels.length; i++) {
			if (code.labels[i].name == instruction.mem) {
				if (instruction.memAddr - code.labels[i].memAddr - 1 < -max || instruction.memAddr - code.labels[i].memAddr > max - 1) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "PCoffset is too large.", instruction.line,
						"The PCoffset of this instruction (" + (code.labels[i].memAddr - instruction.memAddr - 1) + ") is outside of the range of PCoffset" + offsetnumber + " [-" + max + ", " + (max - 1) + "].");
				}
				break;
			}
		}
		// Label not found
		if (i == code.labels.length || code.labels[i].flags & INSTFLAG.isIncomplete) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Label not defined.", instruction.line,
				"The label " + instruction.mem + " is not defined.");
			return -1;
		}
	}
	return i;
}

// Check for jump to data (Warning)
function checkJumpToData(diagnosticInfo: DiagnosticInfo, instruction: Instruction, code: Code, idx: number) {
	let target: Instruction | null;
	if (idx < code.labels.length) {
		target = code.labels[idx].instruction;
		if (target && target.isData()) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Jumping/Branching to data.", instruction.line,
				"The destination of this instruction is line " + (target.line + 1) + ", which is data.");
		}
	}
}

// Check for running into data (Warning)
function checkRunningIntoData(diagnosticInfo: DiagnosticInfo, code: Code) {
	let i: number;
	let instruction: Instruction;
	let nextInstruction: Instruction | null;
	for (let idx = 0; idx < code.instructions.length; idx++) {
		instruction = code.instructions[idx];
		// Check the first instruction
		if (idx == 0 && instruction.isData()) {
			// If there is a valid instruction, report error		
			for (i = 1; i < code.instructions.length; i++) {
				nextInstruction = code.instructions[i];
				if (!nextInstruction.isData()) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Running into data.", instruction.line,
						"The program runs into data at the beginning.");
					break;
				}
			}
			// For a data file, no warnings
			if (i == code.instructions.length) {
				return;
			}
		}
		nextInstruction = instruction.nextInstruction;
		if (nextInstruction && nextInstruction.isData()) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Running into data.", nextInstruction.line,
				"The program may run into data after executing the instruction \'" + instruction.rawString + "\' at line " + (instruction.line + 1) + ".");
		}
	}
}
// Generate and push a diagnostic into diagnostics array
function generateDiagnostic(diagnosticInfo: DiagnosticInfo, severity: DiagnosticSeverity, tags: DiagnosticTag[], message: string, line: number, relatedInfo: string, length?: number) {
	if (length == undefined) {
		length = 1;
	}
	// Build a diagnostic
	const diagnostic: Diagnostic = {
		severity: severity,
		range: {
			start: { line: line, character: 0 },
			end: { line: line + length, character: 0 }
		},
		message: message,
		source: "LC3",
		tags: tags
	};
	// Pass related info
	// if (relatedInfo && hasDiagnosticRelatedInformationCapability) {
	if (relatedInfo) {
		diagnostic.relatedInformation = [
			{
				location: {
					uri: diagnosticInfo.textDocument.uri,
					range: Object.assign({}, diagnostic.range)
				},
				message: relatedInfo
			}
		];
	}
	// Optionally push diagnostics
	if ((diagnostic.severity == DiagnosticSeverity.Warning && diagnosticInfo.settings.showWarnings) ||
		(diagnostic.severity == DiagnosticSeverity.Error && diagnosticInfo.settings.showErrors) ||
		diagnostic.severity == DiagnosticSeverity.Information ||
		diagnostic.severity == DiagnosticSeverity.Hint) {
		// if(diagnostic.message.match("Unrolled loop.")) {
		diagnosticInfo.diagnostics.push(diagnostic);
	}
}
