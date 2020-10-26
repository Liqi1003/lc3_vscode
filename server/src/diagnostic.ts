import {
	Diagnostic,
	DiagnosticTag,
	DiagnosticSeverity,
} from 'vscode-languageserver';

import {
	hasDiagnosticRelatedInformationCapability,
	DiagnosticInfo,
} from './server';

import {
	Code,
} from './code';

import {
	TRAPVEC,
	Instruction,
	Label,
	is_lc3_number,
	is_lc3_register,
	INSTFLAG,
	CC,
} from './instruction'

import {
	BasicBlock,
	BBFLAG,
} from "./basicBlock";

// For code action
export const MESSAGE_POSSIBLE_SUBROUTINE = "Label is never used";

export function generateDiagnostics(diagnosticInfo: DiagnosticInfo) {
	// Parse the code
	const code = new Code(diagnosticInfo.textDocument.getText());
	let idx: number;
	let instruction: Instruction;
	let label_id: number;

	/** Global checking */
	// Check for labels
	checkLabels(diagnosticInfo, code);

	// Check for unreachable instructions
	checkUnreachableInstructions(diagnosticInfo, code);
	checkUncalledSubroutines(diagnosticInfo, code);

	// Check for code before/after .ORIG/.END
	checkORIGandEND(diagnosticInfo, code);

	// Check for running into data
	checkRunningIntoData(diagnosticInfo, code);

	/** Block checking */
	for (idx = 0; idx < code.basicBlocks.length; idx++) {
		// Check for code overlap between subroutines and/or main code
		checkCodeOverlapBB(code.basicBlocks[idx], diagnosticInfo, code);
		if (code.basicBlocks[idx].subroutine_num != code.start_addr) {
			// Check for caller/callee saved registers
			checkCalleeSavedRegs(code.basicBlocks[idx], diagnosticInfo, code);
		}
	}

	/** Single line of code checking */
	for (idx = 0; idx < code.instructions.length; idx++) {
		instruction = code.instructions[idx];

		// Skip the instruction if it is not found
		if (!(instruction.flags & INSTFLAG.is_found)) {
			continue;
		}

		// Check for incomplete/illegal instructions
		if (diagnosticInfo.settings.showIncompleteInstructions && (instruction.flags & INSTFLAG.is_incomplete)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Illegal or incomplete instruction.", instruction.line,
				instruction.raw_string + " is incomplete/illegal");
			continue;
		}

		// Check for dead code
		if ((instruction.flags & INSTFLAG.is_dead)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Hint, [DiagnosticTag.Unnecessary], "Dead code.", instruction.line,
				"Overwriting the value without using the content in R" + instruction.dest + ".");
		}

		// Checking each line of code based on operation type
		switch (instruction.optype) {
			case "ADD":
				if (instruction.imm_val >= 32 || (instruction.imm_val >= 16 && instruction.imm_val_type == '#')) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "AND":
				if (instruction.imm_val >= 32) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "BR":
				if (instruction.mem) {
					checkBRpossibility(diagnosticInfo, instruction, code);
					label_id = checkPCoffset(diagnosticInfo, instruction, code, 9);
					if (label_id >= 0) {
						checkJumpToData(diagnosticInfo, instruction, code, label_id);
					}
				}
				break;
			case "JSR":
				if (instruction.mem) {
					label_id = checkPCoffset(diagnosticInfo, instruction, code, 11);
					if (label_id >= 0) {
						checkJumpToData(diagnosticInfo, instruction, code, label_id);
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
				if (instruction.imm_val >= 64) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "TRAP":
				switch (instruction.imm_val) {
					case TRAPVEC.INVALID:
						generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Unknown TRAP vector.", instruction.line, "");
						break;
					case TRAPVEC.HALT:
						if (instruction.subroutine_num != code.start_addr) {
							generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "HALT inside subroutine.", instruction.line,
								"You should not let the machine HALT inside a subroutine.");
						}
						break;
				}
				break;
			case "RET":
				if (instruction.subroutine_num == code.start_addr) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "RET outside of subroutine.", instruction.line,
						"You are executing RET outside of a subroutine. Use 'JMP R7' if you really meant to do that.");
				}
				break;
			case ".FILL":
			case ".STRINGZ":
				break;
			case ".BLKW":
				if (!(instruction.flags & INSTFLAG.is_incomplete) && instruction.imm_val_type != '#' && instruction.imm_val_type != '0' && instruction.imm_val_type != 'X' && instruction.imm_val != 1) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Decimal number without #", instruction.line,
						".BLKW directives view the number as decimal by default. If you meant to write a binary number, add a leading 0; if you \
						meant to write a decimal number, add a leading #.");
				}
				break;
			default:
				break;
		}
	}
}

// Check for always BR and redundant conditions (Warning)
function checkBRpossibility(diagnosticInfo: DiagnosticInfo, instruction: Instruction, code: Code) {
	if (instruction.cc == CC.nzp) {
		return;
	}
	if (instruction.br_possibility == 1) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Branch always taken.", instruction.line,
			"The condition of this branch is always true, use BR/BRnzp for better readability.");
	} else if (instruction.br_possibility == -1) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Redundant condition.", instruction.line,
			"Some condition(s) of this branch is always false, remove them for better readability.");
	}
}

function findLabelByAddress(code: Code, address: number): Label {
	let i: number;
	let label = new Label(new Instruction(""));
	for (i = 0; i < code.labels.length; i++) {
		if (code.labels[i].mem_addr == address) {
			label = code.labels[i];
		}
	}
	return label;
}

// Check for code before .ORIG (Error) and code after .END (Warning)
function checkORIGandEND(diagnosticInfo: DiagnosticInfo, code: Code) {
	let idx: number, i: number;
	let label: Label;
	let instruction: Instruction;
	for (idx = 0; idx < code.instructions.length; idx++) {
		instruction = code.instructions[idx];
		if (isNaN(instruction.mem_addr)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Code before .ORIG directive.", instruction.line,
				"Code before .ORIG is not allowed. Are you missing the .ORIG directive?");
		} else if (instruction.mem_addr >= code.end_addr) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [DiagnosticTag.Unnecessary], "Code after .END directive.", instruction.line,
				"Code after .END will be ignored.");
		}
	}
	for (idx = 0; idx < code.labels.length; idx++) {
		label = code.labels[idx];
		if (isNaN(label.mem_addr)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Code before .ORIG directive.", label.line,
				"Label before .ORIG is not allowed.");
		} else if (label.mem_addr >= code.end_addr) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [DiagnosticTag.Unnecessary], "Code after .END directive.", label.line,
				"Label after .END will be ignored.");
		}
	}
}

// Check for unusable label name (e.g. X123) (Warning), multiple labels at the same memory address (Warning, optional),
// duplicated labels (Error) and ; after labels without a space (Warning)
function checkLabels(diagnosticInfo: DiagnosticInfo, code: Code) {
	let idx: number, i: number;
	let label: Label, label2: Label;
	for (idx = 0; idx < code.labels.length; idx++) {
		label = code.labels[idx];
		// Check for unusable label name
		if (is_lc3_number(label.name) || is_lc3_register(label.name)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [DiagnosticTag.Unnecessary], "Label name is a number.", label.line,
				"This label name will be recognized as a number or register name by the assembler, it will not be usable in any other instructions.");
		}
		// Check for multiple labels at the same line
		if (diagnosticInfo.settings.showMultipleLabels && idx + 1 < code.labels.length && label.mem_addr == code.labels[idx + 1].mem_addr) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Hint, [DiagnosticTag.Unnecessary], "Multiple label at the same memory location.", label.line,
				"Label " + label.name + " and " + code.labels[idx + 1].name + " are at the same memory location.");
		}
		// Check for ; in labels
		if (label.flags & INSTFLAG.has_semicolon) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Label name contains semicolon.", label.line,
				"Semicolon(;) is not recognized as part of the label name. If you use the label name with trailing semicolon in other instructions, \
		then the assembler will not be able to find it.");
		}
		// Check for duplicated labels
		for (i = idx + 1; i < code.labels.length; i++) {
			label2 = code.labels[i];
			if (label.name == label2.name) {
				generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "Duplicated labels", label2.line,
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
		if (bb.subroutine_num == code.start_addr) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Code overlap between subroutine and main code.", bb.instructions[0].line,
				"This instruction is shared by subroutine " + findLabelByAddress(code, bb.overlapNumber).name + " and main code.");
		} else if (bb.overlapNumber == code.start_addr) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Code overlap between subroutine and main code.", bb.instructions[0].line,
				"This instruction is shared by subroutine " + findLabelByAddress(code, bb.subroutine_num).name + " and main code.");
		} else {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Code overlap between subroutines.", bb.instructions[0].line,
				"This instruction is shared by subroutine " + findLabelByAddress(code, bb.overlapNumber).name + " and subroutine " +
				findLabelByAddress(code, bb.instructions[0].mem_addr).name + ".");
		}
	}

	if (bb.next_block) {
		checkCodeOverlapBB(bb.next_block, diagnosticInfo, code);
	}
	if (bb.br_block) {
		checkCodeOverlapBB(bb.br_block, diagnosticInfo, code);
	}
}

// Check for callee-saved registers (Hint) and mismatch (Warning)
function checkCalleeSavedRegs(bb: BasicBlock, diagnosticInfo: DiagnosticInfo, code: Code) {
	let idx: number, i: number;
	let instruction: Instruction, ret: Instruction;
	let exit: BasicBlock;
	let label: Label;
	let str: string;

	for (idx = 0; idx < bb.instructions.length; idx++) {
		instruction = bb.instructions[idx];
		// Not a store operation, give up
		if (instruction.optype != "ST" &&
			instruction.optype != "STR") {
			break;
		}
		// Record saved registers
		if (bb.savedReg[instruction.src] == false) {
			bb.savedReg[instruction.src] = true;
		} else {
			// Saved twice, warning
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Register is saved multiple times",
				instruction.line, "You are saving R" + instruction.src + " multiple times, is this a typo?");
		}
	}

	for (idx = 0; idx < bb.exit_block.length; idx++) {
		andWithRestore(bb.restoredReg, bb.savedReg, bb.exit_block[idx].restoredReg);
	}

	label = findLabelByAddress(code, bb.subroutine_num);
	// Generate string
	str = "";
	// R7 is always caller-saved
	for (idx = 0; idx < 7; idx++) {
		if (bb.savedReg[idx] && bb.restoredReg[idx]) {
			str = str + "R" + idx + " ";
		}
	}
	if (str == "") {
		str = "None"
	}
	// Send subroutine callee-saved registers info
	generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Information, [], "Subroutine " + label.name,
		label.line, "Callee-saved Registers: " + str);

	// Check for each exit block
	for (idx = 0; idx < bb.exit_block.length; idx++) {
		exit = bb.exit_block[idx];
		ret = exit.instructions[exit.instructions.length - 1];
		// Mismatch in registers
		str = "";
		for (i = 0; i < 8; i++) {
			// Saved but not restored?
			if (bb.savedReg[i] !== exit.restoredReg[i]) {
				str = str + "R" + i + " ";
			}
		}
		// Mismatch non-empty, raise warning
		if (str != "") {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Mismatch in save-restore of registers",
				ret.line, "Mismatched registers: " + str);
		}
	}
}

function andWithRestore(new_restore: Array<boolean>, save: Array<boolean>, restore: Array<boolean>) {
	let i: number;
	for (i = 0; i < 8; i++) {
		new_restore[i] = save[i] && restore[i];
	}
}

function findBlockBySubroutine(subroutine_num: number, code: Code): BasicBlock {
	let idx: number;
	let bb: BasicBlock = new BasicBlock();
	for (idx = 0; idx < code.basicBlocks.length; idx++) {
		if (code.basicBlocks[idx].subroutine_num == subroutine_num) {
			bb = code.basicBlocks[idx];
		}
	}
	return bb;
}

// Check for unreachable code (Hint)
function checkUnreachableInstructions(diagnosticInfo: DiagnosticInfo, code: Code) {
	let i: number;
	let instruction: Instruction;

	// Check for unreachable code
	for (i = 0; i < code.instructions.length; i++) {
		instruction = code.instructions[i];
		if (!instruction.isData() && !(instruction.flags & INSTFLAG.is_found)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Hint, [DiagnosticTag.Unnecessary], "Code never got executed.", instruction.line, "");
		}
	}
}

// Check for uncalled subroutines (Warning, provide fix)
function checkUncalledSubroutines(diagnosticInfo: DiagnosticInfo, code: Code) {
	let i: number;
	let label: Label;
	for (i = 0; i < code.labels.length; i++) {
		label = code.labels[i];
		if (label.instruction && !label.instruction.isData() && !(label.instruction.flags & INSTFLAG.is_found)) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Hint, [DiagnosticTag.Unnecessary], MESSAGE_POSSIBLE_SUBROUTINE, label.line,
				"The code after this label is unreachable. Is this label a subroutine?");
		}
	}
}

// Check for oversized PCoffset(Error)
// Return: the label index in code.labels array. -1 if not found, -2 if hardcoded offset.
function checkPCoffset(diagnosticInfo: DiagnosticInfo, instruction: Instruction, code: Code, offsetnumber: number): number {
	let i;
	let max = 1 << offsetnumber;
	// Label name is number
	if (is_lc3_number(instruction.mem)) {
		generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Hardcoded PCoffset.", instruction.line,
			"Hardcoding the relative offset is error-prone and not recommended. Try to add labels and use label names instead.");
		return -2;
	} else {
		// Check if offset is within range
		for (i = 0; i < code.labels.length; i++) {
			if (code.labels[i].name == instruction.mem) {
				if (instruction.mem_addr - code.labels[i].mem_addr - 1 < -max || instruction.mem_addr - code.labels[i].mem_addr > max - 1) {
					generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Error, [], "PCoffset is too large.", instruction.line,
						"The PCoffset of this instruction(" + (code.labels[i].mem_addr - instruction.mem_addr - 1) + ") is outside of the range of PCoffset" + offsetnumber + " [-" + max + ", " + (max - 1) + "].");
				}
				break;
			}
		}
		// Label not found
		if (i == code.labels.length) {
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
	} else {
		console.error("Tried to access labels[" + idx + "]");
	}
}

// Check for running into data (Warning)
function checkRunningIntoData(diagnosticInfo: DiagnosticInfo, code: Code) {
	let idx: number, i: number;
	let instruction: Instruction;
	let next_instruction: Instruction | null;
	for (idx = 0; idx < code.instructions.length; idx++) {
		instruction = code.instructions[idx];
		// Check the first instruction
		if (idx == 0 && instruction.isData()) {
			// If there is a valid instruction, report error		
			for (i = 1; i < code.instructions.length; i++) {
				next_instruction = code.instructions[i];
				if (!next_instruction.isData()) {
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
		next_instruction = instruction.next_instruction;
		if (next_instruction && next_instruction.isData()) {
			generateDiagnostic(diagnosticInfo, DiagnosticSeverity.Warning, [], "Running into data.", next_instruction.line,
				"The program may run into data after executing the instruction \"" + instruction.raw_string + "\" at line " + (instruction.line + 1) + ".");

		}
	}
}

// Generate and push a diagnostic into diagnostics array
function generateDiagnostic(diagnosticInfo: DiagnosticInfo, severity: DiagnosticSeverity, tags: DiagnosticTag[], message: string, line: number, relatedInfo: string) {
	// Build a diagnostic
	const diagnostic: Diagnostic = {
		severity: severity,
		range: {
			start: { line: line, character: 0 },
			end: { line: line + 1, character: 0 }
		},
		message: message,
		source: "lc3",
		tags: tags
	};
	// Pass related info
	if (relatedInfo && hasDiagnosticRelatedInformationCapability) {
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
		diagnosticInfo.diagnostics.push(diagnostic);
	}
}
