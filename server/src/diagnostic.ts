import {
	Diagnostic,
	DiagnosticSeverity
} from 'vscode-languageserver';

import {
	TextDocument,
} from 'vscode-languageserver-textdocument';

import {
	ExtensionSettings,
	hasDiagnosticRelatedInformationCapability
} from './server';

import {
	TRAPVEC,
	Code,
	Instruction,
	is_lc3_number,
	get_trap_function, Label
} from './code';

export function generateDiagnostics(textDocument: TextDocument, settings: ExtensionSettings): Diagnostic[] {
	let diagnostics: Diagnostic[] = [];

	// Parse the code
	let code = new Code(textDocument.getText());
	let idx: number, i: number;
	let instruction: Instruction;
	let label_id: number;

	// Check for duplicated labels
	checkDuplicatedLabels(textDocument, diagnostics, code);

	// Check for unreachable instructions
	checkUnreachableInstructions(textDocument, diagnostics, code);

	// Single line of code checkings (not block of codes)
	for (idx = 0; idx < code.instructions.length; idx++) {
		instruction = code.instructions[idx];

		// Check for code before/after .ORIG/.END
		if (instruction.mem_addr == 0) {
			generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Error, "Code before .ORIG directive.", instruction.line,
				"Code before .ORIG is not allowed.");
		} else if (instruction.mem_addr > code.end_addr) {
			generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Code after .END directive.", instruction.line,
				"Code after .END will be ignored.");
		}

		// Check for incomplete instructions
		if (instruction.incomplete) {
			generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Error, "Illegal or incomplete instruction.", instruction.line, "");
		}

		// Check for improper subroutines
		checkImproperSubroutine(textDocument, diagnostics, code, idx);

		// Checking each line of code based on operation type
		switch (instruction.optype) {
			case "ADD":
				if (instruction.imm_val >= 32 || (instruction.imm_val >= 16 && instruction.imm_val_type == '#')) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "AND":
				if (instruction.imm_val >= 32) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "BR":
				label_id = checkPCoffset(textDocument, diagnostics, instruction, code, 9);
				if (label_id >= 0) {
					checkJumpToData(textDocument, diagnostics, instruction, code, label_id);
				}
				break;
			case "JSR":
				label_id = checkPCoffset(textDocument, diagnostics, instruction, code, 11);
				if (label_id >= 0) {
					checkJumpToData(textDocument, diagnostics, instruction, code, label_id);
				}
				break;
			case "LEA":
				checkPCoffset(textDocument, diagnostics, instruction, code, 9);
				break;
			case "LD":
			case "ST":
			case "LDI":
			case "STI":
				checkPCoffset(textDocument, diagnostics, instruction, code, 9);
				break;
			case "LDR":
			case "STR":
				if (instruction.imm_val >= 64) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "LABEL":
				// if (instruction.mem.length <= 2) {
				// 	generateDiagnostic(textDocument, DiagnosticSeverity.Warning, "Label name is too short", instruction.line, 
				// 	"It is good practice to assign meaningful names to labels.");
				// }
				if (is_lc3_number(instruction.mem)) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Label name is a number.", instruction.line,
						"This label name will be recognized as a number by the assembler, it will not be usable in any other instructions.");
				}
				if (settings.enableMultipleLabels && (idx + 1 < code.instructions.length) && (code.instructions[idx + 1].optype == "LABEL")) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Multiple label at the same memory location.", instruction.line, "");
				}
				for (i = 0; i < instruction.mem.length; i++) {
					if (instruction.mem[i] == ';') {
						generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Label name contains semicolon.", instruction.line,
							"Semicolon(;) is not recognized as part of the label name. If you use the label name with trailing semicolon in other instructions, \
						then the assembler will not be able to find it.");
					}
				}
				break;
			case "HALT":
				if (!isNaN(instruction.subroutine_num)) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "HALT inside subroutine.", instruction.line,
						"You should not let the machine HALT inside a subroutine.");
				}
				break;
			case "RET":
				if (isNaN(instruction.subroutine_num)) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "RET outside of subroutine.", instruction.line,
						"You are executing RET outside of a subroutine. Use 'JMP R7' if you really meant to do that.");
				}
				break;
			case ".FILL":
			case ".STRINGZ":
				checkRunningIntoData(textDocument, diagnostics, instruction, code, idx);
				break;
			case ".BLKW":
				if (instruction.imm_val_type != '#' && instruction.imm_val_type != '0' && instruction.imm_val_type != 'X' && instruction.imm_val != 1) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Decimal number without #", instruction.line,
						".BLKW directives view the number as decimal by default. If you meant to write a binary number, add a leading 0; if you \
						meant to write a decimal number, add a leading #.");
				}
				checkRunningIntoData(textDocument, diagnostics, instruction, code, idx);
				break;

			default:
				break;
		}
	}

	// Subroutine checks
	// checkSubroutines(textDocument, diagnostics, code);
	return diagnostics;
}

function findLabelByAddress(code: Code, address: number) {
	let i: number;
	let instruction = new Instruction("");
	for (i = 0; i < code.instructions.length; i++) {
		if (code.instructions[i].optype == "LABEL" && code.instructions[i].mem_addr == address) {
			instruction = code.instructions[i];
		}
	}
	return instruction;
}

function checkUnreachableInstructions(textDocument: TextDocument, diagnostics: Diagnostic[], code: Code) {
	let i: number;
	let instruction: Instruction;
	for (i = 0; i < code.instructions.length; i++) {
		instruction = code.instructions[i];
		if (!instruction.is_data && !instruction.is_found) {
			generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Code never got executed.", instruction.line, "");
		}
	}
}

function checkDuplicatedLabels(textDocument: TextDocument, diagnostics: Diagnostic[], code: Code) {
	let i: number, j: number;
	let label1: Label, label2: Label;
	for (i = 0; i < code.labels.length - 1; i++) {
		for (j = i + 1; j < code.labels.length; j++) {
			label1 = code.labels[i];
			label2 = code.labels[j];
			if (label1.name == label2.name) {
				generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Error, "Duplicated labels", label2.line,
					"The label " + label2.name + " has already appeared in line " + (label1.line + 1) + " .");
			}
		}
	}
}

function checkImproperSubroutine(textDocument: TextDocument, diagnostics: Diagnostic[], code: Code, idx: number) {
	let instruction: Instruction;
	instruction = code.instructions[idx];
	if (instruction.improper_subroutine) {
		let outer_subroutine: Instruction;
		outer_subroutine = findLabelByAddress(code, instruction.subroutine_num);
		generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Improper subroutine.", instruction.line,
			"The subroutine " + instruction.mem + " is contained in the subroutine " + outer_subroutine.mem + ".");
	}
}

// function checkSubroutines(textDocument: TextDocument, diagnostics: Diagnostic[], code: Code) {
// 	let subroutine: Subroutine;
// 	let instruction: Instruction;
// 	let idx: number, i: number;
// 	let save: boolean, restore: boolean;
// 	save = false;
// 	restore = false;

// 	for (idx = 0; idx < code.subroutines.length; idx++) {
// 		subroutine = code.subroutines[idx];
// 		for (i = subroutine.start; i < subroutine.end; i++) {
// 			instruction = code.instructions[i];
// 			// Find restore R7 code
// 			if (instruction.optype == "ST" && instruction.src1 == 7) {
// 				save = true;
// 				break;
// 			} else if (instruction.dest == 7) {
// 				break;
// 			}
// 		}

// 		for (i = subroutine.end; i > subroutine.start; i--) {
// 			instruction = code.instructions[i];
// 			// Find restore R7 code
// 			if (instruction.optype == "LD" && instruction.dest == 7) {
// 				restore = true;
// 				break;
// 			} else if (instruction.dest == 7) {
// 				break;
// 			}
// 		}

// 		if (!save || !restore) {
// 			generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Not saving and restoring R7 before RET.", code.instructions[subroutine.end].line,
// 				"Saving and restoring R7 is almost necessary in any subroutine if you ever used TRAP inside the subroutine. We \
//       recommend you save/restore R7 at all time.");
// 		}
// 	}
// }

function checkPCoffset(textDocument: TextDocument, diagnostics: Diagnostic[], instruction: Instruction, code: Code, offsetnumber: number) {
	let i;
	let max = 1 << offsetnumber;
	// Label name is number
	if (is_lc3_number(instruction.mem)) {
		generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Hardcoded PCoffset.", instruction.line,
			"Hardcoding the relative offset is error-prone and not recommended. Try to add labels and use label names instead.");
		return -2;
	} else {
		// Check if offset is within range
		for (i = 0; i < code.labels.length; i++) {
			if (code.labels[i].name == instruction.mem) {
				if (instruction.mem_addr - code.labels[i].mem_addr - 1 < -max || instruction.mem_addr - code.instructions[i].mem_addr > max - 1) {
					generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Error, "PCoffset is too large.", instruction.line,
						"The PCoffset of this instruction(" + (code.labels[i].mem_addr - instruction.mem_addr - 1) + ") is outside of the range of PCoffset" + offsetnumber + " [-" + max + ", " + (max - 1) + "].");
				}
				break;
			}
		}
		// Label not found
		if (i == code.labels.length) {
			generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Error, "Label not defined.", instruction.line,
				"The label " + instruction.mem + " is not defined.");
			return -1;
		}
	}
	return i;
}

function checkJumpToData(textDocument: TextDocument, diagnostics: Diagnostic[], instruction: Instruction, code: Code, idx: number) {
	let target: Instruction | null;
	if (idx < code.labels.length) {
		target = code.labels[idx].instruction;
		if (target && target.is_data) {
			generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Jumping/Branching to data.", instruction.line,
				"The destination of this instruction is line " + (target.line + 1) + ", which is data.");
		}
	} else {
		console.error("Tried to access labels[" + idx + "]");
	}
}

function checkRunningIntoData(textDocument: TextDocument, diagnostics: Diagnostic[], instruction: Instruction, code: Code, idx: number) {
	do {
		idx--;
	} while (code.instructions[idx].optype == "LABEL" || code.instructions[idx].optype == ".FILL" ||
	code.instructions[idx].optype == ".BLKW" || code.instructions[idx].optype == ".STRINGZ");
	if (code.instructions[idx].optype != "BR" && code.instructions[idx].optype != "JMP" &&
		code.instructions[idx].optype != "RET" && code.instructions[idx].optype != "HALT" &&
		get_trap_function(code.instructions[idx]) != TRAPVEC.HALT) {
		generateDiagnostic(textDocument, diagnostics, DiagnosticSeverity.Warning, "Running into data.", instruction.line,
			"The program runs into data without necessary Branching/Jumping instructions.");
	}
}

function generateDiagnostic(textDocument: TextDocument, diagnostics: Diagnostic[], severity: DiagnosticSeverity, message: string, line: number, relatedInfo: string) {
	let diagnostic: Diagnostic = {
		severity: severity,
		range: {
			start: { line: line, character: 0 },
			end: { line: line + 1, character: 0 }
		},
		message: message,
		source: "lc3"
	};
	if (relatedInfo && hasDiagnosticRelatedInformationCapability) {
		diagnostic.relatedInformation = [
			{
				location: {
					uri: textDocument.uri,
					range: Object.assign({}, diagnostic.range)
				},
				message: relatedInfo
			}
		];
	}
	diagnostics.push(diagnostic);
}
