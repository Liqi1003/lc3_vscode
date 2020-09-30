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
		data: 1
	},
	{
		label: 'AND',
		kind: CompletionItemKind.Operator,
		data: 2
	},
	{
		label: 'BR',
		kind: CompletionItemKind.Operator,
		data: 3
	},
	{
		label: 'JMP',
		kind: CompletionItemKind.Operator,
		data: 4
	},
	{
		label: 'JSR',
		kind: CompletionItemKind.Operator,
		data: 5
	},
	{
		label: 'LD',
		kind: CompletionItemKind.Operator,
		data: 6
	},
	{
		label: 'LDI',
		kind: CompletionItemKind.Operator,
		data: 7
	},
	{
		label: 'LDR',
		kind: CompletionItemKind.Operator,
		data: 8
	},
	{
		label: 'LEA',
		kind: CompletionItemKind.Operator,
		data: 9
	},
	{
		label: 'NOT',
		kind: CompletionItemKind.Operator,
		data: 10
	},
	{
		label: 'RET',
		kind: CompletionItemKind.Operator,
		data: 11
	},
	{
		label: 'ST',
		kind: CompletionItemKind.Operator,
		data: 12
	},
	{
		label: 'STI',
		kind: CompletionItemKind.Operator,
		data: 13
	},
	{
		label: 'STR',
		kind: CompletionItemKind.Operator,
		data: 14
	},
	{
		label: 'TRAP',
		kind: CompletionItemKind.Operator,
		data: 15
	},
	{
		label: 'ORIG',
		kind: CompletionItemKind.Operator,
		data: 16
	},
	{
		label: 'FILL',
		kind: CompletionItemKind.Operator,
		data: 17
	},
	{
		label: 'BLKW',
		kind: CompletionItemKind.Operator,
		data: 18
	},
	{
		label: 'STRINGZ',
		kind: CompletionItemKind.Operator,
		data: 19
	}
];

export let completionItems: CompletionItem[];

// Update completion item list according to the label names
export function updateCompletionItems(textDocument: TextDocument) {
	completionItems = [...defaultCompletionItems];
	const code = new Code(textDocument.getText());
	let idx: number;
	let label: Label;
	let item: CompletionItem;
	for (idx = 0; idx < code.labels.length; idx++) {
		label = code.labels[idx];
		item = { label: label.name, kind: CompletionItemKind.Text, data: label.line };
		if (!completionItems.includes(item)) {
			completionItems.push(item);
		}
	}
	console.log(completionItems);
}
