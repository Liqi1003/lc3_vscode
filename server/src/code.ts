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
  illegal_cc: boolean;
  is_data: boolean;
  incomplete: boolean;
  // Subroutine
  subroutine_num: number;
  is_subroutine_start: boolean;
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
    this.illegal_cc = false;
    this.incomplete = false;
    this.is_data = false;
    this.subroutine_num = NaN;
    this.is_subroutine_start = false;
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
        this.is_data = true;
        break;
      case ".BLKW":
        this.imm_val = this.parseValue(instlst[1]);
        this.imm_val_type = instlst[1][0];
        this.is_data = true;
        break;
      case ".STRINGZ":
        let str = inst.slice(inst.split(' ')[0].length).trim();
        str = str.slice(1, str.length - 1);
        this.mem = String(str);
        this.is_data = true;
        break;

      default:
        // BR can be of 8 different kinds, handle here
        if (this.optype[0] == "B" && this.optype[1] == "R") {
          if (instlst.length >= 2) {
            this.optype = "BR";
            let cc = instlst[0].slice(2);
            this.parseCC(cc);
            this.mem = instlst[1];
          } else {
            this.optype = "LABEL";
            this.mem = instlst[0];
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

  parseCC(cc: string) {
    switch (cc) {
      case "":
      case "nzp":
        this.n = true;
        this.z = true;
        this.p = true;
        break;
      case "n":
        this.n = true;
        this.z = false;
        this.p = false;
        break;
      case "z":
        this.n = false;
        this.z = true;
        this.p = false;
        break;
      case "p":
        this.n = false;
        this.z = false;
        this.p = true;
        break;
      case "nz":
        this.n = true;
        this.z = true;
        this.p = false;
        break;
      case "zp":
        this.n = false;
        this.z = true;
        this.p = true;
        break;
      case "np":
        this.n = true;
        this.z = false;
        this.p = true;
        break;
      default:
        this.illegal_cc = true;
        break;
    }
  }
}

export class Label {
  mem_addr: number;
  name: string;
  line: number;
  instruction: Instruction | null;

  constructor(instruction: Instruction) {
    this.mem_addr = instruction.mem_addr;
    this.name = instruction.mem;
    this.line = instruction.line;
    this.instruction = null;
  }
}


export class Code {
  start_addr: number;
  end_addr: number;
  instructions: Instruction[];
  labels: Label[];
  line_num: number;
  mem_addr: number;

  constructor(text: string) {
    this.start_addr = NaN;
    this.end_addr = NaN;
    this.instructions = [];
    this.labels = [];
    this.line_num = 0;
    this.mem_addr = 0;

    this.buildInstructions(text);
    this.linkLabels();
    this.analyzeCFG();
  }

  buildInstructions(text: string) {
    let lines = text.split('\n');
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
        this.pushInstruction(instruction);

        // Handle instructions/directives right behind labels
        if (instruction.optype == "LABEL") {
          line = line.slice(line.split(/\s/)[0].length + 1).trim();
          if (line) {
            instruction = new Instruction(line);
            this.pushInstruction(instruction);
          }
        }
      }
      this.line_num++;
    }
    console.log(this);
  }

  // Push an instruction according to its type (push/not push/push to label)
  pushInstruction(instruction: Instruction) {
    let label: Label;
    let i: number;
    // Keep track of line numbers
    instruction.line = this.line_num;

    switch (instruction.optype) {
      case ".ORIG":
        this.mem_addr = instruction.mem_addr;
        this.start_addr = this.mem_addr++;
        break;
      case ".END":
        this.mem_addr = instruction.mem_addr;
        if (isNaN(this.end_addr)) {
          this.end_addr = this.mem_addr;
        }
        break;
      case ".FILL":
        instruction.mem_addr = this.mem_addr++;
        this.instructions.push(instruction);
        break;
      case ".BLKW":
        instruction.mem_addr = this.mem_addr++;
        this.mem_addr += instruction.imm_val - 1;
        this.instructions.push(instruction);
        break;
      case ".STRINGZ":
        instruction.mem_addr = this.mem_addr++;
        this.mem_addr += instruction.mem.length;
        for (i = 0; i < instruction.mem.length; i++) {
          if (instruction.mem[i] == '\\') {
            this.mem_addr--;
          }
        }
        this.instructions.push(instruction);
        break;
      case "LABEL":
        instruction.mem_addr = this.mem_addr;
        label = new Label(instruction);
        this.labels.push(label);
        break;
      default:
        instruction.mem_addr = this.mem_addr++;
        this.instructions.push(instruction);
        break;
    }
  }

  linkLabels() {
    let label_idx: number, instruction_idx: number;
    // Skip labels and instructions before .ORIG
    for (label_idx = 0; label_idx < this.labels.length && this.labels[label_idx].mem_addr == 0; label_idx++);
    for (instruction_idx = 0; instruction_idx < this.instructions.length && this.instructions[instruction_idx].mem_addr == 0; instruction_idx++);

    for (instruction_idx = 0; instruction_idx < this.instructions.length && label_idx < this.labels.length; instruction_idx++) {
      while (label_idx < this.labels.length && this.instructions[instruction_idx].mem_addr == this.labels[label_idx].mem_addr) {
        this.labels[label_idx].instruction = this.instructions[instruction_idx];
        label_idx++;
      }
    }
  }

  // Build the CFG of the given code
  analyzeCFG() {
    let idx: number, i: number;
    let instruction: Instruction;
    let target: Instruction;

    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      // Skip data
      if (instruction.mem_addr == 0 || instruction.is_data) {
        continue;
      }
      // Link instructions
      if (idx + 1 < this.instructions.length) {
        instruction.next_instruction = this.instructions[idx + 1];
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
          target.is_subroutine_start = true;
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
    for (i = 0; i < this.labels.length; i++) {
      if (this.labels[i].name == this.instructions[idx].mem) {
        return this.labels[i].instruction;
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
