import {
	Diagnostic,
	DiagnosticSeverity,
} from "vscode-languageserver";

import {
	createReadStream,
	createWriteStream,
	readdir,
} from "fs";

import {
	TextDocument,
} from "vscode-languageserver-textdocument";

import {
	generateDiagnostics,
} from "./diagnostic";

import {
	DiagnosticInfo,
	ExtensionSettings,
} from "./server";

import {
	Code
} from "./code";

const defaultSettings: ExtensionSettings = {
	version: "v2",
	showWarnings: true,
	showErrors: true,
	showIllegalInstructions: true,
	enableSubroutineCheckings: true,
	enableUnrolledLoopChecking: true,
};

function printDiagnostic(input: string, out: string) {
	const rs = createReadStream(input);
	const ws = createWriteStream(out);
	let textdocument: TextDocument;
	let diagnosticInfo: DiagnosticInfo;
	const diagnostics: Diagnostic[] = [];

	rs.on("open", function () {
		// console.log("File opened: ", input);
	})
	ws.on("open", function () {
		// console.log("File opened: ", out);
	})

	rs.on("data", (data) => {
		textdocument = data.toString();
		const code: Code = new Code(data.toString());
		let war: number = 0, err: number = 0, loop: number = 0;
		diagnosticInfo = {
			textDocument: textdocument,
			diagnostics: diagnostics,
			settings: defaultSettings
		};

		generateDiagnostics(diagnosticInfo, code);
		ws.write('{"diagnostics": [');
		for (let i = 0; i < diagnostics.length; i++) {
			let diagnostic = diagnostics[i];
			// Record number of warnings and errors
			if (diagnostic.severity == DiagnosticSeverity.Error) err++;
			let containBR: RegExp = new RegExp("BR", 'i');
			let containJSR: RegExp = new RegExp("JSR", 'i');
			if (diagnostic.severity == DiagnosticSeverity.Warning) {
				war++;
				if (diagnostic.message == "Unrolled loop." &&
					diagnostic.relatedInformation &&
					diagnostic.relatedInformation[0].message.match(containBR) &&
					!diagnostic.relatedInformation[0].message.match(containJSR)) {
					loop++;
				}
			}
			// Write message into a file
			ws.write("{");
			ws.write('"severity": "' + diagnostics[i].severity?.toString() + '", ');
			ws.write('"message": "' + diagnostics[i].message?.toString() + '"');
			ws.write("}");

			if (i != diagnostics.length - 1) {
				ws.write(",");
			}
		}
		ws.write("],");

		ws.write('"Number": {');
		ws.write('"Errors": ' + err.toString() + ', ');
		ws.write('"Warnings": ' + war.toString() + ', ');
		ws.write('"Loops": ' + loop.toString());
		ws.write("}}");

		ws.end();

		// console.log(diagnostics);
	});

}

const dir = "../studentcode/";
readdir(dir, (err, files) => {
	if (err) {
		throw err;
	}
	files.forEach(file => {
		if (file.split(".")[1] == "asm") {
			printDiagnostic("../studentcode/" + file, "../out/" + file.split(".")[0] + ".json");
		}
	});

});

