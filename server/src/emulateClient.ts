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
	enableSubroutineChecking: true,
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
		let war: number = 0, err: number = 0, unn: number = 0;
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
			if (diagnostic.severity == DiagnosticSeverity.Warning) war++;
			if (diagnostic.severity == DiagnosticSeverity.Hint) unn++;
			// Write message into a file
			ws.write("{");
			ws.write('"line": "' + diagnostics[i].range.start.line.toString() + '", ');
			ws.write('"severity": "' + diagnostics[i].severity?.toString() + '", ');
			ws.write('"message": "' + diagnostics[i].message?.toString() + '"');
			if (diagnostics[i].relatedInformation && diagnostics[i].message != "Unrolled loop.") {
				ws.write(', ');
				ws.write('"relatedInfo": "' + diagnostics[i].relatedInformation[0].message.toString().replace(/\\/g, "\\\\").replace(/\"/g, "\\\"") + '"');
			}
			ws.write("}");

			if (i != diagnostics.length - 1) {
				ws.write(",");
			}
		}
		ws.write("],");

		ws.write('"Number": {');
		ws.write('"Errors": ' + err.toString() + ', ');
		ws.write('"Warnings": ' + war.toString() + ',');
		ws.write('"Unnecessary": ' + unn.toString())
		ws.write("}}");

		ws.end();

		// console.log(diagnostics);
	});

}

const dir = "./studentcode/";
readdir(dir, (err, files) => {
	if (err) {
		throw err;
	}
	files.forEach(file => {
		if (file.split(".")[1] == "asm") {
			printDiagnostic("./studentcode/" + file, "./out/" + file.split(".")[0] + ".json");
		}
	});

});

