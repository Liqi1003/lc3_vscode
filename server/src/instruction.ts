import {
  BasicBlock
} from "./basicBlock";

export enum TRAPVEC {
  INVALID = 0x0,
  GETC = 0x20,
  OUT = 0x21,
  PUTS = 0x22,
  IN = 0x23,
  PUTSP = 0x24,
  HALT = 0x25
}

export enum CC {
  undefined = 0x0,  // Invalid CC, usually on program start
  p = 0x1,
  z = 0x2,
  n = 0x4,
  nz = n | z,
  np = n | p,
  zp = z | p,
  nzp = n | z | p,
}

export enum INSTFLAG {
  is_incomplete = 0x1,
  is_subroutine_start = 0x2,
  is_found = 0x4,
  is_dead = 0x8,
  has_semicolon = 0x10
}

export class Instruction {
  // Internal variables
  public raw_string: string;                            // The original line content
  public optype: string = "";                           // Operation type
  public mem_addr: number = NaN;                        // Memory address
  public mem: string = "";                              // Targeting memory (label name)
  public line: number = NaN;                            // Line number
  public src: number = NaN;                             // Source reg1
  public src2: number = NaN;                            // Source reg2
  public dest: number = NaN;                            // Destination reg
  public imm_val: number = NaN;                         // Immediate value/ PC offset
  public imm_val_type: string = "";                     // Immediate value type: R, X, #, 0/1
  public cc: number = 0;                                // Only valid for BR instructions, cc[2, 1, 0] = n, z, p
  public flags: number = 0;                             // Flags, see INSTFLAG above
  // Subroutine
  public subroutine_num: number = NaN;                  // Subroutine ID
  public code_overlap: number = NaN;                    // Subroutine ID of the other code that overlaps
  // Added for CFG
  public next_instruction: Instruction | null = null;   // Pointer to next instruction
  public br_target: Instruction | null = null;          // Pointer to BR target
  public jsr_target: Instruction | null = null;         // Pointer to JSR target
  public incoming_arcs: number = 0;                     // Number of incoming arcs
  public in_block: BasicBlock | null = null;            // Basic block containing the instruction
  public br_possibility: number = 0;                    // Possibility of branch. 0 for conditional, 1 for always, -1 for never

  constructor(inst: string) {
    // Default values
    this.raw_string = inst;

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
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (isNaN(this.dest) || isNaN(this.src) ||
          (instlst[3][0] == 'R' && isNaN(this.src2)) ||
          (instlst[3][0] != 'R' && isNaN(this.imm_val))) {
            this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "JMP":
        if (instlst.length >= 2) {
          this.dest = this.parseValue(instlst[1]);
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (isNaN(this.dest)) {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "JSR":
        if (instlst.length >= 2) {
          this.mem = instlst[1];
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "JSRR":
        if (instlst.length >= 2) {
          this.dest = this.parseValue(instlst[1]);
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (this.dest == NaN) {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "LD":
      case "LDI":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.mem = instlst[2];
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (this.dest == NaN || is_lc3_register(this.mem)) {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "LDR":
        if (instlst.length >= 4) {
          this.dest = this.parseValue(instlst[1]);
          this.src = this.parseValue(instlst[2]);
          this.imm_val = this.parseValue(instlst[3]);
          this.imm_val_type = instlst[3][0];
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (this.dest == NaN || isNaN(this.src) || isNaN(this.imm_val)) {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "LEA":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.mem = instlst[2];
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (this.dest == NaN || is_lc3_register(this.mem)) {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "NOT":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.src = this.parseValue(instlst[2]);
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (this.dest == NaN || isNaN(this.src)) {
          this.flags |= INSTFLAG.is_incomplete;
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
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (isNaN(this.src) || is_lc3_register(this.mem)) {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "STR":
        if (instlst.length >= 4) {
          this.src = this.parseValue(instlst[1]);
          this.src2 = this.parseValue(instlst[2]);
          this.imm_val = this.parseValue(instlst[3]);
          this.imm_val_type = instlst[3][0];
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (isNaN(this.src) || isNaN(this.src2) || isNaN(this.imm_val)) {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case "TRAP":
        if (instlst.length >= 2) {
          this.imm_val = this.parseValue(instlst[1]);
          this.imm_val_type = instlst[1][0];
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        if (this.imm_val < 0x20 || this.imm_val > 0x25) {
          this.imm_val = 0;
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
          this.flags |= INSTFLAG.is_incomplete;
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
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case ".BLKW":
        if (instlst.length >= 2) {
          this.imm_val = this.parseValue(instlst[1]);
          this.imm_val_type = instlst[1][0];
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      case ".STRINGZ":
        if (instlst.length >= 2) {
          this.mem = inst.slice(".STRINGZ".length).trim();
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      // Branches
      case "BR":
      case "BRN":
      case "BRZ":
      case "BRP":
      case "BRNZ":
      case "BRNP":
      case "BRZP":
      case "BRNZP":
        let cc = instlst[0].slice(2);
        this.parseCC(cc);
        if (instlst.length >= 2) {
          this.optype = "BR";
          this.mem = instlst[1];
        } else {
          this.flags |= INSTFLAG.is_incomplete;
        }
        break;

      default:
        // LABEL
        this.optype = "LABEL";
        this.mem = instlst[0];
        break;
    }

    // Remove ; in instructions, indicate there is a semicolon
    // This is to accomodate for the lc3as behavior, may not compatiable with v3
    if (this.mem) {
      for (i = 0; i < this.mem.length; i++) {
        if (this.mem[i] == ';') {
          this.mem = this.mem.slice(0, i);
          this.flags |= INSTFLAG.has_semicolon;
        }
      }
    }
  }

  // Returns whether current instruction operates on memory
  public isMemType(): boolean {
    switch (this.optype) {
      case "LD":
      case "LDI":
      case "ST":
      case "STI":
      case "LEA":
      case "JSR":
      case "BR":
        return true;
      default:
        return false;
    }
  }

  // Returns whether current instruction is data
  public isData(): boolean {
    switch (this.optype) {
      case ".FILL":
      case ".STRINGZ":
      case ".BLKW":
        return true;
      default:
        return false;
    }
  }

  // Returns whether current instruction ends a basic block
  public endBasicBlock(): boolean {
    switch (this.optype) {
      case "RET":
      case "TRAP":
      case "BR":
      case "JSR":
        return true;
      default:
        if (this.next_instruction && this.next_instruction.isData()) {
          return true;
        } else {
          return false;
        }
    }
  }

  public setCC(): boolean{
    switch(this.optype){
      case "ADD":
      case "AND":
      case "LD":
      case "LDI":
      case "LDR":
      case "NOT":
        return true;
      // LC3v3, lea not set cc
      case "LEA":
        return true;
      default:
        return false;
    }
  }

  // Helper function to parse values from a string
  // Possible value type: Register, decimal, hexadecimal, binary
  private parseValue(val: string): number {
    let ret;
    val = val.trim();
    switch (val[0]) {
      case 'R':
        // Register
        ret = parseInt(val[1]);
        if (val.length > 2 || ret > 7) {
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
    if ((ret & 0x8000) > 0) {
      ret = ret - 0x10000;
    }
    return ret;
  }

  // Assign CC according to the string input
  private parseCC(cc: string) {
    switch (cc) {
      case "":
      case "NZP":
        this.cc = CC.nzp;
        break;
      case "N":
        this.cc = CC.n;
        break;
      case "Z":
        this.cc = CC.z;
        break;
      case "P":
        this.cc = CC.p;
        break;
      case "NZ":
        this.cc = CC.nz;
        break;
      case "ZP":
        this.cc = CC.zp;
        break;
      case "NP":
        this.cc = CC.np;
        break;
      default:
        break;
    }
  }
}

export class Label {
  public mem_addr: number;                        // Memory address
  public name: string;                            // Name of label
  public line: number;                            // Line number
  public instruction: Instruction | null = null;  // Instruction at the same memory address
  public flags: number;                           // Flags inherited from Instruction

  constructor(instruction: Instruction) {
    this.mem_addr = instruction.mem_addr;
    this.name = instruction.mem;
    this.line = instruction.line;
    this.flags = instruction.flags;
  }
}

// Returns true if the input string is a lc3 number: x1234, 0010, #123
export function is_lc3_number(str: string): boolean {
  const regx = /^x[0-9a-f]+$/i;
  const regb = /^[0-1]+$/;
  const regd = /^#[0-9]+$/;
  return (str.match(regx) != null || str.match(regd) != null || str.match(regb) != null);
}

// Returns true if the input string is a lc3 register: R[0-7]
export function is_lc3_register(str: string): boolean {
  const reg = /^r[0-7]$/i;
  return str.match(reg) != null;
}

// Returns the trap vector
export function get_trap_function(instruction: Instruction): TRAPVEC {
  if (instruction.optype != "TRAP") {
    return TRAPVEC.INVALID;
  } else {
    return instruction.imm_val;
  }
}
