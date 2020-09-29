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
  public optype: string;
  public mem_addr: number;
  public mem: string;
  public line: number;
  public src: number;
  public src2: number;
  public dest: number;
  public imm_val: number;
  public imm_val_type: string;
  public n: boolean;
  public z: boolean;
  public p: boolean;
  public illegal_cc: boolean;
  public is_data: boolean;
  public incomplete: boolean;
  // Subroutine
  public subroutine_num: number;
  public is_subroutine_start: boolean;
  public code_overlap: number;
  // Added for CFG
  public next_instruction: Instruction | null;
  public br_target: Instruction | null;
  public jsr_target: Instruction | null;
  public is_found: boolean;

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
    this.code_overlap = NaN;
    this.next_instruction = null;
    this.br_target = null;
    this.jsr_target = null;
    this.is_found = false;

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
          this.dest = this.parseValue(instlst[1]);
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
          let cc = instlst[0].slice(2);
          this.parseCC(cc);
          if (instlst.length >= 2) {
            this.optype = "BR";
            this.mem = instlst[1];
          } else if (this.illegal_cc) {
            this.optype = "BR";
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
          ret = ~~parseInt(val, 2);
        } else {
          ret = NaN;
        }
    }
    if ((ret & 0x8000) > 0) {
      ret = ret - 0x10000;
    }
    return ret;
  }

  parseCC(cc: string) {
    switch (cc) {
      case "":
        this.n = true;
        this.z = true;
        this.p = true;
        break;
      case "N":
        this.n = true;
        this.z = false;
        this.p = false;
        break;
      case "Z":
        this.n = false;
        this.z = true;
        this.p = false;
        break;
      case "P":
        this.n = false;
        this.z = false;
        this.p = true;
        break;
      case "NZ":
        this.n = true;
        this.z = true;
        this.p = false;
        break;
      case "ZP":
        this.n = false;
        this.z = true;
        this.p = true;
        break;
      case "NP":
        this.n = true;
        this.z = false;
        this.p = true;
        break;
      case "NZP":
        this.n = true;
        this.z = true;
        this.p = true;
        break;
      default:
        this.illegal_cc = true;
        break;
    }
  }
}

export class Label {
  public mem_addr: number;
  public name: string;
  public line: number;
  public instruction: Instruction | null;
  public isBR: boolean;

  constructor(instruction: Instruction) {
    this.mem_addr = instruction.mem_addr;
    this.name = instruction.mem;
    this.line = instruction.line;
    this.instruction = null;
    this.isBR = false;
  }
}

// Returns true if the input string is a lc3 number: x1234, 0010, #123
export function is_lc3_number(str: string): boolean {
  const regx = /^x[0-9a-f]+$/i;
  const regb = /^[0-1]+$/;
  const regd = /^#[0-9]+$/;
  return (str.match(regx) != null || str.match(regd) != null || str.match(regb) != null);
}

// Returns the trap vector
export function get_trap_function(instruction: Instruction): TRAPVEC {
  if (instruction.optype != "TRAP") {
    return TRAPVEC.INVALID;
  } else {
    return instruction.imm_val;
  }
}
