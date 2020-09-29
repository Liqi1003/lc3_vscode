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
	Code
} from './code';

import {
	TRAPVEC,
	Instruction,
	Label,
	is_lc3_number,
	get_trap_function
} from "./instruction"

export const MESSAGE_POSSIBLE_SUBROUTINE = "Label is never used";

export function generateDiagnostics(textDocument: TextDocument, settings: ExtensionSettings): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	// Parse the code
	const code = new Code(textDocument.getText());
	let idx: number, i: number;
	let instruction: Instruction;
	let label_id: number;

	// Check for labels
	checkLabels(textDocument, diagnostics, settings, code);

	// Check for unreachable instructions
	checkUnreachableInstructions(textDocument, diagnostics, settings, code);
	checkUncalledSubroutines(textDocument, diagnostics, settings, code);

	// Check for code overlap
	checkCodeOverlap(textDocument, diagnostics, settings, code);

	// Single line of code checkings (not block of codes)
	for (idx = 0; idx < code.instructions.length; idx++) {
		instruction = code.instructions[idx];

		// Check for code before/after .ORIG/.END
		if (instruction.mem_addr == 0) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Error, "Code before .ORIG directive.", instruction.line,
				"Code before .ORIG is not allowed.");
		} else if (instruction.mem_addr >= code.end_addr) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Code after .END directive.", instruction.line,
				"Code after .END will be ignored.");
		}

		// Check for incomplete instructions
		if (instruction.incomplete) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Error, "Illegal or incomplete instruction.", instruction.line, "");
		}

		// Checking each line of code based on operation type
		switch (instruction.optype) {
			case "ADD":
				if (instruction.imm_val >= 32 || (instruction.imm_val >= 16 && instruction.imm_val_type == '#')) {
					generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "AND":
				if (instruction.imm_val >= 32) {
					generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "BR":
				label_id = checkPCoffset(textDocument, diagnostics, settings, instruction, code, 9);
				if (label_id >= 0) {
					checkJumpToData(textDocument, diagnostics, settings, instruction, code, label_id);
				}
				break;
			case "JSR":
				label_id = checkPCoffset(textDocument, diagnostics, settings, instruction, code, 11);
				if (label_id >= 0) {
					checkJumpToData(textDocument, diagnostics, settings, instruction, code, label_id);
				}
				break;
			case "LEA":
				checkPCoffset(textDocument, diagnostics, settings, instruction, code, 9);
				break;
			case "LD":
			case "ST":
			case "LDI":
			case "STI":
				checkPCoffset(textDocument, diagnostics, settings, instruction, code, 9);
				break;
			case "LDR":
			case "STR":
				if (instruction.imm_val >= 64) {
					generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
				}
				break;
			case "TRAP":
				switch (instruction.imm_val) {
					case TRAPVEC.INVALID:
					case TRAPVEC.HALT:
						if (instruction.subroutine_num != code.start_addr) {
							generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "HALT inside subroutine.", instruction.line,
								"You should not let the machine HALT inside a subroutine.");
						}
						break;
				}
				break;
			case "RET":
				if (isNaN(instruction.subroutine_num)) {
					generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "RET outside of subroutine.", instruction.line,
						"You are executing RET outside of a subroutine. Use 'JMP R7' if you really meant to do that.");
				}
				break;
			case ".FILL":
			case ".STRINGZ":
				checkRunningIntoData(textDocument, diagnostics, settings, instruction, code, idx);
				break;
			case ".BLKW":
				if (instruction.imm_val_type != '#' && instruction.imm_val_type != '0' && instruction.imm_val_type != 'X' && instruction.imm_val != 1) {
					generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Decimal number without #", instruction.line,
						".BLKW directives view the number as decimal by default. If you meant to write a binary number, add a leading 0; if you \
						meant to write a decimal number, add a leading #.");
				}
				checkRunningIntoData(textDocument, diagnostics, settings, instruction, code, idx);
				break;

			default:
				break;
		}
	}
	return diagnostics;
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

function checkLabels(textDocument: TextDocument, diagnostics: Diagnostic[], settings: ExtensionSettings, code: Code) {
	let idx: number, i: number;
	let label: Label, label2: Label;
	for (idx = 0; idx < code.labels.length; idx++) {
		label = code.labels[idx];
		// Check for unusable label name
		if (is_lc3_number(label.name)) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Label name is a number.", label.line,
				"This label name will be recognized as a number by the assembler, it will not be usable in any other instructions.");
		}
		// Check for multiple label at the same line
		if (settings.enableMultipleLabels && idx + 1 < code.labels.length && label.mem_addr == code.labels[idx + 1].mem_addr) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Multiple label at the same memory location.", label.line, 
			"Label " + label.name + " and " + code.labels[idx + 1].name + " are at the same memory location.");
		}
		// Check for ; in labels
		for (i = 0; i < label.name.length; i++) {
			if (label.name[i] == ';') {
				generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Label name contains semicolon.", label.line,
					"Semicolon(;) is not recognized as part of the label name. If you use the label name with trailing semicolon in other instructions, \
			then the assembler will not be able to find it.");
			}
		}
		// Check for duplicated labels
		for (i = idx + 1; i < code.labels.length; i++) {
			label2 = code.labels[i];
			if (label.name == label2.name) {
				generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Error, "Duplicated labels", label2.line,
					"The label " + label2.name + " has already appeared in line " + (label.line + 1) + " .");
			}
		}
	}
}

function checkCodeOverlap(textDocument: TextDocument, diagnostics: Diagnostic[], settings: ExtensionSettings, code: Code) {
	let i: number;
	let instruction: Instruction;
	for (i = 0; i < code.instructions.length; i++) {
		instruction = code.instructions[i];
		if (!isNaN(instruction.code_overlap)) {
			if (instruction.code_overlap == code.start_addr) {
				generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Code overlap between subroutine and main code.", instruction.line,
					"This instruction is shared by subroutine " + findLabelByAddress(code, instruction.code_overlap).name + " and main code.");
			} else {
				generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Code overlap between subroutines and main code.", instruction.line,
					"This instruction is shared by subroutine " + findLabelByAddress(code, instruction.code_overlap).name + " and subroutine " +
					findLabelByAddress(code, instruction.mem_addr).name + ".");
			}
		}
	}
}

function checkUnreachableInstructions(textDocument: TextDocument, diagnostics: Diagnostic[], settings: ExtensionSettings, code: Code) {
	let i: number;
	let instruction: Instruction;
	for (i = 0; i < code.instructions.length; i++) {
		instruction = code.instructions[i];
		if (!instruction.is_data && !instruction.is_found) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Code never got executed.", instruction.line, "");
		}
	}
}

function checkUncalledSubroutines(textDocument: TextDocument, diagnostics: Diagnostic[], settings: ExtensionSettings, code: Code) {
	let i: number;
	let label: Label;
	for (i = 0; i < code.labels.length; i++) {
		label = code.labels[i];
		if (label.instruction && !label.instruction.is_data && !label.instruction.is_found) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, MESSAGE_POSSIBLE_SUBROUTINE, label.line,
				"The code after this label is unreachable. Is this label a subroutine?");
		}
	}
}

function checkPCoffset(textDocument: TextDocument, diagnostics: Diagnostic[], settings: ExtensionSettings, instruction: Instruction, code: Code, offsetnumber: number): number {
	let i;
	let max = 1 << offsetnumber;
	// Label name is number
	if (is_lc3_number(instruction.mem)) {
		generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Hardcoded PCoffset.", instruction.line,
			"Hardcoding the relative offset is error-prone and not recommended. Try to add labels and use label names instead.");
		return -2;
	} else {
		// Check if offset is within range
		for (i = 0; i < code.labels.length; i++) {
			if (code.labels[i].name == instruction.mem) {
				if (instruction.mem_addr - code.labels[i].mem_addr - 1 < -max || instruction.mem_addr - code.instructions[i].mem_addr > max - 1) {
					generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Error, "PCoffset is too large.", instruction.line,
						"The PCoffset of this instruction(" + (code.labels[i].mem_addr - instruction.mem_addr - 1) + ") is outside of the range of PCoffset" + offsetnumber + " [-" + max + ", " + (max - 1) + "].");
				}
				break;
			}
		}
		// Label not found
		if (i == code.labels.length) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Error, "Label not defined.", instruction.line,
				"The label " + instruction.mem + " is not defined.");
			return -1;
		}
	}
	return i;
}

function checkJumpToData(textDocument: TextDocument, diagnostics: Diagnostic[], settings: ExtensionSettings, instruction: Instruction, code: Code, idx: number) {
	let target: Instruction | null;
	if (idx < code.labels.length) {
		target = code.labels[idx].instruction;
		if (target && target.is_data) {
			generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Jumping/Branching to data.", instruction.line,
				"The destination of this instruction is line " + (target.line + 1) + ", which is data.");
		}
	} else {
		console.error("Tried to access labels[" + idx + "]");
	}
}

function checkRunningIntoData(textDocument: TextDocument, diagnostics: Diagnostic[], settings: ExtensionSettings, instruction: Instruction, code: Code, idx: number) {
	do {
		idx--;
	} while (code.instructions[idx].optype == "LABEL" || code.instructions[idx].optype == ".FILL" ||
	code.instructions[idx].optype == ".BLKW" || code.instructions[idx].optype == ".STRINGZ");
	if (code.instructions[idx].optype != "BR" && code.instructions[idx].optype != "JMP" &&
		code.instructions[idx].optype != "RET" && code.instructions[idx].optype != "HALT" &&
		get_trap_function(code.instructions[idx]) != TRAPVEC.HALT) {
		generateDiagnostic(textDocument, diagnostics, settings, DiagnosticSeverity.Warning, "Running into data.", instruction.line,
			"The program runs into data without necessary Branching/Jumping instructions.");
	}
}

// Generate and push a diagnostic into diagnostics array
function generateDiagnostic(textDocument: TextDocument, diagnostics: Diagnostic[], settings: ExtensionSettings, severity: DiagnosticSeverity, message: string, line: number, relatedInfo: string) {
	const diagnostic: Diagnostic = {
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
	if ((diagnostic.severity == DiagnosticSeverity.Warning && settings.showWarnings) || (diagnostic.severity == DiagnosticSeverity.Error && settings.showErrors)) {
		diagnostics.push(diagnostic);
	}
}