export enum TRAPVEC {
  INVALID = 0x0,
  GETC = 0x20,
  OUT = 0x21,
  PUTS = 0x22,
  IN = 0x23,
  PUTSP = 0x24,
  HALT = 0x25
}

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
  incomplete: boolean;
  subroutine_num: number;
  improper_subroutine: boolean;

  constructor(inst: string) {
    // Default values
    this.optype = "";
    this.mem_addr = NaN;
    this.mem = "";
    this.line = NaN;
    this.src1 = NaN;
    this.src2 = NaN;
    this.dest = NaN;
    this.imm_val = NaN;
    this.imm_val_type = "";
    this.cc = "";
    this.incomplete = false;
    this.subroutine_num = NaN;
    this.improper_subroutine = false;

    // Parse instruction
    let instlst = inst.toUpperCase().split(/(\s|,)/);
    let i: number;
    // Remove unwanted parts
    for (i = instlst.length; i > 0; i--) {
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
        if (instlst.length >= 4) {
          this.dest = this.parseValue(instlst[1]);
          this.src1 = this.parseValue(instlst[2]);
          if (instlst[3][0] == 'R') {
            this.src2 = this.parseValue(instlst[3]);
          } else {
            this.imm_val = this.parseValue(instlst[3]);
            this.imm_val_type = instlst[3][0];
          }
        } else {
          this.incomplete = true;
        }
        if (isNaN(this.dest) || isNaN(this.src1) ||
          (instlst[3][0] == 'R' && isNaN(this.src2)) ||
          instlst[3][0] != 'R' && isNaN(this.imm_val)) {
          this.incomplete = true;
        }
        break;
      case "JMP":
        if (instlst.length >= 2) {
          this.mem = instlst[1];
        } else {
          this.incomplete = true;
        }
        break;
      case "JSR":
        if (instlst.length >= 2) {
          this.mem = instlst[1];
        } else {
          this.incomplete = true;
        }
        break;
      case "JSRR":
        if (instlst.length >= 2) {
          this.dest = this.parseValue(instlst[1]);
        } else {
          this.incomplete = true;
        }
        if (this.dest == NaN) {
          this.incomplete = true;
        }
        break;
      case "LD":
      case "LDI":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.mem = instlst[2];
        } else {
          this.incomplete = true;
        }
        if (this.dest == NaN) {
          this.incomplete = true;
        }
        break;
      case "LDR":
        if (instlst.length >= 4) {
          this.dest = this.parseValue(instlst[1]);
          this.src1 = this.parseValue(instlst[2]);
          this.imm_val = this.parseValue(instlst[3]);
          this.imm_val_type = instlst[3][0];
        } else {
          this.incomplete = true;
        }
        if (this.dest == NaN || isNaN(this.src1) || isNaN(this.imm_val)) {
          this.incomplete = true;
        }
        break;
      case "LEA":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.mem = instlst[2];
        } else {
          this.incomplete = true;
        }
        if (this.dest == NaN) {
          this.incomplete = true;
        }
        break;
      case "NOT":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.src1 = this.parseValue(instlst[2]);
        } else {
          this.incomplete = true;
        }
        if (this.dest == NaN || isNaN(this.src1)) {
          this.incomplete = true;
        }
        break;
      case "RET":
        this.optype = "RET";
        this.src1 = 7;
        break;
      case "ST":
      case "STI":
        if (instlst.length >= 3) {
          this.src1 = this.parseValue(instlst[1]);
          this.mem = instlst[2];
        } else {
          this.incomplete = true;
        }
        if (isNaN(this.src1)) {
          this.incomplete = true;
        }
        break;
      case "STR":
        if (instlst.length >= 4) {
          this.src1 = this.parseValue(instlst[1]);
          this.src2 = this.parseValue(instlst[2]);
          this.imm_val = this.parseValue(instlst[3]);
          this.imm_val_type = instlst[3][0];
        } else {
          this.incomplete = true;
        }
        if (isNaN(this.src1) || isNaN(this.src2) || isNaN(this.imm_val)) {
          this.incomplete = true;
        }
        break;
      case "TRAP":
        if (instlst.length >= 2) {
          this.imm_val = this.parseValue(instlst[1]);
          this.imm_val_type = instlst[1][0];
        } else {
          this.incomplete = true;
        }
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
        if (instlst.length >= 2) {
          this.mem_addr = this.parseValue(instlst[1]);
        } else {
          this.incomplete = true;
        }
        break;
      case ".END":
        break;
      case ".FILL":
        if (instlst.length >= 2) {
          if (is_lc3_number(instlst[1])) {
            this.imm_val = this.parseValue(instlst[1]);
            this.imm_val_type = instlst[1][0];
          } else {
            this.mem = instlst[1];
          }
        } else {
          this.incomplete = true;
        }
        break;
      case ".BLKW":
        this.imm_val = this.parseValue(instlst[1]);
        this.imm_val_type = instlst[1][0];
        break;
      case ".STRINGZ":
        let str = inst.slice(inst.split(' ')[0].length).trim();
        str = str.slice(1, str.length - 1);
        this.mem = String(str);
        break;

      default:
        // In case they write nzp in different ways, handle BR here
        if (this.optype[0] == "B" && this.optype[1] == "R") {
          if (instlst.length >= 2) {
            this.optype = "BR";
            this.cc = instlst[0].slice(2);
            this.mem = instlst[1];
          } else {
            this.incomplete = true;
          }
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
        if (ret > 7) {
          ret = NaN;
        }
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
        if (is_lc3_number(val)) {
          ret = parseInt(val, 2);
        } else {
          ret = NaN;
        }
    }
    return ret;
  }
}

export class Code {
  // List of instructions
  instructions: Instruction[];
  end_addr: number;
  subroutines: Subroutine[];
  has_orig: boolean;

  constructor(text: string) {
    this.instructions = [];
    this.end_addr = NaN;
    this.subroutines = [];
    this.has_orig = false;

    this.constructInstructions(text);

    this.analyzeSubroutines();
  }

  constructInstructions(text: string) {
    let lines = text.split('\n');
    let line_num = 0;
    let mem_addr = 0;
    let instruction: Instruction;
    let idx: number, i: number;
    let line: string;
    // Construct each instruction
    for (idx = 0; idx < lines.length; idx++) {
      line = lines[idx];
      // Preprocess the line, removing spaces and comments
      line = line.trim();
      for (i = 0; i < line.length; i++) {
        if (line[0] == ';' || (line[i] == ';' && (line[i - 1] == ' ' || line[i - 1] == '\t'))) {
          line = line.slice(0, i);
        }
      }
      if (line) {
        instruction = new Instruction(line);

        // Keep track of line numbers
        instruction.line = line_num;

        // ORIG directive
        if (instruction.optype == ".ORIG") {
          this.has_orig = true;
          mem_addr = instruction.mem_addr;
        }
        // Keep track of memory addresses
        instruction.mem_addr = mem_addr;
        if (instruction.optype == ".BLKW") {
          mem_addr += instruction.imm_val - 1;
        } else if (instruction.optype == ".STRINGZ") {
          mem_addr += instruction.mem.length;
          for (i = 0; i < instruction.mem.length; i++) {
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

        if (instruction.optype == ".END" && isNaN(this.end_addr)) {
          this.end_addr = instruction.mem_addr;
        }

        // Handle instructions/directives right behind labels
        if (instruction.optype == "LABEL") {
          line = line.slice(line.split(/\s/)[0].length + 1);
          line = line.trim();
          if (line) {
            instruction = new Instruction(line);
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
    }
    console.log(this);
  }

  analyzeSubroutines() {
    let target = NaN;
    let idx: number, i: number;
    let instruction: Instruction;
    let subroutine: Subroutine;
    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      if (instruction.optype == "JSR") {
        for (i = 0; i < this.instructions.length; i++) {
          if (this.instructions[i].optype == "LABEL" && this.instructions[i].mem == instruction.mem) {
            target = i;
            break;
          }
        }

        // label not found, give up
        if (i == this.instructions.length) {
          continue;
        }

        // Head of subroutine
        instruction = this.instructions[i];
        // Improper subroutine (subroutine inside another subroutine)
        if (!isNaN(instruction.subroutine_num) &&
          instruction.subroutine_num != instruction.mem_addr) {
          instruction.improper_subroutine = true;
          continue;
        } else if (instruction.subroutine_num == instruction.mem_addr) {
          // Have seen this subroutine
          continue;
        }

        // Mark all code between subroutine head and RET as a subroutine
        for (; i < this.instructions.length; i++) {
          instruction = this.instructions[i];
          if (!isNaN(instruction.subroutine_num)) {
            instruction.improper_subroutine = true;
            break;
          }
          instruction.subroutine_num = this.instructions[target].mem_addr;

          // Found the end
          if (instruction.optype == "RET") {
            subroutine = new Subroutine(target, i, this.instructions[target].mem_addr, this.instructions[target].mem);
            this.subroutines.push(subroutine);
            break;
          }
        }
      }
    }
  }
}

export class Subroutine {
  name: string;
  start: number;
  end: number;
  start_addr: number;
  
  constructor(start: number, end: number, start_addr: number, name: string) {
    this.name = name;
    this.start = start;
    this.end = end;
    this.start_addr = start_addr;
  }
}

export function is_lc3_number(str: string) {
  let regx = /^[xX][0-9a-f]+$/i;
  let regb = /^[0-1]+$/;
  let regd = /^#[0-9]+$/;
  return str.match(regx) || str.match(regd) || str.match(regb);
}

export function get_trap_function (instruction: Instruction) {
  if (instruction.optype != "TRAP") {
    return TRAPVEC.INVALID;
  } else {
    return instruction.imm_val;
  }
}
