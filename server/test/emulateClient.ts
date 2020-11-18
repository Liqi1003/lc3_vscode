import {
	Diagnostic,
} from "vscode-languageserver";

import {
	ReadStream,
	WriteStream,
} from "fs"

import {
	TextDocument,
} from "vscode-languageserver-textdocument";

import {
	generateDiagnostics
} from "../src/diagnostic";

function outputDiagnostics(diagnostics: Diagnostic[]) {
	let diag: Diagnostic;
	let i: number;

	for (i = 0; i < diagnostics.length; i++) {
		diag = diagnostics[i];
		console.log(diag);
	}

}

function openFile(name: string) {
	let rs: ReadStream;
	
}


