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
  mem: string;
  line: number;
  src: number;
  src2: number;
  dest: number;
  imm_val: number;
  imm_val_type: string;
  n: boolean;
  z: boolean;
  p: boolean;
  is_instruction: boolean;
  incomplete: boolean;
  subroutine_num: number;
  improper_subroutine: boolean;
  // Added for CFG
  next_instruction: Instruction | null;
  br_target: Instruction | null;
  jsr_target: Instruction | null;
  // Stack pointer
  next_stack: Instruction | null;

  constructor(inst: string) {
    // Default values
    this.optype = "";
    this.mem_addr = NaN;
    this.mem = "";
    this.line = NaN;
    this.src = NaN;
    this.src2 = NaN;
    this.dest = NaN;
    this.imm_val = NaN;
    this.imm_val_type = "";
    this.n = false;
    this.z = false;
    this.p = false;
    this.incomplete = false;
    this.is_instruction = true;
    this.subroutine_num = NaN;
    this.improper_subroutine = false;
    this.next_instruction = null;
    this.br_target = null;
    this.jsr_target = null;
    this.next_stack = null;

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
          this.src = this.parseValue(instlst[2]);
          if (instlst[3][0] == 'R') {
            this.src2 = this.parseValue(instlst[3]);
          } else {
            this.imm_val = this.parseValue(instlst[3]);
            this.imm_val_type = instlst[3][0];
          }
        } else {
          this.incomplete = true;
        }
        if (isNaN(this.dest) || isNaN(this.src) ||
          (instlst[3][0] == 'R' && isNaN(this.src2)) ||
          (instlst[3][0] != 'R' && isNaN(this.imm_val))) {
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
          this.src = this.parseValue(instlst[2]);
          this.imm_val = this.parseValue(instlst[3]);
          this.imm_val_type = instlst[3][0];
        } else {
          this.incomplete = true;
        }
        if (this.dest == NaN || isNaN(this.src) || isNaN(this.imm_val)) {
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
          this.src = this.parseValue(instlst[2]);
        } else {
          this.incomplete = true;
        }
        if (this.dest == NaN || isNaN(this.src)) {
          this.incomplete = true;
        }
        break;
      case "RET":
        this.optype = "RET";
        this.src = 7;
        break;
      case "ST":
      case "STI":
        if (instlst.length >= 3) {
          this.src = this.parseValue(instlst[1]);
          this.mem = instlst[2];
        } else {
          this.incomplete = true;
        }
        if (isNaN(this.src)) {
          this.incomplete = true;
        }
        break;
      case "STR":
        if (instlst.length >= 4) {
          this.src = this.parseValue(instlst[1]);
          this.src2 = this.parseValue(instlst[2]);
          this.imm_val = this.parseValue(instlst[3]);
          this.imm_val_type = instlst[3][0];
        } else {
          this.incomplete = true;
        }
        if (isNaN(this.src) || isNaN(this.src2) || isNaN(this.imm_val)) {
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
        this.optype = "TRAP";
        this.imm_val = TRAPVEC.GETC;
        this.dest = 0;
        break;
      case "IN":
        this.optype = "TRAP";
        this.imm_val = TRAPVEC.IN;
        this.dest = 0;
        break;
      case "OUT":
        this.optype = "TRAP";
        this.imm_val = TRAPVEC.OUT;
        this.src = 0;
        break;
      case "PUTS":
        this.optype = "TRAP";
        this.imm_val = TRAPVEC.PUTS;
        this.src = 0;
        break;
      case "PUTSP":
        this.optype = "TRAP";
        this.imm_val = TRAPVEC.PUTSP;
        this.src = 0;
        break;
      case "HALT":
        this.optype = "TRAP";
        this.imm_val = TRAPVEC.HALT;
        break;
      // Directives
      case ".ORIG":
        if (instlst.length >= 2) {
          this.mem_addr = this.parseValue(instlst[1]);
        } else {
          this.incomplete = true;
        }
        this.is_instruction = false;
        break;
      case ".END":
        this.is_instruction = false;
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
        this.is_instruction = false;
        break;
      case ".BLKW":
        this.imm_val = this.parseValue(instlst[1]);
        this.imm_val_type = instlst[1][0];
        this.is_instruction = false;
        break;
      case ".STRINGZ":
        let str = inst.slice(inst.split(' ')[0].length).trim();
        str = str.slice(1, str.length - 1);
        this.mem = String(str);
        this.is_instruction = false;
        break;

      default:
        // In case they write nzp in different ways, handle BR here
        if (this.optype[0] == "B" && this.optype[1] == "R") {
          if (instlst.length >= 2) {
            this.optype = "BR";
            let cc = instlst[0].slice(2);
            this.n = cc.match('N') != null;
            this.z = cc.match('Z') != null;
            this.p = cc.match('P') != null;
            // BR
            if (!this.n && !this.z && !this.p) {
              this.n = true;
              this.z = true;
              this.p = true;
            }
            this.mem = instlst[1];
          } else {
            this.incomplete = true;
          }
        } else {
          // LABEL
          this.optype = "LABEL";
          this.mem = instlst[0];
          this.is_instruction = false;
        }
        break;
    }
  }

  // Helper function to parse values from a string
  // Possible value type: Register, decimal, hexadecimal, binary
  parseValue(val: string): number {
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
  start_addr: number;
  end_addr: number;
  instructions: Instruction[];

  constructor(text: string) {
    this.start_addr = NaN;
    this.end_addr = NaN;
    this.instructions = [];

    this.constructInstructions(text);
    this.analyzeCFG();
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
        if (instruction.optype == ".ORIG" && isNaN(this.start_addr)) {
          mem_addr = instruction.mem_addr;
          this.start_addr = mem_addr;
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

  // Build the CFG of the given code
  analyzeCFG() {
    let idx: number, i: number;
    let instruction: Instruction;
    let target: Instruction;
    let next: Instruction;

    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      // Skip data/directives
      if (instruction.mem_addr == 0 || !instruction.is_instruction) {
        continue;
      }
      // Link instructions
      for (i = idx + 1; i < this.instructions.length; i++) {
        if (this.instructions[i].optype != "LABEL" && this.instructions[i].optype != ".END") {
          instruction.next_instruction = this.instructions[i];
          break;
        }
      }
      if (instruction.optype == "JSR") {
        // JSR
        instruction.jsr_target = this.get_target(idx);
      } else if (instruction.optype == "BR") {
        // BR
        instruction.br_target = this.get_target(idx);
        if (instruction.n && instruction.z && instruction.p) {
          instruction.next_instruction = null;
        }
      } else if (instruction.optype == "RET" ||
        (instruction.optype == "TRAP" && instruction.imm_val == TRAPVEC.HALT)) {
        // RET and HALT do not have next_instruction
        instruction.next_instruction = null;
      }
    }
    // Mark subroutines
    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      if (instruction.jsr_target != null) {
        target = instruction.jsr_target;
        if (isNaN(instruction.jsr_target.subroutine_num)) {
          for (next = target; next.next_instruction != null; next = next.next_instruction) {
            next.subroutine_num = target.mem_addr;
          }
        } else {
          // Improper subroutine
          target.improper_subroutine = true;
        }
      }
    }
  }

  // Get the instruction according to label
  get_target(idx: number): Instruction | null {
    let i: number;
    for (i = 0; i < this.instructions.length; i++) {
      if (this.instructions[i].optype == "LABEL" && this.instructions[i].mem == this.instructions[idx].mem) {
        while (i < this.instructions.length && this.instructions[i].optype == "LABEL") { i++; }
        return this.instructions[i];
      }
    }
    return null;
  }
}

export function is_lc3_number(str: string): boolean {
  let regx = /^x[0-9a-f]+$/i;
  let regb = /^[0-1]+$/;
  let regd = /^#[0-9]+$/;
  return (str.match(regx) != null || str.match(regd) != null || str.match(regb) != null);
}

export function get_trap_function(instruction: Instruction): TRAPVEC {
  if (instruction.optype != "TRAP") {
    return TRAPVEC.INVALID;
  } else {
    return instruction.imm_val;
  }
}
