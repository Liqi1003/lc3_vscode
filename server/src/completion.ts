export enum OPNUM {
	ADD = 10000,
	AND,
	BR,
	JMP,
	JSR,
	LD,
	LDI,
	LDR,
	LEA,
	NOT,
	RET,
	ST,
	STI,
	STR,
	TRAP,
	ORIG,
	END,
	FILL,
	BLKW,
	STRINGZ,
	GETC,
	IN,
	OUT,
	PUTS,
	PUTSP,
	HALT,
	R0,
	R1,
	R2,
	R3,
	R4,
	R5,
	R6,
	R7,
}

import {
	CompletionItem,
	CompletionItemKind,
} from 'vscode-languageserver';

import {
	Code,
} from './code';

import {
	INSTFLAG,
	Instruction,
	Label,
} from './instruction'

const defaultCompletionItems: CompletionItem[] = [
	{
		label: 'ADD',
		kind: CompletionItemKind.Operator,
		data: OPNUM.ADD
	},
	{
		label: 'AND',
		kind: CompletionItemKind.Operator,
		data: OPNUM.AND
	},
	{
		label: 'BR',
		kind: CompletionItemKind.Operator,
		data: OPNUM.BR
	},
	{
		label: 'JMP',
		kind: CompletionItemKind.Operator,
		data: OPNUM.JMP
	},
	{
		label: 'JSR',
		kind: CompletionItemKind.Operator,
		data: OPNUM.JSR
	},
	{
		label: 'LD',
		kind: CompletionItemKind.Operator,
		data: OPNUM.LD
	},
	{
		label: 'LDI',
		kind: CompletionItemKind.Operator,
		data: OPNUM.LDI
	},
	{
		label: 'LDR',
		kind: CompletionItemKind.Operator,
		data: OPNUM.LDR
	},
	{
		label: 'LEA',
		kind: CompletionItemKind.Operator,
		data: OPNUM.LEA
	},
	{
		label: 'NOT',
		kind: CompletionItemKind.Operator,
		data: OPNUM.NOT
	},
	{
		label: 'RET',
		kind: CompletionItemKind.Operator,
		data: OPNUM.RET
	},
	{
		label: 'ST',
		kind: CompletionItemKind.Operator,
		data: OPNUM.ST
	},
	{
		label: 'STI',
		kind: CompletionItemKind.Operator,
		data: OPNUM.STI
	},
	{
		label: 'STR',
		kind: CompletionItemKind.Operator,
		data: OPNUM.STR
	},
	{
		label: 'TRAP',
		kind: CompletionItemKind.Operator,
		data: OPNUM.TRAP
	},
	{
		label: 'ORIG',
		kind: CompletionItemKind.Operator,
		data: OPNUM.ORIG
	},
	{
		label: 'FILL',
		kind: CompletionItemKind.Operator,
		data: OPNUM.FILL
	},
	{
		label: 'BLKW',
		kind: CompletionItemKind.Operator,
		data: OPNUM.BLKW
	},
	{
		label: 'STRINGZ',
		kind: CompletionItemKind.Operator,
		data: OPNUM.STRINGZ
	},
	{
		label: 'GETC',
		kind: CompletionItemKind.Operator,
		data: OPNUM.GETC
	},
	{
		label: 'IN',
		kind: CompletionItemKind.Operator,
		data: OPNUM.IN
	},
	{
		label: 'OUT',
		kind: CompletionItemKind.Operator,
		data: OPNUM.OUT
	},
	{
		label: 'PUTS',
		kind: CompletionItemKind.Operator,
		data: OPNUM.PUTS
	},
	{
		label: 'PUTSP',
		kind: CompletionItemKind.Operator,
		data: OPNUM.PUTSP
	},
	{
		label: 'HALT',
		kind: CompletionItemKind.Operator,
		data: OPNUM.HALT
	},
	{
		label: 'R0',
		kind: CompletionItemKind.Variable,
		data: OPNUM.R0
	},
	{
		label: 'R1',
		kind: CompletionItemKind.Variable,
		data: OPNUM.R1
	},
	{
		label: 'R2',
		kind: CompletionItemKind.Variable,
		data: OPNUM.R2
	},
	{
		label: 'R3',
		kind: CompletionItemKind.Variable,
		data: OPNUM.R3
	},
	{
		label: 'R4',
		kind: CompletionItemKind.Variable,
		data: OPNUM.R4
	},
	{
		label: 'R5',
		kind: CompletionItemKind.Variable,
		data: OPNUM.R5
	},
	{
		label: 'R6',
		kind: CompletionItemKind.Variable,
		data: OPNUM.R6
	},
	{
		label: 'R7',
		kind: CompletionItemKind.Variable,
		data: OPNUM.R7
	},
];

// To be sent to the server
export let completionItems: CompletionItem[];

// Update completion item list according to the label names
export function updateCompletionItems(code: Code) {
	completionItems = [...defaultCompletionItems];
	let i: number;
	let label: Label;
	let instruction: Instruction;
	let item: CompletionItem;
	// Push labels
	for (let idx = 0; idx < code.labels.length; idx++) {
		label = code.labels[idx];
		item = { label: label.name, kind: CompletionItemKind.Text, data: label.line };
		for (i = 0; i < completionItems.length; i++) {
			if (completionItems[i].label == label.name) {
				break;
			}
		}
		if (i == completionItems.length) {
			completionItems.push(item);
		}
	}
	// Push labels in instructions
	for (let idx = 0; idx < code.instructions.length; idx++) {
		instruction = code.instructions[idx];
		if (!(instruction.flags & INSTFLAG.isIncomplete) && instruction.isMemType()) {
			item = { label: instruction.mem, kind: CompletionItemKind.Text, data: instruction.line };
			for (i = 0; i < completionItems.length; i++) {
				if (completionItems[i].label == instruction.mem) {
					break;
				}
			}
			if (i == completionItems.length) {
				completionItems.push(item);
			}
		}
	}
}
