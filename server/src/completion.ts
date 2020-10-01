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
	FILL,
	BLKW,
	STRINGZ
}

import {
	CompletionItem,
	CompletionItemKind
} from 'vscode-languageserver';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import {
	Code
} from './code';

import {
	Label
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
	}
];

// To be sent to the server
export let completionItems: CompletionItem[];

// Update completion item list according to the label names
export function updateCompletionItems(textDocument: TextDocument) {
	completionItems = [...defaultCompletionItems];
	const code = new Code(textDocument.getText());
	let idx: number, i: number;
	let label: Label;
	let item: CompletionItem;
	for (idx = 0; idx < code.labels.length; idx++) {
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
	// console.log(completionItems);
}
