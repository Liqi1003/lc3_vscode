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
  HALT = 0x25,
}

export enum CC {
  none = 0x0,  // Invalid CC, usually on program start
  p = 0x1,
  z = 0x2,
  n = 0x4,
  nz = n | z,
  np = n | p,
  zp = z | p,
  nzp = n | z | p,
}

export enum INSTFLAG {
  none = 0x0,
  isIncomplete = 0x1,
  isSubroutineStart = 0x2,
  isFound = 0x4,
  isDead = 0x8,
  isAlwaysBR = 0x10,
  isNeverBR = 0x20,
  hasRedundantCC = 0x40,
  endsWithSemicolon = 0x80,
  warnedUnrolledLoop = 0x100,
}

export class Instruction {
  // Internal variables
  public rawString: string;                            // The original line content
  public optype: string = "";                          // Operation type
  public memAddr: number = NaN;                        // Memory address
  public mem: string = "";                             // Targeting memory (label name)
  public destMem: number = NaN;                    // Destination memory address
  public line: number = NaN;                           // Line number
  public src: number = NaN;                            // Source reg1
  public src2: number = NaN;                           // Source reg2
  public dest: number = NaN;                           // Destination reg
  public immVal: number = NaN;                         // Immediate value/ PC offset
  public immValType: string = "";                      // Immediate value type: R, X, #, 0/1
  public cc: CC = CC.none;                             // Only valid for BR instructions, cc[2, 1, 0] = n, z, p
  public flags: number = INSTFLAG.none;                // Flags, see INSTFLAG above
  // Subroutine
  public subroutineNum: number = NaN;                  // Subroutine ID
  public codeOverlap: number = NaN;                    // Subroutine ID of the other code that overlaps
  // Added for CFG
  public nextInstruction: Instruction | null = null;   // Pointer to next instruction
  public brTarget: Instruction | null = null;          // Pointer to BR target
  public jsrTarget: Instruction | null = null;         // Pointer to JSR target
  public inBlock: BasicBlock | null = null;            // Basic block containing the instruction
  public redundantCC: CC = CC.none;                    // Only valid for BR instructions, indicate which CC is redundant

  constructor(inst: string) {
    // Set default values
    let space: RegExp = new RegExp("[\s\n\r\t]", 'g');
    this.rawString = inst.replace(space, " ");

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
        if (instlst.length >= 4) {
          this.dest = this.parseValue(instlst[1]);
          this.src = this.parseValue(instlst[2]);
          if (instlst[3][0] == 'R') {
            this.src2 = this.parseValue(instlst[3]);
          } else {
            this.immVal = this.parseValue(instlst[3]);
            this.immValType = instlst[3][0];
          }
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.dest) || isNaN(this.src) ||
          (instlst[3][0] == 'R' && isNaN(this.src2)) ||
          (instlst[3][0] != 'R' && isNaN(this.immVal))) {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "JMP":
        if (instlst.length >= 2) {
          this.dest = this.parseValue(instlst[1]);
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.dest)) {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "JSR":
        if (instlst.length >= 2) {
          this.dest = 7;
          this.mem = instlst[1];
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "JSRR":
        if (instlst.length >= 2) {
          this.src = this.parseValue(instlst[1]);
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.dest)) {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "LD":
      case "LDI":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.mem = instlst[2];
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.dest) || isLc3Reg(this.mem)) {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "LDR":
        if (instlst.length >= 4) {
          this.dest = this.parseValue(instlst[1]);
          this.src = this.parseValue(instlst[2]);
          this.immVal = this.parseValue(instlst[3]);
          this.immValType = instlst[3][0];
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.dest) || isNaN(this.src) || isNaN(this.immVal)) {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "LEA":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.mem = instlst[2];
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.dest) || isLc3Reg(this.mem)) {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "NOT":
        if (instlst.length >= 3) {
          this.dest = this.parseValue(instlst[1]);
          this.src = this.parseValue(instlst[2]);
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.dest) || isNaN(this.src)) {
          this.flags |= INSTFLAG.isIncomplete;
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
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.src) || isLc3Reg(this.mem)) {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "STR":
        if (instlst.length >= 4) {
          this.src = this.parseValue(instlst[1]);
          this.src2 = this.parseValue(instlst[2]);
          this.immVal = this.parseValue(instlst[3]);
          this.immValType = instlst[3][0];
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (isNaN(this.src) || isNaN(this.src2) || isNaN(this.immVal)) {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case "TRAP":
        if (instlst.length >= 2) {
          this.immVal = this.parseValue(instlst[1]);
          this.immValType = instlst[1][0];
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        if (this.immVal < 0x20 || this.immVal > 0x25) {
          this.immVal = 0;
        }
        break;

      // Frequently used TRAP vectors
      case "GETC":
        this.optype = "TRAP";
        this.immVal = TRAPVEC.GETC;
        this.dest = 0;
        break;

      case "IN":
        this.optype = "TRAP";
        this.immVal = TRAPVEC.IN;
        this.dest = 0;
        break;

      case "OUT":
        this.optype = "TRAP";
        this.immVal = TRAPVEC.OUT;
        this.src = 0;
        break;

      case "PUTS":
        this.optype = "TRAP";
        this.immVal = TRAPVEC.PUTS;
        this.src = 0;
        break;

      case "PUTSP":
        this.optype = "TRAP";
        this.immVal = TRAPVEC.PUTSP;
        this.src = 0;
        break;

      case "HALT":
        this.optype = "TRAP";
        this.immVal = TRAPVEC.HALT;
        break;

      // Directives
      case ".ORIG":
        if (instlst.length >= 2) {
          this.memAddr = this.parseValue(instlst[1]);
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case ".END":
        break;

      case ".FILL":
        if (instlst.length >= 2) {
          if (isLc3Num(instlst[1])) {
            this.immVal = this.parseValue(instlst[1]);
            this.immValType = instlst[1][0];
          } else {
            this.mem = instlst[1];
          }
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case ".BLKW":
        if (instlst.length >= 2) {
          this.immVal = this.parseValue(instlst[1]);
          this.immValType = instlst[1][0];
        } else {
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      case ".STRINGZ":
        if (instlst.length >= 2) {
          this.mem = inst.slice(".STRINGZ".length).trim();
        } else {
          this.flags |= INSTFLAG.isIncomplete;
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
          this.flags |= INSTFLAG.isIncomplete;
        }
        break;

      default:
        // LABEL
        this.optype = "LABEL";
        // Handle the case like LABEL.BLKW #1
        this.mem = instlst[0].split('.')[0];
        break;
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
        if (this.nextInstruction && this.nextInstruction.isData()) {
          return true;
        } else {
          return false;
        }
    }
  }

  public setCC(): boolean {
    switch (this.optype) {
      case "ADD":
      case "AND":
      case "LD":
      case "LDI":
      case "LDR":
      case "NOT":
      case "JSR":
        return true;
      case "LEA":
      case "TRAP":
        return true;
      default:
        return false;
    }
  }

  // Calculate destination memory for constant offsets
  public calcMem() {
    if (this.mem && isLc3Num(this.mem)) {
      this.destMem = this.memAddr + 1 + this.parseValue(this.mem);
    }
  }

  // Helper function to parse values from a string
  // Possible value type: Register, decimal, hexadecimal, binary
  private parseValue(val: string): number {
    let ret: number;
    val = val.trim();
    switch (val[0]) {
      case 'R':
        // Register
        if (val.length > 2 || !val[1].match(/[0-7]/)) {
          ret = NaN;
        } else {
          ret = parseInt(val[1]);
        }
        break;
      case 'X':
        // Hexadecimal
        if (val[1] == '-') {
          ret = -parseInt(val.slice(2), 16);
        } else {
          ret = parseInt(val.slice(1), 16);
        }
        break;
      case '#':
        // Decimal
        if (val[1] == '-') {
          ret = -parseInt(val.slice(2), 10);
        } else {
          ret = parseInt(val.slice(1), 10);
        }
        break;
      default:
        // Binary
        if (val.match(/[01]+/)) {
          ret = parseInt(val, 2);
        } else if (val.match(/[0-9]+/)) {
          if (val[0] == '-') {
            ret = -parseInt(val.slice(1), 10);
          } else {
            ret = parseInt(val, 10);
          }
        } else {
          ret = NaN;
        }
        break;
    }
    if (!isNaN(ret) && (ret > 0) && (ret & 0x8000) > 0) {
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
        this.flags |= INSTFLAG.isAlwaysBR;
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
  public memAddr: number;                         // Memory address
  public name: string;                            // Name of label
  public line: number;                            // Line number
  public instruction: Instruction | null = null;  // Instruction at the same memory address
  public flags: INSTFLAG;                         // Flags inherited from Instruction

  constructor(instruction: Instruction) {
    this.memAddr = instruction.memAddr;
    this.name = instruction.mem;
    this.line = instruction.line;
    this.flags = instruction.flags;
  }
}

// Returns true if the input string is a lc3 number: x1234, 0010, #-123
export function isLc3Num(str: string): boolean {
  const regx = /^x-?[0-9a-f]+$/i;
  const regb = /^[0-1]+$/;
  const regd = /^#?-?[0-9]+$/;
  return (str.match(regx) != null || str.match(regd) != null || str.match(regb) != null);
}

// Returns true if the input string is a lc3 register: R[0-7]
export function isLc3Reg(str: string): boolean {
  const reg = /^r[0-7]$/i;
  return str.match(reg) != null;
}

// Returns the trap vector
export function getTrapFunction(instruction: Instruction): TRAPVEC {
  if (instruction.optype != "TRAP") {
    return TRAPVEC.INVALID;
  } else {
    return instruction.immVal;
  }
}
