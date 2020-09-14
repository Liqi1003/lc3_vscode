import { DocumentOnTypeFormattingRequest } from 'vscode-languageserver';
import { stringify } from 'querystring';

export class Instruction {
	// Internal variables
	optype: string;
	mem_addr: number;
	line: number;
	src1: number;
	src2: number;
	dest: number;
	mem: string;
	imm_val: number;
	imm_val_type: string;
	cc: string;

	constructor(inst: string) {
		// Default values
		this.optype = "";
		this.mem_addr = NaN;
		this.line = NaN;
		this.src1 = NaN;
		this.src2 = NaN;
		this.dest = NaN;
		this.mem = "";
		this.imm_val = NaN;
		this.imm_val_type = "";
		this.cc = "";

		// Parse instruction
		let instlst = inst.toUpperCase().split(/(\s|,)/);
		// Remove unwanted parts
		for (let i = instlst.length; i > 0; i--) {
			if (instlst[i] == '' || instlst[i] == ' ' || instlst[i] == '\t' || instlst[i] == ',') {
				instlst.splice(i, 1);
			}
		}
		// Assign values to variables
		this.optype = instlst[0];
		switch (this.optype) {
			// Basic operations
			case "ADD":
			case "AND":
				this.dest = this.parseValue(instlst[1]);
				this.src1 = this.parseValue(instlst[2]);
				if (instlst[3][0] == 'R') {
					this.src2 = this.parseValue(instlst[3]);
				} else {
					this.imm_val = this.parseValue(instlst[3]);
					this.imm_val_type = instlst[3][0];
				}
				break;
			case "JMP":
				this.mem = instlst[1];
				break;
			case "JSR":
				this.mem = instlst[1];
				break;
			case "JSRR":
				this.dest = this.parseValue(instlst[1]);
				break;
			case "LD":
			case "LDI":
				this.dest = this.parseValue(instlst[1]);
				this.mem = instlst[2];
				break;
			case "LDR":
				this.dest = this.parseValue(instlst[1]);
				this.src1 = this.parseValue(instlst[2]);
				this.imm_val = this.parseValue(instlst[3]);
				break;
			case "LEA":
				this.dest = this.parseValue(instlst[1]);
				this.imm_val = this.parseValue(instlst[2]);
				break;
			case "NOT":
				this.dest = this.parseValue(instlst[1]);
				this.src1 = this.parseValue(instlst[2]);
				break;
			case "RET":
				this.optype = "RET";
				this.src1 = 7;
				break;
			case "ST":
			case "STI":
				this.src1 = this.parseValue(instlst[1]);
				this.mem = instlst[2];
				break;
			case "STR":
				this.src1 = this.parseValue(instlst[1]);
				this.src2 = this.parseValue(instlst[2]);
				this.imm_val = this.parseValue(instlst[3]);
				break;
			case "TRAP":
				this.imm_val = this.parseValue(instlst[1]);
				break;
			// Frequently used TRAP vectors
			case "GETC":
			case "IN":
				this.dest = 0;
				break;
			case "OUT":
			case "PUTS":
			case "PUTSP":
				this.src1 = 0;
				break;
			case "HALT":
				this.optype = "HALT";
				break;
			// Directives
			case ".ORIG":
				this.mem_addr = this.parseValue(instlst[1]);
				break;
			case ".END":
				break;
			case ".FILL":
				break;
			case ".BLKW":
				this.imm_val = this.parseValue(instlst[1]);
				break;
			case ".STRINGZ":
				let str = inst.slice(inst.split(' ')[0].length).trim();
				str = str.slice(1, str.length - 1);
				this.mem = String(str);
				break;

			default:
				// In case they write nzp in different ways, handle BR here
				if (this.optype[0] == "B" && this.optype[1] == "R") {
					this.optype = "BR";
					this.cc = instlst[0].slice(2);
					this.mem = instlst[1];
					this.imm_val = this.parseValue(instlst[1]);
				} else {
					// LABEL
					this.optype = "LABEL";
					this.mem = instlst[0];
				}
				break;
		}
	}

	// Helper function to parse values from a string
	// Possible value type: Register, decimal, hexadecimal, binary
	parseValue(val: string) {
		let ret;
		val = val.trim();
		switch (val[0]) {
			case 'R':
				// Register
				ret = parseInt(val[1]);
				break;
			case 'X':
				// Hexadecimal
				ret = parseInt(val.slice(1), 16);
				break;
			case '#':
				// Decimal
				ret = parseInt(val.slice(1), 10);
				break;
			default:
				// Binary
				ret = parseInt(val, 2);
		}
		return ret;
	}
}

export class Code {
	// List of instructions
	instructions: Instruction[];
	end_addr: number;

	constructor(text: string) {
		this.instructions = [];
		this.end_addr = 0;
		let lines = text.split('\n');
		let line_num = 0;
		let mem_addr = 0;
		// Construct each instruction
		lines.forEach(line => {
			// Preprocess the line, removing spaces and comments
			line = line.trim();
			for (let i = 0; i < line.length; i++) {
				if (line[0] == ';' || (line[i] == ';' && line[i-1] == ' ')) {
					line = line.slice(0, i);
				}
			}
			if (line) {
				let instruction = new Instruction(line);

				// Keep track of line numbers
				instruction.line = line_num;

				// ORIG directive
				if (instruction.optype == ".ORIG") {
					mem_addr = instruction.mem_addr;
				}
				// Keep track of memory addresses
				instruction.mem_addr = mem_addr;
				if (instruction.optype == ".BLKW") {
					mem_addr += instruction.imm_val - 1;
				} else if (instruction.optype == ".STRINGZ") {
					mem_addr += instruction.mem.length;
					for (let i = 0; i < instruction.mem.length; i++){
						if (instruction.mem[i] == '\\') {
							mem_addr--;
						}
					}
				}
				if (mem_addr != 0 && instruction.optype != "LABEL" && instruction.optype != ".ORIG") {
					mem_addr++;
				}
				// Push the instruction into the list
				this.instructions.push(instruction);

				if (instruction.optype == ".END") {
					this.end_addr = instruction.mem_addr;
				}

				// Handle instructions/directives right behind labels
				if (instruction.optype == "LABEL") {
					line = line.slice(line.split(" ")[0].length + 1);
					line = line.trim();
					if (line) {
						let instruction = new Instruction(line);
						// Duplicated code, may refactor if needed
						instruction.line = line_num;
						instruction.mem_addr = mem_addr;
						if (instruction.optype == ".BLKW") {
							mem_addr += instruction.imm_val - 1;
						} else if (instruction.optype == ".STRINGZ") {
							mem_addr += instruction.mem.length;
						}
						if (mem_addr != 0 && instruction.optype != "LABEL" && instruction.optype != ".ORIG") {
							mem_addr++;
						}
						// Push the instruction into the list
						this.instructions.push(instruction);
					}
				}
			}
			line_num++;
		});
		console.log(this);
	}
}

export function is_lc3_number(str: string) {
	let regx = /^[xX][0-9a-f]+$/i;
	let regb = /^[0-1]+$/;
	let regd = /^#[0-9]+$/;
	return str.match(regx) || str.match(regd) || str.match(regb);
}
